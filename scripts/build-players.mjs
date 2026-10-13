// Builds the player database from every source.
//   node scripts/build-players.mjs            use today's cached source answers when present
//   node scripts/build-players.mjs --refresh  download everything again
// Output: data/players/players.json, players.csv, review_names.csv, REPORT.md.
// Source answers are cached in data/raw/<date>/ (not committed) so reruns do not hit the sources.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchEspnRankings } from '../src/sources/espn.js';
import { FLASHSCORE_EN, FLASHSCORE_RU, RANKINGS, fetchRanking } from '../src/sources/flashscore.js';
import { fetchEloRatings } from '../src/sources/tennisabstract.js';
import { fetchWikidataPlayers } from '../src/sources/wikidata.js';
import { fetchWtaSinglesRanking } from '../src/sources/wta.js';
import { mergePlayers } from '../src/players/merge.js';
import { matchScheduleNames } from '../src/players/bolshe-names.js';
import { fetchBroadcasts } from '../src/sources/schedule.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const refresh = process.argv.includes('--refresh');
const today = new Date().toISOString().slice(0, 10);
const rawDir = join(ROOT, 'data', 'raw', today);
const outDir = join(ROOT, 'data', 'players');
mkdirSync(rawDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

async function cached(name, load) {
  const file = join(rawDir, `${name}.json`);
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const started = Date.now();
  const value = await load();
  writeFileSync(file, JSON.stringify(value));
  console.log(`  ${name}: downloaded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return value;
}

async function optional(name, load) {
  try {
    return await cached(name, load);
  } catch (error) {
    console.warn(`  ${name}: FAILED (${error.message}) — continuing without it`);
    return null;
  }
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(path, columns, rows) {
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))];
  // BOM so Excel opens Cyrillic correctly.
  writeFileSync(path, `﻿${lines.join('\n')}\n`);
}

console.log(`Sources (${refresh ? 'fresh download' : 'cache if present'}):`);
const fsRu = {};
const fsEn = {};
for (const key of Object.keys(RANKINGS)) {
  fsRu[key] = await cached(`flashscore_${key}_ru`, () => fetchRanking(key, { base: FLASHSCORE_RU }));
  fsEn[key] = await optional(`flashscore_${key}_en`, () => fetchRanking(key, { base: FLASHSCORE_EN }));
}
const wta = (await optional('wta_singles', fetchWtaSinglesRanking)) ?? [];
const wikidata = (await optional('wikidata_players', fetchWikidataPlayers)) ?? [];
const elo = {
  ATP: await optional('tennisabstract_elo_atp', () => fetchEloRatings('ATP')),
  WTA: await optional('tennisabstract_elo_wta', () => fetchEloRatings('WTA')),
};
const espn = {
  ATP: (await optional('espn_atp', () => fetchEspnRankings('ATP'))) ?? [],
  WTA: (await optional('espn_wta', () => fetchEspnRankings('WTA'))) ?? [],
};
const fantasy = readJson(join(ROOT, 'data', 'seed', 'fantasy_rg2026_players.json'), { players: [] }).players;
const overrides = readJson(join(ROOT, 'data', 'seed', 'names_ru_overrides.json'), { overrides: [] }).overrides;
const sportsru = readJson(join(ROOT, 'data', 'seed', 'sportsru_names.json'), { players: [] }).players;
// Name decisions made by admins in the bot, pulled from D1 by scripts/sync-cloudflare.mjs.
const botOverrides = readJson(join(ROOT, 'data', 'local', 'bot_overrides.json'), { overrides: [] }).overrides;
// The schedule sheet id is private (it also holds stream keys): env or private/config.json.
const privateConfig = readJson(join(ROOT, 'private', 'config.json'), {});
const sheetId = process.env.SCHEDULE_SHEET_ID || privateConfig.schedule_sheet_id;
const broadcasts = sheetId
  ? (await optional('bolshe_schedule', () => fetchBroadcasts(sheetId, privateConfig.schedule_gid || '548911490'))) ?? []
  : [];

const profiles = readJson(join(ROOT, 'data', 'seed', 'flashscore_profiles.json'), { players: [] }).players;
const sources = { fsRu, fsEn, wta, wikidata, elo, espn, fantasy, overrides, sportsru, botOverrides, profiles };
// Two passes: the first gives every player all spellings, so «Больше» schedule names can be
// matched; the second adds those schedule spellings as aliases.
const firstPass = mergePlayers(sources);
const bolshe = matchScheduleNames(broadcasts, firstPass.players);
const { players, rankingDates, stats } = mergePlayers({ ...sources, extraAliases: bolshe.matches });

// One player per line keeps git diffs readable when rankings move.
writeFileSync(
  join(outDir, 'players.json'),
  `{"generated_at":"${new Date().toISOString()}","ranking_dates":${JSON.stringify(rankingDates)},"players":[\n${players.map((p) => JSON.stringify(p)).join(',\n')}\n]}\n`,
);

const csvColumns = ['tour', 'singles_rank', 'doubles_rank', 'name_ru', 'name_ru_source', 'name_latin',
  'country_code', 'is_russian', 'birth_date', 'elo', 'fs_id', 'player_id', 'sportsru_url'];
writeCsv(join(outDir, 'players.csv'), csvColumns, players);

const REVIEW_TOP = 300;
const review = players.filter((p) => p.singles_rank != null && p.singles_rank <= REVIEW_TOP
  && !['fantasy', 'override', 'sportsru', 'bot'].includes(p.name_ru_source));
writeCsv(join(outDir, 'review_names.csv'),
  ['tour', 'singles_rank', 'name_ru', 'name_ru_source', 'name_latin', 'fs_id', 'player_id'], review);

const count = (list, fn) => list.filter(fn).length;
const lines = [];
lines.push('# База игроков — отчёт сборки', '');
lines.push(`Собрано: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Даты рейтингов Flashscore: ${Object.entries(rankingDates).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
lines.push('| Показатель | ATP | WTA |', '|---|---|---|');
const row = (label, fn) => lines.push(`| ${label} | ${count(players, (p) => p.tour === 'ATP' && fn(p))} | ${count(players, (p) => p.tour === 'WTA' && fn(p))} |`);
row('Всего игроков', () => true);
row('В рейтинге одиночек', (p) => p.singles_rank != null);
row('Только в рейтинге пар', (p) => p.singles_rank == null && p.doubles_rank != null);
row('Россияне', (p) => p.is_russian);
row('Под нейтральным флагом («Мир»)', (p) => p.neutral_flag);
row('С датой рождения', (p) => p.birth_date);
row('С фото', (p) => p.photo_url);
row('С Elo (Tennis Abstract)', (p) => p.elo != null);
row('Связаны с Wikidata', (p) => p.wikidata_id);
row('Связаны с официальным WTA', (p) => p.wta_id);
row('Есть в фэнтези RG-2026', (p) => p.fantasy_player_id);
row('Есть на sports.ru', (p) => p.sportsru_url);
lines.push('', '**Откуда русское имя** (приоритет сверху вниз):', '');
for (const source of ['bot', 'override', 'sportsru', 'fantasy', 'wikidata', 'flashscore', 'translit']) {
  lines.push(`- ${source}: ATP ${count(players, (p) => p.tour === 'ATP' && p.name_ru_source === source)}, WTA ${count(players, (p) => p.tour === 'WTA' && p.name_ru_source === source)}`);
}
const fantasyMissing = fantasy.filter((f) => !players.some((p) => p.fantasy_player_id === f.fantasy_player_id));
lines.push('', `Игроков фэнтези не найдено в рейтингах: ${fantasyMissing.length}${fantasyMissing.length ? ` (${fantasyMissing.map((f) => f.name_en).join(', ')})` : ''}.`);
lines.push(`Строк официального рейтинга WTA: ${wta.length}, связано: ${stats.wtaMatched}.`);
lines.push(`Записей Wikidata: ${wikidata.length}; связано по имени (не по номеру): ${stats.wikidataByName}.`);
lines.push(`Имена без подтверждения (топ-${REVIEW_TOP} одиночек: не sports.ru, не фэнтези, не бот): ${review.length} → review_names.csv.`);
if (broadcasts.length) {
  const exactCount = bolshe.matches.filter((m) => m.how === 'exact').length;
  const fuzzyCount = bolshe.matches.length - exactCount;
  lines.push(`Расписание «Больше»: ${broadcasts.length} теннисных эфиров, разных имён одиночек ${bolshe.matches.length + bolshe.unmatched.length}; узнано ${bolshe.matches.length} (точно ${exactCount}, приблизительно ${fuzzyCount}), не узнано ${bolshe.unmatched.length} → bolshe_unmatched.csv.`);
  writeCsv(join(outDir, 'bolshe_unmatched.csv'), ['name', 'count', 'why'], bolshe.unmatched.sort((a, b) => b.count - a.count));
}
writeFileSync(join(outDir, 'REPORT.md'), `${lines.join('\n')}\n`);

console.log(`\nPlayers: ${players.length} (ATP ${count(players, (p) => p.tour === 'ATP')}, WTA ${count(players, (p) => p.tour === 'WTA')}). Report: data/players/REPORT.md`);
