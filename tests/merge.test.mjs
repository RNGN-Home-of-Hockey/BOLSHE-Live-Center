import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergePlayers } from '../src/players/merge.js';

const ranking = (rows, date = '2026-10-05') => ({ ranking_date: date, rows });
const row = (fs_id, name, slug, country, rank) => ({ fs_id, name, slug, country, rank, prev_rank: rank, points: 100, tournaments: 10 });

function fixture() {
  return {
    fsRu: {
      atp_singles: ranking([
        row('MED00001', 'Даниил Медведев', 'medvedev-daniil', 'Мир', 5),
        row('BUB00001', 'Александр Бублик', 'bublik-alexander', 'Казахстан', 22),
        row('ALC00001', 'Карлос Алькарас', 'alcaraz-garfia-carlos', 'Испания', 3),
        row('NEW00001', 'Cadenasso Gianluca', 'cadenasso-gianluca', 'Италия', 220),
      ]),
      wta_singles: ranking([
        row('AND00001', 'Мирра Андреева', 'andreeva-mirra', 'Мир', 3),
        row('WAN00001', 'Wang Xin Yu', 'wang-xinyu-2001', 'Китай', 39),
        row('SAB00001', 'Арина Соболенко', 'sabalenka-aryna', 'Мир', 2),
      ], '2026-10-12'),
    },
    fsEn: {
      atp_singles: ranking([
        row('MED00001', 'Medvedev Daniil', 'medvedev-daniil', 'World', 5),
        row('BUB00001', 'Bublik Alexander', 'bublik-alexander', 'Kazakhstan', 22),
        row('ALC00001', 'Alcaraz Carlos', 'alcaraz-garfia-carlos', 'Spain', 3),
        row('NEW00001', 'Cadenasso Gianluca', 'cadenasso-gianluca', 'Italy', 220),
      ]),
      wta_singles: ranking([
        row('AND00001', 'Andreeva Mirra', 'andreeva-mirra', 'World', 3),
        row('WAN00001', 'Wang Xin Yu', 'wang-xinyu-2001', 'China', 39),
        row('SAB00001', 'Sabalenka Aryna', 'sabalenka-aryna', 'World', 2),
      ]),
    },
    wta: [
      { wta_id: '1', first_name: 'Mirra', last_name: 'Andreeva', full_name: 'Mirra Andreeva', country_code: 'RUS', birth_date: '2007-04-29', rank: 3 },
      { wta_id: '2', first_name: 'Xinyu', last_name: 'Wang', full_name: 'Xinyu Wang', country_code: 'CHN', birth_date: '2001-09-26', rank: 39 },
      { wta_id: '3', first_name: 'Aryna', last_name: 'Sabalenka', full_name: 'Aryna Sabalenka', country_code: 'BLR', birth_date: '1998-05-05', rank: 2 },
      { wta_id: '4', first_name: 'Paolini', last_name: 'Jasmine', full_name: 'Jasmine Paolini', country_code: 'ITA', birth_date: '1996-01-04', rank: 8 },
    ],
    wikidata: [
      { wikidata_id: 'Q1', fs_ids: [], wta_ids: [], atp_ids: ['MM58'], ta_ids: ['DaniilMedvedev'], espn_ids: [], citizenships: ['RUS'], name_ru: 'Даниил Сергеевич Медведев', name_en: 'Daniil Medvedev', birth_date: '1996-02-11' },
      { wikidata_id: 'Q2', fs_ids: [], wta_ids: [], atp_ids: ['B0BI'], ta_ids: [], espn_ids: [], citizenships: ['RUS'], name_ru: 'Александр Бублик', name_en: 'Alexander Bublik', birth_date: '1997-06-17' },
      { wikidata_id: 'Q3', fs_ids: [], wta_ids: [], atp_ids: ['A0E2'], ta_ids: [], espn_ids: [], citizenships: [], name_ru: 'Карлос Алькарас', name_en: 'Carlos Alcaraz', birth_date: '2003-05-05' },
    ],
    elo: { ATP: { rows: [{ ta_id: 'DaniilMedvedev', name: 'Daniil Medvedev', elo: 1965.3, elo_rank: 9 }] } },
    espn: {},
    fantasy: [
      { fantasy_player_id: 'ATP005', tour: 'ATP', name_ru: 'Даниил Медведев', name_en: 'Daniil Medvedev', photo_url: 'm.png', aliases: ['Медведев Д.'] },
      { fantasy_player_id: 'WTA_XINYU_WANG', tour: 'WTA', name_ru: 'Ван Синьюй', name_en: 'Xinyu Wang', aliases: [] },
    ],
    overrides: [{ fs_id: 'NEW00001', name_ru: 'Джанлука Каденассо' }],
  };
}

