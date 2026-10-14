// Copies Flashscore day feeds into D1 (tournaments, matches). Only changed matches are written.

import { fetchDay } from '../../src/sources/flashscore-matches.js';

const mskDate = (iso) => (iso ? new Date(Date.parse(iso) + 3 * 3600 * 1000).toISOString().slice(0, 10) : null);

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export async function syncMatchDays(env, offsets) {
  const db = env.DB;
  const now = new Date().toISOString();
  let seen = 0;
  let written = 0;
  for (const offset of offsets) {
    const { tournaments, matches } = await fetchDay(offset);
    seen += matches.length;
    const statements = tournaments.map((t) => db.prepare(`INSERT INTO tournaments
        (tournament_key, name, category, tour, level, discipline, surface, tournament, country, url, first_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tournament_key) DO NOTHING`)
      .bind(t.key, t.name, t.category, t.tour, t.level, t.discipline, t.surface, t.tournament, t.country, t.url, now));
    const ids = matches.map((m) => m.match_id);
    const known = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await db.prepare(`SELECT match_id, row_hash FROM matches WHERE match_id IN (${chunk.map(() => '?').join(',')})`)
        .bind(...chunk).all();
      for (const r of results) known.set(r.match_id, r.row_hash);
    }
    for (const m of matches) {
      const rowHash = hash(JSON.stringify(m));
      if (known.get(m.match_id) === rowHash) continue;
      statements.push(db.prepare(`INSERT INTO matches (match_id, tournament_key, start_at, end_at, date_msk, status, live_set, note,
          p1_fs_id, p2_fs_id, p1_name, p2_name, p1_photo, p2_photo, sets_p1, sets_p2, sets_json, winner, is_doubles, row_hash, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET tournament_key = excluded.tournament_key, start_at = excluded.start_at, end_at = excluded.end_at,
          date_msk = excluded.date_msk, status = excluded.status, live_set = excluded.live_set, note = excluded.note,
          p1_fs_id = excluded.p1_fs_id, p2_fs_id = excluded.p2_fs_id, p1_name = excluded.p1_name, p2_name = excluded.p2_name,
          p1_photo = excluded.p1_photo, p2_photo = excluded.p2_photo, sets_p1 = excluded.sets_p1, sets_p2 = excluded.sets_p2,
          sets_json = excluded.sets_json, winner = excluded.winner, is_doubles = excluded.is_doubles,
          row_hash = excluded.row_hash, updated_at = excluded.updated_at`)
        .bind(m.match_id, m.tournament_key, m.start_at, m.end_at, mskDate(m.start_at), m.status, m.live_set, m.note,
          m.p1_fs_id, m.p2_fs_id, m.p1_name, m.p2_name, m.p1_photo, m.p2_photo, m.sets_p1, m.sets_p2,
          JSON.stringify(m.sets), m.winner, m.is_doubles ? 1 : 0, rowHash, now));
      // Players of the base without a photo get the one from the feed.
      for (const [fsId, photo] of [[m.p1_fs_id, m.p1_photo], [m.p2_fs_id, m.p2_photo]]) {
        if (fsId && photo && !fsId.includes('/')) {
          statements.push(db.prepare('UPDATE players SET photo_url = ? WHERE fs_id = ? AND photo_url IS NULL').bind(photo, fsId));
        }
      }
      written += 1;
    }
    for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  }
  return { offsets, seen, written };
}

const PLAYER_COLS = (alias) => ['player_id', 'name_ru', 'name_ru_short', 'singles_rank', 'doubles_rank', 'photo_url', 'is_russian', 'country_code']
  .map((c) => `${alias}.${c} AS ${alias}_${c}`).join(', ');

export const MATCH_SELECT = `SELECT m.*, t.name AS tournament_name, t.tournament, t.tour, t.level, t.discipline, t.surface, t.country AS tournament_country,
    ${PLAYER_COLS('a')}, ${PLAYER_COLS('b')},
    (SELECT json_object('commentator1', br.commentator1, 'commentator2', br.commentator2, 'vk_url', br.vk_url, 'time_msk', br.time_msk)
       FROM broadcasts br
      WHERE br.date_msk = m.date_msk AND br.status != 'removed'
        AND ((br.player1_id = a.player_id AND br.player2_id = b.player_id) OR (br.player1_id = b.player_id AND br.player2_id = a.player_id))
      LIMIT 1) AS bolshe
  FROM matches m
  JOIN tournaments t ON t.tournament_key = m.tournament_key
  LEFT JOIN players a ON a.fs_id = m.p1_fs_id
  LEFT JOIN players b ON b.fs_id = m.p2_fs_id`;

function side(row, alias, n) {
  return {
    fs_id: row[`p${n}_fs_id`],
    player_id: row[`${alias}_player_id`] ?? null,
    name: row[`${alias}_name_ru`] ?? row[`p${n}_name`],
    short: row[`${alias}_name_ru_short`] ?? row[`p${n}_name`],
    rank: row[`${alias}_singles_rank`] ?? null,
    doubles_rank: row[`${alias}_doubles_rank`] ?? null,
    photo: row[`${alias}_photo_url`] ?? row[`p${n}_photo`] ?? null,
    is_russian: Boolean(row[`${alias}_is_russian`]),
    country: row[`${alias}_country_code`] ?? null,
  };
}

export function shapeMatch(row) {
  return {
    match_id: row.match_id,
    start_at: row.start_at,
    date_msk: row.date_msk,
    status: row.status,
    live_set: row.live_set,
    note: row.note,
    sets_p1: row.sets_p1,
    sets_p2: row.sets_p2,
    sets: JSON.parse(row.sets_json || '[]'),
    winner: row.winner,
    is_doubles: Boolean(row.is_doubles),
    tournament: {
      key: row.tournament_key, name: row.tournament, full_name: row.tournament_name, tour: row.tour,
      level: row.level, discipline: row.discipline, surface: row.surface, country: row.tournament_country,
    },
    p1: side(row, 'a', 1),
    p2: side(row, 'b', 2),
    bolshe: row.bolshe ? JSON.parse(row.bolshe) : null,
  };
}

const STATUS_ORDER = "CASE m.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END";

// A busy day has 500+ matches (mostly ITF): the limit must stay above that, or early finished
// matches fall off the end of the list.
export async function matchesForDate(db, date, { level = null, tour = null, russian = false, bolshe = false, limit = 3000 } = {}) {
  const where = ['m.date_msk = ?'];
  const args = [date];
  if (level) { where.push('t.level = ?'); args.push(level); }
  if (tour) { where.push('t.tour = ?'); args.push(tour); }
  if (russian) where.push('(a.is_russian = 1 OR b.is_russian = 1)');
  const { results } = await db.prepare(`${MATCH_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY ${STATUS_ORDER}, m.start_at LIMIT ?`).bind(...args, limit).all();
  const shaped = results.map(shapeMatch);
  return bolshe ? shaped.filter((m) => m.bolshe) : shaped;
}

export async function matchesOfPlayer(db, fsId, limit = 30) {
  const { results } = await db.prepare(`${MATCH_SELECT} WHERE m.p1_fs_id = ? OR m.p2_fs_id = ?
    ORDER BY m.start_at DESC LIMIT ?`).bind(fsId, fsId, limit).all();
  return results.map(shapeMatch);
}

export async function matchById(db, matchId) {
  const row = await db.prepare(`${MATCH_SELECT} WHERE m.match_id = ?`).bind(matchId).first();
  return row ? shapeMatch(row) : null;
}
