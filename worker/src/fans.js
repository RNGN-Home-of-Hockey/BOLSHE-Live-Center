// Fans in the Mini App: sign-in by Telegram initData, "Кто выиграет?" votes (open until the
// match starts), «Мои игроки», and the rating card (level, XP, place, guessed, streak).
//   GET  /api/me?date=YYYY-MM-DD   header X-Telegram-Init-Data
//   POST /api/votes   {match_id, pick: 1|2}
//   POST /api/follows {player_id | player_ids: [...], on: true|false}
//   POST /api/prefs   {public, surface, tours, since, onboarded, fav_tournaments}   (onboarding, settings, ★ tournaments)
//   POST /api/events  {kind: 'vk', ref}                            (a «Больше» broadcast opened from the app)

import { PHOTO_HQ } from './photos.js';
import { achievementsXp, fanAchievements } from '../../src/game/achievements.js';
import { bracketStatus } from '../../src/game/bracket.js';
import { LEVELS, XP_RULES, levelFor } from '../../src/game/levels.js';
import { QUESTION_XP } from '../../src/game/question.js';
import { mediaUrl } from '../../src/lib/media.js';
import { verifyInitData } from '../../src/lib/telegram-auth.js';
import { webSessionUser } from './web-login.js';
import { MATCH_SELECT, matchesOfPlayer, shapeMatch } from './matches-sync.js';
import { ratingPlace } from './rating.js';

// Inside Telegram: the signed initData. On the website: the session of «Войти через Telegram».
export async function authUser(env, request) {
  const initData = request.headers.get('x-telegram-init-data');
  const user = (initData ? await verifyInitData(initData, env.TELEGRAM_BOT_TOKEN) : null) ?? await webSessionUser(env, request);
  if (!user) return null;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO bot_users (telegram_user_id, first_name, username, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET first_name = excluded.first_name, username = excluded.username, last_seen = excluded.last_seen`)
    .bind(user.id, user.first_name, user.username, now, now).run();
  return user;
}

export async function voteCounts(db, matchId) {
  const r = await db.prepare('SELECT SUM(pick = 1) AS p1, SUM(pick = 2) AS p2, COUNT(*) AS total FROM votes WHERE match_id = ?').bind(matchId).first();
  return { p1: r?.p1 ?? 0, p2: r?.p2 ?? 0, total: r?.total ?? 0 };
}

// Tennis start times are approximate (a match "after Sabalenka" may begin an hour late), so the
// vote stays open while the match has not started according to the live feed.
export async function castVote(env, user, matchId, pick) {
  if (pick !== 1 && pick !== 2) return { ok: false, status: 400, error: 'pick must be 1 or 2' };
  const match = await env.DB.prepare('SELECT status FROM matches WHERE match_id = ?').bind(String(matchId ?? '')).first();
  if (!match) return { ok: false, status: 404, error: 'match not found' };
  if (match.status !== 'scheduled') return { ok: false, status: 409, error: 'Голосование закрыто: матч уже начался' };
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO votes (match_id, user_id, pick, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(match_id, user_id) DO UPDATE SET pick = excluded.pick, updated_at = excluded.updated_at`)
    .bind(matchId, user.id, pick, now, now).run();
  return { ok: true, match_id: matchId, pick, votes: await voteCounts(env.DB, matchId) };
}

