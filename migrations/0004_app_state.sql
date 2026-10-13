-- Small key/value state for self-maintenance (last schedule sync, webhook registered for which token).
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
