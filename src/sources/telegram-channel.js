// The public web view of the «Больше!» Telegram channel: t.me/s/tennis_bolshe (older posts with
// ?before=<post id>). Every post with its id, time, text, the links in the text and a poll with the
// results the page shows. Used for «Больше! Лайв» on the home screen:
//   - the link of the coming show once its announcement post has it (VK Видео, YouTube);
//   - «Голосование недели»: the poll right after a «Вопрос недели» post, otherwise the poll with the
//     most votes of the last 7 days.

export const CHANNEL = 'tennis_bolshe';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#33': '!', nbsp: ' ' };
const decode = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&(amp|lt|gt|quot|#39|#33|nbsp);/g, (_, e) => ENTITIES[e])
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/[ \t]+/g, ' ')
  .trim();

// "1.14K" → 1140, "987" → 987, "1.2M" → 1200000
export function parseVoters(text) {
  const m = String(text ?? '').replace(',', '.').match(/([\d.]+)\s*([KM])?/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6 }[String(m[2] ?? '').toUpperCase()] ?? 1;
  return Math.round(Number(m[1]) * mult);
}

export function parseChannelPage(html) {
  return String(html ?? '').split('<div class="tgme_widget_message_wrap').slice(1).map((part) => {
    const id = Number(part.match(/data-post="[^"/]+\/(\d+)"/)?.[1]);
    const textHtml = part.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    const links = [...textHtml.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map(([, url, label]) => ({ url: decode(url), label: decode(label) }));
    let poll = null;
    const question = part.match(/tgme_widget_message_poll_question">([\s\S]*?)<\/div>/)?.[1];
    if (question != null) {
      const options = [...part.matchAll(/tgme_widget_message_poll_option_percent">\s*(\d+)%\s*<\/div>[\s\S]*?tgme_widget_message_poll_option_text">([\s\S]*?)<\/div>/g)]
        .map(([, percent, text]) => ({ text: decode(text), percent: Number(percent) }));
      poll = { question: decode(question), options, voters: parseVoters(part.match(/tgme_widget_message_voters">([^<]*)</)?.[1]) };
    }
    return { id, date: part.match(/<time datetime="([^"]+)"/)?.[1] ?? null, text: decode(textHtml), links, poll };
  }).filter((p) => p.id);
}

// The id to ask for older posts (?before=…), or null on the first post of the channel.
export const olderThan = (html) => String(html ?? '').match(/data-before="(\d+)"/)?.[1] ?? null;

const mskDate = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);
const postUrl = (id) => `https://t.me/${CHANNEL}/${id}`;
const VK_VIDEO = /^https:\/\/(?:vk\.com\/video|vkvideo\.ru\/|vksport\.vkvideo\.ru\/|m\.vkvideo\.ru\/)/;
const YOUTUBE = /^https:\/\/(?:www\.)?(?:youtube\.com\/(?:live|watch)|youtu\.be\/)/;

// The «Больше! Лайв» links posted on the show's Moscow date (the latest post wins).
export function findLiveLinks(posts, date) {
  const found = posts.filter((p) => p.date && mskDate(p.date) === date && /больше!?\s*лайв/i.test(p.text))
    .map((p) => ({ post: p, vk: p.links.find((l) => VK_VIDEO.test(l.url))?.url ?? null, youtube: p.links.find((l) => YOUTUBE.test(l.url))?.url ?? null }))
    .filter((x) => x.vk || x.youtube)
    .sort((a, b) => b.post.id - a.post.id)[0];
  return found ? { date, vk: found.vk, youtube: found.youtube, post: postUrl(found.post.id) } : null;
}

// «Голосование недели» among the posts of the last 7 days.
export function pickWeekPoll(posts, now = Date.now()) {
  const recent = posts.filter((p) => p.date && now - Date.parse(p.date) <= 7 * 86400e3).sort((a, b) => a.id - b.id);
  const polls = recent.filter((p) => p.poll?.options.length >= 2);
  if (!polls.length) return null;
  const weekly = [...recent].reverse().find((p) => /вопрос недели/i.test(p.text));
  const afterWeekly = weekly ? polls.find((p) => p.id > weekly.id && Date.parse(p.date) - Date.parse(weekly.date) <= 3 * 3600e3) : null;
  const best = afterWeekly ?? [...polls].sort((a, b) => (b.poll.voters ?? 0) - (a.poll.voters ?? 0) || b.id - a.id)[0];
  return { ...best.poll, weekly: Boolean(afterWeekly), url: postUrl(best.id), date: best.date, intro: afterWeekly ? weekly.text.slice(0, 400) : null };
}
