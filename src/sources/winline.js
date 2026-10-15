// Winline (partner bookmaker): odds of tennis matches from the open XML feeds
//   https://back.winline.ru/banners/live_mainsports      matches in play (~270 KB)
//   https://back.winline.ru/banners/prematch_mainsports  matches to come (~6.5 MB, all sports)
// <Sport Name="Теннис"> → <Tournament Name="Ухань, Китай"> → <Match Team1="Свитолина Э." Team2="Гуо Х."
//   MatchDate="2026-10-15T07:10:00.000+03:00" islive="0" Id="16923337" MatchUrl="…">
//   → <line freetext="Победитель" odd1="1.08" odd2="8.00"> (in play: "Победитель матча (Вкл. ОТ)").
// Finished matches leave the feeds, so the pre-match odds must be kept on our side.

export const WINLINE_FEEDS = {
  live: 'https://back.winline.ru/banners/live_mainsports',
  prematch: 'https://back.winline.ru/banners/prematch_mainsports',
};

const WINNER = /^Победитель( матча)?( \(Вкл\. ОТ\))?$/;
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
const unescape = (s) => String(s ?? '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Tennis matches of one feed with the match-winner odds.
export function parseWinlineTennis(xml) {
  const text = String(xml ?? '');
  const start = text.indexOf('<Sport Name="Теннис"');
  if (start < 0) return [];
  const section = text.slice(start, text.indexOf('</Sport>', start));
  const out = [];
  for (const t of section.matchAll(/<Tournament\b([^>]*)>([\s\S]*?)<\/Tournament>/g)) {
    const tournament = unescape(attr(t[1], 'Name'));
    for (const m of t[2].matchAll(/<Match\b([^>]*)>([\s\S]*?)<\/Match>/g)) {
      let odds = null;
      let hcap = null;
      for (const l of m[2].matchAll(/<line\b([^>]*)>/g)) {
        const name = unescape(attr(l[1], 'freetext'));
        const o1 = Number(attr(l[1], 'odd1'));
        const o2 = Number(attr(l[1], 'odd2'));
        if (!(o1 > 1 && o2 > 1)) continue;
        if (!odds && WINNER.test(name)) odds = [o1, o2];
        // Games handicap (value = Winline Team1's games): several lines, the main one has the most even prices.
        const value = Number(attr(l[1], 'value'));
        if (name === 'Фора' && Number.isFinite(value) && (!hcap || Math.abs(o1 - o2) < Math.abs(hcap.odds[0] - hcap.odds[1]))) hcap = { value, odds: [o1, o2] };
      }
      const date = Date.parse(attr(m[1], 'MatchDate') ?? '');
      out.push({
        wl_id: attr(m[1], 'Id'),
        tournament,
        p1: unescape(attr(m[1], 'Team1')),
        p2: unescape(attr(m[1], 'Team2')),
        start_at: Number.isFinite(date) ? new Date(date).toISOString() : null,
        live: attr(m[1], 'islive') === '1',
        url: attr(m[1], 'MatchUrl'),
        odds,
        hcap,
      });
    }
  }
  return out.filter((m) => m.wl_id && m.p1 && m.p2);
}

const fold = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[‐-―-]/g, ' ');

// Surname words of a bookmaker/Flashscore name: "Санчес-Килес А." → санчес, килес;
// "Джевецкий К. / Матушевский П." → джевецкий, матушевский. Initials are dropped.
export function surnameKeys(name) {
  const keys = new Set();
  for (const part of String(name ?? '').split('/')) {
    for (const word of fold(part).split(/\s+/)) {
      const w = word.replace(/[^a-zа-я]/g, '');
      if (w.length >= 2 && !/\.$/.test(word)) keys.add(w);
    }
  }
  return keys;
}

// Every word of every name we know for one side of our match (Flashscore short name,
// Russian name of the base, …).
export function sideKeys(...names) {
  const keys = new Set();
  for (const n of names) {
    for (const word of fold(n).split(/[\s/]+/)) {
      const w = word.replace(/[^a-zа-я]/g, '');
      if (w.length >= 2) keys.add(w);
    }
  }
  return keys;
}

const meets = (wlName, keys) => [...surnameKeys(wlName)].some((k) => keys.has(k));

// Pairs Winline matches with ours: both players must match (in either order) and the start
// must be within 12 hours; the nearest start wins. `ours`: [{match_id, start_at, k1, k2}]
// where k1/k2 come from sideKeys. Returns [{wl, match_id, swapped}].
export function linkWinline(wlMatches, ours) {
  const links = [];
  const taken = new Set();
  for (const wl of wlMatches) {
    const at = Date.parse(wl.start_at ?? '');
    let best = null;
    for (const m of ours) {
      if (taken.has(m.match_id)) continue;
      const diff = Math.abs(Date.parse(m.start_at ?? '') - at);
      if (!(diff <= 12 * 3600e3)) continue;
      let swapped = null;
      if (meets(wl.p1, m.k1) && meets(wl.p2, m.k2)) swapped = false;
      else if (meets(wl.p1, m.k2) && meets(wl.p2, m.k1)) swapped = true;
      if (swapped === null) continue;
      if (!best || diff < best.diff) best = { match_id: m.match_id, swapped, diff };
    }
    if (best) {
      taken.add(best.match_id);
      links.push({ wl, match_id: best.match_id, swapped: best.swapped });
    }
  }
  return links;
}

export async function fetchWinlineTennis(kind) {
  const res = await fetch(WINLINE_FEEDS[kind], { headers: { accept: 'application/xml,text/xml' } });
  if (!res.ok) throw new Error(`Winline ${kind} HTTP ${res.status}`);
  return parseWinlineTennis(await res.text());
}
