import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LEVELS, levelFor } from '../src/game/levels.js';

test('levels go up with XP and thresholds grow', () => {
  for (let i = 1; i < LEVELS.length; i += 1) assert.ok(LEVELS[i].from > LEVELS[i - 1].from);
  assert.equal(levelFor(0).title, 'Подающий мячи');
  assert.equal(levelFor(99).title, 'Подающий мячи');
  assert.equal(levelFor(100).title, 'Любитель');
  assert.equal(levelFor(3700).title, 'Первая ракетка');
  assert.equal(levelFor(-50).xp, 0);
});

test('progress and XP to the next level', () => {
  const l = levelFor(400);
  assert.equal(l.title, 'Юниор');
  assert.equal(l.next_title, 'Квалификант');
  assert.equal(l.to_next, 200);
  assert.ok(Math.abs(l.progress - 1 / 3) < 1e-9);
});

test('legend counts Grand Slam titles', () => {
  assert.equal(levelFor(5000).title, 'Легенда');
  assert.equal(levelFor(5000).subtitle, '1 титул Большого шлема');
  assert.equal(levelFor(7600).subtitle, '2 титула Большого шлема');
  assert.equal(levelFor(17600).subtitle, '6 титулов Большого шлема');
  assert.equal(levelFor(5000).to_next, 2500);
});
