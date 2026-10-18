-- «Актуальные турниры» on the home screen: a stadium (or city) photo per tournament, matched by the city in
-- tournaments.tournament (Flashscore spells it in Russian or Latin — both are listed). Free photos from
-- Wikimedia Commons, the credit is shown with the photo as the licences require (2026-10-18).
CREATE TABLE IF NOT EXISTS tour_visuals (
  city TEXT PRIMARY KEY,
  aliases TEXT,
  venue TEXT,
  photo_url TEXT NOT NULL,
  photo_credit TEXT
);

INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Шанхай', 'Shanghai', 'Qizhong Forest Sports City Arena', 'tours/shanghai.jpg?v=1', 'Фото: Curt Smith, CC BY 2.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Пекин', 'Beijing', 'Национальный теннисный центр, «Бриллиантовый корт»', 'tours/beijing.jpg?v=1', 'Фото: N509FZ, CC BY-SA 4.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Lyon', 'Лион', NULL, 'tours/lyon.jpg?v=1', 'Фото: LucasD, CC BY-SA 4.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Brussels', 'Брюссель,Bruxelles', NULL, 'tours/brussels.jpg?v=1', 'Фото: Diego Delso, CC BY-SA 4.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Осака', 'Osaka', 'Теннисный центр Уцубо', 'tours/osaka.jpg?v=1', 'Фото: inoue-hiro, CC BY-SA 3.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Ningbo', 'Нинбо', 'Теннисный центр Иньчжоу', 'tours/ningbo.jpg?v=1', 'Фото: Cz4523, CC BY-SA 4.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Вена', 'Vienna,Wien', 'Wiener Stadthalle', 'tours/vienna.jpg?v=1', 'Фото: Piedro, CC BY-SA 3.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Базель', 'Basel', 'St. Jakobshalle', 'tours/basel.jpg?v=1', 'Фото: Wladyslaw Disk., CC BY-SA 3.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Париж', 'Paris', 'Paris La Défense Arena', 'tours/paris.jpg?v=1', 'Фото: Guilhem Vellut, CC BY 2.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Эр-Рияд', 'Riyadh,Рияд', NULL, 'tours/riyadh.jpg?v=1', 'Фото: B.alotaby, CC BY-SA 4.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Токио', 'Tokyo', 'Ariake Coliseum', 'tours/tokyo.jpg?v=1', 'Фото: veroyama, CC BY 2.0, Wikimedia Commons');
INSERT OR REPLACE INTO tour_visuals (city, aliases, venue, photo_url, photo_credit) VALUES ('Мельбурн', 'Melbourne,Открытый чемпионат Австралии,Australian Open', 'Rod Laver Arena', 'tours/melbourne.jpg?v=1', 'Фото: Jono52795, CC BY-SA 3.0, Wikimedia Commons');
