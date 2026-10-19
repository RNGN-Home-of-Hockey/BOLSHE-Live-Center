// Big player photos for the places where a face is large (home cards, «Главный матч дня», the player
// page, «Вопрос дня»); the 100×100 Flashscore heads stay for the small avatars in lists.
// Source, the first that has the player:
//   WTA      the official headshot by WTA id (wtafiles…/images/headshots/<id>.jpg, 492×656)
//   ESPN     ESPN's cut-out headshot by ESPN id (600×436, transparent background)
//   Commons  the Wikidata picture (P18) — a free photo, credited on «Авторы фотографий»
// Cloudflare Images cuts each one to a 480×480 WebP (the face kept in the frame) in R2
// photos/<flashscore id>.webp; D1 `media` keeps it as 'photo/<fs id>' with the credit.
// ATP's own headshots sit behind a bot check, so they are not used.

import { shortHash } from '../../src/lib/media.js';

const UA = 'BolsheLiveCenter/1.0 (https://github.com/RNGN-Home-of-Hockey/BOLSHE-Live-Center)';
const SIZE = 480;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const FREE = /^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD)/i;
const RECHECK_OK_MS = 60 * 86400e3; // a new official headshot shows up a few times a season
const RECHECK_NONE_MS = 14 * 86400e3;
const TINY = 3000; // an empty placeholder

const mskDate = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const clean = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchPicture(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  return bytes.byteLength > TINY ? bytes : null;
}

// The free Commons photo of a player's Wikidata item, with its author and licence.
async function commonsPhoto(qid) {
  const claims = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(qid)}&property=P18&format=json`);
  const file = claims?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  const info = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${file}`)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json&formatversion=2`);
  const ii = info?.query?.pages?.[0]?.imageinfo?.[0];
  const license = clean(ii?.extmetadata?.LicenseShortName?.value);
  if (!ii?.thumburl || !FREE.test(license)) return null;
  const artist = clean(ii.extmetadata?.Artist?.value).replace(/\s+from\s+.*$/i, '').slice(0, 80) || 'автор неизвестен';
  return { url: ii.thumburl, source: `commons:${file}`, credit: `${artist}, ${license}, Wikimedia Commons`, face: true };
}

async function findSource(p) {
  if (p.wta_id) {
    const url = `https://wtafiles.blob.core.windows.net/images/headshots/${p.wta_id}.jpg`;
    const bytes = await fetchPicture(url);
    if (bytes) return { url, bytes, source: 'wta', credit: null, face: false };
  }
  if (p.espn_id) {
    const url = `https://a.espncdn.com/i/headshots/tennis/players/full/${p.espn_id}.png`;
    const bytes = await fetchPicture(url);
    if (bytes) return { url, bytes, source: 'espn', credit: null, face: false };
  }
  if (p.wikidata_id) {
    const c = await commonsPhoto(p.wikidata_id);
    if (c) {
      const bytes = await fetchPicture(c.url);
      if (bytes) return { ...c, bytes };
    }
  }
  return null;
}

// A square around the face: official headshots have the head at the top, Commons photos are found by face.
async function cutSquare(env, bytes, face) {
  const run = (options) => env.IMAGES.input(new Blob([bytes]).stream()).transform(options).output({ format: 'image/webp', quality: 82 });
  const base = { width: SIZE, height: SIZE, fit: 'cover' };
  let out;
  try {
    out = await run(face ? { ...base, gravity: 'face', zoom: 0.45 } : { ...base, gravity: 'top' });
  } catch {
    out = await run({ ...base, gravity: face ? 'auto' : 'top' });
  }
  return out.response().arrayBuffer();
}

function upsert(db, m) {
  return db.prepare(`INSERT INTO media (media_key, kind, source_url, source_id, r2_key, version, bytes, status, fail_count, next_at, fetched_at, checked_at, error, credit)
    VALUES (?1, 'photo', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(media_key) DO UPDATE SET source_url = excluded.source_url, source_id = excluded.source_id,
      r2_key = COALESCE(excluded.r2_key, media.r2_key), version = COALESCE(excluded.version, media.version),
      bytes = COALESCE(excluded.bytes, media.bytes), status = excluded.status, fail_count = excluded.fail_count, next_at = excluded.next_at,
      fetched_at = COALESCE(excluded.fetched_at, media.fetched_at), checked_at = excluded.checked_at, error = excluded.error, credit = excluded.credit`)
    .bind(m.key, m.source_url ?? null, m.source_id ?? null, m.r2_key ?? null, m.version ?? null, m.bytes ?? null, m.status,
      m.fail_count ?? 0, m.next_at ?? null, m.fetched_at ?? null, m.checked_at, m.error ?? null, m.credit ?? null).run();
}

