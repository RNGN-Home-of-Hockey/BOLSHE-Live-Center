// Copies «Больше» tennis broadcasts from the schedule sheet into D1.
// Only changed rows are written (row_hash), so a 10-minute cron stays cheap.

import { fetchBroadcasts } from '../../src/sources/schedule.js';
import { mediaUrl } from '../../src/lib/media.js';
import { tokenKey } from '../../src/lib/names.js';

function rowHash(row) {
  const text = JSON.stringify(row);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

async function playerIdByName(db, cache, name) {
  if (!name || name.includes('/')) return null;
  const key = tokenKey(name);
  if (cache.has(key)) return cache.get(key);
  const { results } = await db.prepare('SELECT DISTINCT player_id FROM player_aliases WHERE alias_key = ?').bind(key).all();
  const id = results.length === 1 ? results[0].player_id : null;
  cache.set(key, id);
  return id;
}

export async function syncSchedule(env) {
  const db = env.DB;
  const rows = await fetchBroadcasts(env.SCHEDULE_SHEET_ID, env.SCHEDULE_GID || '548911490');
  const { results: existing } = await db.prepare('SELECT broadcast_key, row_hash, status FROM broadcasts').all();
  const known = new Map(existing.map((r) => [r.broadcast_key, r]));
  const now = new Date().toISOString();
  const cache = new Map();
  const statements = [];
  for (const row of rows) {
    const hash = rowHash(row);
    if (known.get(row.broadcast_key)?.row_hash === hash) continue;
    const p1 = await playerIdByName(db, cache, row.player1_ru);
    const p2 = await playerIdByName(db, cache, row.player2_ru);
    statements.push(db.prepare(`INSERT INTO broadcasts (broadcast_key, sheet_row, date_msk, time_msk, starts_at, tournament, round, note,
        status, player1_ru, player2_ru, player1_id, player2_id, is_doubles, commentator1, commentator2, vk_url, vk_post_id, row_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(broadcast_key) DO UPDATE SET sheet_row = excluded.sheet_row, date_msk = excluded.date_msk, time_msk = excluded.time_msk,
        starts_at = excluded.starts_at, tournament = excluded.tournament, round = excluded.round, note = excluded.note, status = excluded.status,
        player1_ru = excluded.player1_ru, player2_ru = excluded.player2_ru, player1_id = excluded.player1_id, player2_id = excluded.player2_id,
        is_doubles = excluded.is_doubles, commentator1 = excluded.commentator1, commentator2 = excluded.commentator2,
        vk_video = CASE WHEN broadcasts.vk_url IS excluded.vk_url THEN broadcasts.vk_video ELSE NULL END, vk_url = excluded.vk_url,
        vk_post_id = excluded.vk_post_id, row_hash = excluded.row_hash, updated_at = excluded.updated_at`)
      .bind(row.broadcast_key, row.sheet_row, row.date_msk, row.time_msk, row.starts_at, row.tournament, row.round, row.note,
        row.status, row.player1_ru, row.player2_ru, p1, p2, row.is_doubles ? 1 : 0, row.commentator1, row.commentator2,
        row.vk_url, row.vk_post_id, hash, now));
  }
  // A future broadcast that disappeared from the sheet is marked removed (past ones stay as history).
  const seen = new Set(rows.map((r) => r.broadcast_key));
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  for (const r of existing) {
    if (!seen.has(r.broadcast_key) && r.status !== 'removed' && r.broadcast_key.slice(0, 10) >= today) {
      statements.push(db.prepare("UPDATE broadcasts SET status = 'removed', updated_at = ? WHERE broadcast_key = ?").bind(now, r.broadcast_key));
    }
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  return { rows: rows.length, written: statements.length };
}

const STORED = (key) => `(SELECT r2_key || '?v=' || version FROM media WHERE media_key = ${key} AND status = 'ok')`;

// A broadcast carries our stored cover, or else both players' heads (worker/src/media.js).
export async function broadcastsForDate(db, date) {
  const { results } = await db.prepare(`SELECT b.date_msk, b.time_msk, b.starts_at, b.tournament, b.round, b.status, b.is_doubles,
      b.player1_ru, b.player2_ru, b.player1_id, b.player2_id, b.commentator1, b.commentator2, b.vk_url,
      p1.name_ru AS player1_name, p1.singles_rank AS player1_rank, p2.name_ru AS player2_name, p2.singles_rank AS player2_rank,
      ${STORED("'cover/' || b.vk_video")} AS cover,
      ${STORED("'head/' || p1.fs_id")} AS player1_head, p1.photo_url AS player1_photo_src,
      ${STORED("'head/' || p2.fs_id")} AS player2_head, p2.photo_url AS player2_photo_src
    FROM broadcasts b
    LEFT JOIN players p1 ON p1.player_id = b.player1_id
    LEFT JOIN players p2 ON p2.player_id = b.player2_id
    WHERE b.date_msk = ? AND b.status != 'removed'
    ORDER BY b.time_msk`).bind(date).all();
  return results.map(({ cover, player1_head, player1_photo_src, player2_head, player2_photo_src, ...b }) => ({
    ...b,
    cover: mediaUrl(cover),
    player1_photo: mediaUrl(player1_head) ?? player1_photo_src ?? null,
    player2_photo: mediaUrl(player2_head) ?? player2_photo_src ?? null,
  }));
}
