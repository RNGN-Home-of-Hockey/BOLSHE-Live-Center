// BOLSHE Live Center Worker: the single tennis base (D1) behind the bot and the future Mini App.
//   GET  /health                         counts + last cron runs
//   GET  /api/players?q=&tour=&russian=1 search (Russian or Latin, any word order)
//   GET  /api/players/<player_id>        one player with all spellings
//   GET  /api/broadcasts?date=YYYY-MM-DD «Больше» tennis broadcasts of a day (Moscow date)
//   GET  /api/levels?xp=1234             tennis levels and XP rules
//   POST /telegram/webhook               Telegram updates (secret header required)
// Cron (every 10 min): schedule sheet -> broadcasts; registers the bot webhook once the token exists.

import { LEGEND_STEP, LEVELS, XP_RULES, levelFor } from '../../src/game/levels.js';
import { matchCard } from './match-details.js';
import { matchesForDate, syncMatchDays } from './matches-sync.js';
import { getPlayer, searchPlayers } from './players.js';
import { broadcastsForDate, syncSchedule } from './schedule-sync.js';
import { ensureWebhook, handleTelegramUpdate, webhookSecret } from './telegram.js';

const json = (data, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
  },
});

const todayMsk = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

async function health(env) {
  const one = async (sql) => (await env.DB.prepare(sql).first())?.n ?? 0;
  const { results: runs } = await env.DB.prepare(
    'SELECT job, started_at, finished_at, ok, details FROM sync_runs ORDER BY id DESC LIMIT 5',
  ).all();
  return {
    ok: true,
    players: await one('SELECT COUNT(*) AS n FROM players'),
    broadcasts: await one('SELECT COUNT(*) AS n FROM broadcasts'),
    name_decisions: await one('SELECT COUNT(*) AS n FROM player_name_overrides'),
    bot_users: await one('SELECT COUNT(*) AS n FROM bot_users'),
    bot_token_set: Boolean(env.TELEGRAM_BOT_TOKEN),
    schedule_configured: Boolean(env.SCHEDULE_SHEET_ID),
    last_runs: runs,
  };
}

async function runJob(env, job, fn) {
  const started = new Date().toISOString();
  const { meta } = await env.DB.prepare('INSERT INTO sync_runs (job, started_at) VALUES (?, ?)').bind(job, started).run();
  let ok = 1;
  let details;
  try {
    details = await fn();
  } catch (error) {
    ok = 0;
    details = { error: String(error?.message ?? error) };
    console.error(`${job} failed`, error?.stack ?? error);
  }
  await env.DB.prepare('UPDATE sync_runs SET finished_at = ?, ok = ?, details = ? WHERE id = ?')
    .bind(new Date().toISOString(), ok, JSON.stringify(details).slice(0, 2000), meta.last_row_id).run();
}

const SCHEDULE_EVERY_MS = 10 * 60 * 1000;
const MATCHES_TODAY_EVERY_MS = 60 * 1000;
const MATCHES_WINDOW_EVERY_MS = 5 * 60 * 1000;
const WINDOW_OFFSETS = [-1, 1, -2, 2, -3, 3];

async function due(env, key, everyMs, force) {
  const last = await getState(env, key);
  if (!force && last && Date.now() - Date.parse(last.updated_at) < everyMs) return null;
  return last ?? { value: null };
}

async function getState(env, key) {
  return env.DB.prepare('SELECT value, updated_at FROM app_state WHERE key = ?').bind(key).first();
}

async function setState(env, key, value) {
  await env.DB.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, value, new Date().toISOString()).run();
}

// Cloudflare did not fire this Worker's cron after the first deployment (2026-10-13), so every
// request also keeps the base fresh: the schedule is re-read when older than 10 minutes, and
// the bot webhook is registered as soon as the token secret appears. The cron does the same.
async function maintain(env, { force = false } = {}) {
  const tasks = [];
  if (env.SCHEDULE_SHEET_ID) {
    const last = await getState(env, 'schedule_sync_started');
    if (force || !last || Date.now() - Date.parse(last.updated_at) > SCHEDULE_EVERY_MS) {
      await setState(env, 'schedule_sync_started', force ? 'cron' : 'request');
      tasks.push(runJob(env, 'schedule', () => syncSchedule(env)));
    }
  }
  // Matches: today every minute (live scores), the days around it one by one every 5 minutes.
  if (await due(env, 'matches_today', MATCHES_TODAY_EVERY_MS, force)) {
    await setState(env, 'matches_today', 'run');
    tasks.push(runJob(env, 'matches_today', () => syncMatchDays(env, [0])));
  }
  const windowState = await due(env, 'matches_window', MATCHES_WINDOW_EVERY_MS, force);
  if (windowState) {
    const index = (Number(windowState.value) || 0) % WINDOW_OFFSETS.length;
    await setState(env, 'matches_window', String(index + 1));
    tasks.push(runJob(env, 'matches_window', () => syncMatchDays(env, [WINDOW_OFFSETS[index]])));
  }
  if (env.TELEGRAM_BOT_TOKEN) {
    const want = (await webhookSecret(env.TELEGRAM_BOT_TOKEN)).slice(0, 16);
    const done = await getState(env, 'webhook_for');
    const tried = await getState(env, 'webhook_attempt');
    const recentlyTried = tried && Date.now() - Date.parse(tried.updated_at) < 60 * 1000;
    if (force || (done?.value !== want && !recentlyTried)) {
      await setState(env, 'webhook_attempt', want);
      tasks.push(runJob(env, 'webhook', async () => {
        const result = await ensureWebhook(env);
        if (result.ok) await setState(env, 'webhook_for', want);
        return result;
      }));
    }
  }
  await Promise.all(tasks);
}

