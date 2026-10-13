import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBroadcasts, mskToUtcIso, parseCsv, splitNote } from '../src/sources/schedule.js';
import { matchScheduleNames } from '../src/players/bolshe-names.js';

// Synthetic sheet in the real layout (columns A:K, N, Q); no real keys anywhere.
const MAIN = [
  ' ,День,Время,Заметка,Лига,Дома,На выезде,Комментатор 1,Комментатор 2,Станция,Кто запускает/ КОРТСАЙД',
  'Сезон 2025/26,,,,,,,,,,',
  '05.10.2026,,06:00,WTA 1000 Пекин |1/16 финала,Теннис,Донна Векич,Ига Швёнтек,Сергей Коробейников,,Из дома,Рамиль',
  '05.10.2026,,2: 30,"Матч отменен из-за дождя",Теннис,Сумит Нагал,Лука Микрут,,AbCdEfGhIjKlMnOpQrSt,СТУДИЯ,',
  '05.10.2026,,07:00,,ПАДЕЛ,Игрок Один,Игрок Два,,,,',
  '06.10.2026,,10:00,,Теннис,Анна Данилина / Ирина Хромачёва,Пара Два / Пара Три,МАРШАН В БОСТОНЕ,,,',
].join('\n');
// Row i of the N and Q exports belongs to row i of the A:K export.
const LINKS = ['Ссылка трансляции', '', 'https://vk.com/video-1_2', 'rtmp://stream.example/x', '', 'https://vmix.at/abc'].join('\n');
const POSTS = ['VK_POST_ID', '', '561868', 'abc', '', '563414'].join('\n');

test('CSV parser handles quotes and empty fields', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\n,,x'), [['a', 'b,c', 'd "e"'], ['', '', 'x']]);
});

test('broadcasts: tennis only, Moscow time to UTC, cancellations, doubles, no keys', () => {
  const rows = buildBroadcasts(parseCsv(MAIN), parseCsv(LINKS), parseCsv(POSTS));
  assert.equal(rows.length, 3, 'padel and header rows are skipped');
  const [first, cancelled, doubles] = rows;
  assert.equal(first.date_msk, '2026-10-05');
  assert.equal(first.starts_at, '2026-10-05T03:00:00.000Z');
  assert.equal(first.tournament, 'WTA 1000 Пекин');
  assert.equal(first.round, '1/16 финала');
  assert.equal(first.commentator1, 'Сергей Коробейников');
  assert.equal(first.vk_url, 'https://vk.com/video-1_2');
  assert.equal(first.vk_post_id, '561868');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.time_msk, '02:30');
  assert.equal(cancelled.commentator2, null, 'key-like value dropped');
  assert.equal(cancelled.vk_url, null, 'rtmp link dropped');
  assert.equal(cancelled.vk_post_id, null);
  assert.equal(doubles.is_doubles, true);
  assert.equal(doubles.commentator1, null, 'not a person name');
  assert.equal(doubles.vk_url, null, 'only VK links are kept');
  assert.ok(!JSON.stringify(rows).includes('AbCdEfGhIjKlMnOpQrSt'));
});

test('note split and time conversion', () => {
  assert.deepEqual(splitNote('Ролан Гаррос'), { tournament: 'Ролан Гаррос', round: null });
  assert.deepEqual(splitNote('1 раз завис источник.'), { tournament: null, round: null }, 'crew remark is not a tournament');
  assert.deepEqual(splitNote('ATP Челленджер Брага'), { tournament: 'ATP Челленджер Брага', round: null });
  assert.equal(mskToUtcIso('2026-11-08', '01:30'), '2026-11-07T22:30:00.000Z');
});

test('schedule names match players exactly, fuzzily and in reversed order', () => {
  const players = [
    { fs_id: 'A', aliases: [{ alias: 'Кэти Боултер', source: 'wikidata' }] },
    { fs_id: 'B', aliases: [{ alias: 'Флавио Коболли', source: 'fantasy' }] },
    { fs_id: 'C', aliases: [{ alias: 'Циньвэнь Чжэн', source: 'flashscore' }] },
    { fs_id: 'D', aliases: [{ alias: 'Ига Швёнтек', source: 'fantasy' }] },
  ];
  const broadcasts = [
    { player1_ru: 'Кейти Бултер', player2_ru: 'Флавиоо Коболли' },
    { player1_ru: 'Чжэн Цинвэнь', player2_ru: 'Ига Швентек' },
    { player1_ru: 'Иглс', player2_ru: 'Хоукс' },
  ];
  const { matches, unmatched } = matchScheduleNames(broadcasts, players);
  const by = Object.fromEntries(matches.map((m) => [m.alias, m.fs_id]));
  assert.equal(by['Кейти Бултер'], 'A');
  assert.equal(by['Флавиоо Коболли'], 'B');
  assert.equal(by['Чжэн Цинвэнь'], 'C');
  assert.equal(by['Ига Швентек'], 'D');
  assert.deepEqual(unmatched.map((u) => u.name).sort(), ['Иглс', 'Хоукс']);
});
