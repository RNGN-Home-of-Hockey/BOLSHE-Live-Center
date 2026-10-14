// Player search and permanent name edits in D1.

import { mediaUrl } from '../../src/lib/media.js';
import { nameTokens, shortRu, tokenKey } from '../../src/lib/names.js';

const RANK_ORDER = 'ORDER BY (p.singles_rank IS NULL), p.singles_rank, (p.doubles_rank IS NULL), p.doubles_rank';

// Our stored copy of the player's head (worker/src/media.js) wins over the outside link.
const HEAD = "(SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'head/' || p.fs_id AND status = 'ok') AS head";
const withHead = ({ head, ...p }) => ({ ...p, photo_url: mediaUrl(head) ?? p.photo_url });

export async function searchPlayers(db, query, { tour = null, russian = false, limit = 20 } = {}) {
  const tokens = nameTokens(query).slice(0, 4);
  const where = [];
  const args = [];
  if (tokens.length) {
    where.push(`p.player_id IN (SELECT player_id FROM player_aliases WHERE ${tokens.map(() => 'alias_key LIKE ?').join(' AND ')})`);
    args.push(...tokens.map((t) => `%${t}%`));
  }
  if (tour === 'ATP' || tour === 'WTA') {
    where.push('p.tour = ?');
    args.push(tour);
  }
  if (russian) where.push('p.is_russian = 1');
  const sql = `SELECT p.*, ${HEAD} FROM players p ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${RANK_ORDER} LIMIT ?`;
  args.push(Math.min(Math.max(Number(limit) || 20, 1), 100));
  const { results } = await db.prepare(sql).bind(...args).all();
  return results.map(withHead);
}

export async function getPlayer(db, playerId) {
  const row = await db.prepare(`SELECT p.*, ${HEAD} FROM players p WHERE p.player_id = ?`).bind(playerId).first();
  if (!row) return null;
  const player = withHead(row);
  const { results: aliases } = await db.prepare('SELECT alias, source FROM player_aliases WHERE player_id = ?').bind(playerId).all();
  const override = await db.prepare('SELECT * FROM player_name_overrides WHERE player_id = ?').bind(playerId).first();
  return { ...player, aliases, name_override: override ?? null };
}

// Rename (or confirm) a player's Russian name. Stored in player_name_overrides, so every
// later rebuild of the base keeps it; history keeps every change.
export async function setPlayerName(db, playerId, newName, admin, action = 'rename') {
  const name = String(newName ?? '').trim().replace(/\s+/g, ' ');
  if (!/[А-Яа-яЁё]/.test(name) || name.length < 3 || name.length > 80) {
    return { ok: false, error: 'Имя должно быть по-русски, от 3 до 80 символов.' };
  }
  const player = await db.prepare('SELECT player_id, name_ru FROM players WHERE player_id = ?').bind(playerId).first();
  if (!player) return { ok: false, error: 'Игрок не найден.' };
  const now = new Date().toISOString();
  const adminName = admin?.name ?? null;
  await db.batch([
    db.prepare('UPDATE players SET name_ru = ?, name_ru_short = ?, name_ru_source = ?, updated_at = ? WHERE player_id = ?')
      .bind(name, shortRu(name), 'bot', now, playerId),
    db.prepare(`INSERT INTO player_name_overrides (player_id, name_ru, previous_name_ru, action, changed_by, changed_by_name, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET name_ru = excluded.name_ru, previous_name_ru = excluded.previous_name_ru,
        action = excluded.action, changed_by = excluded.changed_by, changed_by_name = excluded.changed_by_name, changed_at = excluded.changed_at`)
      .bind(playerId, name, player.name_ru, action, admin?.id ?? null, adminName, now),
    db.prepare(`INSERT INTO player_name_history (player_id, old_name_ru, new_name_ru, action, changed_by, changed_by_name, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(playerId, player.name_ru, name, action, admin?.id ?? null, adminName, now),
    db.prepare('INSERT OR IGNORE INTO player_aliases (alias_key, player_id, alias, source) VALUES (?, ?, ?, ?)')
      .bind(tokenKey(name), playerId, name, 'bot'),
  ]);
  return { ok: true, old: player.name_ru, name };
}

// Next player whose name nobody has confirmed yet: not from sports.ru, no bot decision,
// best ranking first. `skip` holds player_ids the admin chose to skip in this session.
export async function nextUnverified(db, skip = []) {
  const skipList = skip.slice(-200);
  const sql = `SELECT p.* FROM players p
    WHERE p.name_ru_source NOT IN ('sportsru', 'bot', 'override')
      AND p.player_id NOT IN (SELECT player_id FROM player_name_overrides)
      ${skipList.length ? `AND p.player_id NOT IN (${skipList.map(() => '?').join(',')})` : ''}
    ${RANK_ORDER} LIMIT 1`;
  return db.prepare(sql).bind(...skipList).first();
}

export async function nameStats(db) {
  const { results } = await db.prepare('SELECT name_ru_source AS source, COUNT(*) AS n FROM players GROUP BY name_ru_source').all();
  const total = await db.prepare('SELECT COUNT(*) AS n FROM players').first();
  const verified = await db.prepare('SELECT COUNT(*) AS n FROM player_name_overrides').first();
  return { total: total?.n ?? 0, by_source: results, bot_decisions: verified?.n ?? 0 };
}
