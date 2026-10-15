import assert from 'node:assert/strict';
import { test } from 'node:test';

import { signInitData, verifyInitData } from '../src/lib/telegram-auth.js';
import { linkWinline, parseWinlineTennis, sideKeys, surnameKeys } from '../src/sources/winline.js';

// Shape copied from the real Winline feeds (2026-10-14), ids and odds shortened.
const FEED = `<Winline>
 <Sport Name="Футбол" Id="1"><Country Name="x"><Tournament Name="РПЛ" Id="9"><Match Team1="Зенит" Team2="Спартак" MatchDate="2026-10-14T19:00:00.000+03:00" islive="0" Id="1"><line freetext="Победитель" name1="1" odd1="1.50" name2="2" odd2="2.50"></line></Match></Tournament></Country></Sport>
 <Sport Name="Теннис" Id="5"><Country Name="WTA">
  <Tournament Name="Ухань, Китай" Id="1">
   <Match Team1="Свитолина Э." Team2="Гуо Х." Id1="1" Id2="2" MatchDate="2026-10-15T07:10:00.000+03:00" MatchUrl="https://winline.ru/plus/101" islive="0" Id="101">
    <line freetext="1 сет Исход 12" name1="1" odd1="1.20" name2="2" odd2="4.00"></line>
    <line freetext="Победитель" name1="1" odd1="1.08" name2="2" odd2="8.00"></line>
    <line freetext="Фора" value="-4.5" name1="1" odd1="1.50" name2="2" odd2="2.55"></line>
    <line freetext="Фора" value="-5.5" name1="1" odd1="1.90" name2="2" odd2="1.88"></line>
    <line freetext="1 сет Фора" value="-2.5" name1="1" odd1="1.85" name2="2" odd2="1.85"></line>
   </Match>
   <Match Team1="Ши Х." Team2="Фернандес Л.Э." MatchDate="2026-10-14T17:07:43.000+03:00" islive="1" Id="102">
    <line freetext="Победитель матча (Вкл. ОТ)" name1="1" odd1="3.50" name2="2" odd2="1.26"></line>
   </Match>
   <Match Team1="Санчес-Килес А." Team2="Недич А." MatchDate="2026-10-14T18:10:00.000+03:00" islive="0" Id="103">
    <line freetext="Тотал" value="22.5" name1="Больше" odd1="1.81" name2="Меньше" odd2="1.89"></line>
   </Match>
  </Tournament>
 </Country></Sport>
</Winline>`;

test('Winline feed: tennis only, match-winner odds, start in UTC', () => {
  const list = parseWinlineTennis(FEED);
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], {
    wl_id: '101', tournament: 'Ухань, Китай', p1: 'Свитолина Э.', p2: 'Гуо Х.',
    start_at: '2026-10-15T04:10:00.000Z', live: false, url: 'https://winline.ru/plus/101', odds: [1.08, 8],
    hcap: { value: -5.5, odds: [1.9, 1.88] }, // the most even games handicap; set handicaps are not used
  });
  assert.deepEqual(list[1].odds, [3.5, 1.26]);
  assert.equal(list[1].live, true);
  assert.equal(list[2].odds, null, 'no winner market — no odds');
});

test('surnames: hyphens, initials and doubles pairs', () => {
  assert.deepEqual([...surnameKeys('Санчес-Килес А.')], ['санчес', 'килес']);
  assert.deepEqual([...surnameKeys('Фернандес Л.Э.')], ['фернандес']);
  assert.deepEqual([...surnameKeys('Джевецкий К. / Матушевский П.')], ['джевецкий', 'матушевский']);
  assert.deepEqual([...surnameKeys('Швёнтек И.')], ['швентек']);
});

test('Winline matches find ours by players (any order, any spelling we know) and start time', () => {
  const wl = parseWinlineTennis(FEED);
  const ours = [
    // Flashscore wrote the Chinese player in Latin; the base knows her Russian name.
    { match_id: 'A', start_at: '2026-10-14T14:10:00.000Z', k1: sideKeys('Shi H.', 'Хань Ши'), k2: sideKeys('Фернандес Л.', 'Лейла Фернандес') },
    // Our order is the other way round.
    { match_id: 'B', start_at: '2026-10-15T04:30:00.000Z', k1: sideKeys('Гуо Х.', 'Ханьюй Го'), k2: sideKeys('Свитолина Э.', 'Элина Свитолина') },
    // Same players a week later: too far in time.
    { match_id: 'C', start_at: '2026-10-22T04:30:00.000Z', k1: sideKeys('Свитолина Э.'), k2: sideKeys('Гуо Х.') },
  ];
  const links = linkWinline(wl, ours);
  assert.deepEqual(links.map((l) => [l.wl.wl_id, l.match_id, l.swapped]), [['101', 'B', true], ['102', 'A', false]]);
});

test('Telegram Mini App data: right signature passes, forged or old data does not', async () => {
  const token = '123456:TEST-token-for-tests-only';
  const now = Date.parse('2026-10-14T15:00:00Z');
  const fields = { auth_date: String(now / 1000 - 60), query_id: 'AAE', user: JSON.stringify({ id: 42, first_name: 'Лиза', username: 'liza' }) };
  const hash = await signInitData(fields, token);
  const initData = new URLSearchParams({ ...fields, hash }).toString();
  assert.deepEqual(await verifyInitData(initData, token, { now }), { id: 42, first_name: 'Лиза', username: 'liza' });
  assert.equal(await verifyInitData(initData, 'other:token', { now }), null, 'another bot');
  const forged = new URLSearchParams({ ...fields, user: JSON.stringify({ id: 1, first_name: 'X' }), hash }).toString();
  assert.equal(await verifyInitData(forged, token, { now }), null, 'changed user');
  assert.equal(await verifyInitData(initData, token, { now: now + 8 * 86400e3 }), null, 'older than a week');
  assert.equal(await verifyInitData('', token, { now }), null);
});
