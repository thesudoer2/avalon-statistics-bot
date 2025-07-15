import * as TimeZone from './Time.js';
import * as AESCrypto from "./AESCrypto.js";
import * as GoogleAuth from './GoogleAuth.js';
import serviceAccount from './sheets-api-project-465201-64087f908ace.json';

const spreadsheetId = 'GOOGLE_SPREED_SHEET_ID';
const default_secret_key = "YOUR_SECRET_KEY";

export async function addToSheet(message) {
  const { encryptedMessage, gameHash, timestamp } = message;
  if (!encryptedMessage || !gameHash || !timestamp) return false;

  try {
    // Step 1: Decrypt message
    const decryptedText = await AESCrypto.decryptMessageNoExcept(default_secret_key, encryptedMessage);
    const decryptedData = JSON.parse(decryptedText);

    // Step 2: Authenticate with Google Sheets API
    const jwtToken = await GoogleAuth.getJwtToken(serviceAccount);
    const accessToken = await GoogleAuth.exchangeJwtForAccessToken(jwtToken);

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // Step 3: Fetch sheet metadata
    const sheetInfoRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers }
    );

    if (!sheetInfoRes.ok)
      throw new Error(`Failed to fetch sheet info. Status: ${sheetInfoRes.status}`);

    const sheetData = await sheetInfoRes.json();
    const sheetName = sheetData.sheets[0].properties.title;

    // Step 4: Fetch sheet headers
    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!1:1`,
      { headers }
    );

    if (!headersRes.ok)
      throw new Error(`Failed to fetch sheet headers. Status: ${headersRes.status}`);

    const headerValues = (await headersRes.json()).values[0];

    // Step 5: Prepare data row
    const { game_info, players } = decryptedData;
    const row = [
      TimeZone.timestampToDateTime(game_info.timestamp),
      game_info.game_seed,
      message.winner,
      players.length,
      ...headerValues.slice(2).map(h => players[h] || '')
    ];

    // Step 6: Append data row to sheet
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:Z:append?valueInputOption=USER_ENTERED`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        values: [row],
        majorDimension: 'ROWS'
      })
    });

    if (!appendRes.ok)
      throw new Error(`Failed to append row. Status: ${appendRes.status}`);

    return true
  } catch (error) {
    throw new Error(`Error processing message ${gameHash}:\n\n${error.message || error}`);
  }
}

export async function handleScheduled(env, ctx, event) {
  const allMessages = await Storage.GetAllMessages(env);
  for (const message of allMessages) {
    if (message.encryptedMessage && message.gameHash && message.timestamp) {
      try {
        // Decode & decrypt input message
        const decryptedMessage = await AESCrypto.decryptMessageNoExcept(env.ENCRYPTION_KEY, message.encryptedMessage);
        const decryptedMessageJson = JSON.parse(decryptedMessage);

        // Add to Google Sheet
        const successed = await addToSheet(decryptedMessageJson);
      } catch (error) {
        console.error(`Error processing message ${message.gameHash}:`, error);
      }
    }
  }
  ctx.waitUntil(Promise.resolve());
  return new Response("Scheduled task completed", { status: 200 });
}