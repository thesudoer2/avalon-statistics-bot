# Avalon Statistics Bot

Avalon Statistics Bot is a Telegram bot designed to securely receive, store, decrypt, and export game statistics for Avalon games. The bot uses encryption for data and supports exporting to Excel for later analysis. Generally, the bot uses the information exported from [Avalon-Distributer](https://github.com/hkalbasi/avalon-distributer) game (the following section provides a detailed description about information format).

---

## Encrypted Data Format

To use the bot, your should encrypt your data with AES encryption algorithm (with arbitrary secret key) and then encode it with Base64.
Data encryption/decryption flow:

1) How to encrypt data to use in the bot:
```
Game Data --create--> JSON Object --convert--> JSON String --encrypt--> Crypto AES Encryption --encode--> Base64 Encode
```

1) How bot decrypt your data to use it:
```
Encoded/Encrypted Data --decode--> Base64 Decode --decrypt--> Crypto AES Decryption --output--> JSON String --make-it-usable--> JSON Obj
```

---

# Data Structure

After decoding and decrypting the user's input message, the bot expects the main message (in JSON format) to have the following structure:

```
{
   "players": {
      "player1": "role1",
      "player2": "role2",
      "player3": "role3",
      ...
   },
   "game_info": {
      "timestamp": <game_timestamp>,
      "final_hash_of_game": "<game_hash>",
      "game_seed": "<game_seed>"
   }
}
```

(See [Avalon-Distributer](https://github.com/hkalbasi/avalon-distributer) game)

## Features

- **Secure Message Storage**: Stores encrypted game statistics using a KV (Key-Value) storage backend.
- **Encryption Support**: Messages are encrypted and decrypted using a user-defined secret key.
- **Admin Commands**: Admin users can export data, flush the database, and manage encryption keys.
- **Excel Export**: Supports exporting decrypted statistics to Excel sheets for reporting and analysis.
- **Telegram Integration**: Responds to messages and commands sent via Telegram, with a command menu for ease of use.
- **Chunked Data Responses**: Handles large datasets by sending messages in manageable chunks.

---

## Bot Commands

- `/start` â€“ Start the bot and view help information.
- `/stats` â€“ Show message statistics (encrypted).
- `/help` â€“ Display help menu.
- `/exportnow` â€“ Force export data to Excel (admin only).
- `/flushdb` â€“ Remove all stored information (admin only).
- `/setkey <key>` â€“ Set password (secret key) for decryption.
- `/getkey` â€“ Get current decryption password.
- `/getdata` â€“ Show stored information in decrypted format (admin only).

*Note: Admin-only commands require the admin user ID to match.*

---

## Technologies Used

- **JavaScript** (Node.js-style modules, ES6)
- **Telegram Bot API**
- **KV Storage** (Cloudflare Worker KV)
- **AES Encryption** (custom crypto module)
- **Google sheet APIs to store data**
- **Cloudflare Workers** (serverlessnt

1. **Clone the repository**  
   ```bash
   git clone https://github.com/thesudoer2/avalon-statistics-bot.git
   cd avalon-statistics-bot
   ```

2. **Configure Environment Variables**  
   You need to set the following environment variables for your deployment:
   - `TELEGRAM_BOT_TOKEN` Token for your Telegram bot.
   - `ADMIN_USER_ID` User ID of the bot admin.
   - `DEFAULT_SECRET_KEY` Default encryption key (optional, but recommended).
   - `KV_BINDING` KV namespace binding for Cloudflare Workers.
   - `TZ` (Optional) Set timezone.

3. **Deploy to Cloudflare Workers**  
   Use the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) to deploy, or adapt for another serverless platform.

---

## Usage

- **Start the bot** by messaging it on Telegram.
- **Send encrypted game statistics**. The bot will store, decrypt, and process these messages.
- **Admins** can export data to Excel (Google Sheets) or flush the database via commands.
- **Set a custom encryption key** using `/setkey <key>`. Retrieve it with `/getkey`.
- **View stored statistics** using `/stats` or `/getdata` (admin only).

---

## Data Format

Messages should be sent in the following format:

1) In private chat:
```
<encrypted_message>
```
2) In group chats:
```
# Send message to bot by mentioning it
<encrypted_message> @bot_id
```
Where `<encrypted_message>` is an AES-encrypted JSON with game details (decribed [here](https://github.com/thesudoer2/avalon-statistics-bot/edit/master/README.md#encrypted-data-format)).

---

## Contributing

Pull requests and feature suggestions are welcome! Please open an issue or PR for discussion.
