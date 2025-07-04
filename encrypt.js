async function encryptMessage(message, password) {
  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(16));

  // Convert password to key
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("some-random-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt"],
  );

  // Encrypt the message
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv: iv,
    },
    key,
    new TextEncoder().encode(message),
  );

  // Combine IV and ciphertext
  const encrypted = new Uint8Array(iv.length + ciphertext.byteLength);
  encrypted.set(iv, 0);
  encrypted.set(new Uint8Array(ciphertext), iv.length);

  // Convert to Base64
  return btoa(String.fromCharCode(...encrypted));
}

// Example usage:
encryptMessage("Hello secret world!", "4tIsW53I0bmTWhGlvWtupPu8G2fx8Y2l").then(
  console.log,
);
