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

// Theme: as in Telegram (default), light or dark — picked in Настройки, kept on the phone.
const THEMES = [['auto', 'Как в Telegram'], ['light', 'Светлая'], ['dark', 'Тёмная']];
let themeMode = 'auto';
try { themeMode = localStorage.getItem('bolshe-theme') || 'auto'; } catch { /* storage may be blocked */ }
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  try {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (mode === 'auto') { tg?.setHeaderColor?.('bg_color'); tg?.setBackgroundColor?.('bg_color'); }
    else if (/^#[0-9a-f]{6}$/i.test(bg)) { tg?.setHeaderColor?.(bg); tg?.setBackgroundColor?.(bg); }
  } catch { /* older Telegram clients */ }
}
applyTheme(themeMode);

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
// (not while the no-spoilers switch is on). A tap opens the match on Winline with our promo code.
function oddsRow(m) {
  const o = m.odds;
  if (!o) return '';
  const done = DONE.includes(m.status) && showScore(m);
  const chip = (side, v) => `<span class="odd${done && m.winner === side ? ' won' : ''}">П${side} <b>${Number(v).toFixed(2)}</b></span>`;
  return `<span class="odds" data-wl="${esc(m.match_id)}" role="link" title="Открыть матч в Winline"><img src="${WINLINE_LOGO}" alt="Winline">${chip(1, o.p1)}${chip(2, o.p2)}</span>`;
}
function oddsBox(m) {
  const o = m.odds;
  if (!o) return '';
  const done = DONE.includes(m.status) && showScore(m);
  const cell = (side, p, v) => `<div class="o${done && m.winner === side ? ' won' : ''}"><span>${esc(p.name)}</span><b>${Number(v).toFixed(2)}</b></div>`;
  return `<div class="wlbox" data-wl="${esc(m.match_id)}" role="link" title="Открыть матч в Winline"><img src="${WINLINE_LOGO}" alt="Winline">${cell(1, m.p1, o.p1)}${cell(2, m.p2, o.p2)}</div>`;
}
// Odds sit inside links to our match page, so they take the tap first (capture phase).
function openExternal(url) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}
document.addEventListener('click', (event) => {
  const el = event.target.closest?.('[data-wl]');
  if (!el) return;
  event.preventDefault();
  event.stopPropagation();
  openExternal(`${location.origin}/go/winline?m=${encodeURIComponent(el.dataset.wl)}`);
}, true);

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
// After the match, a fact about the fan's own vote: "Ты был среди 14% болельщиков, которые верили в Ли".
function personalFact(m, v, pick) {
  if (!pick || !DONE.includes(m.status) || !m.winner || !showScore(m) || !v.total) return '';
  const share = Math.round((100 * (pick === 1 ? v.p1 : v.p2)) / v.total);
  const right = m.winner === pick;
  const name = lastName(pick === 1 ? m.p1 : m.p2);
  const bold = right && share < 35 ? ' Смелый прогноз — так думали немногие!' : '';
  const streak = right && me?.streak >= 3 ? ` Это ${me.streak}-й верный подряд.` : '';
  return `<div class="fact ${right ? 'ok' : 'no'}">${right ? '🎯 Угадал!' : 'Не сыграло.'} Ты был среди ${share}% болельщиков, которые верили в ${esc(name)}.${bold}${streak}</div>`;
}

// "Кто выиграет?": buttons until the match starts, then the fans' split.
function voteBlock(m) {
  const pick = me?.picks?.[m.match_id] ?? null;
  const v = m.votes ?? { p1: 0, p2: 0, total: 0 };
  if (m.status === 'scheduled') {
    if (!tg?.initData) return '<div class="vote"><div class="vote-cap">Кто выиграет?</div><div class="vote-note">Голосовать можно в приложении в Telegram</div></div>';
    const btn = (side, p) => `<button type="button" class="${pick === side ? 'on' : ''}" data-vote="${esc(m.match_id)}" data-pick="${side}">${esc(lastName(p))}</button>`;
    return `<div class="vote"><div class="vote-cap">Кто выиграет?${pick ? ' Голос принят — до начала можно передумать' : ''}</div>
      <div class="vote-btns">${btn(1, m.p1)}${btn(2, m.p2)}</div>${pick ? `<div class="vote-offer">${pickOffer(m, pick)}</div>` : ''}${pick && v.total ? splitBar(m, v) : ''}</div>`;
  }
  if (m.status === 'cancelled') return '';
  if (!v.total) return '<div class="vote"><div class="vote-note">Голосование закрылось с началом матча — голосов не было</div></div>';
  return `<div class="vote">${splitBar(m, v)}${personalFact(m, v, pick)}<div class="vote-note">Голосование закрылось с началом матча${pick ? `. Твой выбор: ${esc(lastName(pick === 1 ? m.p1 : m.p2))}` : ''}</div></div>`;
}
// ☆/★ to add a player to «Мои игроки» (inside Telegram only). Compact = a star alone.
function followButton(playerId, compact = false) {
  if (!me || !playerId) return '';
  const on = me.follows.includes(playerId);
  const label = compact ? (on ? '★' : '☆') : (on ? '★ В моих игроках' : '☆ Следить');
  return `<button class="follow${on ? ' on' : ''}${compact ? ' star' : ''}" type="button" data-follow="${esc(playerId)}"${on ? ' data-on="0"' : ''} title="${on ? 'Убрать из «Моих игроков»' : 'Добавить в «Мои игроки»'}">${label}</button>`;
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
let broadcastDay = null; // 'today' | 'tomorrow' picked by the user; null = by the clock
let minePlayersOpen = false; // «Мои игроки»: more than two rows shown

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
    // Two rows of three; the rest opens with a button.
    const more = cards.length - 6;
    return `<div class="seccap"><span>Мои игроки</span><a href="#/players">добавить</a></div><div class="mine${minePlayersOpen ? ' open' : ''}">${cards.map((p, i) => {
      const status = p.live ? `<span class="st live-st">LIVE ${showScore({ status: 'live' }) ? esc(p.live.score) : ''}</span>`
        : p.last && showScore({ status: 'finished' }) ? `<span class="st ${p.last.won ? 'win' : 'loss'}">${p.last.won ? 'Победа' : 'Поражение'} ${esc(p.last.score)}</span>`
          : '<span class="st idle">Не играет</span>';
      const line1 = p.live ? `с ${esc(lastName({ name: p.live.opponent }))}` : p.last ? `с ${esc(lastName({ name: p.last.opponent }))}` : 'матчей нет';
      const line2 = p.next ? `${esc(dayWord(p.next.start_at))} — ${esc(lastName({ name: p.next.opponent }))}` : '';
      return `<a class="pl-card${i >= 6 ? ' extra-pl' : ''}" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo, 'head')}<b>${esc(lastName({ name: p.name }))}</b>${status}<small>${line1}${line2 ? `<br>${line2}` : ''}</small></a>`;
    }).join('')}</div>
    ${more > 0 ? `<button class="more-btn" type="button" data-more-players>${minePlayersOpen ? 'Свернуть' : `Показать ещё ${more}`}</button>` : ''}`;
  }
  // Nobody followed yet: the best-ranked players of the day to pick from.
  const picks = (d.featured ?? []).slice(0, 6);
  if (!picks.length) return '';
  return `<div class="seccap"><span>Мои игроки</span></div>
    <div class="hint">Отметь игроков — здесь будут их матчи и результаты.</div>
    <div class="mine">${picks.map((p) => `<div class="pl-card">${avatar(p.photo, 'head')}<b>${esc(lastName(p))}</b>
      ${tg?.initData ? `<button class="follow" type="button" data-follow="${esc(p.player_id)}">☆ Следить</button>` : `<a class="small" href="#/player/${encodeURIComponent(p.player_id)}">открыть</a>`}</div>`).join('')}</div>`;
}

