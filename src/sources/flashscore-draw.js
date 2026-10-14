// Flashscore draw of a tournament: /x/feed/dr_<tournamentId>_<stageId> (x-fsign as for the other
// feeds). tournamentId = ZE of the day feed (this year's edition), stageId = ZC (main draw).
// Header record: PA "0_Sabalenka A.|1_|2_Li A.…" (players by draw position, "" = bye or not yet
// known), PID their Flashscore ids, PIC "0_8_World" (country), RN "8_1/32-finals|…|1_Final".
// Then rounds from the first to the final: RI (round id) starts a round; each match record has
// HP/AP (positions), HI/AI ("(1)" seed, "(WC)", "(Q)"…), AA (match id), ES (start, unix s), WI
// (winner's position, -1 = not decided), AC (state: 1 = not started, 3 = finished, …).
// Matches of a round are in draw order: the winners of matches 2k and 2k+1 meet in match k of
// the next round.

import { fetchText } from '../lib/http.js';
import { FLASHSCORE_FSIGN, FLASHSCORE_RU } from './flashscore.js';

const ROUND_RU = {
  '1/128-finals': ['1/128 финала', '1/128'], '1/64-finals': ['1/64 финала', '1/64'], '1/32-finals': ['1/32 финала', '1/32'],
  '1/16-finals': ['1/16 финала', '1/16'], '1/8-finals': ['1/8 финала', '1/8'], 'Quarter-finals': ['Четвертьфинал', 'ЧФ'],
  'Semi-finals': ['Полуфинал', 'ПФ'], Final: ['Финал', 'Финал'],
  // the Russian site (flashscorekz) names rounds this way
  '1/128': ['1/128 финала', '1/128'], '1/64': ['1/64 финала', '1/64'], '1/32': ['1/32 финала', '1/32'], '1/16': ['1/16 финала', '1/16'],
  '1/8': ['1/8 финала', '1/8'], '1/4': ['Четвертьфинал', 'ЧФ'], '1/2': ['Полуфинал', 'ПФ'], Финал: ['Финал', 'Финал'],
};

const fields = (record) => Object.fromEntries(record.split('¬').filter(Boolean).map((f) => {
  const i = f.indexOf('÷');
  return i < 0 ? [f, ''] : [f.slice(0, i), f.slice(i + 1)];
}));

// "0_Sabalenka A.|1_|2_Li A." → Map(position → value)
function byPosition(value) {
  const out = new Map();
  for (const part of String(value ?? '').split('|')) {
    const i = part.indexOf('_');
    if (i > 0) out.set(Number(part.slice(0, i)), part.slice(i + 1));
  }
  return out;
}

const seedOf = (mark) => String(mark ?? '').match(/\((\d+)\)/)?.[1] ?? null;
const tagOf = (mark) => String(mark ?? '').match(/\((WC|Q|LL|PR|SE|ALT)\)/)?.[1] ?? null;

export function parseDrawFeed(text) {
  const records = String(text ?? '').split('¬~').map(fields);
  const head = records.find((r) => 'PA' in r) ?? {};
  const names = byPosition(head.PA);
  const ids = byPosition(head.PID);
  const countries = byPosition(head.PIC);
  const roundNames = byPosition(head.RN);
  const players = [...names.keys()].sort((a, b) => a - b).map((pos) => ({
    pos,
    name: names.get(pos) || null,
    fs_id: ids.get(pos) || null,
    country: (countries.get(pos) ?? '').split('_').slice(1).join('_') || null,
    seed: null,
    tag: null,
  }));
  const playerAt = new Map(players.map((p) => [p.pos, p]));
  const rounds = [];
  for (const r of records) {
    if ('RI' in r) {
      const en = roundNames.get(Number(r.RI)) ?? '';
      const [title, short] = ROUND_RU[en] ?? [en, en];
      rounds.push({ ri: Number(r.RI), title, short, matches: [] });
    }
    if (!('HP' in r) || !rounds.length) continue;
    const real = (pos) => (playerAt.get(pos)?.name ? pos : null);
    const h = real(Number(r.HP));
    const a = real(Number(r.AP));
    for (const [pos, mark] of [[h, r.HI], [a, r.AI]]) {
      const p = playerAt.get(pos);
      if (p && !p.seed) p.seed = seedOf(mark);
      if (p && !p.tag) p.tag = tagOf(mark);
    }
    const w = r.WI != null && Number(r.WI) >= 0 && real(Number(r.WI)) != null ? Number(r.WI) : null;
    // A bye: one real player and nobody on the other side in the first round — decided at once.
    const bye = rounds.length === 1 && (h == null) !== (a == null);
    const status = w != null || bye ? 'done' : !r.AA || r.AC === '1' || r.AC == null ? 'scheduled' : 'live';
    rounds.at(-1).matches.push({
      id: r.AA || null,
      h, a,
      w: w ?? (bye ? (h ?? a) : null),
      start: r.ES ? new Date(Number(r.ES) * 1000).toISOString() : null,
      status,
    });
  }
  return { players, rounds };
}

export async function fetchDraw(tournamentId, stageId) {
  const text = await fetchText(`${FLASHSCORE_RU}/x/feed/dr_${tournamentId}_${stageId}`, {
    headers: { 'x-fsign': FLASHSCORE_FSIGN, referer: `${FLASHSCORE_RU}/` },
  });
  return parseDrawFeed(text);
}
