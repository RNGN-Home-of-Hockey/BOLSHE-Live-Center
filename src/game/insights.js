// Player statistics and "insights": numbers summed over a player's matches of the last 52 weeks
// (Flashscore match statistics), the ATP-style ratings and a 0–10 score for every metric — the
// player's place among the players of the same tour (10 = best). Shown as round charts.
//
// ATP formulas (atptour.com stats leaderboard):
//   serve rating    = 1st serve in % + 1st serve points won % + 2nd serve points won % + service games won % + aces per match − double faults per match
//   return rating   = 1st serve return points won % + 2nd serve return points won % + return games won % + break points converted %
//   under pressure  = break points converted % + break points saved % + tie-breaks won % + deciding sets won %

export const MIN_MATCHES = 8;

const pct = (won, total) => (total ? (100 * won) / total : null);
const per = (value, matches) => (matches ? value / matches : null);

// One row of summed counts (see migrations/0009) → every metric.
export function playerMetrics(s) {
  const m = {
    matches: s.matches,
    wins: s.wins,
    losses: s.matches - s.wins,
    win_pct: pct(s.wins, s.matches),
    aces_pm: per(s.aces, s.matches),
    df_pm: per(s.df, s.matches),
    // counted only over matches that have both numbers (first_in_num / first_in_den from the summary query)
    first_in_pct: pct(s.first_in_num ?? s.first_total, s.first_in_den ?? s.sv_pts_total),
    first_won_pct: pct(s.first_won, s.first_total),
    second_won_pct: pct(s.second_won, s.second_total),
    bp_saved_pct: pct(s.bp_saved_won, s.bp_saved_total),
    sv_games_pct: pct(s.sv_games_won, s.sv_games_total),
    ret1_pct: pct(s.ret1_won, s.ret1_total),
    ret2_pct: pct(s.ret2_won, s.ret2_total),
    bp_conv_pct: pct(s.bp_conv_won, s.bp_conv_total),
    rt_games_pct: pct(s.rt_games_won, s.rt_games_total),
    tb_pct: pct(s.tb_won, s.tb_total),
    deciding_pct: pct(s.deciding_won, s.deciding_played),
    winners_pm: per(s.winners, s.matches),
    ue_pm: per(s.ue, s.matches),
    net_pct: pct(s.net_won, s.net_total),
    pts_pct: pct(s.tot_pts_won, s.tot_pts_total),
  };
  const sum = (...xs) => (xs.every((x) => x != null) ? xs.reduce((a, b) => a + b, 0) : null);
  m.serve_rating = sum(m.first_in_pct, m.first_won_pct, m.second_won_pct, m.sv_games_pct, m.aces_pm, m.df_pm == null ? null : -m.df_pm);
  m.return_rating = sum(m.ret1_pct, m.ret2_pct, m.rt_games_pct, m.bp_conv_pct);
  m.pressure_rating = sum(m.bp_conv_pct, m.bp_saved_pct, m.tb_pct ?? 50, m.deciding_pct ?? 50);
  return m;
}

// Everything the players list can be sorted by. low = smaller is better.
export const STAT_FIELDS = [
  { key: 'serve_rating', label: 'Рейтинг подачи', short: 'Подача', fmt: 'n1', insight: true },
  { key: 'return_rating', label: 'Рейтинг приёма', short: 'Приём', fmt: 'n1', insight: true },
  { key: 'pressure_rating', label: 'Игра под давлением', short: 'Давление', fmt: 'n1', insight: true },
  { key: 'wins', label: 'Победы', short: 'Победы', fmt: 'int' },
  { key: 'win_pct', label: 'Процент побед', short: 'Победы %', fmt: 'pct', insight: true },
  { key: 'aces_pm', label: 'Эйсы за матч', short: 'Эйсы', fmt: 'n1', insight: true },
  { key: 'df_pm', label: 'Двойные ошибки за матч', short: 'Двойные', fmt: 'n1', low: true },
  { key: 'first_in_pct', label: 'Попадание первой подачей', short: '1-я подача', fmt: 'pct' },
  { key: 'first_won_pct', label: 'Очки на первой подаче', short: 'Очки 1-й', fmt: 'pct' },
  { key: 'second_won_pct', label: 'Очки на второй подаче', short: 'Очки 2-й', fmt: 'pct' },
  { key: 'sv_games_pct', label: 'Взятые геймы на своей подаче', short: 'Геймы подачи', fmt: 'pct' },
  { key: 'bp_saved_pct', label: 'Спасённые брейк-пойнты', short: 'Спасено БП', fmt: 'pct', insight: true },
  { key: 'ret1_pct', label: 'Очки на приёме первой подачи', short: 'Приём 1-й', fmt: 'pct' },
  { key: 'ret2_pct', label: 'Очки на приёме второй подачи', short: 'Приём 2-й', fmt: 'pct' },
  { key: 'rt_games_pct', label: 'Взятые геймы на приёме', short: 'Геймы приёма', fmt: 'pct' },
  { key: 'bp_conv_pct', label: 'Реализованные брейк-пойнты', short: 'Брейки', fmt: 'pct', insight: true },
  { key: 'tb_pct', label: 'Выигранные тай-брейки', short: 'Тай-брейки', fmt: 'pct' },
  { key: 'deciding_pct', label: 'Выигранные решающие сеты', short: 'Решающие сеты', fmt: 'pct' },
  { key: 'winners_pm', label: 'Виннерсы за матч', short: 'Виннерсы', fmt: 'n1' },
  { key: 'ue_pm', label: 'Невынужденные ошибки за матч', short: 'Ошибки', fmt: 'n1', low: true },
  { key: 'net_pct', label: 'Очки у сетки', short: 'У сетки', fmt: 'pct' },
  { key: 'pts_pct', label: 'Выигранные очки', short: 'Очки %', fmt: 'pct' },
];

// 0–10 for every metric: the share of the tour's top-200 players (with enough matches) this player
// beats; players outside the top-200 are placed on the same scale.
export const SCORE_TOP = 200;
export function scoreTour(rows) {
  const eligible = rows.filter((r) => r.metrics.matches >= MIN_MATCHES && (r.rank == null || r.rank <= SCORE_TOP));
  const scores = new Map(rows.map((r) => [r.fs_id, {}]));
  for (const field of STAT_FIELDS) {
    const values = eligible.map((r) => r.metrics[field.key]).filter((v) => v != null).sort((a, b) => a - b);
    if (values.length < 5) continue;
    for (const r of rows) {
      const v = r.metrics[field.key];
      if (v == null || r.metrics.matches < MIN_MATCHES) continue;
      let below = 0;
      let equal = 0;
      for (const x of values) { if (x < v) below += 1; else if (x === v) equal += 1; }
      const share = (below + equal / 2) / values.length;
      scores.get(r.fs_id)[field.key] = Math.round((field.low ? 1 - share : share) * 100) / 10;
    }
  }
  return scores;
}
