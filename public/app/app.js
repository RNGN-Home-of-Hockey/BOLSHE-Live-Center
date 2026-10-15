// «Больше! Теннис» Telegram Mini App: one small router, no framework, no patch layers.
// Screens: home (#/), matches of a day (#/matches), match card (#/match/<id>), «Вопрос дня»
// (#/question), tournaments (#/tournaments) and a bracket (#/bracket/<key>), players (#/players),
// player (#/player/<id>), profile with levels (#/profile), settings (#/settings), first start (#/welcome).
// Look of 2026-10-15: the generated mockups — dark night, purple smoke, lime spray (app.css).

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
const dayMonth = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const SURFACE = { hard: 'хард', clay: 'грунт', grass: 'трава', carpet: 'ковёр' };
const STATUS = { finished: 'Завершён', retired: 'Отказ', walkover: 'Неявка', cancelled: 'Отменён', postponed: 'Перенесён', interrupted: 'Прерван' };
const DONE = ['finished', 'retired', 'walkover'];
const BOT_LINK = 'https://t.me/bolshe_live_center_bot';
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.3 4-7 8-7s7.2 2.7 8 7"/></svg>',
};
const BALL = '<svg class="ball" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#d7f23a"/><path d="M15 21c17 13 23 41 6 63M85 21C68 34 62 62 79 84" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/></svg>';
const LOGO_MARK = '<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#d7f23a"/><path d="M15 11.5 26.5 20 15 28.5" fill="none" stroke="#15111c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Theme: the brand dark one by default; light, or as Telegram (light/dark of the client) in Настройки.
const THEMES = [['dark', 'Тёмная'], ['light', 'Светлая'], ['auto', 'Как в Telegram']];
let themeMode = 'dark';
try { themeMode = localStorage.getItem('bolshe-theme') || 'dark'; } catch { /* storage may be blocked */ }
function applyTheme(mode) {
  const root = document.documentElement;
  const scheme = mode === 'auto'
    ? (tg?.colorScheme ?? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))
    : mode;
  root.dataset.theme = scheme === 'light' ? 'light' : 'dark';
  try {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (/^#[0-9a-f]{6}$/i.test(bg)) { tg?.setHeaderColor?.(bg); tg?.setBackgroundColor?.(bg); tg?.setBottomBarColor?.(bg); }
  } catch { /* older Telegram clients */ }
}
applyTheme(themeMode);
tg?.onEvent?.('themeChanged', () => { if (themeMode === 'auto') applyTheme('auto'); });

let noSpoilers = false;
try { noSpoilers = localStorage.getItem('bolshe-no-spoilers') === '1'; } catch { /* storage may be blocked */ }
const spoilerBtn = document.getElementById('spoilerToggle');
function paintSpoiler() {
  spoilerBtn.setAttribute('aria-pressed', String(noSpoilers));
  spoilerBtn.innerHTML = noSpoilers ? ICON.eyeOff : ICON.eye;
  spoilerBtn.title = noSpoilers ? 'Без спойлеров: счёт скрыт' : 'Без спойлеров';
}
spoilerBtn.addEventListener('click', () => {
  noSpoilers = !noSpoilers;
  try { localStorage.setItem('bolshe-no-spoilers', noSpoilers ? '1' : '0'); } catch { /* ignore */ }
  paintSpoiler();
  toast(noSpoilers ? 'Счёт и победители скрыты' : 'Счёт снова виден');
  route();
});
paintSpoiler();

// The fan's own Telegram picture (or the first letter) in the header and the profile.
function meAvatarInner() {
  const u = tg?.initDataUnsafe?.user;
  const letter = Array.from(String(u?.first_name ?? '').trim())[0];
  return u?.photo_url ? `<img src="${esc(u.photo_url)}" alt="" referrerpolicy="no-referrer">` : letter ? esc(letter.toUpperCase()) : ICON.user;
}
const meAvatar = (cls = 'me-ava') => `<span class="${cls}">${meAvatarInner()}</span>`;
document.getElementById('meAva').innerHTML = meAvatarInner();

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
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// "Сегодня, 15 октября" for a Moscow date.
function dateTitle(date) {
  const word = { [mskDay(-1)]: 'Вчера', [mskDay(0)]: 'Сегодня', [mskDay(1)]: 'Завтра' }[date]
    ?? cap(new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short' }));
  return `${word}, ${dayMonth(date)}`;
}

// "ATP 1000", "Большой шлем", "Челленджер" from the tier the Worker gives.
const TIER = { slam: 'Большой шлем', finals: 'Итоговый турнир', challenger: 'Челленджер', itf: 'ITF' };
function tierLabel(t) {
  if (['1000', '500', '250'].includes(String(t?.tier))) return `${t.tour ?? ''} ${t.tier}`.trim();
  return TIER[t?.tier] ?? t?.tour ?? '';
}
const tourTitle = (t) => [tierLabel(t), t?.name].filter(Boolean).join(' · ');

// ---------- links out: Winline, VK ----------
const WINLINE_LOGO = '/app/winline.png';
function openExternal(url) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}
// A «Больше» broadcast opened from the app counts for «Эфиры через приложение».
function trackVk(url) {
  const ref = String(url ?? '').match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+_\d+)/)?.[1];
  if (!ref || !tg?.initData) return;
  fetch('/api/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ kind: 'vk', ref }) }).catch(() => {});
}
// Odds and «Смотреть» sit inside links to our match page, so they take the tap first (capture phase).
document.addEventListener('click', (event) => {
  const wl = event.target.closest?.('[data-wl]');
  const ext = event.target.closest?.('[data-ext]');
  if (!wl && !ext) return;
  event.preventDefault();
  event.stopPropagation();
  if (wl) openExternal(`${location.origin}/go/winline?m=${encodeURIComponent(wl.dataset.wl)}`);
  else { trackVk(ext.dataset.ext); openExternal(ext.dataset.ext); }
}, true);

