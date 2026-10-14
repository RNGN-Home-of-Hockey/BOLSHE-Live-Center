// Pictures of the app: covers of «Больше» broadcasts (VK) and player heads (Flashscore).
// Pure helpers shared by the Worker and the tests; nothing here touches the network.

// "https://vk.com/video-218116775_456252380?access_key=…" → "-218116775_456252380".
export function vkVideoId(url) {
  return String(url ?? '').match(/video(-?\d+_\d+)/)?.[1] ?? null;
}

// The og:image of a page, with HTML entities of the query string undone.
export function ogImage(html) {
  const tag = String(html ?? '').match(/<meta[^>]+property="og:image"[^>]*>/)?.[0];
  const url = tag?.match(/content="([^"]+)"/)?.[1];
  return url ? url.replace(/&amp;/g, '&') : null;
}

// VK shows a real cover as an "impg" picture of type video_thumb. While a stream has no picture
// VK gives a stock image (/images/video/thumbs/…) or a getVideoPreview link that always 404s —
// both mean "no cover yet".
export function isRealCover(url) {
  if (!url || !/^https:\/\//.test(url)) return false;
  if (/getVideoPreview|\/images\/video\/thumbs\//.test(url)) return false;
  return /\/impg\//.test(url) || /type=video_thumb/.test(url);
}

// The same picture comes from different sun9-NN hosts and with a fresh signature every time;
// its path is what stays the same.
export function coverSourceId(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

// Flashscore gives "photo.png", "men"/"women" (no photo: a stock silhouette) or "a.png;b.png"
// for a doubles pair. Only real files count.
export function photoFiles(value) {
  return String(value ?? '').split(';').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i.test(s));
}

const FS_DATA = 'https://static.flashscore.com/res/image/data/';

// A singles player's photo from the day feed (null for no photo and for doubles pairs).
export function flashscorePhotoUrl(value) {
  const files = photoFiles(value);
  return files.length === 1 && !String(value).includes(';') ? `${FS_DATA}${files[0]}` : null;
}

// True for a stored photo link that points at a real picture file.
export function isRealPhotoUrl(url) {
  return /^https:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i.test(String(url ?? '')) && !String(url).includes(';');
}

// Short stable hash for cache-busting URLs (?v=…).
export function shortHash(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Public path of a stored picture: "covers/-218116775_456252380.jpg?v=1a2b3c4d" → "/media/…".
export const mediaUrl = (stored) => (stored ? `/media/${stored}` : null);

// When to look at a cover again. Covers of streams that have not ended yet are re-read every
// 30 minutes (the designers sometimes redraw them); after that the stored copy is final.
// A missing or failed cover is retried with a growing pause; old ones are given up after 5 tries.
export function nextCoverCheck({ ok, startsAt, fails = 0, now = Date.now() }) {
  const start = Date.parse(startsAt ?? '') || null;
  const fresh = start == null || now < start + 6 * 3600e3;
  if (ok) return fresh ? new Date(now + 30 * 60e3).toISOString() : null;
  const old = start != null && now > start + 2 * 86400e3;
  if (old && fails >= 5) return null;
  const pause = Math.min(10 * 60e3 * 2 ** Math.max(fails - 1, 0), 12 * 3600e3);
  return new Date(now + pause).toISOString();
}
