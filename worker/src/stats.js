// Player statistics on the Worker: match statistics of finished singles matches (tour and
// challengers) are fetched from Flashscore every 10 minutes, the 52-week summary and the 0–10
// scores are rebuilt every hour.
//   GET /api/stats?tour=ATP&sort=aces_pm&limit=100   players sorted by any metric (src/game/insights.js)
// The player page gets the same numbers from playerInsights().

import { MIN_MATCHES, STAT_FIELDS, playerMetrics, scoreTour } from '../../src/game/insights.js';
import { mediaUrl } from '../../src/lib/media.js';
import { STAT_COLUMNS, fetchMatchStats, statsRows } from '../../src/sources/flashscore-stats.js';

const mskDate = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const SUM_COLUMNS = STAT_COLUMNS.slice(9);

export function insertStatsRow(db, row) {
  return db.prepare(`INSERT OR REPLACE INTO player_match_stats (${STAT_COLUMNS.join(', ')}) VALUES (${STAT_COLUMNS.map(() => '?').join(', ')})`)
    .bind(...STAT_COLUMNS.map((c) => row[c] ?? (c === 'tb_won' || c === 'tb_total' || c === 'deciding' ? 0 : null)));
}

export async function syncMatchStats(env, { limit = 25 } = {}) {
  const db = env.DB;
  const now = Date.now();
  const { results } = await db.prepare(`SELECT m.match_id, m.start_at, m.p1_fs_id, m.p2_fs_id, m.winner, m.sets_p1, m.sets_p2, t.surface
    FROM matches m JOIN tournaments t ON t.tournament_key = m.tournament_key
    LEFT JOIN match_stats_status s ON s.match_id = m.match_id
    WHERE m.date_msk BETWEEN ? AND ? AND m.status IN ('finished', 'retired') AND m.winner IS NOT NULL AND m.is_doubles = 0
      AND t.level IN ('tour', 'challenger') AND t.discipline = 'singles'
      AND (s.match_id IS NULL OR (s.status = 'none' AND s.tries < 3 AND s.checked_at < ?))
    ORDER BY t.level = 'tour' DESC, m.start_at DESC LIMIT ?`)
    .bind(mskDate(now - 3 * 86400e3), mskDate(now), new Date(now - 6 * 3600e3).toISOString(), limit).all();
  let stored = 0;
  let none = 0;
  for (const m of results) {
    let rows = [];
    try {
      rows = statsRows({
        match_id: m.match_id, played_at: m.start_at, surface: m.surface, home_fs: m.p1_fs_id, away_fs: m.p2_fs_id,
        winner: m.winner, sets_home: m.sets_p1, sets_away: m.sets_p2,
      }, await fetchMatchStats(m.match_id));
    } catch (error) {
      console.error('match stats failed', m.match_id, error?.message ?? error);
    }
    const statements = rows.map((r) => insertStatsRow(db, r));
    statements.push(db.prepare(`INSERT INTO match_stats_status (match_id, status, tries, checked_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(match_id) DO UPDATE SET status = excluded.status, tries = match_stats_status.tries + 1, checked_at = excluded.checked_at`)
      .bind(m.match_id, rows.length ? 'ok' : 'none', new Date().toISOString()));
    await db.batch(statements);
    if (rows.length) stored += 1; else none += 1;
  }
  return { checked: results.length, stored, none };
}

