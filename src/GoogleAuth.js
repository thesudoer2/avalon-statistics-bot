export async function getJwtToken(serviceAccount) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: serviceAccount.token_uri,
    exp: now + 3600,
    iat: now
  };

  // Base64 encode using native functions
  const encodeToBase64 = (str) => btoa(unescape(encodeURIComponent(str)));
  const encodedHeader = encodeToBase64(JSON.stringify(header)).replace(/=+$/, '');
  const encodedClaimSet = encodeToBase64(JSON.stringify(claimSet)).replace(/=+$/, '');

  const toSign = `${encodedHeader}.${encodedClaimSet}`;
  const signature = await signRsaSha256(toSign, serviceAccount.private_key);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${encodedHeader}.${encodedClaimSet}.${encodedSignature}`;
}


async function signRsaSha256(message, privateKey) {
  // In Cloudflare Workers, we need to use the Web Crypto API
  const key = await crypto.subtle.importKey(
    'pkcs8',
    convertPemToDer(privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(message)
  );

  return new Uint8Array(signature);
}

function convertPemToDer(pem) {
  // Remove PEM headers/footers and line breaks
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');

  // Base64 decode to DER format
  return Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
}

export async function exchangeJwtForAccessToken(jwtToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken
    })
  });

  const data = await response.json();
  return data.access_token;
}