async function runCron(env) {
  await maintain(env, { force: true });
  await env.DB.prepare("DELETE FROM sync_runs WHERE started_at < datetime('now', '-14 days')").run();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    ctx.waitUntil(maintain(env).catch((error) => console.error('maintain failed', error?.stack ?? error)));
    try {
      if (path === '/telegram/webhook') {
        if (request.method !== 'POST') return json({ ok: false }, 405);
        if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'bot token is not set' }, 503);
        if (request.headers.get('x-telegram-bot-api-secret-token') !== await webhookSecret(env.TELEGRAM_BOT_TOKEN)) {
          return json({ ok: false }, 401);
        }
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update, env).catch((error) => console.error('update failed', error?.stack ?? error)));
        return json({ ok: true });
      }
      if (request.method !== 'GET') return json({ ok: false, error: 'method not allowed' }, 405);
      if (path === '/') {
        return json({ service: 'BOLSHE Live Center', endpoints: ['/health', '/api/players?q=', '/api/players/<id>', '/api/broadcasts?date=', '/api/levels?xp='] });
      }
      if (path === '/health') return json(await health(env));
      if (path === '/api/players') {
        const players = await searchPlayers(env.DB, url.searchParams.get('q') ?? '', {
          tour: (url.searchParams.get('tour') ?? '').toUpperCase() || null,
          russian: url.searchParams.get('russian') === '1',
          limit: url.searchParams.get('limit') ?? 20,
        });
        return json({ players }, 200, 60);
      }
      if (path.startsWith('/api/players/')) {
        const player = await getPlayer(env.DB, decodeURIComponent(path.slice('/api/players/'.length)));
        return player ? json({ player }, 200, 60) : json({ ok: false, error: 'not found' }, 404);
      }
      if (path === '/api/broadcasts') {
        const date = url.searchParams.get('date') ?? todayMsk();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'date must be YYYY-MM-DD' }, 400);
        return json({ date, broadcasts: await broadcastsForDate(env.DB, date) }, 200, 60);
      }
      if (path === '/api/matches') {
        const date = url.searchParams.get('date') ?? todayMsk();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'date must be YYYY-MM-DD' }, 400);
        const matches = await matchesForDate(env.DB, date, {
          level: url.searchParams.get('level') || null,
          tour: (url.searchParams.get('tour') ?? '').toUpperCase() || null,
          russian: url.searchParams.get('russian') === '1',
          bolshe: url.searchParams.get('bolshe') === '1',
        });
        return json({ date, matches }, 200, 20);
      }
      if (path.startsWith('/api/matches/')) {
        const card = await matchCard(env, decodeURIComponent(path.slice('/api/matches/'.length)));
        return card ? json(card, 200, 30) : json({ ok: false, error: 'not found' }, 404);
      }
      if (path === '/api/home') {
        const date = url.searchParams.get('date') ?? todayMsk();
        const all = await matchesForDate(env.DB, date, {});
        const main = all.filter((m) => !m.is_doubles && ['tour', 'challenger'].includes(m.tournament.level));
        return json({
          date,
          bolshe: all.filter((m) => m.bolshe),
          broadcasts: await broadcastsForDate(env.DB, date),
          russians: main.filter((m) => m.p1.is_russian || m.p2.is_russian),
          live: main.filter((m) => m.status === 'live').slice(0, 20),
          tour: all.filter((m) => m.tournament.level === 'tour' && !m.is_doubles),
        }, 200, 20);
      }
      if (path === '/api/levels') {
        return json({ levels: LEVELS, legend_step: LEGEND_STEP, xp_rules: XP_RULES, you: levelFor(url.searchParams.get('xp') ?? 0) }, 200, 300);
      }
      return json({ ok: false, error: 'not found' }, 404);
    } catch (error) {
      console.error(error?.stack ?? error);
      return json({ ok: false, error: 'internal error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};
