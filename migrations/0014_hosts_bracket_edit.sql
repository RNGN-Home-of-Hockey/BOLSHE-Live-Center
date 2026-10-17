-- Owner 2026-10-18: a sent bracket can be changed until its first match starts (lock_at = the earliest start
-- among the matches that were still open when it was sent).
ALTER TABLE bracket_entries ADD COLUMN lock_at TEXT;
ALTER TABLE bracket_entries ADD COLUMN updated_at TEXT;

-- «Эксперты «Больше»»: the project's hosts and commentators. They vote in the app themselves like any fan;
-- an admin links a host to their Telegram account in the bot (/host_link Имя Фамилия = @username).
-- Names are public (the broadcast schedule and the channel); Telegram ids live only in this table.
CREATE TABLE IF NOT EXISTS hosts (
  host_id TEXT PRIMARY KEY,             -- slug, e.g. myskina-anastasia
  name TEXT NOT NULL,                   -- «Анастасия Мыскина»
  role TEXT NOT NULL,                   -- host | commentator | ambassador
  bio TEXT,
  photo_url TEXT,                       -- our stored copy (/media/hosts/<id>.jpg) once approved
  telegram_user_id INTEGER UNIQUE,
  aliases TEXT,                         -- other spellings in the schedule, comma-separated
  sort INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO hosts (host_id, name, role, aliases, sort, created_at) VALUES
  ('myskina-anastasia', 'Анастасия Мыскина', 'host', 'Настя Мыскина', 1, '2026-10-18'),
  ('safina-dinara', 'Динара Сафина', 'host', NULL, 2, '2026-10-18'),
  ('avakova-sofya', 'Софья Авакова', 'host', 'Соня Авакова', 3, '2026-10-18'),
  ('tartakova-sofya', 'Софья Тартакова', 'host', 'Соня Тартакова', 4, '2026-10-18'),
  ('znamensky-igor', 'Игорь Знаменский', 'host', NULL, 5, '2026-10-18'),
  ('kuznetsov-pyotr', 'Пётр Кузнецов', 'host', 'Петя Кузнецов,Петр Кузнецов', 6, '2026-10-18'),
  ('kuklin-grigory', 'Григорий Куклин', 'host', 'Гриша Куклин', 7, '2026-10-18'),
  ('donskoy-evgeny', 'Евгений Донской', 'host', 'Женя Донской', 8, '2026-10-18'),
  ('volodko-denis', 'Денис Володько', 'host', NULL, 9, '2026-10-18'),
  ('anoshin-alexander', 'Александр Аношин', 'host', 'Саша Аношин', 10, '2026-10-18'),
  ('pavlyuchenkova-anastasia', 'Анастасия Павлюченкова', 'ambassador', 'Настя Павлюченкова', 20, '2026-10-18'),
  ('azarenko-vadim', 'Вадим Азаренко', 'commentator', NULL, 30, '2026-10-18'),
  ('morkovin-egor', 'Егор Морковин', 'commentator', 'Егор Мокровин', 31, '2026-10-18'),
  ('kadochnikov-yaroslav', 'Ярослав Кадочников', 'commentator', NULL, 32, '2026-10-18'),
  ('yudkin-matvey', 'Матвей Юдкин', 'commentator', NULL, 33, '2026-10-18'),
  ('korobeynikov-sergey', 'Сергей Коробейников', 'commentator', NULL, 34, '2026-10-18'),
  ('bedkhudo-timur', 'Тимур Бедхудо', 'commentator', NULL, 35, '2026-10-18'),
  ('shapovalov-igor', 'Игорь Шаповалов', 'commentator', 'Игорь Шаровалов', 36, '2026-10-18'),
  ('voronin-pavel', 'Павел Воронин', 'commentator', NULL, 37, '2026-10-18'),
  ('antonyan-artashes', 'Арташес Антонян', 'commentator', NULL, 38, '2026-10-18'),
  ('shimansky-oleg', 'Олег Шиманский', 'commentator', NULL, 39, '2026-10-18'),
  ('protasov-andrey', 'Андрей Протасов', 'commentator', 'Андрей Проттасов', 40, '2026-10-18'),
  ('botov-pavel', 'Павел Ботов', 'commentator', NULL, 41, '2026-10-18'),
  ('dashkevich-daniil', 'Даниил Дашкевич', 'commentator', NULL, 42, '2026-10-18'),
  ('stepanov-alexander', 'Александр Степанов', 'commentator', NULL, 43, '2026-10-18'),
  ('gigineishvili-georgy', 'Георгий Гигинеишвили', 'commentator', NULL, 44, '2026-10-18'),
  ('poluyanova-arina', 'Арина Полуянова', 'commentator', 'Арина Полуянов', 45, '2026-10-18'),
  ('kopytin-artyom', 'Артём Копытин', 'commentator', 'Артем Копытин', 46, '2026-10-18'),
  ('musyakova-anastasia', 'Анастасия Мусьякова', 'commentator', NULL, 47, '2026-10-18'),
  ('nitkin-pavel', 'Павел Ниткин', 'commentator', NULL, 48, '2026-10-18'),
  ('budyakov-stepan', 'Степан Будяков', 'commentator', NULL, 49, '2026-10-18'),
  ('khamidulin-dmitry', 'Дмитрий Хамидулин', 'commentator', NULL, 50, '2026-10-18'),
  ('dumenko-alexander', 'Александр Думенко', 'commentator', NULL, 51, '2026-10-18'),
  ('kulinich-ilya', 'Илья Кулинич', 'commentator', NULL, 52, '2026-10-18');
