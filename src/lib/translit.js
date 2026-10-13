// Latin -> Russian transcription by the language of the player's country.
// Only a fallback for players that no checked source names in Russian
// (every such name is marked "translit" and goes to the editors' review list).
// Rules run in order on a lowercase word; already converted Cyrillic is left alone.

import { foldLatin } from './names.js';

const LANGUAGE_BY_COUNTRY = {
  it: ['ITA', 'SMR'],
  es: ['ESP', 'ARG', 'CHI', 'COL', 'MEX', 'PER', 'URU', 'BOL', 'ECU', 'VEN', 'PAR', 'DOM', 'CRC', 'GUA', 'PAN', 'ESA', 'HON', 'NCA', 'CUB', 'PUR'],
  pt: ['BRA', 'POR'],
  fr: ['FRA', 'MON', 'BEL', 'SEN', 'CIV', 'MAR', 'TUN', 'ALG'],
  de: ['GER', 'AUT', 'SUI', 'LIE', 'LUX'],
  nl: ['NED'],
  sl: ['CZE', 'SVK', 'CRO', 'SRB', 'SLO', 'BIH', 'MNE', 'MKD', 'BUL'],
  pl: ['POL'],
  hu: ['HUN'],
  ro: ['ROU', 'MDA'],
  ja: ['JPN'],
  zh: ['CHN', 'TPE', 'HKG'],
  nordic: ['SWE', 'NOR', 'DEN', 'FIN', 'ISL'],
  ru: ['RUS', 'UKR', 'BLR', 'KAZ', 'UZB', 'KGZ', 'TJK', 'ARM', 'GEO', 'AZE', 'LAT', 'LTU', 'EST'],
};
const LANGUAGE = new Map(
  Object.entries(LANGUAGE_BY_COUNTRY).flatMap(([lang, codes]) => codes.map((c) => [c, lang])),
);

export function languageForCountry(code) {
  return LANGUAGE.get(String(code ?? '').toUpperCase()) ?? 'en';
}

const C = 'bcdfghjklmnpqrstvwxz';
const V = 'aeiouy';
const ROMANCE_L = [[new RegExp(`l(?=[${C}])`, 'g'), 'ль'], [/l$/, 'ль'], [/(?<=[aiou])e/g, 'э']];