// "Кто выиграет?" with two buttons; once voted: the pick and the Winline offer for that player.
function rowVote(m) {
  const pick = me?.picks?.[m.match_id];
  if (!pick) {
    return `<span class="row-vote"><span class="rv-cap">Кто выиграет?</span>${[1, 2].map((s) => `<button type="button" data-vote="${esc(m.match_id)}" data-pick="${s}">${esc(lastName(s === 1 ? m.p1 : m.p2))}</button>`).join('')}</span>`;
  }
  return `<span class="row-picked">✓ Твой выбор: <b>${esc(lastName(pick === 1 ? m.p1 : m.p2))}</b></span>${pickOffer(m, pick)}`;
}

// The Winline price for the picked player: the win and the main games handicap ("фора −5,5 · 1.90").
function pickOffer(m, pick) {
  const o = m.odds;
  if (!o) return '';
  const price = pick === 1 ? o.p1 : o.p2;
  let hcap = '';
  if (o.hcap) {
    const value = pick === 1 ? o.hcap.p1 : -o.hcap.p1;
    const odd = pick === 1 ? o.hcap.o1 : o.hcap.o2;
    hcap = `<span class="odd">фора ${value > 0 ? '+' : value < 0 ? '−' : ''}${String(Math.abs(value)).replace('.', ',')} · <b>${Number(odd).toFixed(2)}</b></span>`;
  }
  return `<span class="odds offer" data-wl="${esc(m.match_id)}" role="link" title="Открыть матч в Winline"><img src="${WINLINE_LOGO}" alt="Winline"><span class="odd">победа · <b>${Number(price).toFixed(2)}</b></span>${hcap}</span>`;
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
  // Matches to come: the vote right in the list, the Winline price only after the vote.
  const extra = m ? (m.status === 'scheduled' && tg?.initData ? rowVote(m) : oddsRow(m)) : '';
  const href = m ? `#/match/${encodeURIComponent(m.match_id)}` : (b.vk_url ?? '#/');
  return `<a class="bline" href="${esc(href)}"${!m && b.vk_url ? ' target="_blank" rel="noopener"' : ''}><span class="t">${when}</span>${thumb}
    <span class="who">${w === 1 ? `<b>${esc(n1)}</b>` : esc(n1)} — ${w === 2 ? `<b>${esc(n2)}</b>` : esc(n2)}<small>${esc(small)}</small></span>
    <span class="sc">${esc(score)}</span>${extra ? `<span class="extra">${extra}</span>` : ''}</a>`;
}

// The day's «Больше» broadcasts as rows: Flashscore-linked matches and the rest of the schedule.
function broadcastRows(src) {
  const pairKey = (a, c) => [a, c].sort().join('|');
  const shown = new Set(src.bolshe.map((m) => pairKey(m.p1.player_id, m.p2.player_id)));
  return [
    ...src.bolshe.map((m) => ({ at: startOf(m), done: DONE.includes(m.status) || m.status === 'cancelled', m })),
    ...src.broadcasts.filter((b) => b.status !== 'cancelled' && !shown.has(pairKey(b.player1_id, b.player2_id)))
      .map((b) => ({ at: Date.parse(b.starts_at ?? '') || 0, done: (Date.parse(b.starts_at ?? '') || 0) < Date.now() - 2 * 3600e3, b })),
  ].sort((a, c) => a.at - c.at);
}

