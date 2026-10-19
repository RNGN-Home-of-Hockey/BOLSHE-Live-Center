import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findLiveLinks, olderThan, parseChannelPage, parseVoters, pickWeekPoll } from '../src/sources/telegram-channel.js';
import { studioBanner } from '../src/insights/home.js';

const post = (id, date, inner) => `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="tennis_bolshe/${id}">
  <div class="tgme_widget_message_author"><a href="https://t.me/tennis_bolshe">БОЛЬШЕ&#33;</a></div>${inner}
  <a class="tgme_widget_message_date" href="https://t.me/tennis_bolshe/${id}"><time datetime="${date}" class="time">12:00</time></a></div></div>`;
const text = (html) => `<div class="tgme_widget_message_text js-message_text" dir="auto">${html}</div>`;
const poll = (q, opts, voters) => `<div class="tgme_widget_message_poll js-poll"><div class="tgme_widget_message_poll_question">${q}</div>
  <div class="tgme_widget_message_poll_type">Anonymous Poll</div><a class="tgme_widget_message_poll_options" href="#">${opts.map(([t, p]) => `<div class="tgme_widget_message_poll_option">
  <div class="tgme_widget_message_poll_option_percent">${p}%</div><div class="tgme_widget_message_poll_option_value"><div class="tgme_widget_message_poll_option_text">${t}</div>
  <div class="tgme_widget_message_poll_option_bar"></div></div></div>`).join('')}</a></div><div class="tgme_widget_message_info"><span class="tgme_widget_message_voters">${voters}</span></div>`;

const PAGE = `<div class="tme_messages_more" data-before="32600"></div>
  ${post(32601, '2026-10-14T10:00:00+00:00', poll('WTA 1000 в Ухане заберёт', [['Хвалинская', 82], ['Картал', 19]], '1.22K'))}
  ${post(32602, '2026-10-17T14:14:00+00:00', text('❓ Вопрос недели<br>Сможет ли WTA Finals стать «Супербоулом»?'))}
  ${post(32603, '2026-10-17T14:17:00+00:00', poll('Сможет ли WTA Finals стать главным?', [['Да', 40], ['Одним из главных', 45], ['Нет', 15]], '987'))}
  ${post(32604, '2026-10-19T12:21:00+00:00', text('📺 Больше! Лайв сегодня в 19:00<br><a href="https://vksport.vkvideo.ru/video-218116775_456252500" target="_blank">VK Видео</a> <a href="https://youtube.com/live/abc?feature=share">YouTube</a>'))}`;

test('channel page: posts, links, polls with results, the next page id', () => {
  const posts = parseChannelPage(PAGE);
  assert.deepEqual(posts.map((p) => p.id), [32601, 32602, 32603, 32604]);
  assert.equal(olderThan(PAGE), '32600');
  assert.deepEqual(posts[0].poll, { question: 'WTA 1000 в Ухане заберёт', options: [{ text: 'Хвалинская', percent: 82 }, { text: 'Картал', percent: 19 }], voters: 1220 });
  assert.equal(posts[1].text, '❓ Вопрос недели\nСможет ли WTA Finals стать «Супербоулом»?');
  assert.deepEqual(posts[3].links.map((l) => l.label), ['VK Видео', 'YouTube']);
  assert.deepEqual([parseVoters('1.14K'), parseVoters('987'), parseVoters('2M')], [1140, 987, 2000000]);
});

test('«Голосование недели»: the poll after «Вопрос недели», else the most voted of the week', () => {
  const posts = parseChannelPage(PAGE);
  const now = Date.parse('2026-10-19T13:00:00Z');
  const week = pickWeekPoll(posts, now);
  assert.deepEqual([week.question, week.weekly, week.url], ['Сможет ли WTA Finals стать главным?', true, 'https://t.me/tennis_bolshe/32603']);
  const noWeekly = pickWeekPoll(posts.filter((p) => p.id !== 32602), now);
  assert.equal(noWeekly.question, 'WTA 1000 в Ухане заберёт', 'more votes');
  assert.equal(pickWeekPoll(posts, Date.parse('2026-11-01T00:00:00Z')), null, 'nothing within 7 days');
});

test('«Больше! Лайв»: the show\'s links from its announcement go into the banner', () => {
  const posts = parseChannelPage(PAGE);
  const live = findLiveLinks(posts, '2026-10-19');
  assert.deepEqual(live, { date: '2026-10-19', vk: 'https://vksport.vkvideo.ru/video-218116775_456252500', youtube: 'https://youtube.com/live/abc?feature=share', post: 'https://t.me/tennis_bolshe/32604' });
  assert.equal(findLiveLinks(posts, '2026-10-26'), null, 'not the next week\'s show');
  const monday = Date.parse('2026-10-19T13:00:00Z');
  const banner = studioBanner(monday, null, live);
  assert.deepEqual([banner.url, banner.youtube, banner.stream], [live.vk, live.youtube, true]);
  assert.equal(studioBanner(monday, { date: '2026-10-19', url: 'https://vk.com/video-1_2' }, live).url, 'https://vk.com/video-1_2', 'the admins\' link wins');
  const plain = studioBanner(monday, null, null);
  assert.deepEqual([plain.url, plain.stream], ['https://vk.com/tennis_bolshe', false]);
});
