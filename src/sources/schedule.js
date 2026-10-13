// «Больше» broadcast schedule (Google Sheet). The sheet also holds VK stream keys
// (columns L and M), so we never download them: only the ranges A:K (date … commentators,
// station), N (broadcast link) and Q (VK post id) are exported, and anything that looks
// like a key is dropped even from those. The sheet id is a secret (env SCHEDULE_SHEET_ID),
// never written into this public repository.

import { fetchText } from '../lib/http.js';
import { tokenKey } from '../lib/names.js';

const MSK_OFFSET_HOURS = 3;

// RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const looksLikeSecret = (v) => /rtmp|:\/\/|\b[A-Za-z0-9_-]{16,}\b/i.test(String(v ?? ''));
const PERSON = /^[А-ЯЁ][а-яё]+(?:[ -][А-ЯЁ][а-яё]+){1,2}$/;

function cleanPerson(value) {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  return v && !looksLikeSecret(v) && PERSON.test(v) ? v : null;
}

function cleanPlayer(value) {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  return v && !looksLikeSecret(v) ? v : null;
}

function isoDate(value) {
  const m = String(value ?? '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

function cleanTime(value) {
  const m = String(value ?? '').replace(/\s+/g, '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function mskToUtcIso(date, time) {
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - MSK_OFFSET_HOURS, mi)).toISOString();
}

function cleanLink(value) {
  const v = String(value ?? '').trim().split(/\s+/)[0];
  return /^https:\/\/(vk\.com\/video|vkvideo\.ru\/|vksport\.vkvideo\.ru\/)/.test(v) ? v : null;
}

// The note column mixes tournaments ("WTA 1000 Пекин |1/16", "Ролан Гаррос", "Артур Эш") with
// internal remarks of the crew ("1 раз завис источник"); only tournament-like text is public.
const TOURNAMENT = /WTA|ATP|ITF|челлендж|кубок|ролан|гаррос|уимблдон|us open|ю-эс|австрал|открыт|шлем|финал|мастерс|masters|квалификац|артур эш|луи армстронг|корт|united cup|билли|дэвис|лейвер|laver|хопман|олимп|турнир/i;

// "WTA 1000 Пекин |1/16" -> tournament "WTA 1000 Пекин", round "1/16".
export function splitNote(note) {
  const text = String(note ?? '').trim();
  if (!text || !TOURNAMENT.test(text)) return { tournament: null, round: null };
  const [left, ...rest] = text.split('|').map((s) => s.trim());
  return { tournament: left || null, round: rest.join(' | ') || null };
}

export function buildBroadcasts(mainRows, linkRows = [], postRows = []) {
  const header = (mainRows[0] ?? []).map((h) => String(h).trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idx = {
    date: 0,
    time: col('время'),
    note: col('заметка'),
    league: col('лига'),
    home: col('дома'),
    away: col('на выезде'),
    c1: col('комментатор 1'),
    c2: col('комментатор 2'),
  };
  const out = [];
  const seen = new Map();
  for (let i = 1; i < mainRows.length; i += 1) {
    const r = mainRows[i];
    if (!/^теннис$/i.test(String(r[idx.league] ?? '').trim())) continue;
    const date = isoDate(r[idx.date]);
    const p1 = cleanPlayer(r[idx.home]);
    const p2 = cleanPlayer(r[idx.away]);
    if (!date || !p1) continue;
    const time = cleanTime(r[idx.time]);
    const note = String(r[idx.note] ?? '').trim();
    const cancelled = /отмен/i.test(note);
    const { tournament, round } = cancelled ? { tournament: null, round: null } : splitNote(note);
    let key = `${date}|${tokenKey(p1)}|${tokenKey(p2 ?? '')}`;
    const dup = seen.get(key) ?? 0;
    seen.set(key, dup + 1);
    if (dup) key = `${key}|${dup + 1}`;
    const post = String(postRows[i]?.[0] ?? '').trim();
    out.push({
      broadcast_key: key,
      sheet_row: i + 1,
      date_msk: date,
      time_msk: time,
      starts_at: mskToUtcIso(date, time),
      tournament,
      round,
      note: note || null,
      status: cancelled ? 'cancelled' : 'scheduled',
      player1_ru: p1,
      player2_ru: p2,
      is_doubles: /\//.test(`${p1} ${p2 ?? ''}`),
      commentator1: cleanPerson(r[idx.c1]),
      commentator2: cleanPerson(r[idx.c2]),
      vk_url: cleanLink(linkRows[i]?.[0]),
      vk_post_id: /^\d+$/.test(post) ? post : null,
    });
  }
  return out;
}

function exportUrl(sheetId, gid, range) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}&range=${range}`;
}

export async function fetchBroadcasts(sheetId, gid) {
  if (!sheetId) throw new Error('SCHEDULE_SHEET_ID is not set');
  const [main, links, posts] = await Promise.all([
    fetchText(exportUrl(sheetId, gid, 'A1:K30000'), { timeoutMs: 60000 }),
    fetchText(exportUrl(sheetId, gid, 'N1:N30000'), { timeoutMs: 60000 }),
    fetchText(exportUrl(sheetId, gid, 'Q1:Q30000'), { timeoutMs: 60000 }),
  ]);
  return buildBroadcasts(parseCsv(main), parseCsv(links), parseCsv(posts));
}
