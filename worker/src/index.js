// BOLSHE Live Center Worker: the single tennis base (D1) behind the bot and the future Mini App.
//   GET  /health                         counts + last cron runs
//   GET  /api/players?q=&tour=&russian=1 search (Russian or Latin, any word order)
//   GET  /api/players/<player_id>        one player with all spellings
//   GET  /api/broadcasts?date=YYYY-MM-DD «Больше» tennis broadcasts of a day (Moscow date)
//   GET  /api/levels?xp=1234             tennis levels and XP rules
//   GET  /media/covers/<vk id>.jpg       our stored cover of a «Больше» broadcast (640×360)
//   GET  /media/heads/<flashscore id>.png our stored head of a player
//   GET  /api/me?date=  POST /api/votes  POST /api/follows   fans (header X-Telegram-Init-Data)
//   POST /telegram/webhook               Telegram updates (secret header required)
// Cron (every 10 min): schedule sheet -> broadcasts; registers the bot webhook once the token exists.

import { LEGEND_STEP, LEVELS, XP_RULES, levelFor } from '../../src/game/levels.js';
import { explainTournament } from '../../src/insights/tournaments.js';
import { authUser, castVote, fanProfile, setFollow } from './fans.js';
import { matchCard } from './match-details.js';
import { mediaCounts, serveMedia, syncMedia } from './media.js';
import { matchesForDate, matchesOfPlayer, syncMatchDays } from './matches-sync.js';
import { syncOdds } from './odds-sync.js';
import { getPlayer, searchPlayers } from './players.js';
import { broadcastsForDate, syncSchedule } from './schedule-sync.js';
import { ensureMenuButton, ensureWebhook, handleTelegramUpdate, webhookSecret } from './telegram.js';

const json = (data, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
  },
});

const todayMsk = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

// Main-tour and challenger singles of the day, one entry per tournament, explained in plain words.
function summarizeTournaments(matches, broadcasts) {
  const byKey = new Map();
  for (const m of matches) {
    const t = m.tournament;
    if (m.is_doubles || !['tour', 'challenger'].includes(t.level)) continue;
    const key = `${t.tour}|${t.name}`;
    const entry = byKey.get(key) ?? { tour: t.tour, name: t.name, level: t.level, surface: t.surface, country: t.country, matches: 0, live: 0, bolshe: 0, russians: 0 };
    entry.matches += 1;
    if (m.status === 'live') entry.live += 1;
    if (m.bolshe) entry.bolshe += 1;
    if (m.p1.is_russian || m.p2.is_russian) entry.russians += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].map((e) => {
    const broadcast = broadcasts.find((b) => b.tournament && e.name && b.tournament.toLowerCase().includes(e.name.toLowerCase()));
    return { ...e, round: broadcast?.round ?? null, ...explainTournament({ ...e, tournament: e.name }, broadcast?.tournament) };
  }).sort((a, b) => (a.level === b.level ? b.matches - a.matches : a.level === 'tour' ? -1 : 1));
}

