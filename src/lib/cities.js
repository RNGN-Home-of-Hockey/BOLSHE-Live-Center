// Tournament cities in Russian. Flashscore's Russian site names the big cities in Russian and the rest in
// Latin letters ("Ningbo", "Brussels", "M15 Heraklion 7"); the app writes every city in Russian. The
// dictionary keeps the accepted Russian names (exonyms: Брюссель, Лиссабон, Флоренция, Цзинань); a city
// missing from it is transcribed by the rules of its country's language (src/lib/translit.js).

import { transcribe } from './translit.js';

const CITY = {
  // main tour and the big challengers
  'abu dhabi': 'Абу-Даби', acapulco: 'Акапулько', adelaide: 'Аделаида', 'aix-en-provence': 'Экс-ан-Прованс', almaty: 'Алматы', amersfoort: 'Амерсфорт',
  antalya: 'Анталья', antofagasta: 'Антофагаста', antwerp: 'Антверпен', astana: 'Астана', athens: 'Афины', atlanta: 'Атланта', auckland: 'Окленд',
  austin: 'Остин', 'bad homburg': 'Бад-Хомбург', 'banja luka': 'Баня-Лука', barcelona: 'Барселона', basel: 'Базель', bastad: 'Бостад', båstad: 'Бостад',
  beijing: 'Пекин', belgrade: 'Белград', bengaluru: 'Бенгалуру', berlin: 'Берлин', biel: 'Биль', bergamo: 'Бергамо', birmingham: 'Бирмингем', bogota: 'Богота',
  bologna: 'Болонья', bol: 'Бол', bordeaux: 'Бордо', bratislava: 'Братислава', braga: 'Брага', brest: 'Брест', brisbane: 'Брисбен', bucharest: 'Бухарест',
  brussels: 'Брюссель', budapest: 'Будапешт', 'buenos aires': 'Буэнос-Айрес', burgas: 'Бургас', busan: 'Пусан', cagliari: 'Кальяри', cali: 'Кали',
  canberra: 'Канберра', 'cap cana': 'Кап-Кана', casablanca: 'Касабланка', catania: 'Катания', charleston: 'Чарлстон', chengdu: 'Чэнду', chennai: 'Ченнаи',
  chicago: 'Чикаго', chisinau: 'Кишинёв', cincinnati: 'Цинциннати', 'cluj-napoca': 'Клуж-Напока', columbus: 'Колумбус', cordoba: 'Кордова', 'córdoba': 'Кордова',
  dallas: 'Даллас', 'delray beach': 'Делрей-Бич', doha: 'Доха', dubai: 'Дубай', eastbourne: 'Истборн', edmond: 'Эдмонд', eckental: 'Эккенталь',
  florence: 'Флоренция', florianopolis: 'Флорианополис', 'fort worth': 'Форт-Уэрт', geneva: 'Женева', genoa: 'Генуя', gstaad: 'Гштад', guadalajara: 'Гвадалахара',
  guangzhou: 'Гуанчжоу', halle: 'Галле', hamburg: 'Гамбург', hangzhou: 'Ханчжоу', helsinki: 'Хельсинки', heilbronn: 'Хайльбронн', heraklion: 'Ираклион',
  hertogenbosch: 'Хертогенбос', "'s-hertogenbosch": 'Хертогенбос', 'hong kong': 'Гонконг', houston: 'Хьюстон', 'hua hin': 'Хуахин', 'indian wells': 'Индиан-Уэллс',
  islamabad: 'Исламабад', istanbul: 'Стамбул', jinan: 'Цзинань', jiujiang: 'Цзюцзян', kigali: 'Кигали', kitzbuhel: 'Кицбюэль', 'kitzbühel': 'Кицбюэль',
  'la paz': 'Ла-Пас', lagos: 'Лагос', 'las vegas': 'Лас-Вегас', lexington: 'Лексингтон', lima: 'Лима', lille: 'Лилль', lisbon: 'Лиссабон', ljubljana: 'Любляна',
  london: 'Лондон', 'los cabos': 'Лос-Кабос', luanda: 'Луанда', lugano: 'Лугано', lyon: 'Лион', madrid: 'Мадрид', maia: 'Майя', mallorca: 'Мальорка',
  manacor: 'Манакор', marbella: 'Марбелья', marseille: 'Марсель', melbourne: 'Мельбурн', merida: 'Мерида', 'mérida': 'Мерида', metz: 'Мец', miami: 'Майами',
  milan: 'Милан', monastir: 'Монастир', 'monte carlo': 'Монте-Карло', 'monte-carlo': 'Монте-Карло', monterrey: 'Монтеррей', montevideo: 'Монтевидео',
  montpellier: 'Монпелье', montreal: 'Монреаль', mumbai: 'Мумбаи', munich: 'Мюнхен', nanchang: 'Наньчан', naples: 'Неаполь', 'new york': 'Нью-Йорк',
  newport: 'Ньюпорт', 'new haven': 'Нью-Хейвен', ningbo: 'Нинбо', nottingham: 'Ноттингем', olbia: 'Ольбия', orleans: 'Орлеан', 'orléans': 'Орлеан',
  osaka: 'Осака', ostrava: 'Острава', palermo: 'Палермо', paris: 'Париж', parma: 'Парма', perugia: 'Перуджа', phoenix: 'Финикс', pontevedra: 'Понтеведра',
  porto: 'Порту', prague: 'Прага', prostejov: 'Простеёв', 'prostějov': 'Простеёв', pune: 'Пуна', quito: 'Кито', rabat: 'Рабат',
  'quebec city': 'Квебек', 'rio de janeiro': 'Рио-де-Жанейро', riyadh: 'Эр-Рияд', roanne: 'Роанн', rome: 'Рим', rosmalen: 'Росмален', rotterdam: 'Роттердам',
  rovereto: 'Роверето', saguenay: 'Сагеней', salzburg: 'Зальцбург', samsun: 'Самсун', 'san diego': 'Сан-Диего', 'santa cruz': 'Санта-Крус',
  'santa margherita di pula': 'Санта-Маргерита-ди-Пула', santiago: 'Сантьяго', 'sao paulo': 'Сан-Паулу', 'são paulo': 'Сан-Паулу', seoul: 'Сеул',
  seville: 'Севилья', 'sharm elsheikh': 'Шарм-эш-Шейх', 'sharm el sheikh': 'Шарм-эш-Шейх', shanghai: 'Шанхай', shenzhen: 'Шэньчжэнь', singapore: 'Сингапур',
  sofia: 'София', split: 'Сплит', 'st. petersburg': 'Санкт-Петербург', 'saint petersburg': 'Санкт-Петербург', stockholm: 'Стокгольм', strasbourg: 'Страсбург',
  stuttgart: 'Штутгарт', sydney: 'Сидней', szekesfehervar: 'Секешфехервар', 'székesfehérvár': 'Секешфехервар', taipei: 'Тайбэй', tallinn: 'Таллин',
  tampere: 'Тампере', tashkent: 'Ташкент', 'tel aviv': 'Тель-Авив', tokyo: 'Токио', toronto: 'Торонто', turin: 'Турин', umag: 'Умаг', valencia: 'Валенсия',
  vienna: 'Вена', villena: 'Вильена', "villeneuve d'ascq": 'Вильнёв-д’Аск', vilnius: 'Вильнюс', 'wagga wagga': 'Уогга-Уогга', warsaw: 'Варшава',
  washington: 'Вашингтон', wimbledon: 'Уимблдон', 'winston-salem': 'Уинстон-Сейлем', wuhan: 'Ухань', wuning: 'Унин', yokohama: 'Иокогама',
  zagreb: 'Загреб', zhuhai: 'Чжухай', zhangjiagang: 'Чжанцзяган', 'karlovy vary': 'Карловы Вары', 'stara zagora': 'Стара-Загора', redding: 'Реддинг',
  tamworth: 'Тамуорт', darwin: 'Дарвин', solapur: 'Солапур', 'idanha-a-nova': 'Иданья-а-Нова', offenbach: 'Оффенбах', rodez: 'Родез', tanagura: 'Танагура',
  maringa: 'Маринга', 'maringá': 'Маринга', maceio: 'Масейо', 'maceió': 'Масейо', cipolletti: 'Сиполлетти', maanshan: 'Мааньшань', luan: 'Луань',
  'qian daohu': 'Цяньдаоху', szabolcsveresmart: 'Саболчверешмарт',
};

