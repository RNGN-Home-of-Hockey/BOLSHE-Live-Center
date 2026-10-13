import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchStatus, parseDayFeed, parseH2HFeed, parseLeague } from '../src/sources/flashscore-matches.js';
import { buildPreview, eloChance, formOf } from '../src/insights/preview.js';

// Shape copied from the real Flashscore feeds (values shortened, ids synthetic).
const DAY = [
  'SA÷2¬~ZA÷WTA - ОДИНОЧНЫЙ РАЗРЯД: Ухань (Китай), хард¬ZEE÷T1¬ZL÷/tennis/wta-singles/wuhan/',
  'AA÷M1¬AD÷1791861000¬AB÷3¬AC÷3¬PX÷P1¬AE÷Синякова К.¬OA÷a.png¬PY÷P2¬AF÷Самсонова Л.¬OB÷b.png¬AG÷1¬AH÷2¬BA÷1¬BB÷6¬BC÷7¬BD÷5¬BE÷2¬BF÷6¬AS÷2¬AO÷1791868737',
  'AA÷M2¬AD÷1791870000¬AB÷2¬AC÷18¬PX÷P3¬AE÷А.¬PY÷P4¬AF÷Б.¬AG÷1¬AH÷0¬BA÷7¬BB÷6¬DA÷7¬DB÷4¬BC÷2¬BD÷1',
  'ZA÷ITF МУЖЧИНЫ - ПАРНЫЙ РАЗРЯД: Анталья (Турция), грунт¬ZEE÷T2',
  'AA÷M3¬AD÷1791880000¬AB÷1¬AC÷1¬PX÷X1/X2¬AE÷А./Б.¬PY÷Y1/Y2¬AF÷В./Г.',
  '',
].join('¬~');

test('league name: tour, level, discipline, place, surface', () => {
  assert.deepEqual(parseLeague('ATP - ОДИНОЧНЫЙ РАЗРЯД: Шанхай (Китай), хард'), {
    category: 'ATP - ОДИНОЧНЫЙ РАЗРЯД', tour: 'ATP', level: 'tour', discipline: 'singles', surface: 'hard', tournament: 'Шанхай', country: 'Китай',
  });
  const ch = parseLeague('ЧЕЛЛЕНДЖЕР ЖЕНЩИНЫ - ОДИНОЧНЫЙ РАЗРЯД: Сучжоу (Китай), хард');
  assert.equal(ch.tour, 'WTA');
  assert.equal(ch.level, 'challenger');
  assert.equal(parseLeague('ITF МУЖЧИНЫ - ПАРНЫЙ РАЗРЯД: Анталья (Турция), грунт').discipline, 'doubles');
  const q = parseLeague('ЧЕЛЛЕНДЖЕР МУЖЧИНЫ - ОДИНОЧНЫЙ РАЗРЯД: Maia (Португалия) - квалификация, грунт');
  assert.deepEqual([q.tournament, q.country, q.surface], ['Maia (квалификация)', 'Португалия', 'clay']);
});

test('status codes', () => {
  assert.deepEqual(matchStatus('1', '1'), { status: 'scheduled', live_set: null });
  assert.deepEqual(matchStatus('2', '18'), { status: 'live', live_set: 2 });
  assert.equal(matchStatus('3', '8').status, 'retired');
  assert.equal(matchStatus('3', '9').status, 'walkover');
});

test('day feed: matches with players, sets, tiebreaks, winner, doubles', () => {
  const { tournaments, matches } = parseDayFeed(DAY);
  assert.equal(tournaments.length, 2);
  assert.equal(matches.length, 3);
  const [done, live, dbl] = matches;
  assert.equal(done.p1_fs_id, 'P1');
  assert.equal(done.p2_fs_id, 'P2');
  assert.equal(done.winner, 2);
  assert.deepEqual(done.sets.map((s) => [s.p1, s.p2]), [[1, 6], [7, 5], [2, 6]]);
  assert.equal(done.start_at, '2026-10-13T03:10:00.000Z');
  assert.equal(done.p1_photo, 'https://static.flashscore.com/res/image/data/a.png');
  assert.equal(live.status, 'live');
  assert.equal(live.live_set, 2);
  assert.deepEqual([live.sets[0].tb1, live.sets[0].tb2], [7, 4]);
  assert.equal(dbl.is_doubles, true);
  assert.equal(dbl.status, 'scheduled');
});

