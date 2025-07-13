import * as TimeZone from './Time.js';
import * as AESCrypto from "./AESCrypto.js";
import * as GoogleAuth from './GoogleAuth.js';


export async function addToSheet(jsonData) {
  try {
    const spreadsheetId = 'GOOGLE_SPREED_SHEET_ID';

    // Get JWT token
    const serviceAccount = require('./sheets-api-project-465201-64087f908ace.json');
    const jwtToken = await GoogleAuth.getJwtToken(serviceAccount);

    // Exchange JWT for access token
    const accessToken = await GoogleAuth.exchangeJwtForAccessToken(jwtToken);

    // 1. Get sheet info to find headers
    const sheetInfo = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const sheetData = await sheetInfo.json();
    const sheetName = sheetData.sheets[0].properties.title;

    // 2. Get headers
    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!1:1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const headersData = await headersRes.json();
    const headers = headersData.values[0];

    // 3. Prepare row data
    const row = [
      TimeZone.timestampToDateTime(jsonData.game_info.timestamp),
      jsonData.game_info.game_seed,
      ...headers.slice(2).map(h => jsonData.players[h] || '')
    ];

    // 4. Append row
    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:Z:append`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [row],
          majorDimension: "ROWS"
        })
      }
    );

    return resp.ok;
  } catch (err) {
    return false;
  }
}

export async function handleScheduled(env, ctx, event) {
  const allMessages = await storageGetAllMessages(env);
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