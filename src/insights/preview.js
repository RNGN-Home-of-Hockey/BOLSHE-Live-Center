// «Теннис для чайников»: a few plain Russian sentences about a match — rankings, chances by Elo,
// recent form, form on this surface, head to head and who is the favourite.

const SURFACE_RU = { hard: 'харде', clay: 'грунте', grass: 'траве', carpet: 'ковре' };
const SURFACE_SECTION = { hard: 'Хард', clay: 'Грунт', grass: 'Трава', carpet: 'Ковёр' };
const FORM_N = 10;

const surname = (p, fallback) => {
  const name = p?.name_ru ?? fallback ?? '';
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 && !/\.$/.test(parts[parts.length - 1]) ? parts.slice(1).join(' ') : parts[0];
};

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function age(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  let years = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < b.getUTCMonth()
    || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export function eloChance(eloA, eloB) {
  if (eloA == null || eloB == null) return null;
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

// Wins/losses of `fsId` in a list of finished matches (newest first), current match excluded.
export function formOf(fsId, matches, excludeId, n = FORM_N) {
  const played = (matches ?? [])
    .filter((m) => m.match_id !== excludeId && m.winner && ['finished', 'retired'].includes(m.status))
    .slice(0, n);
  const wins = played.filter((m) => (m.p1_fs_id === fsId ? m.winner === 1 : m.winner === 2)).length;
  return { wins, played: played.length };
}

function blocksFor(h2h, surfaceTitle) {
  const inSection = (h2h ?? []).filter((b) => b.surface === surfaceTitle);
  return {
    last: inSection.filter((b) => b.kind === 'last'),
    meetings: inSection.find((b) => b.kind === 'h2h')?.matches ?? [],
  };
}

// "Последние игры: X" — X plays in every match of the block (the opponent shows up only once).
export const lastFor = (blocks, fsId) => blocks.last.find((b) => b.matches.length
  && b.matches.every((m) => m.p1_fs_id === fsId || m.p2_fs_id === fsId))?.matches ?? [];

export function buildPreview({ match, p1, p2, h2h, now = new Date() }) {
  const lines = [];
  const n1 = surname(p1, match.p1_name);
  const n2 = surname(p2, match.p2_name);
  const surface = match.surface ?? null;

  if (p1?.singles_rank && p2?.singles_rank) {
    lines.push(`Рейтинг: ${n1} — №${p1.singles_rank}, ${n2} — №${p2.singles_rank}.`);
  } else if (p1?.singles_rank || p2?.singles_rank) {
    const ranked = p1?.singles_rank ? [n1, p1.singles_rank, n2] : [n2, p2.singles_rank, n1];
    lines.push(`Рейтинг: ${ranked[0]} — №${ranked[1]}, ${ranked[2]} — без рейтинга или очень низко.`);
  }

  const surfKey = { hard: 'elo_hard', clay: 'elo_clay', grass: 'elo_grass' }[surface];
  const e1 = (surfKey && p1?.[surfKey]) ?? p1?.elo ?? null;
  const e2 = (surfKey && p2?.[surfKey]) ?? p2?.elo ?? null;
  const c1 = eloChance(e1, e2);
  let favorite = null;
  let chance = null;
  if (c1 != null) {
    const pct1 = Math.round(c1 * 100);
    chance = { p1: pct1, p2: 100 - pct1, by: surfKey && p1?.[surfKey] && p2?.[surfKey] ? `elo_${surface}` : 'elo' };
    const where = chance.by === 'elo' ? '' : ` на ${SURFACE_RU[surface]}`;
    lines.push(`Шансы по рейтингу Эло${where}: ${n1} ${pct1}% — ${n2} ${100 - pct1}%.`);
    if (pct1 >= 55) favorite = 1;
    else if (pct1 <= 45) favorite = 2;
  }

  const all = blocksFor(h2h, 'Все покрытия');
  const f1 = formOf(match.p1_fs_id, lastFor(all, match.p1_fs_id), match.match_id);
  const f2 = formOf(match.p2_fs_id, lastFor(all, match.p2_fs_id), match.match_id);
  if (f1.played && f2.played) {
    lines.push(`Форма: ${n1} — ${f1.wins} ${plural(f1.wins, 'победа', 'победы', 'побед')} в ${f1.played} последних матчах, ${n2} — ${f2.wins} из ${f2.played}.`);
  }

  if (surface && SURFACE_SECTION[surface]) {
    const onSurface = blocksFor(h2h, SURFACE_SECTION[surface]);
    const s1 = formOf(match.p1_fs_id, lastFor(onSurface, match.p1_fs_id), match.match_id);
    const s2 = formOf(match.p2_fs_id, lastFor(onSurface, match.p2_fs_id), match.match_id);
    if (s1.played >= 3 && s2.played >= 3) {
      lines.push(`На ${SURFACE_RU[surface]}: ${n1} — ${s1.wins} из ${s1.played}, ${n2} — ${s2.wins} из ${s2.played}.`);
    }
  }

  const meetings = all.meetings.filter((m) => m.match_id !== match.match_id && m.winner);
  if (meetings.length) {
    const w1 = meetings.filter((m) => (m.p1_fs_id === match.p1_fs_id ? m.winner === 1 : m.winner === 2)).length;
    const w2 = meetings.length - w1;
    const last = meetings[0];
    const lastWinner = (last.p1_fs_id === match.p1_fs_id ? last.winner === 1 : last.winner === 2) ? n1 : n2;
    const year = last.start_at ? new Date(last.start_at).getUTCFullYear() : '';
    const lead = w1 === w2 ? `поровну, ${w1}–${w2}` : `${w1 > w2 ? n1 : n2} ведёт ${Math.max(w1, w2)}–${Math.min(w1, w2)}`;
    lines.push(`Личные встречи: ${lead}. Последняя — ${last.tournament ?? ''} ${year}, победитель — ${lastWinner}.`.replace(/\s+/g, ' '));
  } else if (all.last.length) {
    lines.push('Раньше друг с другом не играли.');
  }

  const a1 = age(p1?.birth_date, now);
  const a2 = age(p2?.birth_date, now);
  if (a1 != null && a2 != null) {
    lines.push(`Возраст: ${n1} — ${a1} ${plural(a1, 'год', 'года', 'лет')}, ${n2} — ${a2} ${plural(a2, 'год', 'года', 'лет')}.`);
  }

  if (favorite) {
    const strong = chance && Math.max(chance.p1, chance.p2) >= 65;
    lines.push(strong ? `Явный фаворит — ${favorite === 1 ? n1 : n2}.` : `Чуть сильнее выглядит ${favorite === 1 ? n1 : n2}.`);
  } else if (chance) {
    lines.push('Шансы примерно равные.');
  }
  return { chance, favorite, lines };
}
