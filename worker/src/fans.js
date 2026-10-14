// Fans in the Mini App: sign-in by Telegram initData, "Кто выиграет?" votes (open until the
// match starts), «Мои игроки», and the rating card (level, XP, place, guessed, streak).
//   GET  /api/me?date=YYYY-MM-DD   header X-Telegram-Init-Data
//   POST /api/votes   {match_id, pick: 1|2}
//   POST /api/follows {player_id, on: true|false}

import { fanAchievements } from '../../src/game/achievements.js';
import { LEVELS, XP_RULES, levelFor } from '../../src/game/levels.js';
import { mediaUrl } from '../../src/lib/media.js';
import { verifyInitData } from '../../src/lib/telegram-auth.js';
import { matchesOfPlayer } from './matches-sync.js';

export async function authUser(env, request) {
  const user = await verifyInitData(request.headers.get('x-telegram-init-data'), env.TELEGRAM_BOT_TOKEN);
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

export async function setFollow(env, user, playerId, on) {
  const player = await env.DB.prepare('SELECT player_id FROM players WHERE player_id = ?').bind(String(playerId ?? '')).first();
  if (!player) return { ok: false, status: 404, error: 'player not found' };
  if (on) {
    await env.DB.prepare('INSERT OR IGNORE INTO follows (user_id, player_id, created_at) VALUES (?, ?, ?)')
      .bind(user.id, player.player_id, new Date().toISOString()).run();
  } else {
    await env.DB.prepare('DELETE FROM follows WHERE user_id = ? AND player_id = ?').bind(user.id, player.player_id).run();
  }
  return { ok: true, follows: await followIds(env.DB, user.id) };
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
  const { results: settled } = await db.prepare(`SELECT v.pick, m.winner FROM votes v JOIN matches m ON m.match_id = v.match_id
    WHERE v.user_id = ? AND m.winner IS NOT NULL ORDER BY m.start_at DESC`).bind(user.id).all();
  let streak = 0;
  while (streak < settled.length && settled[streak].pick === settled[streak].winner) streak += 1;
  const day = Date.parse(`${date}T12:00:00Z`);
  const near = (offset) => new Date(day + offset * 86400e3).toISOString().slice(0, 10);
  const { results: picks } = await db.prepare(`SELECT v.match_id, v.pick FROM votes v JOIN matches m ON m.match_id = v.match_id
    WHERE v.user_id = ? AND m.date_msk BETWEEN ? AND ?`).bind(user.id, near(-1), near(1)).all();
  const { results: followed } = await db.prepare(`SELECT p.player_id, p.name_ru, p.fs_id, p.photo_url,
      (SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'head/' || p.fs_id AND status = 'ok') AS head
    FROM follows f JOIN players p ON p.player_id = f.player_id WHERE f.user_id = ? ORDER BY f.created_at LIMIT 30`).bind(user.id).all();
  // Everything the achievements count: the fan's votes with the match result, surface, Winline
  // pre-match prices, the community split, our players and «Больше» broadcasts.
  const { results: voteRows } = await db.prepare(`WITH tally AS (
      SELECT match_id, SUM(pick = 1) AS n1, SUM(pick = 2) AS n2, COUNT(*) AS n FROM votes GROUP BY match_id)
    SELECT v.pick, v.created_at AS voted_at, m.winner, m.start_at, t.surface, o.pre1, o.pre2, tl.n1, tl.n2, tl.n,
      (COALESCE(a.is_russian, 0) = 1 OR COALESCE(b.is_russian, 0) = 1) AS ours,
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
  const now = Date.now();
  const myPlayers = [];
  for (const p of followed) myPlayers.push(playerCard(p, p.fs_id ? await matchesOfPlayer(db, p.fs_id, 8) : [], now));
  return {
    user: { id: user.id, first_name: user.first_name },
    xp,
    level: levelFor(xp),
    first_level: LEVELS[0].title,
    place: meRow ? 1 + table.filter((r) => r.xp > xp).length : null,
    fans: table.length,
    guessed: settled.filter((r) => r.pick === r.winner).length,
    settled: settled.length,
    streak,
    picks: Object.fromEntries(picks.map((r) => [r.match_id, r.pick])),
    follows: followed.map((p) => p.player_id),
    my_players: myPlayers,
    achievements: fanAchievements(voteRows.map((r) => ({ ...r, ours: Boolean(r.ours), bolshe: Boolean(r.bolshe) })), {
      follows: followed.length, bracketPoints: await bracketPointsOf(db, user.id),
    }),
  };
}
