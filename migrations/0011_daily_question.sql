-- «Вопрос дня»: one question per Moscow day, made from the running draws (src/game/question.js)
-- and settled by them; the fans' answers 0 «Да», 1 «Нет», 2 «Затрудняюсь».
CREATE TABLE IF NOT EXISTS daily_questions (
  day TEXT PRIMARY KEY,               -- Moscow date
  goal TEXT NOT NULL,                 -- semi | final | title
  question TEXT NOT NULL,
  bracket_key TEXT NOT NULL,
  tournament TEXT NOT NULL,           -- "ATP Шанхай"
  player_fs_id TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  player_rank INTEGER,
  photo TEXT,
  answer INTEGER,                     -- 0 | 1, NULL while open
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_votes (
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  pick INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, user_id)
);
