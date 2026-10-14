import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_MATCHES, playerMetrics, scoreTour } from '../src/game/insights.js';
import { parseMatchStats, statsRows, tiebreakCounts } from '../src/sources/flashscore-stats.js';

// Shape of the real Flashscore statistics feed (df_st_1_<id>), Sabalenka — Li 6:3 4:6 6:7.
const FEED = [
  'SE÷Match', 'SF÷Service',
  'SG÷Aces¬SH÷2¬SI÷8', 'SG÷Double Faults¬SH÷6¬SI÷4', 'SG÷1st serve percentage¬SH÷54%¬SI÷60%',
  'SG÷1st serve points won¬SH÷67% (44/66)¬SI÷73% (40/55)', 'SG÷2nd serve points won¬SH÷55% (31/56)¬SI÷50% (18/36)',
  'SG÷Break Points Saved¬SH÷13/17¬SI÷4/8', 'SF÷Return',
  'SG÷1st return points won¬SH÷27% (15/55)¬SI÷33% (22/66)', 'SG÷2nd return points won¬SH÷50% (18/36)¬SI÷45% (25/56)',
  'SG÷Break Points Converted¬SH÷4/8¬SI÷4/17', 'SF÷Points', 'SG÷Winners¬SH÷36¬SI÷31', 'SG÷Unforced errors¬SH÷44¬SI÷28',
  'SG÷Service Points Won¬SH÷61% (75/122)¬SI÷64% (58/91)', 'SF÷Games',
  'SG÷Service games won¬SH÷75% (12/16)¬SI÷73% (11/15)', 'SG÷Return games won¬SH÷27% (4/15)¬SI÷25% (4/16)',
  'SE÷Set 1', 'SG÷Total games won¬SH÷67% (6/9)¬SI÷33% (3/9)',
  'SE÷Set 2', 'SG÷Total games won¬SH÷40% (4/10)¬SI÷60% (6/10)',
  'SE÷Set 3', 'SG÷Total games won¬SH÷50% (6/12)¬SI÷50% (6/12)',
  '',
].join('¬~');

test('statistics feed: counts for both players and games of every set', () => {
  const s = parseMatchStats(FEED);
  assert.equal(s.match.home.aces, 2);
  assert.equal(s.match.away.aces, 8);
  assert.deepEqual([s.match.home.first_won, s.match.home.first_total], [44, 66]);
  assert.deepEqual([s.match.home.bp_saved_won, s.match.home.bp_saved_total], [13, 17]);
  assert.deepEqual([s.match.away.sv_games_won, s.match.away.sv_games_total], [11, 15]);
  assert.equal(s.sets.length, 3);
});

test('tie-breaks: a 6:6 set, its winner from the sets each player won', () => {
  const s = parseMatchStats(FEED);
  assert.deepEqual(tiebreakCounts(s.sets, 1, 2), { total: 1, home: 0, away: 1 });
});

test('two rows per match, the deciding set, and nothing without statistics', () => {
  const s = parseMatchStats(FEED);
  const info = { match_id: 'S6', played_at: '2026-10-14T11:25:00Z', surface: 'hard', home_fs: 'SAB', away_fs: 'LI', winner: 2, sets_home: 1, sets_away: 2 };
  const [home, away] = statsRows(info, s);
  assert.equal(home.fs_id, 'SAB');
  assert.equal(home.won, 0);
  assert.equal(away.won, 1);
  assert.equal(home.deciding, 1);
  assert.deepEqual([home.tb_won, home.tb_total, away.tb_won], [0, 1, 1]);
  assert.deepEqual(statsRows(info, parseMatchStats('')), []);
});

test('metrics, ATP-style ratings and 0–10 scores within the tour', () => {
  const base = { aces: 50, df: 20, first_won: 300, first_total: 400, second_won: 120, second_total: 240, sv_pts_total: 640,
    bp_saved_won: 30, bp_saved_total: 50, sv_games_won: 80, sv_games_total: 100, ret1_won: 120, ret1_total: 400,
    ret2_won: 120, ret2_total: 240, bp_conv_won: 20, bp_conv_total: 50, rt_games_won: 25, rt_games_total: 100,
    tb_won: 3, tb_total: 5, deciding_won: 2, deciding_played: 3, winners: 200, ue: 150, net_won: 40, net_total: 60, tot_pts_won: 600, tot_pts_total: 1180 };
  const m = playerMetrics({ ...base, matches: 10, wins: 7 });
  assert.equal(m.win_pct, 70);
  assert.equal(m.aces_pm, 5);
  assert.equal(m.first_in_pct, 62.5);
  assert.equal(Math.round(m.serve_rating * 10) / 10, 62.5 + 75 + 50 + 80 + 5 - 2);
  const rows = Array.from({ length: 10 }, (_, i) => ({ fs_id: `P${i}`, metrics: playerMetrics({ ...base, aces: 10 * (i + 1), df: 5 * (i + 1), matches: 10, wins: i }) }));
  rows.push({ fs_id: 'FEW', metrics: playerMetrics({ ...base, matches: MIN_MATCHES - 1, wins: 7 }) });
  const scores = scoreTour(rows);
  assert.ok(scores.get('P9').aces_pm > scores.get('P0').aces_pm, 'more aces — higher score');
  assert.ok(scores.get('P0').df_pm > scores.get('P9').df_pm, 'fewer double faults — higher score');
  assert.equal(scores.get('FEW').aces_pm, undefined, 'too few matches — no score');
  assert.ok(scores.get('P9').aces_pm <= 10 && scores.get('P0').aces_pm >= 0);
});
