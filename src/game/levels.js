// Player levels for predictions and fantasy, named the tennis way: from the ball kid
// to a Grand Slam legend. After "Легенда" every LEGEND_STEP XP counts as one more slam.

export const LEVELS = [
  { key: 'ballkid', title: 'Подающий мячи', subtitle: 'Только вышел на корт', from: 0 },
  { key: 'amateur', title: 'Любитель', subtitle: 'Играет по выходным', from: 100 },
  { key: 'junior', title: 'Юниор', subtitle: 'Освоил основы', from: 300 },
  { key: 'qualifier', title: 'Квалификант', subtitle: 'Пробился через квалификацию', from: 600 },
  { key: 'tour', title: 'Игрок тура', subtitle: 'Свой в основной сетке', from: 1000 },
  { key: 'seeded', title: 'Сеяный', subtitle: 'Его уже опасаются', from: 1600 },
  { key: 'top10', title: 'Топ-10', subtitle: 'Один из лучших', from: 2500 },
  { key: 'number1', title: 'Первая ракетка', subtitle: 'Лучший из лучших', from: 3700 },
  { key: 'legend', title: 'Легенда', subtitle: 'Обладатель Большого шлема', from: 5000 },
];

export const LEGEND_STEP = 2500;

// Draft of XP rules (docs/PRODUCT.md); the scoring engine will use these numbers.
export const XP_RULES = {
  prediction_made: 10,
  winner_correct: 20,
  exact_score_correct: 50,
  against_majority_multiplier: 2,   // community share of the picked player < 35%
  against_majority_share: 0.35,
  daily_streak_day: 5,
  fantasy_entry: 100,
};

function slamWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'титул Большого шлема';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'титула Большого шлема';
  return 'титулов Большого шлема';
}

export function levelFor(xpValue) {
  const xp = Math.max(0, Math.floor(Number(xpValue) || 0));
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) if (xp >= LEVELS[i].from) index = i;
  const level = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  if (next) {
    const span = next.from - level.from;
    return {
      index: index + 1,
      key: level.key,
      title: level.title,
      subtitle: level.subtitle,
      xp,
      next_title: next.title,
      to_next: next.from - xp,
      progress: (xp - level.from) / span,
      slams: 0,
    };
  }
  // Legend: one more "slam" for every LEGEND_STEP XP above the threshold.
  const slams = 1 + Math.floor((xp - level.from) / LEGEND_STEP);
  const nextSlamAt = level.from + slams * LEGEND_STEP;
  return {
    index: index + 1,
    key: level.key,
    title: level.title,
    subtitle: `${slams} ${slamWord(slams)}`,
    xp,
    next_title: `Легенда · ${slams + 1}-й шлем`,
    to_next: nextSlamAt - xp,
    progress: (xp - (nextSlamAt - LEGEND_STEP)) / LEGEND_STEP,
    slams,
  };
}