// The 52-week summary of every player of our base, scored within the tour.
export async function refreshPlayerStats(env) {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT s.fs_id, p.tour, MIN(p.singles_rank) AS rank, COUNT(*) AS matches, SUM(s.won) AS wins,
      SUM(CASE WHEN s.first_total IS NOT NULL AND s.sv_pts_total IS NOT NULL THEN s.first_total END) AS first_in_num,
      SUM(CASE WHEN s.first_total IS NOT NULL AND s.sv_pts_total IS NOT NULL THEN s.sv_pts_total END) AS first_in_den,
      SUM(s.deciding) AS deciding_played, SUM(CASE WHEN s.deciding = 1 AND s.won = 1 THEN 1 ELSE 0 END) AS deciding_won,
      ${SUM_COLUMNS.map((c) => `SUM(s.${c}) AS ${c}`).join(', ')}
    FROM player_match_stats s JOIN players p ON p.fs_id = s.fs_id
    WHERE s.played_at >= datetime('now', '-365 days')
    GROUP BY s.fs_id, p.tour`).all();
  const now = new Date().toISOString();
  const statements = [];
  for (const tour of ['ATP', 'WTA']) {
    const rows = results.filter((r) => r.tour === tour).map((r) => ({ fs_id: r.fs_id, rank: r.rank, metrics: playerMetrics(r) }));
    const scores = scoreTour(rows);
    for (const r of rows) {
      statements.push(db.prepare(`INSERT INTO player_stats (fs_id, tour, matches, metrics_json, scores_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(fs_id) DO UPDATE SET tour = excluded.tour, matches = excluded.matches, metrics_json = excluded.metrics_json,
          scores_json = excluded.scores_json, updated_at = excluded.updated_at`)
        .bind(r.fs_id, tour, r.metrics.matches, JSON.stringify(r.metrics), JSON.stringify(scores.get(r.fs_id) ?? {}), now));
    }
  }
  for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
  return { players: statements.length };
}

const FIELD = new Map(STAT_FIELDS.map((f) => [f.key, f]));

// Only the top of the ranking by default: lower players mostly play challengers and ITF, where
// numbers against weaker opponents are not comparable with the main tour.
export async function statsList(env, { tour = 'ATP', sort = 'serve_rating', limit = 100, top = 100 } = {}) {
  const field = FIELD.get(sort) ?? FIELD.get('serve_rating');
  const { results } = await env.DB.prepare(`SELECT s.fs_id, s.matches, s.metrics_json, s.scores_json, p.player_id, p.name_ru, p.singles_rank,
      p.photo_url, p.is_russian, (SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'head/' || p.fs_id AND status = 'ok') AS head
    FROM player_stats s JOIN players p ON p.fs_id = s.fs_id
    WHERE s.tour = ? AND s.matches >= ? AND p.singles_rank IS NOT NULL AND p.singles_rank <= ?`).bind(tour === 'WTA' ? 'WTA' : 'ATP', MIN_MATCHES, Math.min(Number(top) || 100, 500)).all();
  const rows = results.map((r) => {
    const metrics = JSON.parse(r.metrics_json);
    const scores = JSON.parse(r.scores_json);
    return {
      player_id: r.player_id, name: r.name_ru, rank: r.singles_rank, is_russian: Boolean(r.is_russian),
      photo: mediaUrl(r.head) ?? r.photo_url ?? null, matches: r.matches, wins: metrics.wins, losses: metrics.losses,
      value: metrics[field.key], score: scores[field.key] ?? null,
    };
  }).filter((r) => r.value != null);
  rows.sort((a, b) => (field.low ? a.value - b.value : b.value - a.value));
  return { tour, sort: field.key, field, fields: STAT_FIELDS, min_matches: MIN_MATCHES, top: Number(top) || 100, players: rows.slice(0, Math.min(Number(limit) || 100, 300)) };
}

// Numbers for the player page: every metric, its 0–10 score, and the Elo score within the tour.
export async function playerInsights(env, player) {
  if (!player?.fs_id) return null;
  const row = await env.DB.prepare('SELECT matches, metrics_json, scores_json, updated_at FROM player_stats WHERE fs_id = ?').bind(player.fs_id).first();
  let elo = null;
  if (player.elo) {
    const r = await env.DB.prepare(`SELECT SUM(elo < ?) AS below, COUNT(*) AS n FROM players WHERE tour = ? AND elo IS NOT NULL AND singles_rank IS NOT NULL AND singles_rank <= 300`)
      .bind(player.elo, player.tour).first();
    if (r?.n) elo = Math.round((10 * r.below) / r.n * 10) / 10;
  }
  return {
    matches: row?.matches ?? 0,
    min_matches: MIN_MATCHES,
    metrics: row ? JSON.parse(row.metrics_json) : null,
    scores: row ? JSON.parse(row.scores_json) : {},
    elo_score: elo,
    fields: STAT_FIELDS,
    updated_at: row?.updated_at ?? null,
  };
}
