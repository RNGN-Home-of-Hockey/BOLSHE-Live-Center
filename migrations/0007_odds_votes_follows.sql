-- Winline match-winner odds, already turned to our side order (odds1 = our player 1).
-- pre_* is the last pre-match price (kept after the start: the price the match was played at),
-- live_* the latest in-play price.
CREATE TABLE IF NOT EXISTS match_odds (
  match_id TEXT PRIMARY KEY,
  wl_id TEXT,
  wl_url TEXT,
  pre1 REAL,
  pre2 REAL,
  pre_at TEXT,
  live1 REAL,
  live2 REAL,
  live_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_odds_wl ON match_odds (wl_id);

-- "Кто выиграет?" — one vote per Telegram user and match, open until the start.
CREATE TABLE IF NOT EXISTS votes (
  match_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  pick INTEGER NOT NULL,                       -- 1 | 2 (our side order)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_user ON votes (user_id);

-- «Мои игроки»: players a Telegram user follows.
CREATE TABLE IF NOT EXISTS follows (
  user_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, player_id)
);
