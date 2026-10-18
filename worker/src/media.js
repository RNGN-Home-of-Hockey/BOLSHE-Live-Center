// Pictures kept on our side in the R2 bucket MEDIA, so the app never shows a dead VK or
// Flashscore link and every picture stays available for good:
//   covers — the VK video's own picture of every «Больше» broadcast (og:image of the video page),
//            cut down by Cloudflare Images to 640×360 JPEG (~35 KB instead of ~125 KB);
//   heads  — a player's Flashscore photo (100×100 PNG, ~15 KB), stored as is;
//   hosts, tours — hosts' portraits and tournament stadium photos, uploaded by hand (credited in D1).
// D1 table `media` says what is stored, where it came from and when to look again.
//   GET /media/covers/<vk video id>.jpg     GET /media/heads/<flashscore id>.png

import { coverSourceId, isRealCover, isRealPhotoUrl, nextCoverCheck, ogImage, shortHash, vkVideoId } from '../../src/lib/media.js';

// VK gives link-preview bots a page with og:image; other agents coming from Cloudflare end in
// an endless login redirect (checked 2026-10-14).
const VK_AGENT = 'TelegramBot (like TwitterBot)';
const COVER = { width: 640, height: 360, quality: 80 };
const MAX_ORIGINAL_BYTES = 400 * 1024; // kept as is only if Images cannot cut it down
const TINY_PICTURE = 400; // Flashscore answers "no photo" with a ~120-byte empty PNG
const IMMUTABLE = 'public, max-age=31536000, immutable';

const mskDate = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

function upsert(db, m) {
  return db.prepare(`INSERT INTO media (media_key, kind, source_url, source_id, r2_key, version, bytes, status, fail_count, next_at, fetched_at, checked_at, error)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(media_key) DO UPDATE SET
      source_url = COALESCE(excluded.source_url, media.source_url), source_id = COALESCE(excluded.source_id, media.source_id),
      r2_key = COALESCE(excluded.r2_key, media.r2_key), version = COALESCE(excluded.version, media.version),
      bytes = COALESCE(excluded.bytes, media.bytes), status = excluded.status, fail_count = excluded.fail_count,
      next_at = excluded.next_at, fetched_at = COALESCE(excluded.fetched_at, media.fetched_at),
      checked_at = excluded.checked_at, error = excluded.error`)
    .bind(m.key, m.kind, m.source_url ?? null, m.source_id ?? null, m.r2_key ?? null, m.version ?? null, m.bytes ?? null,
      m.status, m.fail_count ?? 0, m.next_at ?? null, m.fetched_at ?? null, m.checked_at, m.error ?? null)
    .run();
}

// ---------- covers ----------

// broadcasts.vk_video is filled from the VK link once (and again when the link changes).
async function linkVideos(db) {
  const { results } = await db.prepare(`SELECT broadcast_key, vk_url FROM broadcasts
    WHERE vk_url IS NOT NULL AND vk_video IS NULL LIMIT 500`).all();
  const statements = results.map((r) => db.prepare('UPDATE broadcasts SET vk_video = ? WHERE broadcast_key = ?')
    .bind(vkVideoId(r.vk_url) ?? '', r.broadcast_key));
  for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
  return statements.length;
}

// Never-tried covers first, nearest to now first: today's broadcasts, then the history backwards.
async function dueCovers(db, nowIso, limit) {
  const { results } = await db.prepare(`SELECT b.vk_video, MIN(b.vk_url) AS vk_url,
      COALESCE(MIN(b.starts_at), MIN(b.date_msk) || 'T09:00:00Z') AS starts_at,
      m.status, m.source_id, m.fail_count
    FROM broadcasts b LEFT JOIN media m ON m.media_key = 'cover/' || b.vk_video
    WHERE b.vk_video IS NOT NULL AND b.vk_video != '' AND b.status != 'removed'
      AND (m.media_key IS NULL OR (m.next_at IS NOT NULL AND m.next_at <= ?1))
    GROUP BY b.vk_video
    ORDER BY (m.media_key IS NOT NULL), ABS(julianday(COALESCE(MIN(b.starts_at), MIN(b.date_msk) || 'T09:00:00Z')) - julianday(?1))
    LIMIT ?2`).bind(nowIso, limit).all();
  return results;
}