const RULES = {
  it: [
    [/sci(?=[aou])/g, 'ш'], [/sc(?=[ei])/g, 'ш'], [/cch/g, 'кк'], [/ch/g, 'к'], [/gh/g, 'г'],
    [/gli/g, 'ли'], [/gn/g, 'нь'], [/ci(?=[aou])/g, 'ч'], [/c(?=[ei])/g, 'ч'],
    [/gi(?=[aou])/g, 'дж'], [/g(?=[ei])/g, 'дж'], [/zz/g, 'цц'], [/z/g, 'ц'], [/qu/g, 'кв'],
    [/(?<=[aeiou])s(?=[aeiou])/g, 'з'], [/h/g, ''], [/j/g, 'й'], ...ROMANCE_L,
  ],
  es: [
    [/ll/g, 'ль'], [/ch/g, 'ч'], [/qu(?=[ei])/g, 'к'], [/gu(?=[ei])/g, 'г'], [/c(?=[ei])/g, 'с'],
    [/z/g, 'с'], [/j/g, 'х'], [/g(?=[ei])/g, 'х'], [/h/g, ''], [/y(?=[aeiou])/g, 'й'], [/y$/, 'й'],
    [/ue/g, 'уэ'], ...ROMANCE_L,
  ],
  pt: [
    [/lh/g, 'ль'], [/nh/g, 'нь'], [/ch/g, 'ш'], [/qu(?=[ei])/g, 'к'], [/gu(?=[ei])/g, 'г'],
    [/c(?=[ei])/g, 'с'], [/g(?=[ei])/g, 'ж'], [/j/g, 'ж'], [/x/g, 'ш'], [/h/g, ''],
    [/(?<=[aeiou])s(?=[aeiou])/g, 'з'], [/ao$/, 'ан'], [/oes$/, 'оэс'], ...ROMANCE_L,
  ],
  fr: [
    [/eaux?$/, 'о'], [/eau/g, 'о'], [/aux?$/, 'о'], [/au/g, 'о'], [/ou/g, 'у'], [/oi/g, 'уа'],
    [/ille/g, 'ий'], [/ai(?![l])/g, 'е'], [/ei/g, 'е'], [/eu/g, 'ё'],
    [/ch|sh/g, 'ш'], [/gn/g, 'нь'], [/qu/g, 'к'], [/gu(?=[eiy])/g, 'г'], [/c(?=[eiy])/g, 'с'],
    [/g(?=[eiy])/g, 'ж'], [/j/g, 'ж'], [/ph/g, 'ф'], [/th/g, 'т'], [/h/g, ''],
    [new RegExp(`(?:ai|ei)n(?![${V}n])`, 'g'), 'ен'], [new RegExp(`in(?![${V}n])`, 'g'), 'ен'],
    [new RegExp(`(?:e|a)n(?![${V}n])`, 'g'), 'ан'], [new RegExp(`on(?![${V}n])`, 'g'), 'он'],
    [new RegExp(`un(?![${V}n])`, 'g'), 'ен'], [/(?<=[aeiou])s(?=[aeiou])/g, 'з'],
    [/(?<=.)e[tsrz]$/, 'е'], [/(?<=.{2})[stdz]$/, ''], [/(?<=[^аеёиоуыэюя])e$/, ''],
    ...ROMANCE_L,
  ],
  de: [
    [/tzsch|tsch/g, 'ч'], [/sch/g, 'ш'], [/^sp/, 'шп'], [/^st/, 'шт'], [/ch/g, 'х'], [/ck/g, 'к'],
    [/ei|ey|ai/g, 'ай'], [/eu|aeu/g, 'ой'], [/ie/g, 'и'], [/ae/g, 'е'], [/oe/g, 'ё'], [/ue/g, 'ю'],
    [/^s(?=[aeiou])/, 'з'], [/(?<=[aeiou])s(?=[aeiou])/g, 'з'], [/tz/g, 'ц'], [/z/g, 'ц'],
    [/w/g, 'в'], [/v/g, 'ф'], [/j/g, 'й'], [/ph/g, 'ф'], [/th/g, 'т'], [/(?<=[aeiou])h/g, ''],
  ],
  nl: [
    [/sch/g, 'сх'], [/ch/g, 'х'], [/oe/g, 'у'], [/ij/g, 'ей'], [/ui/g, 'ёй'], [/aa/g, 'а'],
    [/ee/g, 'е'], [/oo/g, 'о'], [/uu/g, 'ю'], [/ie/g, 'и'], [/eu/g, 'ё'], [/g/g, 'х'],
    [/j/g, 'й'], [/w/g, 'в'], [/y/g, 'ей'],
  ],
  sl: [
    [/dj/g, 'дж'], [/ch/g, 'х'], [/ja/g, 'я'], [/je/g, 'е'], [/ju/g, 'ю'], [/jo/g, 'йо'],
    [/j/g, 'й'], [/c/g, 'ц'], [/w/g, 'в'],
  ],
  pl: [
    [/szcz/g, 'щ'], [/sz/g, 'ш'], [/cz/g, 'ч'], [/rz/g, 'ж'], [/ch/g, 'х'],
    [/ci(?=[aeiou])/g, 'ч'], [/ci/g, 'чи'], [/si(?=[aeiou])/g, 'ш'], [/si/g, 'ши'],
    [/zi(?=[aeiou])/g, 'ж'], [/ni(?=[aeiou])/g, 'нь'], [/ia/g, 'я'], [/ie/g, 'е'], [/io/g, 'ё'],
    [/iu/g, 'ю'], [/ja/g, 'я'], [/je/g, 'е'], [/ju/g, 'ю'], [/jo/g, 'йо'], [/j/g, 'й'],
    [/c/g, 'ц'], [/w/g, 'в'], [/y/g, 'ы'],
  ],
  hu: [
    [/sz/g, 'с'], [/zs/g, 'ж'], [/cs/g, 'ч'], [/gy/g, 'дь'], [/ny/g, 'нь'], [/ly/g, 'й'],
    [/ty/g, 'ть'], [/s/g, 'ш'], [/c/g, 'ц'], [/j/g, 'й'],
  ],
  ro: [
    [/che/g, 'ке'], [/chi/g, 'ки'], [/ghe/g, 'ге'], [/ghi/g, 'ги'], [/c(?=[ei])/g, 'ч'],
    [/g(?=[ei])/g, 'дж'], [/j/g, 'ж'], [/ea/g, 'я'], [/ia/g, 'ия'],
  ],
  ja: [
    [/sha/g, 'ся'], [/shu/g, 'сю'], [/sho/g, 'сё'], [/shi/g, 'си'], [/cha/g, 'тя'], [/chu/g, 'тю'],
    [/cho/g, 'тё'], [/chi/g, 'ти'], [/tsu/g, 'цу'], [/ji/g, 'дзи'], [/ja/g, 'дзя'], [/ju/g, 'дзю'],
    [/jo/g, 'дзё'], [/z/g, 'дз'], [/ya/g, 'я'], [/yu/g, 'ю'], [/yo/g, 'ё'], [/ei/g, 'эй'],
    [/ou/g, 'о'], [/n(?=[bmp])/g, 'м'], [/e/g, 'э'], [/w/g, 'в'],
  ],
  zh: [
    [/yuan/g, 'юань'], [/yue/g, 'юэ'], [/you/g, 'ю'], [/yu/g, 'юй'], [/ya/g, 'я'], [/ye/g, 'е'],
    [/yi/g, 'и'], [/yo/g, 'ё'], [/zh/g, 'чж'], [/ch/g, 'ч'], [/sh/g, 'ш'], [/x/g, 'с'],
    [/q/g, 'ц'], [/j/g, 'цз'], [/z/g, 'цз'], [/c/g, 'ц'], [/^r|(?<=[aeiou])r/g, 'ж'],
    [/iang/g, 'ян'], [/ian/g, 'янь'], [/ang/g, 'ан'], [/eng/g, 'эн'], [/ing/g, 'ин'], [/ong/g, 'ун'],
    [/an/g, 'ань'], [/en/g, 'энь'], [/in/g, 'инь'], [/un/g, 'унь'], [/ui/g, 'уй'], [/iu/g, 'ю'],
    [/ie/g, 'е'], [/ei/g, 'эй'], [/ai/g, 'ай'], [/e/g, 'э'], [/w/g, 'в'], [/y/g, 'и'],
  ],
  nordic: [
    [/skj|sj|kj/g, 'ш'], [/ck/g, 'к'], [/aa/g, 'о'], [/uu/g, 'у'], [/j/g, 'й'], [/w/g, 'в'],
  ],
  ru: [
    [/shch/g, 'щ'], [/kh/g, 'х'], [/zh/g, 'ж'], [/ts/g, 'ц'], [/ch/g, 'ч'], [/sh/g, 'ш'],
    [/ya/g, 'я'], [/yu/g, 'ю'], [/yo/g, 'ё'], [/ye/g, 'е'], [/ia$/, 'ия'], [/iy$/, 'ий'],
    [/yy$/, 'ый'], [/(?<=[nlrtdmsv])y$/, 'ий'], [new RegExp(`(?<=[${C}])y(?=[${C}])`, 'g'), 'ы'],
    [/y$/, 'й'], [/(?<=[aeiouаеиоуя])y/g, 'й'], [/j/g, 'й'],
  ],
  en: [
    [/sch/g, 'ш'], [/sh/g, 'ш'], [/ch/g, 'ч'], [/zh/g, 'ж'], [/kh/g, 'х'], [/ts/g, 'ц'],
    [/ph/g, 'ф'], [/th/g, 'т'], [/ck/g, 'к'], [/qu/g, 'кв'], [/ee|ea/g, 'и'], [/oo/g, 'у'],
    [/ou/g, 'ау'], [/ay|ai/g, 'эй'], [/ey$/, 'и'], [/y$/, 'и'], [/ya/g, 'я'], [/yu/g, 'ю'],
    [/(?<=[aeiou])y/g, 'й'], [/j/g, 'дж'], [/w/g, 'у'],
  ],
};

const BASE = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'й', k: 'к',
  l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в',
  w: 'в', x: 'кс', y: 'и', z: 'з',
};

function transcribeWord(word, lang) {
  let text = foldLatin(word).toLowerCase();
  for (const [pattern, replacement] of RULES[lang] ?? RULES.en) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/[a-z]/g, (ch) => BASE[ch] ?? ch);
  // Word-initial "е" reads as "э" ("Evans" -> "Эванс"), except in Slavic-origin names ("Elena").
  if (!['ru', 'sl', 'pl'].includes(lang)) text = text.replace(/^е/, 'э');
  text = text.replace(/ьь/g, 'ь');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export function transcribe(name, countryCode) {
  const lang = languageForCountry(countryCode);
  return String(name ?? '')
    .split(/(\s+|-)/)
    .map((piece) => (piece === '' || /^[\s-]+$/.test(piece) ? piece : transcribeWord(piece, lang)))
    .join('');
}
