// Matches the Russian player names written in the «Больше» schedule sheet to the base.
// Exact first (any known spelling), then a careful fuzzy match: same first letter of the
// first name and a surname that differs by one or two letters ("Бултер"/"Боултер",
// "Флавиоо Коболли" typos). The matched spellings become aliases (source "bolshe"),
// so broadcasts link to players; they are never used as the display name.

import { foldLatin, tokenKey } from '../lib/names.js';

export function editDistance(a, b) {
  const s = String(a);
  const t = String(b);
  const prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (s[i - 1] === t[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[t.length];
}

const words = (name) => foldLatin(name).toLowerCase().split(/[^а-яa-z]+/).filter(Boolean);

function surnameClose(a, b) {
  const limit = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return a[0] === b[0] && editDistance(a, b) <= limit;
}

function closeInOrder(s, a) {
  const sFirst = s[0];
  const sLast = s.slice(1).join(' ');
  const aFirst = a[0];
  const aLast = a.slice(1).join(' ');
  return sFirst[0] === aFirst[0] && surnameClose(sLast, aLast)
    && (editDistance(sFirst, aFirst) <= 2 || sFirst.length <= 3 || aFirst.length <= 3);
}

// One schedule name against one Cyrillic spelling of a player; Chinese names come in either
// order ("Чжэн Цинвэнь" / "Циньвэнь Чжэн"), so the reversed order is tried too.
function fuzzyEqual(scheduleName, alias) {
  const s = words(scheduleName);
  const a = words(alias);
  if (s.length < 2 || a.length < 2) return false;
  return closeInOrder(s, a) || (a.length === 2 && closeInOrder(s, [a[1], a[0]]));
}

export function matchScheduleNames(broadcasts, players) {
  const counts = new Map();
  for (const b of broadcasts) {
    for (const n of [b.player1_ru, b.player2_ru]) {
      if (n && !n.includes('/') && /[А-Яа-яЁё]/.test(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  const exact = new Map();
  const cyrillic = [];
  for (const p of players) {
    for (const a of p.aliases ?? []) {
      if (!/[А-Яа-яЁё]/.test(a.alias) || /\.$/.test(a.alias)) continue;
      const key = tokenKey(a.alias);
      exact.set(key, [...new Set([...(exact.get(key) ?? []), p])]);
      cyrillic.push({ player: p, alias: a.alias });
    }
  }
  const matches = [];
  const unmatched = [];
  for (const [name, count] of counts) {
    const hits = exact.get(tokenKey(name)) ?? [];
    if (hits.length === 1) {
      matches.push({ fs_id: hits[0].fs_id, alias: name, source: 'bolshe', count, how: 'exact' });
      continue;
    }
    if (hits.length > 1) { unmatched.push({ name, count, why: 'ambiguous' }); continue; }
    const fuzzy = [...new Set(cyrillic.filter((c) => fuzzyEqual(name, c.alias)).map((c) => c.player))];
    if (fuzzy.length === 1) matches.push({ fs_id: fuzzy[0].fs_id, alias: name, source: 'bolshe', count, how: 'fuzzy' });
    else unmatched.push({ name, count, why: fuzzy.length ? 'ambiguous' : 'not_found' });
  }
  return { matches, unmatched };
}