test('one record per Flashscore player, ATP and WTA', () => {
  const { players, rankingDates } = mergePlayers(fixture());
  assert.equal(players.length, 7);
  assert.equal(rankingDates.wta_singles, '2026-10-12');
  assert.equal(new Set(players.map((p) => p.player_id)).size, 7);
});

test('Russian name priority: override > fantasy > wikidata > flashscore', () => {
  const { players } = mergePlayers(fixture());
  const by = (fs) => players.find((p) => p.fs_id === fs);
  assert.equal(by('NEW00001').name_ru, 'Джанлука Каденассо');
  assert.equal(by('NEW00001').name_ru_source, 'override');
  assert.equal(by('MED00001').name_ru_source, 'fantasy');
  assert.equal(by('ALC00001').name_ru, 'Карлос Алькарас');
  assert.equal(by('ALC00001').name_ru_source, 'wikidata');
  assert.equal(by('AND00001').name_ru_source, 'flashscore');
});

test('Russians: sporting nationality, not passport', () => {
  const { players } = mergePlayers(fixture());
  const by = (fs) => players.find((p) => p.fs_id === fs);
  assert.equal(by('MED00001').is_russian, true, 'neutral flag + Russian citizenship');
  assert.equal(by('MED00001').country_code, 'RUS');
  assert.equal(by('BUB00001').is_russian, false, 'plays for Kazakhstan');
  assert.equal(by('AND00001').is_russian, true, 'WTA says RUS');
  assert.equal(by('SAB00001').is_russian, false, 'WTA says BLR');
  assert.equal(by('SAB00001').country_code, 'BLR');
});

test('joins: WTA API, Wikidata, Elo, fantasy (incl. Chinese name order)', () => {
  const { players } = mergePlayers(fixture());
  const by = (fs) => players.find((p) => p.fs_id === fs);
  assert.equal(by('AND00001').wta_id, '1');
  assert.equal(by('AND00001').birth_date, '2007-04-29');
  assert.equal(by('WAN00001').wta_id, '2');
  assert.equal(by('WAN00001').fantasy_player_id, 'WTA_XINYU_WANG');
  assert.equal(by('WAN00001').name_ru, 'Ван Синьюй');
  assert.equal(by('MED00001').wikidata_id, 'Q1');
  assert.equal(by('MED00001').elo, 1965.3);
  assert.equal(by('ALC00001').wikidata_id, 'Q3', 'Flashscore slug has the second surname');
  assert.ok(by('MED00001').aliases.some((a) => a.alias === 'Медведев Д.'));
});

test('bot decision > sports.ru > fantasy; ё restored from other sources', () => {
  const base = fixture();
  const { players } = mergePlayers({
    ...base,
    sportsru: [
      { fs_id: 'MED00001', name_ru: 'Даниил Медведев', url: 'https://www.sports.ru/tennis/person/daniil-medvedev/', birth_date: '1996-02-11' },
      { fs_id: 'AND00001', name_ru: 'Мирра Андреева', url: 'u', birth_date: null },
      { fs_id: 'BUB00001', name_ru: 'Александр Бублик', url: 'u2' },
    ],
    botOverrides: [{ player_id: 'atp-bublik-alexander', name_ru: 'Саша Бублик' }],
    extraAliases: [
      { fs_id: 'AND00001', alias: 'Мирра Андреёва', source: 'bolshe' },
      { fs_id: 'AND00001', alias: 'Мира Андреева', source: 'bolshe' },
    ],
  });
  const by = (fs) => players.find((p) => p.fs_id === fs);
  assert.equal(by('MED00001').name_ru_source, 'sportsru');
  assert.equal(by('MED00001').sportsru_url, 'https://www.sports.ru/tennis/person/daniil-medvedev/');
  assert.equal(by('BUB00001').name_ru, 'Саша Бублик');
  assert.equal(by('BUB00001').name_ru_source, 'bot');
  assert.equal(by('AND00001').name_ru, 'Мирра Андреёва', 'same letters with ё are preferred');
  assert.ok(by('AND00001').aliases.some((a) => a.alias === 'Мира Андреева' && a.source === 'bolshe'), 'a new spelling becomes an alias');
});
