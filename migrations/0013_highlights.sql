-- Highlights cut on the Moscow server («Теннисный пульт» of RNGN-HoH-Highlights, branch tennis), pushed here
-- by ops/hl-push/bolshe_hl_push.py every few minutes (worker/src/highlights.js). The video files stay on the
-- server and are served read-only through the no-VPN door: https://bolshe.109-172-113-187.sslip.io/hl/<key>/<file>.
CREATE TABLE IF NOT EXISTS highlights (
  match_key TEXT PRIMARY KEY,          -- desk key: YYYY-MM-DD_HHMM_<player1_id>_<player2_id>
  match_id TEXT,                       -- Flashscore event id (= matches.match_id)
  date_msk TEXT NOT NULL,
  player1_id TEXT,
  player2_id TEXT,
  vk_url TEXT,
  cover TEXT,                          -- /hl/<key>/<file>_cover.jpg
  files_json TEXT NOT NULL,            -- [{kind: review|top3|top5|set1…, url: /hl/<key>/<file>, secs, mb}] light copies only
  summaries_json TEXT,                 -- {"1": "Картал 7:6, на тай-брейке…"}
  done INTEGER NOT NULL DEFAULT 0,     -- 1 = the review is ready; 0 = only set clips cut on air so far
  finished_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_highlights_match ON highlights (match_id);
CREATE INDEX IF NOT EXISTS idx_highlights_p1 ON highlights (player1_id, date_msk);
CREATE INDEX IF NOT EXISTS idx_highlights_p2 ON highlights (player2_id, date_msk);

-- Favourite tournaments of a fan (Матчи / Турниры put them first): JSON list of tournament names, e.g. ["Шанхай"].
ALTER TABLE fan_prefs ADD COLUMN fav_tournaments TEXT;
