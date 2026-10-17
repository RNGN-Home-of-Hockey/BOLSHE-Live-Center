import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currentRound, isFinished, lockTime, openSlots, participants, pointsFor, scoreBracket, validatePicks } from '../src/game/bracket.js';
import { parseDrawFeed } from '../src/sources/flashscore-draw.js';

// Shape of the real Flashscore draw feed (dr_<tournament>_<stage>), cut to 8 positions:
// position 1 is a bye; quarter-finals done, one semi-final played, the other not, final unknown.
const FEED = [
  'PA÷0_Sabalenka A.|1_|2_Li A.|3_Osorio C.|4_Tjen J.|5_Ito A.|6_Snigur D.|7_Mertens E.¬PID÷0_vyhksgUB|1_|2_rwvAgOWm|3_rysUUciD|4_ngVYO2lo|5_fg8WB6JC|6_YuOTpKxj|7_Y1ZrrUtl¬PIC÷0_8_World|2_200_USA¬RN÷3_Quarter-finals|2_Semi-finals|1_Final',
  'RI÷3¬RK÷Y¬HP÷0¬HI÷(1)¬AP÷1¬AA÷m1¬ES÷1791900000¬WI÷0¬AC÷3',
  'HP÷2¬AP÷3¬AI÷(WC)¬AA÷m2¬ES÷1791900000¬WI÷2¬AC÷3',
  'HP÷4¬AP÷5¬AA÷m3¬ES÷1791900000¬WI÷5¬AC÷3',
  'HP÷6¬AP÷7¬AA÷m4¬ES÷1791900000¬WI÷7¬AC÷3',
  'RI÷2¬RK÷Y¬HP÷0¬AP÷2¬AA÷s1¬ES÷1791990000¬WI÷2¬AC÷3',
  'HP÷5¬AP÷7¬AA÷s2¬ES÷1792080000¬WI÷-1¬AC÷1',
  'RI÷1¬RK÷N¬HP÷1¬AP÷1¬US÷1792200000',
  'A1÷abc',
  '',
].join('¬~');

test('draw feed: players by position, rounds in draw order, byes and unknown players', () => {
  const d = parseDrawFeed(FEED);
  assert.equal(d.players[0].name, 'Sabalenka A.');
  assert.equal(d.players[0].fs_id, 'vyhksgUB');
  assert.equal(d.players[0].seed, '1');
  assert.equal(d.players[3].tag, 'WC');
  assert.equal(d.players[1].name, null, 'bye');
  assert.deepEqual(d.rounds.map((r) => [r.title, r.short, r.matches.length]), [['Четвертьфинал', 'ЧФ', 4], ['Полуфинал', 'ПФ', 2], ['Финал', 'Финал', 1]]);
  assert.deepEqual(d.rounds[0].matches[0], { id: 'm1', h: 0, a: null, w: 0, start: '2026-10-13T14:00:00.000Z', status: 'done' });
  assert.equal(d.rounds[1].matches[1].status, 'scheduled');
  assert.deepEqual(d.rounds[2].matches[0], { id: null, h: null, a: null, w: null, start: null, status: 'scheduled' });
});

test('bracket: open matches, who reaches them, points by round', () => {
  const d = parseDrawFeed(FEED);
  assert.deepEqual(openSlots(d).map((s) => s.key), ['1:1', '2:0']);
  assert.equal(currentRound(d), 1);
  assert.equal(isFinished(d), false);
  assert.deepEqual(participants(d, { '1:1': 7 })[2][0], [2, 7], 'the played semi-final sends Li, the pick sends Mertens');
  assert.deepEqual([pointsFor(d, 2), pointsFor(d, 1), pointsFor(d, 0)], [32, 16, 8]);
});

test('bracket: a sent bracket must be full and consistent', () => {
  const d = parseDrawFeed(FEED);
  assert.equal(validatePicks(d, { '1:1': 7 }).ok, false, 'final missing');
  assert.equal(validatePicks(d, { '1:1': 7, '2:0': 5 }).ok, false, 'Ito lost in the pick above');
  assert.deepEqual(validatePicks(d, { '1:1': 7, '2:0': 2, '9:9': 1 }), { ok: true, picks: { '1:1': 7, '2:0': 2 } });
});

test('bracket: only matches that began after sending count', () => {
  const d = parseDrawFeed(FEED);
  const picks = { '1:1': 7, '2:0': 2 };
  const early = scoreBracket(d, picks, '2026-10-01T00:00:00Z');
  assert.deepEqual(early, { points: 0, correct: 0, decided: 0, possible: 48 }, 'nothing decided yet among the picks; 16 + 32 reachable');
  // The second semi-final is played: Mertens wins. Then Li wins the final.
  d.rounds[1].matches[1] = { ...d.rounds[1].matches[1], w: 7, status: 'done' };
  d.rounds[2].matches[0] = { ...d.rounds[2].matches[0], h: 2, a: 7, w: 2, start: '2026-10-17T12:00:00Z', status: 'done' };
  assert.deepEqual(scoreBracket(d, picks, '2026-10-01T00:00:00Z'), { points: 48, correct: 2, decided: 2, possible: 48 });
  assert.deepEqual(scoreBracket(d, picks, '2026-10-15T18:00:00Z'), { points: 32, correct: 1, decided: 1, possible: 32 },
    'sent after the semi-final began: only the final counts');
  assert.equal(isFinished(d), true);
});

test('a sent bracket can be changed until the earliest open match starts; a live match locks at once', () => {
  const draw = { rounds: [
    { matches: [{ h: 0, a: 1, w: 0, start: '2026-10-18T08:00:00.000Z' }, { h: 2, a: 3, w: null, start: '2026-10-18T12:00:00.000Z' }] },
    { matches: [{ h: null, a: null, w: null, start: '2026-10-18T10:00:00.000Z' }] },
  ] };
  assert.equal(lockTime(draw), '2026-10-18T10:00:00.000Z', 'the decided 08:00 match does not count');
  draw.rounds[0].matches[1].status = 'live';
  assert.equal(lockTime(draw, Date.parse('2026-10-18T11:00:00Z')), '2026-10-18T11:00:00.000Z');
  assert.equal(lockTime({ rounds: [{ matches: [{ h: 0, a: 1, w: null, start: null }] }] }), null);
});
