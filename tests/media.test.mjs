import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  coverSourceId, flashscorePhotoUrl, isRealCover, isRealPhotoUrl, mediaUrl, nextCoverCheck, ogImage, photoFiles, shortHash, vkVideoId,
} from '../src/lib/media.js';
import { parseDayFeed } from '../src/sources/flashscore-matches.js';

test('VK video id from every link form of the schedule', () => {
  assert.equal(vkVideoId('https://vk.com/video-218116775_456252380?access_key=abc'), '-218116775_456252380');
  assert.equal(vkVideoId('https://vksport.vkvideo.ru/video-218116775_456252345'), '-218116775_456252345');
  assert.equal(vkVideoId('https://vk.com/video/playlist/-218116775_5'), null);
  assert.equal(vkVideoId(null), null);
});

// Shape of the real VK video page answered to a link-preview bot (2026-10-14).
const PAGE = '<meta property="og:title" content="x"/><meta property="og:image" content="https://sun9-53.vkuserphoto.ru/impg/2GWf/Q2xD.jpg?size=800x450&amp;quality=95&amp;sign=abc&amp;type=video_thumb"/>';

test('og:image is read with the query string decoded', () => {
  assert.equal(ogImage(PAGE), 'https://sun9-53.vkuserphoto.ru/impg/2GWf/Q2xD.jpg?size=800x450&quality=95&sign=abc&type=video_thumb');
  assert.equal(ogImage('<html></html>'), null);
});

test('only a real VK cover counts; stock pictures mean "no cover yet"', () => {
  assert.equal(isRealCover(ogImage(PAGE)), true);
  assert.equal(isRealCover('https://vk.com/images/video/thumbs/video_l.png'), false);
  assert.equal(isRealCover('https://iv.okcdn.ru/getVideoPreview?id=1&fn=vid_w'), false);
  assert.equal(isRealCover('http://sun9-72.userapi.com/fafv/BiN2.png'), false);
  assert.equal(isRealCover(null), false);
});

test('a cover keeps its id across VK hosts and signatures', () => {
  const a = coverSourceId('https://sun9-53.vkuserphoto.ru/impg/2GWf/Q2xD.jpg?size=800x450&sign=one');
  const b = coverSourceId('https://sun9-8.vkuserphoto.ru/impg/2GWf/Q2xD.jpg?size=800x450&sign=two');
  assert.equal(a, '/impg/2GWf/Q2xD.jpg');
  assert.equal(a, b);
  assert.equal(shortHash(a), shortHash(b));
  assert.match(shortHash(a), /^[0-9a-f]{8}$/);
});

test('Flashscore photo values: real files only', () => {
  assert.deepEqual(photoFiles('zsxl-0zrs.png'), ['zsxl-0zrs.png']);
  assert.deepEqual(photoFiles('men'), []);
  assert.deepEqual(photoFiles('women;women'), []);
  assert.deepEqual(photoFiles('a.png;b.png'), ['a.png', 'b.png']);
  assert.equal(flashscorePhotoUrl('zsxl-0zrs.png'), 'https://static.flashscore.com/res/image/data/zsxl-0zrs.png');
  assert.equal(flashscorePhotoUrl('men'), null);
  assert.equal(flashscorePhotoUrl('a.png;b.png'), null);
  assert.equal(isRealPhotoUrl('https://static.flashscore.com/res/image/data/men'), false);
  assert.equal(isRealPhotoUrl('https://static.flashscore.com/res/image/data/a.png'), true);
  assert.equal(mediaUrl('heads/P1.png?v=1'), '/media/heads/P1.png?v=1');
  assert.equal(mediaUrl(null), null);
});

test('the day feed drops stock silhouettes and pairs from player photos', () => {
  const feed = [
    'SA÷2',
    'ZA÷WTA - ОДИНОЧНЫЙ РАЗРЯД: Ухань (Китай), хард¬ZEE÷T1',
    'AA÷M1¬AD÷1791861000¬AB÷1¬AC÷1¬PX÷P1¬AE÷А.¬OA÷women¬PY÷P2¬AF÷Б.¬OB÷b.png',
    'ZA÷WTA - ПАРНЫЙ РАЗРЯД: Ухань (Китай), хард¬ZEE÷T2',
    'AA÷M2¬AD÷1791861000¬AB÷1¬AC÷1¬PX÷X1/X2¬AE÷А./Б.¬OA÷a.png;c.png¬PY÷Y1/Y2¬AF÷В./Г.¬OB÷men;men',
    '',
  ].join('¬~');
  const { matches } = parseDayFeed(feed);
  assert.equal(matches[0].p1_photo, null);
  assert.equal(matches[0].p2_photo, 'https://static.flashscore.com/res/image/data/b.png');
  assert.equal(matches[1].p1_photo, null);
  assert.equal(matches[1].p2_photo, null);
});

test('when a cover is looked at again', () => {
  const now = Date.parse('2026-10-14T13:00:00Z');
  const in30 = new Date(now + 30 * 60e3).toISOString();
  assert.equal(nextCoverCheck({ ok: true, startsAt: '2026-10-14T15:00:00Z', now }), in30, 'upcoming stream: every 30 minutes');
  assert.equal(nextCoverCheck({ ok: true, startsAt: '2026-10-14T03:00:00Z', now }), null, 'ended stream: final');
  assert.equal(nextCoverCheck({ ok: false, startsAt: '2026-10-14T15:00:00Z', fails: 1, now }), new Date(now + 10 * 60e3).toISOString());
  assert.equal(nextCoverCheck({ ok: false, startsAt: '2026-10-14T15:00:00Z', fails: 3, now }), new Date(now + 40 * 60e3).toISOString());
  assert.equal(nextCoverCheck({ ok: false, startsAt: '2026-10-14T15:00:00Z', fails: 20, now }), new Date(now + 12 * 3600e3).toISOString());
  assert.equal(nextCoverCheck({ ok: false, startsAt: '2026-08-01T15:00:00Z', fails: 5, now }), null, 'old broadcast: given up');
});
