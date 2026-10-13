// Flashscore tennis match feeds.
//   Day feed  /x/feed/f_2_<dayOffset>_3_ru-kz_1  every match of a Moscow day (−7…+7 days):
//             tournament headers (ZA) followed by matches (AA); players by Flashscore id (PX/PY),
//             set and game scores, live state, winner.
//   H2H feed  /x/feed/df_hh_1_<matchId>            per surface: last matches of each player
//             and their meetings — enough for "form" and "head to head" on the match card.

import { fetchText } from '../lib/http.js';
import { FLASHSCORE_FSIGN, FLASHSCORE_RU } from './flashscore.js';

const MSK_TZ = 3;

function fields(record) {
  const out = {};
  for (const part of record.split('¬')) {
    const i = part.indexOf('÷');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

const num = (v) => (v === undefined || v === '' ? null : Number(v));

// "ATP - ОДИНОЧНЫЙ РАЗРЯД: Шанхай (Китай), хард"
export function parseLeague(name) {
  const text = String(name ?? '');
  const [category, rest = ''] = text.split(/:\s*/, 2);
  const cat = category.toUpperCase();
  let level = 'other';
  if (/^ATP\b|^WTA\b/.test(cat)) level = 'tour';
  else if (/ЧЕЛЛЕНДЖЕР|CHALLENGER|WTA 125/.test(cat)) level = 'challenger';
  else if (/^ITF/.test(cat)) level = 'itf';
  else if (/ЮНИОР|BOYS|GIRLS|JUNIOR/.test(cat)) level = 'junior';
  else if (/ВЫСТАВ|EXHIBITION/.test(cat)) level = 'exhibition';
  else if (/КУБОК|CUP|КОМАНД/.test(cat)) level = 'team';
  let tour = null;
  if (/^WTA|ЖЕНЩ|ДЕВУШ|WOMEN|GIRLS/.test(cat)) tour = 'WTA';
  else if (/^ATP|МУЖЧ|ЮНОШ|MEN|BOYS/.test(cat)) tour = 'ATP';
  const discipline = /СМЕШ|MIXED/.test(cat) ? 'mixed' : /ПАРН|DOUBLES/.test(cat) ? 'doubles' : 'singles';
  const parts = rest.split(',').map((s) => s.trim()).filter(Boolean);
  const surfaceText = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  const surface = /хард|hard/.test(surfaceText) ? 'hard' : /грунт|clay/.test(surfaceText) ? 'clay'
    : /трав|grass/.test(surfaceText) ? 'grass' : /ковер|ковёр|carpet|indoor/.test(surfaceText) ? 'carpet' : null;
  let place = parts.length > 1 ? parts.slice(0, -1).join(', ') : rest.trim();
  // "Maia (Португалия) - квалификация": the qualifying draw is its own Flashscore stage.
  const qualifying = /\s*-\s*квалификац\S*\s*$/i.test(place);
  place = place.replace(/\s*-\s*квалификац\S*\s*$/i, '');
  const cityCountry = place.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const city = cityCountry ? cityCountry[1] : place || null;
  return {
    category,
    tour,
    level,
    discipline,
    surface,
    tournament: city && qualifying ? `${city} (квалификация)` : city,
    country: cityCountry ? cityCountry[2] : null,
  };
}

export function matchStatus(ab, ac) {
  if (ab === '1') return { status: 'scheduled', live_set: null };
  if (ab === '2') {
    const code = Number(ac);
    return { status: 'live', live_set: code >= 17 && code <= 21 ? code - 16 : null };
  }
  if (ab === '3') {
    const map = { 3: 'finished', 5: 'cancelled', 8: 'retired', 9: 'walkover', 4: 'postponed', 6: 'interrupted' };
    return { status: map[Number(ac)] ?? 'finished', live_set: null };
  }
  return { status: 'unknown', live_set: null };
}

const SET_KEYS = [['BA', 'BB'], ['BC', 'BD'], ['BE', 'BF'], ['BG', 'BH'], ['BI', 'BJ']];
const TB_KEYS = [['DA', 'DB'], ['DC', 'DD'], ['DE', 'DF'], ['DG', 'DH'], ['DI', 'DJ']];

export function parseDayFeed(text) {
  const tournaments = new Map();
  const matches = [];
  let league = null;
  for (const record of String(text ?? '').split('¬~')) {
    const f = fields(record);
    if (f.ZA) {
      league = { key: f.ZEE || f.ZC || f.ZA, name: f.ZA, url: f.ZL ?? null, ...parseLeague(f.ZA) };
      tournaments.set(league.key, league);
      continue;
    }
    if (!f.AA || !league) continue;
    const sets = [];
    SET_KEYS.forEach(([h, a], i) => {
      if (f[h] === undefined && f[a] === undefined) return;
      sets.push({ p1: num(f[h]), p2: num(f[a]), tb1: num(f[TB_KEYS[i][0]]), tb2: num(f[TB_KEYS[i][1]]) });
    });
    const { status, live_set: liveSet } = matchStatus(f.AB, f.AC);
    const winner = f.AS === '1' || f.AS === '2' ? Number(f.AS) : null;
    matches.push({
      match_id: f.AA,
      tournament_key: league.key,
      start_at: f.AD ? new Date(Number(f.AD) * 1000).toISOString() : null,
      end_at: f.AO ? new Date(Number(f.AO) * 1000).toISOString() : null,
      status,
      live_set: liveSet,
      note: f.AM || null,
      p1_fs_id: f.PX ?? null,
      p2_fs_id: f.PY ?? null,
      p1_name: f.AE ?? null,
      p2_name: f.AF ?? null,
      p1_photo: f.OA ? `https://static.flashscore.com/res/image/data/${f.OA}` : null,
      p2_photo: f.OB ? `https://static.flashscore.com/res/image/data/${f.OB}` : null,
      sets_p1: num(f.AG),
      sets_p2: num(f.AH),
      sets,
      winner,
      is_doubles: league.discipline !== 'singles' || /\//.test(`${f.PX ?? ''}${f.PY ?? ''}`),
    });
  }
  return { tournaments: [...tournaments.values()], matches };
}

// Head-to-head feed: sections by surface ("Все покрытия", "Грунт", "Трава", "Хард"), each with
// "Последние игры: A", "Последние игры: B" and "Очные встречи". Names marked "*" won.
export function parseH2HFeed(text) {
  const out = [];
  let surface = null;
  let block = null;
  for (const record of String(text ?? '').split('¬~')) {
    const f = fields(record);
    if (f.KA !== undefined) { surface = f.KA; continue; }
    if (f.KB !== undefined) {
      block = { surface, title: f.KB, kind: /очные|head/i.test(f.KB) ? 'h2h' : 'last', matches: [] };
      out.push(block);
      continue;
    }
    if (!f.KP || !block) continue;
    const homeWon = String(f.KJ ?? '').startsWith('*');
    const awayWon = String(f.KK ?? '').startsWith('*');
    block.matches.push({
      match_id: f.KP,
      start_at: f.KC ? new Date(Number(f.KC) * 1000).toISOString() : null,
      surface: f.KD ?? null,
      tournament: f.KF ?? null,
      status: matchStatus('3', f.AC).status,
      p1_fs_id: f.UQ ?? null,
      p2_fs_id: f.UO ?? null,
      p1_name: String(f.KJ ?? '').replace(/^\*/, ''),
      p2_name: String(f.KK ?? '').replace(/^\*/, ''),
      sets_p1: num(f.KU),
      sets_p2: num(f.KT),
      winner: homeWon ? 1 : awayWon ? 2 : null,
      focus_result: f.WIS === 'w' ? 'win' : f.WIS === 'l' ? 'loss' : null,
    });
  }
  return out;
}

const headers = (referer) => ({ 'x-fsign': FLASHSCORE_FSIGN, referer });

export async function fetchDay(offset, { base = FLASHSCORE_RU } = {}) {
  const text = await fetchText(`${base}/x/feed/f_2_${offset}_${MSK_TZ}_ru-kz_1`, { headers: headers(`${base}/`) });
  return parseDayFeed(text);
}

export async function fetchH2H(matchId, { base = FLASHSCORE_RU } = {}) {
  const text = await fetchText(`${base}/x/feed/df_hh_1_${matchId}`, { headers: headers(`${base}/match/${matchId}/`) });
  return parseH2HFeed(text);
}
