// Telegram bot: player cards for everyone, permanent name fixes for admins
// (/name, /fix with ✅ / ✏️ / ⏭ buttons), channel boosts log, self-registered webhook.

import { getPlayer, nameStats, nextUnverified, searchPlayers, setPlayerName } from './players.js';

const SOURCE_LABEL = {
  override: 'ручная правка (файл)',
  bot: 'исправлено в боте',
  sportsru: 'sports.ru',
  fantasy: 'фэнтези RG-2026',
  wikidata: 'Википедия',
  flashscore: 'Flashscore',
  translit: 'автоматически (транскрипция)',
};

export async function webhookSecret(token) {
  const data = new TextEncoder().encode(`bolshe-live-center:${token}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) console.warn(`telegram ${method} failed: ${data.description}`);
  return data;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function adminIds(env) {
  return new Set(String(env.ADMIN_IDS ?? '').split(/[\s,;]+/).filter(Boolean).map(Number));
}

const isAdmin = (env, userId) => adminIds(env).has(Number(userId));

function send(env, chatId, text, extra = {}) {
  return tg(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

function playerCard(p) {
  const rank = [
    p.singles_rank ? `${p.tour} №${p.singles_rank}` : p.tour,
    p.doubles_rank ? `пары №${p.doubles_rank}` : null,
  ].filter(Boolean).join(' · ');
  const birth = p.birth_date ? p.birth_date.split('-').reverse().join('.') : null;
  const lines = [
    `<b>${esc(p.name_ru)}</b> · ${esc(rank)}${p.is_russian ? ' · 🇷🇺 наш' : ''}`,
    [p.name_latin, p.country_code, birth].filter(Boolean).map(esc).join(' · '),
    `Имя: ${esc(SOURCE_LABEL[p.name_ru_source] ?? p.name_ru_source)}`,
  ];
  if (p.elo) {
    const surf = [p.elo_hard && `хард ${Math.round(p.elo_hard)}`, p.elo_clay && `грунт ${Math.round(p.elo_clay)}`, p.elo_grass && `трава ${Math.round(p.elo_grass)}`].filter(Boolean).join(' · ');
    lines.push(`Elo ${Math.round(p.elo)}${surf ? ` (${surf})` : ''}`);
  }
  if (p.sportsru_url) lines.push(`<a href="${esc(p.sportsru_url)}">sports.ru</a>`);
  return lines.join('\n');
}

async function getSession(env, userId) {
  const row = await env.DB.prepare('SELECT state, payload FROM bot_sessions WHERE telegram_user_id = ?').bind(userId).first();
  return row ? { state: row.state, payload: JSON.parse(row.payload || '{}') } : { state: null, payload: {} };
}

async function setSession(env, userId, state, payload = {}) {
  await env.DB.prepare(`INSERT INTO bot_sessions (telegram_user_id, state, payload, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET state = excluded.state, payload = excluded.payload, updated_at = excluded.updated_at`)
    .bind(userId, state, JSON.stringify(payload), new Date().toISOString()).run();
}

async function rememberUser(env, from) {
  if (!from?.id) return;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO bot_users (telegram_user_id, first_name, username, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET first_name = excluded.first_name, username = excluded.username, last_seen = excluded.last_seen`)
    .bind(from.id, from.first_name ?? null, from.username ?? null, now, now).run();
}

async function showFixCard(env, chatId, userId, payload) {
  const p = await nextUnverified(env.DB, payload.skip ?? []);
  if (!p) {
    await setSession(env, userId, null, {});
    return send(env, chatId, 'Все имена проверены 🎉');
  }
  const full = await getPlayer(env.DB, p.player_id);
  const variants = [...new Set(full.aliases.filter((a) => /[А-Яа-яЁё]/.test(a.alias) && a.alias !== p.name_ru && !/\.$/.test(a.alias))
    .map((a) => `${a.alias} (${SOURCE_LABEL[a.source] ?? a.source})`))].slice(0, 4);
  const text = [
    '🔎 <b>Проверка имён</b>',
    playerCard(full),
    variants.length ? `Другие варианты: ${variants.map(esc).join('; ')}` : null,
    '',
    'Имя верное?',
  ].filter((l) => l !== null).join('\n');
  await setSession(env, userId, 'fix', { ...payload, player_id: p.player_id });
  return send(env, chatId, text, {
    reply_markup: { inline_keyboard: [[
      { text: '✅ Верно', callback_data: `ok:${p.player_id}`.slice(0, 64) },
      { text: '✏️ Исправить', callback_data: `edit:${p.player_id}`.slice(0, 64) },
      { text: '⏭ Дальше', callback_data: `skip:${p.player_id}`.slice(0, 64) },
    ]] },
  });
}

async function askNewName(env, chatId, userId, playerId, payload = {}) {
  const p = await getPlayer(env.DB, playerId);
  if (!p) return send(env, chatId, 'Игрок не найден.');
  await setSession(env, userId, 'await_name', { ...payload, player_id: playerId });
  return send(env, chatId, `${playerCard(p)}\n\nНапиши правильное имя по-русски (имя и фамилия). Это исправит его навсегда.`, {
    reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel' }]] },
  });
}

const ADMIN_COMMANDS = [
  { command: 'fix', description: 'Проверять имена по одному' },
  { command: 'name', description: 'Исправить имя игрока' },
  { command: 'player', description: 'Найти игрока' },
  { command: 'stats', description: 'Статистика базы' },
  { command: 'start', description: 'Помощь' },
];

const HELP_ADMIN = [
  '<b>Команды админа</b>',
  '/player Медведев — карточка игрока',
  '/name Медведев — исправить имя (бот спросит новое)',
  '/name Швентек = Ига Свёнтек — исправить сразу',
  '/fix — проверять имена по одному, лучшие игроки первыми',
  '/stats — сколько имён откуда и сколько проверено',
].join('\n');

async function onMessage(env, msg) {
  const chatId = msg.chat.id;
  const from = msg.from ?? {};
  if (msg.chat.type !== 'private') return null;
  await rememberUser(env, from);
  const text = String(msg.text ?? '').trim();
  const admin = isAdmin(env, from.id);
  const [command, ...restParts] = text.split(/\s+/);
  const rest = text.slice(command.length).trim();
  const cmd = command.startsWith('/') ? command.slice(1).split('@')[0].toLowerCase() : null;

  if (cmd === 'start' || cmd === 'help') {
    // Chat-scoped admin menu works only after the admin has opened the bot once.
    if (admin) await tg(env, 'setMyCommands', { scope: { type: 'chat', chat_id: chatId }, commands: ADMIN_COMMANDS });
    const lines = [
      'Привет! Это «Больше. Теннис» 🎾',
      'Скоро здесь будет приложение: матчи «Больше», прогнозы, уровни, фэнтези.',
      'Пока можно найти игрока: /player Медведев',
    ];
    if (admin) lines.push('', HELP_ADMIN);
    else lines.push('', `Твой Telegram ID: <code>${from.id}</code>`);
    return send(env, chatId, lines.join('\n'), env.PUBLIC_URL ? {
      reply_markup: { inline_keyboard: [[{ text: '🎾 Открыть приложение', web_app: { url: appUrl(env) } }]] },
    } : {});
  }

  if (cmd === 'player' || cmd === 'p') {
    if (!rest) return send(env, chatId, 'Напиши фамилию: /player Медведев');
    const found = await searchPlayers(env.DB, rest, { limit: 5 });
    if (!found.length) return send(env, chatId, 'Не нашёл такого игрока.');
    return send(env, chatId, found.map(playerCard).join('\n\n'));
  }

  if (!admin) {
    if (restParts.length || text) return send(env, chatId, 'Чтобы найти игрока, напиши: /player Фамилия');
    return null;
  }
  const adminInfo = { id: from.id, name: [from.first_name, from.username && `@${from.username}`].filter(Boolean).join(' ') };

  if (cmd === 'stats') {
    const s = await nameStats(env.DB);
    const by = s.by_source.map((r) => `${SOURCE_LABEL[r.source] ?? r.source}: ${r.n}`).join('\n');
    return send(env, chatId, `<b>Игроков в базе:</b> ${s.total}\nРешений админов в боте: ${s.bot_decisions}\n\n<b>Откуда имена</b>\n${esc(by)}`);
  }

  if (cmd === 'fix') {
    const session = await getSession(env, from.id);
    return showFixCard(env, chatId, from.id, { skip: session.payload.skip ?? [] });
  }

  if (cmd === 'name') {
    if (!rest) return send(env, chatId, 'Напиши: /name Медведев  или  /name Швентек = Ига Свёнтек');
    const [query, newName] = rest.split('=').map((s) => s.trim());
    const found = await searchPlayers(env.DB, query, { limit: 6 });
    if (!found.length) return send(env, chatId, 'Не нашёл такого игрока.');
    if (found.length === 1 && newName) {
      const res = await setPlayerName(env.DB, found[0].player_id, newName, adminInfo, 'rename');
      return send(env, chatId, res.ok ? `Готово навсегда: ${esc(res.old)} → <b>${esc(res.name)}</b>` : esc(res.error));
    }
    if (found.length === 1) return askNewName(env, chatId, from.id, found[0].player_id);
    return send(env, chatId, 'Кого исправляем?', {
      reply_markup: { inline_keyboard: found.map((p) => [{
        text: `${p.name_ru} · ${p.tour}${p.singles_rank ? ` №${p.singles_rank}` : ''}`,
        callback_data: `edit:${p.player_id}`.slice(0, 64),
      }]) },
    });
  }

  const session = await getSession(env, from.id);
  if (session.state === 'await_name' && text && !cmd) {
    const res = await setPlayerName(env.DB, session.payload.player_id, text, adminInfo, 'rename');
    if (!res.ok) return send(env, chatId, esc(res.error));
    await send(env, chatId, `Готово навсегда: ${esc(res.old)} → <b>${esc(res.name)}</b>`);
    if (session.payload.from_fix) return showFixCard(env, chatId, from.id, { skip: session.payload.skip ?? [] });
    return setSession(env, from.id, null, {});
  }

  return send(env, chatId, HELP_ADMIN);
}

async function onCallback(env, cq) {
  const from = cq.from ?? {};
  const chatId = cq.message?.chat?.id;
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  if (!chatId || !isAdmin(env, from.id)) return null;
  const adminInfo = { id: from.id, name: [from.first_name, from.username && `@${from.username}`].filter(Boolean).join(' ') };
  const [action, playerId] = String(cq.data ?? '').split(':');
  const session = await getSession(env, from.id);
  const skip = session.payload.skip ?? [];
  if (action === 'cancel') {
    await setSession(env, from.id, null, { skip });
    return send(env, chatId, 'Отменено.');
  }
  if (action === 'ok' && playerId) {
    const p = await getPlayer(env.DB, playerId);
    if (p) {
      const res = await setPlayerName(env.DB, playerId, p.name_ru, adminInfo, 'confirm');
      await send(env, chatId, res.ok ? `✅ Подтверждено навсегда: <b>${esc(p.name_ru)}</b>` : esc(res.error));
    }
    return showFixCard(env, chatId, from.id, { skip });
  }
  if (action === 'skip' && playerId) {
    return showFixCard(env, chatId, from.id, { skip: [...skip, playerId] });
  }
  if (action === 'edit' && playerId) {
    return askNewName(env, chatId, from.id, playerId, { skip, from_fix: session.state === 'fix' });
  }
  return null;
}

async function onBoost(env, update) {
  const now = new Date().toISOString();
  if (update.chat_boost) {
    const { chat, boost } = update.chat_boost;
    await env.DB.prepare(`INSERT INTO channel_boosts (boost_id, chat_id, telegram_user_id, source, added_at, expires_at, removed_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(chat_id, boost_id) DO UPDATE SET telegram_user_id = excluded.telegram_user_id, source = excluded.source,
        added_at = excluded.added_at, expires_at = excluded.expires_at, removed_at = NULL`)
      .bind(boost.boost_id, chat.id, boost.source?.user?.id ?? null, boost.source?.source ?? null,
        new Date(boost.add_date * 1000).toISOString(), new Date(boost.expiration_date * 1000).toISOString()).run();
  }
  if (update.removed_chat_boost) {
    const { chat, boost_id: boostId, remove_date: removeDate } = update.removed_chat_boost;
    await env.DB.prepare('UPDATE channel_boosts SET removed_at = ? WHERE chat_id = ? AND boost_id = ?')
      .bind(removeDate ? new Date(removeDate * 1000).toISOString() : now, chat.id, boostId).run();
  }
}

export async function handleTelegramUpdate(update, env) {
  if (update.message) return onMessage(env, update.message);
  if (update.callback_query) return onCallback(env, update.callback_query);
  if (update.chat_boost || update.removed_chat_boost) return onBoost(env, update);
  return null;
}

// Where the Mini App opens: APP_URL is the no-VPN door on the Moscow server (it forwards everything
// to this Worker); the webhook stays on PUBLIC_URL.
export const appUrl = (env) => `${env.APP_URL || env.PUBLIC_URL}/app/`;

// Menu button next to the message field opens the Mini App.
export async function ensureMenuButton(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.PUBLIC_URL) return { skipped: 'no token' };
  const res = await tg(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Приложение', web_app: { url: appUrl(env) } },
  });
  return { ok: Boolean(res.ok), error: res.ok ? null : res.description ?? null };
}

// Called by the cron: once the token secret exists, point Telegram at this Worker.
export async function ensureWebhook(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.PUBLIC_URL) return { skipped: 'no token' };
  const url = `${env.PUBLIC_URL}/telegram/webhook`;
  const info = await tg(env, 'getWebhookInfo', {});
  if (info.ok && info.result?.url === url) return { ok: true, already: true, pending: info.result.pending_update_count ?? 0 };
  const set = await tg(env, 'setWebhook', {
    url,
    secret_token: await webhookSecret(env.TELEGRAM_BOT_TOKEN),
    allowed_updates: ['message', 'callback_query', 'chat_boost', 'removed_chat_boost'],
    max_connections: 20,
  });
  await tg(env, 'setMyCommands', { commands: [
    { command: 'start', description: 'Начать' },
    { command: 'player', description: 'Найти игрока' },
  ] });
  for (const id of adminIds(env)) {
    await tg(env, 'setMyCommands', { scope: { type: 'chat', chat_id: id }, commands: ADMIN_COMMANDS });
  }
  return { ok: Boolean(set.ok), set: true, error: set.ok ? null : set.description ?? null };
}
