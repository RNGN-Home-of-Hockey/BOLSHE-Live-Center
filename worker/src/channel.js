// Reads the «Больше!» Telegram channel (src/sources/telegram-channel.js) for the «Больше! Лайв» banner:
// the coming show's VK Видео / YouTube links and «Голосование недели». Hourly; every 10 minutes on
// show days from noon (Moscow) until the show ends, so the link appears soon after the post.
// Stored in app_state 'channel'; worker/src/home.js puts it into the banner.

import { nextStudio } from '../../src/insights/home.js';
import { CHANNEL, findLiveLinks, olderThan, parseChannelPage, pickWeekPoll } from '../../src/sources/telegram-channel.js';

const KEY = 'channel';
const PAGES = 12; // ~15 posts a page, the channel posts ~15 a day: a week back

export async function readChannel(db) {
  const row = await db.prepare('SELECT value FROM app_state WHERE key = ?').bind(KEY).first();
  try {
    return row?.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

// How often to look: every 10 minutes from 12:00 Moscow on the show's day until it ends, else hourly.
export function channelEveryMs(now = Date.now()) {
  const slot = nextStudio(now);
  const noon = slot ? Date.parse(`${slot.date}T09:00:00Z`) : Infinity;
  return slot && now >= noon && now <= Date.parse(slot.ends_at) ? 10 * 60e3 : 60 * 60e3;
}

export async function syncChannel(env) {
  const now = Date.now();
  const posts = [];
  let before = null;
  for (let page = 0; page < PAGES; page += 1) {
    const res = await fetch(`https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ''}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BolsheLiveCenter/1.0)', 'accept-language': 'ru' },
    });
    if (!res.ok) throw new Error(`t.me HTTP ${res.status}`);
    const html = await res.text();
    const got = parseChannelPage(html);
    posts.push(...got);
    before = olderThan(html);
    const oldest = got.reduce((min, p) => (p.date && p.date < min ? p.date : min), '9999');
    if (!before || !got.length || now - Date.parse(oldest) > 7.5 * 86400e3) break;
  }
  const slot = nextStudio(now);
  const value = {
    checked_at: new Date(now).toISOString(),
    posts: posts.length,
    live: slot ? findLiveLinks(posts, slot.date) : null,
    poll: pickWeekPoll(posts, now),
  };
  await env.DB.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(KEY, JSON.stringify(value), value.checked_at).run();
  return { posts: value.posts, live: Boolean(value.live), poll: value.poll?.question ?? null };
}