// Players by rank (top 400 of each tour) and everybody of the matches around today, never tried first.
async function duePlayers(db, now, limit) {
  const { results } = await db.prepare(`SELECT p.fs_id, p.wta_id, p.espn_id, p.wikidata_id, ph.status, ph.fail_count, ph.version
    FROM players p LEFT JOIN media ph ON ph.media_key = 'photo/' || p.fs_id
    WHERE p.fs_id IS NOT NULL AND (p.wta_id IS NOT NULL OR p.espn_id IS NOT NULL OR p.wikidata_id IS NOT NULL)
      AND (p.singles_rank <= 400 OR p.fs_id IN (SELECT p1_fs_id FROM matches WHERE date_msk BETWEEN ?1 AND ?2
        UNION SELECT p2_fs_id FROM matches WHERE date_msk BETWEEN ?1 AND ?2))
      AND (ph.media_key IS NULL OR ph.next_at <= ?3)
    ORDER BY ph.media_key IS NOT NULL, COALESCE(p.singles_rank, 9999) LIMIT ?4`)
    .bind(mskDate(now - 86400e3), mskDate(now + 2 * 86400e3), new Date(now).toISOString(), limit).all();
  return results.filter((r) => /^[A-Za-z0-9]+$/.test(r.fs_id));
}

async function storePhoto(env, p, now) {
  const key = `photo/${p.fs_id}`;
  const checked = new Date(now).toISOString();
  try {
    const src = await findSource(p);
    if (!src) {
      // A source that is down for a while does not take a stored photo away.
      await upsert(env.DB, { key, status: p.status === 'ok' ? 'ok' : 'missing', fail_count: (p.fail_count ?? 0) + 1, next_at: new Date(now + RECHECK_NONE_MS).toISOString(), checked_at: checked });
      return 'missing';
    }
    const version = shortHash(`${src.source}|${src.bytes.byteLength}`);
    if (p.status === 'ok' && p.version === version) {
      await upsert(env.DB, { key, source_url: src.url, source_id: src.source, status: 'ok', next_at: new Date(now + RECHECK_OK_MS).toISOString(), checked_at: checked, credit: src.credit });
      return 'same';
    }
    const webp = await cutSquare(env, src.bytes, src.face);
    const r2Key = `photos/${p.fs_id}.webp`;
    await env.MEDIA.put(r2Key, webp, { httpMetadata: { contentType: 'image/webp', cacheControl: IMMUTABLE } });
    await upsert(env.DB, {
      key, source_url: src.url, source_id: src.source, r2_key: r2Key, version, bytes: webp.byteLength, status: 'ok',
      next_at: new Date(now + RECHECK_OK_MS).toISOString(), fetched_at: checked, checked_at: checked, credit: src.credit,
    });
    return src.source.split(':')[0];
  } catch (error) {
    await upsert(env.DB, {
      key, status: p.status === 'ok' ? 'ok' : 'failed', fail_count: (p.fail_count ?? 0) + 1, checked_at: checked,
      next_at: new Date(now + Math.min(3600e3 * 2 ** (p.fail_count ?? 0), RECHECK_NONE_MS)).toISOString(), error: String(error?.message ?? error).slice(0, 300),
    });
    return 'failed';
  }
}

export async function syncPhotos(env, { batch = 6 } = {}) {
  if (!env.MEDIA || !env.IMAGES) return { skipped: 'no MEDIA or IMAGES binding' };
  const now = Date.now();
  const rows = await duePlayers(env.DB, now, batch);
  const out = {};
  for (let i = 0; i < rows.length; i += 3) {
    for (const r of await Promise.all(rows.slice(i, i + 3).map((p) => storePhoto(env, p, now)))) out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

// SQL piece for the big photo of a Flashscore player id column.
export const PHOTO_HQ = (col) => `(SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'photo/' || ${col} AND status = 'ok')`;
