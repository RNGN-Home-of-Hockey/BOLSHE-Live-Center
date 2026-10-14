// Plain-language explanation of a tournament for the home screen: what kind of event it is
// and why it matters. The tier comes from the «Больше» schedule note when it names one
// ("WTA 1000 Ухань"), otherwise from the list of the big events of the season.

const SLAMS = ['открытый чемпионат австралии', 'australian open', 'ролан гаррос', 'открытый чемпионат франции', 'roland garros', 'уимблдон', 'wimbledon', 'открытый чемпионат сша', 'us open'];
const FINALS = ['итоговый', 'finals', 'турин', 'эр-рияд'];
const ATP_1000 = ['индиан-уэллс', 'майами', 'монте-карло', 'мадрид', 'рим', 'торонто', 'монреаль', 'цинциннати', 'шанхай', 'париж'];
const WTA_1000 = ['доха', 'дубай', 'индиан-уэллс', 'майами', 'мадрид', 'рим', 'торонто', 'монреаль', 'цинциннати', 'пекин', 'ухань'];
const ATP_500 = ['роттердам', 'дубай', 'рио-де-жанейро', 'акапулько', 'доха', 'барселона', 'мюнхен', 'галле', 'лондон', 'гамбург', 'вашингтон', 'пекин', 'токио', 'вена', 'базель'];
const WTA_500 = ['аделаида', 'брисбен', 'абу-даби', 'чарльстон', 'штутгарт', 'берлин', 'бад хомбург', 'истборн', 'лондон', 'вашингтон', 'монтеррей', 'сеул', 'токио', 'нинбо'];

const ABOUT = {
  slam: 'Один из четырёх главных турниров года. Победитель получает 2000 очков рейтинга, мужчины играют до трёх выигранных сетов.',
  finals: 'Итоговый турнир сезона: восемь лучших игроков года, сначала группы, потом полуфиналы и финал.',
  1000: 'Турнир серии 1000 — следующий по важности после Большого шлема. Победителю — 1000 очков рейтинга.',
  500: 'Крупный турнир категории 500: победителю — 500 очков рейтинга.',
  250: 'Турнир категории 250 — небольшой турнир основного тура.',
  tour: 'Турнир основного тура — здесь играют лучшие теннисисты мира.',
  challenger: 'Челленджер — второй уровень после основного тура. Здесь пробиваются молодые и возвращаются после травм.',
  itf: 'Турнир ITF — третий уровень, с него начинают карьеру профессионалы.',
};

const LABEL = { slam: 'Большой шлем', finals: 'Итоговый турнир', 1000: 'серия 1000', 500: 'категория 500', 250: 'категория 250' };

const has = (list, name) => list.some((city) => name.includes(city));

export function tournamentTier({ tour, level, tournament }, hint = null) {
  const name = String(tournament ?? '').toLowerCase().replace(/ё/g, 'е');
  if (level === 'challenger') return 'challenger';
  if (level === 'itf') return 'itf';
  if (level !== 'tour') return null;
  if (has(SLAMS, name)) return 'slam';
  if (has(FINALS, name)) return 'finals';
  const fromHint = String(hint ?? '').match(/\b(1000|500|250)\b/)?.[1];
  if (fromHint) return fromHint;
  if (has(tour === 'WTA' ? WTA_1000 : ATP_1000, name)) return '1000';
  if (has(tour === 'WTA' ? WTA_500 : ATP_500, name)) return '500';
  return 'tour';
}

export function explainTournament(t, hint = null) {
  const tier = tournamentTier(t, hint);
  return {
    tier,
    tier_label: LABEL[tier] ?? (tier === 'challenger' ? 'челленджер' : tier === 'itf' ? 'ITF' : null),
    about: ABOUT[tier] ?? null,
  };
}
