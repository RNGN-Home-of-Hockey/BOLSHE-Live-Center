// Flashscore match statistics: /x/feed/df_st_1_<matchId> (x-fsign as for the other feeds).
// Sections SE ("Match", "Set 1", …) → groups SF → rows SG name, SH home value, SI away value:
//   "Aces" 2 · "1st serve points won" 67% (44/66) · "Break Points Saved" 13/17 · "Service games won" 75% (12/16)…
// We keep counts (not percentages) so that a player's numbers add up over many matches.

import { fetchText } from '../lib/http.js';
import { FLASHSCORE_EN, FLASHSCORE_FSIGN } from './flashscore.js';

const fields = (record) => Object.fromEntries(record.split('¬').filter(Boolean).map((f) => {
  const i = f.indexOf('÷');
  return i < 0 ? [f, ''] : [f.slice(0, i), f.slice(i + 1)];
}));

// "67% (44/66)" or "13/17" → [44, 66]; "2" → [2, null]
function parseValue(v) {
  const frac = String(v ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) return [Number(frac[1]), Number(frac[2])];
  const n = String(v ?? '').match(/^-?\d+/);
  return n ? [Number(n[0]), null] : [null, null];
}

// Our name for every row we keep: [key, takes a fraction (won/total)?]
const ROWS = {
  Aces: ['aces', false],
  'Double Faults': ['df', false],
  '1st serve points won': ['first', true],
  '2nd serve points won': ['second', true],
  'Break Points Saved': ['bp_saved', true],
  '1st return points won': ['ret1', true],
  '2nd return points won': ['ret2', true],
  'Break Points Converted': ['bp_conv', true],
  Winners: ['winners', false],
  'Unforced errors': ['ue', false],
  'Net points won': ['net', true],
  'Service Points Won': ['sv_pts', true],
  'Return Points Won': ['rt_pts', true],
  'Total Points Won': ['tot_pts', true],
  'Service games won': ['sv_games', true],
  'Return games won': ['rt_games', true],
  'Total games won': ['games', true],
};

// {match: {home, away}, sets: [{home, away}]} where a side is {aces, df, first_won, first_total, …}
export function parseMatchStats(text) {
  const out = { match: { home: {}, away: {} }, sets: [] };
  let section = null;
  for (const record of String(text ?? '').split('¬~')) {
    const f = fields(record);
    if (f.SE !== undefined) {
      if (/^Match$/i.test(f.SE)) section = out.match;
      else if (/^Set \d+/i.test(f.SE)) { section = { home: {}, away: {} }; out.sets.push(section); } else section = null;
      continue;
    }
    if (!section || f.SG === undefined) continue;
    const row = ROWS[f.SG];
    if (!row) continue;
    const [key, frac] = row;
    for (const [side, raw] of [['home', f.SH], ['away', f.SI]]) {
      const [a, b] = parseValue(raw);
      if (frac) { section[side][`${key}_won`] = a; section[side][`${key}_total`] = b; } else section[side][key] = a;
    }
  }
  return out;
}

// Tie-breaks of a match. Flashscore counts a 7:6 set as 6 games each (the tie-break is not a game),
// so a 6:6 set went to a tie-break; who won them follows from the sets each player won:
// tie-breaks won = sets won − sets won outright.
export function tiebreakCounts(sets, setsHome, setsAway) {
  let total = 0;
  let clearHome = 0;
  let clearAway = 0;
  for (const s of sets) {
    const won = s.home.games_won;
    const all = s.home.games_total;
    if (won == null || all == null) continue;
    if (all === 12 && won === 6) total += 1;
    else if (won > all - won) clearHome += 1;
    else clearAway += 1;
  }
  const home = Math.max(0, Math.min(total, (setsHome ?? 0) - clearHome));
  const away = Math.max(0, Math.min(total - home, (setsAway ?? 0) - clearAway));
  return { total, home, away };
}

// Columns of player_match_stats (migrations/0009) in insert order.
export const STAT_COLUMNS = ['match_id', 'fs_id', 'opp_fs_id', 'played_at', 'surface', 'won', 'sets_won', 'sets_lost', 'deciding',
  'aces', 'df', 'first_won', 'first_total', 'second_won', 'second_total', 'bp_saved_won', 'bp_saved_total',
  'ret1_won', 'ret1_total', 'ret2_won', 'ret2_total', 'bp_conv_won', 'bp_conv_total', 'winners', 'ue', 'net_won', 'net_total',
  'sv_pts_won', 'sv_pts_total', 'rt_pts_won', 'rt_pts_total', 'tot_pts_won', 'tot_pts_total',
  'sv_games_won', 'sv_games_total', 'rt_games_won', 'rt_games_total', 'tb_won', 'tb_total'];

// Flashscore now and then sends a broken fraction ("44/6564"): a pair where more is won than played,
// or more than 500 points of one kind in a match, is dropped (both numbers become null).
export const FRACTIONS = ['first', 'second', 'bp_saved', 'ret1', 'ret2', 'bp_conv', 'net', 'sv_pts', 'rt_pts', 'tot_pts', 'sv_games', 'rt_games'];
export function saneFractions(side) {
  const out = {};
  for (const k of FRACTIONS) {
    const won = side[`${k}_won`];
    const total = side[`${k}_total`];
    const ok = won != null && total != null && won >= 0 && won <= total && total <= 500;
    out[`${k}_won`] = ok ? won : null;
    out[`${k}_total`] = ok ? total : null;
  }
  return out;
}

// Two rows (one per player) for a finished singles match with statistics, or [] when Flashscore
// has no statistics for it. info: {match_id, played_at, surface, home_fs, away_fs, winner 1|2, sets_home, sets_away}
export function statsRows(info, parsed) {
  const { home, away } = parsed.match;
  if (!home.sv_pts_total || !away.sv_pts_total || !info.home_fs || !info.away_fs || !info.winner) return [];
  const setsToWin = Math.max(info.sets_home ?? 0, info.sets_away ?? 0) >= 3 ? 3 : 2;
  const deciding = (info.sets_home ?? 0) + (info.sets_away ?? 0) === 2 * setsToWin - 1 ? 1 : 0;
  const tb = tiebreakCounts(parsed.sets, info.sets_home, info.sets_away);
  const row = (side, me, opp, won, setsWon, setsLost, tbWon) => ({
    match_id: info.match_id, fs_id: me, opp_fs_id: opp, played_at: info.played_at, surface: info.surface ?? null,
    won, sets_won: setsWon ?? null, sets_lost: setsLost ?? null, deciding,
    ...Object.fromEntries(STAT_COLUMNS.slice(9, -2).map((c) => [c, side[c] ?? null])),
    ...saneFractions(side),
    tb_won: tbWon, tb_total: tb.total,
  });
  return [
    row(home, info.home_fs, info.away_fs, info.winner === 1 ? 1 : 0, info.sets_home, info.sets_away, tb.home),
    row(away, info.away_fs, info.home_fs, info.winner === 2 ? 1 : 0, info.sets_away, info.sets_home, tb.away),
  ];
}

export async function fetchMatchStats(matchId) {
  const text = await fetchText(`${FLASHSCORE_EN}/x/feed/df_st_1_${matchId}`, {
    headers: { 'x-fsign': FLASHSCORE_FSIGN, referer: `${FLASHSCORE_EN}/` },
  });
  return parseMatchStats(text);
}
