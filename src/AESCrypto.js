import CryptoJS from "crypto-js";

function decodeBase64(base64Message) {
  return atob(base64Message);
}

function decryptAES(encryptedData, password) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) {
      throw new Error("AES decryption failed: result is empty or invalid.");
    }
    return originalText;
  } catch (e) {
    throw `AES decryption failed: ${e.message || e}`;
  }
}

export async function decryptMessageExcept(password, encryptedData) {
  // 1. Base64 decode
  const encryptedBuffer = decodeBase64(encryptedData);

  // 2. Decrypt with AES
  const decrypted = decryptAES(encryptedBuffer, password);

  return decrypted;
}

export async function decryptMessageNoExcept(password, encryptedData) {
  try {
    return decryptMessageExcept(password, encryptedData);
  } catch (error) {
    return "[DECRYPTION FAILED]";
  }
}