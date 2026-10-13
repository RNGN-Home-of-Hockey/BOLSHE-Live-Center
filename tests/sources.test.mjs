import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseRankingFeed } from '../src/sources/flashscore.js';
import { parseEspnRankings } from '../src/sources/espn.js';
import { parseEloPage } from '../src/sources/tennisabstract.js';
import { flashscoreIdFromWikidata, foldWikidataRows } from '../src/sources/wikidata.js';
import { normalizeWtaRow } from '../src/sources/wta.js';

// Shape copied from the real Flashscore ranking feed (two rows, values shortened).
const FEED = 'TS÷ME¬TE÷ME¬TS÷GR¬PT÷TI¬PV÷35851¬TS÷TA¬TS÷HD¬PT÷TE¬PV÷Рейтинг ATP - одиночный разряд¬PT÷DA¬PV÷05.10.2026¬TE÷HD¬'
  + 'TS÷RW¬PT÷ID¬PV÷1¬PT÷PN¬PV÷Янник Синнер¬PT÷PI¬PV÷6HdC3z4H¬PT÷CI¬PV÷98¬PT÷CN¬PV÷Италия¬PT÷RA¬PV÷1¬PT÷RAP¬PV÷1¬PT÷PO¬PV÷11000¬PT÷PU¬PV÷/player/sinner-jannik/6HdC3z4H¬PT÷TP¬PV÷16¬TE÷RW¬'
  + 'TS÷RW¬PT÷ID¬PV÷2¬PT÷PN¬PV÷Jodar Rafael¬PT÷PI¬PV÷OdngshVK¬PT÷CI¬PV÷176¬PT÷CN¬PV÷Испания¬PT÷RA¬PV÷13¬PT÷RAP¬PV÷13¬PT÷PO¬PV÷2659¬PT÷PU¬PV÷/player/jodar-rafael/OdngshVK¬PT÷TP¬PV÷22¬TE÷RW¬~A1÷x¬';

test('Flashscore ranking feed: header date and rows', () => {
  const r = parseRankingFeed(FEED);
  assert.equal(r.ranking_date, '2026-10-05');
  assert.equal(r.rows.length, 2);
  assert.deepEqual(
    { fs: r.rows[0].fs_id, name: r.rows[0].name, rank: r.rows[0].rank, points: r.rows[0].points, slug: r.rows[0].slug },
    { fs: '6HdC3z4H', name: 'Янник Синнер', rank: 1, points: 11000, slug: 'sinner-jannik' },
  );
  assert.equal(r.rows[1].country, 'Испания');
});

test('WTA API row', () => {
  const row = normalizeWtaRow({
    player: { id: 324166, firstName: 'Elena', lastName: 'Rybakina', fullName: 'Elena Rybakina', countryCode: 'KAZ', dateOfBirth: '1999-06-17' },
    ranking: 1, points: 9696, tournamentsPlayed: 20, movement: 0, rankedAt: '2026-10-12T00:00:00Z',
  });
  assert.equal(row.wta_id, '324166');
  assert.equal(row.birth_date, '1999-06-17');
  assert.equal(row.ranked_at, '2026-10-12');
});

test('Wikidata rows fold into one record; en label wins over mul', () => {
  const rows = foldWikidataRows([
    { item: { value: 'http://www.wikidata.org/entity/Q5812' }, atp: { value: 'd643' }, ta: { value: 'NovakDjokovic' }, dob: { value: '1987-05-22T00:00:00Z' } },
    { item: { value: 'http://www.wikidata.org/entity/Q5812' }, mul: { value: 'Novak Djokovic' } },
    { item: { value: 'http://www.wikidata.org/entity/Q5812' }, ru: { value: 'Новак Джокович' } },
    { item: { value: 'http://www.wikidata.org/entity/Q1' }, mul: { value: 'Mul Name' } },
    { item: { value: 'http://www.wikidata.org/entity/Q1' }, en: { value: 'En Name' }, cit: { value: 'http://www.wikidata.org/entity/Q159' } },
  ]);
  const novak = rows.find((r) => r.wikidata_id === 'Q5812');
  assert.equal(novak.name_en, 'Novak Djokovic');
  assert.equal(novak.name_ru, 'Новак Джокович');
  assert.deepEqual(novak.atp_ids, ['D643']);
  assert.equal(novak.birth_date, '1987-05-22');
  const other = rows.find((r) => r.wikidata_id === 'Q1');
  assert.equal(other.name_en, 'En Name');
  assert.deepEqual(other.citizenships, ['RUS']);
  assert.equal(flashscoreIdFromWikidata('sinner-jannik/6HdC3z4H'), '6HdC3z4H');
});

test('Tennis Abstract Elo table', () => {
  const html = `<i>Last update: 2026-10-05</i><table id="reportable" class="tablesorter"><thead><tr>
    <th>Elo&nbsp;Rank</th><th>Player</th><th>Age</th><th>Elo</th><th></th><th>hElo</th><th>cElo</th><th>gElo</th></tr></thead>
    <tbody><tr><td>1</td><td><a href="https://www.tennisabstract.com/cgi-bin/player.cgi?p=JannikSinner">Jannik Sinner</a></td>
    <td>24.8</td><td>2296.9</td><td></td><td>2234.3</td><td>2186.8</td><td>2100.5</td></tr></tbody></table>`;
  const r = parseEloPage(html);
  assert.equal(r.updated, '2026-10-05');
  assert.deepEqual(r.rows[0], {
    ta_id: 'JannikSinner', name: 'Jannik Sinner', elo_rank: 1, age: 24.8,
    elo: 2296.9, elo_hard: 2234.3, elo_clay: 2186.8, elo_grass: 2100.5,
  });
});

test('ESPN rankings', () => {
  const rows = parseEspnRankings({ rankings: [{ ranks: [{ current: 1, points: 11000, athlete: { id: 3623, displayName: 'Jannik Sinner', headshot: { href: 'h.png' }, flag: { alt: 'Italy' } } }] }] });
  assert.deepEqual(rows[0], { espn_id: '3623', name: 'Jannik Sinner', rank: 1, points: 11000, headshot: 'h.png', country: 'Italy' });
});

test('sports.ru person page and slug candidates', async () => {
  const { parsePersonPage, pageMatchesPlayer, slugCandidates, slugFromRussian } = await import('../src/sources/sportsru.js');
  const html = `<meta property="og:image" content="https://cdn.example/p.png"><div>…</div>
    <h1 class="titleH1">Арина Соболенко</h1> <div class="descr">Aryna Sabalenka</div>
    <table class="profile-table"><tr><th>Родилась</th><td> 5 мая 1998 <span>|</span> 28 лет </td></tr></table>`;
  const page = parsePersonPage(html);
  assert.deepEqual(page, { name_ru: 'Арина Соболенко', name_latin: 'Aryna Sabalenka', birth_date: '1998-05-05', photo: 'https://cdn.example/p.png' });
  const player = { name_latin: 'Aryna Sabalenka', name_ru: 'Арина Соболенко', birth_date: '1998-05-05', aliases: [{ alias: 'Sabalenka Aryna', source: 'flashscore' }] };
  assert.ok(pageMatchesPlayer(page, player));
  assert.ok(!pageMatchesPlayer({ ...page, birth_date: '1990-01-01' }, player), 'different birth date = namesake');
  assert.deepEqual(slugCandidates(player), ['aryna-sabalenka', 'arina-sobolenko']);
  assert.equal(slugFromRussian('Андрей Рублёв'), 'andrey-rublev');
  assert.equal(parsePersonPage('<h1 class="titleH1">Page not found</h1>'), null);
});
