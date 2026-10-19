// Bracket game on the Worker: draws of the running main-tour singles tournaments are refreshed
// from Flashscore every 10 minutes, fans' brackets are scored after every refresh.
//   GET  /api/brackets              running and recent brackets (+ the fan's points, if signed in)
//   GET  /api/brackets/<key>        the draw with our names and photos, the fan's bracket, the table
//   POST /api/brackets/<key>        {picks} — send a bracket; it can be changed until its first match starts

import { isFinished, lockTime, openSlots, scoreBracket, validatePicks } from '../../src/game/bracket.js';
import { explainTournament } from '../../src/insights/tournaments.js';
import { mediaUrl } from '../../src/lib/media.js';
import { fetchDraw } from '../../src/sources/flashscore-draw.js';

const mskDate = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

// Our Russian names and stored heads for the players of a draw.
async function enrichPlayers(db, players) {
  const ids = players.map((p) => p.fs_id).filter(Boolean);
  const known = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT p.fs_id, p.player_id, p.name_ru, p.singles_rank, p.is_russian, p.photo_url,
        (SELECT r2_key || '?v=' || version FROM media WHERE media_key = 'head/' || p.fs_id AND status = 'ok') AS head
      FROM players p WHERE p.fs_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
    for (const r of results) known.set(r.fs_id, r);
  }
  return players.map((p) => {
    const k = known.get(p.fs_id);
    return {
      ...p,
      player_id: k?.player_id ?? null,
      name_ru: k?.name_ru ?? p.name,
      rank: k?.singles_rank ?? null,
      is_russian: Boolean(k?.is_russian),
      photo: mediaUrl(k?.head) ?? k?.photo_url ?? null,
    };
  });
}

async function rescore(db, bracketKey, draw) {
  const { results } = await db.prepare('SELECT user_id, picks_json, submitted_at FROM bracket_entries WHERE bracket_key = ?').bind(bracketKey).all();
  const now = new Date().toISOString();
  const statements = results.map((e) => {
    const s = scoreBracket(draw, JSON.parse(e.picks_json), e.submitted_at);
    return db.prepare('UPDATE bracket_entries SET points = ?, correct = ?, decided = ?, possible = ?, scored_at = ? WHERE bracket_key = ? AND user_id = ?')
      .bind(s.points, s.correct, s.decided, s.possible, now, bracketKey, e.user_id);
  });
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  return results.length;
}

// Main-tour singles tournaments with matches yesterday…tomorrow (qualifying stages excluded).
export async function syncBrackets(env) {
  const db = env.DB;
  const now = Date.now();
  const { results: tours } = await db.prepare(`SELECT DISTINCT t.tournament_key, t.fs_tournament_id, t.fs_stage_id, t.tour, t.tournament, t.surface
    FROM tournaments t JOIN matches m ON m.tournament_key = t.tournament_key
    WHERE t.level = 'tour' AND t.discipline = 'singles' AND t.fs_tournament_id IS NOT NULL AND t.fs_stage_id IS NOT NULL
      AND t.tournament NOT LIKE '%квалификац%' AND m.date_msk BETWEEN ? AND ?`)
    .bind(mskDate(now - 86400e3), mskDate(now + 86400e3)).all();
  const done = [];
  for (const t of tours) {
    const key = `${t.fs_tournament_id}_${t.fs_stage_id}`;
    try {
      const raw = await fetchDraw(t.fs_tournament_id, t.fs_stage_id);
      // A main draw ends in one final; a qualifying draw has many parallel "finals" — no game there.
      if (raw.rounds.length < 2 || raw.rounds.at(-1).matches.length !== 1) continue;
      const draw = { ...raw, players: await enrichPlayers(db, raw.players) };
      const starts = draw.rounds[0].matches.map((m) => m.start).filter(Boolean).sort();
      const final = draw.rounds.at(-1).matches[0];
      await db.prepare(`INSERT INTO brackets (bracket_key, tournament_key, name, tour, surface, draw_json, status, starts_at, ends_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bracket_key) DO UPDATE SET name = excluded.name, draw_json = excluded.draw_json, status = excluded.status, starts_at = excluded.starts_at,
          ends_at = excluded.ends_at, updated_at = excluded.updated_at`)
        .bind(key, t.tournament_key, `${t.tour} ${t.tournament}`, t.tour, t.surface, JSON.stringify(draw),
          isFinished(draw) ? 'finished' : 'open', starts[0] ?? null, final?.start ?? null, new Date().toISOString()).run();
      const scored = await rescore(db, key, draw);
      done.push({ key, name: `${t.tour} ${t.tournament}`, rounds: draw.rounds.length, open: openSlots(draw).length, scored });
    } catch (error) {
      done.push({ key, error: String(error?.message ?? error).slice(0, 120) });
    }
  }
  return { brackets: done };
}

