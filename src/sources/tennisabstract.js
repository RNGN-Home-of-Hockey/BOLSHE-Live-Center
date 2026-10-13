// Tennis Abstract Elo leaderboards (weekly). robots.txt of tennisabstract.com
// disallows /jsmatches/, /jsplayers/ and /jsfrags/ — we only read the /reports/ pages.
// Elo answers "who is likely to win" in plain words: +100 Elo = 64% in best of three.

import { fetchText } from '../lib/http.js';

export const ELO_PAGES = {
  ATP: 'https://www.tennisabstract.com/reports/atp_elo_ratings.html',
  WTA: 'https://www.tennisabstract.com/reports/wta_elo_ratings.html',
};

function cellText(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(text) {
  const n = Number(String(text ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && String(text ?? '').trim() !== '' ? n : null;
}

export function parseEloPage(html) {
  const page = String(html ?? '');
  const updated = page.match(/Last update:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const table = page.match(/<table[^>]*id="reportable"[^>]*>([\s\S]*?)<\/table>/)?.[1] ?? '';
  const headers = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => cellText(m[1]).toLowerCase());
  const col = (name) => headers.indexOf(name);
  const rows = [];
  for (const tr of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const playerCell = cells[col('player')] ?? '';
    const taId = playerCell.match(/player\.cgi\?p=([^"&]+)/)?.[1] ?? null;
    rows.push({
      ta_id: taId ? decodeURIComponent(taId) : null,
      name: cellText(playerCell),
      elo_rank: toNumber(cellText(cells[col('elo rank')])),
      age: toNumber(cellText(cells[col('age')])),
      elo: toNumber(cellText(cells[col('elo')])),
      elo_hard: toNumber(cellText(cells[col('helo')])),
      elo_clay: toNumber(cellText(cells[col('celo')])),
      elo_grass: toNumber(cellText(cells[col('gelo')])),
    });
  }
  return { updated, rows: rows.filter((r) => r.name && r.elo != null) };
}

export async function fetchEloRatings(tour) {
  return parseEloPage(await fetchText(ELO_PAGES[tour]));
}
