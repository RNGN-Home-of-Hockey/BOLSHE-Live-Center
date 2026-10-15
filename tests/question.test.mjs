import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickQuestion, playerRun, questionAnswer } from '../src/game/question.js';

// 16 positions, 4 rounds (1/8, ЧФ, ПФ, финал); position k is ranked k+1.
function draw16(winners = []) {
  const players = Array.from({ length: 16 }, (_, pos) => ({ pos, fs_id: `p${pos}`, name_ru: `Игрок Фамилия${pos}`, rank: pos + 1, photo: null }));
  const rounds = [8, 4, 2, 1].map((n, r) => ({ title: `R${r}`, matches: Array.from({ length: n }, (_, k) => ({ h: r === 0 ? 2 * k : null, a: r === 0 ? 2 * k + 1 : null, w: null })) }));
  // winners: [[round, match, pos], …]
  for (const [r, k, pos] of winners) rounds[r].matches[k].w = pos;
  return { players, rounds };
}
const firstRoundDone = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [0, k, 2 * k + 1]); // the lower-ranked side wins every 1/8

test('a player run: furthest round, knocked out, champion', () => {
  const d = draw16(firstRoundDone);
  assert.deepEqual(playerRun(d, 1), { reached: 1, out: false, champion: false });
  assert.deepEqual(playerRun(d, 0), { reached: 0, out: true, champion: false });
  assert.deepEqual(playerRun(d, 2), { reached: 0, out: true, champion: false });
});

test('question settles «Да» when the player gets there and «Нет» when knocked out before', () => {
  const start = draw16();
  assert.equal(questionAnswer(start, 'p0', 'semi'), null);
  const r1 = draw16(firstRoundDone);
  assert.equal(questionAnswer(r1, 'p0', 'semi'), 1, 'lost in the first round');
  assert.equal(questionAnswer(r1, 'p1', 'semi'), null, 'still on the way');
  const qf = draw16([...firstRoundDone, [1, 0, 1], [1, 1, 5]]);
  assert.equal(questionAnswer(qf, 'p1', 'semi'), 0, 'reached the semi-final');
  assert.equal(questionAnswer(qf, 'p3', 'semi'), 1);
  const final = draw16([...firstRoundDone, [1, 0, 1], [1, 1, 5], [1, 2, 9], [1, 3, 13], [2, 0, 1], [2, 1, 13], [3, 0, 13]]);
  assert.equal(questionAnswer(final, 'p13', 'title'), 0, 'champion');
  assert.equal(questionAnswer(final, 'p1', 'title'), 1, 'lost the final');
  assert.equal(questionAnswer(final, 'p1', 'final'), 0, 'but reached it');
  assert.equal(questionAnswer(final, 'nobody', 'title'), null);
});

test('question of the day: best-ranked player still in, goal by stage, ATP and WTA take turns, no repeats', () => {
  const atp = { bracket_key: 'a_1', name: 'ATP Шанхай', tour: 'ATP', draw: draw16(firstRoundDone) };
  const wta = { bracket_key: 'w_1', name: 'WTA Ухань', tour: 'WTA', draw: draw16() };
  // 2026-10-16 is an even day number since 1970 → ATP first.
  const even = pickQuestion([wta, atp], { day: '2026-10-16' });
  assert.equal(even.tournament, 'ATP Шанхай');
  assert.equal(even.player_fs_id, 'p1', 'p0 is out, p1 is the best-ranked left');
  assert.equal(even.goal, 'final', 'quarter-finals are next: ask about the final');
  assert.equal(even.question, 'Дойдёт ли Фамилия1 до финала?');
  const odd = pickQuestion([wta, atp], { day: '2026-10-15' });
  assert.equal(odd.tournament, 'WTA Ухань');
  assert.equal(odd.goal, 'semi', 'first round: ask about the semi-final');
  assert.equal(odd.question, 'Дойдёт ли Фамилия0 до полуфинала?');
  const next = pickQuestion([wta], { day: '2026-10-15', recent: [{ player_fs_id: 'p0' }] });
  assert.equal(next.player_fs_id, 'p1', 'not the same player two days running');
  const finished = draw16([...firstRoundDone, [1, 0, 1], [1, 1, 5], [1, 2, 9], [1, 3, 13], [2, 0, 1], [2, 1, 13], [3, 0, 13]]);
  assert.equal(pickQuestion([{ ...atp, draw: finished }], { day: '2026-10-16' }), null, 'nothing to ask about a finished draw');
});