const publicEntry = (e) => (e ? {
  picks: JSON.parse(e.picks_json), submitted_at: e.submitted_at, points: e.points, correct: e.correct, decided: e.decided, possible: e.possible,
  lock_at: e.lock_at ?? null, updated_at: e.updated_at ?? null,
  editable: Boolean(e.lock_at && Date.parse(e.lock_at) > Date.now()),
} : null);

export async function listBrackets(env, user) {
  const { results } = await env.DB.prepare(`SELECT b.bracket_key, b.tournament_key, b.name, b.tour, b.surface, b.status, b.starts_at, b.ends_at, b.draw_json,
      t.tournament AS city, t.level, t.logo,
      (SELECT COUNT(*) FROM bracket_entries e WHERE e.bracket_key = b.bracket_key) AS fans
    FROM brackets b LEFT JOIN tournaments t ON t.tournament_key = b.tournament_key WHERE b.status = 'open' OR b.updated_at > datetime('now', '-7 days')
    ORDER BY b.status = 'open' DESC, b.ends_at DESC LIMIT 20`).all();
  const mine = new Map();
  if (user) {
    const { results: entries } = await env.DB.prepare('SELECT * FROM bracket_entries WHERE user_id = ?').bind(user.id).all();
    for (const e of entries) mine.set(e.bracket_key, e);
  }
  return results.map((b) => {
    const draw = JSON.parse(b.draw_json);
    const round = draw.rounds.find((r) => r.matches.some((m) => m.w == null)) ?? draw.rounds.at(-1);
    const champion = isFinished(draw) ? draw.players.find((p) => p.pos === draw.rounds.at(-1).matches[0].w) : null;
    const e = mine.get(b.bracket_key);
    return {
      bracket_key: b.bracket_key, tournament_key: b.tournament_key, name: b.name, tour: b.tour, surface: b.surface, status: b.status, fans: b.fans,
      // For the big tournament card: "ATP 1000", the city, the dates of the main draw, the logo.
      city: b.city ?? b.name.replace(/^(ATP|WTA)s+/, ''), tier: explainTournament({ tour: b.tour, level: b.level ?? 'tour', tournament: b.city ?? b.name }).tier,
      logo: b.logo ?? null, starts_at: b.starts_at, ends_at: b.ends_at,
      round: round?.title ?? null, rounds: draw.rounds.length, open_matches: openSlots(draw).length, champion: champion?.name_ru ?? null,
      mine: e ? { points: e.points, possible: e.possible, correct: e.correct, decided: e.decided } : null,
    };
  });
}

