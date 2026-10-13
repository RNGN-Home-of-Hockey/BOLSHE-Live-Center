// Flashscore feeds (the same source the tennis results bot and RG Fantasy use).
// A feed is text: records split by "~", fields by "¬", key and value by "÷".
// Ranking rows come as PT÷<field>¬PV÷<value> pairs between TS÷RW and TE÷RW.

import { fetchText } from '../lib/http.js';

export const FLASHSCORE_RU = 'https://www.flashscorekz.com';
export const FLASHSCORE_EN = 'https://www.flashscore.com';
// Public constant from Flashscore's own page scripts (also used in TENNIS-Scores_daily_results).
export const FLASHSCORE_FSIGN = 'SW9D1eZo';

// rankingId values read from /tennis/rankings/<name>/ pages on 2026-10-13.
export const RANKINGS = {
  atp_singles: { id: 'dSJr14Y8', tour: 'ATP', discipline: 'singles' },
  wta_singles: { id: 'hfDiar3L', tour: 'WTA', discipline: 'singles' },
  atp_doubles: { id: 'rBfZNIb4', tour: 'ATP', discipline: 'doubles' },
  wta_doubles: { id: 'GYyb7hdF', tour: 'WTA', discipline: 'doubles' },
};

const RANKING_FIELDS = {
  ID: 'row_id',
  PN: 'name',
  PI: 'fs_id',
  CI: 'country_fs_id',
  CN: 'country',
  RA: 'rank',
  RAP: 'prev_rank',
  PO: 'points',
  PU: 'url',
  TP: 'tournaments',
};
const NUMERIC = new Set(['rank', 'prev_rank', 'points', 'tournaments', 'country_fs_id']);

function pairsToObject(chunk) {
  const out = {};
  let key = null;
  for (const field of chunk.split('¬')) {
    if (field.startsWith('PT÷')) key = field.slice(3);
    else if (field.startsWith('PV÷') && key !== null) {
      out[key] = field.slice(3);
      key = null;
    }
  }
  return out;
}

function ddmmyyyyToIso(value) {
  const m = String(value ?? '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parseRankingFeed(text) {
  const body = String(text ?? '');
  const header = pairsToObject(body.match(/TS÷HD¬(.*?)TE÷HD/s)?.[1] ?? '');
  const rows = [];
  for (const match of body.matchAll(/TS÷RW¬(.*?)TE÷RW/gs)) {
    const raw = pairsToObject(match[1]);
    const row = {};
    for (const [code, name] of Object.entries(RANKING_FIELDS)) {
      if (raw[code] === undefined) continue;
      row[name] = NUMERIC.has(name) ? Number(raw[code]) : raw[code];
    }
    if (!row.fs_id) continue;
    const slug = String(row.url ?? '').match(/\/player\/([^/]+)\//)?.[1] ?? '';
    rows.push({ ...row, slug });
  }
  return { title: header.TE ?? '', ranking_date: ddmmyyyyToIso(header.DA), rows };
}

export async function fetchRanking(key, { base = FLASHSCORE_RU } = {}) {
  const ranking = RANKINGS[key];
  if (!ranking) throw new Error(`Unknown ranking ${key}`);
  const text = await fetchText(`${base}/x/feed/ran_${ranking.id}`, {
    headers: { 'x-fsign': FLASHSCORE_FSIGN, referer: `${base}/` },
  });
  return { key, ...ranking, ...parseRankingFeed(text) };
}
