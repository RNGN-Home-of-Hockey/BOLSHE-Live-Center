-- Signing in on the website (outside Telegram) through the bot: worker/src/web-login.js.
CREATE TABLE IF NOT EXISTS web_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,     -- sha256 of the code in the bot link (the code itself is never stored)
  check_code TEXT NOT NULL,           -- 4 digits shown on the site and in the bot
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_id INTEGER,                    -- set when the fan presses «Войти» in the bot
  first_name TEXT,
  username TEXT,
  confirmed_at TEXT,
  declined_at TEXT
);

CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash TEXT PRIMARY KEY,        -- sha256 of the token the browser keeps
  user_id INTEGER NOT NULL,
  first_name TEXT,
  username TEXT,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS web_sessions_user ON web_sessions (user_id);
