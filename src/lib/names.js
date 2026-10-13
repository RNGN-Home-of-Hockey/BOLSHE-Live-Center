// Name helpers shared by every source: folding Latin names, comparing names
// across sources and building Russian display forms.

const SPECIAL_LATIN = {
  ß: 'ss', ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe',
  đ: 'd', Đ: 'd', ł: 'l', Ł: 'l', ı: 'i', þ: 'th', ð: 'd',
};

export function foldLatin(value) {
  return String(value ?? '')
    .replace(/[ßøØæÆœŒđĐłŁıþð]/g, (ch) => SPECIAL_LATIN[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/й/g, 'и')
    .replace(/Й/g, 'И');
}

export function nameTokens(value) {
  const folded = foldLatin(value).toLowerCase();
  const tokens = folded.split(/[^a-zа-я]+/).filter((t) => t.length > 1);
  return [...new Set(tokens)].sort();
}

// Order-free key: "Sinner Jannik", "Jannik Sinner" and "sinner-jannik" give the same key.
export function tokenKey(value) {
  return nameTokens(value).join(' ');
}

export function isCyrillic(value) {
  return /[А-Яа-яЁё]/.test(String(value ?? ''));
}

const PATRONYMIC = /(ович|евич|ьич|овна|евна|ична|инична)$/i;

// Wikidata sometimes stores "Фамилия, Имя", adds a clarification in brackets
// or keeps the patronymic ("Даниил Сергеевич Медведев" -> "Даниил Медведев").
export function cleanRuLabel(label) {
  let text = String(label ?? '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const comma = text.match(/^([^,]+),\s*(.+)$/);
  if (comma) text = `${comma[2]} ${comma[1]}`;
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 3 && PATRONYMIC.test(parts[1])) parts.splice(1, 1);
  // "Готовко Юлия Владимировна" (surname, name, patronymic) -> "Юлия Готовко".
  else if (parts.length === 3 && PATRONYMIC.test(parts[2])) return `${parts[1]} ${parts[0]}`;
  return parts.join(' ');
}

// "Янник Синнер" -> "Я. Синнер"; "Феликс Оже-Альяссим" -> "Ф. Оже-Альяссим".
export function shortRu(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join(' ');
  const [first, ...rest] = parts;
  return `${first[0]}. ${rest.join(' ')}`;
}

// "Синнер Я." form used by Flashscore lists and the old fantasy aliases.
export function surnameInitialRu(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join(' ');
  const [first, ...rest] = parts;
  return `${rest.join(' ')} ${first[0]}.`;
}

// Flashscore Latin display is "Last First" ("Alcaraz Carlos"); slug is "alcaraz-garfia-carlos".
export function latinFromSlug(slug) {
  return String(slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

// Letters of the whole name, sorted: "Xinyu Wang" and "Wang Xin Yu" give the same key.
// Used only as a last resort, together with a shared surname token.
export function letterKey(value) {
  return foldLatin(value).toLowerCase().replace(/[^a-zа-я]/g, '').split('').sort().join('');
}
