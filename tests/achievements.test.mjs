import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACHIEVEMENTS, achievementLevel, fanAchievements, fanMetrics } from '../src/game/achievements.js';

const vote = (i, over = {}) => ({
  pick: 1, winner: 1, start_at: new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString(), voted_at: null,
  surface: 'hard', pre1: 1.5, pre2: 2.6, n1: 6, n2: 4, n: 10, mine: false, bolshe: false, ...over,
});

test('levels: 5 in a row — level 1, 10 — level 2; progress to the next one', () => {
  const streak = ACHIEVEMENTS.find((a) => a.key === 'streak');
  assert.deepEqual(streak.levels.slice(0, 2), [5, 10]);
  assert.equal(achievementLevel(streak, 4).level, 0);
  assert.equal(achievementLevel(streak, 5).level, 1);
  const seven = achievementLevel(streak, 7);
  assert.equal(seven.level, 1);
  assert.equal(seven.next, 10);
  assert.equal(seven.to_next, 3);
  assert.equal(seven.progress, 2 / 5);
  const top = achievementLevel(streak, 80);
  assert.equal(top.level, 5);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test('metrics: best streak, upsets, minority wins, surfaces, our players, days in a row', () => {
  const rows = [
    vote(0), vote(1), vote(2, { winner: 2 }), // streak 2, then a miss
    vote(3, { pick: 2, winner: 2, pre2: 3.1, surface: 'clay', mine: true }), // upset on clay, our player
    vote(4, { pick: 2, winner: 2, n1: 8, n2: 2, n: 10, bolshe: true }), // only 20% thought so
    vote(5), vote(6, { winner: null }), // the last one is not decided yet
  ];
  const m = fanMetrics(rows, { follows: 4, appDays: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], streams: 6 });
  assert.equal(m.votes, 7);
  assert.equal(m.correct, 5);
  assert.equal(m.streak, 3);
  assert.equal(m.upsets, 2, 'Winline price 2.50 or more (3.1 and 2.6)');
  assert.equal(m.contrarian, 1);
  assert.equal(m.clay, 1);
  assert.equal(m.hard, 4);
  assert.equal(m.loyal, 1);
  assert.equal(m.bolshe, 1);
  assert.equal(m.days, 7);
  assert.equal(m.follows, 4);
  assert.equal(m.app_days, 3, 'three days in a row, then a gap');
  assert.equal(m.streams, 6);
});

test('every achievement is reported, unopened ones at level 0', () => {
  const list = fanAchievements([]);
  assert.equal(list.length, ACHIEVEMENTS.length);
  assert.ok(list.every((a) => a.level === 0 && a.max_level === 5));
});