async function shrinkCover(env, original) {
  if (env.IMAGES) {
    try {
      const out = await env.IMAGES.input(new Blob([original]).stream())
        .transform({ width: COVER.width, height: COVER.height, fit: 'cover' })
        .output({ format: 'image/jpeg', quality: COVER.quality });
      const bytes = await out.response().arrayBuffer();
      if (bytes.byteLength > TINY_PICTURE) return bytes;
    } catch (error) {
      console.error('cover resize failed', error?.message ?? error);
    }
  }
  if (original.byteLength > MAX_ORIGINAL_BYTES) throw new Error('cover could not be cut down');
  return original;
}

async function storeCover(env, row, now) {
  const base = {
    key: `cover/${row.vk_video}`, kind: 'cover', source_url: `https://vk.com/video${row.vk_video}`,
    checked_at: new Date(now).toISOString(),
  };
  const wasOk = row.status === 'ok';
  const fails = (row.fail_count ?? 0) + 1;
  try {
    const page = await fetch(row.vk_url, { headers: { 'user-agent': VK_AGENT } });
    if (!page.ok) throw new Error(`VK page HTTP ${page.status}`);
    const image = ogImage(await page.text());
    // No picture right now: a stored cover stays (VK sometimes flips to a stock image for a while).
    if (!isRealCover(image)) {
      await upsert(env.DB, wasOk
        ? { ...base, status: 'ok', fail_count: 0, next_at: nextCoverCheck({ ok: true, startsAt: row.starts_at, now }) }
        : { ...base, status: 'missing', fail_count: fails, next_at: nextCoverCheck({ ok: false, startsAt: row.starts_at, fails, now }) });
      return 'missing';
    }
    const sourceId = coverSourceId(image);
    if (wasOk && row.source_id === sourceId) {
      await upsert(env.DB, { ...base, status: 'ok', fail_count: 0, next_at: nextCoverCheck({ ok: true, startsAt: row.starts_at, now }) });
      return 'same';
    }
    const res = await fetch(image);
    if (!res.ok) throw new Error(`VK picture HTTP ${res.status}`);
    const bytes = await shrinkCover(env, await res.arrayBuffer());
    const r2Key = `covers/${row.vk_video}.jpg`;
    await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: 'image/jpeg', cacheControl: IMMUTABLE } });
    await upsert(env.DB, {
      ...base, source_id: sourceId, r2_key: r2Key, version: shortHash(sourceId), bytes: bytes.byteLength,
      status: 'ok', fail_count: 0, fetched_at: base.checked_at, next_at: nextCoverCheck({ ok: true, startsAt: row.starts_at, now }),
    });
    return 'stored';
  } catch (error) {
    await upsert(env.DB, {
      ...base, status: wasOk ? 'ok' : 'failed', fail_count: fails, error: String(error?.message ?? error).slice(0, 300),
      next_at: nextCoverCheck({ ok: wasOk, startsAt: row.starts_at, fails, now }),
    });
    return 'failed';
  }
}

// ---------- heads ----------

// Players of the base by rank, then players of the nearby matches who are not in the base.
// A head is fetched again when the player's photo link changes.
async function dueHeads(db, now, limit) {
  const from = mskDate(now - 2 * 86400e3);
  const to = mskDate(now + 2 * 86400e3);
  const { results } = await db.prepare(`SELECT c.fs_id, c.photo, h.status, h.fail_count FROM (
      SELECT fs_id, photo_url AS photo, COALESCE(singles_rank, 2000 + COALESCE(doubles_rank, 3000)) AS prio
        FROM players WHERE fs_id IS NOT NULL AND photo_url IS NOT NULL
      UNION ALL
      SELECT p1_fs_id, p1_photo, 9000 FROM matches WHERE date_msk BETWEEN ?1 AND ?2 AND p1_photo IS NOT NULL
        AND p1_fs_id NOT IN (SELECT fs_id FROM players WHERE fs_id IS NOT NULL)
      UNION ALL
      SELECT p2_fs_id, p2_photo, 9000 FROM matches WHERE date_msk BETWEEN ?1 AND ?2 AND p2_photo IS NOT NULL
        AND p2_fs_id NOT IN (SELECT fs_id FROM players WHERE fs_id IS NOT NULL)
    ) c LEFT JOIN media h ON h.media_key = 'head/' || c.fs_id
    WHERE h.media_key IS NULL OR h.source_id IS NOT c.photo OR (h.status != 'ok' AND h.next_at IS NOT NULL AND h.next_at <= ?3)
    ORDER BY c.prio LIMIT ?4`).bind(from, to, new Date(now).toISOString(), limit).all();
  const seen = new Set();
  return results.filter((r) => /^[A-Za-z0-9]+$/.test(r.fs_id ?? '') && !seen.has(r.fs_id) && seen.add(r.fs_id));
}

