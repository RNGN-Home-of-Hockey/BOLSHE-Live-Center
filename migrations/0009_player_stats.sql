-- Match statistics of every player (Flashscore df_st feed): counts, so that they add up over a
-- season. Collected for finished singles matches (worker/src/stats.js) and for the last 50
-- matches of the top players (scripts/backfill-stats.mjs).
CREATE TABLE IF NOT EXISTS player_match_stats (
  match_id TEXT NOT NULL,
  fs_id TEXT NOT NULL,
  opp_fs_id TEXT,
  played_at TEXT NOT NULL,                     -- ISO UTC start
  surface TEXT,
  won INTEGER NOT NULL,                        -- 1 | 0
  sets_won INTEGER,
  sets_lost INTEGER,
  deciding INTEGER NOT NULL DEFAULT 0,         -- the match went to the deciding set
  aces INTEGER, df INTEGER,
  first_won INTEGER, first_total INTEGER, second_won INTEGER, second_total INTEGER,
  bp_saved_won INTEGER, bp_saved_total INTEGER,
  ret1_won INTEGER, ret1_total INTEGER, ret2_won INTEGER, ret2_total INTEGER,
  bp_conv_won INTEGER, bp_conv_total INTEGER,
  winners INTEGER, ue INTEGER, net_won INTEGER, net_total INTEGER,
  sv_pts_won INTEGER, sv_pts_total INTEGER, rt_pts_won INTEGER, rt_pts_total INTEGER,
  tot_pts_won INTEGER, tot_pts_total INTEGER,
  sv_games_won INTEGER, sv_games_total INTEGER, rt_games_won INTEGER, rt_games_total INTEGER,
  tb_won INTEGER NOT NULL DEFAULT 0, tb_total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, fs_id)
);
CREATE INDEX IF NOT EXISTS idx_pms_player ON player_match_stats (fs_id, played_at);

-- Matches whose statistics were asked for (no statistics on Flashscore → asked again later).
CREATE TABLE IF NOT EXISTS match_stats_status (
  match_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,                        -- ok | none
  tries INTEGER NOT NULL DEFAULT 1,
  checked_at TEXT NOT NULL
);

-- Last 52 weeks per player: every metric and its 0–10 score among the tour (src/game/insights.js).
CREATE TABLE IF NOT EXISTS player_stats (
  fs_id TEXT PRIMARY KEY,
  tour TEXT,
  matches INTEGER NOT NULL,
  metrics_json TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_stats_tour ON player_stats (tour);
