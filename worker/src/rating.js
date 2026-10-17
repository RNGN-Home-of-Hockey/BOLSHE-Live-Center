// «Рейтинг»: competitive points for right predictions only, apart from XP (XP also grows from
// activity and achievements; points let a newcomer compete with veterans):
//   a right winner — 10 (20 when fewer than 35% of at least 10 voters thought so),
//   a right «Вопрос дня» — 10, bracket points — as they are.
//   GET /api/rating?period=all|week|tournament&t=<tournament_key>
// A fan who hid their results (Настройки) is «Болельщик ####» in the table.

const RIGHT = 10;
const MINORITY = 20;
const QUESTION = 10;
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString();
const mskDay = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);

// Points of every fan: [{user_id, points, right}] sorted, places included.
// `until` (ISO) counts only matches and questions decided before it — "a week ago" for the place change.
export async function ratingTable(db, { period = 'all', tournament = null, until = null } = {}) {
  const where = ['m.winner IS NOT NULL', 'm.winner = v.pick'];
  const binds = [];
  if (period === 'week') { where.push('m.start_at >= ?'); binds.push(daysAgo(7)); }
  if (period === 'tournament') { where.push('m.tournament_key = ?'); binds.push(tournament); }
  if (until) { where.push('m.start_at < ?'); binds.push(until); }
  const { results: votes } = await db.prepare(`WITH tally AS (
      SELECT match_id, SUM(pick = 1) AS n1, SUM(pick = 2) AS n2, COUNT(*) AS n FROM votes GROUP BY match_id)
    SELECT v.user_id, COUNT(*) AS right_n,
      SUM(CASE WHEN t.n >= 10 AND (CASE v.pick WHEN 1 THEN t.n1 ELSE t.n2 END) * 1.0 / t.n < 0.35 THEN ${MINORITY} ELSE ${RIGHT} END) AS pts
    FROM votes v JOIN matches m ON m.match_id = v.match_id JOIN tally t ON t.match_id = v.match_id
    WHERE ${where.join(' AND ')} GROUP BY v.user_id`).bind(...binds).all();
  const table = new Map(votes.map((r) => [Number(r.user_id), { points: r.pts ?? 0, right: r.right_n ?? 0 }]));
  const add = (id, pts, right = 0) => {
    const row = table.get(Number(id)) ?? { points: 0, right: 0 };
    row.points += pts ?? 0;
    row.right += right;
    table.set(Number(id), row);
  };
  if (period !== 'tournament') {
    try {
      const qWhere = ['q.answer IS NOT NULL', 'q.answer = v.pick'];
      const qBinds = [];
      if (period === 'week') { qWhere.push('q.day >= ?'); qBinds.push(mskDay(daysAgo(7))); }
      if (until) { qWhere.push('q.resolved_at < ?'); qBinds.push(until); }
      const { results } = await db.prepare(`SELECT v.user_id, COUNT(*) AS n FROM question_votes v JOIN daily_questions q ON q.day = v.day
        WHERE ${qWhere.join(' AND ')} GROUP BY v.user_id`).bind(...qBinds).all();
      for (const r of results) add(r.user_id, r.n * QUESTION, r.n);
    } catch { /* no questions table yet */ }
  }
  if (period !== 'week') {
    try {
      const { results } = period === 'tournament'
        ? await db.prepare(`SELECT e.user_id, SUM(e.points) AS p FROM bracket_entries e JOIN brackets b ON b.bracket_key = e.bracket_key
            WHERE b.tournament_key = ? GROUP BY e.user_id`).bind(tournament).all()
        : await db.prepare('SELECT user_id, SUM(points) AS p FROM bracket_entries GROUP BY user_id').all();
      for (const r of results) add(r.user_id, r.p);
    } catch { /* no brackets yet */ }
  }
  const rows = [...table].map(([user_id, r]) => ({ user_id, ...r })).filter((r) => r.points > 0).sort((a, c) => c.points - a.points || c.right - a.right);
  let place = 0;
  rows.forEach((r, i) => { place = i && rows[i - 1].points === r.points ? place : i + 1; r.place = place; });
  return rows;
}

// The fan's place now and a week ago (for «↑ 12 мест за неделю»).
export async function ratingPlace(db, userId) {
  const [now, before] = await Promise.all([ratingTable(db), ratingTable(db, { until: daysAgo(7) })]);
  const mine = now.find((r) => r.user_id === userId);
  const was = before.find((r) => r.user_id === userId);
  return { place: mine?.place ?? null, points: mine?.points ?? 0, of: now.length, place_week_ago: was?.place ?? null };
}

export async function ratingView(env, user, { period = 'all', tournament = null } = {}) {
  const p = ['all', 'week', 'tournament'].includes(period) ? period : 'all';
  if (p === 'tournament' && !tournament) return { ok: false, status: 400, error: 'tournament needed' };
  const rows = await ratingTable(env.DB, { period: p, tournament });
  const top = rows.slice(0, 50);
  const mine = user ? rows.find((r) => r.user_id === user.id) : null;
  const ids = [...new Set([...top.map((r) => r.user_id), ...(mine ? [mine.user_id] : [])])];
  const names = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT u.telegram_user_id AS id, u.first_name, u.username, COALESCE(f.public, 1) AS public
      FROM bot_users u LEFT JOIN fan_prefs f ON f.user_id = u.telegram_user_id WHERE u.telegram_user_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
    for (const r of results) names.set(Number(r.id), r);
  }
  const label = (id) => {
    const n = names.get(id);
    return !n || !n.public ? `Болельщик ${String(id).slice(-4)}` : n.first_name || (n.username ? `@${n.username}` : `Болельщик ${String(id).slice(-4)}`);
  };
  const shape = (r) => ({ place: r.place, name: label(r.user_id), points: r.points, right: r.right, me: user ? r.user_id === user.id : false });
  return { ok: true, period: p, tournament, fans: rows.length, top: top.map(shape), me: mine ? shape(mine) : null };
}
