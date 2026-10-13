// Checks every player of data/players/players.json against sports.ru person pages.
//   node scripts/check-sportsru.mjs              continue where the last run stopped
//   node scripts/check-sportsru.mjs --limit 50   check at most 50 more players
//   node scripts/check-sportsru.mjs --recheck    check everybody again
// Progress: data/raw/sportsru/checked.jsonl (not committed, one line per checked player).
// Result:   data/seed/sportsru_names.json (Russian spelling, Latin name, birth date, page URL).
// Polite: 2 requests at a time with a pause; best-ranked players go first.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SPORTS_BASE, fetchPersonPage, pageMatchesPlayer, slugCandidates,
} from '../src/sources/sportsru.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const recheck = args.includes('--recheck');
const PAUSE_MS = 700;
const WORKERS = 2;

const progressDir = join(ROOT, 'data', 'raw', 'sportsru');
const progressFile = join(progressDir, 'checked.jsonl');
const resultFile = join(ROOT, 'data', 'seed', 'sportsru_names.json');
mkdirSync(progressDir, { recursive: true });

const players = JSON.parse(readFileSync(join(ROOT, 'data', 'players', 'players.json'), 'utf8')).players;
const checked = new Map();
if (!recheck && existsSync(progressFile)) {
  for (const line of readFileSync(progressFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (rec.status !== 'error') checked.set(rec.fs_id, rec);
  }
}

const order = (p) => (p.singles_rank != null ? p.singles_rank : 10000 + (p.doubles_rank ?? 9999));
const queue = players.filter((p) => !checked.has(p.fs_id)).sort((a, b) => order(a) - order(b)).slice(0, limit);
console.log(`players ${players.length}, already checked ${checked.size}, to check now ${queue.length}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function writeResult() {
  const found = [...checked.values()].filter((r) => r.status === 'found');
  const byFs = new Map(players.map((p) => [p.fs_id, p]));
  const rows = found
    .filter((r) => byFs.has(r.fs_id))
    .map((r) => ({
      fs_id: r.fs_id,
      player_id: byFs.get(r.fs_id).player_id,
      url: `${SPORTS_BASE}/tennis/person/${r.slug}/`,
      name_ru: r.page.name_ru,
      name_latin: r.page.name_latin,
      birth_date: r.page.birth_date,
    }))
    .sort((a, b) => a.player_id.localeCompare(b.player_id));
  writeFileSync(resultFile, `{"source":"sports.ru /tennis/person/","players":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  return rows.length;
}

async function checkPlayer(player) {
  const tried = [];
  for (const slug of slugCandidates(player)) {
    tried.push(slug);
    const res = await fetchPersonPage(slug);
    await sleep(PAUSE_MS);
    if (res.page && pageMatchesPlayer(res.page, player)) {
      return { fs_id: player.fs_id, status: 'found', slug, page: res.page, tried, checked_at: new Date().toISOString() };
    }
  }
  return { fs_id: player.fs_id, status: 'not_found', tried, checked_at: new Date().toISOString() };
}

let done = 0;
let found = 0;
let errors = 0;
const started = Date.now();
async function worker() {
  while (queue.length) {
    const player = queue.shift();
    let rec;
    try {
      rec = await checkPlayer(player);
    } catch (error) {
      rec = { fs_id: player.fs_id, status: 'error', error: error.message, checked_at: new Date().toISOString() };
      errors += 1;
      await sleep(5000);
    }
    appendFileSync(progressFile, `${JSON.stringify(rec)}\n`);
    if (rec.status !== 'error') checked.set(rec.fs_id, rec);
    if (rec.status === 'found') found += 1;
    done += 1;
    if (done % 50 === 0) {
      const total = writeResult();
      const perMin = (done / ((Date.now() - started) / 60000)).toFixed(1);
      console.log(`${new Date().toISOString().slice(11, 19)} checked ${done}, found ${found}, errors ${errors}, ${perMin}/min, saved ${total}`);
    }
  }
}

await Promise.all(Array.from({ length: WORKERS }, worker));
const total = writeResult();
console.log(`done: checked ${done}, found ${found}, errors ${errors}; sports.ru names saved: ${total} -> data/seed/sportsru_names.json`);
