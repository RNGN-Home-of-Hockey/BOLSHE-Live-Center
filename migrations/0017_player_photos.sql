-- Big player photos (worker/src/photos.js): media rows 'photo/<fs id>' keep the author and licence of a
-- free Wikimedia Commons photo for «Авторы фотографий» (2026-10-19).
ALTER TABLE media ADD COLUMN credit TEXT;
