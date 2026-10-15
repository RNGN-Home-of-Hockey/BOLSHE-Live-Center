// Signing in on the website (outside Telegram) through our bot, so points, votes and brackets are
// the same Telegram account in both places:
//   1. the site asks POST /api/web-login → a secret code (goes into the bot link) and 4 check digits;
//   2. the fan opens the bot with /start login_<code>, sees the same 4 digits and presses «Войти»;
//   3. the site polls GET /api/web-login?code=… and gets a session token once.
// The browser then sends `Authorization: Bearer <token>`; POST /api/web-logout ends that session.
// Only hashes of the code and of the token are stored.

const LOGIN_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 180 * 86400e3;
const SEEN_EVERY_MS = 3600e3;

const iso = (ms) => new Date(ms).toISOString();
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const randomToken = (n) => base64url(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const CODE_RE = /^[A-Za-z0-9_-]{20,64}$/;

export async function startWebLogin(env) {
  const now = Date.now();
  const code = randomToken(18);
  const check = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM web_logins WHERE expires_at < ?').bind(iso(now - 86400e3)),
    env.DB.prepare('INSERT INTO web_logins (code_hash, check_code, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(code), check, iso(now), iso(now + LOGIN_TTL_MS)),
  ]);
  const bot = env.BOT_USERNAME || 'bolshe_live_center_bot';
  return {
    ok: true, code, check, expires_at: iso(now + LOGIN_TTL_MS),
    bot_link: `https://t.me/${bot}?start=login_${code}`,
    app_link: `tg://resolve?domain=${bot}&start=login_${code}`,
  };
}

// The site asks every few seconds; the token is handed out once (the login row goes away with it).
export async function pollWebLogin(env, code) {
  if (!CODE_RE.test(String(code ?? ''))) return { ok: false, status: 400, error: 'bad code' };
  const hash = await sha256(code);
  const done = await env.DB.prepare('DELETE FROM web_logins WHERE code_hash = ? AND user_id IS NOT NULL RETURNING user_id, first_name, username')
    .bind(hash).first();
  if (done) {
    const now = Date.now();
    const token = randomToken(32);
    await env.DB.prepare(`INSERT INTO web_sessions (token_hash, user_id, first_name, username, created_at, last_seen, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(await sha256(token), done.user_id, done.first_name, done.username, iso(now), iso(now), iso(now + SESSION_TTL_MS)).run();
    return { ok: true, state: 'ok', token, user: { id: done.user_id, first_name: done.first_name, username: done.username } };
  }
  const row = await env.DB.prepare('SELECT expires_at, declined_at FROM web_logins WHERE code_hash = ?').bind(hash).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return { ok: true, state: 'expired' };
  return { ok: true, state: row.declined_at ? 'declined' : 'waiting' };
}

const bearer = (request) => request.headers.get('authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,80})$/)?.[1] ?? null;

// The signed-in fan of a website request, or null.
export async function webSessionUser(env, request) {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT user_id, first_name, username, last_seen, expires_at FROM web_sessions WHERE token_hash = ?').bind(hash).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  if (Date.now() - Date.parse(row.last_seen) > SEEN_EVERY_MS) {
    await env.DB.prepare('UPDATE web_sessions SET last_seen = ? WHERE token_hash = ?').bind(iso(Date.now()), hash).run();
  }
  return { id: Number(row.user_id), first_name: row.first_name, username: row.username, via: 'web' };
}

export async function endWebSession(env, request) {
  const token = bearer(request);
  if (token) await env.DB.prepare('DELETE FROM web_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return { ok: true };
}

// ---- the bot side (worker/src/telegram.js sends the messages) ----

// /start login_<code>: the login waiting for this code, or why it cannot be used.
export async function loginForBot(env, code) {
  if (!CODE_RE.test(String(code ?? ''))) return { error: 'Ссылка для входа неполная — нажми «Войти через Telegram» на сайте ещё раз.' };
  const row = await env.DB.prepare('SELECT id, check_code, expires_at, user_id, declined_at FROM web_logins WHERE code_hash = ?').bind(await sha256(code)).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return { error: 'Ссылка для входа устарела — нажми «Войти через Telegram» на сайте ещё раз.' };
  if (row.user_id || row.declined_at) return { error: 'Эта ссылка уже использована.' };
  return { id: row.id, check: row.check_code };
}

// «Войти» / «Это не я» under the bot message.
export async function answerLogin(env, id, from, yes) {
  const now = iso(Date.now());
  const res = yes
    ? await env.DB.prepare(`UPDATE web_logins SET user_id = ?, first_name = ?, username = ?, confirmed_at = ?
        WHERE id = ? AND user_id IS NULL AND declined_at IS NULL AND expires_at > ?`)
      .bind(from.id, from.first_name ?? null, from.username ?? null, now, id, now).run()
    : await env.DB.prepare('UPDATE web_logins SET declined_at = ? WHERE id = ? AND user_id IS NULL AND declined_at IS NULL').bind(now, id).run();
  return (res.meta?.changes ?? 0) > 0;
}
