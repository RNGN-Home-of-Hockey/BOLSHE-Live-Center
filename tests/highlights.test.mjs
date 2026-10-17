import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanItem } from '../worker/src/highlights.js';

const KEY = '2026-10-17_1200_wta-kartal-sonay_wta-ostapenko-jelena';
const item = (over = {}) => ({
  key: KEY,
  match_id: 'r1Ik4Fsf',
  vk: 'https://vk.com/video-218116775_456252444',
  cover: `/hl/${KEY}/20261017_kartal-ostapenko_cover.jpg`,
  finished: '2026-10-17T12:13:36+00:00',
  summaries: { 1: 'Картал 7:6, на тай-брейке', 2: 'Картал 7:6' },
  files: [
    { kind: 'review', url: `/hl/${KEY}/20261017_kartal-ostapenko_review_light.mp4`, secs: 250, mb: 46.7 },
    { kind: 'top3', url: `/hl/${KEY}/20261017_kartal-ostapenko_top5_light.mp4`, secs: 46, mb: 20.6 },
    { kind: 'set1', url: `/hl/${KEY}/20261017_kartal-ostapenko_set1_light.mp4`, secs: 168, mb: 37.4 },
  ],
  ...over,
});

test('a finished desk job becomes a highlights row: date and players from the key, review → done', () => {
  const r = cleanItem(item());
  assert.equal(r.match_key, KEY);
  assert.equal(r.date_msk, '2026-10-17');
  assert.equal(r.player1_id, 'wta-kartal-sonay');
  assert.equal(r.player2_id, 'wta-ostapenko-jelena');
  assert.equal(r.match_id, 'r1Ik4Fsf');
  assert.equal(r.done, 1);
  assert.equal(r.files.length, 3);
  assert.deepEqual(r.summaries, { 1: 'Картал 7:6, на тай-брейке', 2: 'Картал 7:6' });
});

test('only set clips cut on air: not done yet; foreign or odd files are dropped', () => {
  const r = cleanItem(item({ files: [
    { kind: 'set1', url: `/hl/${KEY}/a_set1_light.mp4`, secs: 100, mb: 20 },
    { kind: 'set2', url: '/hl/other_key/x_set2_light.mp4', secs: 1, mb: 1 },
    { kind: 'review', url: `/hl/${KEY}/../../etc/passwd`, secs: 1, mb: 1 },
    { kind: 'script', url: `/hl/${KEY}/x.html`, secs: 1, mb: 1 },
  ] }));
  assert.equal(r.done, 0);
  assert.deepEqual(r.files.map((f) => f.kind), ['set1']);
});

test('bad keys, VK links and covers are refused', () => {
  assert.equal(cleanItem(item({ key: 'drop table' })), null);
  assert.equal(cleanItem(item({ files: [] })), null);
  const r = cleanItem(item({ vk: 'https://evil.example/video', cover: '/etc/x.jpg', match_id: 'x' }));
  assert.equal(r.vk_url, null);
  assert.equal(r.cover, null);
  assert.equal(r.match_id, null);
});