// Russian country names (as Flashscore writes them) → codes for the transcription rules.
const COUNTRY = {
  'италия': 'ITA', 'испания': 'ESP', 'аргентина': 'ARG', 'чили': 'CHI', 'колумбия': 'COL', 'мексика': 'MEX', 'перу': 'PER', 'уругвай': 'URU', 'боливия': 'BOL',
  'эквадор': 'ECU', 'парагвай': 'PAR', 'бразилия': 'BRA', 'португалия': 'POR', 'франция': 'FRA', 'бельгия': 'BEL', 'марокко': 'MAR', 'тунис': 'TUN',
  'германия': 'GER', 'австрия': 'AUT', 'швейцария': 'SUI', 'нидерланды': 'NED', 'чехия': 'CZE', 'словакия': 'SVK', 'хорватия': 'CRO', 'сербия': 'SRB',
  'словения': 'SLO', 'болгария': 'BUL', 'польша': 'POL', 'венгрия': 'HUN', 'румыния': 'ROU', 'молдова': 'MDA', 'япония': 'JPN', 'китай': 'CHN',
  'тайвань': 'TPE', 'гонконг': 'HKG', 'швеция': 'SWE', 'норвегия': 'NOR', 'дания': 'DEN', 'финляндия': 'FIN', 'казахстан': 'KAZ', 'узбекистан': 'UZB',
};

const hasCyrillic = (s) => /[а-яё]/i.test(s);
const key = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// A city alone: "Ningbo" → "Нинбо", "Lexington, KY" → "Лексингтон".
export function ruCity(city, countryRu = null) {
  const text = String(city ?? '').trim();
  if (!text || hasCyrillic(text)) return text;
  const bare = text.replace(/,\s*[A-Z]{2}$/, '');
  const known = CITY[key(bare)];
  if (known) return known;
  const code = COUNTRY[key(countryRu)] ?? null;
  return bare.split(/\s+/).map((w) => transcribe(w, code)).join(' ')
    .replace(/(^|[\s-])(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
}

// A Flashscore tournament name: "Ningbo" → "Нинбо", "Brussels (квалификация)" → "Брюссель (квалификация)",
// "M15 Heraklion 7" → "M15 Ираклион 7", "W35 Las Vegas, NV 2" → "W35 Лас-Вегас 2", "Santa Cruz 2" → "Санта-Крус 2".
export function ruTournament(name, countryRu = null) {
  const text = String(name ?? '').trim();
  const m = text.match(/^((?:[MW]\d+(?:\+H)?)\s+)?(.*?)(\s+\d+)?(\s*\(.*\))?$/);
  if (!m || !/[A-Za-z]/.test(m[2])) return text;
  return `${m[1] ?? ''}${ruCity(m[2], countryRu)}${m[3] ?? ''}${m[4] ?? ''}`;
}
