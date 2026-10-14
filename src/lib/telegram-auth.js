// Telegram Mini App sign-in: the app sends Telegram.WebApp.initData, we check its signature
// with the bot token (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   secret = HMAC_SHA256(key "WebAppData", bot token); hash = hex(HMAC_SHA256(key secret, data-check-string))
// where data-check-string = every field except hash, "key=value", sorted, joined by "\n".

const enc = new TextEncoder();

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signInitData(fields, botToken) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  return hex(await hmac(await hmac('WebAppData', botToken), check));
}

// The Telegram user ({id, first_name, username}) or null when the data is missing, forged or old.
export async function verifyInitData(initData, botToken, { maxAgeSec = 7 * 86400, now = Date.now() } = {}) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const fields = {};
  for (const [k, v] of params) if (k !== 'hash') fields[k] = v;
  if (!sameText(await signInitData(fields, botToken), hash)) return null;
  const authDate = Number(fields.auth_date);
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(fields.user ?? 'null');
    return user?.id ? { id: Number(user.id), first_name: user.first_name ?? '', username: user.username ?? null } : null;
  } catch {
    return null;
  }
}
