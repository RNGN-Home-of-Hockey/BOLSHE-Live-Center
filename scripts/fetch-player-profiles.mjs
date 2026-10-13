// Photos and dates of birth from Flashscore player pages for the players the app shows most:
// top-300 singles of both tours, every Russian, top-100 doubles (and anyone given with --all).
//   node scripts/fetch-player-profiles.mjs            continue where the last run stopped
//   node scripts/fetch-player-profiles.mjs --all      every player of the base (slow)
// Progress: data/raw/flashscore_profiles/checked.jsonl (not committed).
// Result:   data/seed/flashscore_profiles.json.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchPlayerProfile } from '../src/sources/flashscore-player.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');
const PAUSE_MS = 900;
const WORKERS = 2;
const progressDir = join(ROOT, 'data', 'raw', 'flashscore_profiles');
const progressFile = join(progressDir, 'checked.jsonl');
const resultFile = join(ROOT, 'data', 'seed', 'flashscore_profiles.json');
mkdirSync(progressDir, { recursive: true });

const players = JSON.parse(readFileSync(join(ROOT, 'data', 'players', 'players.json'), 'utf8')).players;
const wanted = (p) => all || (p.singles_rank != null && p.singles_rank <= 300) || p.is_russian
  || (p.doubles_rank != null && p.doubles_rank <= 100);

const done = new Map();
if (existsSync(progressFile)) {
  for (const line of readFileSync(progressFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (rec.status !== 'error') done.set(rec.fs_id, rec);
  }
}
const order = (p) => (p.singles_rank != null ? p.singles_rank : 10000 + (p.doubles_rank ?? 9999));
const queue = players.filter((p) => wanted(p) && !done.has(p.fs_id)).sort((a, b) => order(a) - order(b));
console.log(`to fetch ${queue.length}, already have ${done.size}`);

function writeResult() {
  const rows = [...done.values()].filter((r) => r.status === 'ok' && (r.photo_url || r.birth_date))
    .map(({ fs_id, photo_url, birth_date }) => ({ fs_id, photo_url, birth_date }))
    .sort((a, b) => a.fs_id.localeCompare(b.fs_id));
  writeFileSync(resultFile, `{"source":"flashscore player pages","players":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  return rows.length;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let count = 0;
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    let rec;
    try {
      const profile = await fetchPlayerProfile(p.fs_slug, p.fs_id);
      rec = { fs_id: p.fs_id, status: profile.missing ? 'missing' : 'ok', ...profile };
    } catch (error) {
      rec = { fs_id: p.fs_id, status: 'error', error: error.message };
      await sleep(5000);
    }
    appendFileSync(progressFile, `${JSON.stringify(rec)}\n`);
    if (rec.status !== 'error') done.set(p.fs_id, rec);
    count += 1;
    if (count % 50 === 0) console.log(`${new Date().toISOString().slice(11, 19)} fetched ${count}, saved ${writeResult()}`);
    await sleep(PAUSE_MS);
  }
}

await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`done: fetched ${count}; profiles saved ${writeResult()} -> data/seed/flashscore_profiles.json`);
