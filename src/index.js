import {
  storageStoreMessage,
  storageGetMessage,
  storageGetAllMessages,
  storageGetAllKeys,
  storageClearStorage,
  storageGetMessageCount,
  storageHasKey
} from './storage/kvStorage.js';

import * as AESCrypto from "./AESCrypto.js";
// import * as ExcelHandler from "./ExcelHandler.js";
import * as TimeZone from './Time.js';

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

    const default_secret_key = "YOUR_SECRET_KEY";

    TimeZone.TimeSettings.GLOBAL_TIMEZONE = env.TZ || 'UTC';

    if (request.method === "POST") {
      try {
        const update = await request.json();

        const message = update.message;
        let messageText = message.text;

        if (message && messageText) {
          const chatId = message.chat.id;
          const chatType = message.chat.type; // "private", "group", "supergroup", etc.
          const userId = message.from.id;
          const commandRegex = new RegExp(`^\/([a-zA-Z0-9_]+)(@${BOT_USERNAME})?$`);
          const match = messageText.match(commandRegex);

          if (!BOT_USERNAME) BOT_USERNAME = await getBotUsername(env);

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
          const isTagged = chatType !== 'private' &&
            (messageText.includes(`@${BOT_USERNAME}`) ||
            messageText.startsWith(`/`));

          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
            chat_id: chatId,
            text:
              `>>>>>>>>>>> is tagged : ${isTagged}`,
            parse_mode: "Markdown",
          });

          if (isTagged) {
            // Remove the bot's username from the message
            messageText = messageText
              .replace(new RegExp(`@${BOT_USERNAME}\\b`, 'i'), '') // Remove "@bot_id"
              .trim();

            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              chat_id: chatId,
              text:
                `>>>>>>>>>>> cleared message : ${messageText}`,
              parse_mode: "Markdown",
            });
          } else {
            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              chat_id: chatId,
              text:
                `>>>>>>>>>>> do nothing`,
              parse_mode: "Markdown",
            });
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
                })};
                break;

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
                })};
                break;

              case "stats":
                try {
                  const allMessages = await storageGetAllMessages(env);

                  const allKeys = await storageGetAllKeys(env);
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      `>>>> all keys (${allKeys.length}) : ${allKeys}\n`,
                    parse_mode: "Markdown",
                  });

                  const messageList = await Promise.all(allMessages.map(msg => {
                    if (msg === null) {
                      throw new Error("The database and cache seem to be syncing. Please Wait ...\nIf something is wrong, please contact administrator.");
                    }

                    try {
                      if (msg.encryptedMessage) {
                        let finalString = `=>${msg.encryptedMessage}`;

                        if (msg.timestamp) {
                          finalString += ` (${TimeZone.timestampToDateTime(msg.timestamp)})`;
                        }

                        return finalString;
                      } else {
                        return "Nothing!";
                      }
                    } catch (error) {
                      throw new Error(`${error}\n\nMessage: ${msg.encryptedMessage}\n\nKey: ${msg.gameHash}`);
                    }
                  }));

                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      `📊 *Storage Stats:*\n\n` +
                      `- *Encrypted messages:* ${allMessages.length}\n` +
                      // `- *Messages:*\n${messageList || "=> No messages"}\n\n` +
                      `- *Messages:*\n${messageList.join('\n') || "=> No messages"}\n\n` +
                      `- *Last export:* ${env.LAST_EXPORT_TIME || "Never"}`,
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

              case "exportnow":
                if (userId.toString() === env.ADMIN_USER_ID) {
                  await exportDecryptedToSheet(env, ctx);
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: `✅ Exported ${count} decrypted messages!`,
                    parse_mode: "Markdown",
                  });
                } else {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: "⛔ Admin only!",
                    parse_mode: "Markdown",
                  });
                }
                break;

              case "getdata":
                try {
                  if (userId.toString() === env.ADMIN_USER_ID) {
                    const allMessages = await storageGetAllMessages(env);
                    let messageList = [];
                    for (const msg of allMessages) {
                      try {
                        if (!env.ENCRYPTION_KEY) {
                          env.ENCRYPTION_KEY = default_secret_key;
                          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                            chat_id: chatId,
                            text:
                              "🔐 No encryption key set!\n\n" +
                              "Continue with default encryption key...\n" +
                              "(if you want to set custom encryption key, use /setkey command)",
                            parse_mode: "Markdown",
                          });
                        }

                        // Decode & decrypt input message
                        const decryptedMessage = await AESCrypto.decryptMessageExcept(env.ENCRYPTION_KEY, msg.encryptedMessage);

                        const timestamp = `${TimeZone.timestampToDateTime(msg.timestamp)}`;
                        messageList.push(`=>${decryptedMessage} (${timestamp}) -- winner : ${msg.winner}`);
                      } catch (error) {
                        throw new Error(`${error}\n\nMessage: ${msg.encryptedMessage}\n\nKey: ${msg.gameHash}`);
                      }
                    }

                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text: `✉️ Messages:\n${messageList.join("\n")}`,
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
                      "❌ Failed to process messages!\n\n" +
                      error,
                    parse_mode: "Markdown",
                  });
                }
                break;

              case "flushdb":
                try {
                  if (userId.toString() === env.ADMIN_USER_ID) {
                    const deletedKeys = await storageClearStorage(env);
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

              case "setkey":
                const newKey = messageText.substring(8).trim();
                if (newKey) {
                  env.ENCRYPTION_KEY = newKey;
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

              case "getkey":
                if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY === default_secret_key) {
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
                      `🔑 Your current encryption key is: ${env.ENCRYPTION_KEY}\n\n` +
                      "You can change it with /setkey command.",
                    parse_mode: "Markdown",
                  });
                }
                break;

              default:
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text: "⚠️ Unknown command. Type /help to see available commands.",
                  parse_mode: "Markdown",
                });
            }
          }
          // Handle encrypted messages
          else if (messageText) {
            try {
              if (!env.ENCRYPTION_KEY) {
                env.ENCRYPTION_KEY = default_secret_key;
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
              const encryptedMessage = messageText.split(",")[0].trim();
              const who_won = messageText.split(",")[1].trim();

              if (!encryptedMessage || !who_won)
              {
                throw new Error("Invalid message format!");
              }

              // Decode & decrypt input message
              const decryptedMessage = await AESCrypto.decryptMessageExcept(env.ENCRYPTION_KEY, encryptedMessage);

              await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                chat_id: chatId,
                text:
                  `>>>> before parsing json : ${decryptedMessage}\n`,
                parse_mode: "Markdown",
              });

              // Parse JSON
              let decryptedMessageJson;
              try {
                decryptedMessageJson = JSON.parse(decryptedMessage);
              } catch (e) {
                throw new Error("JSON parse failed: " + e.message);
              }

              await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                chat_id: chatId,
                text:
                  `>>>> after parsing json : ${decryptedMessageJson}\n`,
                parse_mode: "Markdown",
              });

              // Add input message to message storage after validating.
              messageData.encryptedMessage = encryptedMessage;
              messageData.gameHash = decryptedMessageJson.game_info.final_hash_of_game;
              messageData.timestamp = decryptedMessageJson.game_info.timestamp;
              messageData.gameSeed = decryptedMessageJson.game_info.game_seed;
              messageData.winner = who_won;

              await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                chat_id: chatId,
                text:
                  `>>>> typeof gameHash : ${typeof messageData.gameHash}`,
                parse_mode: "Markdown",
              });

              const keyExists = await storageHasKey(env, messageData.gameHash);

              await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                chat_id: chatId,
                text:
                  `>>>> has key result : ${keyExists}\n`,
                parse_mode: "Markdown",
              });

              if (keyExists === true) {
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    `❗ Key (${messageData.gameHash}) already exists!\n`,
                  parse_mode: "Markdown",
                });
              } else {
                storageStoreMessage(env, messageData);

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
  return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messageData),
  });
}

async function getBotUsername(env) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await response.json();
    return data.result?.username || ''; // Fallback to empty string
  } catch (error) {
    sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, `Failed to get bot username: ${error}`);
    return '';
  }
}