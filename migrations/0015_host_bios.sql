-- «Эксперты «Больше»»: short bios, photos and photo credits (2026-10-18).
-- Commentators' portraits are cut from our own VK broadcast covers; four hosts have free photos from
-- Wikimedia Commons (credit kept with the photo, as the licences require).
ALTER TABLE hosts ADD COLUMN photo_credit TEXT;

UPDATE hosts SET bio = 'Победительница «Ролан Гаррос»-2004 — первая российская чемпионка турнира Большого шлема в одиночном разряде. Ведущая «Больше».',
  photo_url = 'hosts/myskina-anastasia.jpg?v=1', photo_credit = 'Фото: Charlie Cowins, CC BY 2.0, Wikimedia Commons' WHERE host_id = 'myskina-anastasia';
UPDATE hosts SET bio = 'Первая ракетка мира 2009 года, финалистка трёх турниров Большого шлема. Ведущая «Больше».',
  photo_url = 'hosts/safina-dinara.jpg?v=1', photo_credit = 'Фото: Sergey Smirnov, CC BY-SA 3.0, Wikimedia Commons' WHERE host_id = 'safina-dinara';
UPDATE hosts SET bio = 'Финалистка «Ролан Гаррос»-2021, олимпийская чемпионка Токио-2020 в миксте с Андреем Рублёвым. Амбассадор «Больше».',
  photo_url = 'hosts/pavlyuchenkova-anastasia.jpg?v=1', photo_credit = 'Фото: Andrew Campbell, CC BY 2.0, Wikimedia Commons' WHERE host_id = 'pavlyuchenkova-anastasia';
UPDATE hosts SET bio = 'Бывший теннисист, в 2017 году обыграл Роджера Федерера в Дубае. Ведущий «Больше».',
  photo_url = 'hosts/donskoy-evgeny.jpg?v=1', photo_credit = 'Фото: Diliff, CC BY 3.0, Wikimedia Commons' WHERE host_id = 'donskoy-evgeny';
UPDATE hosts SET bio = 'Спортивная журналистка и теннисный комментатор, ведущая теннисного проекта «Больше!».' WHERE host_id = 'tartakova-sofya';
UPDATE hosts SET bio = 'Теннисный обозреватель, ведущая «Слушай! Больше» и комментатор эфиров «Больше».' WHERE host_id = 'avakova-sofya';
UPDATE hosts SET bio = 'Ведущий «Слушай! Больше».' WHERE host_id = 'znamensky-igor';
UPDATE hosts SET bio = 'Ведущий «Больше».' WHERE host_id IN ('kuznetsov-pyotr', 'kuklin-grigory');
UPDATE hosts SET bio = 'Ведущий и комментатор «Больше».' WHERE host_id IN ('volodko-denis', 'anoshin-alexander');

UPDATE hosts SET photo_url = 'hosts/' || host_id || '.jpg?v=1', photo_credit = 'Фото: обложка эфира «Больше»'
  WHERE host_id IN ('azarenko-vadim', 'yudkin-matvey', 'kopytin-artyom', 'korobeynikov-sergey', 'gigineishvili-georgy', 'stepanov-alexander',
    'botov-pavel', 'bedkhudo-timur', 'morkovin-egor', 'protasov-andrey', 'antonyan-artashes', 'voronin-pavel', 'shimansky-oleg',
    'anoshin-alexander', 'avakova-sofya', 'nitkin-pavel', 'khamidulin-dmitry', 'poluyanova-arina');
