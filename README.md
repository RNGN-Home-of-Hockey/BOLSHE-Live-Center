# БОЛЬШЕ Live Center — теннис

Telegram-приложение (бот + Mini App) для теннисного проекта «Больше» и его «ядро данных»:
игроки ATP и WTA, рейтинги, статистика, расписание, прогнозы, фэнтези.

Сделано по опыту двух рабочих проектов:
- [HOH NHL Daily Results / Live Center](https://github.com/RNGN-Home-of-Hockey/HOH_NHL_Daily_Results) — Cloudflare Worker + D1 + бот + Mini App;
- RG Fantasy 2026 (Ролан Гаррос) — 862 участника, очки, очередь рассылок.

## Что уже есть

| Часть | Где | Состояние |
|---|---|---|
| База игроков ATP/WTA (одиночки + пары) | `data/players/players.json`, `players.csv` | 5 228 игроков, обновляется скриптом |
| Источники: Flashscore, WTA, Wikidata, Tennis Abstract, ESPN, фэнтези RG-2026 | `src/sources/` | работают |
| Русские имена (проверенные редакцией → Wikidata → Flashscore → транскрипция) | `src/players/merge.js`, `src/lib/translit.js` | на проверку: `data/players/review_names.csv` |
| Схема базы данных (для Cloudflare D1) | `migrations/` | игроки, варианты имён, история рейтингов и Elo, фэнтези |
| Тесты | `tests/` | `npm test` |
| **Единая база на сервере** | Cloudflare D1 `bolshe-live-center` + Worker https://bolshe-live-center.znamteam-903.workers.dev | работает: `/health`, `/api/players?q=`, `/api/broadcasts?date=`, `/api/levels?xp=` |
| Бот (правка имён навсегда, бусты) | `worker/src/telegram.js` | ждёт токен бота |
| Расписание эфиров «Больше» | `src/sources/schedule.js` → таблица `broadcasts` | каждые 10 минут, только теннис, без ключей трансляций |
| Проверка имён по sports.ru | `scripts/check-sportsru.mjs` → `data/seed/sportsru_names.json` | все игроки, по рейтингу сверху |
| Уровни (теннисные) | `src/game/levels.js` | от «Подающего мячи» до «Легенды» |

Что делаем дальше — [docs/ROADMAP.md](docs/ROADMAP.md). Что за продукт — [docs/PRODUCT.md](docs/PRODUCT.md).
Обсуждение идей и отзывы тестировщиков — ветка [`discussion`](../../tree/discussion).

## Как обновить базу игроков

Нужен Node.js 22.5 или новее.

```bash
npm run players:refresh   # скачать всё заново и пересобрать data/players/
npm run sportsru          # проверить имена по sports.ru (продолжает с места остановки)
npm run sync              # забрать правки из бота -> пересобрать -> залить в Cloudflare D1
npm run deploy            # опубликовать Worker
npm test
```

Правки имён, сделанные в боте (`/name`, `/fix`), хранятся в D1 (`player_name_overrides`) и
побеждают все источники при каждой пересборке — «навсегда».

Секреты Worker (не в репозитории): `TELEGRAM_BOT_TOKEN`, `ADMIN_IDS`, `SCHEDULE_SHEET_ID`.
Локально адрес таблицы расписания — в `private/config.json` (в `.gitignore`).

Отчёт о сборке — `data/players/REPORT.md` (сколько игроков, откуда имена, что не связалось).
Ручные правки имён — `data/seed/names_ru_overrides.json` (важнее всех источников).

## Важно: репозиторий публичный

Сюда **никогда** не попадают: участники фэнтези и их Telegram-номера, списки призёров, токены ботов,
ключи и адреса закрытых таблиц. Такие данные живут только в рабочей базе (D1) и в секретах.
`.gitignore` закрывает `*.xlsx`, `data/raw/`, `data/local/`, `private/`.

## Устройство

```
src/lib/        имена: сравнение, русские формы, транскрипция по языку страны
src/sources/    Flashscore (рейтинги), WTA API, Wikidata, Tennis Abstract (Elo), ESPN
src/players/    склейка источников в одну запись на игрока
scripts/        сборка базы игроков и локальной SQLite
migrations/     схема D1 (SQLite)
data/seed/      затравка: игроки фэнтези RG-2026 (только открытые данные), ручные правки
data/players/   результат сборки (в git, чтобы видеть изменения)
docs/           продукт, источники, уроки HOH и фэнтези, решения, план
```