const H2H = [
  'SA÷2¬~KA÷Все покрытия¬IS÷',
  'KB÷Последние игры: Синякова К.',
  'KC÷1791861000¬KP÷M1¬KD÷hard¬KF÷Ухань¬AC÷3¬UQ÷P1¬UO÷P2¬KJ÷Синякова К.¬KK÷*Самсонова Л.¬KU÷1¬KT÷2¬WIS÷l',
  'KC÷1791008700¬KP÷H1¬KD÷hard¬KF÷Пекин¬AC÷3¬UQ÷P1¬UO÷Q9¬KJ÷*Синякова К.¬KK÷Икс И.¬KU÷2¬KT÷0¬WIS÷w',
  'KC÷1790835000¬KP÷H2¬KD÷hard¬KF÷Пекин¬AC÷3¬UQ÷Q8¬UO÷P1¬KJ÷Игрек И.¬KK÷*Синякова К.¬KU÷0¬KT÷2¬WIS÷w',
  'KB÷Последние игры: Самсонова Л.',
  'KC÷1791861000¬KP÷M1¬KD÷hard¬KF÷Ухань¬AC÷3¬UQ÷P1¬UO÷P2¬KJ÷Синякова К.¬KK÷*Самсонова Л.¬KU÷1¬KT÷2¬WIS÷w',
  'KC÷1791000000¬KP÷H3¬KD÷hard¬KF÷Пекин¬AC÷3¬UQ÷P2¬UO÷Q7¬KJ÷Самсонова Л.¬KK÷*Зет З.¬KU÷0¬KT÷2¬WIS÷l',
  'KB÷Очные встречи',
  'KC÷1791861000¬KP÷M1¬KD÷hard¬KF÷Ухань¬AC÷3¬UQ÷P1¬UO÷P2¬KJ÷Синякова К.¬KK÷*Самсонова Л.¬KU÷1¬KT÷2',
  'KC÷1782033600¬KP÷H4¬KD÷grass¬KF÷Бад Хомбург¬AC÷3¬UQ÷P2¬UO÷P1¬KJ÷*Самсонова Л.¬KK÷Синякова К.¬KU÷2¬KT÷0',
  '',
].join('¬~');

test('H2H feed: sections, winners from the * mark', () => {
  const blocks = parseH2HFeed(H2H);
  assert.deepEqual(blocks.map((b) => [b.surface, b.kind, b.matches.length]), [
    ['Все покрытия', 'last', 3], ['Все покрытия', 'last', 2], ['Все покрытия', 'h2h', 2],
  ]);
  assert.equal(blocks[0].matches[1].winner, 1);
  assert.equal(blocks[0].matches[2].winner, 2);
});

test('preview for beginners: ranks, Elo chance, form without this match, head to head, favourite', () => {
  assert.ok(Math.abs(eloChance(1700, 1600) - 0.64) < 0.01);
  const h2h = parseH2HFeed(H2H);
  assert.deepEqual(formOf('P1', h2h[0].matches, 'M1'), { wins: 2, played: 2 });
  const preview = buildPreview({
    match: { match_id: 'M1', p1_fs_id: 'P1', p2_fs_id: 'P2', surface: 'hard', p1_name: 'Синякова К.', p2_name: 'Самсонова Л.' },
    p1: { name_ru: 'Катержина Синякова', singles_rank: 60, elo: 1700, elo_hard: 1690, birth_date: '1996-05-10' },
    p2: { name_ru: 'Людмила Самсонова', singles_rank: 28, elo: 1840, elo_hard: 1850, birth_date: '1998-11-11' },
    h2h,
    now: new Date('2026-10-13T12:00:00Z'),
  });
  assert.equal(preview.favorite, 2);
  assert.deepEqual(preview.chance, { p1: 28, p2: 72, by: 'elo_hard' });
  const text = preview.lines.join('\n');
  assert.match(text, /Рейтинг: Синякова — №60, Самсонова — №28\./);
  assert.match(text, /на харде: Синякова 28% — Самсонова 72%/);
  assert.match(text, /Форма: Синякова — 2 победы в 2 последних матчах, Самсонова — 0 из 1\./);
  assert.match(text, /Личные встречи: Самсонова ведёт 1–0\. Последняя — Бад Хомбург 2026, победитель — Самсонова\./);
  assert.match(text, /Возраст: Синякова — 30 лет, Самсонова — 27 лет\./);
  assert.match(text, /Явный фаворит — Самсонова\./);
});