// Two buttons, «Сегодня» and «Завтра»: once today's broadcasts are over, tomorrow opens by itself.
function broadcastsBlock(src, day) {
  const switcher = `<div class="seccap"><span>Прямые трансляции «Больше»</span></div>
    <div class="days bday">${[['today', 'Сегодня'], ['tomorrow', 'Завтра']].map(([k, label]) => `<button class="day${k === day ? ' on' : ''}" type="button" data-bday="${k}">${label}</button>`).join('')}</div>`;
  const rows = broadcastRows(src);
  if (!rows.length) {
    return `${switcher}<div class="empty">${day === 'today' ? 'Сегодня эфиров нет' : 'График на завтра ещё не опубликован — обычно он появляется вечером'}</div>`;
  }
  const doneRows = rows.filter((r) => r.done);
  const hidden = day === 'today' && !earlyOpen && doneRows.length > 4 ? doneRows.slice(0, doneRows.length - 4) : [];
  // "Сейчас" sits before the first broadcast that is still ahead by the clock.
  const nowIndex = day === 'today' ? rows.findIndex((r) => r.at > Date.now() && !r.m?.status?.match(/live|finished|retired|walkover/)) : -1;
  const parts = [];
  if (hidden.length) {
    parts.push(`<button class="more-early" type="button" data-early>Ранние эфиры ${esc(localTime(new Date(hidden[0].at).toISOString()))}–${esc(localTime(new Date(hidden.at(-1).at).toISOString()))}: ещё ${hidden.length} →</button>`);
  }
  rows.forEach((r, i) => {
    if (i === nowIndex && i > 0) parts.push(`<div class="now"><span>Сейчас ${esc(localTime(new Date().toISOString()))}</span><i></i></div>`);
    parts.push(`<div class="brow${hidden.includes(r) ? ' early' : ''}">${broadcastRow(r)}</div>`);
  });
  return `${switcher}<div class="blist">${parts.join('')}</div>`;
}

// The fan's bracket of a tournament in one line: filled when, picks still alive, better than X%.
function bracketLine(key) {
  const b = me?.brackets?.find((x) => x.bracket_key === key);
  if (!b) return '<div class="bk-cta">🏆 Сетка турнира: угадай победителей до финала →</div>';
  const when = new Date(b.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const parts = [
    `живых прогнозов ${b.alive} из ${b.total}`,
    b.decided ? `угадано ${b.correct} из ${b.decided}` : null,
    b.better_than != null ? `лучше, чем у ${b.better_than}% участников` : 'ты среди первых участников',
  ].filter(Boolean);
  return `<div class="bk-done"><b>✓ Твоя сетка заполнена ${esc(when)}</b><span>${esc(parts.join(' · '))}</span></div>`;
}

function tournamentsBlock(d) {
  const tour = d.tournaments.filter((t) => t.level === 'tour');
  const challengers = d.tournaments.filter((t) => t.level === 'challenger').length;
  if (!tour.length && !challengers) return '';
  const card = (t) => `<a class="tour-card" href="${t.bracket_key ? `#/bracket/${encodeURIComponent(t.bracket_key)}` : '#/matches?level=tour'}">
    <div class="tt">${t.logo ? `<img class="t-logo" src="${esc(t.logo)}" alt="" loading="lazy" data-cover>` : ''}<b>${esc(`${t.tour ?? ''} ${tierNumber(t)}${t.name ?? ''}`.replace(/\s+/g, ' ').trim())}</b>${t.live ? `<span class="live"><span class="dot"></span>${t.live} ${plural(t.live, 'идёт', 'идут', 'идут')}</span>` : ''}</div>
    <div>${[SURFACE[t.surface], t.round].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
    ${t.bracket_key ? bracketLine(t.bracket_key) : ''}
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
  // The tour the fan watches more (first-start answer) goes first.
  const tourFirst = (list) => (me?.prefs?.tours && me.prefs.tours !== 'all'
    ? [...list].sort((a, c) => (c.tournament.tour === me.prefs.tours) - (a.tournament.tour === me.prefs.tours)) : list);
  const air = tourFirst(live.length ? live : coming.slice(0, 2));
  // First start inside Telegram: a few questions to make the app the fan's own.
  if (me && !me.prefs?.onboarded_at && !onboardingSkipped()) { location.hash = '#/welcome'; return; }
  const todayOver = broadcastRows(d).every((r) => r.done);
  const day = broadcastDay ?? (todayOver ? 'tomorrow' : 'today');
  const src = day === 'tomorrow' ? await api(`/api/bolshe?date=${mskDay(1)}`).catch(() => ({ bolshe: [], broadcasts: [] })) : d;
  if (stale(token)) return;
  view.innerHTML = `
    ${air.length ? `<div class="seccap"><span>${live.length ? 'Сейчас в эфире «Больше»' : 'Скоро в эфире «Больше»'}</span>${air.length > 1 ? `<span class="r">${air.length} ${plural(air.length, 'матч', 'матча', 'матчей')} ›</span>` : ''}</div>
      <div class="air-strip">${air.map(airCard).join('')}</div>` : ''}
    ${myPlayersBlock(d)}
    ${broadcastsBlock(src, day)}
    ${tournamentsBlock(d)}`;
  bindFanActions(view, () => home(params, token));
  view.querySelector('[data-early]')?.addEventListener('click', (e) => {
    earlyOpen = true;
    view.querySelectorAll('.brow.early').forEach((r) => r.classList.remove('early'));
    e.currentTarget.remove();
  });
  view.querySelectorAll('[data-bday]').forEach((b) => b.addEventListener('click', () => {
    broadcastDay = b.dataset.bday;
    home(params, token).catch(() => {});
  }));
  view.querySelector('[data-more-players]')?.addEventListener('click', () => {
    minePlayersOpen = !minePlayersOpen;
    home(params, token).catch(() => {});
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
    return p.player_id ? `<div><a class="pl" href="#/player/${encodeURIComponent(p.player_id)}">${inner}</a>${followButton(p.player_id, true)}</div>` : `<div class="pl">${inner}</div>`;
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
  return list.map((p) => `<a class="player-row" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo_url, '')}<span><b>${esc(p.name_ru)}</b><br><span class="muted small">${esc(p.tour)} · ${esc(p.country_code ?? '')}</span></span><span class="rk">${p.singles_rank ? `№${p.singles_rank}` : p.doubles_rank ? `пары №${p.doubles_rank}` : ''}</span>${followButton(p.player_id, true) || '<span></span>'}</a>`).join('');
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
      bindFanActions(res, reload);
      return;
    }
    await statsBoard(res, token, reload);
  }
  async function reload() {
    await loadMe(mskDay(0));
    await load(input.value);
  }
  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => load(input.value).catch(() => {}), 250); });
  await loadMe(mskDay(0));
  await load(q);
}

