import assert from 'node:assert/strict';
import { test } from 'node:test';

import { homeTournaments, matchInterest, nextStudio, pickMainMatch, roundBonus, studioBanner } from '../src/insights/home.js';
import { questionClosesAt } from '../src/game/question.js';

const TODAY = '2026-10-18';
const NOW = Date.parse('2026-10-18T09:00:00Z'); // 12:00 MSK

let n = 0;
function match({ status = 'scheduled', date = TODAY, start = '2026-10-18T12:00:00Z', name = 'Ухань', tour = 'WTA', level = 'tour', r1 = 50, r2 = 60, bolshe = null, ru = false, doubles = false } = {}) {
  n += 1;
  return {
    match_id: `m${n}`, status, date_msk: date, start_at: start, is_doubles: doubles,
    tournament: { name, tour, level },
    p1: { rank: r1, is_russian: ru }, p2: { rank: r2, is_russian: false },
    bolshe,
  };
}

test('round bonus: final > semi > quarter > early rounds', () => {
  assert.equal(roundBonus('Финал'), 30);
  assert.equal(roundBonus('1/2 финала'), 20);
  assert.equal(roundBonus('1/4 финала'), 10);
  assert.equal(roundBonus('1/32 финала'), 0);
  assert.equal(roundBonus(null), 0);
});

test('interest: a «Больше» broadcast and a bigger tournament weigh more; наши and top ranks add', () => {
  const plain = matchInterest(match({ name: 'Ningbo' }));
  assert.ok(matchInterest(match({ name: 'Ухань' })) > plain, 'WTA 1000 above a 500');
  assert.ok(matchInterest(match({ name: 'Ningbo', bolshe: { round: null } })) > matchInterest(match({ name: 'Ухань' })), 'our broadcast first');
  assert.ok(matchInterest(match({ ru: true })) > matchInterest(match()), 'наши');
  assert.ok(matchInterest(match({ r1: 1, r2: 2 })) > matchInterest(match()), 'top players');
});

test('main match: the editors\' pick wins, then live, then today, tomorrow, today\'s results', () => {
  const live = match({ status: 'live', name: 'Ningbo' });
  const later = match({ name: 'Ухань', bolshe: { round: 'Финал', starts_at: '2026-10-18T10:30:00Z' } });
  const done = match({ status: 'finished', name: 'Шанхай', tour: 'ATP' });
  const tomorrow = match({ date: '2026-10-19', start: '2026-10-19T08:00:00Z', name: 'Шанхай', tour: 'ATP', bolshe: { round: null } });
  const pool = [live, later, done, tomorrow];
  assert.equal(pickMainMatch(pool, { today: TODAY, now: NOW }).match.match_id, later.match_id, 'a WTA 1000 final on «Больше» beats a live 500');
  assert.equal(pickMainMatch([live, done, tomorrow], { today: TODAY, now: NOW }).match.match_id, live.match_id, 'a match on court now beats tomorrow\'s');
  assert.equal(pickMainMatch([done, tomorrow], { today: TODAY, now: NOW }).match.match_id, tomorrow.match_id, 'the day is over: tomorrow\'s match');
  const picked = pickMainMatch(pool, { today: TODAY, now: NOW, pickId: done.match_id });
  assert.deepEqual([picked.match.match_id, picked.manual], [done.match_id, true]);
  assert.equal(pickMainMatch([done], { today: TODAY, now: NOW }).match.match_id, done.match_id, 'only results left: show the result');
  assert.equal(pickMainMatch([match({ doubles: true }), match({ status: 'cancelled' })], { today: TODAY, now: NOW }), null);
  assert.equal(pickMainMatch([match({ name: 'Lyon (квалификация)' })], { today: TODAY, now: NOW }), null, 'no qualifying');
  assert.equal(pickMainMatch([match({ status: 'finished', date: '2026-10-17' })], { today: TODAY, now: NOW }), null, 'no old results');
});

