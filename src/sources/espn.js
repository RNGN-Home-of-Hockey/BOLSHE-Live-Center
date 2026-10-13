// ESPN public API: top-150 rankings with headshots (backup source for photos and flags).

import { fetchJson } from '../lib/http.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

export function parseEspnRankings(data) {
  const singles = (data?.rankings ?? [])[0];
  return (singles?.ranks ?? []).map((r) => ({
    espn_id: r.athlete?.id != null ? String(r.athlete.id) : null,
    name: r.athlete?.displayName ?? '',
    rank: r.current ?? null,
    points: r.points ?? null,
    headshot: r.athlete?.headshot?.href ?? null,
    country: r.athlete?.flag?.alt ?? null,
  })).filter((r) => r.espn_id);
}

export async function fetchEspnRankings(tour) {
  return parseEspnRankings(await fetchJson(`${BASE}/${tour.toLowerCase()}/rankings`));
}