// One player or a list (the first-start questions pick several at once).
export async function setFollow(env, user, playerId, on) {
  const ids = (Array.isArray(playerId) ? playerId : [playerId]).map((x) => String(x ?? '')).filter(Boolean).slice(0, 30);
  if (!ids.length) return { ok: false, status: 400, error: 'player not found' };
  const { results: known } = await env.DB.prepare(`SELECT player_id FROM players WHERE player_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  if (!known.length) return { ok: false, status: 404, error: 'player not found' };
  const now = new Date().toISOString();
  await env.DB.batch(known.map((p) => (on
    ? env.DB.prepare('INSERT OR IGNORE INTO follows (user_id, player_id, created_at) VALUES (?, ?, ?)').bind(user.id, p.player_id, now)
    : env.DB.prepare('DELETE FROM follows WHERE user_id = ? AND player_id = ?').bind(user.id, p.player_id))));
  return { ok: true, follows: await followIds(env.DB, user.id) };
}

const PREF_VALUES = { surface: ['hard', 'clay', 'grass', 'all'], tours: ['ATP', 'WTA', 'all'], since: ['new', '2-5', '5-10', '10+'] };

// Settings and the first-start answers. Unknown values are ignored.
export async function setPrefs(env, user, body) {
  const old = await env.DB.prepare('SELECT * FROM fan_prefs WHERE user_id = ?').bind(user.id).first();
  const pick = (k) => (PREF_VALUES[k].includes(body?.[k]) ? body[k] : old?.[k] ?? null);
  const now = new Date().toISOString();
  const row = {
    public: typeof body?.public === 'boolean' ? (body.public ? 1 : 0) : old?.public ?? 1,
    surface: pick('surface'), tours: pick('tours'), since: pick('since'),
    onboarded_at: body?.onboarded ? old?.onboarded_at ?? now : old?.onboarded_at ?? null,
    // ★ tournaments: up to 20 names like «Шанхай».
    fav_tournaments: Array.isArray(body?.fav_tournaments)
      ? JSON.stringify([...new Set(body.fav_tournaments.map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 20))
      : old?.fav_tournaments ?? null,
  };
  await env.DB.prepare(`INSERT INTO fan_prefs (user_id, public, surface, tours, since, onboarded_at, fav_tournaments, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET public = excluded.public, surface = excluded.surface, tours = excluded.tours,
      since = excluded.since, onboarded_at = excluded.onboarded_at, fav_tournaments = excluded.fav_tournaments, updated_at = excluded.updated_at`)
    .bind(user.id, row.public, row.surface, row.tours, row.since, row.onboarded_at, row.fav_tournaments, now).run();
  return { ok: true, prefs: { ...row, public: Boolean(row.public), fav_tournaments: JSON.parse(row.fav_tournaments ?? '[]') } };
}

export async function trackEvent(env, user, body) {
  if (body?.kind !== 'vk' || !body.ref) return { ok: false, status: 400, error: 'unknown event' };
  await env.DB.prepare('INSERT OR IGNORE INTO fan_events (user_id, kind, ref, created_at) VALUES (?, ?, ?, ?)')
    .bind(user.id, 'vk', String(body.ref).slice(0, 120), new Date().toISOString()).run();
  return { ok: true };
}

const mskDay = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

// «Мои прогнозы»: every vote of the fan with its match (players, tournament, score, result) and the XP it gave.
export async function myPredictions(env, user) {
  const db = env.DB;
  const { results: votes } = await db.prepare('SELECT match_id, pick, created_at FROM votes WHERE user_id = ? ORDER BY created_at DESC LIMIT 400')
    .bind(user.id).all();
  const matches = new Map();
  for (let i = 0; i < votes.length; i += 80) {
    const ids = votes.slice(i, i + 80).map((v) => v.match_id);
    const { results } = await db.prepare(`${MATCH_SELECT} WHERE m.match_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    for (const r of results) matches.set(r.match_id, shapeMatch(r));
  }
  return {
    items: votes.filter((v) => matches.has(v.match_id)).map((v) => {
      const m = matches.get(v.match_id);
      const share = m.votes.total ? (v.pick === 1 ? m.votes.p1 : m.votes.p2) / m.votes.total : 1;
      const right = m.winner ? m.winner === v.pick : null;
      const minority = right && m.votes.total >= 10 && share < XP_RULES.against_majority_share;
      return {
        match: m, pick: v.pick, voted_at: v.created_at, right,
        xp: XP_RULES.prediction_made + (right ? XP_RULES.winner_correct * (minority ? XP_RULES.against_majority_multiplier : 1) : 0),
        share: Math.round(share * 100),
      };
    }),
  };
}

// The fan's brackets of running tournaments: picks still alive, guessed, and how the bracket
// compares with the others ("лучше, чем у 60% участников").
async function myBrackets(db, userId) {
  try {
    const { results } = await db.prepare(`SELECT e.bracket_key, e.picks_json, e.submitted_at, e.points, e.possible, b.draw_json,
        (SELECT COUNT(*) FROM bracket_entries x WHERE x.bracket_key = e.bracket_key) AS fans,
        (SELECT COUNT(*) FROM bracket_entries x WHERE x.bracket_key = e.bracket_key
          AND (x.points < e.points OR (x.points = e.points AND x.possible < e.possible))) AS below
      FROM bracket_entries e JOIN brackets b ON b.bracket_key = e.bracket_key
      WHERE e.user_id = ? AND (b.status = 'open' OR b.updated_at > datetime('now', '-3 days'))`).bind(userId).all();
    return results.map((r) => ({
      bracket_key: r.bracket_key, submitted_at: r.submitted_at, points: r.points, possible: r.possible, fans: r.fans,
      better_than: r.fans > 1 ? Math.round((100 * r.below) / (r.fans - 1)) : null,
      ...bracketStatus(JSON.parse(r.draw_json), JSON.parse(r.picks_json)),
    }));
  } catch {
    return [];
  }
}

async function followIds(db, userId) {
  const { results } = await db.prepare('SELECT player_id FROM follows WHERE user_id = ? ORDER BY created_at').bind(userId).all();
  return results.map((r) => r.player_id);
}

// XP of every fan (XP_RULES): a vote +prediction_made; a right winner +winner_correct, doubled
// when fewer than 35% of at least 10 voters picked that player.
async function xpTable(db) {
  const { results } = await db.prepare(`WITH tally AS (
      SELECT match_id, SUM(pick = 1) AS n1, SUM(pick = 2) AS n2, COUNT(*) AS n FROM votes GROUP BY match_id)
    SELECT v.user_id, SUM(?1 + CASE WHEN m.winner IS NOT NULL AND m.winner = v.pick
        THEN ?2 * CASE WHEN t.n >= 10 AND (CASE v.pick WHEN 1 THEN t.n1 ELSE t.n2 END) * 1.0 / t.n < ?3 THEN ?4 ELSE 1 END
        ELSE 0 END) AS xp
    FROM votes v LEFT JOIN matches m ON m.match_id = v.match_id LEFT JOIN tally t ON t.match_id = v.match_id
    GROUP BY v.user_id`)
    .bind(XP_RULES.prediction_made, XP_RULES.winner_correct, XP_RULES.against_majority_share, XP_RULES.against_majority_multiplier).all();
  // Bracket points count as XP too.
  const xp = new Map(results.map((r) => [Number(r.user_id), r.xp]));
  try {
    const { results: brackets } = await db.prepare('SELECT user_id, SUM(points) AS p FROM bracket_entries GROUP BY user_id').all();
    for (const b of brackets) xp.set(Number(b.user_id), (xp.get(Number(b.user_id)) ?? 0) + (b.p ?? 0));
  } catch { /* no brackets table yet */ }
  // «Вопрос дня»: «Да» or «Нет» gives XP, the right one more («Затрудняюсь» gives nothing).
  try {
    const { results: answers } = await db.prepare(`SELECT v.user_id, SUM(CASE WHEN v.pick < 2 THEN ?1 ELSE 0 END
        + CASE WHEN q.answer IS NOT NULL AND q.answer = v.pick THEN ?2 ELSE 0 END) AS p
      FROM question_votes v JOIN daily_questions q ON q.day = v.day GROUP BY v.user_id`).bind(QUESTION_XP.answer, QUESTION_XP.correct).all();
    for (const a of answers) xp.set(Number(a.user_id), (xp.get(Number(a.user_id)) ?? 0) + (a.p ?? 0));
  } catch { /* no questions table yet */ }
  return [...xp].map(([user_id, total]) => ({ user_id, xp: total }));
}

const DONE = ['finished', 'retired', 'walkover'];

// Points for brackets (worker/src/brackets.js); 0 until the fan has filled one.
async function bracketPointsOf(db, userId) {
  try {
    const row = await db.prepare('SELECT COALESCE(SUM(points), 0) AS p FROM bracket_entries WHERE user_id = ?').bind(userId).first();
    return row?.p ?? 0;
  } catch {
    return 0; // the brackets table arrives with migration 0008
  }
}

function playerCard(p, matches, now) {
  const mine = (m) => (m.p1.fs_id === p.fs_id ? 1 : 2);
  const other = (m) => (mine(m) === 1 ? m.p2 : m.p1);
  const sets = (m) => (mine(m) === 1 ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : `${m.sets_p2 ?? 0}:${m.sets_p1 ?? 0}`);
  const live = matches.find((m) => m.status === 'live');
  const last = matches.find((m) => DONE.includes(m.status) && m.winner);
  const next = [...matches].reverse().find((m) => m.status === 'scheduled' && Date.parse(m.start_at) > now - 3600e3);
  const side = (m) => ({ match_id: m.match_id, opponent: other(m).name, start_at: m.start_at, tournament: m.tournament.name });
  return {
    player_id: p.player_id,
    name: p.name_ru,
    photo: mediaUrl(p.head) ?? p.photo_url ?? null,
    photo_hq: mediaUrl(p.photo_hq),
    live: live ? { ...side(live), score: sets(live) } : null,
    last: last ? { ...side(last), won: last.winner === mine(last), score: sets(last), status: last.status } : null,
    next: next ? side(next) : null,
  };
}

export async function fanProfile(env, user, date) {
  const db = env.DB;
  const table = await xpTable(db);
  const meRow = table.find((r) => Number(r.user_id) === user.id);
  const xp = meRow?.xp ?? 0;
  const { results: settled } = await db.prepare(`SELECT v.pick, m.winner, m.start_at FROM votes v JOIN matches m ON m.match_id = v.match_id
    WHERE v.user_id = ? AND m.winner IS NOT NULL ORDER BY m.start_at DESC`).bind(user.id).all();
  let streak = 0;
  while (streak < settled.length && settled[streak].pick === settled[streak].winner) streak += 1;
  const day = Date.parse(`${date}T12:00:00Z`);
  const near = (offset) => new Date(day + offset * 86400e3).toISOString().slice(0, 10);
  const { results: picks } = await db.prepare(`SELECT v.match_id, v.pick FROM votes v JOIN matches m ON m.match_id = v.match_id
    WHERE v.user_id = ? AND m.date_msk BETWEEN ? AND ?`).bind(user.id, near(-1), near(1)).all();
  const { results: followed } = await db.prepare(`SELECT p.player_id, p.name_ru, p.fs_id, p.photo_url,
      (SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'head/' || p.fs_id AND status = 'ok') AS head,
      ${PHOTO_HQ('p.fs_id')} AS photo_hq
    FROM follows f JOIN players p ON p.player_id = f.player_id WHERE f.user_id = ? ORDER BY f.created_at LIMIT 30`).bind(user.id).all();
  // Everything the achievements count: the fan's votes with the match result, surface, Winline
  // pre-match prices, the community split, our players and «Больше» broadcasts.
  const { results: voteRows } = await db.prepare(`WITH tally AS (
      SELECT match_id, SUM(pick = 1) AS n1, SUM(pick = 2) AS n2, COUNT(*) AS n FROM votes GROUP BY match_id)
    SELECT v.pick, v.created_at AS voted_at, m.winner, m.start_at, t.surface, o.pre1, o.pre2, tl.n1, tl.n2, tl.n,
      a.player_id AS p1_player, b.player_id AS p2_player,
      EXISTS (SELECT 1 FROM broadcasts br WHERE br.date_msk = m.date_msk AND br.status != 'removed'
        AND ((br.player1_id = a.player_id AND br.player2_id = b.player_id) OR (br.player1_id = b.player_id AND br.player2_id = a.player_id))) AS bolshe
    FROM votes v
    JOIN matches m ON m.match_id = v.match_id
    JOIN tournaments t ON t.tournament_key = m.tournament_key
    LEFT JOIN players a ON a.fs_id = m.p1_fs_id
    LEFT JOIN players b ON b.fs_id = m.p2_fs_id
    LEFT JOIN match_odds o ON o.match_id = v.match_id
    LEFT JOIN tally tl ON tl.match_id = v.match_id
    WHERE v.user_id = ?`).bind(user.id).all();
  const mySet = new Set(followed.map((p) => p.player_id));
  // A day in the app (Moscow date) for «Каждый день с теннисом»; broadcasts opened from the app.
  await db.prepare('INSERT OR IGNORE INTO fan_days (user_id, day) VALUES (?, ?)').bind(user.id, mskDay(Date.now())).run();
  const [{ results: days }, streams, prefs] = await Promise.all([
    db.prepare('SELECT day FROM fan_days WHERE user_id = ? ORDER BY day DESC LIMIT 120').bind(user.id).all(),
    db.prepare("SELECT COUNT(*) AS n FROM fan_events WHERE user_id = ? AND kind = 'vk'").bind(user.id).first(),
    db.prepare('SELECT * FROM fan_prefs WHERE user_id = ?').bind(user.id).first(),
  ]);
  const now = Date.now();
  // The week in numbers: predictions made, accuracy now vs a week ago.
  const weekAgo = new Date(now - 7 * 86400e3).toISOString();
  const before = settled.filter((r) => r.start_at < weekAgo);
  const accuracy = (list) => (list.length ? Math.round((100 * list.filter((r) => r.pick === r.winner).length) / list.length) : null);
  const achievements = fanAchievements(voteRows.map((r) => ({ ...r, mine: mySet.has(r.p1_player) || mySet.has(r.p2_player), bolshe: Boolean(r.bolshe) })), {
    follows: followed.length, bracketPoints: await bracketPointsOf(db, user.id), appDays: days.map((d) => d.day), streams: streams?.n ?? 0,
  });
  const totalXp = xp + achievementsXp(achievements);
  const rating = await ratingPlace(db, user.id);
  const myPlayers = [];
  for (const p of followed) myPlayers.push(playerCard(p, p.fs_id ? await matchesOfPlayer(db, p.fs_id, 8) : [], now));
  return {
    user: { id: user.id, first_name: user.first_name, username: user.username ?? null },
    xp: totalXp,
    xp_predictions: xp,
    xp_achievements: totalXp - xp,
    level: levelFor(totalXp),
    first_level: LEVELS[0].title,
    // The place is the rating of right predictions (rating.js), not XP.
    place: rating.place,
    fans: rating.of,
    rating,
    week: {
      votes: voteRows.filter((r) => r.voted_at && r.voted_at >= weekAgo).length,
      accuracy_now: accuracy(settled),
      accuracy_before: accuracy(before),
    },
    guessed: settled.filter((r) => r.pick === r.winner).length,
    settled: settled.length,
    streak,
    votes_total: voteRows.length,
    picks: Object.fromEntries(picks.map((r) => [r.match_id, r.pick])),
    follows: followed.map((p) => p.player_id),
    my_players: myPlayers,
    achievements,
    prefs: prefs ? {
      public: Boolean(prefs.public), surface: prefs.surface, tours: prefs.tours, since: prefs.since, onboarded_at: prefs.onboarded_at,
      fav_tournaments: JSON.parse(prefs.fav_tournaments ?? '[]'),
    } : null,
    brackets: await myBrackets(db, user.id),
  };
}
