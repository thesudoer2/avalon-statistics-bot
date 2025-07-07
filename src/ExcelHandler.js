const { google } = require('googleapis');

import * as TimeZone from './Time.js';
import * as AESCrypto from "./AESCrypto.js";

// Configure authentication - you'll need to set this up
const auth = new google.auth.GoogleAuth({
  keyFile: 'sheets-api-project-465201-64087f908ace.json',
  scopes: 'https://www.googleapis.com/auth/spreadsheets',
});

// The ID of your public Google Sheet
// const spreadsheetId = 'YOUR_SPREADSHEET_ID
const spreadsheetId = 'GOOGLE_SPREED_SHEET_ID';

async function addToSheet(jsonData) {
  try {
    // Create client instance for auth
    const client = await auth.getClient();

    // Instance of Google Sheets API
    const googleSheets = google.sheets({ version: "v4", auth: client });

    // First, get the current sheet structure to find player columns
    const sheetInfo = await googleSheets.spreadsheets.get({
      spreadsheetId,
    });

    // Assuming first sheet and first row contains headers
    const sheetName = sheetInfo.data.sheets[0].properties.title;
    const headerRow = await googleSheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });

    const headers = headerRow.data.values[0];

    // Prepare the new row data
    const newRow = [];

    // Add date and time (from timestamp)
    newRow.push(TimeZone.timestampToDateTime(jsonData.game_info.timestamp));

    // Add game seed
    newRow.push(jsonData.game_info.game_seed);

    // Add player roles in their respective columns
    for (let i = 2; i < headers.length; i++) {
      const playerName = headers[i];
      newRow.push(jsonData.players[playerName] || ''); // Empty if player not in this game
    }

    // Append the new row
    await googleSheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`, // Adjust if you have more columns
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [newRow],
      },
    });

    console.log('Data added successfully!');
  } catch (err) {
    console.error('Error:', err);
  }
}

export async function handleScheduled(env, ctx, event) {
  const allMessages = await storageGetAllMessages(env);
  for (message of allMessages) {
    if (message.encryptedMessage && message.gameHash && message.timestamp) {
      try {
        // Decode & decrypt input message
        const decryptedMessage = await AESCrypto.decryptMessageNoExcept(env.ENCRYPTION_KEY, message.encryptedMessage);
        const decryptedMessageJson = JSON.parse(decryptedMessage);

        // Add to Google Sheet
        await addToSheet(decryptedMessageJson);
      } catch (error) {
        console.error(`Error processing message ${message.gameHash}:`, error);
      }
    }
  }
  ctx.waitUntil(Promise.resolve());
  return new Response("Scheduled task completed", { status: 200 });
}