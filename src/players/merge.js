// Builds one player record per Flashscore participant from every source.
// Flashscore rankings are the base list (they cover ATP and WTA, singles and doubles,
// and Flashscore ids are what the match feeds use). Other sources are joined onto it:
// official WTA API, Wikidata, Tennis Abstract Elo, ESPN, RG Fantasy seed, manual overrides.
//
// Russian name priority: bot decision (D1) > manual override file > sports.ru > RG Fantasy
// (editor-checked) > Wikidata (ruwiki) > Flashscore Russian > transcription (marked for review).
// The same name with ё from another source wins over the ё-less one ("Рублёв").

import {
  cleanRuLabel, isCyrillic, latinFromSlug, letterKey, nameTokens, shortRu, surnameInitialRu,
  tokenKey,
} from '../lib/names.js';
import { transcribe } from '../lib/translit.js';

const RANKING_KEYS = ['atp_singles', 'wta_singles', 'atp_doubles', 'wta_doubles'];
const NEUTRAL_COUNTRIES = new Set(['World', 'Мир']);
const ACTIVE_BORN_AFTER = '1975-01-01';

function pushIndex(map, key, value) {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

// Flashscore Latin display is "Last First": the last word is the first name.
function firstLastFromDisplay(display) {
  const parts = String(display ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: '', last: parts.join(' ') };
  return { first: parts[parts.length - 1], last: parts.slice(0, -1).join(' ') };
}

function isSubset(small, big) {
  return small.length >= 2 && small.every((t) => big.includes(t));
}

// Unique candidate by exact token key ("Sinner Jannik" == "Jannik Sinner").
function findByName(index, names, accept = () => true) {
  for (const name of names) {
    const hits = (index.get(tokenKey(name)) ?? []).filter(accept);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// Unique candidate whose name contains the other one ("alcaraz garfia carlos" ⊃ "carlos alcaraz").
function findBySubset(pool, names, accept = () => true) {
  for (const name of names) {
    const tokens = nameTokens(name);
    if (tokens.length < 2) continue;
    const hits = pool.filter((c) => accept(c) && c._tokens.some((t) => isSubset(tokens, t) || isSubset(t, tokens)));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// Same letters and at least one shared word ("Xinyu Wang" vs "Wang Xin Yu").
function findByLetters(pool, names, accept = () => true) {
  for (const name of names) {
    const key = letterKey(name);
    const tokens = nameTokens(name).filter((t) => t.length >= 3);
    if (!key || !tokens.length) continue;
    const hits = pool.filter((c) => accept(c)
      && c._names.some((n) => letterKey(n) === key)
      && c._tokens.some((t) => t.some((x) => tokens.includes(x))));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// "Рублев" -> "Рублёв" when another source spells the same name with ё.
function withYo(name, candidates) {
  if (!name || /ё/i.test(name)) return name;
  const plain = (s) => String(s ?? '').replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  return candidates.find((c) => c && /ё/i.test(c) && plain(c) === name) ?? name;
}

export function mergePlayers({
  fsRu = {}, fsEn = {}, wta = [], wikidata = [], elo = {}, espn = {}, fantasy = [], overrides = [],
  sportsru = [], botOverrides = [], extraAliases = [], profiles = [],
} = {}) {
  const players = new Map();
  const rankingDates = {};

  for (const key of RANKING_KEYS) {
    const ru = fsRu[key];
    if (!ru) continue;
    rankingDates[key] = ru.ranking_date ?? null;
    const enById = new Map((fsEn[key]?.rows ?? []).map((r) => [r.fs_id, r]));
    const [tourLower, discipline] = key.split('_');
    const tour = tourLower.toUpperCase();
    for (const row of ru.rows) {
      const en = enById.get(row.fs_id);
      const p = players.get(row.fs_id) ?? {
        fs_id: row.fs_id,
        tour,
        fs_slug: row.slug,
        name_fs_ru: null,
        name_latin: null,
        country_en: null,
        country_ru: null,
        singles_rank: null, singles_prev_rank: null, singles_points: null, singles_tournaments: null,
        doubles_rank: null, doubles_points: null,
        sources: new Set(['flashscore']),
      };
      if (isCyrillic(row.name) && !p.name_fs_ru) p.name_fs_ru = row.name;
      if (!p.name_latin) {
        if (en?.name && !isCyrillic(en.name)) p.name_latin = en.name;
        else if (!isCyrillic(row.name)) p.name_latin = row.name;
        else p.name_latin = latinFromSlug(row.slug);
      }
      p.country_en = p.country_en ?? en?.country ?? null;
      p.country_ru = p.country_ru ?? row.country ?? null;
      if (discipline === 'singles') {
        p.singles_rank = row.rank ?? null;
        p.singles_prev_rank = row.prev_rank ?? null;
        p.singles_points = row.points ?? null;
        p.singles_tournaments = row.tournaments ?? null;
      } else {
        p.doubles_rank = row.rank ?? null;
        p.doubles_points = row.points ?? null;
      }
      players.set(row.fs_id, p);
    }
  }

  const all = [...players.values()];
  const nameIndex = { ATP: new Map(), WTA: new Map() };
  for (const p of all) {
    p._names = [...new Set([p.name_latin, latinFromSlug(p.fs_slug)].filter(Boolean))];
    p._tokens = p._names.map(nameTokens);
    for (const n of p._names) pushIndex(nameIndex[p.tour], tokenKey(n), p);
  }
  const byTour = (tour) => all.filter((p) => p.tour === tour);

  // Official WTA ranking: WTA id, date of birth, IOC country code, first/last name.
  let wtaMatched = 0;
  for (const w of wta) {
    const names = [w.full_name, `${w.first_name} ${w.last_name}`];
    const p = findByName(nameIndex.WTA, names, (c) => !c.wta_id)
      ?? findBySubset(byTour('WTA'), names, (c) => !c.wta_id)
      ?? findByLetters(byTour('WTA'), names, (c) => !c.wta_id);
    if (!p) continue;
    p.wta_id = w.wta_id;
    p.birth_date = w.birth_date;
    p.first_name = w.first_name;
    p.last_name = w.last_name;
    p.country_code = w.country_code;
    p.wta_rank = w.rank;
    p.sources.add('wta');
    wtaMatched += 1;
  }

  // Learn English country name -> IOC code from players matched with the WTA API.
  const countryVotes = new Map();
  for (const p of all) {
    if (!p.country_code || !p.country_en || NEUTRAL_COUNTRIES.has(p.country_en)) continue;
    const votes = countryVotes.get(p.country_en) ?? new Map();
    votes.set(p.country_code, (votes.get(p.country_code) ?? 0) + 1);
    countryVotes.set(p.country_en, votes);
  }
  const countryCode = new Map(
    [...countryVotes].map(([name, votes]) => [name, [...votes].sort((a, b) => b[1] - a[1])[0][0]]),
  );

  // Wikidata: exact by Flashscore / WTA id, else unique name within the tour (+ birth date).
  const wdByFs = new Map();
  const wdByWta = new Map();
  const wdName = { ATP: new Map(), WTA: new Map() };
  for (const item of wikidata) {
    for (const id of item.fs_ids) wdByFs.set(id, item);
    for (const id of item.wta_ids) wdByWta.set(id, item);
    const active = !item.birth_date || item.birth_date >= ACTIVE_BORN_AFTER;
    if (!active || !item.name_en) continue;
    if (item.atp_ids.length) pushIndex(wdName.ATP, tokenKey(item.name_en), item);
    if (item.wta_ids.length) pushIndex(wdName.WTA, tokenKey(item.name_en), item);
  }
  const usedWikidata = new Set();
  let wikidataByName = 0;
  for (const p of all) {
    let item = wdByFs.get(p.fs_id) ?? (p.wta_id ? wdByWta.get(p.wta_id) : null);
    if (!item) {
      const names = [p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null, ...p._names].filter(Boolean);
      item = findByName(wdName[p.tour], names, (c) => !usedWikidata.has(c.wikidata_id)
        && (!p.birth_date || !c.birth_date || c.birth_date === p.birth_date));
      if (item) wikidataByName += 1;
    }
    if (!item || usedWikidata.has(item.wikidata_id)) continue;
    usedWikidata.add(item.wikidata_id);
    p.wikidata_id = item.wikidata_id;
    p.atp_id = item.atp_ids[0] ?? null;
    p.ta_id = item.ta_ids[0] ?? null;
    p.espn_id = item.espn_ids[0] ?? null;
    p.wta_id = p.wta_id ?? item.wta_ids[0] ?? null;
    p.birth_date = p.birth_date ?? item.birth_date ?? null;
    p.name_wikidata_ru = item.name_ru ? cleanRuLabel(item.name_ru) : null;
    p.name_wikidata_en = item.name_en ?? null;
    p.citizenships = item.citizenships ?? [];
    p.sources.add('wikidata');
  }

  // Tennis Abstract Elo: by Tennis Abstract id from Wikidata, else unique name.
  for (const tour of ['ATP', 'WTA']) {
    const byTa = new Map(byTour(tour).filter((p) => p.ta_id).map((p) => [p.ta_id, p]));
    for (const r of elo[tour]?.rows ?? []) {
      const p = (r.ta_id ? byTa.get(r.ta_id) : null)
        ?? findByName(nameIndex[tour], [r.name], (c) => c.elo == null);
      if (!p) continue;
      p.ta_id = p.ta_id ?? r.ta_id;
      p.elo = r.elo;
      p.elo_rank = r.elo_rank;
      p.elo_hard = r.elo_hard;
      p.elo_clay = r.elo_clay;
      p.elo_grass = r.elo_grass;
      p.sources.add('tennisabstract');
    }
  }

  // ESPN (top 150): headshots.
  for (const tour of ['ATP', 'WTA']) {
    const byEspn = new Map(byTour(tour).filter((p) => p.espn_id).map((p) => [p.espn_id, p]));
    for (const r of espn[tour] ?? []) {
      const p = byEspn.get(r.espn_id) ?? findByName(nameIndex[tour], [r.name], (c) => !c.espn_headshot);
      if (!p) continue;
      p.espn_id = p.espn_id ?? r.espn_id;
      p.espn_headshot = r.headshot;
      p.sources.add('espn');
    }
  }

  // RG Fantasy 2026 seed: editor-checked Russian names, photos, aliases.
  for (const f of fantasy) {
    const tour = String(f.tour ?? '').toUpperCase();
    if (!nameIndex[tour]) continue;
    const p = (f.fs_id && players.get(f.fs_id))
      || findByName(nameIndex[tour], [f.name_en], (c) => !c.fantasy_player_id)
      || findBySubset(byTour(tour), [f.name_en], (c) => !c.fantasy_player_id)
      || findByLetters(byTour(tour), [f.name_en], (c) => !c.fantasy_player_id);
    if (!p) continue;
    p.fantasy_player_id = f.fantasy_player_id;
    p.name_fantasy_ru = f.name_ru || null;
    p.fantasy_photo = f.photo_url || null;
    p.fantasy_aliases = f.aliases ?? [];
    p.sources.add('fantasy');
  }

  // sports.ru person pages (scripts/check-sportsru.mjs): the media spelling + birth date.
  for (const s of sportsru) {
    const p = players.get(s.fs_id);
    if (!p) continue;
    p.name_sportsru = s.name_ru;
    p.sportsru_url = s.url;
    p.birth_date = p.birth_date ?? s.birth_date ?? null;
    p.sources.add('sportsru');
  }

  // Flashscore player pages (scripts/fetch-player-profiles.mjs): photo and birth date.
  for (const pr of profiles) {
    const p = players.get(pr.fs_id);
    if (!p) continue;
    p.fs_photo = pr.photo_url ?? null;
    p.birth_date = p.birth_date ?? pr.birth_date ?? null;
  }

  const overrideByKey = new Map(overrides.map((o) => [o.fs_id ?? o.player_id, o]));
  const botByPlayer = new Map(botOverrides.map((o) => [o.player_id, o]));
  const extraByKey = new Map();
  for (const a of extraAliases) {
    const key = a.fs_id ?? a.player_id;
    extraByKey.set(key, [...(extraByKey.get(key) ?? []), a]);
  }
  const usedIds = new Set();
  const out = all.map((p) => {
    let playerId = `${p.tour.toLowerCase()}-${p.fs_slug || p.fs_id}`;
    if (usedIds.has(playerId)) playerId = `${playerId}-${p.fs_id}`;
    usedIds.add(playerId);
    const override = overrideByKey.get(p.fs_id) ?? overrideByKey.get(playerId);

    const display = p.first_name && p.last_name
      ? { first: p.first_name, last: p.last_name }
      : firstLastFromDisplay(p.name_latin);

    // Sporting nationality, not passport: Bublik (KAZ) or Tsitsipas (GRE) also hold Russian
    // citizenship in Wikidata but do not play for Russia. Russian players compete under the
    // neutral "Мир" flag on Flashscore; Wikidata citizenship tells Russians from Belarusians.
    const neutral = NEUTRAL_COUNTRIES.has(p.country_en) || NEUTRAL_COUNTRIES.has(p.country_ru);
    const citizenships = p.citizenships ?? [];
    let code = p.country_code ?? (neutral ? null : countryCode.get(p.country_en)) ?? null;
    let nationalitySource = p.country_code ? 'wta' : (code ? 'flashscore' : null);
    if (!code && neutral) {
      const local = citizenships.filter((c) => c === 'RUS' || c === 'BLR');
      if (local.length === 1) [code, nationalitySource] = [local[0], 'wikidata'];
      else [code, nationalitySource] = ['RUS', 'neutral_flag_guess'];
    }
    if (override?.country_code) [code, nationalitySource] = [override.country_code, 'override'];
    const isRussian = override?.is_russian ?? code === 'RUS';

    // Priority: bot decision > file override > sports.ru > fantasy > Wikidata > Flashscore > transcription.
    const bot = botByPlayer.get(playerId);
    const extras = [...(extraByKey.get(p.fs_id) ?? []), ...(extraByKey.get(playerId) ?? [])];
    let nameRu;
    let nameRuSource;
    if (bot?.name_ru) [nameRu, nameRuSource] = [bot.name_ru, 'bot'];
    else if (override?.name_ru) [nameRu, nameRuSource] = [override.name_ru, 'override'];
    else if (p.name_sportsru) [nameRu, nameRuSource] = [p.name_sportsru, 'sportsru'];
    else if (p.name_fantasy_ru) [nameRu, nameRuSource] = [p.name_fantasy_ru, 'fantasy'];
    else if (p.name_wikidata_ru && isCyrillic(p.name_wikidata_ru)) [nameRu, nameRuSource] = [p.name_wikidata_ru, 'wikidata'];
    else if (p.name_fs_ru) [nameRu, nameRuSource] = [p.name_fs_ru, 'flashscore'];
    else [nameRu, nameRuSource] = [transcribe(`${display.first} ${display.last}`.trim(), code), 'translit'];
    if (!['bot', 'override'].includes(nameRuSource)) {
      nameRu = withYo(nameRu, [p.name_fantasy_ru, p.name_wikidata_ru, p.name_fs_ru, ...extras.map((a) => a.alias)]);
    }

    const aliases = new Map();
    const addAlias = (alias, source) => {
      const key = tokenKey(alias);
      if (key && !aliases.has(key)) aliases.set(key, { alias, source });
    };
    addAlias(nameRu, nameRuSource);
    addAlias(surnameInitialRu(nameRu), nameRuSource);
    for (const n of p._names) addAlias(n, 'flashscore');
    addAlias(p.name_fs_ru, 'flashscore');
    addAlias(p.name_wikidata_ru, 'wikidata');
    addAlias(p.name_wikidata_en, 'wikidata');
    if (p.first_name) addAlias(`${p.first_name} ${p.last_name}`, 'wta');
    for (const a of p.fantasy_aliases ?? []) addAlias(a, 'fantasy');
    addAlias(p.name_sportsru, 'sportsru');
    for (const a of extras) addAlias(a.alias, a.source ?? 'extra');

    return {
      player_id: playerId,
      tour: p.tour,
      name_ru: nameRu,
      name_ru_short: shortRu(nameRu),
      name_ru_source: nameRuSource,
      name_latin: `${display.first} ${display.last}`.trim(),
      country_code: code,
      country_ru: p.country_ru,
      nationality_source: nationalitySource,
      neutral_flag: neutral,
      is_russian: Boolean(isRussian),
      birth_date: p.birth_date ?? null,
      photo_url: override?.photo_url ?? p.fs_photo ?? p.fantasy_photo ?? p.espn_headshot ?? null,
      singles_rank: p.singles_rank,
      singles_prev_rank: p.singles_prev_rank,
      singles_points: p.singles_points,
      singles_tournaments: p.singles_tournaments,
      doubles_rank: p.doubles_rank,
      doubles_points: p.doubles_points,
      elo: p.elo ?? null,
      elo_rank: p.elo_rank ?? null,
      elo_hard: p.elo_hard ?? null,
      elo_clay: p.elo_clay ?? null,
      elo_grass: p.elo_grass ?? null,
      fs_id: p.fs_id,
      fs_slug: p.fs_slug,
      wta_id: p.wta_id ?? null,
      atp_id: p.atp_id ?? null,
      espn_id: p.espn_id ?? null,
      ta_id: p.ta_id ?? null,
      wikidata_id: p.wikidata_id ?? null,
      fantasy_player_id: p.fantasy_player_id ?? null,
      sportsru_url: p.sportsru_url ?? null,
      sources: [...p.sources].sort(),
      aliases: [...aliases.values()],
    };
  });

  const rankSort = (p) => p.singles_rank ?? (p.doubles_rank != null ? 100000 + p.doubles_rank : 1e9);
  out.sort((a, b) => a.tour.localeCompare(b.tour) || rankSort(a) - rankSort(b) || a.player_id.localeCompare(b.player_id));
  return { players: out, rankingDates, stats: { wtaMatched, wikidataByName } };
}
