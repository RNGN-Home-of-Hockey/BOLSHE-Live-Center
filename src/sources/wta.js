// Official WTA rankings API (api.wtatennis.com): every ranked singles player,
// with WTA id, date of birth and IOC country code.

import { fetchJson } from '../lib/http.js';

const BASE = 'https://api.wtatennis.com/tennis/players/ranked';
const PAGE_SIZE = 100;
const MAX_PAGES = 40;

export function normalizeWtaRow(row) {
  const p = row?.player ?? {};
  return {
    wta_id: p.id != null ? String(p.id) : null,
    first_name: p.firstName ?? '',
    last_name: p.lastName ?? '',
    full_name: p.fullName ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
    country_code: p.countryCode || null,
    birth_date: p.dateOfBirth || null,
    rank: row?.ranking ?? null,
    points: row?.points ?? null,
    tournaments: row?.tournamentsPlayed ?? null,
    movement: row?.movement ?? null,
    ranked_at: row?.rankedAt ? String(row.rankedAt).slice(0, 10) : null,
  };
}

export async function fetchWtaSinglesRanking() {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${BASE}?page=${page}&pageSize=${PAGE_SIZE}&type=rankSingles&sort=asc&metric=SINGLES`;
    const data = await fetchJson(url);
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data.map(normalizeWtaRow));
  }
  return rows;
}
