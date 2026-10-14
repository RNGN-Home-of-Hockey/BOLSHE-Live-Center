// Bracket game rules. A fan fills every match of the draw that is not decided yet (the winners
// they pick move on to the next round), sends it once, and it is locked until the tournament ends.
// A picked match scores only if it began after the bracket was sent. Later rounds are worth more:
// final 32, semi-final 16, quarter-final 8, 1/8 — 4, 1/16 — 2, earlier rounds — 1.
// Picks are keyed by "<round index from the first round>:<match index>" because future matches
// have no Flashscore id yet; a pick is the draw position of the player who wins.

export const ROUND_POINTS = [32, 16, 8, 4, 2];

export const pointsFor = (draw, roundIndex) => ROUND_POINTS[draw.rounds.length - 1 - roundIndex] ?? 1;

export const slotKey = (r, k) => `${r}:${k}`;

// Who plays in each match given the real results and the fan's picks.
export function participants(draw, picks = {}) {
  const sides = draw.rounds.map((round) => round.matches.map(() => [null, null]));
  const winnerOf = (r, k) => {
    const m = draw.rounds[r].matches[k];
    if (m?.w != null) return m.w;
    const p = picks[slotKey(r, k)];
    return p == null ? null : Number(p);
  };
  draw.rounds.forEach((round, r) => {
    round.matches.forEach((m, k) => {
      const h = m.h ?? (r > 0 ? winnerOf(r - 1, 2 * k) : null);
      const a = m.a ?? (r > 0 ? winnerOf(r - 1, 2 * k + 1) : null);
      sides[r][k] = [h, a];
    });
  });
  return sides;
}

// Every match still to be decided (live or not started) — these are what a fan fills.
export function openSlots(draw) {
  const out = [];
  draw.rounds.forEach((round, r) => round.matches.forEach((m, k) => {
    if (m.w == null) out.push({ r, k, key: slotKey(r, k), status: m.status, start: m.start });
  }));
  return out;
}

// Checks a full bracket: every open match has a pick, and each pick is one of the two players who
// reach that match through the earlier picks. Returns {ok, error, picks} with only valid keys.
export function validatePicks(draw, raw) {
  const picks = {};
  for (const slot of openSlots(draw)) {
    const value = raw?.[slot.key];
    if (value == null || !Number.isInteger(Number(value))) return { ok: false, error: `Не заполнен матч ${slot.key}` };
    picks[slot.key] = Number(value);
  }
  const sides = participants(draw, picks);
  for (const slot of openSlots(draw)) {
    const [h, a] = sides[slot.r][slot.k];
    if (picks[slot.key] !== h && picks[slot.key] !== a) return { ok: false, error: `Матч ${slot.key}: выбран игрок, который туда не проходит` };
  }
  return { ok: true, picks };
}

// Points of a sent bracket. Only matches that started after the bracket was sent count.
export function scoreBracket(draw, picks, submittedAt) {
  const sentAt = Date.parse(submittedAt);
  const eliminated = new Set();
  draw.rounds.forEach((round) => round.matches.forEach((m) => {
    if (m.w != null && m.h != null && m.a != null) eliminated.add(m.w === m.h ? m.a : m.h);
  }));
  let points = 0;
  let correct = 0;
  let decided = 0;
  let possible = 0;
  draw.rounds.forEach((round, r) => round.matches.forEach((m, k) => {
    const pick = picks[slotKey(r, k)];
    if (pick == null) return;
    const counts = !m.start || Date.parse(m.start) > sentAt;
    if (!counts) return;
    const value = pointsFor(draw, r);
    if (m.w != null) {
      decided += 1;
      if (m.w === pick) { points += value; correct += 1; }
    } else if (!eliminated.has(pick)) {
      possible += value;
    }
  }));
  return { points, correct, decided, possible: points + possible };
}

// The round being played now (the first one with an undecided match).
export function currentRound(draw) {
  const i = draw.rounds.findIndex((round) => round.matches.some((m) => m.w == null));
  return i < 0 ? draw.rounds.length - 1 : i;
}

export const isFinished = (draw) => draw.rounds.length > 0 && draw.rounds.at(-1).matches.every((m) => m.w != null);
