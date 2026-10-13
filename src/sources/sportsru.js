// Sports.ru player pages: the Russian spelling used by Russian sports media.
// Pages live at /tennis/person/<slug>/ (robots.txt allows them; /api/ and /stat/ are closed).
// The slug is usually the English "first-last" name ("jannik-sinner"), sometimes a Russian
// transliteration ("arina-sobolenko"), so a few candidates are tried and the hit is verified
// against the Latin name printed under the Russian one and the date of birth.

import { fetchText } from '../lib/http.js';
import { foldLatin, nameTokens } from '../lib/names.js';

export const SPORTS_BASE = 'https://www.sports.ru';

const RU_TO_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const MONTHS = {
  января: '01', февраля: '02', марта: '03', апреля: '04', мая: '05', июня: '06',
  июля: '07', августа: '08', сентября: '09', октября: '10', ноября: '11', декабря: '12',
};

export function slugify(name) {
  return foldLatin(name).toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function slugFromRussian(name) {
  const lat = String(name ?? '').toLowerCase().split('').map((ch) => RU_TO_LAT[ch] ?? ch).join('');
  return slugify(lat);
}

// Ordered, unique slug candidates for one player record from data/players/players.json.
export function slugCandidates(player, limit = 5) {
  const out = [];
  const add = (slug) => { if (slug && slug.includes('-') && !out.includes(slug)) out.push(slug); };
  add(slugify(player.name_latin));
  for (const a of player.aliases ?? []) {
    if (/[А-Яа-яЁё]/.test(a.alias)) continue;
    if (a.source === 'flashscore') {
      // Flashscore Latin is "Last First": try "First Last". With three words the split is unknown:
      // "Cerundolo Juan Manuel" -> "Juan Manuel Cerundolo", "Carreno Busta Pablo" -> "Pablo Carreno Busta".
      const parts = a.alias.trim().split(/\s+/);
      if (parts.length >= 2) add(slugify([parts[parts.length - 1], ...parts.slice(0, -1)].join(' ')));
      if (parts.length >= 3) add(slugify([...parts.slice(1), parts[0]].join(' ')));
    } else {
      add(slugify(a.alias));
    }
  }
  add(slugFromRussian(player.name_ru));
  return out.slice(0, limit);
}

function text(html) {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parsePersonPage(html) {
  const page = String(html ?? '');
  const nameRu = text(page.match(/<h1[^>]*class="titleH1"[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  if (!nameRu || !/[А-Яа-яЁё]/.test(nameRu)) return null;
  const after = page.slice(page.indexOf('class="titleH1"'));
  const nameLatin = text(after.match(/<div class="descr">([\s\S]*?)<\/div>/)?.[1]);
  const born = text(after.match(/<th>\s*Родил[а-я]*\s*<\/th>\s*<td>([\s\S]*?)<\/td>/)?.[1]);
  const m = born.match(/(\d{1,2})\s+([а-я]+)\s+(\d{4})/);
  const birthDate = m && MONTHS[m[2]] ? `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}` : null;
  const photo = page.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1] ?? null;
  return { name_ru: nameRu, name_latin: nameLatin || null, birth_date: birthDate, photo };
}

// The page belongs to our player when the Latin names share the surname and the first
// name (or its initial), or the Russian names match; a different birth date rejects it.
export function pageMatchesPlayer(page, player) {
  if (!page) return false;
  if (page.birth_date && player.birth_date && page.birth_date !== player.birth_date) return false;
  const ours = new Set();
  for (const n of [player.name_latin, ...(player.aliases ?? []).map((a) => a.alias)]) {
    for (const t of nameTokens(n)) ours.add(t);
  }
  const theirs = nameTokens(page.name_latin);
  const ruTheirs = nameTokens(page.name_ru);
  const ruOurs = new Set((player.aliases ?? []).flatMap((a) => nameTokens(a.alias)).concat(nameTokens(player.name_ru)));
  const latinHits = theirs.filter((t) => ours.has(t)).length;
  const ruHits = ruTheirs.filter((t) => ruOurs.has(t)).length;
  if (theirs.length && latinHits >= Math.min(2, theirs.length)) return true;
  return ruTheirs.length >= 2 && ruHits >= 2;
}

export async function fetchPersonPage(slug) {
  try {
    const html = await fetchText(`${SPORTS_BASE}/tennis/person/${slug}/`, { timeoutMs: 30000 });
    return { slug, page: parsePersonPage(html) };
  } catch (error) {
    if (/HTTP 404/.test(error.message)) return { slug, page: null, missing: true };
    throw error;
  }
}
