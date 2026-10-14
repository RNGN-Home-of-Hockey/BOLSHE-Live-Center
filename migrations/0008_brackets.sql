-- Bracket game: every fan fills the rest of a tournament draw once; after sending, the bracket
-- is locked until the tournament ends. Points for every match guessed, more for later rounds.

-- Flashscore ids of the current edition of a tournament (the draw feed needs both):
-- ZE = this year's tournament, ZC = its main-draw stage.
ALTER TABLE tournaments ADD COLUMN fs_tournament_id TEXT;
ALTER TABLE tournaments ADD COLUMN fs_stage_id TEXT;

CREATE TABLE IF NOT EXISTS brackets (
  bracket_key TEXT PRIMARY KEY,                -- <fs_tournament_id>_<fs_stage_id>
  tournament_key TEXT NOT NULL,                -- tournaments.tournament_key (same every year)
  name TEXT NOT NULL,                          -- "WTA Ухань"
  tour TEXT,
  surface TEXT,
  draw_json TEXT NOT NULL,                     -- parsed draw: players by position, rounds of matches
  status TEXT NOT NULL,                        -- open | finished
  starts_at TEXT,                              -- first match of the main draw
  ends_at TEXT,                                -- the final (planned or played)
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bracket_entries (
  bracket_key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  picks_json TEXT NOT NULL,                    -- {"<match_id>": <position of the picked winner>}
  submitted_at TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  decided INTEGER NOT NULL DEFAULT 0,          -- picked matches already played
  possible INTEGER NOT NULL DEFAULT 0,         -- points still reachable
  scored_at TEXT,
  PRIMARY KEY (bracket_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bracket_entries_user ON bracket_entries (user_id);
