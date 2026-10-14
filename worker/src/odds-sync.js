// Winline odds into D1 (match_odds), in our side order. In-play prices every minute, pre-match
// prices every 10 minutes; the last pre-match price stays after the start, so a finished match
// still shows what it was played at (and the app marks the winner's price).

import { fetchWinlineTennis, linkWinline, sideKeys } from '../../src/sources/winline.js';

const mskDate = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

async function candidates(db) {
  const now = Date.now();
  const { results } = await db.prepare(`SELECT m.match_id, m.start_at, m.p1_name, m.p2_name, a.name_ru AS a_ru, b.name_ru AS b_ru
    FROM matches m
    LEFT JOIN players a ON a.fs_id = m.p1_fs_id
    LEFT JOIN players b ON b.fs_id = m.p2_fs_id
    WHERE m.date_msk BETWEEN ? AND ? AND m.status IN ('scheduled', 'live', 'interrupted')`)
    .bind(mskDate(now - 86400e3), mskDate(now + 2 * 86400e3)).all();
  return results.map((r) => ({ match_id: r.match_id, start_at: r.start_at, k1: sideKeys(r.p1_name, r.a_ru), k2: sideKeys(r.p2_name, r.b_ru) }));
}

export async function syncOdds(env, kind) {
  const db = env.DB;
  const feed = (await fetchWinlineTennis(kind)).filter((m) => m.odds);
  const links = linkWinline(feed, await candidates(db));
  const now = new Date().toISOString();
  const statements = links.map(({ wl, match_id: matchId, swapped }) => {
    const [o1, o2] = swapped ? [wl.odds[1], wl.odds[0]] : wl.odds;
    return kind === 'live'
      ? db.prepare(`INSERT INTO match_odds (match_id, wl_id, wl_url, live1, live2, live_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(match_id) DO UPDATE SET wl_id = excluded.wl_id, wl_url = excluded.wl_url, live1 = excluded.live1,
            live2 = excluded.live2, live_at = excluded.live_at, updated_at = excluded.updated_at`)
        .bind(matchId, wl.wl_id, wl.url, o1, o2, now, now)
      : db.prepare(`INSERT INTO match_odds (match_id, wl_id, wl_url, pre1, pre2, pre_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(match_id) DO UPDATE SET wl_id = excluded.wl_id, wl_url = excluded.wl_url, pre1 = excluded.pre1,
            pre2 = excluded.pre2, pre_at = excluded.pre_at, updated_at = excluded.updated_at`)
        .bind(matchId, wl.wl_id, wl.url, o1, o2, now, now);
  });
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  return { kind, feed: feed.length, linked: links.length };
}

// Odds of a match as the app shows them: in-play price while the match is live (if fresh),
// otherwise the last pre-match price.
export function shapeOdds(row, status) {
  if (!row) return null;
  const liveFresh = row.live_at && Date.now() - Date.parse(row.live_at) < 10 * 60e3;
  if (status === 'live' && liveFresh && row.live1 && row.live2) return { p1: row.live1, p2: row.live2, kind: 'live', url: row.wl_url ?? null };
  if (row.pre1 && row.pre2) return { p1: row.pre1, p2: row.pre2, kind: 'pre', url: row.wl_url ?? null };
  if (row.live1 && row.live2) return { p1: row.live1, p2: row.live2, kind: 'live', url: row.wl_url ?? null };
  return null;
}
