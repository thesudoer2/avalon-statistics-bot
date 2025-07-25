import * as Storage from './storage/kvStorage.js';
import * as AESCrypto from "./AESCrypto.js";
import * as TimeZone from './Time.js';
import * as ExcelHandler from "./ExcelHandler.js";

let BOT_USERNAME;

export default {
  async fetch(request, env, ctx) {
    const botCommands = [
      { command: 'start', description: 'Start the bot' },
      { command: 'stats', description: 'Show message statistics' },
      { command: 'help', description: 'Show help menu' },
      { command: 'exportnow', description: 'Force export data (admin only)' },
      { command: 'flushdb', description: 'Remove all stored information (admin only)' },
      { command: 'setkey', description: 'Set password (secret key) for decryption' },
      { command: 'getkey', description: 'Get current decryption password (decryption secret key)' },
      { command: 'getdata', description: 'Show stored information in decrypted format (admin only)' },
    ];

    async function setBotCommands(env) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: botCommands,
          // scope: { type: 'all_private_chats' }
        }),
      });
    }

    await setBotCommands(env);

    const defaultSecretKey = env.DEFAULT_SECRET_KEY;

    TimeZone.TimeSettings.GLOBAL_TIMEZONE = env.TZ || 'UTC';

    if (request.method === "POST") {
      try {
        const update = await request.json();

        const message = update.message;
        let messageText = message?.text;

        if (message && messageText) {
          const chatId = message.chat.id;
          const chatType = message.chat.type; // "private", "group", "supergroup", etc.
          const userId = message.from.id;
          const commandRegex = new RegExp(`^\/([a-zA-Z0-9_]+)(?:\\s+([a-zA-Z0-9_]+))?(?:\\s*@${BOT_USERNAME})?$`);

          const match = messageText.match(commandRegex);

          if (!BOT_USERNAME) BOT_USERNAME = await getBotUsername(env.TELEGRAM_BOT_TOKEN);

          // Store message metadata
          const messageData = {
            userId: userId,
            chatId: chatId,
            timestamp: null,
            encryptedMessage: null,
            gameHash: null,
            gameSeed: null,
            winner: null
          };

          // Check if the bot is tagged in a group
          const isTagged = (chatType !== 'private' && (
            (messageText.includes(`@${BOT_USERNAME}`) ||
              messageText.startsWith(`/`)))) || (chatType === 'private');

          if (isTagged) {
            // Remove the bot's username from the message
            messageText = messageText
              .replace(new RegExp(`@${BOT_USERNAME}\\b`, 'i'), '')
              .trim();
          } else {
            return new Response("OK");
          }

          // Handle commands
          if (match) {
            const command = match[1];

            switch (command) {
              case "start": {
                const helpText = botCommands.map(cmd =>
                  `/${cmd.command} - ${cmd.description}`
                ).join('\n');

                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    "🔒 Welcome to the decryption avalon bot!\n\n" +
                    "Send me messages in this format:\n" +
                    "1. Encrypt your message with AES-256-CBC\n" +
                    "2. Encode the result with Base64\n" +
                    "3. Send the encoded message to me comma seperated with winner of the game\n\n" +
                    "I will decode and decrypt and store it for you!\n\n" +
                    `*Commands:*\n${helpText}\n\n`,
                  parse_mode: "Markdown",
                });
                break;
              }

              case "help": {
                const helpText = botCommands.map(cmd =>
                  `/${cmd.command} - ${cmd.description}`
                ).join('\n');

                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    "🛡️ *Encrypted avalon Bot Help*\n\n" +
                    "This bot expects messages that are:\n" +
                    "1. AES-256-CBC encrypted\n" +
                    "2. Base64 encoded\n\n" +
                    `*Commands:*\n${helpText}\n\n` +
                    "*Note:* The key is not stored persistently and will reset when the worker restarts.",
                  parse_mode: "Markdown",
                })
                break;
              }

              case "stats": {
                try {
                  const allMessages = await Storage.GetAllMessages(env);

                  let messageList = [];

                  await Promise.all(allMessages.map(msg => {
                    if (msg === null) {
                      throw new Error("The database and cache seem to be syncing. Please Wait ...\nIf something is wrong, please contact administrator.");
                    }

                    try {
                      if (msg.encryptedMessage) {
                        const timestamp = TimeZone.timestampToDateTime(msg.timestamp);
                        messageList.push(`📅 ${timestamp}\n🏆 Winner: ${msg.winner}\n🔐 Encrypted Message:\n\`\`\`\n${msg.encryptedMessage}\n\`\`\``);
                      } else {
                        messageList.push("Nothing!");
                      }
                    } catch (error) {
                      throw new Error(`${error}\n\nMessage: ${msg.encryptedMessage}\n\nKey: ${msg.gameHash}`);
                    }
                  }));

                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      `*📊 Messages (${messageList.length}):\n*` +
                      `${messageList.join('\n') || "=> No messages"}\n\n` +
                      `- *Last export:* ${env?.LAST_EXPORT_TIME || "Never"}`,
                    parse_mode: "Markdown",
                  });
                } catch (error) {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      "❌ Failed to fetch stats\n\n" +
                      `${error}`,
                    parse_mode: "Markdown",
                  });
                }
                break;
              }

              case "exportnow": {
                try {
                  if (userId.toString() === env.ADMIN_USER_ID) {
                    // Set default key if none exists
                    if (!env.SECRET_KEY) {
                      env.SECRET_KEY = defaultSecretKey;
                      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                        chat_id: chatId,
                        text: "🔐 No encryption key set!\n\nUsing default key...\nUse /setkey to change",
                        parse_mode: "Markdown",
                      });
                    }

                    const allMessages = await Storage.GetAllMessages(env);
                    for (const message of allMessages) {
                      if (!message)
                        throw new Error("The database and cache seem to be syncing. Please wait...\nIf something is wrong, please contact the administrator.");

                      await ExcelHandler.addToSheet(env, message);
                    }

                    // Flush database after writing data to sheet
                    await Storage.ClearStorage(env);

                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text:
                        `✅ Exported decrypted messages!\n`,
                      parse_mode: "Markdown",
                    });
                  } else {
                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text: "⛔ Admin only!",
                      parse_mode: "Markdown",
                    });
                  }
                } catch (error) {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: `❌ Error in exporting data:\n\n${error.message || error}`,
                    parse_mode: "Markdown",
                  });
                }
                break;
              }

              case "getdata": {
                try {
                  if (userId.toString() === env.ADMIN_USER_ID) {
                    const allMessages = await Storage.GetAllMessages(env);
                    let messageList = [];

                    for (const msg of allMessages) {
                      if (!msg) {
                        throw new Error("The database and cache seem to be syncing. Please Wait...\nIf something is wrong, please contact administrator.");
                      }

                      try {
                        // Set default key if none exists
                        if (!env.SECRET_KEY) {
                          env.SECRET_KEY = defaultSecretKey;
                          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                            chat_id: chatId,
                            text: "🔐 No encryption key set!\n\nUsing default key...\nUse /setkey to change",
                            parse_mode: "Markdown",
                          });
                        }

                        // 1. Decrypt the message
                        const decryptedMessage = await AESCrypto.decryptMessageNoExcept(
                          env.SECRET_KEY,
                          msg.encryptedMessage
                        );

                        // 2. Parse the decrypted message (which should be JSON)
                        let parsedInnerMessage;
                        try {
                          parsedInnerMessage = JSON.parse(decryptedMessage);
                        } catch (parseError) {
                          throw new Error(`Decrypted message is not valid JSON: ${decryptedMessage}`);
                        }

                        // 3. Create a modified message object
                        const modifiedMessage = {
                          ...msg,
                          encryptedMessage: parsedInnerMessage
                        };

                        // 4. Beautify the entire structure with proper indentation (2 spaces)
                        const beautifiedMessage = JSON.stringify(modifiedMessage, (key, value) => { return value; }, 2);

                        // 5. Format the output line
                        const timestamp = TimeZone.timestampToDateTime(msg.timestamp);
                        messageList.push(`📅 ${timestamp}\n🏆 Winner: ${msg.winner}\n\`\`\`json\n${beautifiedMessage}\n\`\`\``);
                      } catch (error) {
                        // Fallback showing original message with error
                        const fallbackMessage = JSON.stringify({ ...msg, error: `Decryption failed: ${error.message || error}` }, null, 2);
                        messageList.push(`⚠️ DECRYPTION FAILED\n\`\`\`json\n${fallbackMessage}\n\`\`\``);
                      }
                    }

                    // Send output (split if too long)
                    if (messageList.length === 0) {
                      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                        chat_id: chatId,
                        text: "No messages found in storage",
                        parse_mode: "Markdown",
                      });
                      break;
                    }

                    // Send in chunks if too large
                    const chunkSize = 3; // Messages per chunk
                    for (let i = 0; i < messageList.length; i += chunkSize) {
                      const chunk = messageList.slice(i, i + chunkSize);
                      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                        chat_id: chatId,
                        text: `📊 *Messages (${messageList.length}):*\n${chunk.join("\n\n")}`,
                        parse_mode: "Markdown",
                      });
                    }
                  } else {
                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text: "⛔ Admin only command!",
                      parse_mode: "Markdown",
                    });
                  }
                } catch (error) {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: `❌ Error processing messages:\n\n${error.message || error}`,
                    parse_mode: "Markdown",
                  });
                }
                break;
              }

              case "flushdb": {
                try {
                  if (userId.toString() === env.ADMIN_USER_ID) {
                    const deletedKeys = await Storage.ClearStorage(env);
                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text:
                        `♻️ Storage cleared! Deleted ${deletedKeys.length} messages.\n` +
                        `Deleted Keys: ${deletedKeys.join(', ') || "Nothing!"}`,
                      parse_mode: "Markdown",
                    });
                  } else {
                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text: "⛔ Admin only!",
                      parse_mode: "Markdown",
                    });
                  }
                } catch (error) {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      "❌ Storage flush failed!\n\n" +
                      `${error}`,
                    parse_mode: "Markdown",
                  });
                }
                break;
              }

              case "setkey": {
                const newKey = messageText.substring(8).trim();
                if (newKey) {
                  env.SECRET_KEY = newKey;
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      "🔑 Encryption key set successfully!\n" +
                      `Your key is: ${newKey}`,
                    parse_mode: "Markdown",
                  });
                } else {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: "Please provide an encryption key after /setkey command",
                    parse_mode: "Markdown",
                  });
                }
                break;
              }

              case "getkey": {
                if (!env.SECRET_KEY || env.SECRET_KEY === defaultSecretKey) {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      "🔑 No encryption key has been set or using default one!\n" +
                      "Use /setkey command to set an encryption key.",
                    parse_mode: "Markdown",
                  });
                } else {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      `🔑 Your current encryption key is: ${env.SECRET_KEY}\n\n` +
                      "You can change it with /setkey command.",
                    parse_mode: "Markdown",
                  });
                }
                break;
              }

              default: {
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text: "⚠️ Unknown command. Type /help to see available commands.",
                  parse_mode: "Markdown",
                });
                break;
              }
            }
          }
          // Handle encrypted messages
          else if (messageText) {
            try {
              if (!env.SECRET_KEY) {
                env.SECRET_KEY = defaultSecretKey;
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    "🔐 No encryption key set!\n\n" +
                    "Continue with default encryption key...\n" +
                    "(if you want to set custom encryption key, use /setkey command)",
                  parse_mode: "Markdown",
                });
              }

              // Read user input
              const encryptedMessage = messageText;

              if (!encryptedMessage) {
                throw new Error("Invalid message format!");
              }

              // Decode & decrypt input message
              const decryptedMessage = await AESCrypto.decryptMessageExcept(env.SECRET_KEY, encryptedMessage);

              // Parse JSON
              let decryptedData;
              try {
                decryptedData = JSON.parse(decryptedMessage);
              } catch (e) {
                throw new Error("JSON parse failed: " + e.message);
              }

              // Add input message to message storage after validating.
              const {game_info} = decryptedData;
              messageData.encryptedMessage = encryptedMessage;
              messageData.gameHash = game_info.final_hash_of_game;
              messageData.timestamp = game_info.timestamp;
              messageData.gameSeed = game_info.game_seed;
              messageData.winner = game_info.winner;

              const keyExists = await Storage.HasKey(env, messageData.gameHash);

              if (keyExists === true) {
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    `❗ Key (${messageData.gameHash}) already exists!\n`,
                  parse_mode: "Markdown",
                });
              } else {
                Storage.StoreMessage(env, messageData);

                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    `💾 Message was stored in memory (Game Hash : ${messageData.gameHash}).\n` +
                    "It will exported to excel in scheduled time.",
                  parse_mode: "Markdown",
                });
              }
            } catch (error) {
              await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                chat_id: chatId,
                text:
                  "❌ Failed to decrypt message!\n\n" +
                  "Please ensure:\n" +
                  "1. You set the correct key with /setkey\n" +
                  "2. Message is properly encrypted and encoded\n" +
                  "3. Your message is in \"<encrypted_message> , <winner>\" format\n\n" +
                  `${error}\n\n` +
                  `Your input message : ${messageText.split(",")[0]}`,
                parse_mode: "Markdown",
              });
            }
          } else {
            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              chat_id: chatId,
              text:
                "❌ You mentioned me but you didn't entered any message!",
              parse_mode: "Markdown",
            });
          }
        }

        return new Response("OK");
      } catch (error) {
        console.error("Error:", error);
        return new Response("Error processing request", { status: 500 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },

  async scheduled(event, env, ctx) {
    // await ExcelHandler.handleScheduled(env, ctx, event);
  },
};

async function sendTelegramMessage(botToken, messageData) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messageData),
  });
  if (resp.status !== 200) {
    const text = await resp?.text();
    console.log(resp, text || undefined);
  }
}

async function getBotUsername(botToken) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    return data.result?.username || ''; // Fallback to empty string
  } catch (error) {
    sendTelegramMessage(botToken, `Failed to get bot username: ${error}`);
    return '';
  }
}


// async function exportDecryptedToSheet(env, ctx) {
//   return await handleScheduled(env, ctx);
// }
