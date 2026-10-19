import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cityFromUrl, pickCityPhotos, sameCity } from '../worker/src/city-photos.js';

const page = (title, width, height, license = 'CC BY-SA 4.0') => ({
  title: `File:${title}`,
  imageinfo: [{ thumburl: `https://upload.example/${encodeURIComponent(title)}`, width, height, extmetadata: { LicenseShortName: { value: license }, Artist: { value: '<a href="#">Автор</a> from Somewhere' } } }],
});

test('city from the Flashscore tournament url', () => {
  assert.equal(cityFromUrl('/tennis/challenger-men-singles/fort-worth/'), 'Fort Worth');
  assert.equal(cityFromUrl('/tennis/challenger-men-singles/santa-cruz-2/'), 'Santa Cruz');
  assert.equal(cityFromUrl('/tennis/atp-singles/brussels/'), 'Brussels');
  assert.equal(cityFromUrl(null), null);
});

test('city photos: free, landscape, big, and only of this city', () => {
  const picked = pickCityPhotos([
    page('Lisbon skyline from Castelo.jpg', 4000, 2250),
    page('Singapore Marina Bay night.jpg', 4000, 2250),        // another city
    page('Lisboa interior of Jerónimos.jpg', 4000, 2250),      // not the city's view
    page('Lisbon tram 28.jpg', 4000, 2250),                    // a tram, not the city
    page('Lisbon panorama small.jpg', 1200, 600),              // too small
    page('Lisbon tower portrait.jpg', 2000, 3000),             // portrait
    page('Lisbon Alfama view.jpg', 3000, 2000, 'All rights reserved'),
    page('Lisbon Tagus river at dusk.jpg', 5000, 2600),
  ], 'Lisbon');
  assert.deepEqual(picked.map((p) => p.title), ['Lisbon skyline from Castelo.jpg', 'Lisbon Tagus river at dusk.jpg']);
  assert.equal(picked[0].credit, 'Фото: Автор, CC BY-SA 4.0, Wikimedia Commons');
});

test('the url city counts only when it sounds like the tournament (Flashscore keeps old urls)', () => {
  assert.equal(sameCity('Лиссабон', 'Lisbon'), true);
  assert.equal(sameCity('Кали', 'Cali'), true);
  assert.equal(sameCity('Fort Worth', 'Fort Worth'), true);
  assert.equal(sameCity('Осака', 'Osaka'), true);
  assert.equal(sameCity('Чьянчжоу', 'Guangzhou'), false);
  assert.equal(sameCity('Брага', 'Lisbon'), false);
});
