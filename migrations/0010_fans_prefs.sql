-- From the 2026-10-15 call: onboarding (favourite players, surface, men's/women's tennis, since
-- when), "show my results to others or not", days in the app and broadcasts opened from it,
-- tournament logos, and the Winline handicap shown after a vote.

ALTER TABLE tournaments ADD COLUMN logo TEXT;      -- Flashscore tournament picture (OAJ of the day feed)

-- Main Winline games handicap of a match, already in our side order: our player 1 gets hcap games.
ALTER TABLE match_odds ADD COLUMN hcap REAL;
ALTER TABLE match_odds ADD COLUMN hcap1 REAL;
ALTER TABLE match_odds ADD COLUMN hcap2 REAL;

CREATE TABLE IF NOT EXISTS fan_prefs (
  user_id INTEGER PRIMARY KEY,
  public INTEGER NOT NULL DEFAULT 1,           -- 1 = name shown in tables, 0 = "Болельщик ####"
  surface TEXT,                                -- hard | clay | grass | all
  tours TEXT,                                  -- ATP | WTA | all
  since TEXT,                                  -- new | 2-5 | 5-10 | 10+
  onboarded_at TEXT,
  updated_at TEXT NOT NULL
);

-- One row per fan and Moscow day the app was opened (achievement «Каждый день с теннисом»).
CREATE TABLE IF NOT EXISTS fan_days (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Things a fan did once per object, e.g. opened a «Больше» broadcast from the app (kind = vk).
CREATE TABLE IF NOT EXISTS fan_events (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);