// ---------- statistics: round charts "из 10" and the sortable players list ----------
const fmtStat = (field, v) => (v == null ? '—' : field.fmt === 'pct' ? `${Math.round(v)}%` : field.fmt === 'int' ? String(Math.round(v)) : v.toFixed(1));
function donut(score, size = 64) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score ?? 0));
  const tone = score == null ? 'none' : v >= 7 ? 'hi' : v >= 4 ? 'mid' : 'lo';
  return `<svg class="donut ${tone}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" class="d-bg"></circle>
    <circle cx="32" cy="32" r="${r}" class="d-fg" stroke-dasharray="${((v / 10) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"></circle>
    <text x="32" y="37" text-anchor="middle">${score == null ? '—' : v.toFixed(1)}</text></svg>`;
}

let statsTour = 'ATP';
let statsSort = 'rank';
async function statsBoard(res, token, reload) {
  const ranked = statsSort === 'rank';
  const d = ranked ? await api(`/api/players?tour=${statsTour}&limit=100`) : await api(`/api/stats?tour=${statsTour}&sort=${encodeURIComponent(statsSort)}&limit=100`);
  const fields = d.fields ?? (await api(`/api/stats?tour=${statsTour}&limit=1`)).fields;
  if (stale(token)) return;
  const field = fields.find((f) => f.key === statsSort);
  const rows = ranked
    ? d.players.map((p, i) => `<a class="stat-row" href="#/player/${encodeURIComponent(p.player_id)}"><span class="pos">${p.singles_rank ?? i + 1}</span>${avatar(p.photo_url, 'ava')}
        <span class="nm"><b>${esc(p.name_ru)}</b><small class="muted">${p.elo ? `Эло ${Math.round(p.elo)}` : ''}</small></span><span></span>${followButton(p.player_id, true) || '<span></span>'}</a>`).join('')
    : d.players.map((p, i) => `<a class="stat-row" href="#/player/${encodeURIComponent(p.player_id)}"><span class="pos">${i + 1}</span>${avatar(p.photo, 'ava')}
        <span class="nm"><b>${esc(p.name)}</b><small class="muted">${p.rank ? `№${p.rank} · ` : ''}${p.wins}–${p.losses}</small></span>
        <span class="val"><b>${fmtStat(field, p.value)}</b>${donut(p.score, 34)}</span>${followButton(p.player_id, true) || '<span></span>'}</a>`).join('');
  res.innerHTML = `<div class="days">${['ATP', 'WTA'].map((t) => `<button class="day${t === statsTour ? ' on' : ''}" type="button" data-tour="${t}">${t}</button>`).join('')}</div>
    <label class="sort-row">Сортировать: <select data-sort>
      <option value="rank"${ranked ? ' selected' : ''}>Рейтинг</option>
      ${fields.map((f) => `<option value="${f.key}"${f.key === statsSort ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}
    </select></label>
    ${ranked ? '' : `<p class="muted small" style="margin:6px 2px 8px">${esc(field.label)} за последние 52 недели — игроки топ-${d.top} ${esc(statsTour)}, не меньше ${d.min_matches} матчей. Кружок — оценка из 10: место среди топ-200.</p>`}
    <div class="stat-list">${rows || '<div class="empty">Статистика собирается — загляни чуть позже</div>'}</div>`;
  res.querySelectorAll('[data-tour]').forEach((b) => b.addEventListener('click', () => { statsTour = b.dataset.tour; statsBoard(res, token, reload).catch(() => {}); }));
  res.querySelector('[data-sort]').addEventListener('change', (e) => { statsSort = e.target.value; statsBoard(res, token, reload).catch(() => {}); });
  bindFanActions(res, reload);
}

// The player's insights: the main numbers as round charts "из 10" (place among the tour) and
// every statistic with its value.
const INSIGHT_KEYS = ['serve_rating', 'return_rating', 'pressure_rating', 'aces_pm', 'bp_conv_pct', 'bp_saved_pct', 'win_pct'];
function insightsBlock(ins) {
  if (!ins) return '';
  if (!ins.metrics || ins.matches < ins.min_matches) {
    return `<h2>Инсайты</h2><div class="empty">Мало матчей со статистикой (${ins.matches ?? 0}) — инсайты появятся после ${ins.min_matches}-го.</div>`;
  }
  const byKey = new Map(ins.fields.map((f) => [f.key, f]));
  const cell = (label, score, value) => `<div class="ins">${donut(score)}<b>${esc(label)}</b><small>${esc(value)}</small></div>`;
  const cells = INSIGHT_KEYS.map((k) => cell(byKey.get(k).short, ins.scores[k], fmtStat(byKey.get(k), ins.metrics[k])));
  if (ins.elo_score != null) cells.push(cell('Эло', ins.elo_score, 'среди топ-300'));
  return `<h2>Инсайты</h2>
    <p class="muted small" style="margin:-4px 2px 10px">Из 10 — место среди игроков тура за 52 недели (${ins.matches} ${plural(ins.matches, 'матч', 'матча', 'матчей')} со статистикой): 10 — лучший.</p>
    <div class="ins-grid">${cells.join('')}</div>
    <h2>Вся статистика</h2>
    <div class="stat-all">${ins.fields.map((f) => `<div class="sa-row"><span>${esc(f.label)}</span><b>${fmtStat(f, ins.metrics[f.key])}</b>
      <i class="sa-bar"><i style="width:${Math.round((ins.scores[f.key] ?? 0) * 10)}%"></i></i></div>`).join('')}</div>`;
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
  const [{ player: p, insights }, { matches: list }] = await Promise.all([
    api(`/api/players/${encodeURIComponent(id)}`), api(`/api/players/${encodeURIComponent(id)}/matches`), loadMe(mskDay(0)),
  ]);
  if (stale(token)) return;
  const a = age(p.birth_date);
  view.innerHTML = `
    <div class="profile-head">${avatar(p.photo_url, '')}<div><h1>${esc(p.name_ru)}</h1>
      <div class="muted">${esc(p.name_latin ?? '')} · ${esc(p.tour)}${p.country_code ? ` · ${esc(p.country_code)}` : ''}${a != null ? ` · ${a} лет` : ''}</div>
      ${p.sportsru_url ? `<a href="${esc(p.sportsru_url)}" target="_blank" rel="noopener" class="small">sports.ru</a>` : ''}
      ${followButton(p.player_id)}</div></div>
    <div class="kv">
      <div><b>${p.singles_rank ?? '—'}</b><span>рейтинг</span></div>
      <div><b>${p.elo ? Math.round(p.elo) : '—'}</b><span>Эло</span></div>
      <div><b>${p.doubles_rank ?? '—'}</b><span>пары</span></div>
    </div>
    ${insightsBlock(insights)}
    <h2>Матчи</h2>${list.length ? list.map(matchCard).join('') : '<div class="empty">Свежих матчей нет — история появится по мере игр</div>'}`;
  bindFanActions(view, () => player(id, token));
}

// ---------- profile ----------
// One achievement: five levels (stars), a bar to the next level and what is left to do.
function achievementCard(a) {
  const stars = Array.from({ length: a.max_level }, (_, i) => `<i class="${i < a.level ? 'on' : ''}">★</i>`).join('');
  const goal = a.next
    ? `${a.value.toLocaleString('ru-RU')} из ${a.next.toLocaleString('ru-RU')} ${esc(a.unit)} — до ${a.level + 1}-го уровня ещё ${a.to_next.toLocaleString('ru-RU')}`
    : `Высший уровень: ${a.value.toLocaleString('ru-RU')} ${esc(a.unit)}`;
  return `<div class="ach${a.level ? '' : ' locked'}">
    <div class="ach-top"><span class="ach-ic">${a.icon}</span><div><b>${esc(a.title)}</b><small>${a.level ? `Уровень ${a.level} из ${a.max_level}` : 'Ещё не открыто'}</small></div></div>
    <div class="ach-stars">${stars}</div>
    <div class="ach-bar"><i style="width:${Math.round(a.progress * 100)}%"></i></div>
    <small class="ach-goal">${goal}</small>
    <small class="ach-about">${esc(a.about)}</small>
  </div>`;
}

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

// Profile: the greeting and the rating card (moved here from the home screen), achievements,
// and the ladder of levels.
async function profile(token) {
  const [d] = await Promise.all([api('/api/levels?xp=0'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const name = me?.user?.first_name || tg?.initDataUnsafe?.user?.first_name || '';
  const xp = me?.xp ?? 0;
  const surface = { hard: 'хард', clay: 'грунт', grass: 'трава', all: 'все покрытия' }[me?.prefs?.surface];
  view.innerHTML = `
    <div class="hello"><div class="hi">Привет${name ? `, ${esc(name)}` : ''}!</div>
      ${surface ? `<p>Любимое покрытие: ${esc(surface)}${me?.follows?.length ? ` · игроков в «Моих»: ${me.follows.length}` : ''}</p>` : ''}</div>
    ${ratingCard()}
    <div class="muted small" style="margin:8px 2px">+10 XP за прогноз, +20 за верный (вдвое, если угадал вопреки большинству), очки сеток турниров — тоже в опыт.</div>
    <h2>Достижения</h2>
    <div class="muted small" style="margin:-4px 2px 10px">У каждого достижения пять уровней — звёзды растут с каждым матчем.</div>
    <div class="achs">${(me?.achievements ?? d.achievements ?? []).map(achievementCard).join('')}</div>
    <h2>Уровни</h2>
    <div class="ladder">${d.levels.map((l) => `<div class="${xp >= l.from ? 'on' : ''}"><b>${esc(l.title)}</b><small>${esc(l.subtitle)}</small><span>${l.from.toLocaleString('ru-RU')} XP</span></div>`).join('')}</div>
    <a class="more-btn" href="#/settings" style="text-align:center">⚙️ Настройки</a>`;
}

// ---------- tournaments: the bracket game ----------
// Same rules as src/game/bracket.js: picks are "<round>:<match>" → draw position of the winner.
const ROUND_POINTS = [32, 16, 8, 4, 2];
const roundPoints = (draw, r) => ROUND_POINTS[draw.rounds.length - 1 - r] ?? 1;
const slotKey = (r, k) => `${r}:${k}`;
function drawSides(draw, picks) {
  const winnerOf = (r, k) => {
    const m = draw.rounds[r].matches[k];
    if (m?.w != null) return m.w;
    const p = picks[slotKey(r, k)];
    return p == null ? null : Number(p);
  };
  return draw.rounds.map((round, r) => round.matches.map((m, k) => [
    m.h ?? (r > 0 ? winnerOf(r - 1, 2 * k) : null),
    m.a ?? (r > 0 ? winnerOf(r - 1, 2 * k + 1) : null),
  ]));
}
// A changed pick drops later picks of a player who no longer gets there.
function cleanPicks(draw, picks) {
  const out = { ...picks };
  draw.rounds.forEach((round, r) => round.matches.forEach((m, k) => {
    const key = slotKey(r, k);
    if (out[key] == null) return;
    const [h, a] = drawSides(draw, out)[r][k];
    if (out[key] !== h && out[key] !== a) delete out[key];
  }));
  return out;
}
const openKeys = (draw) => draw.rounds.flatMap((round, r) => round.matches.map((m, k) => (m.w == null ? slotKey(r, k) : null))).filter(Boolean);

const RULES = 'Выбери победителя каждого оставшегося матча — до финала. Отправить сетку можно один раз: потом до конца турнира её не поменять. Очки дают матчи, которые начались после отправки: финал — 32, полуфинал — 16, четвертьфинал — 8, 1/8 — 4, 1/16 — 2, ранние круги — 1.';

async function tournamentsTab(token) {
  const [d] = await Promise.all([api('/api/brackets'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const open = d.brackets.filter((b) => b.status === 'open');
  const done = d.brackets.filter((b) => b.status !== 'open');
  const card = (b) => `<a class="tour-card" href="#/bracket/${encodeURIComponent(b.bracket_key)}">
    <div class="tt"><b>${esc(b.name)}</b><span class="muted small">${b.fans} ${plural(b.fans, 'участник', 'участника', 'участников')}</span></div>
    <div>${[SURFACE[b.surface], b.status === 'open' ? `идёт ${b.round ?? ''}` : 'завершён'].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
    ${b.mine ? `${bracketLine(b.bracket_key)}<div class="bk-mine"><b>${b.mine.points}</b> ${plural(b.mine.points, 'очко', 'очка', 'очков')}${b.status === 'open' ? ` · можно набрать до ${b.mine.possible}` : ''}</div>`
      : b.status === 'open' ? `<div class="bk-cta">Заполнить сетку → осталось ${b.open_matches} ${plural(b.open_matches, 'матч', 'матча', 'матчей')}</div>` : ''}
    ${b.champion ? `<div class="muted small">Чемпион: ${esc(b.champion)}</div>` : ''}
  </a>`;
  view.innerHTML = `<h1>Турниры</h1>
    <p class="muted small" style="margin:0 2px 12px">${esc(RULES)}</p>
    ${open.length ? `<div class="tours">${open.map(card).join('')}</div>` : '<div class="empty">Сейчас сеток нет — они появятся с началом основной сетки турнира</div>'}
    ${done.length ? `<h2>Завершённые</h2><div class="tours">${done.map(card).join('')}</div>` : ''}`;
}

const bracketDrafts = {};
function loadDraft(key) {
  if (bracketDrafts[key]) return bracketDrafts[key];
  try { bracketDrafts[key] = JSON.parse(localStorage.getItem(`bolshe-bracket-${key}`) || '{}'); } catch { bracketDrafts[key] = {}; }
  return bracketDrafts[key];
}
function saveDraft(key, picks) {
  bracketDrafts[key] = picks;
  try { localStorage.setItem(`bolshe-bracket-${key}`, JSON.stringify(picks)); } catch { /* ignore */ }
}
const bracketRound = {};

async function bracketScreen(key, token) {
  const [d] = await Promise.all([api(`/api/brackets/${encodeURIComponent(key)}`), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const draw = d.draw;
  const sent = d.entry;
  const editable = !sent && d.status === 'open' && Boolean(tg?.initData);
  const picks = sent ? sent.picks : cleanPicks(draw, loadDraft(key));
  const sides = drawSides(draw, picks);
  const open = openKeys(draw);
  const filled = open.filter((k) => picks[k] != null).length;
  const current = Math.max(0, draw.rounds.findIndex((round) => round.matches.some((m) => m.w == null)));
  const r = bracketRound[key] ?? current;
  const player = (pos) => draw.players.find((p) => p.pos === pos);
  const sideRow = (pos, m, k, other) => {
    const p = pos == null ? null : player(pos);
    const myPick = picks[slotKey(r, k)];
    const won = m.w != null && m.w === pos;
    const lost = m.w != null && pos != null && m.w !== pos;
    const picked = myPick != null && myPick === pos;
    const mark = picked && m.w != null ? (won ? '<span class="bk-ok">✓</span>' : '<span class="bk-no">✗</span>') : '';
    const name = p ? `${esc(lastName({ name: p.name_ru }))}${p.seed ? ` <small>(${esc(p.seed)})</small>` : p.tag ? ` <small>(${esc(p.tag)})</small>` : ''}` : `<span class="muted">${r > 0 ? 'победитель прошлого круга' : '—'}</span>`;
    const canPick = editable && m.w == null && pos != null && other !== undefined;
    return `<button class="bk-side${won ? ' won' : ''}${lost ? ' lost' : ''}${picked ? ' picked' : ''}" type="button"${canPick ? ` data-pick="${slotKey(r, k)}" data-pos="${pos}"` : ' disabled'}>
      ${p ? avatar(p.photo, 'ava') : '<span class="ava ph"></span>'}<span class="bk-name">${name}</span>${p?.rank ? `<small class="muted">№${p.rank}</small>` : ''}${mark}</button>`;
  };
  const round = draw.rounds[r];
  const status = !tg?.initData && !sent
    ? '<div class="bk-note">Заполнять сетку можно в приложении в Telegram.</div>'
    : sent
      ? `<div class="bk-note"><b>Твоя сетка отправлена</b> ${esc(new Date(sent.submitted_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}.
        Очки: <b>${sent.points}</b> · угадано ${sent.correct} из ${sent.decided}${d.status === 'open' ? ` · ещё можно набрать до ${sent.possible}` : ''}${d.place ? ` · место ${d.place} из ${d.table.length}` : ''}</div>`
      : d.status === 'open' ? `<div class="bk-note">${esc(RULES)}</div>` : '<div class="bk-note">Турнир завершён.</div>';
  view.innerHTML = `<h1>${esc(d.name)}</h1>
    <div class="muted small" style="margin:-2px 2px 10px">Сетка · ${esc(SURFACE[d.surface] ?? '')}${d.status === 'open' ? ` · идёт ${esc(draw.rounds[current].title)}` : ' · турнир завершён'}</div>
    ${status}
    <div class="days bk-rounds">${draw.rounds.map((x, i) => `<button class="day${i === r ? ' on' : ''}" type="button" data-round="${i}">${esc(x.short)} <small>+${roundPoints(draw, i)}</small></button>`).join('')}</div>
    <div class="bk-list">${round.matches.map((m, k) => {
      const [h, a] = sides[r][k];
      const when = m.w != null ? '' : m.status === 'live' ? '<span class="live">● идёт</span>' : m.start ? esc(`${dayWord(m.start)} ${localTime(m.start)}`) : '';
      return `<div class="bk-match"><div class="bk-meta"><span>${esc(round.title)} · матч ${k + 1}</span><span>${when}</span></div>${sideRow(h, m, k, a)}${sideRow(a, m, k, h)}</div>`;
    }).join('')}</div>
    ${editable ? `<div class="bk-send"><button type="button" data-send${filled < open.length ? ' disabled' : ''}>${filled < open.length ? `Заполнено ${filled} из ${open.length}` : 'Отправить сетку'}</button></div>` : ''}
    ${d.table.length ? `<h2>Таблица</h2><div class="bk-table">${d.table.slice(0, 20).map((t) => `<div class="bk-row${t.me ? ' me' : ''}"><span>${t.place}</span><span>${esc(t.name)}${t.me ? ' (ты)' : ''}</span><b>${t.points}</b></div>`).join('')}</div>` : ''}`;
  view.querySelectorAll('[data-round]').forEach((b) => b.addEventListener('click', () => {
    bracketRound[key] = Number(b.dataset.round);
    bracketScreen(key, token).catch(() => {});
  }));
  view.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    saveDraft(key, cleanPicks(draw, { ...picks, [b.dataset.pick]: Number(b.dataset.pos) }));
    tg?.HapticFeedback?.selectionChanged?.();
    bracketScreen(key, token).catch(() => {});
  }));
  view.querySelector('[data-send]')?.addEventListener('click', async (e) => {
    const go = () => post(`/api/brackets/${encodeURIComponent(key)}`, { picks: cleanPicks(draw, loadDraft(key)) })
      .then(() => { toast('Сетка отправлена'); return bracketScreen(key, token); })
      .catch((error) => toast(error.message));
    e.currentTarget.disabled = true;
    const text = 'Отправить сетку? После отправки её нельзя будет поменять до конца турнира.';
    if (tg?.showConfirm) tg.showConfirm(text, (yes) => (yes ? go() : bracketScreen(key, token)));
    else if (window.confirm(text)) go();
    else e.currentTarget.disabled = false;
  });
}

// ---------- first start: a few questions that make the app the fan's own ----------
function onboardingSkipped() {
  try { return localStorage.getItem('bolshe-onboarded') === '1'; } catch { return false; }
}

async function welcome(token) {
  if (!tg?.initData) { location.hash = '#/'; return; }
  const [atp, wta] = await Promise.all([api('/api/players?tour=ATP&limit=12'), api('/api/players?tour=WTA&limit=12'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const state = { players: new Set(me?.follows ?? []), surface: me?.prefs?.surface ?? null, tours: me?.prefs?.tours ?? null, since: me?.prefs?.since ?? null };
  const opt = (k, v, label) => `<button class="day${state[k] === v ? ' on' : ''}" type="button" data-opt="${k}" data-val="${v}">${label}</button>`;
  view.innerHTML = `<h1>Давай знакомиться 👋</h1>
    <p class="muted" style="margin:0 2px 8px">Пара вопросов — и приложение подстроится под тебя: твои игроки, твои матчи. Всё можно поменять потом.</p>
    <h2>За кого болеешь?</h2>
    <div class="pick-grid">${[...atp.players, ...wta.players].filter((p) => p.singles_rank).map((p) => `<button type="button" class="pick-pl${state.players.has(p.player_id) ? ' on' : ''}" data-pl="${esc(p.player_id)}">
      ${avatar(p.photo_url, 'head')}<b>${esc(lastName({ name: p.name_ru }))}</b><small>${esc(p.tour)} · №${p.singles_rank}</small></button>`).join('')}</div>
    <p class="muted small" style="margin:6px 2px">Других игроков найдёшь во вкладке «Игроки» — отметь звёздочкой.</p>
    <h2>Любимое покрытие</h2><div class="days wrap">${opt('surface', 'hard', 'Хард')}${opt('surface', 'clay', 'Грунт')}${opt('surface', 'grass', 'Трава')}${opt('surface', 'all', 'Все')}</div>
    <h2>Что смотришь чаще?</h2><div class="days wrap">${opt('tours', 'ATP', 'Мужчин')}${opt('tours', 'WTA', 'Женщин')}${opt('tours', 'all', 'И тех, и других')}</div>
    <h2>Давно смотришь теннис?</h2><div class="days wrap">${opt('since', 'new', 'Только начинаю')}${opt('since', '2-5', '2–5 лет')}${opt('since', '5-10', '5–10 лет')}${opt('since', '10+', 'Больше 10 лет')}</div>
    <div class="bk-send"><button type="button" data-done>Готово</button></div>
    <button class="more-btn" type="button" data-skip>Пропустить</button>`;
  view.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.pl;
    if (state.players.has(id)) state.players.delete(id); else state.players.add(id);
    b.classList.toggle('on', state.players.has(id));
    tg?.HapticFeedback?.selectionChanged?.();
  }));
  view.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
    state[b.dataset.opt] = b.dataset.val;
    view.querySelectorAll(`[data-opt="${b.dataset.opt}"]`).forEach((x) => x.classList.toggle('on', x === b));
  }));
  const finish = async (skip) => {
    try { localStorage.setItem('bolshe-onboarded', '1'); } catch { /* ignore */ }
    try {
      const fresh = [...state.players].filter((id) => !(me?.follows ?? []).includes(id));
      if (!skip && fresh.length) await post('/api/follows', { player_ids: fresh, on: true });
      await post('/api/prefs', skip ? { onboarded: true } : { surface: state.surface, tours: state.tours, since: state.since, onboarded: true });
    } catch (error) {
      toast(error.message);
    }
    location.hash = '#/';
  };
  view.querySelector('[data-done]').addEventListener('click', () => finish(false));
  view.querySelector('[data-skip]').addEventListener('click', () => finish(true));
}

// A «Больше» broadcast opened from the app counts for «Эфиры через приложение».
document.addEventListener('click', (event) => {
  const a = event.target.closest?.('a[href*="vk.com/video"], a[href*="vkvideo.ru/video"]');
  if (!a || !tg?.initData) return;
  const ref = a.getAttribute('href').match(/video(-?\d+_\d+)/)?.[1];
  if (ref) fetch('/api/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ kind: 'vk', ref }) }).catch(() => {});
}, true);

// ---------- settings ----------
async function settings(token) {
  await loadMe(mskDay(0));
  if (token && stale(token)) return;
  view.innerHTML = `<h1>Настройки</h1>
    <h2>Тема</h2>
    <div class="days">${THEMES.map(([k, label]) => `<button class="day${themeMode === k ? ' on' : ''}" type="button" data-theme-pick="${k}">${label}</button>`).join('')}</div>
    <h2>Без спойлеров</h2>
    <label class="switch-row"><input type="checkbox" id="noSpoilersBox"${noSpoilers ? ' checked' : ''}> Скрывать счёт и победителей</label>
    ${me ? `<h2>Мои результаты</h2>
    <label class="switch-row"><input type="checkbox" id="publicBox"${me.prefs?.public === false ? '' : ' checked'}> Показывать моё имя в таблицах</label>
    <p class="muted small">Если выключить, в таблицах ты будешь «Болельщик ####» — прогнозы и очки считаются как обычно.</p>
    <a class="more-btn" href="#/welcome" style="text-align:center">Ответить на вопросы о себе заново</a>` : ''}
    <p class="muted small">Время матчей и эфиров показывается по часовому поясу телефона (${esc(tzLabel())}).</p>`;
  view.querySelector('#publicBox')?.addEventListener('change', (e) => {
    post('/api/prefs', { public: e.target.checked }).then(() => toast(e.target.checked ? 'Имя видно в таблицах' : 'Имя скрыто')).catch((error) => toast(error.message));
  });
  view.querySelectorAll('[data-theme-pick]').forEach((b) => b.addEventListener('click', () => {
    themeMode = b.dataset.themePick;
    try { localStorage.setItem('bolshe-theme', themeMode); } catch { /* ignore */ }
    applyTheme(themeMode);
    settings();
  }));
  view.querySelector('#noSpoilersBox').addEventListener('change', (e) => {
    noSpoilers = e.target.checked;
    try { localStorage.setItem('bolshe-no-spoilers', noSpoilers ? '1' : '0'); } catch { /* ignore */ }
    paintSpoiler();
  });
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
  const tab = {
    '': 'home', matches: 'matches', match: 'matches', tournaments: 'tournaments', bracket: 'tournaments',
    players: 'players', player: 'players', profile: 'profile', settings: 'profile',
  }[parts[0] ?? ''] ?? 'home';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const detail = ['match', 'player', 'settings', 'bracket'].includes(parts[0]);
  if (tg?.BackButton) { if (detail) tg.BackButton.show(); else tg.BackButton.hide(); }
  if (!view.innerHTML) view.innerHTML = '<div class="loading">Загружаем…</div>';
  try {
    if (parts[0] === 'match' && parts[1]) await match(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'player' && parts[1]) await player(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'matches') await matches(params, token);
    else if (parts[0] === 'players') await players(params, token);
    else if (parts[0] === 'profile') await profile(token);
    else if (parts[0] === 'settings') await settings(token);
    else if (parts[0] === 'welcome') await welcome(token);
    else if (parts[0] === 'tournaments') await tournamentsTab(token);
    else if (parts[0] === 'bracket' && parts[1]) await bracketScreen(decodeURIComponent(parts[1]), token);
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
