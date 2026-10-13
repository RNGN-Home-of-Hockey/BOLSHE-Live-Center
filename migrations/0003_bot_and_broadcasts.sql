-- Name corrections and confirmations made by admins in the bot. They are permanent:
-- every rebuild of the player base applies them over all sources (see scripts/sync-cloudflare.mjs).
CREATE TABLE IF NOT EXISTS player_name_overrides (
  player_id TEXT PRIMARY KEY,
  name_ru TEXT NOT NULL,
  previous_name_ru TEXT,
  action TEXT NOT NULL DEFAULT 'rename',      -- rename | confirm
  changed_by INTEGER,                          -- Telegram user id of the admin
  changed_by_name TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_name_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  old_name_ru TEXT,
  new_name_ru TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by INTEGER,
  changed_by_name TEXT,
  changed_at TEXT NOT NULL
);

-- «Больше» tennis broadcasts from the schedule sheet (no stream keys ever stored).
CREATE TABLE IF NOT EXISTS broadcasts (
  broadcast_key TEXT PRIMARY KEY,              -- date|player1 tokens|player2 tokens
  sheet_row INTEGER,
  date_msk TEXT NOT NULL,
  time_msk TEXT,
  starts_at TEXT,                              -- ISO UTC
  tournament TEXT,
  round TEXT,
  note TEXT,
  status TEXT NOT NULL,                        -- scheduled | cancelled | removed
  player1_ru TEXT,
  player2_ru TEXT,
  player1_id TEXT,
  player2_id TEXT,
  is_doubles INTEGER NOT NULL DEFAULT 0,
  commentator1 TEXT,
  commentator2 TEXT,
  vk_url TEXT,
  vk_post_id TEXT,
  row_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_date ON broadcasts (date_msk);

-- Channel boosts seen by the bot (bot must be a channel admin): basis for the boosters' leaderboard.
CREATE TABLE IF NOT EXISTS channel_boosts (
  boost_id TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  telegram_user_id INTEGER,
  source TEXT,                                 -- premium | gift_code | giveaway
  added_at TEXT,
  expires_at TEXT,
  removed_at TEXT,
  PRIMARY KEY (chat_id, boost_id)
);

CREATE TABLE IF NOT EXISTS bot_users (
  telegram_user_id INTEGER PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  telegram_user_id INTEGER PRIMARY KEY,
  state TEXT,
  payload TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER,
  details TEXT
);
