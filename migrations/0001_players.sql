-- Players core (Cloudflare D1 / SQLite). One row per Flashscore participant.
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,                 -- "atp-sinner-jannik": tour + Flashscore slug
  tour TEXT NOT NULL CHECK (tour IN ('ATP', 'WTA')),
  name_ru TEXT NOT NULL,                      -- display name, always Cyrillic
  name_ru_short TEXT,                         -- "Я. Синнер"
  name_ru_source TEXT NOT NULL,               -- override | fantasy | wikidata | flashscore | translit
  name_latin TEXT,
  country_code TEXT,                          -- IOC code (RUS for Russians under the neutral flag)
  country_ru TEXT,
  nationality_source TEXT,                    -- wta | flashscore | wikidata | neutral_flag_guess | override
  neutral_flag INTEGER NOT NULL DEFAULT 0,
  is_russian INTEGER NOT NULL DEFAULT 0,
  birth_date TEXT,                            -- YYYY-MM-DD
  photo_url TEXT,
  singles_rank INTEGER,
  singles_prev_rank INTEGER,
  singles_points INTEGER,
  singles_tournaments INTEGER,
  doubles_rank INTEGER,
  doubles_points INTEGER,
  elo REAL,
  elo_rank INTEGER,
  elo_hard REAL,
  elo_clay REAL,
  elo_grass REAL,
  fs_id TEXT NOT NULL UNIQUE,
  fs_slug TEXT,
  wta_id TEXT,
  atp_id TEXT,
  espn_id TEXT,
  ta_id TEXT,
  wikidata_id TEXT,
  fantasy_player_id TEXT,
  sources TEXT,                               -- JSON array of sources that know the player
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_tour_singles ON players (tour, singles_rank);
CREATE INDEX IF NOT EXISTS idx_players_russian ON players (is_russian, tour);

-- Every spelling of a name seen in any source, for matching feeds and search.
CREATE TABLE IF NOT EXISTS player_aliases (
  alias_key TEXT NOT NULL,                    -- order-free token key (src/lib/names.js tokenKey)
  player_id TEXT NOT NULL REFERENCES players (player_id),
  alias TEXT NOT NULL,
  source TEXT,
  PRIMARY KEY (alias_key, player_id)
);
CREATE INDEX IF NOT EXISTS idx_player_aliases_key ON player_aliases (alias_key);

-- Weekly rankings history: "climbed 12 places", best ranking of the season, etc.
CREATE TABLE IF NOT EXISTS ranking_snapshots (
  tour TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('singles', 'doubles')),
  ranking_date TEXT NOT NULL,
  player_id TEXT NOT NULL,
  rank INTEGER,
  prev_rank INTEGER,
  points INTEGER,
  tournaments INTEGER,
  source TEXT NOT NULL,
  PRIMARY KEY (tour, discipline, ranking_date, player_id, source)
);

-- Elo history (Tennis Abstract, weekly).
CREATE TABLE IF NOT EXISTS elo_snapshots (
  player_id TEXT NOT NULL,
  rated_on TEXT NOT NULL,
  elo REAL,
  elo_rank INTEGER,
  elo_hard REAL,
  elo_clay REAL,
  elo_grass REAL,
  source TEXT NOT NULL DEFAULT 'tennisabstract',
  PRIMARY KEY (player_id, rated_on, source)
);