// Main-tour singles still to come that are not on the «Больше» schedule: the best-ranked pairs
// of each tournament (today and tomorrow), three per tournament.
function upcomingByTournament(matches) {
  const now = Date.now();
  const byKey = new Map();
  const open = matches.filter((m) => !m.is_doubles && m.tournament.level === 'tour' && m.status === 'scheduled'
    && !m.bolshe && Date.parse(m.start_at) > now);
  open.sort((a, b) => ((a.p1.rank ?? 999) + (a.p2.rank ?? 999)) - ((b.p1.rank ?? 999) + (b.p2.rank ?? 999)));
  for (const m of open) {
    const key = `${m.tournament.tour}|${m.tournament.name}`;
    const list = byKey.get(key) ?? [];
    if (list.length < 3) list.push(m);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) list.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  return byKey;
}

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
    media: await mediaCounts(env.DB),
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
const MEDIA_EVERY_MS = 60 * 1000;
const ODDS_LIVE_EVERY_MS = 60 * 1000;
const ODDS_PREMATCH_EVERY_MS = 10 * 60 * 1000;
// Flashscore keeps −7…+7 days; nearer days come round more often.
const WINDOW_OFFSETS = [-1, 1, -2, 2, -1, 1, -3, 3, -4, 4, -1, 1, -5, 5, -6, 6, -7, 7];

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
  // Covers of «Больше» broadcasts and player heads into our bucket, a few every minute.
  if (env.MEDIA && await due(env, 'media_sync', MEDIA_EVERY_MS, force)) {
    await setState(env, 'media_sync', 'run');
    tasks.push(runJob(env, 'media', () => syncMedia(env)));
  }
  // Winline odds: in play every minute, pre-match every 10 minutes (the feed is ~6.5 MB).
  if (await due(env, 'odds_live', ODDS_LIVE_EVERY_MS, force)) {
    await setState(env, 'odds_live', 'run');
    tasks.push(runJob(env, 'odds_live', () => syncOdds(env, 'live')));
  }
  if (await due(env, 'odds_prematch', ODDS_PREMATCH_EVERY_MS, force)) {
    await setState(env, 'odds_prematch', 'run');
    tasks.push(runJob(env, 'odds_prematch', () => syncOdds(env, 'prematch')));
  }
  if (env.TELEGRAM_BOT_TOKEN) {
    const menuWant = `${env.PUBLIC_URL}/app/`;
    const menu = await getState(env, 'menu_button_for');
    if (menu?.value !== menuWant) {
      await setState(env, 'menu_button_for', menuWant);
      tasks.push(runJob(env, 'menu_button', () => ensureMenuButton(env)));
    }
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
    // Pictures are served straight from the bucket and do not wake the upkeep (a screen asks for dozens).
    if (path.startsWith('/media/')) {
      return request.method === 'GET' || request.method === 'HEAD' ? serveMedia(env, path) : json({ ok: false }, 405);
    }
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
      // Fans: everything personal needs the signed Telegram data of the Mini App.
      if (path === '/api/me' || path === '/api/votes' || path === '/api/follows') {
        const user = await authUser(env, request);
        if (!user) return json({ ok: false, error: 'open the app in Telegram' }, 401);
        if (path === '/api/me') {
          const date = url.searchParams.get('date') ?? todayMsk();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'date must be YYYY-MM-DD' }, 400);
          return json(await fanProfile(env, user, date));
        }
        if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
        const body = await request.json().catch(() => ({}));
        const result = path === '/api/votes'
          ? await castVote(env, user, body.match_id, Number(body.pick))
          : await setFollow(env, user, body.player_id, Boolean(body.on));
        return json(result, result.ok ? 200 : result.status ?? 400);
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
      const playerMatches = path.match(/^\/api\/players\/([^/]+)\/matches$/);
      if (playerMatches) {
        const player = await env.DB.prepare('SELECT fs_id FROM players WHERE player_id = ?').bind(decodeURIComponent(playerMatches[1])).first();
        if (!player) return json({ ok: false, error: 'not found' }, 404);
        return json({ matches: await matchesOfPlayer(env.DB, player.fs_id) }, 200, 30);
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
        const filters = {
          level: url.searchParams.get('level') || null,
          tour: (url.searchParams.get('tour') ?? '').toUpperCase() || null,
          russian: url.searchParams.get('russian') === '1',
          bolshe: url.searchParams.get('bolshe') === '1',
        };
        let matches = await matchesForDate(env.DB, date, filters);
        // A day picked in the app that the rotation has not reached yet is fetched right away
        // (Flashscore keeps −7…+7 days); at most once per 10 minutes per day.
        const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayMsk()}T00:00:00Z`)) / 86400e3);
        if (!matches.length && Math.abs(offset) <= 7 && await due(env, `matches_day_${date}`, 10 * 60 * 1000, false)) {
          await setState(env, `matches_day_${date}`, 'on_demand');
          await runJob(env, 'matches_on_demand', () => syncMatchDays(env, [offset]));
          matches = await matchesForDate(env.DB, date, filters);
        }
        return json({ date, matches }, 200, 20);
      }
      if (path.startsWith('/api/matches/')) {
        const card = await matchCard(env, decodeURIComponent(path.slice('/api/matches/'.length)));
        return card ? json(card, 200, 30) : json({ ok: false, error: 'not found' }, 404);
      }
      if (path === '/api/home') {
        const date = url.searchParams.get('date') ?? todayMsk();
        const tomorrow = new Date(Date.parse(`${date}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10);
        const [all, ahead, broadcasts] = await Promise.all([
          matchesForDate(env.DB, date, {}),
          matchesForDate(env.DB, tomorrow, { level: 'tour' }),
          broadcastsForDate(env.DB, date),
        ]);
        const main = all.filter((m) => !m.is_doubles && ['tour', 'challenger'].includes(m.tournament.level));
        const upcoming = upcomingByTournament([...all, ...ahead]);
        return json({
          date,
          tournaments: summarizeTournaments(all, broadcasts).map((t) => ({ ...t, upcoming: upcoming.get(`${t.tour}|${t.name}`) ?? [] })),
          bolshe: all.filter((m) => m.bolshe),
          broadcasts,
          russians: main.filter((m) => m.p1.is_russian || m.p2.is_russian),
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
