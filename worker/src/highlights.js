// Highlights and «Больше» broadcasts of a player.
//   POST /api/highlights/push        header x-push-token = HL_PUSH_TOKEN; {items: [...]} from the Moscow server
//                                    (ops/hl-push/bolshe_hl_push.py reads the tennis desk's finished jobs)
//   GET  /api/players/<id>/media     the player's highlights and «Больше» broadcasts (covers, VK links), newest first
// Video files are never stored here: urls are /hl/<key>/<file> on the no-VPN door (Caddy serves them read-only).

import { mediaUrl } from '../../src/lib/media.js';

const KEY_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4})_([a-z0-9-]+)_([a-z0-9-]+)$/;
const KIND_RE = /^(review|top\d|set\d{1,2})$/;
const fileOk = (key, url) => typeof url === 'string' && url.startsWith(`/hl/${key}/`) && /^[\w./-]+$/.test(url) && !url.includes('..');

// One pushed job → a row, or null when something does not look right.
export function cleanItem(item) {
  const m = String(item?.key ?? '').match(KEY_RE);
  if (!m) return null;
  const key = m[0];
  const files = (Array.isArray(item.files) ? item.files : [])
    .filter((f) => KIND_RE.test(String(f?.kind ?? '')) && fileOk(key, f.url))
    .map((f) => ({ kind: f.kind, url: f.url, secs: Math.round(Number(f.secs) || 0), mb: Math.round((Number(f.mb) || 0) * 10) / 10 }));
  if (!files.length) return null;
  const summaries = item.summaries && typeof item.summaries === 'object'
    ? Object.fromEntries(Object.entries(item.summaries).filter(([k, v]) => /^\d{1,2}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 300)]))
    : null;
  return {
    match_key: key,
    match_id: /^[A-Za-z0-9]{6,12}$/.test(String(item.match_id ?? '')) ? item.match_id : null,
    date_msk: m[1],
    player1_id: m[3],
    player2_id: m[4],
    vk_url: /^https:\/\/(vk\.com|vkvideo\.ru)\/video-?\d+_\d+/.test(String(item.vk ?? '')) ? item.vk : null,
    cover: fileOk(key, item.cover) ? item.cover : null,
    files,
    summaries,
    done: files.some((f) => f.kind === 'review') ? 1 : 0,
    finished_at: typeof item.finished === 'string' ? item.finished.slice(0, 40) : null,
  };
}

export async function pushHighlights(env, request) {
  if (!env.HL_PUSH_TOKEN || request.headers.get('x-push-token') !== env.HL_PUSH_TOKEN) return { ok: false, status: 401, error: 'bad token' };
  const body = await request.json().catch(() => ({}));
  const rows = (Array.isArray(body.items) ? body.items.slice(0, 500) : []).map(cleanItem).filter(Boolean);
  const now = new Date().toISOString();
  const statements = rows.map((r) => env.DB.prepare(`INSERT INTO highlights (match_key, match_id, date_msk, player1_id, player2_id, vk_url, cover,
      files_json, summaries_json, done, finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_key) DO UPDATE SET match_id = COALESCE(excluded.match_id, highlights.match_id), vk_url = COALESCE(excluded.vk_url, highlights.vk_url),
      cover = COALESCE(excluded.cover, highlights.cover), files_json = excluded.files_json, summaries_json = excluded.summaries_json,
      done = excluded.done, finished_at = excluded.finished_at, updated_at = excluded.updated_at`)
    .bind(r.match_key, r.match_id, r.date_msk, r.player1_id, r.player2_id, r.vk_url, r.cover, JSON.stringify(r.files),
      r.summaries ? JSON.stringify(r.summaries) : null, r.done, r.finished_at, now));
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
  return { ok: true, saved: rows.length, skipped: (body.items?.length ?? 0) - rows.length };
}

const shapeHighlight = (h) => (h ? {
  key: h.match_key, match_id: h.match_id, date: h.date_msk, cover: h.cover, vk_url: h.vk_url, done: Boolean(h.done),
  files: JSON.parse(h.files_json || '[]'), summaries: h.summaries_json ? JSON.parse(h.summaries_json) : null,
} : null);

// The player's broadcasts on «Больше» (newest first) with the cover, the VK link, the match and the highlights.
export async function playerMedia(env, playerId) {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT b.date_msk, b.time_msk, b.starts_at, b.tournament, b.round, b.vk_url, b.player1_id, b.player2_id,
      b.commentator1, b.commentator2, p1.name_ru AS p1_name, p2.name_ru AS p2_name,
      (SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'cover/' || b.vk_video AND status = 'ok') AS cover,
      (SELECT m.match_id FROM matches m WHERE m.date_msk = b.date_msk
        AND ((m.p1_fs_id = p1.fs_id AND m.p2_fs_id = p2.fs_id) OR (m.p1_fs_id = p2.fs_id AND m.p2_fs_id = p1.fs_id)) LIMIT 1) AS match_id,
      (SELECT h.match_key FROM highlights h WHERE h.date_msk = b.date_msk
        AND ((h.player1_id = b.player1_id AND h.player2_id = b.player2_id) OR (h.player1_id = b.player2_id AND h.player2_id = b.player1_id)) LIMIT 1) AS hl_key
    FROM broadcasts b
    LEFT JOIN players p1 ON p1.player_id = b.player1_id
    LEFT JOIN players p2 ON p2.player_id = b.player2_id
    WHERE (b.player1_id = ?1 OR b.player2_id = ?1) AND b.status NOT IN ('removed', 'cancelled') AND b.date_msk <= date('now', '+1 day')
    ORDER BY b.date_msk DESC, b.time_msk DESC LIMIT 80`).bind(playerId).all();
  const { results: hl } = await db.prepare(`SELECT * FROM highlights WHERE player1_id = ?1 OR player2_id = ?1 ORDER BY date_msk DESC LIMIT 80`)
    .bind(playerId).all();
  const byKey = new Map(hl.map((h) => [h.match_key, shapeHighlight(h)]));
  return {
    highlights: hl.map(shapeHighlight),
    broadcasts: results.map((b) => ({
      date: b.date_msk, time: b.time_msk, starts_at: b.starts_at, tournament: b.tournament, round: b.round,
      opponent: b.player1_id === playerId ? b.p2_name : b.p1_name, vk_url: b.vk_url, cover: mediaUrl(b.cover),
      commentators: [b.commentator1, b.commentator2].filter(Boolean), match_id: b.match_id, highlights: b.hl_key ? byKey.get(b.hl_key) ?? null : null,
    })),
  };
}
