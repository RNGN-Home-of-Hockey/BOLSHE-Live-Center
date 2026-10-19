// Prize money of the main-tour tournaments for the «Турниры» cards. Flashscore has none for tennis; English
// Wikipedia has it on the edition's page for some events ("2026 Ningbo Open": | prize_money = $1,206,446).
// The page must start with the year and name the tournament's city (its Latin name from the Flashscore url),
// so another event cannot slip in. Every 6 hours, four tournaments a run. Admins set or fix it in the bot
// (/prize Нинбо = $1 206 446) — an amount from the bot is never overwritten.

import { cityFromUrl } from './city-photos.js';
import { listTournaments } from './tournaments.js';

const UA = 'BolsheLiveCenter/1.0 (https://github.com/RNGN-Home-of-Hockey/BOLSHE-Live-Center)';
const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "$1,206,446 <br> …" → "$1 206 446"; "€ 700,000" → "€700 000".
export function parsePrize(value) {
  const m = String(value ?? '').match(/([$€£])\s?(\d{1,3}(?:[,.\s]\d{3})+|\d{4,})/);
  if (!m) return null;
  return `${m[1]}${m[2].replace(/[,.\s]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

async function wiki(params) {
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return res.json();
}

async function findPrize(year, city) {
  const found = await wiki({ action: 'query', list: 'search', srsearch: `${year} ${city} tennis`, srlimit: '8' });
  const key = ascii(city);
  const title = (found?.query?.search ?? []).map((x) => x.title)
    .find((t) => t.startsWith(`${year} `) && ascii(t).includes(key) && !/[–-]\s*(Singles|Doubles)|Tour\b|Finals\b/.test(t));
  if (!title) return null;
  const page = await wiki({ action: 'parse', page: title, prop: 'wikitext' });
  const line = String(page?.parse?.wikitext ?? '').match(/\|\s*prize_?money\s*=\s*([^\n|]*)/i)?.[1];
  const prize = parsePrize(line);
  return prize ? { prize, title } : null;
}

export async function syncPrizes(env, { batch = 4 } = {}) {
  const list = await listTournaments(env, null);
  const want = list.filter((t) => t.level === 'tour' && ['now', 'soon'].includes(t.status) && !t.prize && t.url).slice(0, batch);
  const done = [];
  for (const t of want) {
    try {
      const city = cityFromUrl(t.url);
      const year = String(t.first_day ?? '').slice(0, 4) || String(new Date().getUTCFullYear());
      const hit = city ? await findPrize(year, city) : null;
      if (hit) await env.DB.prepare('UPDATE tournaments SET prize = ? WHERE tournament_key = ? AND prize IS NULL').bind(hit.prize, t.key).run();
      done.push({ name: t.name, prize: hit?.prize ?? null, page: hit?.title ?? null });
    } catch (error) {
      done.push({ name: t.name, error: String(error?.message ?? error).slice(0, 100) });
    }
  }
  return { done };
}

// /prize Нинбо = $1 206 446 (or "-" to clear): the running or coming main-tour tournament with that city.
export async function setPrize(env, cityText, amount) {
  const want = String(cityText ?? '').toLowerCase().replace(/ё/g, 'е').trim();
  const list = await listTournaments(env, null);
  const t = list.filter((x) => x.level === 'tour' && x.status !== 'done')
    .find((x) => String(x.name).toLowerCase().replace(/ё/g, 'е') === want);
  if (!t) return { ok: false, error: `Не нашёл идущий или ближайший турнир «${cityText}».` };
  const value = /^[-—–]$/.test(String(amount).trim()) ? null : (parsePrize(amount) ?? String(amount).trim().slice(0, 40));
  // Every tournament row of that city and tour (singles and doubles share the prize).
  await env.DB.prepare('UPDATE tournaments SET prize = ? WHERE tournament = ? AND tour = ? AND level = \'tour\'').bind(value, t.name, t.tour).run();
  return { ok: true, name: `${t.tour} ${t.name}`, prize: value };
}
