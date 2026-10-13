// Flashscore player page (/player/<slug>/<id>/): photo and date of birth.
// The page is ~650 KB and both values sit in its first half, so the download is cut
// as soon as they have been read.

import { USER_AGENT } from '../lib/http.js';
import { FLASHSCORE_RU } from './flashscore.js';

const STOP_AFTER = 'formatBirthOrDeathDay';
const MAX_BYTES = 520 * 1024;

export function parsePlayerPage(html) {
  const page = String(html ?? '');
  const photo = page.match(/<img[^>]+class="heading__logo[^"]*"[^>]+src="(https:\/\/static\.flashscore\.com\/res\/image\/data\/[^"]+)"/)?.[1] ?? null;
  const seconds = page.match(/getAge\((-?\d+)\)/)?.[1];
  const birthDate = seconds != null ? new Date(Number(seconds) * 1000).toISOString().slice(0, 10) : null;
  return { photo_url: photo, birth_date: birthDate };
}

export async function fetchPlayerProfile(slug, fsId, { base = FLASHSCORE_RU, timeoutMs = 30000 } = {}) {
  const res = await fetch(`${base}/player/${slug}/${fsId}/`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return { photo_url: null, birth_date: null, missing: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} for player ${fsId}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  try {
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes(STOP_AFTER)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parsePlayerPage(html);
}