test('home tournaments: big and covered first, challengers only counted', () => {
  const list = [
    { key: 'q', name: 'Lyon (квалификация)', level: 'tour', tour: 'ATP', status: 'now' },
    { key: 'a', name: 'Almaty', level: 'tour', tour: 'ATP', status: 'now' },
    { key: 's', name: 'Шанхай', level: 'tour', tour: 'ATP', status: 'now', tier: '1000' },
    { key: 'w', name: 'Ухань', level: 'tour', tour: 'WTA', status: 'now', tier: '1000' },
    { key: 'n', name: 'Ningbo', level: 'tour', tour: 'WTA', status: 'soon' },
    { key: 'c1', name: 'Florence', level: 'challenger', tour: 'ATP', status: 'now' },
    { key: 'c2', name: 'Roanne', level: 'challenger', tour: 'ATP', status: 'now' },
  ];
  const r = homeTournaments(list, { covered: new Set(['w']) });
  assert.deepEqual(r.tournaments.map((t) => t.key), ['w', 's', 'a']);
  assert.equal(r.more_tour, 2, 'Lyon (still in qualifying) and Ningbo are left for «Все турниры»');
  assert.equal(r.challengers, 2);
});

test('home tournaments between two weeks: finished today, then the coming ones by their qualifying', () => {
  const list = [
    { key: 's', name: 'Шанхай', level: 'tour', tour: 'ATP', status: 'done', tier: '1000', last_day: TODAY },
    { key: 'p', name: 'Пекин', level: 'tour', tour: 'WTA', status: 'done', tier: '1000', last_day: '2026-10-05' },
    { key: 'q1', name: 'Lyon (квалификация)', level: 'tour', tour: 'ATP', status: 'now' },
    { key: 'q2', name: 'Ningbo (квалификация)', level: 'tour', tour: 'WTA', status: 'now' },
    { key: 'q3', name: 'Осака (квалификация)', level: 'tour', tour: 'WTA', status: 'now' },
  ];
  const r = homeTournaments(list, { today: TODAY });
  assert.deepEqual(r.tournaments.map((t) => [t.key, t.name, t.stage ?? null]), [['s', 'Шанхай', null], ['q2', 'Ningbo', 'qualifying'], ['q3', 'Осака', 'qualifying']]);
  assert.equal(r.more_tour, 1, 'Ningbo is a 500 (Latin name known); Lyon waits in «Все турниры»; Пекин is old news');
});

test('studio: the next Monday 19:00 MSK, the banner from Sunday until the show ends', () => {
  const sunday = Date.parse('2026-10-18T09:00:00Z');
  assert.deepEqual(nextStudio(sunday), { date: '2026-10-19', starts_at: '2026-10-19T16:00:00.000Z', ends_at: '2026-10-19T18:00:00.000Z' });
  assert.equal(studioBanner(Date.parse('2026-10-17T20:00:00Z')), null, 'Saturday 23:00 MSK — not yet');
  assert.equal(studioBanner(sunday).url, 'https://vk.com/tennis_bolshe');
  assert.equal(studioBanner(Date.parse('2026-10-19T16:30:00Z')).live, true, 'on air');
  assert.equal(studioBanner(Date.parse('2026-10-19T18:30:00Z')), null, 'over — next week\'s banner waits for Sunday');
  const custom = studioBanner(sunday, { date: '2026-10-19', url: 'https://vkvideo.ru/x', note: 'Гость — Сафина', time: '20:00' });
  assert.deepEqual([custom.url, custom.about, custom.starts_at], ['https://vkvideo.ru/x', 'Гость — Сафина', '2026-10-19T17:00:00.000Z']);
  assert.equal(studioBanner(sunday, { date: '2026-10-19', off: true }), null, 'cancelled this week');
  assert.equal(studioBanner(sunday, { date: '2026-10-12', off: true }).title, 'Больше! Лайв', 'last week\'s setting is ignored');
});

test('question vote closes at the end of the Moscow day or when the player\'s match starts', () => {
  assert.equal(questionClosesAt('2026-10-18'), '2026-10-18T21:00:00.000Z');
  assert.equal(questionClosesAt('2026-10-18', '2026-10-18T11:00:00Z'), '2026-10-18T11:00:00.000Z');
  assert.equal(questionClosesAt('2026-10-18', '2026-10-19T06:00:00Z'), '2026-10-18T21:00:00.000Z');
});
