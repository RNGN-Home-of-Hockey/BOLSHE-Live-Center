import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanRuLabel, letterKey, shortRu, surnameInitialRu, tokenKey,
} from '../src/lib/names.js';
import { languageForCountry, transcribe } from '../src/lib/translit.js';

test('tokenKey ignores word order, case, accents and the slug form', () => {
  assert.equal(tokenKey('Sinner Jannik'), tokenKey('Jannik Sinner'));
  assert.equal(tokenKey('sinner-jannik'), tokenKey('Jannik SINNER'));
  assert.equal(tokenKey('Iga Świątek'), tokenKey('Swiatek Iga'));
  assert.equal(tokenKey('Ига Швёнтек'), tokenKey('Швентек Ига'));
});

test('letterKey joins names split differently (Chinese names)', () => {
  assert.equal(letterKey('Xinyu Wang'), letterKey('Wang Xin Yu'));
  assert.notEqual(letterKey('Xinyu Wang'), letterKey('Xiyu Wang'));
});

test('cleanRuLabel drops patronymics, brackets and the comma form', () => {
  assert.equal(cleanRuLabel('Даниил Сергеевич Медведев'), 'Даниил Медведев');
  assert.equal(cleanRuLabel('Готовко Юлия Владимировна'), 'Юлия Готовко');
  assert.equal(cleanRuLabel('Синнер, Янник'), 'Янник Синнер');
  assert.equal(cleanRuLabel('Андрей Рублёв (теннисист)'), 'Андрей Рублёв');
  assert.equal(cleanRuLabel('Новак Джокович'), 'Новак Джокович');
});

test('short Russian forms', () => {
  assert.equal(shortRu('Янник Синнер'), 'Я. Синнер');
  assert.equal(shortRu('Феликс Оже-Альяссим'), 'Ф. Оже-Альяссим');
  assert.equal(surnameInitialRu('Алекс де Минаур'), 'де Минаур А.');
});

test('transcription follows the language of the country', () => {
  assert.equal(languageForCountry('ITA'), 'it');
  assert.equal(languageForCountry('XYZ'), 'en');
  assert.equal(transcribe('Gianluca Cadenasso', 'ITA'), 'Джанлука Каденассо');
  assert.equal(transcribe('Rafael Jodar', 'ESP'), 'Рафаэль Ходар');
  assert.equal(transcribe('Hayato Matsuoka', 'JPN'), 'Хаято Мацуока');
  assert.equal(transcribe('Matej Dodig', 'CRO'), 'Матей Додиг');
  assert.equal(transcribe('Xinyu Wang', 'CHN'), 'Синьюй Ван');
  assert.equal(transcribe('Elena Rybakina', 'KAZ'), 'Елена Рыбакина');
  assert.equal(transcribe('Tom Gentzsch', 'GER'), 'Том Генч');
  assert.equal(transcribe('Marton Fucsovics', 'HUN'), 'Мартон Фучович');
});
