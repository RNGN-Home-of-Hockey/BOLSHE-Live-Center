// Fills player_match_stats with the last 50 matches (52 weeks) of the top players, so that the
// statistics and the 0–10 scores have a whole season behind them from day one. The Worker then
// adds every new match by itself (worker/src/stats.js).
//   node scripts/backfill-stats.mjs            top-200 ATP and WTA singles + our players up to №400
// Polite: 5 requests at a time. Uses wrangler (logged in on this PC) to read and write D1.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchText } from '../src/lib/http.js';
import { FLASHSCORE_EN, FLASHSCORE_FSIGN } from '../src/sources/flashscore.js';
import { parseH2HFeed } from '../src/sources/flashscore-matches.js';
import { STAT_COLUMNS, fetchMatchStats, statsRows } from '../src/sources/flashscore-stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'local', 'backfill-stats');
const ACCOUNT = 'f7f0376bf1c44c4e3cef4a24adf1b66a';
const YEAR_AGO = Date.now() - 365 * 86400e3;

function d1(sql) {
  const out = execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'bolshe-live-center', '--remote', '--json', '--command', JSON.stringify(sql.replace(/\s+/g, ' '))],
    { cwd: ROOT, encoding: 'utf8', shell: true, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

function d1File(file) {
  execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'bolshe-live-center', '--remote', '--file', JSON.stringify(file)],
    { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const item = items[i++];
      out.push(await fn(item).catch((error) => ({ error: String(error?.message ?? error) })));
    }
  }));
  return out;
}

const sql = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

async function lastMatches(fsId, matchId) {
  const text = await fetchText(`${FLASHSCORE_EN}/x/feed/df_hh_1_${matchId}`, { headers: { 'x-fsign': FLASHSCORE_FSIGN, referer: `${FLASHSCORE_EN}/` } });
  const blocks = parseH2HFeed(text).filter((b) => b.kind === 'last');
  const mine = blocks.find((b) => b.matches.length && b.matches.every((m) => m.p1_fs_id === fsId || m.p2_fs_id === fsId));
  return { mine: mine?.matches ?? [], all: blocks.flatMap((b) => b.matches) };
}

const targets = d1(`SELECT p.fs_id, p.name_ru, p.tour,
    (SELECT m.match_id FROM matches m WHERE m.p1_fs_id = p.fs_id OR m.p2_fs_id = p.fs_id ORDER BY m.start_at DESC LIMIT 1) AS match_id
  FROM players p WHERE p.fs_id IS NOT NULL AND (p.singles_rank <= 200 OR (p.is_russian = 1 AND p.singles_rank <= 400))`);
console.log(`targets: ${targets.length}, with a recent match: ${targets.filter((t) => t.match_id).length}`);

const matches = new Map();
const seenIn = new Map(); // fs_id → a match id where the player appears (for players without a recent match)
const add = (m) => {
  if (!m.match_id || !m.winner || !m.p1_fs_id || !m.p2_fs_id || m.p1_fs_id.includes('/')) return;
  if (Date.parse(m.start_at) < YEAR_AGO) return;
  matches.set(m.match_id, m);
};

const pass = async (list) => pool(list, 5, async (t) => {
  const { mine, all } = await lastMatches(t.fs_id, t.match_id);
  mine.forEach(add);
  all.forEach((m) => { for (const id of [m.p1_fs_id, m.p2_fs_id]) if (id && !seenIn.has(id)) seenIn.set(id, m.match_id); });
  return mine.length;
});

await pass(targets.filter((t) => t.match_id));
console.log(`pass 1: ${matches.size} matches`);
const missing = targets.filter((t) => !t.match_id && seenIn.has(t.fs_id)).map((t) => ({ ...t, match_id: seenIn.get(t.fs_id) }));
await pass(missing);
console.log(`pass 2 (players without a recent match of their own): ${missing.length} players, ${matches.size} matches`);

const known = new Set(d1('SELECT match_id FROM match_stats_status').map((r) => r.match_id));
const todo = [...matches.values()].filter((m) => !known.has(m.match_id));
console.log(`statistics to fetch: ${todo.length}`);

const statements = [];
let ok = 0;
let none = 0;
const results = await pool(todo, 5, async (m) => {
  const rows = statsRows({
    match_id: m.match_id, played_at: m.start_at, surface: m.surface, home_fs: m.p1_fs_id, away_fs: m.p2_fs_id,
    winner: m.winner, sets_home: m.sets_p1, sets_away: m.sets_p2,
  }, await fetchMatchStats(m.match_id));
  for (const r of rows) {
    statements.push(`INSERT OR REPLACE INTO player_match_stats (${STAT_COLUMNS.join(', ')}) VALUES (${STAT_COLUMNS.map((c) => sql(r[c] ?? (['tb_won', 'tb_total', 'deciding'].includes(c) ? 0 : null))).join(', ')});`);
  }
  statements.push(`INSERT OR REPLACE INTO match_stats_status (match_id, status, tries, checked_at) VALUES (${sql(m.match_id)}, '${rows.length ? 'ok' : 'none'}', 1, ${sql(new Date().toISOString())});`);
  if (rows.length) ok += 1; else none += 1;
  if ((ok + none) % 250 === 0) console.log(`  ${ok + none}/${todo.length}`);
  return rows.length;
});
console.log(`fetched: ${ok} with statistics, ${none} without, ${results.filter((r) => r?.error).length} errors`);

mkdirSync(OUT, { recursive: true });
for (let i = 0, part = 1; i < statements.length; i += 2500, part += 1) {
  const file = join(OUT, `part-${String(part).padStart(3, '0')}.sql`);
  writeFileSync(file, statements.slice(i, i + 2500).join('\n'));
  console.log(`uploading ${file}`);
  d1File(file);
}
console.log('done');