// "П1 2.90 · П2 1.41" with the small logo; after the match the winner's price is marked
// (not while the no-spoilers switch is on). A tap opens the match on Winline with our promo code.
function oddsRow(m) {
  const o = m.odds;
  if (!o) return '';
  const done = DONE.includes(m.status) && showScore(m);
  const chip = (side, v) => `<span class="odd${done && m.winner === side ? ' won' : ''}">П${side} <b>${Number(v).toFixed(2)}</b></span>`;
  return `<span class="odds" data-wl="${esc(m.match_id)}" role="link" title="Открыть матч в Winline"><img src="${WINLINE_LOGO}" alt="Winline">${chip(1, o.p1)}${chip(2, o.p2)}</span>`;
}
// The dark Winline bar of the match page.
function wlBar(m) {
  const o = m.odds;
  if (!o) return '';
  const done = DONE.includes(m.status) && showScore(m);
  const cell = (side, v) => `<span class="o${done && m.winner === side ? ' won' : ''}">П${side} <b>${Number(v).toFixed(2)}</b></span>`;
  return `<div class="wlbar" data-wl="${esc(m.match_id)}" role="link" title="Открыть матч в Winline"><img src="${WINLINE_LOGO}" alt="Winline">${cell(1, o.p1)}${cell(2, o.p2)}<span class="go">${ICON.arrow}</span></div>`;
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
// ▶ Смотреть на Больше! →
function watchCta(url, label = 'Смотреть на Больше!', ghost = false) {
  return url ? `<button class="cta${ghost ? ' ghost' : ''}" type="button" data-ext="${esc(url)}"><span class="ic">${ICON.play}</span>${esc(label)}<span class="go">${ICON.arrow}</span></button>` : '';
}
function share(text) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(BOT_LINK)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (navigator.share) navigator.share({ text, url: BOT_LINK }).catch(() => {});
  else window.open(url, '_blank', 'noopener');
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
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

const showScore = (m) => !noSpoilers || m.status === 'scheduled';
const lastName = (p) => {
  const name = String(p?.name ?? p?.short ?? '');
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 && !/\.$/.test(parts[parts.length - 1]) ? parts.slice(1).join(' ') : parts[0];
};

function splitBar(m, v) {
  const p1 = Math.round((v.p1 / v.total) * 100);
  return `<div class="split-lbl"><span>Голоса болельщиков</span><span>${v.total} ${plural(v.total, 'голос', 'голоса', 'голосов')}</span></div>
    <div class="split"><i style="width:${p1}%"></i><i style="width:${100 - p1}%"></i></div>
    <div class="split-pc"><span>${p1}% ${esc(lastName(m.p1))}</span><span>${esc(lastName(m.p2))} ${100 - p1}%</span></div>`;
}
// After the match, a fact about the fan's own vote: "Ты среди 14% болельщиков, которые верили в Ли".
function personalFact(m, v, pick) {
  if (!pick || !DONE.includes(m.status) || !m.winner || !showScore(m) || !v.total) return '';
  const share = Math.round((100 * (pick === 1 ? v.p1 : v.p2)) / v.total);
  const right = m.winner === pick;
  const name = lastName(pick === 1 ? m.p1 : m.p2);
  const bold = right && share < 35 ? ' Смелый прогноз — так думали немногие!' : '';
  const streak = right && me?.streak >= 3 ? ` Это ${me.streak}-й верный подряд.` : '';
  return `<div class="fact ${right ? 'ok' : 'no'}">${right ? '🎯 Прогноз сыграл!' : 'Прогноз не сыграл.'} Ты среди ${share}% болельщиков, которые верили в ${esc(name)}.${bold}${streak}</div>`;
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
      toast('Голос принят · +10 XP');
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

// ---------- match cards (lists) ----------
function setCells(m, side, curCls = 'cur') {
  const sets = m.sets ?? [];
  return sets.map((s, i) => {
    const games = side === 1 ? s.p1 : s.p2;
    const tb = side === 1 ? s.tb1 : s.tb2;
    const cur = m.status === 'live' && i === sets.length - 1;
    const won = !cur && games != null && games > (side === 1 ? s.p2 : s.p1);
    const cls = cur ? curCls : won ? 'win' : '';
    return `<b${cls ? ` class="${cls}"` : ''}>${games ?? ''}${tb != null && games === 6 && (s.p1 === 7 || s.p2 === 7) ? `<sup>${tb}</sup>` : ''}</b>`;
  }).join('');
}

function matchRow(m, side) {
  const p = side === 1 ? m.p1 : m.p2;
  const done = DONE.includes(m.status) && m.winner && showScore(m);
  const cls = done ? (m.winner === side ? ' won' : ' lost') : '';
  const score = m.status === 'scheduled' || !showScore(m) ? '' : `<span class="mc-sets">${setCells(m, side)}</span>`;
  return `<div class="mc-row${cls}">${avatar(p.photo)}<span class="mc-name">${esc(p.short ?? p.name)}${p.rank ? `<small>${p.rank}</small>` : ''}</span>${score}</div>`;
}

function matchCard(m) {
  const t = m.tournament;
  const top = m.status === 'live' ? '<span class="pill-live">LIVE</span>'
    : m.status === 'scheduled' ? `<span class="mc-time">${esc(localTime(m.start_at))}</span>` : `<span>${esc(STATUS[m.status] ?? '')}</span>`;
  const label = [tourTitle(t), t.discipline && t.discipline !== 'singles' ? 'пары' : null, m.status === 'live' && m.live_set ? `${m.live_set}-й сет` : null].filter(Boolean).join(' · ');
  const hidden = noSpoilers && m.status !== 'scheduled' ? '<div class="hidden-score">Счёт скрыт</div>' : '';
  const watch = m.bolshe?.vk_url && m.status !== 'cancelled'
    ? `<span class="mc-watch" data-ext="${esc(m.bolshe.vk_url)}" role="link"><i>${ICON.play}</i>${m.status === 'live' ? 'Смотреть' : DONE.includes(m.status) ? 'Запись эфира' : 'Эфир «Больше»'}</span>` : '';
  const foot = watch || m.odds ? `<div class="mc-foot">${watch}${oddsRow(m)}</div>` : '';
  return `<a class="mcard" href="#/match/${encodeURIComponent(m.match_id)}">
    <div class="mc-top">${top}<span class="t">${esc(label)}</span>${m.bolshe ? '<span class="badge">Больше</span>' : ''}</div>
    ${matchRow(m, 1)}${matchRow(m, 2)}${hidden}${foot}</a>`;
}

// ---------- home: the broadcast on air → my players → «Вопрос дня» → «Больше» broadcasts → tournaments ----------
// A «Больше» broadcast keeps the time of the schedule (the time on the cover), not the moment
// the match really began.
const startOf = (m) => Date.parse(m.bolshe?.starts_at ?? '') || Date.parse(m.start_at ?? '') || 0;
const startIso = (m) => new Date(startOf(m)).toISOString();
let earlyOpen = false; // «Ранние эфиры» opened once stay open on refresh
let broadcastDay = null; // 'today' | 'tomorrow' picked by the user; null = by the clock
let minePlayersOpen = false; // «Мои игроки»: more than two rows shown

function faces(p1, p2) {
  return `<div class="faces">${avatar(p1?.photo, 'head')}<span class="vs-mark">VS</span>${avatar(p2?.photo, 'head')}</div>`;
}
// Picture of a broadcast: our stored VK cover over both players' heads (the heads show when
// there is no cover or it fails to load).
function heroMedia(cover, p1, p2, href) {
  const inner = `${faces(p1, p2)}${cover ? `<img class="cover-img" src="${esc(cover)}" alt="" loading="lazy" data-cover>` : ''}`;
  const cls = `ha-media${cover ? ' has-cover' : ''}`;
  return href ? `<a class="${cls}" href="${href}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
}

// The big card of a «Больше» broadcast: from a Flashscore match (m) or, before the match is
// linked, from the schedule row (b).
function heroCard({ m, b }) {
  if (!m) {
    const p1 = { photo: b.player1_photo, name: b.player1_name ?? b.player1_ru };
    const p2 = { photo: b.player2_photo, name: b.player2_name ?? b.player2_ru };
    const sub = [b.round, b.commentator1 ? `комментирует ${[b.commentator1, b.commentator2].filter(Boolean).join(' и ')}` : null].filter(Boolean).join(' · ');
    return `<div class="hero-air">${heroMedia(b.cover, p1, p2, null)}
      <div class="ha-body">
        <div class="ha-meta"><span class="ha-time">${esc(cap(dayWord(b.starts_at)))} ${esc(localTime(b.starts_at))}</span><span>${esc(b.tournament ?? '')}</span></div>
        <div class="ha-names">${esc(lastName(p1))} — ${esc(lastName(p2))}</div>
        ${sub ? `<div class="ha-sub">${esc(sub)}</div>` : ''}
        ${watchCta(b.vk_url)}
      </div></div>`;
  }
  const live = m.status === 'live';
  const href = `#/match/${encodeURIComponent(m.match_id)}`;
  const meta = live ? '<span class="pill-live">LIVE</span>'
    : m.status === 'scheduled' ? `<span class="ha-time">${esc(cap(dayWord(startIso(m))))} ${esc(localTime(startIso(m)))}</span>`
      : `<span class="ha-time">${esc(STATUS[m.status] ?? '')}</span>`;
  const sub = [m.bolshe?.round, m.bolshe?.commentator1 ? `комментирует ${[m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).join(' и ')}` : null].filter(Boolean).join(' · ');
  const set = (m.sets ?? []).at(-1);
  const score = m.status !== 'scheduled' && showScore(m)
    ? `<div class="ha-score"><span class="big">${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}</span><span class="sets">${live && set ? `<span>${m.live_set ?? m.sets.length}-й сет · ${set.p1 ?? 0}:${set.p2 ?? 0}</span>` : ''}<span>${esc((m.sets ?? []).map((s) => `${s.p1}:${s.p2}`).join('  '))}</span></span></div>`
    : '';
  return `<div class="hero-air">${heroMedia(m.bolshe?.cover, m.p1, m.p2, href)}
    <div class="ha-body">
      <div class="ha-meta">${meta}<span>${esc(tourTitle(m.tournament))}</span></div>
      <a class="ha-names" href="${href}">${esc(lastName(m.p1))} — ${esc(lastName(m.p2))}</a>
      ${sub ? `<div class="ha-sub">${esc(sub)}</div>` : ''}
      ${score}
      ${watchCta(m.bolshe?.vk_url, DONE.includes(m.status) ? 'Запись эфира на VK' : 'Смотреть на Больше!')}
      ${m.status === 'scheduled' ? voteBlock(m) : ''}
    </div></div>`;
}

function myPlayersBlock(d) {
  const cards = me?.my_players ?? [];
  if (cards.length) {
    // Two rows of three; the rest opens with a button.
    const more = cards.length - 6;
    return `<div class="sec-title"><span>Твои игроки</span><a href="#/players">Все →</a></div><div class="mine${minePlayersOpen ? ' open' : ''}">${cards.map((p, i) => {
      const status = p.live ? `<span class="st live-st">LIVE${showScore({ status: 'live' }) ? ` ${esc(p.live.score)}` : ''}</span>`
        : p.next ? `<small><b style="font-size:12px">${esc(cap(dayWord(p.next.start_at)))} ${esc(localTime(p.next.start_at))}</b></small>`
          : p.last && showScore({ status: 'finished' }) ? `<span class="st ${p.last.won ? 'win' : 'loss'}">${p.last.won ? 'Победа' : 'Поражение'} ${esc(p.last.score)}</span>`
            : '<span class="st idle">Не играет</span>';
      const opp = p.live ?? p.next ?? p.last;
      return `<a class="pl-card${p.live ? ' is-live' : ''}${i >= 6 ? ' extra-pl' : ''}" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo, 'head')}<b>${esc(lastName({ name: p.name }))}</b>${status}
        <small>${opp ? `с ${esc(lastName({ name: opp.opponent }))}` : 'матчей нет'}</small></a>`;
    }).join('')}</div>
    ${more > 0 ? `<button class="more-btn" type="button" data-more-players>${minePlayersOpen ? 'Свернуть' : `Показать ещё ${more}`}</button>` : ''}`;
  }
  // Nobody followed yet: the best-ranked players of the day to pick from.
  const picks = (d.featured ?? []).slice(0, 6);
  if (!picks.length) return '';
  return `<div class="sec-title"><span>Твои игроки</span></div>
    <div class="hint">Отметь игроков — здесь будут их матчи и результаты.</div>
    <div class="mine">${picks.map((p) => `<div class="pl-card">${avatar(p.photo, 'head')}<b>${esc(lastName(p))}</b>
      ${tg?.initData ? `<button class="follow" type="button" data-follow="${esc(p.player_id)}">☆ Следить</button>` : `<a class="small" href="#/player/${encodeURIComponent(p.player_id)}">открыть</a>`}</div>`).join('')}</div>`;
}

