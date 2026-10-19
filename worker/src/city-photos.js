// City photos for tournaments that have none yet (challengers change every week): up to 5 free Wikimedia
// Commons photos of the city — «Quality images» first, landscape, at least 1600 px, and the city's name in
// the file name, so another city cannot slip in. Cut by Cloudflare Images to 960×540 JPEG in R2
// tours/auto-<city>-<n>.jpg; rows in tour_visuals (the tournament's name + the Latin city) and tour_photos
// with the author for «Авторы фотографий». Hourly, two cities a run; a city with nothing found is not
// looked up again (tour_visuals row with an empty photo_url).

import { listTournaments } from './tournaments.js';

const UA = 'BolsheLiveCenter/1.0 (https://github.com/RNGN-Home-of-Hockey/BOLSHE-Live-Center)';
const API = 'https://commons.wikimedia.org/w/api.php';
const FREE = /^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD)/i;
const BAD = /interior|inside|detail|statue|organ|altar|ceiling|map|plan|coat of arms|flag|museum|tomb|stained|window|portrait|close-?up|sign|plaque|menu|food|insect|flower|bird|\bcar\b|\bbus\b|train|tram|station|logo|engraving|drawing|painting|stamp|poster|document/i;
const PER_CITY = 5;

const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
// A rough sound key: Latin letters, c/k and the like folded, doubled letters once ("Лиссабон" ≈ "Lisbon").
const soundKey = (s) => [...ascii(s)].map((ch) => RU[ch] ?? ch).join('').replace(/[^a-z]/g, '')
  .replace(/ph/g, 'f').replace(/ck|c|q/g, 'k').replace(/w/g, 'v').replace(/[yj]/g, 'i').replace(/(.)\1+/g, '$1');

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

// Flashscore keeps an old url when a tournament moves ("Чьянчжоу" sits at …/guangzhou/): the city of the
// url counts only when it sounds like the tournament's name.
export function sameCity(name, city) {
  const a = soundKey(name);
  const b = soundKey(city);
  if (!a || !b || a[0] !== b[0]) return false;
  return 1 - distance(a, b) / Math.max(a.length, b.length) >= 0.5;
}

// "/tennis/challenger-men-singles/fort-worth/" → "Fort Worth"; "santa-cruz-2" → "Santa Cruz".
export function cityFromUrl(url) {
  const slug = String(url ?? '').split('/').filter(Boolean).pop() ?? '';
  const words = slug.replace(/-\d+$/, '').split('-').filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : null;
}

async function search(query) {
  const url = `${API}?${new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '20',
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1280', format: 'json', formatversion: '2',
  })}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  return (await res.json())?.query?.pages ?? [];
}

// Free landscape photos whose file name has the city's name, best first.
export function pickCityPhotos(pages, city, limit = PER_CITY) {
  const key = ascii(city).split(' ')[0];
  const out = [];
  for (const page of pages) {
    const title = String(page.title ?? '').replace(/^File:/, '');
    const ii = page.imageinfo?.[0];
    const license = clean(ii?.extmetadata?.LicenseShortName?.value);
    if (!ii?.thumburl || !ascii(title).includes(key) || BAD.test(title) || !FREE.test(license)) continue;
    if (ii.width < 1600 || ii.width / Math.max(ii.height, 1) < 1.3 || ii.width / Math.max(ii.height, 1) > 2.6) continue;
    const artist = clean(ii.extmetadata?.Artist?.value).replace(/\s+from\s+.*$/i, '').slice(0, 80) || 'автор неизвестен';
    out.push({ title, url: ii.thumburl, credit: `Фото: ${artist}, ${license}, Wikimedia Commons` });
    if (out.length >= limit) break;
  }
  return out;
}

async function findPhotos(city) {
  const found = [];
  const seen = new Set();
  for (const q of [`${city} skyline`, `${city} panorama`, `${city} cityscape`, `${city} aerial view`, city]) {
    for (const extra of [' incategory:Quality_images', '']) {
      const fresh = pickCityPhotos(await search(q + extra), city, PER_CITY).filter((p) => !seen.has(p.title) && seen.add(p.title));
      found.push(...fresh);
      if (found.length >= PER_CITY) return found.slice(0, PER_CITY);
    }
  }
  return found;
}

async function storeCity(env, t) {
  const city = cityFromUrl(t.url);
  if (!city) return { name: t.name, skipped: 'no url' };
  const photos = sameCity(t.name, city) ? await findPhotos(city) : [];
  const slug = ascii(city).replace(/[^a-z0-9]+/g, '-');
  const rows = [];
  for (const [n, p] of photos.entries()) {
    const src = await fetch(p.url, { headers: { 'user-agent': UA } });
    if (!src.ok) continue;
    const out = await env.IMAGES.input(src.body).transform({ width: 960, height: 540, fit: 'cover' }).output({ format: 'image/jpeg', quality: 80 });
    const key = `tours/auto-${slug}-${n}.jpg`;
    await env.MEDIA.put(key, await out.response().arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
    rows.push({ url: `${key}?v=1`, credit: p.credit });
  }
  const db = env.DB;
  await db.prepare('INSERT OR IGNORE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES (?, ?, NULL, ?, NULL)')
    .bind(t.name, city === t.name ? null : city, rows[0]?.url ?? '').run();
  for (const [n, r] of rows.entries()) {
    await db.prepare('INSERT OR REPLACE INTO tour_photos (city, n, photo_url, photo_credit) VALUES (?, ?, ?, ?)').bind(t.name, n, r.url, r.credit).run();
  }
  return { name: t.name, city, photos: rows.length };
}

export async function syncCityPhotos(env, { cities = 2 } = {}) {
  if (!env.MEDIA || !env.IMAGES) return { skipped: 'no MEDIA or IMAGES binding' };
  const list = await listTournaments(env, null);
  const missing = list.filter((t) => ['now', 'soon'].includes(t.status) && !t.visual && t.url)
    .sort((a, b) => (a.level === 'tour' ? 0 : 1) - (b.level === 'tour' ? 0 : 1));
  const done = [];
  for (const t of missing.slice(0, cities)) {
    try {
      done.push(await storeCity(env, t));
    } catch (error) {
      done.push({ name: t.name, error: String(error?.message ?? error).slice(0, 120) });
    }
  }
  return { missing: missing.length, done };
}
