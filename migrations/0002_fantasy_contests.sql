-- Fantasy contests. Every contest has its own group of participants and its own draft;
-- old contests stay as an archive so we always know how many people played each time.
CREATE TABLE IF NOT EXISTS fantasy_contests (
  contest_id TEXT PRIMARY KEY,                -- "rg2026", "wta-finals-2026", "atp-finals-2026"
  title TEXT NOT NULL,
  tours TEXT NOT NULL,                        -- "ATP+WTA", "WTA", "ATP"
  starts_on TEXT,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'planned',     -- planned | registration | live | finished | archived
  registered_count INTEGER,                   -- people who opened the draft
  complete_entries INTEGER,                   -- full teams submitted
  ranked_entries INTEGER,                     -- teams in the final leaderboard
  notes TEXT
);

-- Participants of a contest. Telegram ids live only in the production database,
-- never in this public repository.
CREATE TABLE IF NOT EXISTS fantasy_contest_participants (
  contest_id TEXT NOT NULL REFERENCES fantasy_contests (contest_id),
  telegram_user_id INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  entry_complete INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contest_id, telegram_user_id)
);

-- Archive: RG Fantasy 2026 (Roland Garros, Google Sheet bot), counts from its final export.
INSERT OR IGNORE INTO fantasy_contests
  (contest_id, title, tours, starts_on, ends_on, status, registered_count, complete_entries, ranked_entries, notes)
VALUES
  ('rg2026', 'Фэнтези Ролан Гаррос 2026', 'ATP+WTA', '2026-05-24', '2026-06-07', 'archived', 862, 825, 824,
   '4 WTA + 4 ATP по категориям посева; 135 игроков в пуле; призы 50 мест');

INSERT OR IGNORE INTO fantasy_contests (contest_id, title, tours, starts_on, ends_on, status)
VALUES
  ('wta-finals-2026', 'Фэнтези WTA Finals 2026 (Индиан-Уэллс)', 'WTA', '2026-11-08', '2026-11-15', 'planned'),
  ('atp-finals-2026', 'Фэнтези ATP Finals 2026 (Турин)', 'ATP', '2026-11-15', '2026-11-22', 'planned');
