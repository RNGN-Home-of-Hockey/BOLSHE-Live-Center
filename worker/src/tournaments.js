// Tournaments of the «Турниры» tab and the tournament page (singles of the main tour and challengers),
// built from the matches we keep (yesterday…a week ahead and the recent days). A tournament whose
// main draw has not begun yet is listed by its qualifying: stage 'qualifying', the city without "(квалификация)".
//   GET /api/tournaments          every tournament with status now | soon | done, its bracket and highlights count
//   GET /api/tournaments/<key>    one tournament: the summary and all its matches (with our highlights)

import { explainTournament } from '../../src/insights/tournaments.js';
import { listBrackets } from './brackets.js';
import { MATCH_SELECT, shapeMatch } from './matches-sync.js';

const mskToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

const SUMMARY = `SELECT t.tournament_key, t.tournament AS name, t.tour, t.level, t.surface, t.logo,
    MIN(m.date_msk) AS first_day, MAX(m.date_msk) AS last_day, COUNT(*) AS matches,
    SUM(m.status = 'live') AS live, SUM(m.status = 'scheduled') AS left_matches,
    MIN(CASE WHEN m.status = 'scheduled' THEN m.start_at END) AS next_start,
    SUM(EXISTS (SELECT 1 FROM highlights h WHERE h.match_id = m.match_id)) AS highlights
  FROM tournaments t JOIN matches m ON m.tournament_key = t.tournament_key
  WHERE t.discipline = 'singles' AND t.level IN ('tour', 'challenger')`;
const QUAL = /\s*\(?квалификац[^)]*\)?/i;

function shapeTournament(r, bracket, today) {
  const status = bracket?.status === 'finished' || (r.last_day < today && !r.live && !r.left_matches) ? 'done'
    : r.first_day > today && !r.live ? 'soon' : 'now';
  const info = explainTournament({ tour: r.tour, level: r.level, tournament: r.name });
  const qualifying = QUAL.test(r.name ?? '');
  return {
    key: r.tournament_key, name: qualifying ? r.name.replace(QUAL, '').trim() : r.name, stage: qualifying ? 'qualifying' : null,
    tour: r.tour, level: r.level, surface: r.surface, logo: r.logo,
    tier: info.tier, about: info.about, status,
    first_day: r.first_day, last_day: r.last_day, matches: r.matches, live: r.live ?? 0, left: r.left_matches ?? 0,
    next_start: r.next_start, highlights: r.highlights ?? 0,
    starts_at: bracket?.starts_at ?? null, ends_at: bracket?.ends_at ?? null,
    bracket: bracket ? {
      key: bracket.bracket_key, status: bracket.status, round: bracket.round, fans: bracket.fans,
      open_matches: bracket.open_matches, champion: bracket.champion, mine: bracket.mine,
    } : null,
  };
}

export async function listTournaments(env, user) {
  const today = mskToday();
  const [{ results }, brackets] = await Promise.all([
    env.DB.prepare(`${SUMMARY} GROUP BY t.tournament_key`).all(),
    listBrackets(env, user),
  ]);
  const byKey = new Map(brackets.map((b) => [b.tournament_key, b]));
  return results.map((r) => shapeTournament(r, byKey.get(r.tournament_key), today));
}

export async function tournamentView(env, key, user) {
  const r = await env.DB.prepare(`${SUMMARY} AND t.tournament_key = ? GROUP BY t.tournament_key`).bind(key).first();
  if (!r) return null;
  const [brackets, { results }] = await Promise.all([
    listBrackets(env, user),
    env.DB.prepare(`${MATCH_SELECT} WHERE m.tournament_key = ? ORDER BY m.start_at LIMIT 400`).bind(key).all(),
  ]);
  return { tournament: shapeTournament(r, brackets.find((b) => b.tournament_key === key), mskToday()), matches: results.map(shapeMatch) };
}