function questionCard(q) {
  if (!q) return '';
  const answer = q.answer != null ? ` · ответ: ${q.answer === 0 ? 'да' : 'нет'}` : '';
  return `<a class="qcard" href="#/question"><div class="cap">Вопрос дня</div><div class="text">${esc(q.question)}</div>
    <div class="mine-ans">${esc(q.tournament)}${answer}</div><span class="go">${ICON.arrow}</span></a>`;
}

// "Кто выиграет?" with two buttons; once voted: the pick and the Winline offer for that player.
function rowVote(m) {
  const pick = me?.picks?.[m.match_id];
  if (!pick) {
    return `<span class="row-vote"><span class="rv-cap">Кто выиграет?</span>${[1, 2].map((s) => `<button type="button" data-vote="${esc(m.match_id)}" data-pick="${s}">${esc(lastName(s === 1 ? m.p1 : m.p2))}</button>`).join('')}</span>`;
  }
  return `<span class="row-picked">✓ Твой выбор: <b>${esc(lastName(pick === 1 ? m.p1 : m.p2))}</b></span>${pickOffer(m, pick)}`;
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
  const when = m?.status === 'live' ? '<span class="pill-live">LIVE</span>' : esc(localTime(m ? startIso(m) : b.starts_at));
  const score = m && m.status !== 'scheduled' && showScore(m) ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '';
  const small = [m ? m.tournament.name : b.tournament, (m ? m.bolshe?.commentator1 : b.commentator1)].filter(Boolean).join(' · ');
  // Matches to come: the vote right in the list, the Winline price only after the vote.
  const extra = m ? (m.status === 'scheduled' && tg?.initData ? rowVote(m) : oddsRow(m)) : '';
  const href = m ? `#/match/${encodeURIComponent(m.match_id)}` : null;
  const open = href ? `<a class="bline" href="${href}">` : `<div class="bline"${b.vk_url ? ` data-ext="${esc(b.vk_url)}" role="link"` : ''}>`;
  return `${open}<span class="t">${when}</span>${thumb}
    <span class="who">${w === 1 ? `<b>${esc(n1)}</b>` : esc(n1)} — ${w === 2 ? `<b>${esc(n2)}</b>` : esc(n2)}<small>${esc(small)}</small></span>
    <span class="sc">${esc(score)}</span>${extra ? `<span class="extra">${extra}</span>` : ''}${href ? '</a>' : '</div>'}`;
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

function broadcastsBlock(rows, day) {
  const title = `<div class="sec-title"><span>Эфиры «Больше»</span><span class="r">${day === 'today' ? 'сегодня' : 'завтра'}</span></div>`;
  if (!rows.length) {
    return `${title}<div class="empty">${day === 'today' ? 'Сегодня эфиров нет' : 'График на завтра ещё не опубликован — обычно он появляется вечером'}</div>`;
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
  return `${title}<div class="blist">${parts.join('')}</div>`;
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

// "2 — 15 октября" from the first match of the draw to the final.
function datesLabel(fromIso, toIso) {
  if (!fromIso) return '';
  const a = new Date(fromIso);
  const b = toIso ? new Date(toIso) : null;
  const dm = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (!b || b < a) return `с ${dm(a)}`;
  return a.getMonth() === b.getMonth() ? `${a.getDate()} — ${dm(b)}` : `${dm(a)} — ${dm(b)}`;
}

// A big tournament poster: "ATP 1000", the city in capitals, dates · surface, the logo,
// buttons Сетка / Матчи / Игроки.
function tourPoster({ tour, tier, city, info, logo, inner = '', key = null }) {
  const q = encodeURIComponent(city);
  return `<div class="tcard${tour === 'WTA' ? ' wta' : ''}">${logo ? `<img class="tc-logo" src="${esc(logo)}" alt="" loading="lazy" data-cover>` : ''}
    <div class="tc-tier">${esc(tierLabel({ tier, tour }))}</div><div class="tc-city">${esc(city)}</div>${info ? `<div class="tc-dates">${esc(info)}</div>` : ''}
    ${inner}
    <div class="tc-btns">${key ? `<a class="main" href="#/bracket/${encodeURIComponent(key)}">Сетка</a>` : ''}<a href="#/matches?f=${esc(tour ?? 'all')}&t=${q}">Матчи</a>${key ? `<a href="#/bracket/${encodeURIComponent(key)}?view=players">Игроки</a>` : ''}</div>
  </div>`;
}

function tournamentsBlock(d) {
  const tour = d.tournaments.filter((t) => t.level === 'tour');
  const challengers = d.tournaments.filter((t) => t.level === 'challenger').length;
  if (!tour.length && !challengers) return '';
  const card = (t) => tourPoster({
    tour: t.tour, tier: t.tier, city: t.name, logo: t.logo, key: t.bracket_key,
    info: [SURFACE[t.surface], t.round, t.live ? `идёт ${t.live} ${plural(t.live, 'матч', 'матча', 'матчей')}` : null].filter(Boolean).join(' · '),
    inner: `${t.bracket_key ? bracketLine(t.bracket_key) : ''}
      ${t.upcoming?.length ? `<div class="ahead">Главные матчи впереди</div>
        ${t.upcoming.map((m) => `<div class="up"><span class="t">${esc(dayWord(m.start_at))}<br>${esc(localTime(m.start_at))}</span>
          <span class="who">${esc(lastName(m.p1))}${m.p1.rank ? ` (№${m.p1.rank})` : ''} — ${esc(lastName(m.p2))}${m.p2.rank ? ` (№${m.p2.rank})` : ''}${oddsRow(m)}</span></div>`).join('')}` : ''}`,
  });
  return `<div class="sec-title"><span>Турниры</span><a href="#/tournaments">Все →</a></div><div class="tours">${tour.map(card).join('')}
    ${challengers ? `<a class="tc-slim" href="#/matches?f=challenger">Ещё ${challengers} ${plural(challengers, 'челленджер', 'челленджера', 'челленджеров')} →</a>` : ''}</div>`;
}

async function home(params, token) {
  const date = mskDay(0);
  const [d] = await Promise.all([api(`/api/home?date=${date}`), loadMe(date)]);
  if (stale(token)) return;
  // First start inside Telegram: a few questions to make the app the fan's own.
  if (me && !me.prefs?.onboarded_at && !onboardingSkipped()) { location.hash = '#/welcome'; return; }
  const todayOver = broadcastRows(d).every((r) => r.done);
  const day = broadcastDay ?? (todayOver ? 'tomorrow' : 'today');
  const src = day === 'tomorrow' ? await api(`/api/bolshe?date=${mskDay(1)}`).catch(() => ({ bolshe: [], broadcasts: [] })) : d;
  if (stale(token)) return;
  const rows = broadcastRows(src);
  // The tour the fan watches more (first-start answer) goes first.
  const tourOf = (r) => r.m?.tournament.tour ?? (String(r.b?.tournament ?? '').match(/^(ATP|WTA)/)?.[1] ?? null);
  const favourite = me?.prefs?.tours && me.prefs.tours !== 'all' ? me.prefs.tours : null;
  const live = rows.filter((r) => r.m?.status === 'live').sort((a, c) => (favourite ? (tourOf(c) === favourite) - (tourOf(a) === favourite) : 0));
  const next = rows.find((r) => !r.done && r.m?.status !== 'live');
  const heroes = live.length ? live.slice(0, 3) : next ? [next] : [];
  view.innerHTML = `
    <div class="chips top-days">${[['today', 'Сегодня'], ['tomorrow', 'Завтра']].map(([k, label]) => `<button class="chip${k === day ? ' on' : ''}" type="button" data-bday="${k}">${label}</button>`).join('')}</div>
    ${heroes.length ? `<div class="air-strip">${heroes.map(heroCard).join('')}</div>` : ''}
    ${myPlayersBlock(d)}
    ${d.question ? `<div style="margin-top:16px">${questionCard(d.question)}</div>` : ''}
    ${broadcastsBlock(rows, day)}
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

// ---------- «Вопрос дня» ----------
function questionBody(q) {
  const showBars = q.pick != null || !q.open;
  const pct = (i) => (q.total ? Math.round((100 * q.counts[i]) / q.total) : 0);
  const canVote = q.open && Boolean(tg?.initData);
  const opts = q.options.map((label, i) => {
    const cls = `${q.pick === i ? ' picked' : ''}${q.answer === i ? ' right' : ''}`;
    return `<button type="button" class="q-opt${cls}"${canVote ? ` data-q="${i}"` : ' disabled'}>${showBars ? `<i style="width:${pct(i)}%"></i>` : ''}
      <span>${q.answer === i ? '✓ ' : ''}${esc(label)}</span>${showBars ? `<b>${pct(i)}%</b>` : ''}</button>`;
  }).join('');
  const city = String(q.tournament).replace(/^(ATP|WTA)\s+/, '');
  let note = '';
  if (q.answer != null && q.pick != null && q.pick < 2) {
    note = q.pick === q.answer
      ? `🎯 Угадано! +30 XP. Ты среди ${pct(q.answer)}% болельщиков, которые ответили верно.`
      : `Не угадано — так ответили ${pct(q.pick)}%. Завтра новый вопрос.`;
  } else if (q.answer != null) {
    note = `Ответ: «${q.options[q.answer]}». Верно ответили ${pct(q.answer)}% болельщиков.`;
  } else if (q.open && q.pick != null) {
    note = 'Ответ можно поменять до конца дня. Засчитаем, когда всё решится на корте: +10 XP за «Да» или «Нет», ещё +20 — если угадаешь.';
  } else if (q.open) {
    note = tg?.initData ? '+10 XP за «Да» или «Нет», ещё +20 — если угадаешь. «Затрудняюсь» — просто голос.' : 'Отвечать можно в приложении в Telegram.';
  } else {
    note = 'Голосование закрыто — ждём, чем закончится на корте.';
  }
  return `<div class="q-text">${esc(q.question)}</div>
    <div class="q-art"><span class="wm">${esc(city)}</span>${avatar(q.player.photo, 'head')}<span class="who">${esc(q.tournament)}${q.player.rank ? ` · №${q.player.rank}` : ''}</span></div>
    <div class="q-opts">${opts}</div>
    <div class="q-meta">${q.total.toLocaleString('ru-RU')} ${plural(q.total, 'голос', 'голоса', 'голосов')} · ${esc(note)}</div>`;
}

function pastQuestion(q) {
  const pct = (i) => (q.total ? Math.round((100 * q.counts[i]) / q.total) : 0);
  const mine = q.pick != null ? ` · твой ответ: «${q.options[q.pick]}»${q.answer != null && q.pick < 2 ? (q.pick === q.answer ? ` ✓ (угадали ${pct(q.answer)}%)` : ' ✗') : ''}` : '';
  return `<div class="item"><b>${esc(q.question)}</b><small>${esc(shortDate(q.day))} · ${esc(q.tournament)} · ${q.answer == null ? 'ждём ответа' : `ответ: «${q.options[q.answer]}»`}${esc(mine)}</small></div>`;
}

async function questionScreen(token) {
  const d = await api('/api/question');
  if (stale(token)) return;
  const q = d.today;
  view.innerHTML = `<div class="page-head"><h1>Вопрос дня</h1></div>
    ${q ? questionBody(q) : '<div class="empty">Сегодня вопроса нет — он появляется, когда идут турниры с сетками.</div>'}
    ${d.past.length ? `<h2>Прошлые вопросы</h2><div class="q-past">${d.past.map(pastQuestion).join('')}</div>` : ''}`;
  view.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', async () => {
    view.querySelectorAll('[data-q]').forEach((x) => { x.disabled = true; });
    try {
      await post('/api/question', { pick: Number(b.dataset.q) });
      tg?.HapticFeedback?.selectionChanged?.();
      toast(Number(b.dataset.q) < 2 ? 'Ответ принят · +10 XP' : 'Голос принят');
    } catch (error) {
      toast(error.message);
    }
    questionScreen(token).catch(() => {});
  }));
}

// ---------- matches ----------
const MATCH_FILTERS = [['all', 'Все'], ['live', 'В эфире'], ['ATP', 'ATP'], ['WTA', 'WTA'], ['challenger', 'Челленджеры'], ['itf', 'ITF']];

async function matches(params, token) {
  const date = params.get('date') ?? mskDay(0);
  const f = params.get('f') ?? ({ challenger: 'challenger', itf: 'itf' }[params.get('level')] ?? 'all');
  const only = params.get('t') ?? '';
  let list;
  if (f === 'live') {
    const [a, c] = await Promise.all([api(`/api/matches?date=${date}&level=tour`), api(`/api/matches?date=${date}&level=challenger`)]);
    list = [...a.matches, ...c.matches].filter((m) => m.status === 'live');
  } else {
    const level = f === 'challenger' || f === 'itf' ? f : 'tour';
    list = (await api(`/api/matches?date=${date}&level=${level}${f === 'ATP' || f === 'WTA' ? `&tour=${f}` : ''}`)).matches;
  }
  if (stale(token)) return;
  if (only) list = list.filter((m) => m.tournament.name === only);
  // Live first, then what is still to come by the clock, then the finished ones (latest first);
  // singles before doubles.
  const group = (m) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2);
  list.sort((a, c) => group(a) - group(c) || (a.is_doubles - c.is_doubles)
    || (group(a) === 2 ? Date.parse(c.start_at) - Date.parse(a.start_at) : Date.parse(a.start_at) - Date.parse(c.start_at)));
  const link = (over) => {
    const p = new URLSearchParams({ date, f, ...(only ? { t: only } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `#/matches?${p}`;
  };
  const shift = (n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
  view.innerHTML = `<div class="page-head"><h1>Матчи</h1>
      <label class="icon-btn cal" title="Выбрать день">${ICON.cal}<input type="date" data-pick min="${mskDay(-7)}" max="${mskDay(7)}" value="${esc(date)}" aria-label="Выбрать день"></label></div>
    <div class="chips">${MATCH_FILTERS.map(([k, label]) => `<a class="chip${k === f ? ' on' : ''}" href="${link({ f: k })}">${label}</a>`).join('')}</div>
    ${only ? `<div class="chips" style="margin-top:8px"><a class="chip on" href="${link({ t: '' })}">${esc(only)} ✕</a></div>` : ''}
    <div class="date-row">${date > mskDay(-7) ? `<a class="icon-btn" href="${link({ date: shift(-1) })}" aria-label="День назад">${ICON.prev}</a>` : '<span></span>'}
      <b>${esc(dateTitle(date))}</b>${date < mskDay(7) ? `<a class="icon-btn" href="${link({ date: shift(1) })}" aria-label="День вперёд">${ICON.next}</a>` : '<span></span>'}</div>
    ${list.map(matchCard).join('')
      || `<div class="empty">${f === 'live' ? 'Сейчас в эфире ничего нет' : date > mskDay(1) ? 'Расписание на этот день ещё не опубликовано — обычно оно появляется накануне' : 'В этот день матчей нет'}</div>`}`;
  const pick = view.querySelector('[data-pick]');
  pick?.addEventListener('change', () => { if (pick.value) location.hash = link({ date: pick.value }); });
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
  return `<div class="hero compare">
    <div class="cmp-head"><span>${esc(lastName(m.p1))}</span><span></span><span>${esc(lastName(m.p2))}</span></div>
    ${rows}${bar}
    ${pv.facts?.length ? `<ul class="facts">${pv.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>`;
}

// The score table: names, set by set (current set in lime, sets won in white).
function scoreCard(m) {
  const hide = !showScore(m) && m.status !== 'scheduled';
  const done = DONE.includes(m.status) && m.winner && showScore(m);
  const row = (side) => {
    const p = side === 1 ? m.p1 : m.p2;
    const cls = done ? (m.winner === side ? ' won' : ' lost') : '';
    const sets = m.status === 'scheduled' || hide ? '' : `<span class="sc-sets">${setCells(m, side)}</span>`;
    return `<div class="sc-row${cls}"><span class="sc-name">${done && m.winner === side ? '✓ ' : ''}${esc(p.short ?? p.name)}${p.rank ? `<small>№${p.rank}</small>` : ''}</span>${sets}</div>`;
  };
  const foot = m.status === 'live' ? `<span class="live">LIVE</span>${m.live_set ? ` · ${m.live_set}-й сет` : ''}`
    : m.status === 'scheduled' ? `Начало ${esc(dayWord(m.start_at))} в ${esc(localTime(m.start_at))} (${esc(tzLabel())})`
      : esc(STATUS[m.status] ?? '');
  return `<div class="score-card">${row(1)}${row(2)}<div class="sc-foot">${hide ? 'Счёт скрыт — выключи «без спойлеров» вверху' : foot}</div></div>`;
}

// Прогнозы after the match: what the fans thought, the result, the fan's XP and a share button.
function resultsPane(m) {
  const v = m.votes ?? { p1: 0, p2: 0, total: 0 };
  const pick = me?.picks?.[m.match_id] ?? null;
  if (m.status === 'scheduled' || !DONE.includes(m.status) || !m.winner || !showScore(m)) {
    return `<div class="score-card">${voteBlock(m)}</div>`;
  }
  if (!v.total) return '<div class="empty">На этот матч прогнозов не было</div>';
  const pc1 = Math.round((100 * v.p1) / v.total);
  const fav = v.p1 === v.p2 ? null : v.p1 > v.p2 ? 1 : 2;
  const bar = (side, pc) => `<div class="res-bar${pick === side ? ' picked' : ''}"><div class="lbl"><span>${esc(lastName(side === 1 ? m.p1 : m.p2))}${pick === side ? ' · твой выбор' : ''}</span><b>${pc}%</b></div><div class="track"><i style="width:${pc}%"></i></div></div>`;
  const right = pick && pick === m.winner;
  const share = pick ? Math.round((100 * (pick === 1 ? v.p1 : v.p2)) / v.total) : 0;
  const bonus = right ? (v.total >= 10 && share < 35 ? 40 : 20) : 0;
  const winner = lastName(m.winner === 1 ? m.p1 : m.p2);
  const xp = !pick ? ''
    : right ? `<div class="xp-card">${BALL}<b>+${bonus} XP</b><span>Верный прогноз!${me?.streak >= 3 ? ` Серия: ${me.streak} подряд 🔥` : ''}</span></div>`
      : '<div class="xp-card miss"><b>+10 XP</b><span>За прогноз. В этот раз не сыграло — следующий матч твой.</span></div>';
  const fact = pick ? `<div class="res-fact">${LOGO_MARK}<span>${right
    ? `Ты среди ${share}% болельщиков, которые угадали исход.${share < 35 ? ' Смелый прогноз — так думали немногие!' : ''}`
    : `Ты среди ${share}% болельщиков, которые верили в ${esc(lastName(pick === 1 ? m.p1 : m.p2))}.`}</span></div>` : '';
  const shareBtn = right
    ? `<button class="cta" type="button" data-share="${esc(`Мой прогноз сыграл: ${lastName(m.p1)} — ${lastName(m.p2)}, победа ${winner}. Так думали ${share}% болельщиков. Прогнозы на теннис — в «Больше! Теннис»`)}"><span class="ic">${ICON.share}</span>Поделиться<span class="go">${ICON.arrow}</span></button>`
    : '';
  return `<div class="score-card"><div class="res-title">${fav ? `Большинство верило в победу ${esc(lastName(fav === 1 ? m.p1 : m.p2))}` : 'Мнения болельщиков разделились поровну'}</div>
      <div class="res-bars">${bar(1, pc1)}${bar(2, 100 - pc1)}</div><div class="q-meta" style="margin:10px 0 0">${v.total} ${plural(v.total, 'голос', 'голоса', 'голосов')}</div></div>
    ${scoreCard(m)}${xp}${fact}${shareBtn}`;
}

const matchPane = {}; // the tab picked on a match stays on refresh

async function match(id, token) {
  const [d] = await Promise.all([api(`/api/matches/${encodeURIComponent(id)}`), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const m = d.match;
  const t = m.tournament;
  const pick = me?.picks?.[m.match_id] ?? null;
  const panes = [['score', 'Счёт'], ['stats', 'Статистика'], ['votes', 'Прогнозы'], ...(m.bolshe ? [['video', 'Видео']] : [])];
  const pane = matchPane[id] ?? (DONE.includes(m.status) && pick && showScore(m) ? 'votes' : 'score');
  const name = (p, right) => {
    const inner = `${esc(lastName(p))}${p.rank ? `<sup>№${p.rank}</sup>` : ''}`;
    const len = lastName(p).length;
    return `<div class="mh-p${right ? ' r' : ''}${len > 11 ? ' s3' : len > 7 ? ' s2' : ''}">${p.player_id ? `<a href="#/player/${encodeURIComponent(p.player_id)}">${inner}</a>` : inner}<br>${followButton(p.player_id, true)}</div>`;
  };
  const lastBlock = (p, list) => (list.length ? `<h2>${esc(p.short ?? p.name)}: последние матчи</h2><div class="hero list">${list.map((x) => resultLine(x, p.fs_id)).join('')}</div>` : '');
  const stats = [
    compareBlock(m, d.preview),
    d.meetings.length ? `<h2>Личные встречи</h2><div class="hero list">${d.meetings.map((x) => resultLine(x, m.p1.fs_id)).join('')}</div>` : '',
    noSpoilers ? '' : lastBlock(m.p1, d.last.p1) + lastBlock(m.p2, d.last.p2),
  ].join('');
  const vk = m.bolshe?.vk_url;
  view.innerHTML = `
    <div class="mhero">${heroMedia(m.bolshe?.cover, m.p1, m.p2, null)}
      <div class="mh-body"><div class="mh-names">${name(m.p1, false)}${name(m.p2, true)}</div>
        <div class="mh-meta">${esc([tourTitle(t), m.bolshe?.round, SURFACE[t.surface], t.discipline && t.discipline !== 'singles' ? 'пары' : null].filter(Boolean).join(' · '))}</div></div></div>
    <div class="seg">${panes.map(([k, label]) => `<button type="button" data-pane="${k}" class="${k === pane ? 'on' : ''}">${label}</button>`).join('')}</div>
    <div class="pane" data-p="score"${pane === 'score' ? '' : ' hidden'}>
      ${scoreCard(m)}
      ${vk && m.status !== 'cancelled' ? watchCta(vk, DONE.includes(m.status) ? 'Запись эфира на VK' : 'Смотреть на Больше!', DONE.includes(m.status)) : ''}
      ${wlBar(m)}
      ${m.status === 'scheduled' ? `<div class="score-card">${voteBlock(m)}</div>` : ''}
    </div>
    <div class="pane" data-p="stats"${pane === 'stats' ? '' : ' hidden'}>${stats || '<div class="empty">Статистики по этому матчу пока нет</div>'}</div>
    <div class="pane" data-p="votes"${pane === 'votes' ? '' : ' hidden'}>${resultsPane(m)}</div>
    ${m.bolshe ? `<div class="pane" data-p="video"${pane === 'video' ? '' : ' hidden'}>
      ${m.bolshe.cover ? `<div class="cover"><img class="cover-img" src="${esc(m.bolshe.cover)}" alt="" loading="lazy" data-cover></div>` : ''}
      <div class="score-card"><b>Трансляция «Больше»</b><div class="muted small" style="margin-top:4px">${esc([m.bolshe.title, m.bolshe.round].filter(Boolean).join(' · '))}${m.bolshe.commentator1 ? `<br>Комментирует ${esc([m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).join(' и '))}` : ''}</div></div>
      ${vk ? watchCta(vk, DONE.includes(m.status) ? 'Смотреть запись на VK' : 'Смотреть на Больше!') : '<div class="empty">Ссылка на эфир появится ближе к началу</div>'}
    </div>` : ''}`;
  view.querySelectorAll('[data-pane]').forEach((b) => b.addEventListener('click', () => {
    matchPane[id] = b.dataset.pane;
    view.querySelectorAll('[data-pane]').forEach((x) => x.classList.toggle('on', x === b));
    view.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.pane; });
  }));
  view.querySelector('[data-share]')?.addEventListener('click', (e) => share(e.currentTarget.dataset.share));
  bindFanActions(view, () => match(id, token));
  if (m.status === 'live' || m.status === 'scheduled') refreshEvery(30000, () => match(id, token));
}

// ---------- players ----------
function playerRows(list) {
  return list.map((p) => `<a class="player-row" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo_url, '')}<span><b>${esc(p.name_ru)}</b><br><span class="muted small">${esc(p.tour)} · ${esc(p.country_code ?? '')}</span></span><span class="rk">${p.singles_rank ? `№${p.singles_rank}` : p.doubles_rank ? `пары №${p.doubles_rank}` : ''}</span>${followButton(p.player_id, true) || '<span></span>'}</a>`).join('');
}

let playersMode = null; // 'mine' | 'all' picked by the user

// «Мои игроки»: the row of heads (+ to add more), their next and live matches, last results.
function minePlayersBody() {
  const list = me?.my_players ?? [];
  const strip = `<div class="mine-strip"><a href="#/players?all=1"><span class="add">+</span><span class="nm">Добавить</span></a>${list.map((p) => `<a class="${p.live ? 'is-live' : ''}" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo, 'head')}<span class="nm">${esc(lastName({ name: p.name }))}</span></a>`).join('')}</div>`;
  if (!list.length) return `${strip}<div class="empty">Пока никого. Нажми «+» и отметь игроков звёздочкой — здесь появятся их матчи.</div>`;
  const ahead = list.flatMap((p) => (p.live ? [{ p, m: p.live, live: true, at: 0 }] : p.next ? [{ p, m: p.next, live: false, at: Date.parse(p.next.start_at) }] : []))
    .sort((a, c) => a.at - c.at);
  const row = ({ p, m, live }) => `<a class="up-row" href="#/match/${encodeURIComponent(m.match_id)}">${avatar(p.photo)}<span><b>${esc(lastName({ name: p.name }))}</b><small>с ${esc(lastName({ name: m.opponent }))} · ${esc(m.tournament ?? '')}</small></span>
    <span class="when">${live ? `<span class="pill-live">LIVE</span>${showScore({ status: 'live' }) ? `<small>${esc(m.score)}</small>` : ''}` : `${esc(cap(dayWord(m.start_at)))}<small>${esc(localTime(m.start_at))}</small>`}</span></a>`;
  const results = list.filter((p) => p.last).sort((a, c) => Date.parse(c.last.start_at) - Date.parse(a.last.start_at));
  return `${strip}
    <div class="sec-title"><span>Ближайшие матчи</span></div>
    ${ahead.length ? `<div class="up-list">${ahead.map(row).join('')}</div>` : '<div class="empty">Ближайших матчей нет</div>'}
    ${results.length && !noSpoilers ? `<div class="sec-title"><span>Последние результаты</span></div><div class="up-list">${results.map((p) => `<a class="up-row" href="#/match/${encodeURIComponent(p.last.match_id)}">${avatar(p.photo)}<span><b>${esc(lastName({ name: p.name }))}</b><small>с ${esc(lastName({ name: p.last.opponent }))} · ${esc(p.last.tournament ?? '')}</small></span>
      <span class="when"><span class="st ${p.last.won ? 'win' : 'loss'}">${p.last.won ? 'Победа' : 'Поражение'}</span><small>${esc(p.last.score)}</small></span></a>`).join('')}</div>` : ''}`;
}

async function players(params, token) {
  await loadMe(mskDay(0));
  if (stale(token)) return;
  const q = params.get('q') ?? '';
  const mode = !me ? 'all' : params.get('all') === '1' || q ? 'all' : playersMode ?? (me.follows.length ? 'mine' : 'all');
  view.innerHTML = `<div class="page-head"><h1>Игроки</h1></div>
    ${me ? `<div class="seg2"><button type="button" data-mode="mine" class="${mode === 'mine' ? 'on' : ''}">Мои игроки</button><button type="button" data-mode="all" class="${mode === 'all' ? 'on' : ''}">Все игроки</button></div>` : ''}
    ${mode === 'mine' ? minePlayersBody() : `<input class="search" id="q" type="search" placeholder="Найти игрока: Медведев, Andreeva…" value="${esc(q)}" autocomplete="off"><div id="res"></div>`}`;
  view.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    playersMode = b.dataset.mode;
    const target = playersMode === 'all' ? '#/players?all=1' : '#/players';
    if (location.hash === target) players(new URLSearchParams(), token).catch(() => {});
    else location.hash = target;
  }));
  if (mode === 'mine') return;
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
  if (params.get('all') === '1' && !q) input.focus({ preventScroll: true });
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
  res.innerHTML = `<div class="chips" style="margin-top:12px">${['ATP', 'WTA'].map((t) => `<button class="chip${t === statsTour ? ' on' : ''}" type="button" data-tour="${t}">${t}</button>`).join('')}</div>
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
    <div class="p-head">${avatar(p.photo_url, 'head')}<div><h1>${esc(p.name_ru)}</h1>
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
// One achievement: icon, five levels (stars), a bar to the next level; a tap opens the details.
function achievementCard(a) {
  const stars = Array.from({ length: a.max_level }, (_, i) => `<i class="${i < a.level ? 'on' : ''}">★</i>`).join('');
  const goal = a.next ? `${a.value.toLocaleString('ru-RU')} из ${a.next.toLocaleString('ru-RU')} ${a.unit}` : `Высший уровень · ${a.value.toLocaleString('ru-RU')} ${a.unit}`;
  return `<button type="button" class="ach${a.level ? '' : ' locked'}" data-ach>
    <span class="ach-ic">${a.icon}</span><b>${esc(a.title)}</b><span class="ach-stars">${stars}</span>
    <span class="ach-bar"><i style="width:${Math.round(a.progress * 100)}%"></i></span><small>${esc(goal)}</small>
    <small class="more">${esc(a.about)}${a.next ? ` До ${a.level + 1}-го уровня ещё ${a.to_next.toLocaleString('ru-RU')}.` : ''}</small></button>`;
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

// Profile: the fan, the level card, accuracy · predictions · streak, achievements, the ladder.
async function profile(token) {
  const [d] = await Promise.all([api('/api/levels?xp=0'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const u = tg?.initDataUnsafe?.user;
  const name = me?.user?.first_name || u?.first_name || 'Болельщик';
  const username = me?.user?.username || u?.username;
  const xp = me?.xp ?? 0;
  const lv = me?.level ?? levelFor(d.levels, d.legend_step, xp);
  const target = xp + (lv.to_next ?? 0);
  const accuracy = me?.settled ? Math.round((100 * me.guessed) / me.settled) : null;
  const achs = [...(me?.achievements ?? d.achievements ?? [])].sort((a, c) => c.level - a.level || c.progress - a.progress);
  const cur = d.levels.reduce((k, l, i) => (xp >= l.from ? i : k), 0);
  view.innerHTML = `
    <div class="page-head"><h1>Профиль</h1><a class="icon-btn" href="#/settings" aria-label="Настройки" title="Настройки">${ICON.gear}</a></div>
    <div class="me-card">${meAvatar()}<div><b>${esc(name)}</b><span>${username ? `@${esc(username)}` : tg?.initData ? 'болельщик «Больше»' : 'Открой приложение в Telegram, чтобы копить опыт'}</span></div></div>
    <div class="lv-card">${BALL}<div class="cap">Твой уровень</div><div class="title">${esc(lv.title)}</div>
      <div class="prog"><i style="width:${Math.round((lv.progress ?? 0) * 100)}%"></i></div>
      <div class="xp">${xp.toLocaleString('ru-RU')} / ${target.toLocaleString('ru-RU')} XP</div>
      <div class="sub">${esc(lv.subtitle)}${lv.next_title ? ` · дальше «${esc(lv.next_title)}»` : ''}</div>
      <button class="go" type="button" data-levels aria-label="Все уровни">${ICON.arrow}</button></div>
    <div class="stats3"><div><small>Точность</small><b>${accuracy != null ? `${accuracy}%` : '—'}</b></div><div><small>Прогнозов</small><b>${me?.votes_total ?? 0}</b></div><div><small>В серии</small><b>${me?.streak ?? 0}</b></div></div>
    ${me?.place ? `<div class="place-line">Место в общей таблице: №${me.place} из ${me.fans}</div>` : ''}
    <h2>Достижения</h2>
    <div class="achs">${achs.map(achievementCard).join('')}</div>
    <div class="note" style="margin-top:10px">У каждого достижения пять уровней. Опыт: +10 XP за прогноз, +20 за верный (вдвое — если угадал вопреки большинству); «Вопрос дня» и очки сеток турниров — тоже в опыт.</div>
    <h2 id="levels">Уровни</h2>
    <div class="ladder">${d.levels.map((l, i) => `<div class="${xp >= l.from ? 'on' : ''}${i === cur ? ' cur' : ''}"><b>${esc(l.title)}</b><small>${esc(l.subtitle)}</small><span>${l.from.toLocaleString('ru-RU')} XP</span></div>`).join('')}</div>`;
  view.querySelector('[data-levels]').addEventListener('click', () => view.querySelector('#levels').scrollIntoView({ behavior: 'smooth' }));
  view.querySelectorAll('[data-ach]').forEach((b) => b.addEventListener('click', () => b.classList.toggle('open')));
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

const RULES = 'Выбери победителя каждого оставшегося матча — до финала. Отправить сетку можно один раз: потом до конца турнира её не поменять. Очки дают матчи, которые начались после отправки: финал — 32, полуфинал — 16, четвертьфинал — 8, 1/8 — 4, 1/16 — 2, ранние круги — 1. Очки сеток идут и в опыт.';

let tourFilter = 'all';
function bracketPoster(b) {
  const info = [datesLabel(b.starts_at, b.ends_at), SURFACE[b.surface], b.status === 'open' ? (b.round ? `идёт ${b.round.toLowerCase()}` : null) : 'завершён'].filter(Boolean).join(' · ');
  const mine = b.mine
    ? `${bracketLine(b.bracket_key)}<div class="bk-mine"><b>${b.mine.points}</b> ${plural(b.mine.points, 'очко', 'очка', 'очков')}${b.status === 'open' ? ` · можно набрать до ${b.mine.possible}` : ''}</div>`
    : b.status === 'open' ? `<div class="bk-cta">🏆 Заполни сетку — осталось ${b.open_matches} ${plural(b.open_matches, 'матч', 'матча', 'матчей')}</div>` : '';
  return tourPoster({
    tour: b.tour, tier: b.tier, city: b.city ?? b.name, logo: b.logo, key: b.bracket_key, info,
    inner: `${mine}${b.champion ? `<div class="tc-dates">🏆 Чемпион: ${esc(b.champion)}</div>` : ''}<div class="tc-dates">${b.fans} ${plural(b.fans, 'участник', 'участника', 'участников')} в игре</div>`,
  });
}

async function tournamentsTab(token) {
  const [d] = await Promise.all([api('/api/brackets'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const list = d.brackets.filter((b) => tourFilter === 'all' || b.tour === tourFilter);
  const open = list.filter((b) => b.status === 'open');
  const done = list.filter((b) => b.status !== 'open');
  view.innerHTML = `<div class="page-head"><h1>Турниры</h1></div>
    <div class="chips">${[['all', 'Все'], ['ATP', 'ATP'], ['WTA', 'WTA']].map(([k, label]) => `<button class="chip${k === tourFilter ? ' on' : ''}" type="button" data-tf="${k}">${label}</button>`).join('')}<a class="chip" href="#/matches?f=challenger">Челленджеры</a></div>
    <div class="tours" style="margin-top:12px">${open.length ? open.map(bracketPoster).join('') : '<div class="empty">Сейчас сеток нет — они появятся с началом основной сетки турнира</div>'}</div>
    ${done.length ? `<h2>Завершённые</h2><div class="tours">${done.map(bracketPoster).join('')}</div>` : ''}
    <details class="rules"><summary>Как играть в сетку</summary>${esc(RULES)}</details>`;
  view.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { tourFilter = b.dataset.tf; tournamentsTab(token).catch(() => {}); }));
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

// Players of a draw by ranking: still in, or out in which round.
function drawPlayers(d) {
  const draw = d.draw;
  const sides = drawSides(draw, {});
  const run = new Map();
  draw.rounds.forEach((round, r) => round.matches.forEach((m, k) => {
    for (const pos of sides[r][k]) {
      if (pos == null) continue;
      const x = run.get(pos) ?? { reached: r, out: null };
      x.reached = Math.max(x.reached, r);
      if (m.w != null && m.w !== pos) x.out = round.title;
      run.set(pos, x);
    }
  }));
  const champion = draw.rounds.at(-1)?.matches[0]?.w;
  const list = draw.players.filter((p) => p.name).map((p) => ({ p, x: run.get(p.pos) ?? { reached: 0, out: null } }))
    .sort((a, c) => (a.x.out ? 1 : 0) - (c.x.out ? 1 : 0) || (a.p.rank ?? 9999) - (c.p.rank ?? 9999));
  const row = ({ p, x }) => {
    const label = p.pos === champion ? '🏆 Чемпион' : x.out ? `выбыл: ${x.out.toLowerCase()}` : `в игре: ${(draw.rounds[x.reached]?.title ?? '').toLowerCase()}`;
    const inner = `${avatar(p.photo, 'ava')}<span><b>${esc(p.name_ru ?? p.name)}</b>${p.seed ? ` <small>(${esc(p.seed)})</small>` : ''}<br><small>${esc(label)}</small></span><small>${p.rank ? `№${p.rank}` : ''}</small>`;
    return p.player_id ? `<a class="dr-row${x.out ? ' out' : ''}" href="#/player/${encodeURIComponent(p.player_id)}">${inner}</a>` : `<div class="dr-row${x.out ? ' out' : ''}">${inner}</div>`;
  };
  return `<div class="stat-list">${list.map(row).join('')}</div>`;
}

async function bracketScreen(key, token, params = new URLSearchParams()) {
  const [d] = await Promise.all([api(`/api/brackets/${encodeURIComponent(key)}`), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const draw = d.draw;
  const showPlayers = params.get('view') === 'players';
  const current = Math.max(0, draw.rounds.findIndex((round) => round.matches.some((m) => m.w == null)));
  const head = `<h1>${esc(d.name)}</h1>
    <div class="muted small" style="margin:-6px 2px 12px">${esc(SURFACE[d.surface] ?? '')}${d.status === 'open' ? ` · идёт ${esc(draw.rounds[current].title.toLowerCase())}` : ' · турнир завершён'}</div>
    <div class="seg2"><a class="${showPlayers ? '' : 'on'}" href="#/bracket/${encodeURIComponent(key)}">Сетка</a><a class="${showPlayers ? 'on' : ''}" href="#/bracket/${encodeURIComponent(key)}?view=players">Игроки</a></div>`;
  if (showPlayers) {
    view.innerHTML = `${head}${drawPlayers(d)}`;
    return;
  }
  const sent = d.entry;
  const editable = !sent && d.status === 'open' && Boolean(tg?.initData);
  const picks = sent ? sent.picks : cleanPicks(draw, loadDraft(key));
  const sides = drawSides(draw, picks);
  const open = openKeys(draw);
  const filled = open.filter((k) => picks[k] != null).length;
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
  view.innerHTML = `${head}
    ${status}
    <div class="chips bk-rounds">${draw.rounds.map((x, i) => `<button class="chip${i === r ? ' on' : ''}" type="button" data-round="${i}">${esc(x.short)} <small>+${roundPoints(draw, i)}</small></button>`).join('')}</div>
    <div class="bk-list">${round.matches.map((m, k) => {
      const [h, a] = sides[r][k];
      const when = m.w != null ? '' : m.status === 'live' ? '<span class="pill-live">LIVE</span>' : m.start ? esc(`${dayWord(m.start)} ${localTime(m.start)}`) : '';
      return `<div class="bk-match"><div class="bk-meta"><span>${esc(round.title)} · матч ${k + 1}</span><span>${when}</span></div>${sideRow(h, m, k, a)}${sideRow(a, m, k, h)}</div>`;
    }).join('')}</div>
    ${editable ? `<div class="bk-send"><button type="button" data-send${filled < open.length ? ' disabled' : ''}>${filled < open.length ? `Заполнено ${filled} из ${open.length}` : 'Отправить сетку'}</button></div>` : ''}
    ${d.table.length ? `<h2>Таблица</h2><div class="bk-table">${d.table.slice(0, 20).map((t) => `<div class="bk-row${t.me ? ' me' : ''}"><span>${t.place}</span><span>${esc(t.name)}${t.me ? ' (ты)' : ''}</span><b>${t.points}</b></div>`).join('')}</div>` : ''}`;
  view.querySelectorAll('[data-round]').forEach((b) => b.addEventListener('click', () => {
    bracketRound[key] = Number(b.dataset.round);
    bracketScreen(key, token, params).catch(() => {});
  }));
  view.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    saveDraft(key, cleanPicks(draw, { ...picks, [b.dataset.pick]: Number(b.dataset.pos) }));
    tg?.HapticFeedback?.selectionChanged?.();
    bracketScreen(key, token, params).catch(() => {});
  }));
  view.querySelector('[data-send]')?.addEventListener('click', async (e) => {
    const go = () => post(`/api/brackets/${encodeURIComponent(key)}`, { picks: cleanPicks(draw, loadDraft(key)) })
      .then(() => { toast('Сетка отправлена'); return bracketScreen(key, token, params); })
      .catch((error) => toast(error.message));
    e.currentTarget.disabled = true;
    const text = 'Отправить сетку? После отправки её нельзя будет поменять до конца турнира.';
    if (tg?.showConfirm) tg.showConfirm(text, (yes) => (yes ? go() : bracketScreen(key, token, params)));
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
  const opt = (k, v, label) => `<button class="chip${state[k] === v ? ' on' : ''}" type="button" data-opt="${k}" data-val="${v}">${label}</button>`;
  view.innerHTML = `<h1>Давай знакомиться 👋</h1>
    <p class="muted" style="margin:0 2px 8px">Пара вопросов — и приложение подстроится под тебя: твои игроки, твои матчи. Всё можно поменять потом.</p>
    <h2>За кого болеешь?</h2>
    <div class="pick-grid">${[...atp.players, ...wta.players].filter((p) => p.singles_rank).map((p) => `<button type="button" class="pick-pl${state.players.has(p.player_id) ? ' on' : ''}" data-pl="${esc(p.player_id)}">
      ${avatar(p.photo_url, 'head')}<b>${esc(lastName({ name: p.name_ru }))}</b><small>${esc(p.tour)} · №${p.singles_rank}</small></button>`).join('')}</div>
    <p class="muted small" style="margin:6px 2px">Других игроков найдёшь во вкладке «Игроки» — отметь звёздочкой.</p>
    <h2>Любимое покрытие</h2><div class="chips wrap">${opt('surface', 'hard', 'Хард')}${opt('surface', 'clay', 'Грунт')}${opt('surface', 'grass', 'Трава')}${opt('surface', 'all', 'Все')}</div>
    <h2>Что смотришь чаще?</h2><div class="chips wrap">${opt('tours', 'ATP', 'Мужчин')}${opt('tours', 'WTA', 'Женщин')}${opt('tours', 'all', 'И тех, и других')}</div>
    <h2>Давно смотришь теннис?</h2><div class="chips wrap">${opt('since', 'new', 'Только начинаю')}${opt('since', '2-5', '2–5 лет')}${opt('since', '5-10', '5–10 лет')}${opt('since', '10+', 'Больше 10 лет')}</div>
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

// Plain links to VK broadcasts (not buttons) count too.
document.addEventListener('click', (event) => {
  const a = event.target.closest?.('a[href*="vk.com/video"], a[href*="vkvideo.ru/video"]');
  if (a) trackVk(a.getAttribute('href'));
}, true);

// ---------- settings ----------
async function settings(token) {
  await loadMe(mskDay(0));
  if (token && stale(token)) return;
  view.innerHTML = `<h1>Настройки</h1>
    <h2>Тема</h2>
    <div class="chips">${THEMES.map(([k, label]) => `<button class="chip${themeMode === k ? ' on' : ''}" type="button" data-theme-pick="${k}">${label}</button>`).join('')}</div>
    <h2>Без спойлеров</h2>
    <label class="switch-row"><input type="checkbox" id="noSpoilersBox"${noSpoilers ? ' checked' : ''}> Скрывать счёт и победителей</label>
    ${me ? `<h2>Мои результаты</h2>
    <label class="switch-row"><input type="checkbox" id="publicBox"${me.prefs?.public === false ? '' : ' checked'}> Показывать моё имя в таблицах</label>
    <p class="muted small">Если выключить, в таблицах ты будешь «Болельщик ####» — прогнозы и очки считаются как обычно.</p>
    <a class="more-btn" href="#/welcome">Ответить на вопросы о себе заново</a>` : ''}
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
    '': 'home', question: 'home', matches: 'matches', match: 'matches', tournaments: 'tournaments', bracket: 'tournaments',
    players: 'players', player: 'players', profile: 'profile', settings: 'profile',
  }[parts[0] ?? ''] ?? 'home';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const detail = ['match', 'player', 'settings', 'bracket', 'question'].includes(parts[0]);
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
    else if (parts[0] === 'question') await questionScreen(token);
    else if (parts[0] === 'tournaments') await tournamentsTab(token);
    else if (parts[0] === 'bracket' && parts[1]) await bracketScreen(decodeURIComponent(parts[1]), token, params);
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
