// Wikidata: Russian names and exact links between source ids.
// Properties: P8259 Flashscore player ID, P597 WTA player ID, P536 ATP player ID,
// P10028 Tennis Abstract player ID, P11585 ESPN.com tennis player ID, P569 date of birth,
// P27 citizenship (only Russia Q159, Belarus Q184, USSR Q15180 are read: Flashscore lists
// Russian and Belarusian players under the neutral "Мир" flag).

import { fetchJson } from '../lib/http.js';

const ENDPOINT = 'https://query.wikidata.org/sparql';

export const CITIZENSHIP = { Q159: 'RUS', Q184: 'BLR', Q15180: 'URS' };

// The query service stops at 60 s and then returns broken JSON. P8259 exists for every
// sport, so every query is driven by one tennis-only id property, and ids, Latin names
// and Russian names are asked separately to keep each query light.
export function playersQueries(tourProperty) {
  const head = `?item wdt:${tourProperty} [] .`;
  return [
    `SELECT DISTINCT ?item ?fs ?wta ?atp ?ta ?espn ?dob ?cit WHERE { ${head}
  OPTIONAL { ?item wdt:P8259 ?fs }
  OPTIONAL { ?item wdt:P597 ?wta }
  OPTIONAL { ?item wdt:P536 ?atp }
  OPTIONAL { ?item wdt:P10028 ?ta }
  OPTIONAL { ?item wdt:P11585 ?espn }
  OPTIONAL { ?item wdt:P569 ?dob }
  OPTIONAL { ?item wdt:P27 ?cit FILTER(?cit IN (wd:Q159, wd:Q184, wd:Q15180)) }
}`,
    `SELECT ?item ?en ?mul WHERE { ${head}
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
}`,
    `SELECT ?item ?ru WHERE { ${head} ?item rdfs:label ?ru FILTER(LANG(?ru) = "ru") }`,
  ];
}

// Flashscore ids are stored either as "6HdC3z4H" or as "sinner-jannik/6HdC3z4H".
export function flashscoreIdFromWikidata(value) {
  const parts = String(value ?? '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

// One SPARQL row per combination of values; fold them into one record per item.
export function foldWikidataRows(bindings) {
  const byItem = new Map();
  for (const b of bindings ?? []) {
    const qid = String(b.item?.value ?? '').split('/').pop();
    if (!qid) continue;
    const rec = byItem.get(qid) ?? {
      wikidata_id: qid, fs_ids: new Set(), wta_ids: new Set(), atp_ids: new Set(),
      ta_ids: new Set(), espn_ids: new Set(), citizenships: new Set(),
      name_ru: null, name_en: null, birth_date: null,
    };
    const cit = CITIZENSHIP[String(b.cit?.value ?? '').split('/').pop()];
    if (cit) rec.citizenships.add(cit);
    if (b.fs?.value) rec.fs_ids.add(flashscoreIdFromWikidata(b.fs.value));
    if (b.wta?.value) rec.wta_ids.add(String(b.wta.value));
    if (b.atp?.value) rec.atp_ids.add(String(b.atp.value).toUpperCase());
    if (b.ta?.value) rec.ta_ids.add(String(b.ta.value));
    if (b.espn?.value) rec.espn_ids.add(String(b.espn.value));
    if (b.ru?.value && !rec.name_ru) rec.name_ru = b.ru.value;
    // Many famous players have no "en" label any more, only the language-neutral "mul" one.
    if (b.en?.value) rec.name_en = b.en.value;
    else if (b.mul?.value && !rec.name_en) rec.name_en = b.mul.value;
    if (b.dob?.value && !rec.birth_date) rec.birth_date = String(b.dob.value).slice(0, 10);
    byItem.set(qid, rec);
  }
  return [...byItem.values()].map((r) => ({
    ...r,
    fs_ids: [...r.fs_ids],
    wta_ids: [...r.wta_ids],
    atp_ids: [...r.atp_ids],
    ta_ids: [...r.ta_ids],
    espn_ids: [...r.espn_ids],
    citizenships: [...r.citizenships],
  }));
}

export async function fetchWikidataPlayers() {
  const bindings = [];
  for (const property of ['P597', 'P536']) {
    for (const query of playersQueries(property)) {
      const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, {
        headers: { accept: 'application/sparql-results+json' },
        timeoutMs: 90000,
        retries: 2,
      });
      bindings.push(...(data?.results?.bindings ?? []));
    }
  }
  return foldWikidataRows(bindings);
}
