// KV Storage Operations

export async function storageStoreMessage(env, messageData) {
  await env.KV_BINDING.put(messageData.gameHash, JSON.stringify(messageData));
  return messageData.gameHash;
}

export async function storageGetMessage(env, gameHashkey) {
  const messageData = await env.KV_BINDING.get(gameHashkey);
  return JSON.parse(messageData);
}

export async function storageGetAllMessages(env) {
  let messages = [];
  const keys = await env.KV_BINDING.list();

  for (const key of keys.keys) {
    const value = await storageGetMessage(env, key.name);
    messages.push(value);
  }

  return messages;
}

export async function storageGetAllKeys(env) {
  const keysList = await env.KV_BINDING.list();
  return keysList.keys.map(key => key.name);
}

export async function storageHasKey(env, gameHashKey) {
  try {
    return (await env.KV_BINDING.get(gameHashKey)) !== null;
  } catch (error) {
    console.error("Key check failed:", error);
    return false;
  }
}

export async function storageClearStorage(env) {
  try {
    const allKeys = await storageGetAllKeys(env);
    await allKeys.map(key => env.KV_BINDING.delete(key));
    return allKeys;
  } catch (error) {
    throw error;
  }
}

export async function storageGetMessageCount(env) {
  const list = await env.KV_BINDING.list();
  return list.keys.length;
}