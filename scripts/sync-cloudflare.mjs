// Rebuilds the player base and uploads it to Cloudflare D1, keeping the bot's name decisions.
//   node scripts/sync-cloudflare.mjs              pull bot decisions -> rebuild -> upload
//   node scripts/sync-cloudflare.mjs --no-build   upload the current data/players/players.json
// Needs `npx wrangler login` on this computer (account of the HOH Worker).

import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'bolshe-live-center';
const noBuild = process.argv.includes('--no-build');

const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

console.log('1/4 Pulling name decisions made in the bot…');
const out = run(`npx --yes wrangler@4 d1 execute ${DB} --remote --json --command "SELECT player_id, name_ru, action FROM player_name_overrides"`, { capture: true });
const parsed = JSON.parse(out.slice(out.indexOf('[')));
const overrides = parsed[0]?.results ?? [];
mkdirSync(join(ROOT, 'data', 'local'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'local', 'bot_overrides.json'), JSON.stringify({ overrides }, null, 1));
console.log(`   ${overrides.length} decisions`);

if (!noBuild) {
  console.log('2/4 Rebuilding the player base…');
  run('node scripts/build-players.mjs');
}
console.log('3/4 Building the SQL for D1…');
run('node scripts/build-local-db.mjs');
// A decision made in the bot between steps 1 and 4 must still win.
appendFileSync(join(ROOT, 'data', 'local', 'd1-seed.sql'), `UPDATE players SET
  name_ru = (SELECT o.name_ru FROM player_name_overrides o WHERE o.player_id = players.player_id),
  name_ru_source = 'bot'
WHERE player_id IN (SELECT player_id FROM player_name_overrides);
`);

console.log('4/4 Uploading to Cloudflare D1…');
run(`npx --yes wrangler@4 d1 execute ${DB} --remote --yes --file data/local/d1-seed.sql`);
console.log('Done.');