async function storeHead(env, row, now) {
  const checked = new Date(now).toISOString();
  const base = { key: `head/${row.fs_id}`, kind: 'head', source_url: row.photo, source_id: row.photo, checked_at: checked };
  const fails = (row.fail_count ?? 0) + 1;
  const retry = fails >= 6 ? null : new Date(now + Math.min(3600e3 * 2 ** (fails - 1), 7 * 86400e3)).toISOString();
  if (!isRealPhotoUrl(row.photo)) {
    await upsert(env.DB, { ...base, status: 'missing', fail_count: fails, next_at: null });
    return 'missing';
  }
  try {
    const res = await fetch(row.photo);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < TINY_PICTURE) {
      await upsert(env.DB, { ...base, status: 'missing', fail_count: fails, next_at: new Date(now + 7 * 86400e3).toISOString() });
      return 'missing';
    }
    const ext = (row.photo.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg');
    const r2Key = `heads/${row.fs_id}.${ext}`;
    const type = res.headers.get('content-type') ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: type, cacheControl: IMMUTABLE } });
    await upsert(env.DB, {
      ...base, r2_key: r2Key, version: shortHash(row.photo), bytes: bytes.byteLength, status: 'ok', fail_count: 0, fetched_at: checked,
    });
    return 'stored';
  } catch (error) {
    await upsert(env.DB, { ...base, status: 'failed', fail_count: fails, next_at: retry, error: String(error?.message ?? error).slice(0, 300) });
    return 'failed';
  }
}

const tally = (list) => list.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});

// One round: a few covers (one VK page at a time) and a batch of heads (six at a time).
export async function syncMedia(env, { covers = 5, heads = 30 } = {}) {
  if (!env.MEDIA) return { skipped: 'MEDIA bucket is not bound' };
  const now = Date.now();
  const linked = await linkVideos(env.DB);
  const coverResults = [];
  for (const row of await dueCovers(env.DB, new Date(now).toISOString(), covers)) {
    coverResults.push(await storeCover(env, row, now));
  }
  const headRows = (await dueHeads(env.DB, now, heads * 2)).slice(0, heads);
  const headResults = [];
  for (let i = 0; i < headRows.length; i += 6) {
    headResults.push(...await Promise.all(headRows.slice(i, i + 6).map((row) => storeHead(env, row, now))));
  }
  return { linked, covers: tally(coverResults), heads: tally(headResults) };
}

const MEDIA_PATH = /^\/media\/(covers|heads|hosts|tours)\/([A-Za-z0-9_-]+\.(?:jpg|png|webp))$/;

// Stored pictures are immutable: a new cover gets a new ?v= in the API, so browsers cache for a year.
// A missing one answers 404 (cached 10 minutes) and the app shows the players' heads instead.
export async function serveMedia(env, path) {
  const m = path.match(MEDIA_PATH);
  const object = m && env.MEDIA ? await env.MEDIA.get(`${m[1]}/${m[2]}`) : null;
  if (!object) return new Response('not found', { status: 404, headers: { 'cache-control': 'public, max-age=600' } });
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': IMMUTABLE,
      etag: object.httpEtag,
      'access-control-allow-origin': '*',
    },
  });
}

export async function mediaCounts(db) {
  const { results } = await db.prepare('SELECT kind, status, COUNT(*) AS n, SUM(bytes) AS bytes FROM media GROUP BY kind, status').all();
  return results;
}
