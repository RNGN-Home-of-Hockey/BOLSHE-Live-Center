-- Matches from the Flashscore day feed (all tennis: tour, challengers, ITF; singles and doubles).
CREATE TABLE IF NOT EXISTS tournaments (
  tournament_key TEXT PRIMARY KEY,            -- Flashscore stage id (ZEE)
  name TEXT NOT NULL,                          -- "ATP - ОДИНОЧНЫЙ РАЗРЯД: Шанхай (Китай), хард"
  category TEXT,
  tour TEXT,                                   -- ATP | WTA | NULL
  level TEXT,                                  -- tour | challenger | itf | junior | exhibition | team | other
  discipline TEXT,                             -- singles | doubles | mixed
  surface TEXT,                                -- hard | clay | grass | carpet
  tournament TEXT,                             -- "Шанхай"
  country TEXT,
  url TEXT,
  first_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,                   -- Flashscore event id
  tournament_key TEXT NOT NULL,
  start_at TEXT,                               -- ISO UTC
  end_at TEXT,
  date_msk TEXT,                               -- Moscow date of the start
  status TEXT NOT NULL,                        -- scheduled | live | finished | retired | walkover | cancelled | postponed | interrupted
  live_set INTEGER,
  note TEXT,
  p1_fs_id TEXT,
  p2_fs_id TEXT,
  p1_name TEXT,
  p2_name TEXT,
  p1_photo TEXT,
  p2_photo TEXT,
  sets_p1 INTEGER,
  sets_p2 INTEGER,
  sets_json TEXT,                              -- [{"p1":6,"p2":4,"tb1":null,"tb2":null}, …]
  winner INTEGER,                              -- 1 | 2 | NULL
  is_doubles INTEGER NOT NULL DEFAULT 0,
  row_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches (date_msk);
CREATE INDEX IF NOT EXISTS idx_matches_p1 ON matches (p1_fs_id);
CREATE INDEX IF NOT EXISTS idx_matches_p2 ON matches (p2_fs_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);

-- Cached per-match feeds (head to head + form), compact JSON.
CREATE TABLE IF NOT EXISTS match_details (
  match_id TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- h2h
  fetched_at TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (match_id, kind)
);
