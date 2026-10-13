// Match card: the match, both players, «Больше» broadcast and the «для чайников» preview.
// Head-to-head/form comes from the Flashscore H2H feed, cached in D1 (finished matches forever,
// others for 6 hours) and trimmed to the sections the preview needs.

import { buildPreview, lastFor } from '../../src/insights/preview.js';
import { fetchH2H } from '../../src/sources/flashscore-matches.js';
import { matchById } from './matches-sync.js';

const H2H_TTL_MS = 6 * 3600 * 1000;
const KEEP_SECTIONS = new Set(['Все покрытия', 'Хард', 'Грунт', 'Трава']);
const KEEP_LAST = 15;

async function cachedH2H(env, match) {
  const row = await env.DB.prepare("SELECT fetched_at, json FROM match_details WHERE match_id = ? AND kind = 'h2h'")
    .bind(match.match_id).first();
  const finished = ['finished', 'retired', 'walkover', 'cancelled'].includes(match.status);
  if (row && (finished || Date.now() - Date.parse(row.fetched_at) < H2H_TTL_MS)) return JSON.parse(row.json);
  const blocks = (await fetchH2H(match.match_id))
    .filter((b) => KEEP_SECTIONS.has(b.surface))
    .map((b) => ({ ...b, matches: b.matches.slice(0, b.kind === 'h2h' ? 20 : KEEP_LAST) }));
  await env.DB.prepare(`INSERT INTO match_details (match_id, kind, fetched_at, json) VALUES (?, 'h2h', ?, ?)
    ON CONFLICT(match_id, kind) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json`)
    .bind(match.match_id, new Date().toISOString(), JSON.stringify(blocks)).run();
  return blocks;
}

async function playerRow(db, playerId) {
  if (!playerId) return null;
  return db.prepare(`SELECT player_id, name_ru, singles_rank, elo, elo_hard, elo_clay, elo_grass, birth_date
    FROM players WHERE player_id = ?`).bind(playerId).first();
}

export async function matchCard(env, matchId) {
  const match = await matchById(env.DB, matchId);
  if (!match) return null;
  let h2h = [];
  let h2hError = null;
  if (!match.is_doubles) {
    try {
      h2h = await cachedH2H(env, match);
    } catch (error) {
      h2hError = String(error?.message ?? error);
    }
  }
  const [p1, p2] = await Promise.all([playerRow(env.DB, match.p1.player_id), playerRow(env.DB, match.p2.player_id)]);
  const preview = match.is_doubles ? { chance: null, favorite: null, lines: [] } : buildPreview({
    match: { ...match, p1_fs_id: match.p1.fs_id, p2_fs_id: match.p2.fs_id, p1_name: match.p1.name, p2_name: match.p2.name, surface: match.tournament.surface },
    p1,
    p2,
    h2h,
  });
  const meetings = h2h.find((b) => b.surface === 'Все покрытия' && b.kind === 'h2h')?.matches ?? [];
  const allSurfaces = { last: h2h.filter((b) => b.surface === 'Все покрытия' && b.kind === 'last') };
  const lastOf = (fsId) => lastFor(allSurfaces, fsId).filter((m) => m.match_id !== match.match_id).slice(0, 5);
  return {
    match,
    preview,
    meetings: meetings.filter((m) => m.match_id !== match.match_id).slice(0, 5),
    last: { p1: lastOf(match.p1.fs_id), p2: lastOf(match.p2.fs_id) },
    h2h_error: h2hError,
  };
}
