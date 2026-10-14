// «Больше. Теннис» Telegram Mini App: one small router, no framework, no patch layers.
// Screens: home (#/), matches of a day (#/matches), match card (#/match/<id>),
// players (#/players), player (#/player/<id>), profile with levels (#/profile).

const tg = window.Telegram?.WebApp;
const view = document.getElementById('view');
let timer = null;
// Every navigation gets a token; a screen whose data arrives after the user moved on draws nothing.
let routeToken = 0;
const stale = (token) => token !== routeToken;
// A screen refreshes itself while it stays open. A refresh redraws the screen, and the redraw
// must not start one more timer: before 2026-10-14 every refresh did, so an open app doubled
// its requests every minute until the browser ran out of connections.
// route() clears the timer when the user moves to another screen.
function refreshEvery(ms, redraw) {
  if (timer) return;
  timer = setInterval(() => { if (!document.hidden) redraw().catch(() => {}); }, ms);
}

if (tg) {
  tg.ready();
  tg.expand();
  document.documentElement.dataset.tg = '1';
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mskDay = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const shortDate = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const longDate = (date) => {
  const text = new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const SURFACE = { hard: 'хард', clay: 'грунт', grass: 'трава', carpet: 'ковёр' };
const STATUS = { finished: 'Завершён', retired: 'Отказ', walkover: 'Неявка', cancelled: 'Отменён', postponed: 'Перенесён', interrupted: 'Прерван' };

let noSpoilers = false;
try { noSpoilers = localStorage.getItem('bolshe-no-spoilers') === '1'; } catch { /* storage may be blocked */ }
const spoilerBtn = document.getElementById('spoilerToggle');
function paintSpoiler() {
  spoilerBtn.setAttribute('aria-pressed', String(noSpoilers));
  spoilerBtn.textContent = noSpoilers ? '🙈' : '👁';
}
spoilerBtn.addEventListener('click', () => {
  noSpoilers = !noSpoilers;
  try { localStorage.setItem('bolshe-no-spoilers', noSpoilers ? '1' : '0'); } catch { /* ignore */ }
  paintSpoiler();
  route();
});
paintSpoiler();

async function api(path) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// A player's head: our stored copy (/media/heads/…) or a neutral silhouette when there is no photo.
const silhouette = (cls) => `<span class="${cls} ph" aria-hidden="true"></span>`;
function avatar(src, cls = 'ava') {
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-head>` : silhouette(cls);
}

// The picture of a «Больше» broadcast: our stored VK cover; under it (and instead of it when
// there is none) both players' heads on the brand colours.
function coverBox(cover, p1, p2, cls = '') {
  return `<div class="cover ${cls}"><div class="heads">${avatar(p1?.photo, 'head')}<span class="vs-mark">vs</span>${avatar(p2?.photo, 'head')}</div>
    ${cover ? `<img class="cover-img" src="${esc(cover)}" alt="" loading="lazy" data-cover>` : ''}</div>`;
}

// A picture that fails to load is replaced once (a cover simply goes away and shows the heads
// under it); nothing is ever retried in a loop.
document.addEventListener('error', (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.hasAttribute('data-cover')) img.remove();
  else if (img.hasAttribute('data-head')) img.outerHTML = silhouette(img.className);
}, true);

// ---------- time in the user's own zone ----------
const localTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
function tzLabel() {
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Moscow') return 'Москва';
    return new Intl.DateTimeFormat('ru-RU', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'местное';
  } catch {
    return 'местное';
  }
}
function dayWord(iso) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'сегодня';
  if (d.toDateString() === tomorrow.toDateString()) return 'завтра';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}
// "серия 1000" → "1000 " for headings like "WTA 1000 Ухань".
const tierNumber = (t) => { const n = String(t?.tier_label ?? '').match(/\d{3,4}/)?.[0]; return n ? `${n} ` : ''; };

// ---------- Winline odds ----------
const WINLINE_LOGO = '/app/winline.png';
// "П1 2.90 · П2 1.41" with the small logo; after the match the winner's price is marked
// (not while the no-spoilers switch is on).
function oddsRow(m) {
  const o = m.odds;
  if (!o) return '';
  const done = DONE.includes(m.status) && showScore(m);
  const chip = (side, v) => `<span class="odd${done && m.winner === side ? ' won' : ''}">П${side} <b>${Number(v).toFixed(2)}</b></span>`;
  return `<span class="odds"><img src="${WINLINE_LOGO}" alt="Winline">${chip(1, o.p1)}${chip(2, o.p2)}</span>`;
}
function oddsBox(m) {
  const o = m.odds;
  if (!o) return '';
  const done = DONE.includes(m.status) && showScore(m);
  const cell = (side, p, v) => `<div class="o${done && m.winner === side ? ' won' : ''}"><span>${esc(p.name)}</span><b>${Number(v).toFixed(2)}</b></div>`;
  return `<div class="wlbox"><img src="${WINLINE_LOGO}" alt="Winline">${cell(1, m.p1, o.p1)}${cell(2, m.p2, o.p2)}</div>`;
}

// ---------- fans: Telegram sign-in, votes, follows ----------
let me = null;
const authHeaders = () => (tg?.initData ? { 'x-telegram-init-data': tg.initData } : {});
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function loadMe(date) {
  if (!tg?.initData) { me = null; return null; }
  try { me = await api(`/api/me?date=${date}`); } catch { me = null; }
  return me;
}
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function splitBar(m, v) {
  const p1 = Math.round((v.p1 / v.total) * 100);
  return `<div class="split-lbl"><span>Голоса болельщиков</span><span>${v.total} ${plural(v.total, 'голос', 'голоса', 'голосов')}</span></div>
    <div class="split"><i style="width:${p1}%"></i><i style="width:${100 - p1}%"></i></div>
    <div class="split-pc"><span>${p1}% ${esc(lastName(m.p1))}</span><span>${esc(lastName(m.p2))} ${100 - p1}%</span></div>`;
}
// "Кто выиграет?": buttons until the match starts, then the fans' split.
function voteBlock(m) {
  const pick = me?.picks?.[m.match_id] ?? null;
  const v = m.votes ?? { p1: 0, p2: 0, total: 0 };
  if (m.status === 'scheduled') {
    if (!tg?.initData) return '<div class="vote"><div class="vote-cap">Кто выиграет?</div><div class="vote-note">Голосовать можно в приложении в Telegram</div></div>';
    const btn = (side, p) => `<button type="button" class="${pick === side ? 'on' : ''}" data-vote="${esc(m.match_id)}" data-pick="${side}">${esc(lastName(p))}</button>`;
    return `<div class="vote"><div class="vote-cap">Кто выиграет?${pick ? ' Голос принят — до начала можно передумать' : ''}</div>
      <div class="vote-btns">${btn(1, m.p1)}${btn(2, m.p2)}</div>${pick && v.total ? splitBar(m, v) : ''}</div>`;
  }
  if (m.status === 'cancelled') return '';
  if (!v.total) return '<div class="vote"><div class="vote-note">Голосование закрылось с началом матча — голосов не было</div></div>';
  return `<div class="vote">${splitBar(m, v)}<div class="vote-note">Голосование закрылось с началом матча${pick ? `. Твой выбор: ${esc(lastName(pick === 1 ? m.p1 : m.p2))}` : ''}</div></div>`;
}
function bindFanActions(root, rerender) {
  root.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    b.disabled = true;
    try {
      await post('/api/votes', { match_id: b.dataset.vote, pick: Number(b.dataset.pick) });
      tg?.HapticFeedback?.selectionChanged?.();
      toast('Голос принят');
    } catch (error) {
      toast(error.message);
    }
    rerender().catch(() => {});
  }));
  root.querySelectorAll('[data-follow]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    b.disabled = true;
    try {
      await post('/api/follows', { player_id: b.dataset.follow, on: b.dataset.on !== '0' });
      toast(b.dataset.on === '0' ? 'Больше не следишь' : 'Добавлен в «Мои игроки»');
    } catch (error) {
      toast(error.message);
    }
    rerender().catch(() => {});
  }));
}


const showScore = (m) => !noSpoilers || m.status === 'scheduled';
const lastName = (p) => {
  const name = String(p?.name ?? p?.short ?? '');
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 && !/\.$/.test(parts[parts.length - 1]) ? parts.slice(1).join(' ') : parts[0];
};

function setsOf(m, side) {
  return (m.sets ?? []).map((s) => {
    const games = side === 1 ? s.p1 : s.p2;
    const tb = side === 1 ? s.tb1 : s.tb2;
    return `<b>${games ?? ''}${tb != null && games === 6 && (s.p1 === 7 || s.p2 === 7) ? `<sup>${tb}</sup>` : ''}</b>`;
  }).join('');
}

function matchRow(m, side) {
  const p = side === 1 ? m.p1 : m.p2;
  const won = m.winner === side && showScore(m);
  const rank = p.rank ? `<small>${p.rank}</small>` : '';
  const score = m.status === 'scheduled' ? '' : showScore(m) ? `<span class="sets">${setsOf(m, side)}</span>` : '';
  return `<div class="row${won ? ' won' : ''}">${avatar(p.photo)}<span class="name">${esc(p.short ?? p.name)}${rank}</span>${score}</div>`;
}

function statusLabel(m) {
  if (m.status === 'live') return `<span class="live">● LIVE${m.live_set ? ` · ${m.live_set}-й сет` : ''}</span>`;
  if (m.status === 'scheduled') return `<span>${localTime(m.start_at)}</span>`;
  return `<span>${STATUS[m.status] ?? ''}</span>`;
}

function matchCard(m) {
  const t = m.tournament;
  const hidden = noSpoilers && m.status !== 'scheduled' ? '<div class="hidden-score">Счёт скрыт</div>' : '';
  const thumb = m.bolshe?.cover ? `<img class="thumb" src="${esc(m.bolshe.cover)}" alt="" loading="lazy" data-cover>` : '';
  const bolshe = m.bolshe
    ? `<div class="bolshe"><span class="who">${thumb}<span class="badge">Больше</span> ${esc(m.bolshe.commentator1 ?? '')}</span>${m.bolshe.vk_url ? '<span>▶ VK</span>' : ''}</div>`
    : '';
  return `<a class="card" href="#/match/${encodeURIComponent(m.match_id)}">
    <div class="meta"><span>${esc(t.tour ?? '')} ${esc(t.name ?? '')}${t.surface ? ` · ${SURFACE[t.surface]}` : ''}</span>${statusLabel(m)}</div>
    ${matchRow(m, 1)}${matchRow(m, 2)}${hidden}${m.odds ? `<div class="card-odds">${oddsRow(m)}</div>` : ''}${bolshe}</a>`;
}

// Вчера — Сегодня — Завтра — 📆 (any day within the week Flashscore keeps).
function daysStrip(current) {
  const quick = [[-1, 'Вчера'], [0, 'Сегодня'], [1, 'Завтра']];
  const custom = !quick.some(([o]) => mskDay(o) === current);
  return `<div class="days">${quick.map(([o, label]) => {
    const d = mskDay(o);
    return `<button class="day${d === current ? ' on' : ''}" data-day="${d}">${label}</button>`;
  }).join('')}
    <label class="day pick${custom ? ' on' : ''}" title="Выбрать день">📆${custom ? ` ${esc(shortDate(current))}` : ''}
      <input type="date" data-pick min="${mskDay(-7)}" max="${mskDay(7)}" value="${esc(current)}" aria-label="Выбрать день"></label></div>`;
}

function bindDays(go) {
  view.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => go(b.dataset.day)));
  const pick = view.querySelector('[data-pick]');
  pick?.addEventListener('change', () => { if (pick.value) go(pick.value); });
}

// ---------- home (variant D: hello + rating → on air → my players → «Больше» broadcasts → tournaments) ----------
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const DONE = ['finished', 'retired', 'walkover'];
// A «Больше» broadcast keeps the time of the schedule (the time on the cover), not the moment
// the match really began.
const startOf = (m) => Date.parse(m.bolshe?.starts_at ?? '') || Date.parse(m.start_at ?? '') || 0;
const startIso = (m) => new Date(startOf(m)).toISOString();
let earlyOpen = false; // «Ранние эфиры» opened once stay open on refresh

function ratingCard() {
  if (!me) {
    return `<div class="level-card"><div class="row"><b>Подающий мячи</b><span>0 XP</span></div>
      <div class="prog"><i style="width:0%"></i></div>
      <div class="row"><span>${tg?.initData ? 'Сделай первый прогноз — и опыт пойдёт' : 'Открой приложение в Telegram, чтобы голосовать и копить опыт'}</span></div></div>`;
  }
  const lv = me.level;
  return `<a class="level-card" href="#/profile"><div class="row"><b>${esc(lv.title)}</b><span>${me.xp.toLocaleString('ru-RU')} XP</span></div>
    <div class="prog"><i style="width:${Math.round((lv.progress ?? 0) * 100)}%"></i></div>
    <div class="row"><span>${esc(lv.subtitle)}</span><span>до «${esc(lv.next_title)}» ${lv.to_next.toLocaleString('ru-RU')} XP</span></div>
    <div class="lvstats">
      <div><b>${me.place ? `№${me.place}` : '—'}</b><span>${me.place ? `из ${me.fans}` : 'в таблице'}</span></div>
      <div><b>${me.guessed} из ${me.settled}</b><span>угадано</span></div>
      <div><b>${me.streak}</b><span>серия</span></div>
    </div></a>`;
}

// The big card of a «Больше» broadcast: cover, full names, score, Winline odds, and the vote —
// buttons before the start, the fans' split once the match is on.
function airCard(m) {
  const t = m.tournament;
  const live = m.status === 'live';
  const meta = [m.bolshe?.title || `${t.tour ?? ''} ${t.name ?? ''}`.trim(), m.bolshe?.round].filter(Boolean).join(' · ');
  const badge = live ? `<span class="live on-dark"><span class="dot"></span>LIVE${m.live_set ? ` · ${m.live_set}-й сет` : ''}</span>`
    : m.status === 'scheduled' ? `<span>${esc(localTime(startIso(m)))}</span>` : `<span>${esc(STATUS[m.status] ?? '')}</span>`;
  const set = (m.sets ?? []).at(-1);
  const center = m.status === 'scheduled' ? 'vs' : showScore(m) ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '—';
  const sub = live && set && showScore(m) ? `${m.live_set ?? (m.sets ?? []).length}-й сет ${set.p1 ?? 0}:${set.p2 ?? 0}` : m.status === 'scheduled' ? 'начало' : '';
  const side = (p) => `<div><div class="nm">${esc(p.name)}</div><div class="rk">${p.rank ? `№${p.rank}` : ''}</div></div>`;
  return `<div class="air">
    <div class="air-meta"><span>${esc(meta)}</span>${badge}</div>
    <a href="#/match/${encodeURIComponent(m.match_id)}">${coverBox(m.bolshe?.cover, m.p1, m.p2, 'in-air')}</a>
    <div class="air-vs">${side(m.p1)}<div><div class="big">${esc(center)}</div><div class="sub">${esc(sub)}</div></div>${side(m.p2)}</div>
    ${oddsBox(m)}
    ${voteBlock(m)}
    ${m.bolshe?.commentator1 ? `<div class="air-com">Комментирует ${esc([m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).join(' и '))}</div>` : ''}
    ${m.bolshe?.vk_url ? `<a class="air-watch" href="${esc(m.bolshe.vk_url)}" target="_blank" rel="noopener">▶ Смотреть на VK</a>` : ''}
  </div>`;
}

function myPlayersBlock(d) {
  const cards = me?.my_players ?? [];
  if (cards.length) {
    return `<div class="seccap"><span>Мои игроки</span><a href="#/players">изменить</a></div><div class="mine">${cards.map((p) => {
      const status = p.live ? `<span class="st live-st">LIVE ${showScore({ status: 'live' }) ? esc(p.live.score) : ''}</span>`
        : p.last && showScore({ status: 'finished' }) ? `<span class="st ${p.last.won ? 'win' : 'loss'}">${p.last.won ? 'Победа' : 'Поражение'} ${esc(p.last.score)}</span>`
          : '<span class="st idle">Не играет</span>';
      const line1 = p.live ? `с ${esc(lastName({ name: p.live.opponent }))}` : p.last ? `с ${esc(lastName({ name: p.last.opponent }))}` : 'матчей нет';
      const line2 = p.next ? `${esc(dayWord(p.next.start_at))} — ${esc(lastName({ name: p.next.opponent }))}` : '';
      return `<a class="pl-card" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo, 'head')}<b>${esc(lastName({ name: p.name }))}</b>${status}<small>${line1}${line2 ? `<br>${line2}` : ''}</small></a>`;
    }).join('')}</div>`;
  }
  // Nobody followed yet: our players of the day to pick from.
  const seen = new Set();
  const ours = [];
  for (const m of d.russians) {
    for (const p of [m.p1, m.p2]) {
      if (p.is_russian && p.player_id && !seen.has(p.player_id) && ours.length < 3) { seen.add(p.player_id); ours.push(p); }
    }
  }
  if (!ours.length) return '';
  return `<div class="seccap"><span>Мои игроки</span></div>
    <div class="hint">Отметь игроков — здесь будут их матчи и результаты.</div>
    <div class="mine">${ours.map((p) => `<div class="pl-card">${avatar(p.photo, 'head')}<b>${esc(lastName(p))}</b>
      ${tg?.initData ? `<button class="follow" type="button" data-follow="${esc(p.player_id)}">☆ Следить</button>` : `<a class="small" href="#/player/${encodeURIComponent(p.player_id)}">открыть</a>`}</div>`).join('')}</div>`;
}

// One «Больше» broadcast row: time in the user's zone, cover thumb (or both heads), names, score,
// then Winline odds (+ the vote for matches still to come).
function broadcastRow({ m, b }) {
  const p1 = m ? m.p1 : { photo: b.player1_photo, name: b.player1_name ?? b.player1_ru };
  const p2 = m ? m.p2 : { photo: b.player2_photo, name: b.player2_name ?? b.player2_ru };
  const cover = m ? m.bolshe?.cover : b.cover;
  const thumb = cover ? `<img class="th" src="${esc(cover)}" alt="" loading="lazy" data-cover>`
    : `<span class="th nocov">${avatar(p1.photo, 'mini')}${avatar(p2.photo, 'mini')}</span>`;
  const w = m && showScore(m) ? m.winner : null;
  const n1 = m ? lastName(m.p1) : String(p1.name ?? '');
  const n2 = m ? lastName(m.p2) : String(p2.name ?? '');
  const when = m?.status === 'live' ? '<span class="live"><span class="dot"></span>LIVE</span>' : esc(localTime(m ? startIso(m) : b.starts_at));
  const score = m && m.status !== 'scheduled' && showScore(m) ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '';
  const small = [m ? m.tournament.name : b.tournament, (m ? m.bolshe?.commentator1 : b.commentator1)].filter(Boolean).join(' · ');
  const extra = m ? `${oddsRow(m)}${m.status === 'scheduled' ? `<span class="vote-chip">${me?.picks?.[m.match_id] ? 'Твой прогноз принят' : 'Кто выиграет? →'}</span>` : ''}` : '';
  const href = m ? `#/match/${encodeURIComponent(m.match_id)}` : (b.vk_url ?? '#/');
  return `<a class="bline" href="${esc(href)}"${!m && b.vk_url ? ' target="_blank" rel="noopener"' : ''}><span class="t">${when}</span>${thumb}
    <span class="who">${w === 1 ? `<b>${esc(n1)}</b>` : esc(n1)} — ${w === 2 ? `<b>${esc(n2)}</b>` : esc(n2)}<small>${esc(small)}</small></span>
    <span class="sc">${esc(score)}</span>${extra ? `<span class="extra">${extra}</span>` : ''}</a>`;
}

function broadcastsBlock(d) {
  const pairKey = (a, c) => [a, c].sort().join('|');
  const shown = new Set(d.bolshe.map((m) => pairKey(m.p1.player_id, m.p2.player_id)));
  const rows = [
    ...d.bolshe.map((m) => ({ at: startOf(m), done: DONE.includes(m.status) || m.status === 'cancelled', m })),
    ...d.broadcasts.filter((b) => b.status !== 'cancelled' && !shown.has(pairKey(b.player1_id, b.player2_id)))
      .map((b) => ({ at: Date.parse(b.starts_at ?? '') || 0, done: (Date.parse(b.starts_at ?? '') || 0) < Date.now() - 2 * 3600e3, b })),
  ].sort((a, c) => a.at - c.at);
  if (!rows.length) return '<div class="seccap"><span>Прямые трансляции «Больше» сегодня</span></div><div class="empty">Сегодня эфиров нет</div>';
  const doneRows = rows.filter((r) => r.done);
  const hidden = !earlyOpen && doneRows.length > 4 ? doneRows.slice(0, doneRows.length - 4) : [];
  // "Сейчас" sits before the first broadcast that is still ahead by the clock.
  const nowIndex = rows.findIndex((r) => r.at > Date.now() && !r.m?.status?.match(/live|finished|retired|walkover/));
  const parts = [];
  if (hidden.length) {
    parts.push(`<button class="more-early" type="button" data-early>Ранние эфиры ${esc(localTime(new Date(hidden[0].at).toISOString()))}–${esc(localTime(new Date(hidden.at(-1).at).toISOString()))}: ещё ${hidden.length} →</button>`);
  }
  rows.forEach((r, i) => {
    if (i === nowIndex && i > 0) parts.push(`<div class="now"><span>Сейчас ${esc(localTime(new Date().toISOString()))}</span><i></i></div>`);
    parts.push(`<div class="brow${hidden.includes(r) ? ' early' : ''}">${broadcastRow(r)}</div>`);
  });
  return `<div class="seccap"><span>Прямые трансляции «Больше» сегодня</span></div>
    <div class="note">Время по твоему часовому поясу (${esc(tzLabel())}) · коэффициенты <img src="${WINLINE_LOGO}" alt="Winline"></div>
    <div class="blist">${parts.join('')}</div>`;
}

function tournamentsBlock(d) {
  const tour = d.tournaments.filter((t) => t.level === 'tour');
  const challengers = d.tournaments.filter((t) => t.level === 'challenger').length;
  if (!tour.length && !challengers) return '';
  const card = (t) => `<a class="tour-card" href="#/matches?level=tour">
    <div class="tt"><b>${esc(`${t.tour ?? ''} ${tierNumber(t)}${t.name ?? ''}`.replace(/\s+/g, ' ').trim())}</b>${t.live ? `<span class="live"><span class="dot"></span>${t.live} ${plural(t.live, 'идёт', 'идут', 'идут')}</span>` : ''}</div>
    <div>${[SURFACE[t.surface], t.round].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
    <div class="nums"><div><b>${t.matches}</b><span>${plural(t.matches, 'матч', 'матча', 'матчей')} сегодня</span></div>
      <div><b>${t.bolshe}</b><span>в эфире «Больше»</span></div><div><b>${t.russians}</b><span>${plural(t.russians, 'наш', 'наших', 'наших')}</span></div></div>
    ${t.upcoming?.length ? `<div class="ahead">Главные матчи впереди — не в графике «Больше»</div>
      ${t.upcoming.map((m) => `<div class="up"><span class="t">${esc(dayWord(m.start_at))}<br>${esc(localTime(m.start_at))}</span>
        <span class="who">${esc(lastName(m.p1))}${m.p1.rank ? ` (№${m.p1.rank})` : ''} — ${esc(lastName(m.p2))}${m.p2.rank ? ` (№${m.p2.rank})` : ''}${oddsRow(m)}</span></div>`).join('')}` : ''}
  </a>`;
  return `<div class="seccap"><span>Турниры</span></div><div class="tours">${tour.map(card).join('')}
    ${challengers ? `<a class="tour-card slim" href="#/matches?level=challenger">Ещё ${challengers} ${plural(challengers, 'челленджер', 'челленджера', 'челленджеров')} →</a>` : ''}</div>`;
}

async function home(params, token) {
  const date = mskDay(0);
  const [d] = await Promise.all([api(`/api/home?date=${date}`), loadMe(date)]);
  if (stale(token)) return;
  const live = d.bolshe.filter((m) => m.status === 'live').sort((a, c) => startOf(a) - startOf(c));
  const coming = d.bolshe.filter((m) => m.status === 'scheduled').sort((a, c) => startOf(a) - startOf(c));
  const air = live.length ? live : coming.slice(0, 2);
  const name = me?.user?.first_name || tg?.initDataUnsafe?.user?.first_name || '';
  const sub = [
    live.length ? `Сейчас в эфире «Больше» ${live.length} ${plural(live.length, 'матч', 'матча', 'матчей')}` : '',
    coming.length ? `${live.length ? 'впереди ещё' : 'Сегодня впереди'} ${coming.length} — успей с прогнозом` : '',
  ].filter(Boolean).join(', ') || 'Эфиры «Больше» на сегодня закончились — смотри результаты ниже';
  view.innerHTML = `
    <div class="hello"><div class="hi">Привет${name ? `, ${esc(name)}` : ''}!</div><p>${esc(sub)}.</p></div>
    ${ratingCard()}
    ${air.length ? `<div class="seccap"><span>${live.length ? 'Сейчас в эфире «Больше»' : 'Скоро в эфире «Больше»'}</span>${air.length > 1 ? `<span class="r">${air.length} ${plural(air.length, 'матч', 'матча', 'матчей')} ›</span>` : ''}</div>
      <div class="air-strip">${air.map(airCard).join('')}</div>` : ''}
    ${myPlayersBlock(d)}
    ${broadcastsBlock(d)}
    ${tournamentsBlock(d)}`;
  bindFanActions(view, () => home(params, token));
  view.querySelector('[data-early]')?.addEventListener('click', (e) => {
    earlyOpen = true;
    view.querySelectorAll('.brow.early').forEach((r) => r.classList.remove('early'));
    e.currentTarget.remove();
  });
  refreshEvery(60000, () => home(params, token));
}

// ---------- matches ----------
async function matches(params, token) {
  const date = params.get('date') ?? mskDay(0);
  const level = params.get('level') ?? 'tour';
  const d = await api(`/api/matches?date=${date}&level=${level}`);
  if (stale(token)) return;
  const levels = [['tour', 'ATP / WTA'], ['challenger', 'Челленджеры'], ['itf', 'ITF']];
  const groups = new Map();
  for (const m of d.matches) {
    const key = `${m.tournament.tour ?? ''} ${m.tournament.name ?? ''} · ${m.tournament.discipline === 'singles' ? 'одиночки' : 'пары'}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  view.innerHTML = `${daysStrip(date)}
    <div class="days" style="margin-top:6px">${levels.map(([k, n]) => `<button class="day${k === level ? ' on' : ''}" data-level="${k}">${n}</button>`).join('')}</div>
    ${[...groups].map(([name, list]) => `<h2>${esc(name)}</h2>${list.map(matchCard).join('')}`).join('')
      || `<div class="empty" style="margin-top:12px">${date > mskDay(1) ? 'Расписание на этот день ещё не опубликовано — обычно оно появляется накануне' : 'В этот день матчей нет'}</div>`}`;
  bindDays((day) => { location.hash = `#/matches?date=${day}&level=${level}`; });
  view.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/matches?date=${date}&level=${b.dataset.level}`; }));
  if (date === mskDay(0)) refreshEvery(30000, () => matches(params, token));
}

// ---------- match ----------
function resultLine(m, fsId) {
  const mine = m.p1_fs_id === fsId ? 1 : 2;
  const opp = mine === 1 ? m.p2_name : m.p1_name;
  const won = m.winner === mine;
  const score = mine === 1 ? `${m.sets_p1}:${m.sets_p2}` : `${m.sets_p2}:${m.sets_p1}`;
  const date = m.start_at ? new Date(m.start_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  return `<div class="item"><span class="muted">${esc(date)}</span><span>${esc(opp)} <span class="muted">· ${esc(m.tournament ?? '')}</span></span><span class="${won ? 'w' : 'l'}">${won ? 'В' : 'П'} ${esc(score)}</span></div>`;
}

function compareBlock(m, pv) {
  if (!pv.table?.length && !pv.facts?.length) return '';
  const bar = pv.chance
    ? `<div class="chance"><div class="bar"><i style="width:${pv.chance.p1}%"></i><i style="width:${pv.chance.p2}%"></i></div></div>`
    : '';
  const rows = (pv.table ?? []).map((r) => `<div class="cmp-row"><b class="${r.better === 1 ? 'up' : ''}">${esc(r.p1)}</b><span>${esc(r.label)}</span><b class="${r.better === 2 ? 'up' : ''}">${esc(r.p2)}</b></div>`).join('');
  return `<h2>Сравнение</h2><div class="hero compare">
    <div class="cmp-head"><span>${esc(lastName(m.p1))}</span><span></span><span>${esc(lastName(m.p2))}</span></div>
    ${rows}${bar}
    ${pv.facts?.length ? `<ul class="facts">${pv.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>`;
}

async function match(id, token) {
  const [d] = await Promise.all([api(`/api/matches/${encodeURIComponent(id)}`), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const m = d.match;
  const t = m.tournament;
  const status = m.status === 'live' ? '<span class="live">● LIVE</span>'
    : m.status === 'scheduled' ? `начало в ${localTime(m.start_at)}` : STATUS[m.status] ?? '';
  const scoreBig = m.status === 'scheduled' ? 'vs' : showScore(m) ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '—';
  const setLine = m.status !== 'scheduled' && showScore(m) ? m.sets.map((s) => `${s.p1}:${s.p2}`).join('  ') : '';
  const player = (p) => {
    const inner = `${avatar(p.photo, 'pa')}<div class="nm">${esc(p.name)}</div><div class="rk">${p.rank ? `№${p.rank}` : ''}</div>`;
    return p.player_id ? `<a class="pl" href="#/player/${encodeURIComponent(p.player_id)}">${inner}</a>` : `<div class="pl">${inner}</div>`;
  };
  const lastBlock = (p, list) => (list.length ? `<h2>${esc(p.short ?? p.name)}: последние матчи</h2><div class="hero list">${list.map((x) => resultLine(x, p.fs_id)).join('')}</div>` : '');
  const cover = m.bolshe?.cover
    ? (m.bolshe.vk_url ? `<a class="cover-link" href="${esc(m.bolshe.vk_url)}" target="_blank" rel="noopener">${coverBox(m.bolshe.cover, m.p1, m.p2, 'big')}</a>` : coverBox(m.bolshe.cover, m.p1, m.p2, 'big'))
    : '';
  view.innerHTML = `
    ${cover}
    <div class="muted small">${esc(t.tour ?? '')} ${esc(t.name ?? '')}${t.surface ? ` · ${SURFACE[t.surface]}` : ''} · ${status}</div>
    <div class="hero">
      <div class="vs">${player(m.p1)}<div class="score">${esc(scoreBig)}</div>${player(m.p2)}</div>
      ${setLine ? `<div class="setline">${esc(setLine)}</div>` : ''}
      ${oddsBox(m)}
      ${voteBlock(m)}
      ${m.bolshe ? `<div class="bolshe" style="justify-content:center;margin-top:10px"><span class="badge">Больше</span>&nbsp;${esc([m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).join(' и '))}</div>` : ''}
      ${m.bolshe?.vk_url ? `<a class="watch" href="${esc(m.bolshe.vk_url)}" target="_blank" rel="noopener">▶ Смотреть на VK</a>` : ''}
    </div>
    ${compareBlock(m, d.preview)}
    ${d.meetings.length ? `<h2>Личные встречи</h2><div class="hero list">${d.meetings.map((x) => resultLine(x, m.p1.fs_id)).join('')}</div>` : ''}
    ${noSpoilers ? '' : lastBlock(m.p1, d.last.p1) + lastBlock(m.p2, d.last.p2)}`;
  bindFanActions(view, () => match(id, token));
  if (m.status === 'live' || m.status === 'scheduled') refreshEvery(30000, () => match(id, token));
}

// ---------- players ----------
function playerRows(list) {
  return list.map((p) => `<a class="player-row" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo_url, '')}<span><b>${esc(p.name_ru)}</b><br><span class="muted small">${esc(p.tour)} · ${esc(p.country_code ?? '')}</span></span><span class="rk">${p.singles_rank ? `№${p.singles_rank}` : p.doubles_rank ? `пары №${p.doubles_rank}` : ''}</span></a>`).join('');
}

async function players(params, token) {
  const q = params.get('q') ?? '';
  view.innerHTML = `<input class="search" id="q" type="search" placeholder="Найти игрока: Медведев, Andreeva…" value="${esc(q)}" autocomplete="off">
    <div id="res"></div>`;
  const res = view.querySelector('#res');
  const input = view.querySelector('#q');
  async function load(text) {
    if (text.trim().length >= 2) {
      const d = await api(`/api/players?q=${encodeURIComponent(text)}&limit=30`);
      if (stale(token)) return;
      res.innerHTML = `<h2>Найдено</h2>${playerRows(d.players) || '<div class="empty">Никого не нашли</div>'}`;
      return;
    }
    const [ru, atp, wta] = await Promise.all([
      api('/api/players?russian=1&limit=12'), api('/api/players?tour=ATP&limit=10'), api('/api/players?tour=WTA&limit=10'),
    ]);
    if (stale(token)) return;
    res.innerHTML = `<h2>Наши</h2>${playerRows(ru.players)}<h2>Топ-10 ATP</h2>${playerRows(atp.players)}<h2>Топ-10 WTA</h2>${playerRows(wta.players)}`;
  }
  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => load(input.value).catch(() => {}), 250); });
  await load(q);
}

const age = (birth) => {
  if (!birth) return null;
  const b = new Date(`${birth}T00:00:00Z`);
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
};

async function player(id, token) {
  const [{ player: p }, { matches: list }] = await Promise.all([
    api(`/api/players/${encodeURIComponent(id)}`), api(`/api/players/${encodeURIComponent(id)}/matches`), loadMe(mskDay(0)),
  ]);
  if (stale(token)) return;
  const a = age(p.birth_date);
  view.innerHTML = `
    <div class="profile-head">${avatar(p.photo_url, '')}<div><h1>${esc(p.name_ru)}</h1>
      <div class="muted">${esc(p.name_latin ?? '')} · ${esc(p.tour)}${p.country_code ? ` · ${esc(p.country_code)}` : ''}${a != null ? ` · ${a} лет` : ''}</div>
      ${p.sportsru_url ? `<a href="${esc(p.sportsru_url)}" target="_blank" rel="noopener" class="small">sports.ru</a>` : ''}
      ${me ? (me.follows.includes(p.player_id) ? `<button class="follow on" type="button" data-follow="${esc(p.player_id)}" data-on="0">★ В моих игроках</button>` : `<button class="follow" type="button" data-follow="${esc(p.player_id)}">☆ Следить</button>`) : ''}</div></div>
    <div class="kv">
      <div><b>${p.singles_rank ?? '—'}</b><span>рейтинг</span></div>
      <div><b>${p.elo ? Math.round(p.elo) : '—'}</b><span>Эло</span></div>
      <div><b>${p.doubles_rank ?? '—'}</b><span>пары</span></div>
    </div>
    <h2>Матчи</h2>${list.length ? list.map(matchCard).join('') : '<div class="empty">Свежих матчей нет — история появится по мере игр</div>'}`;
  bindFanActions(view, () => player(id, token));
}

// ---------- profile ----------
const ACHIEVEMENTS = [
  ['🔥', 'Горячая серия', '5 верных прогнозов подряд'],
  ['👁', 'Охотник за сенсациями', 'Угадал 3 неожиданные победы'],
  ['👑', 'Король грунта', 'Лучший результат на грунтовых турнирах'],
  ['🎯', 'Снайпер', 'Угадал точный счёт 5 раз'],
  ['🛡', 'Против большинства', 'Выиграл 3 прогноза вопреки общему выбору'],
  ['🏅', 'Лучше эксперта', 'Обошёл ведущего по итогам турнира'],
];

// Same rules as src/game/levels.js, fed by /api/levels so both stay in sync.
function levelFor(levels, step, xp) {
  let i = 0;
  levels.forEach((l, k) => { if (xp >= l.from) i = k; });
  const lv = levels[i];
  const next = levels[i + 1];
  if (next) return { title: lv.title, subtitle: lv.subtitle, next_title: next.title, to_next: next.from - xp, progress: (xp - lv.from) / (next.from - lv.from) };
  const slams = 1 + Math.floor((xp - lv.from) / step);
  const nextAt = lv.from + slams * step;
  return { title: lv.title, subtitle: `Титулов Большого шлема: ${slams}`, next_title: `Легенда · ${slams + 1}-й шлем`, to_next: nextAt - xp, progress: (xp - (nextAt - step)) / step };
}

async function profile(token) {
  const [d] = await Promise.all([api('/api/levels?xp=0'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const max = d.levels[d.levels.length - 1].from + d.legend_step;
  view.innerHTML = `
    <div class="level" id="lvl"></div>
    <div class="muted small" style="margin:8px 2px">${me ? `Опыт: ${me.xp.toLocaleString('ru-RU')} XP · угадано ${me.guessed} из ${me.settled}${me.place ? ` · №${me.place} из ${me.fans}` : ''}. +10 XP за прогноз, +20 за верный.` : 'Голосуй «Кто выиграет?» в приложении в Telegram: +10 XP за прогноз, +20 за верный.'} Ползунок показывает, как растут уровни.</div>
    <h2>Достижения</h2>
    <div class="badges">${ACHIEVEMENTS.map(([i, t, s]) => `<div>${i}<b>${esc(t)}</b><small>${esc(s)}</small></div>`).join('')}</div>`;
  const box = view.querySelector('#lvl');
  function paint(xp) {
    const lv = levelFor(d.levels, d.legend_step, xp);
    box.innerHTML = `<div class="cap">Твой профиль</div><div class="title">${esc(lv.title)}</div><div class="sub">${esc(lv.subtitle)}</div>
      <div class="xp"><b>${xp.toLocaleString('ru-RU')} XP</b><span>До уровня «${esc(lv.next_title)}»: ${lv.to_next.toLocaleString('ru-RU')} XP</span></div>
      <div class="progress"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
      <input type="range" min="0" max="${max}" step="50" value="${xp}" aria-label="Опыт">
      <div class="muted small" style="margin-top:6px">Передвинь ползунок, чтобы посмотреть, как меняется уровень.</div>`;
    box.querySelector('input').addEventListener('input', (e) => paint(Number(e.target.value)));
  }
  paint(me?.xp ?? 0);
}

// ---------- router ----------
async function route() {
  clearInterval(timer);
  timer = null;
  routeToken += 1;
  const token = routeToken;
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  const tab = { '': 'home', matches: 'matches', match: 'matches', players: 'players', player: 'players', profile: 'profile' }[parts[0] ?? ''] ?? 'home';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const detail = parts[0] === 'match' || parts[0] === 'player';
  if (tg?.BackButton) { if (detail) tg.BackButton.show(); else tg.BackButton.hide(); }
  if (!view.innerHTML) view.innerHTML = '<div class="loading">Загружаем…</div>';
  try {
    if (parts[0] === 'match' && parts[1]) await match(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'player' && parts[1]) await player(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'matches') await matches(params, token);
    else if (parts[0] === 'players') await players(params, token);
    else if (parts[0] === 'profile') await profile(token);
    else await home(params, token);
  } catch (error) {
    if (stale(token)) return;
    view.innerHTML = `<div class="empty">Не получилось загрузить. Попробуй ещё раз чуть позже.<br><small>${esc(error.message)}</small></div>`;
  }
  if (!detail) window.scrollTo(0, 0);
}

tg?.BackButton?.onClick(() => history.back());
window.addEventListener('hashchange', route);
route();