export async function bracketView(env, key, user) {
  const b = await env.DB.prepare('SELECT * FROM brackets WHERE bracket_key = ?').bind(key).first();
  if (!b) return null;
  const draw = JSON.parse(b.draw_json);
  const entry = user ? await env.DB.prepare('SELECT * FROM bracket_entries WHERE bracket_key = ? AND user_id = ?').bind(key, user.id).first() : null;
  const { results: table } = await env.DB.prepare(`SELECT e.user_id, e.points, e.correct, e.decided, e.possible, u.first_name, u.username,
      COALESCE(f.public, 1) AS public
    FROM bracket_entries e LEFT JOIN bot_users u ON u.telegram_user_id = e.user_id LEFT JOIN fan_prefs f ON f.user_id = e.user_id
    WHERE e.bracket_key = ? ORDER BY e.points DESC, e.correct DESC, e.submitted_at ASC LIMIT 50`).bind(key).all();
  // A fan who hid their results (Настройки) is shown without a name.
  const label = (r) => (!r.public ? `Болельщик ${String(r.user_id).slice(-4)}`
    : r.first_name ? r.first_name : r.username ? `@${r.username}` : `Болельщик ${String(r.user_id).slice(-4)}`);
  // «Прогнозы сообщества»: whom the fans' brackets make the champion.
  const { results: all } = await env.DB.prepare('SELECT picks_json FROM bracket_entries WHERE bracket_key = ?').bind(key).all();
  const finalKey = `${draw.rounds.length - 1}:0`;
  const champs = new Map();
  for (const e of all) {
    const pos = JSON.parse(e.picks_json)[finalKey];
    if (pos != null) champs.set(Number(pos), (champs.get(Number(pos)) ?? 0) + 1);
  }
  const picked = [...champs.values()].reduce((a, c) => a + c, 0);
  const community = [...champs].sort((a, c) => c[1] - a[1])
    .map(([pos, n]) => ({ pos, name: draw.players.find((p) => p.pos === pos)?.name_ru ?? null, pct: Math.round((100 * n) / picked) }));
  const myPlace = entry
    ? 1 + ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM bracket_entries WHERE bracket_key = ? AND (points > ? OR (points = ? AND correct > ?))`)
      .bind(key, entry.points, entry.points, entry.correct).first())?.n ?? 0)
    : null;
  return {
    bracket_key: key, tournament_key: b.tournament_key, name: b.name, tour: b.tour, surface: b.surface, status: b.status, updated_at: b.updated_at,
    community,
    draw,
    entry: publicEntry(entry),
    place: myPlace,
    table: table.map((r, i) => ({ place: i + 1, name: label(r), points: r.points, correct: r.correct, decided: r.decided, possible: r.possible, me: user ? r.user_id === user.id : false })),
  };
}

export async function submitBracket(env, key, user, rawPicks) {
  const b = await env.DB.prepare('SELECT draw_json, status FROM brackets WHERE bracket_key = ?').bind(key).first();
  if (!b) return { ok: false, status: 404, error: 'Сетка не найдена' };
  if (b.status !== 'open') return { ok: false, status: 409, error: 'Турнир уже закончился' };
  const existing = await env.DB.prepare('SELECT submitted_at, lock_at FROM bracket_entries WHERE bracket_key = ? AND user_id = ?').bind(key, user.id).first();
  if (existing && !(existing.lock_at && Date.parse(existing.lock_at) > Date.now())) {
    return { ok: false, status: 409, error: 'Первый матч уже начался — сетку больше не поменять до конца турнира' };
  }
  const draw = JSON.parse(b.draw_json);
  const check = validatePicks(draw, rawPicks);
  if (!check.ok) return { ok: false, status: 400, error: check.error };
  const now = new Date().toISOString();
  // A change keeps the first sending time: before the first match nothing has been scored yet anyway.
  const sentAt = existing?.submitted_at ?? now;
  const s = scoreBracket(draw, check.picks, sentAt);
  if (existing) {
    await env.DB.prepare(`UPDATE bracket_entries SET picks_json = ?, points = ?, correct = ?, decided = ?, possible = ?, scored_at = ?, updated_at = ?
      WHERE bracket_key = ? AND user_id = ?`).bind(JSON.stringify(check.picks), s.points, s.correct, s.decided, s.possible, now, now, key, user.id).run();
    return { ok: true, changed: true, submitted_at: sentAt, lock_at: existing.lock_at, ...s };
  }
  const lockAt = lockTime(draw) ?? new Date(Date.now() + 3600e3).toISOString();
  await env.DB.prepare(`INSERT INTO bracket_entries (bracket_key, user_id, picks_json, submitted_at, points, correct, decided, possible, scored_at, lock_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(key, user.id, JSON.stringify(check.picks), sentAt, s.points, s.correct, s.decided, s.possible, sentAt, lockAt).run();
  return { ok: true, submitted_at: sentAt, lock_at: lockAt, ...s };
}
