// GET /api/credits — the authors of the free photos in the app (Wikimedia Commons licences ask to name
// them). The photos themselves carry no captions; this list is in Настройки → «Авторы фотографий».

export async function photoCredits(env) {
  const db = env.DB;
  const safe = (p) => p.then((r) => r.results).catch(() => []);
  const [tours, stadiums, players, hosts] = await Promise.all([
    safe(db.prepare('SELECT city, photo_credit AS credit FROM tour_photos WHERE photo_credit IS NOT NULL ORDER BY city, n').all()),
    safe(db.prepare('SELECT city, venue, photo_credit AS credit FROM tour_visuals WHERE photo_credit IS NOT NULL ORDER BY city').all()),
    safe(db.prepare(`SELECT p.name_ru AS name, m.credit FROM media m JOIN players p ON 'photo/' || p.fs_id = m.media_key
      WHERE m.kind = 'photo' AND m.status = 'ok' AND m.credit IS NOT NULL ORDER BY p.name_ru`).all()),
    safe(db.prepare("SELECT name, photo_credit AS credit FROM hosts WHERE photo_credit LIKE '%Commons%' ORDER BY name").all()),
  ]);
  const group = (rows, key) => {
    const out = new Map();
    for (const r of rows) out.set(r[key], [...(out.get(r[key]) ?? []), r.credit.replace(/^Фото:\s*/, '')]);
    return [...out].map(([name, credits]) => ({ name, credits: [...new Set(credits)] }));
  };
  return {
    tournaments: group([...tours, ...stadiums.map((s) => ({ city: s.venue ? `${s.city} — ${s.venue}` : s.city, credit: s.credit }))], 'city'),
    players: group(players, 'name'),
    hosts: group(hosts, 'name'),
  };
}
