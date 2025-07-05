import CryptoJS from "crypto-js";

import {
  storageStoreMessage,
  storageGetMessage,
  storageGetAllMessages,
  storageGetAllKeys,
  storageClearStorage,
  storageGetMessageCount,
  storageHasKey
} from './storage/kvStorage.js';


export default {
  async fetch(request, env) {
    const commands_help =
      "*Commands:*\n" +
      "  /start - Show this message\n" +
      "  /help - Show help\n" +
      "  /stats - Storage stats\n" +
      "  /sheet - View sheet\n" +
      "  /exportnow - Export stored data to persistent storage\n" +
      "  /setkey [key] - Set encryption key (not persistent)";

    const default_encryption_key = "YOUR_SECRET_KEY";

    if (request.method === "POST") {
      try {
        const update = await request.json();

        if (update.message) {
          const chatId = update.message.chat.id;
          const userId = update.message.from.id;
          const messageText = update.message.text;
          const timestamp = new Date().toISOString();

          // Store message metadata
          const messageData = {
            userId: userId,
            chatId: chatId,
            timestamp: timestamp,
            encryptedMessage: null,
            gameHash: null,
            winner: null
          };

          // Handle commands
          if (messageText.startsWith("/")) {
            const command = messageText.split(" ")[0];

            switch (command) {
              case "/start":
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    "🔒 Welcome to the encrypted avalon bot!\n\n" +
                    "Send me messages in this format:\n" +
                    "1. Encrypt your message with AES-256-CBC\n" +
                    "2. Encode the result with Base64\n" +
                    "3. Send the encoded message to me\n\n" +
                    "I will decode and decrypt and store it for you!\n\n" +
                    commands_help,
                  parse_mode: "Markdown",
                });
                break;

              case "/help":
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text:
                    "🛡️ *Encrypted avalon Bot Help*\n\n" +
                    "This bot expects messages that are:\n" +
                    "1. AES-256-CBC encrypted\n" +
                    "2. Base64 encoded\n\n" +
                    commands_help +
                    "\n" +
                    "*Note:* The key is not stored persistently and will reset when the worker restarts.",
                  parse_mode: "Markdown",
                });
                break;

              case "/stats":
                try {
                  const allMessages = await storageGetAllMessages(env);
                  // const messageList = allMessages.map(msg =>
                  //   `- ${msg.encryptedMessage} (${new Date(msg.timestamp).toLocaleTimeString()})`
                  // ).join('\n');

                  // const messageList = allMessages.map(msg => {
                  //   try {
                  //     const decryptedMessage = decryptMessageNoExcept(env, msg.encryptedMessage).then(res => res);
                  //     return `- ${msg.encryptedMessage} (${new Date(msg.timestamp).toLocaleTimeString()}) -- ${decryptedMessage}`;
                  //   } catch (error) {
                  //     throw new Error(`${error}\n\nMessage: ${msg.encryptedMessage}\n\nKey: ${msg.gameHash}`);
                  //   }
                  // }).join('\n');

                  const allKeys = await storageGetAllKeys(env);
                  const keysCount = allKeys.length;

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
                          finalString += ` (${new Date(msg.timestamp).toLocaleTimeString()})`;
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

              // case "/stats":
              //   try {
              //       const allKeys = await storageGetAllKeys(env);

              //       if (allKeys.length != 0) {
              //         await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              //           chat_id: chatId,
              //           text:
              //             `>>>> all keys (${allKeys.length}) : ${allKeys}\n`,
              //           parse_mode: "Markdown",
              //         });

              //         const messages = await Promise.all(
              //           allKeys.map(async key => {
              //             const msgData = await storageGetMessage(env, key);
              //             const decryptedMsg = await decryptMessageNoExcept(env, msgData.encryptedMessage);
              //             return `- ${msgData.encryptedMessage} (${new Date(msgData.timestamp).toLocaleTimeString()}) -- ${decryptedMsg}`;
              //           })
              //         );

              //         await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              //             chat_id: chatId,
              //             text:
              //                 `📊 *Storage Stats:*\n\n` +
              //                 `- *Total Messages:* ${allKeys.length}\n` +
              //                 `- *Messages:*\n${messages.join('\n') || "=> No messages"}\n\n` +
              //                 `- *Last export:* ${env.LAST_EXPORT_TIME || "Never"}`,
              //             parse_mode: "Markdown",
              //         });
              //       } else {
              //         await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              //           chat_id: chatId,
              //           text:
              //               `📊 *Storage Stats:*\n\n` +
              //               `- *Total Messages:* 0\n` +
              //               "- *Messages:*\n" +
              //               "=> No messages\n\n" +
              //               `- *Last export:* ${env.LAST_EXPORT_TIME || "Never"}`,
              //           parse_mode: "Markdown",
              //         });
              //       }
              //   } catch (error) {
              //       await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
              //           chat_id: chatId,
              //           text:
              //             "❌ Failed to fetch stats\n\n" +
              //             `${error}\n\n` +
              //             `Message: ${msgData.encryptedMessage}`,
              //           parse_mode: "Markdown",
              //       });
              //   }
              //   break;

              case "/exportnow":
                if (userId.toString() === env.ADMIN_USER_ID) {
                  const count = 0; // await exportDecryptedToSheet(env);
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: `✅ Exported ${count} decrypted messages!`,
                    parse_mode: "Markdown",
                  });
                } else {
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text: "⛔ Admin only command!",
                    parse_mode: "Markdown",
                  });
                }
                break;

              case "/getdata":
                try {
                  if (userId.toString() === env.ADMIN_USER_ID) {
                    const allMessages = await storageGetAllMessages(env);
                    let messageList = [];
                    for (const msg of allMessages) {
                      try {
                        if (msg) {
                          // const decrypted_message = await decryptMessageNoExcept(env, msg.encryptedMessage);
                          // const decryptedMessage = await decryptMessageExcept(env, msg.encryptedMessage);

                          // 1. Base64 decode
                          const encryptedBuffer = await decodeBase64(msg.encryptedMessage);

                          // 2. Decrypt with AES
                          const decryptedMessage = await decryptAES(encryptedBuffer, default_encryption_key);

                          const time_stamp = new Date(msg.timestamp).toLocaleTimeString();
                          messageList.push(`=>${decryptedMessage} (${time_stamp}) -- winner : ${msg.winner}`);
                        }
                      } catch (error) {
                        throw new Error(`${error}\n\nMessage: ${msg.encryptedMessage}\n\nKey: ${msg.gameHash}`);
                      }
                    }

                    // const messageList = await Promise.all(allMessages.map(msg => {
                    //   const decrypted_message = decryptMessageNoExcept(env, msg.encryptedMessage).then(res => res);
                    //   const time_stamp = new Date(msg.timestamp).toLocaleTimeString();

                    //   return `=>${decrypted_message} (${time_stamp})`;
                    // }));

                    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                      chat_id: chatId,
                      text: `✉️ Messages:\n${messageList.join("\n")}`,
                      parse_mode: "Markdown",
                    });
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
                    text:
                      "❌ Failed to process messages!\n\n" +
                      error,
                    parse_mode: "Markdown",
                  });
                }
                break;

              case "/flushdb":
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
                      text: "⛔ Admin only command!",
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

              case "/setkey":
                const newKey = messageText.substring(8).trim();
                if (newKey) {
                  env.ENCRYPTION_KEY = newKey;
                  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                    chat_id: chatId,
                    text:
                      "🔑 Encryption key set successfully!\n" +
                      `Your key is: ${newKey}\n\n` +
                      "Now send me your encrypted messages.",
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
                env.ENCRYPTION_KEY = default_encryption_key;
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
                await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                  chat_id: chatId,
                  text: "",
                  parse_mode: "Markdown",
                });

                throw new Error("Invalid message format!");
              }

              // Decode & decrypt input message
              const decryptedMessage = await decryptMessageExcept(env, encryptedMessage);

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
              messageData.winner = who_won;

              await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
                chat_id: chatId,
                text:
                  `>>>> typeof gameHash : ${typeof messageData.gameHash}\n`,
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

async function decodeBase64(base64Message) {
  // try {
  //   const decoded = atob(base64);
  //   if (!decoded) {
  //     throw new Error("Base64 decode failed: input is not valid base64 or is empty.");
  //   }
  //   return decoded;
  // } catch (e) {
  //   throw new Error("Base64 decode failed: " + e.message);
  // }

  return atob(base64Message);
}

async function decryptAES(encryptedData, password) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) {
      throw new Error("AES decryption failed: result is empty or invalid.");
    }
    return originalText;
  } catch (e) {
    throw new Error("AES decryption failed: " + e.message);
  }

  // const bytes = CryptoJS.AES.decrypt(ciphertext, password);
  // const originalText = bytes.toString(CryptoJS.enc.Utf8);
  // return originalText;
}

async function decryptMessageExcept(env, encryptedData) {
  // 1. Base64 decode
  const encryptedBuffer = await decodeBase64(encryptedData);

  // 2. Decrypt with AES
  const decrypted = await decryptAES(encryptedBuffer, env.ENCRYPTION_KEY);

  return decrypted;
}

async function decryptMessageNoExcept(env, encryptedData) {
  try {
    return decryptMessageExcept(env, encryptedData);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[DECRYPTION FAILED]";
  }
}