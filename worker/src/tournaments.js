// Tournaments of the «Турниры» tab and the tournament page (singles of the main tour and challengers),
// built from the matches we keep (yesterday…a week ahead and the recent days). A tournament whose
// main draw has not begun yet is listed by its qualifying: stage 'qualifying', the city without "(квалификация)".
//   GET /api/tournaments          every tournament with status now | soon | done, its bracket and highlights count
//   GET /api/tournaments/<key>    one tournament: the summary and all its matches (with our highlights)

import { explainTournament } from '../../src/insights/tournaments.js';
import { listBrackets } from './brackets.js';
import { MATCH_SELECT, shapeMatch } from './matches-sync.js';
import { mediaUrl } from '../../src/lib/media.js';

const mskToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();

// ---------- tournament pictures: 5 photos of the tournament's city (Wikimedia Commons) ----------
// tour_photos keeps them by city; tour_visuals gives the spellings of the city (Flashscore writes some
// in Russian, some in Latin) and the stadium photo used while a city has no photos of its own. The app
// shows one at a time and changes it every few hours; the authors are on «Авторы фотографий».
export async function tourVisuals(db) {
  try {
    const [{ results: cities }, { results: photos }] = await Promise.all([
      db.prepare('SELECT * FROM tour_visuals').all(),
      db.prepare('SELECT city, photo_url FROM tour_photos ORDER BY city, n').all().catch(() => ({ results: [] })),
    ]);
    const byCity = new Map();
    for (const ph of photos) byCity.set(ph.city, [...(byCity.get(ph.city) ?? []), ph.photo_url]);
    const byName = new Map();
    for (const v of cities) {
      const urls = byCity.get(v.city) ?? (v.photo_url ? [v.photo_url] : []);
      const visual = { photos: urls.map((u) => mediaUrl(u) ?? u), venue: v.venue ?? null };
      for (const n of [v.city, ...String(v.aliases ?? '').split(',')]) if (n.trim()) byName.set(norm(n), visual);
    }
    return byName;
  } catch {
    return new Map(); // no table yet
  }
}

export const visualOf = (visuals, name) => visuals.get(norm(name)) ?? null;


const SUMMARY = `SELECT t.tournament_key, t.tournament AS name, t.tour, t.level, t.surface, t.logo, t.url, t.prize,
    MIN(m.date_msk) AS first_day, MAX(m.date_msk) AS last_day, COUNT(*) AS matches,
    SUM(m.status = 'live') AS live, SUM(m.status = 'scheduled') AS left_matches,
    MIN(CASE WHEN m.status = 'scheduled' THEN m.start_at END) AS next_start,
    SUM(EXISTS (SELECT 1 FROM highlights h WHERE h.match_id = m.match_id)) AS highlights
  FROM tournaments t JOIN matches m ON m.tournament_key = t.tournament_key
  WHERE t.discipline = 'singles' AND t.level IN ('tour', 'challenger')`;
const QUAL = /\s*\(?квалификац[^)]*\)?/i;

// The last day by the usual length of an event, until the final's own date is known: the final on the
// Sunday of the week for 250/500s and challengers, ~12 days for the 96-player 1000s, two weeks for the Slams.
export function endEstimate(startIso, tier, rounds = null) {
  if (!startIso) return null;
  const d = new Date(Date.parse(startIso));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + (tier === 'slam' ? 13 : rounds >= 7 ? 10 : rounds === 6 ? 5 : 4));
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T12:00:00Z`;
}

function shapeTournament(r, bracket, today) {
  const status = bracket?.status === 'finished' || (r.last_day < today && !r.live && !r.left_matches) ? 'done'
    : r.first_day > today && !r.live ? 'soon' : 'now';
  const info = explainTournament({ tour: r.tour, level: r.level, tournament: r.name });
  const qualifying = QUAL.test(r.name ?? '');
  return {
    key: r.tournament_key, name: qualifying ? r.name.replace(QUAL, '').trim() : r.name, stage: qualifying ? 'qualifying' : null,
    tour: r.tour, level: r.level, surface: r.surface, logo: r.logo, url: r.url ?? null,
    tier: info.tier, about: info.about, status,
    first_day: r.first_day, last_day: r.last_day, matches: r.matches, live: r.live ?? 0, left: r.left_matches ?? 0,
    next_start: r.next_start, highlights: r.highlights ?? 0,
    starts_at: bracket?.starts_at ?? null, ends_at: bracket?.ends_at ?? null, prize: r.prize ?? null,
    ends_est: endEstimate(bracket?.starts_at ?? (r.first_day ? `${r.first_day}T12:00:00Z` : null), info.tier, bracket?.rounds ?? null),
    bracket: bracket ? {
      key: bracket.bracket_key, status: bracket.status, round: bracket.round, rounds: bracket.rounds ?? null, fans: bracket.fans,
      open_matches: bracket.open_matches, champion: bracket.champion, mine: bracket.mine,
    } : null,
  };
}

// The city photos go with every tournament (the home strip, the «Турниры» tab, the tournament page).
const withVisual = (t, visuals) => ({ ...t, visual: visualOf(visuals, t.name) });

export async function listTournaments(env, user) {
  const today = mskToday();
  const [{ results }, brackets, visuals] = await Promise.all([
    env.DB.prepare(`${SUMMARY} GROUP BY t.tournament_key`).all(),
    listBrackets(env, user),
    tourVisuals(env.DB),
  ]);
  const byKey = new Map(brackets.map((b) => [b.tournament_key, b]));
  return results.map((r) => withVisual(shapeTournament(r, byKey.get(r.tournament_key), today), visuals));
}

export async function tournamentView(env, key, user) {
  const r = await env.DB.prepare(`${SUMMARY} AND t.tournament_key = ? GROUP BY t.tournament_key`).bind(key).first();
  if (!r) return null;
  const [brackets, { results }, visuals] = await Promise.all([
    listBrackets(env, user),
    env.DB.prepare(`${MATCH_SELECT} WHERE m.tournament_key = ? ORDER BY m.start_at LIMIT 400`).bind(key).all(),
    tourVisuals(env.DB),
  ]);
  const tournament = withVisual(shapeTournament(r, brackets.find((b) => b.tournament_key === key), mskToday()), visuals);
  return { tournament, matches: results.map(shapeMatch) };
}
