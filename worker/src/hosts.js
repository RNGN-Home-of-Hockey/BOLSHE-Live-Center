// «Эксперты «Больше»»: the project's hosts and commentators vote in the app themselves, like any fan.
//   GET /api/hosts          every host with accuracy and rating points; the fans' accuracy to compare with
//   GET /api/hosts/<id>     one host: the last picks, accuracy, and «Сравнить со мной»
// The match card gets `experts` — the hosts' picks for that match.
// Bot, admins only: /host_link Имя Фамилия = @username, /host_unlink Имя Фамилия, /hosts (telegram.js).
// Telegram ids are never sent to the app.

import { mediaUrl } from '../../src/lib/media.js';
import { MATCH_SELECT, shapeMatch } from './matches-sync.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const ROLE_ORDER = { host: 0, ambassador: 1, commentator: 2 };

const shapeHost = (h, s = null) => ({
  id: h.host_id, name: h.name, role: h.role, bio: h.bio, photo: h.photo_url ? (mediaUrl(h.photo_url) ?? h.photo_url) : null, photo_credit: h.photo_credit ?? null,
  aliases: String(h.aliases ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  linked: Boolean(h.telegram_user_id),
  votes: s?.votes ?? 0, decided: s?.decided ?? 0, right: s?.right ?? 0, points: s?.points ?? 0,
  accuracy: s?.decided ? Math.round((100 * s.right) / s.decided) : null,
});

// Votes, decided, right and rating points (as in rating.js) of the given Telegram ids.
async function voteStats(db, ids) {
  if (!ids.length) return new Map();
  const { results } = await db.prepare(`WITH tally AS (
      SELECT match_id, SUM(pick = 1) AS n1, SUM(pick = 2) AS n2, COUNT(*) AS n FROM votes GROUP BY match_id)
    SELECT v.user_id, COUNT(*) AS votes, SUM(m.winner IS NOT NULL) AS decided, SUM(m.winner = v.pick) AS right_n,
      SUM(CASE WHEN m.winner = v.pick THEN (CASE WHEN t.n >= 10 AND (CASE v.pick WHEN 1 THEN t.n1 ELSE t.n2 END) * 1.0 / t.n < 0.35 THEN 20 ELSE 10 END) ELSE 0 END) AS pts
    FROM votes v JOIN matches m ON m.match_id = v.match_id JOIN tally t ON t.match_id = v.match_id
    WHERE v.user_id IN (${ids.map(() => '?').join(',')}) GROUP BY v.user_id`).bind(...ids).all();
  return new Map(results.map((r) => [Number(r.user_id), { votes: r.votes, decided: r.decided ?? 0, right: r.right_n ?? 0, points: r.pts ?? 0 }]));
}

export async function listHosts(env) {
  const db = env.DB;
  const { results: hosts } = await db.prepare('SELECT * FROM hosts WHERE active = 1 ORDER BY sort, name').all();
  const ids = hosts.map((h) => h.telegram_user_id).filter(Boolean).map(Number);
  const stats = await voteStats(db, ids);
  const fans = await db.prepare(`SELECT COUNT(*) AS decided, SUM(m.winner = v.pick) AS right_n FROM votes v JOIN matches m ON m.match_id = v.match_id
    WHERE m.winner IS NOT NULL ${ids.length ? `AND v.user_id NOT IN (${ids.map(() => '?').join(',')})` : ''}`).bind(...ids).first();
  const shaped = hosts.map((h) => shapeHost(h, stats.get(Number(h.telegram_user_id))));
  const hostDecided = shaped.reduce((a, h) => a + h.decided, 0);
  const hostRight = shaped.reduce((a, h) => a + h.right, 0);
  return {
    hosts: shaped.sort((a, c) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[c.role] ?? 9)),
    hosts_accuracy: hostDecided ? Math.round((100 * hostRight) / hostDecided) : null,
    fans_accuracy: fans?.decided ? Math.round((100 * (fans.right_n ?? 0)) / fans.decided) : null,
  };
}

