// Loads data/players/players.json into a local SQLite database with the same schema
// as Cloudflare D1 (migrations/*.sql), and writes a SQL file for the first D1 import.
//   node scripts/build-local-db.mjs
// Output (not committed): data/local/core.sqlite, data/local/d1-seed.sql

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { tokenKey } from '../src/lib/names.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const localDir = join(ROOT, 'data', 'local');
mkdirSync(localDir, { recursive: true });
const dbPath = join(localDir, 'core.sqlite');
if (existsSync(dbPath)) rmSync(dbPath);

const db = new DatabaseSync(dbPath);
const migrations = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const file of migrations) db.exec(readFileSync(join(ROOT, 'migrations', file), 'utf8'));

const data = JSON.parse(readFileSync(join(ROOT, 'data', 'players', 'players.json'), 'utf8'));
const now = data.generated_at;
const columns = ['player_id', 'tour', 'name_ru', 'name_ru_short', 'name_ru_source', 'name_latin',
  'country_code', 'country_ru', 'nationality_source', 'neutral_flag', 'is_russian', 'birth_date',
  'photo_url', 'singles_rank', 'singles_prev_rank', 'singles_points', 'singles_tournaments',
  'doubles_rank', 'doubles_points', 'elo', 'elo_rank', 'elo_hard', 'elo_clay', 'elo_grass',
  'fs_id', 'fs_slug', 'wta_id', 'atp_id', 'espn_id', 'ta_id', 'wikidata_id', 'fantasy_player_id',
  'sportsru_url', 'sources', 'updated_at'];

const sqlValue = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const rowValues = (p) => columns.map((c) => {
  if (c === 'neutral_flag' || c === 'is_russian') return p[c] ? 1 : 0;
  if (c === 'sources') return JSON.stringify(p.sources ?? []);
  if (c === 'updated_at') return now;
  return p[c] ?? null;
});

const insertPlayer = db.prepare(`INSERT INTO players (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
const insertAlias = db.prepare('INSERT OR IGNORE INTO player_aliases (alias_key, player_id, alias, source) VALUES (?, ?, ?, ?)');
const insertRank = db.prepare(`INSERT OR REPLACE INTO ranking_snapshots
  (tour, discipline, ranking_date, player_id, rank, prev_rank, points, tournaments, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'flashscore')`);
const insertElo = db.prepare(`INSERT OR REPLACE INTO elo_snapshots
  (player_id, rated_on, elo, elo_rank, elo_hard, elo_clay, elo_grass) VALUES (?, ?, ?, ?, ?, ?, ?)`);

const seed = [];
const eloDate = now.slice(0, 10);
db.exec('BEGIN');
for (const p of data.players) {
  const values = rowValues(p);
  insertPlayer.run(...values);
  seed.push(`INSERT OR REPLACE INTO players (${columns.join(',')}) VALUES (${values.map(sqlValue).join(',')});`);
  for (const a of p.aliases ?? []) {
    const aliasRow = [tokenKey(a.alias), p.player_id, a.alias, a.source];
    insertAlias.run(...aliasRow);
    seed.push(`INSERT OR IGNORE INTO player_aliases (alias_key, player_id, alias, source) VALUES (${aliasRow.map(sqlValue).join(',')});`);
  }
  const tourKey = p.tour.toLowerCase();
  const snapshots = [];
  if (p.singles_rank != null) snapshots.push(['singles', data.ranking_dates[`${tourKey}_singles`], p.singles_rank, p.singles_prev_rank, p.singles_points, p.singles_tournaments]);
  if (p.doubles_rank != null) snapshots.push(['doubles', data.ranking_dates[`${tourKey}_doubles`], p.doubles_rank, null, p.doubles_points, null]);
  for (const [discipline, date, rank, prev, points, tournaments] of snapshots) {
    const snap = [p.tour, discipline, date, p.player_id, rank, prev, points, tournaments];
    insertRank.run(...snap);
    seed.push(`INSERT OR REPLACE INTO ranking_snapshots (tour, discipline, ranking_date, player_id, rank, prev_rank, points, tournaments, source) VALUES (${snap.map(sqlValue).join(',')},'flashscore');`);
  }
  if (p.elo != null) {
    const elo = [p.player_id, eloDate, p.elo, p.elo_rank, p.elo_hard, p.elo_clay, p.elo_grass];
    insertElo.run(...elo);
    seed.push(`INSERT OR REPLACE INTO elo_snapshots (player_id, rated_on, elo, elo_rank, elo_hard, elo_clay, elo_grass) VALUES (${elo.map(sqlValue).join(',')});`);
  }
}
db.exec('COMMIT');
writeFileSync(join(localDir, 'd1-seed.sql'), `${seed.join('\n')}\n`);

const one = (sql) => Object.values(db.prepare(sql).get())[0];
console.log(`core.sqlite: players ${one('SELECT COUNT(*) FROM players')}, aliases ${one('SELECT COUNT(*) FROM player_aliases')}, ranking rows ${one('SELECT COUNT(*) FROM ranking_snapshots')}, elo rows ${one('SELECT COUNT(*) FROM elo_snapshots')}, fantasy contests ${one('SELECT COUNT(*) FROM fantasy_contests')}`);
console.log('Russians in top-100 singles:', db.prepare(`SELECT tour, name_ru, singles_rank FROM players
  WHERE is_russian = 1 AND singles_rank <= 100 ORDER BY tour, singles_rank`).all().map((r) => `${r.tour} ${r.singles_rank} ${r.name_ru}`).join('; '));
db.close();
