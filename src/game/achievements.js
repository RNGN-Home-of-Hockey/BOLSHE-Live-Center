// Achievements of a fan, each with five levels: reach the first threshold — level 1, the
// second — level 2, and so on ("5 верных подряд — 1-й уровень, 10 подряд — 2-й"). Every vote
// moves some bar forward, so the profile always shows how far the next level is.
// Input rows (one per vote, oldest first): {pick, winner, start_at, voted_at, surface, pre1, pre2,
// n1, n2, n, mine, bolshe}; winner is null until the match is decided; mine = a «Мой игрок» plays.

export const ACHIEVEMENTS = [
  { key: 'streak', icon: '🔥', title: 'Горячая серия', unit: 'верных подряд', levels: [5, 10, 20, 35, 50],
    about: 'Верные прогнозы подряд — лучшая серия' },
  { key: 'correct', icon: '🎯', title: 'Знаток', unit: 'верных прогнозов', levels: [10, 50, 150, 400, 1000],
    about: 'Сколько всего прогнозов сыграло' },
  { key: 'upsets', icon: '👁', title: 'Охотник за сенсациями', unit: 'сенсаций', levels: [3, 10, 25, 50, 100],
    about: 'Угадал победу аутсайдера (коэффициент Winline 2.50 и выше)' },
  { key: 'contrarian', icon: '🛡', title: 'Против большинства', unit: 'побед вопреки', levels: [3, 10, 25, 50, 100],
    about: 'Угадал, когда так думали меньше 35% болельщиков' },
  { key: 'days', icon: '📅', title: 'Постоянство', unit: 'дней подряд', levels: [3, 7, 14, 30, 60],
    about: 'Голосовал каждый день — лучшая серия дней' },
  { key: 'votes', icon: '🗳', title: 'Голос болельщика', unit: 'прогнозов', levels: [10, 50, 200, 500, 1000],
    about: 'Сколько всего прогнозов сделано' },
  { key: 'bolshe', icon: '📺', title: 'Зритель «Больше»', unit: 'прогнозов на эфиры', levels: [10, 50, 150, 300, 600],
    about: 'Прогнозы на матчи, которые показывает «Больше»' },
  { key: 'loyal', icon: '🤝', title: 'Верность своим', unit: 'верных в матчах «Моих игроков»', levels: [5, 20, 50, 100, 200],
    about: 'Верные прогнозы в матчах игроков, за которыми ты следишь' },
  { key: 'app_days', icon: '📱', title: 'Каждый день с теннисом', unit: 'дней подряд в приложении', levels: [3, 7, 14, 30, 60],
    about: 'Заходил в приложение каждый день — лучшая серия' },
  { key: 'streams', icon: '▶️', title: 'Эфиры через приложение', unit: 'эфиров открыто', levels: [5, 20, 50, 100, 250],
    about: 'Трансляции «Больше», открытые из приложения' },
  { key: 'clay', icon: '🧱', title: 'Король грунта', unit: 'верных на грунте', levels: [5, 20, 50, 100, 200],
    about: 'Верные прогнозы на грунтовых турнирах' },
  { key: 'hard', icon: '⚡', title: 'Мастер харда', unit: 'верных на харде', levels: [5, 20, 50, 100, 200],
    about: 'Верные прогнозы на хардовых турнирах' },
  { key: 'grass', icon: '🌱', title: 'Травяной знаток', unit: 'верных на траве', levels: [3, 10, 25, 50, 100],
    about: 'Верные прогнозы на траве' },
  { key: 'follows', icon: '⭐', title: 'Свои люди', unit: 'игроков в «Моих»', levels: [3, 6, 10, 15, 25],
    about: 'Сколько игроков ты отметил звёздочкой' },
  { key: 'bracket', icon: '🏆', title: 'Мастер сетки', unit: 'очков за сетки', levels: [10, 50, 150, 400, 1000],
    about: 'Очки за угаданные матчи в сетках турниров' },
];

// Categories of the «Достижения» section, and the XP a fan gets for reaching each level (1…5).
export const ACH_CATEGORIES = {
  streak: 'predictions', correct: 'predictions', upsets: 'predictions', contrarian: 'predictions', votes: 'predictions',
  bracket: 'tournaments', clay: 'tournaments', hard: 'tournaments', grass: 'tournaments',
  loyal: 'players', follows: 'players',
  days: 'activity', app_days: 'activity', streams: 'activity',
  bolshe: 'community',
};
export const LEVEL_XP = [50, 100, 200, 300, 500];

const UPSET_ODDS = 2.5;
const MINORITY_SHARE = 0.35;
const MINORITY_VOTERS = 10;

const mskDay = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);

function bestDayRun(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && Date.parse(`${d}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`) === 86400e3 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// The numbers behind every achievement.
export function fanMetrics(rows, { follows = 0, bracketPoints = 0, appDays = [], streams = 0 } = {}) {
  const m = {
    streak: 0, correct: 0, upsets: 0, contrarian: 0, days: 0, votes: rows.length, bolshe: 0, loyal: 0, clay: 0, hard: 0, grass: 0,
    follows, bracket: bracketPoints, app_days: bestDayRun(appDays), streams,
  };
  let run = 0;
  for (const r of [...rows].sort((a, b) => Date.parse(a.start_at ?? 0) - Date.parse(b.start_at ?? 0))) {
    if (r.bolshe) m.bolshe += 1;
    if (r.winner == null) continue;
    const right = r.winner === r.pick;
    run = right ? run + 1 : 0;
    m.streak = Math.max(m.streak, run);
    if (!right) continue;
    m.correct += 1;
    const price = r.pick === 1 ? r.pre1 : r.pre2;
    if (price >= UPSET_ODDS) m.upsets += 1;
    const share = r.n ? (r.pick === 1 ? r.n1 : r.n2) / r.n : 1;
    if (r.n >= MINORITY_VOTERS && share < MINORITY_SHARE) m.contrarian += 1;
    if (r.mine) m.loyal += 1;
    if (r.surface === 'clay') m.clay += 1;
    else if (r.surface === 'hard') m.hard += 1;
    else if (r.surface === 'grass') m.grass += 1;
  }
  m.days = bestDayRun(rows.map((r) => mskDay(r.voted_at ?? r.start_at)).filter(Boolean));
  return m;
}

// Level 0…5 of one achievement and the way to the next level.
export function achievementLevel(def, value) {
  const level = def.levels.filter((t) => value >= t).length;
  const next = def.levels[level] ?? null;
  const from = level ? def.levels[level - 1] : 0;
  return {
    key: def.key, icon: def.icon, title: def.title, about: def.about, unit: def.unit, cat: ACH_CATEGORIES[def.key] ?? 'activity',
    value, level, max_level: def.levels.length, next,
    reward: LEVEL_XP[level] ?? 0, // XP for the next level
    earned_xp: LEVEL_XP.slice(0, level).reduce((a, c) => a + c, 0),
    progress: next ? Math.min(1, (value - from) / (next - from)) : 1,
    to_next: next ? next - value : 0,
  };
}

// XP from achievements: every reached level adds LEVEL_XP of that level.
export const achievementsXp = (list) => list.reduce((a, c) => a + (c.earned_xp ?? 0), 0);

export function fanAchievements(rows, extra = {}) {
  const metrics = fanMetrics(rows, extra);
  return ACHIEVEMENTS.map((def) => achievementLevel(def, metrics[def.key] ?? 0));
}