export async function hostView(env, hostId, user) {
  const db = env.DB;
  const h = await db.prepare('SELECT * FROM hosts WHERE host_id = ? AND active = 1').bind(hostId).first();
  if (!h) return null;
  const tg = h.telegram_user_id ? Number(h.telegram_user_id) : null;
  const stats = tg ? (await voteStats(db, [tg])).get(tg) : null;
  let picks = [];
  let compare = null;
  if (tg) {
    const { results: votes } = await db.prepare('SELECT match_id, pick FROM votes WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').bind(tg).all();
    if (votes.length) {
      const { results } = await db.prepare(`${MATCH_SELECT} WHERE m.match_id IN (${votes.map(() => '?').join(',')})`).bind(...votes.map((v) => v.match_id)).all();
      const byId = new Map(results.map((r) => [r.match_id, shapeMatch(r)]));
      picks = votes.filter((v) => byId.has(v.match_id)).map((v) => {
        const m = byId.get(v.match_id);
        return { match: m, pick: v.pick, right: m.winner ? m.winner === v.pick : null };
      });
    }
    if (user && user.id !== tg) {
      const c = await db.prepare(`SELECT COUNT(*) AS common, SUM(a.pick = m.winner) AS host_right, SUM(b.pick = m.winner) AS me_right
        FROM votes a JOIN votes b ON b.match_id = a.match_id AND b.user_id = ? JOIN matches m ON m.match_id = a.match_id
        WHERE a.user_id = ? AND m.winner IS NOT NULL`).bind(user.id, tg).first();
      compare = { common: c?.common ?? 0, host_right: c?.host_right ?? 0, me_right: c?.me_right ?? 0 };
    }
  }
  // The host's «Больше» broadcasts as a commentator (the schedule spells names in different ways).
  const names = [h.name, ...String(h.aliases ?? '').split(',').map((x) => x.trim()).filter(Boolean)];
  const marks = names.map(() => '?').join(',');
  const count = await db.prepare(`SELECT COUNT(*) AS n, MIN(date_msk) AS first FROM broadcasts WHERE status NOT IN ('removed', 'cancelled')
    AND (commentator1 IN (${marks}) OR commentator2 IN (${marks}))`).bind(...names, ...names).first();
  const { results: casts } = await db.prepare(`SELECT b.date_msk, b.tournament, b.round, b.vk_url, b.player1_ru, b.player2_ru,
      p1.name_ru AS p1, p2.name_ru AS p2,
      (SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'cover/' || b.vk_video AND status = 'ok') AS cover
    FROM broadcasts b LEFT JOIN players p1 ON p1.player_id = b.player1_id LEFT JOIN players p2 ON p2.player_id = b.player2_id
    WHERE b.status NOT IN ('removed', 'cancelled') AND (b.commentator1 IN (${marks}) OR b.commentator2 IN (${marks})) AND b.date_msk <= date('now')
    ORDER BY b.date_msk DESC, b.time_msk DESC LIMIT 12`).bind(...names, ...names).all();
  const broadcasts = {
    count: count?.n ?? 0, first: count?.first ?? null,
    last: casts.map((b) => ({ date: b.date_msk, tournament: b.tournament, round: b.round, vk_url: b.vk_url, cover: mediaUrl(b.cover),
      players: [b.p1 ?? b.player1_ru, b.p2 ?? b.player2_ru].filter(Boolean) })),
  };
  return { host: shapeHost(h, stats), picks, compare, broadcasts };
}

// The hosts' picks for one match («Что говорят эксперты»).
export async function matchExperts(db, matchId) {
  try {
    const { results } = await db.prepare(`SELECT h.host_id, h.name, h.role, h.photo_url, v.pick FROM hosts h
      JOIN votes v ON v.user_id = h.telegram_user_id WHERE v.match_id = ? AND h.active = 1 ORDER BY h.sort`).bind(matchId).all();
    return results.map((r) => ({ id: r.host_id, name: r.name, role: r.role, photo: r.photo_url ? (mediaUrl(r.photo_url) ?? r.photo_url) : null, pick: r.pick }));
  } catch {
    return []; // no hosts table yet
  }
}

// ---- the bot (admins) ----
async function findHost(db, text) {
  const { results } = await db.prepare('SELECT * FROM hosts').all();
  const want = norm(text);
  return results.find((h) => norm(h.name) === want || String(h.aliases ?? '').split(',').some((a) => norm(a) === want)) ?? null;
}

// «/host_link Вадим Азаренко = @username»: the host must have opened the bot once (bot_users).
export async function linkHost(db, nameText, username) {
  const h = await findHost(db, nameText);
  if (!h) return { ok: false, error: `Не нашёл ведущего «${nameText}». Список: /hosts` };
  const u = await db.prepare('SELECT telegram_user_id, first_name FROM bot_users WHERE lower(username) = lower(?)').bind(String(username).replace(/^@/, '')).first();
  if (!u) return { ok: false, error: `@${String(username).replace(/^@/, '')} ещё не открывал бота — пусть нажмёт /start, потом повтори.` };
  await db.prepare('UPDATE hosts SET telegram_user_id = NULL WHERE telegram_user_id = ?').bind(u.telegram_user_id).run();
  await db.prepare('UPDATE hosts SET telegram_user_id = ? WHERE host_id = ?').bind(u.telegram_user_id, h.host_id).run();
  return { ok: true, name: h.name, who: u.first_name };
}

export async function unlinkHost(db, nameText) {
  const h = await findHost(db, nameText);
  if (!h) return { ok: false, error: `Не нашёл ведущего «${nameText}».` };
  await db.prepare('UPDATE hosts SET telegram_user_id = NULL WHERE host_id = ?').bind(h.host_id).run();
  return { ok: true, name: h.name };
}

export async function hostsText(db) {
  const { results } = await db.prepare('SELECT name, role, telegram_user_id FROM hosts WHERE active = 1 ORDER BY sort').all();
  const label = { host: 'ведущие', ambassador: 'амбассадоры', commentator: 'комментаторы' };
  const lines = [];
  for (const role of ['host', 'ambassador', 'commentator']) {
    const list = results.filter((r) => r.role === role);
    if (!list.length) continue;
    lines.push(`<b>${label[role]}</b>`, ...list.map((r) => `${r.telegram_user_id ? '✅' : '—'} ${r.name}`), '');
  }
  return `${lines.join('\n')}Привязать: /host_link Имя Фамилия = @ник (ведущий должен один раз открыть бота).`;
}
