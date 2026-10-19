// The home screen, GET /api/home: «Главный матч дня», «Актуальные турниры», the «Больше! Лайв» banner,
// today's question (the poll itself comes from /api/question) and players to suggest for «Твои игроки».
// Admins pick the main match by hand — on the match page of the app (POST /api/home/main) or in the
// bot (/main Фамилия) — and set that week's studio link (/live). Both live in app_state.

import { homeTournaments, nextStudio, pickMainMatch, studioBanner } from '../../src/insights/home.js';
import { MATCH_SELECT, matchesForDate, shapeMatch } from './matches-sync.js';
import { todayQuestion } from './question.js';
import { readChannel } from './channel.js';
import { broadcastsForDate } from './schedule-sync.js';
import { listTournaments } from './tournaments.js';

const MAIN_KEY = 'home_main';
const STUDIO_KEY = 'studio_override';

const mskDay = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();

async function readState(db, key) {
  const row = await db.prepare('SELECT value FROM app_state WHERE key = ?').bind(key).first();
  try {
    return row?.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

function writeState(db, key, value) {
  return db.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, value == null ? '' : JSON.stringify(value), new Date().toISOString()).run();
}

async function matchById(db, matchId) {
  const row = await db.prepare(`${MATCH_SELECT} WHERE m.match_id = ?`).bind(matchId).first();
  return row ? shapeMatch(row) : null;
}

// Tournaments with «Больше» broadcasts around today: they go first on the home screen.
async function coveredTournaments(db, today) {
  const { results } = await db.prepare(`SELECT DISTINCT m.tournament_key AS k FROM matches m
    JOIN players a ON a.fs_id = m.p1_fs_id JOIN players b ON b.fs_id = m.p2_fs_id
    JOIN broadcasts br ON br.date_msk = m.date_msk AND br.status != 'removed'
      AND ((br.player1_id = a.player_id AND br.player2_id = b.player_id) OR (br.player1_id = b.player_id AND br.player2_id = a.player_id))
    WHERE m.date_msk BETWEEN ? AND ?`).bind(addDays(today, -3), addDays(today, 3)).all();
  return new Set(results.map((r) => r.k));
}

// Players to suggest when the fan follows nobody yet: the best-ranked of today's and tomorrow's
// main-tour singles (наши pulled forward), each with the match they play.
function featuredPlayers(matches, limit = 8) {
  const byId = new Map();
  for (const m of matches) {
    if (m.is_doubles || m.tournament.level !== 'tour' || /квалификац/i.test(m.tournament.name ?? '')) continue;
    for (const [p, o, side] of [[m.p1, m.p2, 1], [m.p2, m.p1, 2]]) {
      if (!p.player_id || !p.rank || byId.has(p.player_id)) continue;
      const score = side === 1 ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : `${m.sets_p2 ?? 0}:${m.sets_p1 ?? 0}`;
      byId.set(p.player_id, {
        ...p,
        match: {
          match_id: m.match_id, status: m.status, start_at: m.start_at, opponent: o.name, tournament: m.tournament.name,
          won: m.winner ? m.winner === side : null, score: m.status === 'scheduled' ? null : score,
        },
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.rank * (a.is_russian ? 0.4 : 1) - b.rank * (b.is_russian ? 0.4 : 1)).slice(0, limit);
}

// «Голосование недели» from the channel goes with the studio banner: the show talks it over.
const withPoll = (banner, poll) => (banner ? { ...banner, poll: poll ?? null } : null);

export async function homeView(env, date = mskDay()) {
  const db = env.DB;
  const now = Date.now();
  const today = mskDay(now);
  const tomorrow = addDays(date, 1);
  const [all, aheadTour, aheadCh, broadcasts, pick, studio, list, covered, question, channel] = await Promise.all([
    matchesForDate(db, date, {}),
    matchesForDate(db, tomorrow, { level: 'tour' }),
    matchesForDate(db, tomorrow, { level: 'challenger' }),
    broadcastsForDate(db, date),
    readState(db, MAIN_KEY),
    readState(db, STUDIO_KEY),
    listTournaments(env, null),
    coveredTournaments(db, today),
    todayQuestion(env).catch(() => null),
    readChannel(db).catch(() => null),
  ]);
  const candidates = [...all, ...aheadTour, ...aheadCh];
  // The editors' pick holds for its day.
  let pickId = null;
  if (pick?.match_id && pick.date >= today) {
    pickId = pick.match_id;
    if (!candidates.some((m) => m.match_id === pickId)) {
      const m = await matchById(db, pickId);
      if (m) candidates.push(m);
    }
  }
  const main = pickMainMatch(candidates, { pickId, now, today });
  const tours = homeTournaments(list, { covered, today });
  const withVisual = (t) => ({ ...t, covered: covered.has(t.key) });
  return {
    date,
    main: main ? { ...main.match, manual: main.manual } : null,
    studio: withPoll(studioBanner(now, studio, channel?.live), channel?.poll),
    tournaments: tours.tournaments.map(withVisual),
    more_tour: tours.more_tour,
    challengers: tours.challengers,
    question,
    featured: featuredPlayers([...all, ...aheadTour]),
    // The old home screen (an app cached before 2026-10-18) still reads these.
    bolshe: all.filter((m) => m.bolshe),
    broadcasts,
  };
}

// ---------- admins: the main match by hand ----------
export async function setMainMatch(env, matchId, by = null) {
  if (!matchId) {
    await writeState(env.DB, MAIN_KEY, null);
    return { ok: true, auto: true };
  }
  const m = await matchById(env.DB, matchId);
  if (!m) return { ok: false, status: 404, error: 'Матч не найден' };
  await writeState(env.DB, MAIN_KEY, { match_id: m.match_id, date: m.date_msk, by });
  return { ok: true, match: m };
}

export async function mainMatchNow(env) {
  return (await homeView(env)).main;
}

// Today's and tomorrow's singles with a player whose name has the given text (for /main Фамилия).
export async function findMatchesByName(env, text) {
  const today = mskDay();
  const want = norm(text);
  if (!want) return [];
  const days = await Promise.all([today, addDays(today, 1)].map((d) => matchesForDate(env.DB, d, {})));
  return days.flat().filter((m) => !m.is_doubles && !['cancelled', 'walkover'].includes(m.status)
    && [m.p1.name, m.p2.name, m.p1.short, m.p2.short].some((n) => norm(n).includes(want)))
    .slice(0, 8);
}

// ---------- admins: «Больше! Лайв» of the coming Monday ----------
export async function studioState(env) {
  const override = await readState(env.DB, STUDIO_KEY);
  return { override, banner: studioBanner(Date.now(), override), next: nextStudio(Date.now()) };
}

export async function setStudio(env, patch) {
  const slot = nextStudio(Date.now());
  const old = await readState(env.DB, STUDIO_KEY);
  const next = { ...(old?.date === slot.date ? old : {}), ...patch, date: slot.date };
  await writeState(env.DB, STUDIO_KEY, next);
  return { ok: true, override: next, date: slot.date };
}
