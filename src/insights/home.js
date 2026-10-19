// The home screen's choices (pure, tested): «Главный матч дня», the order of «Актуальные турниры»
// and the «Больше! Лайв» studio banner.

import { tournamentTier } from './tournaments.js';

const TIER_WEIGHT = { slam: 100, finals: 95, 1000: 80, 500: 60, 250: 45, tour: 45, challenger: 15, itf: 0 };
const OFF = ['cancelled', 'walkover', 'postponed'];
const DONE = ['finished', 'retired'];

const tierOf = (t) => t.tier ?? tournamentTier({ tour: t.tour, level: t.level, tournament: t.name });

// Later rounds matter more; the round is known from the «Больше» schedule ("Финал", "1/2 финала").
export function roundBonus(round) {
  const r = String(round ?? '').toLowerCase();
  if (!r) return 0;
  if (/^финал|^final/.test(r)) return 30;
  if (/1\/2|полуфинал|semi/.test(r)) return 20;
  if (/1\/4|четвертьфинал|quarter/.test(r)) return 10;
  return 0;
}

// How interesting a match is by itself: our broadcast, the tournament, the round, the players.
export function matchInterest(m) {
  let score = TIER_WEIGHT[tierOf(m.tournament)] ?? 30;
  if (m.bolshe) score += 50;
  score += roundBonus(m.bolshe?.round);
  for (const p of [m.p1, m.p2]) if (p?.rank && p.rank <= 50) score += ((51 - p.rank) / 50) * 12;
  if (m.p1?.is_russian || m.p2?.is_russian) score += 15;
  return score;
}

// «Главный матч дня»: the editors' pick (pickId) while it is among the candidates; otherwise the most
// interesting singles match — live first, then the next ones of today, then tomorrow's, then
// today's results. `today` is the Moscow date of the screen.
export function pickMainMatch(matches, { pickId = null, now = Date.now(), today }) {
  if (pickId) {
    const picked = matches.find((m) => m.match_id === pickId);
    if (picked) return { match: picked, manual: true };
  }
  let best = null;
  for (const m of matches) {
    if (m.is_doubles || OFF.includes(m.status)) continue;
    if (!m.bolshe && !['tour', 'challenger'].includes(m.tournament?.level)) continue;
    if (/квалификац/i.test(m.tournament?.name ?? '') && !m.bolshe) continue;
    const start = Date.parse(m.bolshe?.starts_at ?? m.start_at ?? '') || 0;
    let score = matchInterest(m);
    if (m.status === 'live') score += 40;
    else if (m.status === 'scheduled') {
      if (m.date_msk !== today) score -= 45;
      else if (start - now < 3 * 3600e3) score += 10;
    } else if (DONE.includes(m.status)) {
      if (m.date_msk !== today) continue;
      score -= 60;
    } else continue;
    if (!best || score > best.score || (score === best.score && start < best.start)) best = { m, score, start };
  }
  return best ? { match: best.m, manual: false } : null;
}

const QUAL = /\s*\(?квалификац[^)]*\)?/i;

// «Актуальные турниры»: running main-tour tournaments, the big ones and the ones «Больше» shows first.
// When fewer are running (the weekend between two weeks), the strip is filled with those finished
// today (with the champion), then the coming ones — shown by their qualifying while only it is on.
// Challengers only as a count. `covered` — tournament keys with «Больше» broadcasts.
export function homeTournaments(list, { covered = new Set(), limit = 3, today = null } = {}) {
  const isQual = (t) => t.stage === 'qualifying' || QUAL.test(t.name ?? '');
  const tour = list.filter((t) => t.level === 'tour');
  const main = tour.filter((t) => !isQual(t));
  const mainNames = new Set(main.map((t) => `${t.tour}|${t.name}`));
  const quals = tour.filter((t) => isQual(t) && ['now', 'soon'].includes(t.status))
    .map((t) => ({ ...t, name: t.name.replace(QUAL, '').trim(), stage: 'qualifying' }))
    .filter((t) => !mainNames.has(`${t.tour}|${t.name}`));
  const weight = (t) => (TIER_WEIGHT[tierOf(t)] ?? 30) + (covered.has(t.key) ? 30 : 0) + (t.live ? 5 : 0);
  const byWeight = (a, b) => weight(b) - weight(a) || String(a.name).localeCompare(String(b.name), 'ru');
  const now = main.filter((t) => t.status === 'now').sort(byWeight);
  const finished = main.filter((t) => t.status === 'done' && today && t.last_day === today).sort(byWeight);
  const coming = [...quals, ...main.filter((t) => t.status === 'soon')].sort(byWeight);
  const all = [...now, ...finished, ...coming];
  const picked = all.slice(0, limit);
  return {
    tournaments: picked,
    more_tour: all.length - picked.length,
    challengers: list.filter((t) => t.level === 'challenger' && t.status === 'now').length,
  };
}

// «Больше! Лайв» — the studio show every Monday at 19:00 Moscow time (VK Видео and YouTube).
// The banner shows the day before and on the day until the show is over. `override` (set by the
// admins in the bot) can give that week's link and topic, move the time or cancel the show; `auto` —
// the links of the show's announcement in the Telegram channel (worker/src/channel.js).
export const STUDIO = {
  title: 'Больше! Лайв',
  about: 'Традиционный понедельничный эфир: главное за неделю в теннисе, гости и ваши вопросы.',
  url: 'https://vk.com/tennis_bolshe',
  weekday: 1, // Monday
  time: '19:00',
  minutes: 120,
};

const MSK = 3 * 3600e3;

// The next show from `now`: its Moscow date and start (ISO), the show still on air included.
export function nextStudio(now = Date.now(), { time = STUDIO.time, minutes = STUDIO.minutes } = {}) {
  const [h, mi] = time.split(':').map(Number);
  const msk = new Date(now + MSK);
  for (let add = 0; add <= 7; add += 1) {
    const d = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + add));
    if (d.getUTCDay() !== STUDIO.weekday) continue;
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, mi) - MSK;
    if (start + minutes * 60e3 <= now) continue;
    return { date: d.toISOString().slice(0, 10), starts_at: new Date(start).toISOString(), ends_at: new Date(start + minutes * 60e3).toISOString() };
  }
  return null;
}

export function studioBanner(now = Date.now(), override = null, auto = null) {
  const o = override ?? {};
  let slot = nextStudio(now);
  if (!slot) return null;
  // Settings are for one show (its date); an old one is ignored.
  const mine = o.date === slot.date ? o : {};
  if (mine.time) slot = nextStudio(now, { time: mine.time }) ?? slot;
  if (mine.off) return null;
  const dayBefore = Date.parse(`${slot.date}T00:00:00Z`) - MSK - 86400e3; // Sunday 00:00 MSK
  if (now < dayBefore) return null;
  const posted = auto?.date === slot.date ? auto : null;
  return {
    title: STUDIO.title,
    about: mine.note || STUDIO.about,
    url: mine.url || posted?.vk || posted?.youtube || STUDIO.url,
    youtube: posted?.youtube && posted.youtube !== (mine.url || posted.vk) ? posted.youtube : null,
    stream: Boolean(mine.url || posted?.vk || posted?.youtube), // the show's own link, not the group page
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    live: now >= Date.parse(slot.starts_at),
  };
}
