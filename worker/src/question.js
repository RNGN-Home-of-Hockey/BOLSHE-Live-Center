// «Вопрос дня» on the Worker: one question per Moscow day made from the running draws
// (src/game/question.js) and settled after every draws refresh.
//   GET  /api/question   today's question with the poll (+ the fan's answer, the hosts' answers once
//                        the fan has answered) and the last ones
//   POST /api/question   {pick: 0|1} — today's question only, until the player's next match starts

import { QUESTION_OPTIONS, QUESTION_XP, pickQuestion, questionAnswer, questionClosesAt } from '../../src/game/question.js';
import { mediaUrl } from '../../src/lib/media.js';
import { PHOTO_HQ } from './photos.js';

const mskDay = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const daysBefore = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) - n * 86400e3).toISOString().slice(0, 10);

export async function ensureQuestion(env, day = mskDay()) {
  const db = env.DB;
  if (await db.prepare('SELECT 1 AS x FROM daily_questions WHERE day = ?').bind(day).first()) return null;
  const { results } = await db.prepare("SELECT bracket_key, name, tour, draw_json FROM brackets WHERE status = 'open'").all();
  const { results: recent } = await db.prepare('SELECT player_fs_id FROM daily_questions WHERE day >= ?').bind(daysBefore(day, 5)).all();
  // Players on court in the next 10 hours go last: their vote would close too early.
  const now = Date.now();
  const { results: playing } = await db.prepare(`SELECT p1_fs_id AS a, p2_fs_id AS b FROM matches
    WHERE is_doubles = 0 AND status IN ('scheduled', 'live') AND start_at BETWEEN ? AND ?`)
    .bind(new Date(now - 12 * 3600e3).toISOString(), new Date(now + 10 * 3600e3).toISOString()).all();
  const soon = new Set(playing.flatMap((m) => [m.a, m.b]).filter(Boolean));
  const q = pickQuestion(results.map((b) => ({ ...b, draw: JSON.parse(b.draw_json) })), { day, recent, soon });
  if (!q) return null;
  await db.prepare(`INSERT OR IGNORE INTO daily_questions (day, goal, question, bracket_key, tournament, player_fs_id, player_id, player_name, player_rank, photo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(q.day, q.goal, q.question, q.bracket_key, q.tournament, q.player_fs_id, q.player_id, q.player_name, q.player_rank, q.photo, new Date().toISOString()).run();
  return q;
}

export async function settleQuestions(env) {
  const { results } = await env.DB.prepare(`SELECT q.day, q.goal, q.player_fs_id, b.draw_json
    FROM daily_questions q JOIN brackets b ON b.bracket_key = q.bracket_key WHERE q.answer IS NULL`).all();
  const now = new Date().toISOString();
  const settled = [];
  for (const q of results) {
    const answer = questionAnswer(JSON.parse(q.draw_json), q.player_fs_id, q.goal);
    if (answer == null) continue;
    await env.DB.prepare('UPDATE daily_questions SET answer = ?, resolved_at = ? WHERE day = ?').bind(answer, now, q.day).run();
    settled.push({ day: q.day, answer });
  }
  return settled;
}

// Runs with the draws refresh: first settle by the fresh draws, then ask today's question.
export async function questionUpkeep(env) {
  const settled = await settleQuestions(env);
  const created = await ensureQuestion(env);
  return { settled, created: created?.question ?? null };
}

// The player's first singles match after the question was asked: the vote closes when it starts.
async function nextMatchStart(db, q) {
  if (!q.player_fs_id) return null;
  const r = await db.prepare(`SELECT MIN(start_at) AS s FROM matches WHERE (p1_fs_id = ?1 OR p2_fs_id = ?1) AND is_doubles = 0
    AND start_at >= ?2 AND status NOT IN ('cancelled', 'postponed')`).bind(q.player_fs_id, q.created_at ?? `${q.day}T00:00:00Z`).first();
  return r?.s ?? null;
}

async function closesAt(db, q) {
  return questionClosesAt(q.day, await nextMatchStart(db, q));
}

// The hosts' answers («Эксперты «Больше»» vote like any fan).
async function hostAnswers(db, day) {
  try {
    const { results } = await db.prepare(`SELECT h.host_id, h.name, h.role, h.photo_url, v.pick FROM question_votes v
      JOIN hosts h ON h.telegram_user_id = v.user_id WHERE v.day = ? AND v.pick < 2 AND h.active = 1 ORDER BY h.sort`).bind(day).all();
    return results.map((r) => ({ id: r.host_id, name: r.name, role: r.role, photo: r.photo_url ? (mediaUrl(r.photo_url) ?? r.photo_url) : null, pick: r.pick }));
  } catch {
    return []; // no hosts table yet
  }
}

async function shape(db, q, user, today) {
  const { results } = await db.prepare('SELECT pick, COUNT(*) AS n FROM question_votes WHERE day = ? GROUP BY pick').bind(q.day).all();
  const counts = QUESTION_OPTIONS.map(() => 0);
  for (const r of results) if (counts[r.pick] != null) counts[r.pick] = r.n; // old «Затрудняюсь» votes are left out
  const mine = user ? await db.prepare('SELECT pick FROM question_votes WHERE day = ? AND user_id = ?').bind(q.day, user.id).first() : null;
  const pick = mine?.pick != null && mine.pick < QUESTION_OPTIONS.length ? mine.pick : null;
  const hq = q.player_fs_id ? await db.prepare(`SELECT ${PHOTO_HQ('?')} AS p`).bind(q.player_fs_id).first() : null;
  const closes = q.day === today ? await closesAt(db, q) : null;
  const open = q.answer == null && q.day === today && Date.now() < Date.parse(closes);
  return {
    day: q.day,
    question: q.question,
    goal: q.goal,
    tournament: q.tournament,
    bracket_key: q.bracket_key,
    options: QUESTION_OPTIONS,
    xp: QUESTION_XP,
    player: { id: q.player_id, name: q.player_name, rank: q.player_rank, photo: q.photo, photo_hq: mediaUrl(hq?.p) },
    counts,
    total: counts.reduce((a, n) => a + n, 0),
    pick,
    answer: q.answer ?? null,
    open,
    closes_at: closes,
    // Shown once the fan has answered (or the vote is over), not to sway the answer.
    hosts: q.day === today && (pick != null || !open) ? await hostAnswers(db, q.day) : null,
  };
}

// Today's question for the home card (no poll, no fan): asked on the spot if the upkeep has not yet.
export async function todayQuestion(env) {
  const today = mskDay();
  const read = () => env.DB.prepare('SELECT day, question, tournament, photo, answer FROM daily_questions WHERE day = ?').bind(today).first();
  let q = await read();
  if (!q && await ensureQuestion(env, today)) q = await read();
  return q ?? null;
}

export async function questionView(env, user) {
  const db = env.DB;
  const today = mskDay();
  await todayQuestion(env);
  const { results } = await db.prepare('SELECT * FROM daily_questions WHERE day <= ? ORDER BY day DESC LIMIT 7').bind(today).all();
  const all = await Promise.all(results.map((q) => shape(db, q, user, today)));
  return { today: all.find((q) => q.day === today) ?? null, past: all.filter((q) => q.day !== today) };
}

export async function answerQuestion(env, user, body) {
  const pick = Number(body?.pick);
  if (![0, 1].includes(pick)) return { ok: false, status: 400, error: 'pick must be 0 or 1' };
  const today = mskDay();
  const q = await env.DB.prepare('SELECT * FROM daily_questions WHERE day = ?').bind(today).first();
  if (!q) return { ok: false, status: 404, error: 'Сегодня вопроса нет' };
  if (q.answer != null) return { ok: false, status: 409, error: 'Ответ уже известен — голосование закрыто' };
  if (Date.now() >= Date.parse(await closesAt(env.DB, q))) return { ok: false, status: 409, error: 'Голосование закрыто — матч уже начался' };
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO question_votes (day, user_id, pick, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(day, user_id) DO UPDATE SET pick = excluded.pick, updated_at = excluded.updated_at`)
    .bind(today, user.id, pick, now, now).run();
  return { ok: true, ...(await questionView(env, user)) };
}
