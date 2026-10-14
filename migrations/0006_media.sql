-- Pictures kept on our side (R2 bucket bound as MEDIA): covers of «Больше» broadcasts taken from
-- VK (cut down to 640×360 JPEG) and player heads from Flashscore (as is, 100×100).
CREATE TABLE IF NOT EXISTS media (
  media_key TEXT PRIMARY KEY,                  -- cover/<vk video id> | head/<flashscore player id>
  kind TEXT NOT NULL,                          -- cover | head
  source_url TEXT,                             -- where the picture came from (VK page / Flashscore file)
  source_id TEXT,                              -- what identifies the original (VK picture path / Flashscore URL)
  r2_key TEXT,                                 -- object in the bucket: covers/<id>.jpg, heads/<id>.png
  version TEXT,                                -- short hash of source_id, used as ?v= in URLs
  bytes INTEGER,
  status TEXT NOT NULL,                        -- ok | missing (no picture yet) | failed
  fail_count INTEGER NOT NULL DEFAULT 0,
  next_at TEXT,                                -- when to look again; NULL = final
  fetched_at TEXT,
  checked_at TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_next ON media (status, next_at);

-- VK video id of a broadcast ("-218116775_456252380"), filled from vk_url by the media job.
ALTER TABLE broadcasts ADD COLUMN vk_video TEXT;
CREATE INDEX IF NOT EXISTS idx_broadcasts_vk_video ON broadcasts (vk_video);

-- Flashscore marks "no photo" with the words men/women and a pair with "a.png;b.png"; such
-- values were stored as broken photo links. Only real picture files stay.
UPDATE players SET photo_url = NULL
 WHERE photo_url IS NOT NULL AND (photo_url LIKE '%;%' OR (photo_url NOT LIKE '%.png' AND photo_url NOT LIKE '%.jpg'
   AND photo_url NOT LIKE '%.jpeg' AND photo_url NOT LIKE '%.webp'));
UPDATE matches SET p1_photo = NULL
 WHERE p1_photo IS NOT NULL AND (p1_photo LIKE '%;%' OR (p1_photo NOT LIKE '%.png' AND p1_photo NOT LIKE '%.jpg'
   AND p1_photo NOT LIKE '%.jpeg' AND p1_photo NOT LIKE '%.webp'));
UPDATE matches SET p2_photo = NULL
 WHERE p2_photo IS NOT NULL AND (p2_photo LIKE '%;%' OR (p2_photo NOT LIKE '%.png' AND p2_photo NOT LIKE '%.jpg'
   AND p2_photo NOT LIKE '%.jpeg' AND p2_photo NOT LIKE '%.webp'));
