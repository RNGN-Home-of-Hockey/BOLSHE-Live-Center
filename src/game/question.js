// «Вопрос дня»: the app asks one question a day by itself, about the running tournaments —
// "Дойдёт ли Синнер до полуфинала?", "Сможет ли Швёнтек выиграть турнир?" — and settles it by the
// draw (worker/src/brackets.js keeps the draws fresh). Answers: 0 «Да», 1 «Нет»,
// 2 «Затрудняюсь» (counts in the poll, gives no XP).

import { participants } from './bracket.js';

export const QUESTION_OPTIONS = ['Да', 'Нет', 'Затрудняюсь'];
// Answering «Да» or «Нет» gives XP like a match vote; the right answer gives more.
export const QUESTION_XP = { answer: 10, correct: 20 };

const GOALS = {
  semi: { fromEnd: 2, text: (n) => `Дойдёт ли ${n} до полуфинала?` },
  final: { fromEnd: 1, text: (n) => `Дойдёт ли ${n} до финала?` },
  title: { fromEnd: 0, text: (n) => `Сможет ли ${n} выиграть турнир?` },
};

const lastName = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
};

// Where a player stands: the furthest round reached (index), knocked out or not, champion.
export function playerRun(draw, pos) {
  const sides = participants(draw);
  let reached = -1;
  let out = false;
  draw.rounds.forEach((round, r) => round.matches.forEach((m, k) => {
    const [h, a] = sides[r][k];
    if (h !== pos && a !== pos) return;
    reached = Math.max(reached, r);
    if (m.w != null && m.w !== pos) out = true;
  }));
  return { reached, out, champion: draw.rounds.at(-1)?.matches[0]?.w === pos };
}

// The round a goal needs: the title is "one round after the final".
const targetOf = (draw, goal) => draw.rounds.length - GOALS[goal].fromEnd;

// 0 «Да» once the player gets there, 1 «Нет» once knocked out before, null while open.
export function questionAnswer(draw, fsId, goal) {
  const p = draw.players.find((x) => x.fs_id === fsId);
  if (!p || !GOALS[goal]) return null;
  const run = playerRun(draw, p.pos);
  const target = targetOf(draw, goal);
  if (target >= draw.rounds.length) return run.champion ? 0 : run.out ? 1 : null;
  if (run.reached >= target) return 0;
  return run.out ? 1 : null;
}

// The question of the day: the best-ranked player still in a running draw who was not asked
// about in the last days; ATP and WTA take turns by day. The goal grows with the stage:
// early rounds — the semi-final, the quarter-finals — the final, later — the title.
export function pickQuestion(brackets, { day, recent = [] }) {
  const asked = new Set(recent.map((q) => q.player_fs_id));
  const preferTour = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400e3) % 2 === 0 ? 'ATP' : 'WTA';
  const candidates = [];
  for (const b of brackets) {
    const { draw } = b;
    const n = draw.rounds.length;
    if (n < 3 || draw.rounds.at(-1).matches[0]?.w != null) continue;
    for (const p of draw.players) {
      if (!p.rank || !p.fs_id || asked.has(p.fs_id)) continue;
      const run = playerRun(draw, p.pos);
      if (run.out || run.reached < 0) continue;
      const left = n - run.reached; // rounds still to play, the current one included
      const goal = left >= 4 ? 'semi' : left === 3 ? 'final' : 'title';
      candidates.push({ b, p, goal });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((x, y) => (y.b.tour === preferTour) - (x.b.tour === preferTour) || x.p.rank - y.p.rank);
  const { b, p, goal } = candidates[0];
  const name = lastName(p.name_ru ?? p.name);
  return {
    day,
    goal,
    question: GOALS[goal].text(name),
    bracket_key: b.bracket_key,
    tournament: b.name,
    player_fs_id: p.fs_id,
    player_id: p.player_id ?? null,
    player_name: p.name_ru ?? p.name,
    player_rank: p.rank,
    photo: p.photo ?? null,
  };
}
