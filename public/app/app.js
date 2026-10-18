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

// Signed in: inside Telegram by its signed data (initData); on the website by «Войти через
// Telegram» (worker/src/web-login.js) — the same Telegram account, the same points and votes.
let session = null; // {token, user} of the website sign-in
try { session = tg?.initData ? null : JSON.parse(localStorage.getItem('bolshe-session') || 'null'); } catch { session = null; }
const signedIn = () => Boolean(tg?.initData || session?.token);

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
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
};
const BALL = '<svg class="ball" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#d7f23a"/><path d="M15 21c17 13 23 41 6 63M85 21C68 34 62 62 79 84" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/></svg>';
const LOGO_MARK = '<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#d7f23a"/><path d="M15 11.5 26.5 20 15 28.5" fill="none" stroke="#15111c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Theme: the brand dark one by default; light, or as Telegram (light/dark of the client) in Настройки.
const THEMES = [['dark', 'Тёмная'], ['light', 'Светлая'], ['auto', tg?.initData ? 'Как в Telegram' : 'Как на устройстве']];
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
  const u = tg?.initDataUnsafe?.user ?? session?.user;
  const letter = Array.from(String(u?.first_name ?? '').trim())[0];
  return u?.photo_url ? `<img src="${esc(u.photo_url)}" alt="" referrerpolicy="no-referrer">` : letter ? esc(letter.toUpperCase()) : ICON.user;
}
const meAvatar = (cls = 'me-ava') => `<span class="${cls}">${meAvatarInner()}</span>`;
const paintMeAva = () => { document.getElementById('meAva').innerHTML = meAvatarInner(); };
paintMeAva();

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
  if (!ref || !signedIn()) return;
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
const authHeaders = () => (tg?.initData ? { 'x-telegram-init-data': tg.initData }
  : session?.token ? { authorization: `Bearer ${session.token}` } : {});
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function loadMe(date) {
  if (!signedIn()) { me = null; return null; }
  try {
    me = await api(`/api/me?date=${date}`);
    if (Array.isArray(me?.prefs?.fav_tournaments) && me.prefs.fav_tournaments.length) favTours = me.prefs.fav_tournaments;
  } catch (error) {
    me = null;
    if (session && /HTTP 401/.test(error.message)) saveSession(null); // the website session has ended
  }
  return me;
}

// ---------- ★ favourite tournaments: in the fan's settings when signed in, on this device otherwise ----------
let favTours = [];
try { favTours = JSON.parse(localStorage.getItem('bolshe-fav-tours') || '[]'); } catch { favTours = []; }
const isFav = (name) => favTours.includes(name);
function toggleFav(name) {
  favTours = isFav(name) ? favTours.filter((x) => x !== name) : [...favTours, name];
  try { localStorage.setItem('bolshe-fav-tours', JSON.stringify(favTours)); } catch { /* ignore */ }
  if (signedIn()) post('/api/prefs', { fav_tournaments: favTours }).catch(() => {});
  toast(isFav(name) ? `«${name}» в избранном — будет первым` : `«${name}» убран из избранного`);
}
const favButton = (name) => `<button class="fav${isFav(name) ? ' on' : ''}" type="button" data-fav="${esc(name)}" aria-label="Избранный турнир">${isFav(name) ? '★' : '☆'}</button>`;
document.addEventListener('click', (event) => {
  const b = event.target.closest?.('[data-fav]');
  if (!b) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFav(b.dataset.fav);
  route();
}, true);

// ---------- «Войти через Telegram» on the website ----------
const TG_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.4 4.2 2.9 11.3c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5zM9.4 14l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.2z"/></svg>';
function saveSession(s) {
  session = s;
  try { if (s) localStorage.setItem('bolshe-session', JSON.stringify(s)); else localStorage.removeItem('bolshe-session'); } catch { /* storage may be blocked */ }
  paintMeAva();
}
function loginButton(label = 'Войти через Telegram') {
  return `<button class="cta tg-login" type="button" data-login><span class="ic">${TG_ICON}</span>${esc(label)}<span class="go">${ICON.arrow}</span></button>`;
}
// Where something needs the fan's account: one line and the button.
const needLogin = (text) => `<div class="need-login"><div>${esc(text)}</div>${loginButton()}</div>`;

let loginTimer = null;
function closeLogin() {
  clearInterval(loginTimer);
  loginTimer = null;
  document.querySelector('.sheet-back')?.remove();
  try { sessionStorage.removeItem('bolshe-login'); } catch { /* ignore */ }
}
// The sheet: the 4 check digits, the button to the bot, and waiting for «Войти» there.
function showLogin(d) {
  document.querySelector('.sheet-back')?.remove();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-label="Вход через Telegram">
    <button class="icon-btn sheet-x" type="button" data-login-close aria-label="Закрыть">✕</button>
    <h2>Вход через Telegram</h2>
    <ol class="login-steps"><li>Нажми кнопку — откроется наш бот.</li><li>Если бот попросит — нажми «Запустить».</li><li>Проверь, что в боте тот же код, и нажми «Войти».</li></ol>
    <div class="login-code">${esc(d.check)}</div>
    <a class="cta tg-login" href="${esc(d.bot_link)}" target="_blank" rel="noopener"><span class="ic">${TG_ICON}</span>Открыть бота<span class="go">${ICON.arrow}</span></a>
    <a class="login-alt" href="${esc(d.app_link)}">Не открывается? Открыть приложение Telegram</a>
    <div class="login-state">Ждём подтверждения в боте…</div></div>`;
  document.body.appendChild(back);
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-login-close]')) closeLogin(); });
  const state = back.querySelector('.login-state');
  const check = async () => {
    let r;
    try { r = await api(`/api/web-login?code=${encodeURIComponent(d.code)}`); } catch { return; }
    if (r.state === 'ok') {
      saveSession({ token: r.token, user: r.user });
      closeLogin();
      toast(`Вход выполнен${r.user?.first_name ? `: ${r.user.first_name}` : ''}`);
      route();
    } else if (r.state === 'expired' || r.state === 'declined') {
      clearInterval(loginTimer);
      try { sessionStorage.removeItem('bolshe-login'); } catch { /* ignore */ }
      state.innerHTML = `${r.state === 'expired' ? 'Время на вход вышло.' : 'Вход отменён в боте.'} ${loginButton('Попробовать ещё раз')}`;
    }
  };
  clearInterval(loginTimer);
  loginTimer = setInterval(check, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loginTimer) check(); });
}
async function startLogin() {
  if (tg?.initData) return;
  try {
    const d = await post('/api/web-login', {});
    try { sessionStorage.setItem('bolshe-login', JSON.stringify(d)); } catch { /* ignore */ }
    showLogin(d);
  } catch (error) {
    toast(error.message);
  }
}
document.addEventListener('click', (event) => {
  if (!event.target.closest?.('[data-login]')) return;
  event.preventDefault();
  event.stopPropagation();
  startLogin();
}, true);
// Back from Telegram after a page reload (phones do that): keep waiting for the same login.
try {
  const pending = JSON.parse(sessionStorage.getItem('bolshe-login') || 'null');
  if (pending && !signedIn() && Date.parse(pending.expires_at) > Date.now()) showLogin(pending);
} catch { /* ignore */ }
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
    if (!signedIn()) return `<div class="vote"><div class="vote-cap">Кто выиграет?</div>${needLogin('Войди через Telegram, чтобы голосовать и копить опыт.')}</div>`;
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

// ---------- our highlights (cut on the Moscow server, light copies ~1.3 Mbit/s) ----------
const HL_ORDER = (f) => (f.kind === 'review' ? 0 : f.kind.startsWith('top') ? 1 : 2 + Number(f.kind.slice(3)));
const hlLabel = (f) => (f.kind === 'review' ? 'Обзор' : f.kind.startsWith('top') ? `Топ-${f.kind.slice(3)}` : `${f.kind.slice(3)}-й сет`);
const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.round(s || 0) % 60).padStart(2, '0')}`;
const hlFiles = (h) => [...(h?.files ?? [])].sort((a, c) => HL_ORDER(a) - HL_ORDER(c));
// The player: the video (the review first), chips to switch to the top and the sets, the set stories.
function hlPlayer(h) {
  const files = hlFiles(h);
  if (!files.length) return '';
  const sums = h.summaries ? Object.entries(h.summaries).sort(([a], [c]) => a - c) : [];
  return `<div class="hl-box" data-hl-box>
    <video class="hl-video" controls playsinline preload="metadata"${h.cover ? ` poster="${esc(h.cover)}"` : ''} src="${esc(files[0].url)}"></video>
    <div class="chips hl-kinds">${files.map((f, i) => `<button class="chip${i ? '' : ' on'}" type="button" data-hl-src="${esc(f.url)}">${hlLabel(f)} · ${mmss(f.secs)}</button>`).join('')}</div>
    ${sums.length ? `<div class="hl-sum">${sums.map(([k, v]) => `<div><b>${k}-й сет.</b> ${esc(v)}</div>`).join('')}</div>` : ''}
    ${h.done ? '' : '<div class="muted small">Полный обзор появится после матча — пока нарезка готовых сетов.</div>'}</div>`;
}
document.addEventListener('click', (event) => {
  const b = event.target.closest?.('[data-hl-src]');
  if (!b) return;
  const box = b.closest('[data-hl-box]');
  const video = box?.querySelector('video');
  if (!video) return;
  video.src = b.dataset.hlSrc;
  video.play().catch(() => {});
  box.querySelectorAll('[data-hl-src]').forEach((x) => x.classList.toggle('on', x === b));
});
// «▶ Хайлайты» in lists: opens the match on its «Видео» tab.
document.addEventListener('click', (event) => {
  const el = event.target.closest?.('[data-hl-match]');
  if (!el) return;
  event.preventDefault();
  event.stopPropagation();
  matchPane[el.dataset.hlMatch] = 'video';
  location.hash = `#/match/${encodeURIComponent(el.dataset.hlMatch)}`;
}, true);
// A highlights player in a sheet (the player page: matches without our match card).
function openHighlights(h, title) {
  document.querySelector('.sheet-back')?.remove();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-label="Хайлайты"><button class="icon-btn sheet-x" type="button" data-sheet-close aria-label="Закрыть">✕</button>
    <h2>${esc(title)}</h2>${hlPlayer(h)}</div>`;
  document.body.appendChild(back);
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-sheet-close]')) back.remove(); });
}
const hlChip = (m) => {
  const review = hlFiles(m.highlights).find((f) => f.kind === 'review') ?? hlFiles(m.highlights)[0];
  return review ? `<span class="mc-hl" data-hl-match="${esc(m.match_id)}" role="link"><i>${ICON.play}</i>Хайлайты · ${mmss(review.secs)}</span>` : '';
};

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
  const hl = m.highlights && showScore(m) ? hlChip(m) : '';
  const foot = watch || hl || m.odds ? `<div class="mc-foot">${hl}${watch}${oddsRow(m)}</div>` : '';
  return `<a class="mcard" href="#/match/${encodeURIComponent(m.match_id)}">
    <div class="mc-top">${top}<span class="t">${esc(label)}</span>${m.bolshe ? '<span class="badge">Больше</span>' : ''}</div>
    ${matchRow(m, 1)}${matchRow(m, 2)}${hidden}${foot}</a>`;
}

// ---------- home: «Главный матч дня» → «Твои игроки» → «Вопрос дня» → «Актуальные турниры» ----------
// (owner's structure of 2026-10-18). «Больше» broadcasts are marked right on the match cards; the
// Monday studio «Больше! Лайв» gets its own banner the day before and on the day.

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

// The main match's picture: the «Больше» cover cut down to the two players (the cover's own time
// and captions stay out of the frame; WTA and challenger covers have their own layouts) or, without
// a cover, both players' photos big. The photos stay under the cover in case it fails to load.
function mainPhotos(m) {
  const cover = m.bolshe?.cover;
  const tpl = m.tournament.level === 'challenger' ? 'ch' : m.tournament.tour === 'WTA' ? 'wta' : 'full';
  const heads = `<div class="mm-heads">${avatar(m.p1.photo, 'head')}<span class="vs-mark">VS</span>${avatar(m.p2.photo, 'head')}</div>`;
  return `<div class="mm-photo${cover ? ` tpl-${tpl}` : ''}">${heads}${cover ? `<img class="mm-cover" src="${esc(cover)}" alt="" data-cover>` : ''}</div>`;
}

function mainMatchCard(m) {
  if (!m) return '';
  const href = `#/match/${encodeURIComponent(m.match_id)}`;
  const live = m.status === 'live';
  const done = DONE.includes(m.status);
  const start = m.bolshe?.starts_at ?? m.start_at;
  const when = live ? '<span class="pill-live">LIVE</span>'
    : m.status === 'scheduled' ? `<span class="mm-time">${esc(cap(dayWord(start)))} · ${esc(localTime(start))}</span>`
      : `<span class="mm-time">${esc(STATUS[m.status] ?? '')}</span>`;
  const meta = [tourTitle(m.tournament), m.bolshe?.round].filter(Boolean).join(' · ');
  const winner = done && showScore(m) ? m.winner : null;
  const name = (side) => `<span${winner ? ` class="${winner === side ? 'won' : 'lost'}"` : ''}>${esc(lastName(side === 1 ? m.p1 : m.p2))}</span>`;
  const long = (lastName(m.p1) + lastName(m.p2)).length;
  let score = '';
  if (m.status !== 'scheduled' && m.status !== 'cancelled') {
    const sets = (m.sets ?? []).map((s) => `${s.p1 ?? 0}:${s.p2 ?? 0}`).join('  ');
    score = showScore(m)
      ? `<div class="mm-score"><b>${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}</b><span>${esc(sets)}${live ? `<em>идёт ${m.live_set ?? (m.sets ?? []).length}-й сет</em>` : ''}</span></div>`
      : '<div class="mm-score"><span>Счёт скрыт — «без спойлеров»</span></div>';
  }
  const vk = m.bolshe?.vk_url && m.status !== 'cancelled' ? m.bolshe.vk_url : null;
  const action = vk
    ? watchCta(vk, done ? 'Запись на Больше!' : 'Смотреть на Больше!')
    : `<a class="cta ghost" href="${href}"><span class="ic">${ICON.info}</span>Подробнее о матче<span class="go">${ICON.arrow}</span></a>`;
  const adminNote = me?.is_admin && m.manual
    ? '<button class="mm-admin" type="button" data-main-auto>Выбран вручную · вернуть автовыбор</button>' : '';
  return `<section class="mm">
    <a class="mm-link" href="${href}">${mainPhotos(m)}
      <div class="mm-body">
        <div class="mm-cap">Главный матч дня${m.bolshe ? '<span class="badge">Больше</span>' : ''}</div>
        <div class="mm-meta">${when}<span>${esc(meta)}</span></div>
        <div class="mm-names${long > 17 ? ' s2' : ''}">${name(1)}<i>—</i>${name(2)}</div>
        ${score}
      </div></a>
    <div class="mm-actions">${action}${vk ? `<a class="mm-more" href="${href}">О матче</a>` : ''}</div>${adminNote}
  </section>`;
}

// «Больше! Лайв»: the studio show every Monday, announced the day before and on the day.
function studioBanner(s) {
  if (!s) return '';
  const when = s.live ? '<span class="pill-live">В ЭФИРЕ</span>' : `<span class="sb-when">${esc(cap(dayWord(s.starts_at)))} в ${esc(localTime(s.starts_at))}</span>`;
  return `<button class="sbanner" type="button" data-ext="${esc(s.url)}">
    <span class="sb-ic">${ICON.play}</span>
    <span class="sb-text"><span class="sb-top"><b>${esc(s.title)}</b>${when}</span><small>${esc(s.about)}</small></span>
    <span class="sb-go">${ICON.arrow}</span></button>`;
}

// «Твои игроки»: a strip to swipe, 2–3 cards on the screen. Followed players with their match now /
// next and the last result; nobody followed yet — players of the day to follow with one ☆.
function playerCardSmall({ id, name, photo, line, sub, last, live, followed }) {
  const star = signedIn()
    ? `<button class="pc-star${followed ? ' on' : ''}" type="button" data-follow="${esc(id)}"${followed ? ' data-on="0"' : ''} aria-label="${followed ? 'Убрать из твоих игроков' : 'Следить за игроком'}">${followed ? '★' : '☆'}</button>`
    : '<button class="pc-star" type="button" data-login aria-label="Войти, чтобы следить">☆</button>';
  return `<a class="pc${live ? ' is-live' : ''}" href="#/player/${encodeURIComponent(id)}">
    <span class="pc-photo">${avatar(photo, 'head')}${live ? '<span class="pill-live">LIVE</span>' : ''}</span>${star}
    <b class="pc-name">${esc(name)}</b>
    <span class="pc-line">${line}</span>${sub ? `<small>${sub}</small>` : ''}${last ? `<small class="pc-last">${last}</small>` : ''}</a>`;
}

const whenLine = (iso) => `${esc(cap(dayWord(iso)))}, ${esc(localTime(iso))}`;

function myPlayersStrip(d) {
  const mine = me?.my_players ?? [];
  const head = '<div class="sec-title"><span>Твои игроки</span><a href="#/players">Все →</a></div>';
  if (mine.length) {
    const order = (p) => (p.live ? 0 : p.next ? 1 + Date.parse(p.next.start_at) / 1e13 : 3);
    const cards = [...mine].sort((a, c) => order(a) - order(c)).map((p) => {
      const lastRes = p.last && showScore({ status: 'finished' })
        ? `<span class="${p.last.won ? 'w' : 'l'}">${p.last.won ? 'Победа' : 'Поражение'} ${esc(p.last.score)}</span> · ${esc(lastName({ name: p.last.opponent }))}` : '';
      let line = '<span class="muted">Матчей нет</span>';
      let sub = '';
      if (p.live) {
        line = `<span class="live">Играет${showScore({ status: 'live' }) ? ` · ${esc(p.live.score)}` : ''}</span>`;
        sub = `с ${esc(lastName({ name: p.live.opponent }))}`;
      } else if (p.next) {
        line = `<b>${whenLine(p.next.start_at)}</b>`;
        sub = `с ${esc(lastName({ name: p.next.opponent }))}`;
      }
      return playerCardSmall({ id: p.player_id, name: lastName({ name: p.name }), photo: p.photo, line, sub, last: p.live ? '' : lastRes, live: Boolean(p.live), followed: true });
    });
    return `${head}<div class="pstrip">${cards.join('')}<a class="pc pc-add" href="#/players"><span class="pc-plus">+</span><b class="pc-name">Добавить</b><small>ещё игроков</small></a></div>`;
  }
  const picks = d.featured ?? [];
  if (!picks.length) return '';
  const cards = picks.map((p) => {
    const m = p.match;
    const line = m.status === 'live' ? '<span class="live">Играет сейчас</span>'
      : m.status === 'scheduled' ? `<b>${whenLine(m.start_at)}</b>`
        : m.won != null && showScore(m) ? `<span class="${m.won ? 'w' : 'l'}">${m.won ? 'Победа' : 'Поражение'} ${esc(m.score ?? '')}</span>`
          : `<span class="muted">${esc(cap(dayWord(m.start_at)))}</span>`;
    return playerCardSmall({ id: p.player_id, name: lastName(p), photo: p.photo, line, sub: `с ${esc(lastName({ name: m.opponent }))}`, last: p.rank ? `№${p.rank}` : '', live: m.status === 'live', followed: false });
  });
  return `${head}<div class="hint">Нажми ☆ — и здесь будут матчи, соперники и результаты твоих игроков.</div><div class="pstrip">${cards.join('')}</div>`;
}

// «Вопрос дня»: two answers, one tap right here. The split is hidden until the fan answers; then the
// percentages, how many answered, the fan's own answer and the hosts' answers. The vote closes when
// the player's next match starts; once it is settled — the right answer and the fan's result.
function questionPoll(q) {
  const voted = q.pick != null;
  const showBars = (voted || !q.open) && q.total > 0;
  const pct = (i) => (q.total ? Math.round((100 * q.counts[i]) / q.total) : 0);
  const opts = q.options.map((label, i) => {
    const cls = `${q.pick === i ? ' picked' : ''}${q.answer === i ? ' right' : ''}`;
    const attrs = q.open ? (signedIn() ? ` data-q="${i}"` : ' data-login') : ' disabled';
    return `<button type="button" class="q-opt${cls}"${attrs}>${showBars ? `<i style="width:${pct(i)}%"></i>` : ''}
      <span>${q.answer === i ? '✓ ' : ''}${esc(label)}${q.pick === i ? '<small>твой ответ</small>' : ''}</span>${showBars ? `<b>${pct(i)}%</b>` : ''}</button>`;
  }).join('');
  const xp = q.xp ?? { answer: 10, correct: 20 };
  let note;
  if (q.answer != null && voted) {
    note = q.pick === q.answer ? `🎯 Угадано! +${xp.answer + xp.correct} XP. Верно ответили ${pct(q.answer)}%.` : `Не угадано — так ответили ${pct(q.pick)}%. Завтра новый вопрос.`;
  } else if (q.answer != null) {
    note = `Ответ: «${q.options[q.answer]}».${q.total ? ` Верно ответили ${pct(q.answer)}%.` : ''}`;
  } else if (q.open && voted) {
    note = `Ответ можно поменять до ${localTime(q.closes_at)}. +${xp.correct} XP, если угадаешь.`;
  } else if (q.open) {
    note = signedIn() ? `Ответь до ${localTime(q.closes_at)}: +${xp.answer} XP за ответ, ещё +${xp.correct} — если угадаешь.` : 'Войди через Telegram, чтобы ответить и получить опыт.';
  } else {
    note = 'Голосование закрыто — ответ решится на корте.';
  }
  const who = showBars && q.total ? `${q.total.toLocaleString('ru-RU')} ${plural(q.total, 'участник', 'участника', 'участников')} · ` : '';
  return `<div class="q-opts two">${opts}</div><div class="q-meta">${esc(who + note)}</div>${q.hosts ? hostsAnswers(q) : ''}`;
}

function hostsAnswers(q) {
  if (!q.hosts.length) return '<div class="q-hosts muted">Ведущие «Больше» ещё не ответили.</div>';
  const side = (i) => q.hosts.filter((h) => h.pick === i);
  return `<div class="q-hosts"><div class="qh-cap">Ведущие «Больше»</div>${q.options.map((label, i) => (side(i).length
    ? `<div class="qh-row"><span class="qh-ans">${esc(label)}</span><span class="qh-avas">${side(i).map((h) => hostAva(h, 'h-ava mini')).join('')}</span><small>${side(i).map((h) => esc(lastName(h))).join(', ')}</small></div>` : '')).join('')}</div>`;
}

function questionCard(q) {
  if (!q) return '';
  const closes = q.open ? `<span class="qc-when">до ${esc(localTime(q.closes_at))}</span>` : '';
  const all = location.hash.startsWith('#/question') ? '' : '<a class="qc-all" href="#/question">Все →</a>';
  return `<section class="qcard2" data-qcard>
    <div class="qc-top"><span class="cap">Вопрос дня</span>${closes}${all}</div>
    <div class="qc-q"><div class="qc-text">${esc(q.question)}<small>${esc(q.tournament)}</small></div>${avatar(q.player.photo, 'head')}</div>
    ${questionPoll(q)}</section>`;
}

// One tap on «Да» / «Нет» redraws only the question card.
function bindQuestion(root, q, reload) {
  const card = root.querySelector('[data-qcard]');
  if (!card || !q) return;
  card.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', async () => {
    card.querySelectorAll('[data-q]').forEach((x) => { x.disabled = true; });
    let fresh = null;
    try {
      fresh = (await post('/api/question', { pick: Number(b.dataset.q) })).today;
      tg?.HapticFeedback?.selectionChanged?.();
      toast(`Ответ принят · +${fresh?.xp?.answer ?? 10} XP`);
    } catch (error) {
      toast(error.message);
    }
    if (!fresh) { reload().catch(() => {}); return; }
    card.outerHTML = questionCard(fresh);
    bindQuestion(root, fresh, reload);
  }));
}

// «Актуальные турниры»: 2–3 cards to swipe — the photo of the stadium (or a court in the colour of the
// surface), the level, the stage, the dates and the surface; the whole card opens the tournament.
const SURF_CLASS = { hard: 'hard', clay: 'clay', grass: 'grass', carpet: 'hard' };
function tourStage(t) {
  if (t.stage === 'qualifying') return 'Идёт квалификация';
  if (t.status === 'done') return t.bracket?.champion ? `${t.tour === 'WTA' ? 'Чемпионка' : 'Чемпион'} — ${lastName({ name: t.bracket.champion })}` : 'Завершён';
  if (t.status === 'soon') return t.first_day ? `Старт ${dayMonth(t.first_day)}` : 'Скоро';
  if (t.bracket?.round) return t.live ? `${t.bracket.round} · LIVE` : t.bracket.round;
  return t.live ? `Идёт ${t.live} ${plural(t.live, 'матч', 'матча', 'матчей')}` : 'Идёт';
}
function tourCard2(t) {
  const v = t.visual;
  const pic = v?.photo
    ? `<span class="tc2-pic" style="background-image:url('${esc(v.photo)}')">`
    : `<span class="tc2-pic court ${SURF_CLASS[t.surface] ?? 'hard'}">${t.logo ? `<img class="tc2-logo" src="${esc(t.logo)}" alt="" loading="lazy" data-cover>` : ''}`;
  const dates = datesLabel(t.starts_at ?? dayIso(t.first_day), t.ends_at ?? dayIso(t.last_day));
  return `<a class="tc2${t.status === 'done' ? ' done' : ''}" href="#/tournament/${encodeURIComponent(t.key)}">
    ${pic}<span class="tc2-tier">${esc(tierLabel(t) || t.tour)}</span>${t.covered ? '<span class="badge">Больше</span>' : ''}${v?.credit ? `<span class="tc2-cr">${esc(v.credit)}</span>` : ''}</span>
    <span class="tc2-body"><b class="tc2-name">${esc(t.name)}</b>
      <span class="tc2-stage">${esc(tourStage(t))}</span>
      <small>${esc([dates, SURFACE[t.surface]].filter(Boolean).join(' · '))}</small></span></a>`;
}
function toursStrip(d) {
  const list = d.tournaments ?? [];
  if (!list.length && !d.challengers) return '';
  const more = (d.more_tour ?? 0) + (d.challengers ?? 0);
  const tail = more ? `<a class="tc2 tc2-more" href="#/tournaments"><b>+${more}</b><small>${d.challengers ? `в т. ч. ${d.challengers} ${plural(d.challengers, 'челленджер', 'челленджера', 'челленджеров')}` : 'турниров'}</small></a>` : '';
  return `<div class="sec-title"><span>Актуальные турниры</span><a href="#/tournaments">Все турниры →</a></div>
    <div class="tstrip">${list.map(tourCard2).join('')}${tail}</div>`;
}

async function home(params, token) {
  const date = mskDay(0);
  const [d, qd] = await Promise.all([
    api(`/api/home?date=${date}`),
    api('/api/question').catch(() => null),
    loadMe(date),
  ]);
  if (stale(token)) return;
  // First start inside Telegram: a few questions to make the app the fan's own.
  if (me && !me.prefs?.onboarded_at && !onboardingSkipped()) { location.hash = '#/welcome'; return; }
  const q = qd?.today ?? null;
  view.innerHTML = `
    ${mainMatchCard(d.main)}
    ${studioBanner(d.studio)}
    ${myPlayersStrip(d)}
    ${q ? questionCard(q) : ''}
    ${toursStrip(d)}`;
  bindFanActions(view, () => home(params, token));
  bindQuestion(view, q, () => home(params, token));
  view.querySelector('[data-main-auto]')?.addEventListener('click', async () => {
    try { await post('/api/home/main', { match_id: null }); toast('Главный матч снова выбирается сам'); } catch (error) { toast(error.message); }
    home(params, token).catch(() => {});
  });
  refreshEvery(60000, () => home(params, token));
}

// ---------- «Вопрос дня» (today's and the last ones) ----------
function pastQuestion(q) {
  const pct = (i) => (q.total ? Math.round((100 * q.counts[i]) / q.total) : 0);
  const mine = q.pick != null ? ` · твой ответ: «${q.options[q.pick]}»${q.answer != null ? (q.pick === q.answer ? ` ✓ (угадали ${pct(q.answer)}%)` : ' ✗') : ''}` : '';
  return `<div class="item"><b>${esc(q.question)}</b><small>${esc(shortDate(q.day))} · ${esc(q.tournament)} · ${q.answer == null ? 'ждём ответа' : `ответ: «${q.options[q.answer]}»`}${esc(mine)}</small></div>`;
}

async function questionScreen(token) {
  const d = await api('/api/question');
  if (stale(token)) return;
  const q = d.today;
  view.innerHTML = `<div class="page-head"><h1>Вопрос дня</h1></div>
    ${q ? questionCard(q) : '<div class="empty">Сегодня вопроса нет — он появляется, когда идут турниры с сетками.</div>'}
    ${d.past.length ? `<h2>Прошлые вопросы</h2><div class="q-past">${d.past.map(pastQuestion).join('')}</div>` : ''}`;
  bindQuestion(view, q, () => questionScreen(token));
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

// ---------- matches ----------
const MATCH_FILTERS = [['all', 'Все'], ['ATP', 'ATP'], ['WTA', 'WTA'], ['challenger', 'Челленджеры'], ['itf', 'ITF']];
const STATUS_TABS = [['all', 'Все'], ['live', 'Live'], ['upcoming', 'Предстоящие'], ['done', 'Завершённые']];
const statusOf = (m) => (m.status === 'live' ? 'live' : m.status === 'scheduled' ? 'upcoming' : 'done');

async function matches(params, token) {
  const date = params.get('date') ?? mskDay(0);
  let f = params.get('f') ?? ({ challenger: 'challenger', itf: 'itf' }[params.get('level')] ?? 'all');
  let s = params.get('s') ?? 'all';
  if (f === 'live') { f = 'all'; s = 'live'; } // old links «В эфире»
  const only = params.get('t') ?? '';
  let list;
  if (s === 'live' && f === 'all') {
    const [a, c] = await Promise.all([api(`/api/matches?date=${date}&level=tour`), api(`/api/matches?date=${date}&level=challenger`)]);
    list = [...a.matches, ...c.matches].filter((m) => m.status === 'live');
  } else {
    const level = f === 'challenger' || f === 'itf' ? f : 'tour';
    list = (await api(`/api/matches?date=${date}&level=${level}${f === 'ATP' || f === 'WTA' ? `&tour=${f}` : ''}`)).matches;
  }
  if (stale(token)) return;
  // Tournaments of the day for the chips: ★ favourites first, then the busiest.
  const tourCount = new Map();
  for (const m of list) tourCount.set(m.tournament.name, (tourCount.get(m.tournament.name) ?? 0) + 1);
  const tourNames = [...tourCount.keys()].filter(Boolean).sort((a, c) => isFav(c) - isFav(a) || tourCount.get(c) - tourCount.get(a));
  if (only) list = list.filter((m) => m.tournament.name === only);
  const byStatus = { all: list.length, live: 0, upcoming: 0, done: 0 };
  for (const m of list) byStatus[statusOf(m)] += 1;
  if (s !== 'all') list = list.filter((m) => statusOf(m) === s);
  // Live first, then what is still to come by the clock, then the finished ones (latest first);
  // singles before doubles.
  const group = (m) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2);
  list.sort((a, c) => group(a) - group(c) || (a.is_doubles - c.is_doubles)
    || (group(a) === 2 ? Date.parse(c.start_at) - Date.parse(a.start_at) : Date.parse(a.start_at) - Date.parse(c.start_at)));
  const link = (over) => {
    const p = new URLSearchParams({ date, f, s, ...(only ? { t: only } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `#/matches?${p}`;
  };
  const shift = (n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
  view.innerHTML = `<div class="page-head"><h1>Матчи</h1>
      <label class="icon-btn cal" title="Выбрать день">${ICON.cal}<input type="date" data-pick min="${mskDay(-7)}" max="${mskDay(7)}" value="${esc(date)}" aria-label="Выбрать день"></label></div>
    <div class="chips">${MATCH_FILTERS.map(([k, label]) => `<a class="chip${k === f ? ' on' : ''}" href="${link({ f: k, t: '' })}">${label}</a>`).join('')}</div>
    ${tourNames.length > 1 || only ? `<div class="filter-cap">Турнир</div>
      <div class="chips"><a class="chip${only ? '' : ' on'}" href="${link({ t: '' })}">Все турниры</a>${(only && !tourNames.includes(only) ? [only, ...tourNames] : tourNames)
        .map((n) => `<a class="chip${n === only ? ' on' : ''}" href="${link({ t: n })}">${isFav(n) ? '★ ' : ''}${esc(n)}</a>`).join('')}</div>` : ''}
    <div class="tabs-line">${STATUS_TABS.map(([k, label]) => `<a class="${k === s ? 'on' : ''}" href="${link({ s: k })}">${label}${k !== 'all' && byStatus[k] ? ` <small>${byStatus[k]}</small>` : ''}</a>`).join('')}</div>
    <div class="date-row">${date > mskDay(-7) ? `<a class="icon-btn" href="${link({ date: shift(-1) })}" aria-label="День назад">${ICON.prev}</a>` : '<span></span>'}
      <b>${esc(dateTitle(date))}</b>${date < mskDay(7) ? `<a class="icon-btn" href="${link({ date: shift(1) })}" aria-label="День вперёд">${ICON.next}</a>` : '<span></span>'}</div>
    ${list.map(matchCard).join('')
      || `<div class="empty">${s === 'live' ? 'Сейчас в эфире ничего нет' : s === 'upcoming' ? 'Больше матчей в этот день не будет' : s === 'done' ? 'Завершённых матчей пока нет'
        : date > mskDay(1) ? 'Расписание на этот день ещё не опубликовано — обычно оно появляется накануне' : 'В этот день матчей нет'}</div>`}`;
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
  const [d] = await Promise.all([api(`/api/matches/${encodeURIComponent(id)}`), loadMe(mskDay(0)), loadHosts()]);
  if (stale(token)) return;
  const m = d.match;
  const t = m.tournament;
  const pick = me?.picks?.[m.match_id] ?? null;
  const panes = [['score', 'Счёт'], ['stats', 'Статистика'], ['votes', 'Прогнозы'], ...(m.bolshe ? [['video', 'Видео']] : [])];
  // After the match: the fan who voted lands on the results, otherwise on our highlights if we cut it.
  const pane = matchPane[id] ?? (DONE.includes(m.status) && pick && showScore(m) ? 'votes'
    : m.highlights?.done && showScore(m) ? 'video' : 'score');
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
      ${expertsBlock(m, d.experts)}
      ${me?.is_admin ? '<button class="mm-admin" type="button" data-main-pick>★ Сделать главным матчем дня на главной</button>' : ''}
    </div>
    <div class="pane" data-p="stats"${pane === 'stats' ? '' : ' hidden'}>${stats || '<div class="empty">Статистики по этому матчу пока нет</div>'}</div>
    <div class="pane" data-p="votes"${pane === 'votes' ? '' : ' hidden'}>${resultsPane(m)}${expertsBlock(m, d.experts)}</div>
    ${m.bolshe ? `<div class="pane" data-p="video"${pane === 'video' ? '' : ' hidden'}>
      ${m.highlights && showScore(m) ? `<div class="sec-title" style="margin-top:0"><span>Хайлайты «Больше»</span></div>${hlPlayer(m.highlights)}` : ''}
      ${m.highlights && !showScore(m) ? '<div class="empty">Хайлайты скрыты — выключи «без спойлеров» вверху</div>' : ''}
      ${m.bolshe.cover && !m.highlights ? `<div class="cover"><img class="cover-img" src="${esc(m.bolshe.cover)}" alt="" loading="lazy" data-cover></div>` : ''}
      <div class="score-card"><b>Трансляция «Больше»</b><div class="muted small" style="margin-top:4px">${esc([m.bolshe.title, m.bolshe.round].filter(Boolean).join(' · '))}${m.bolshe.commentator1 ? `<br>Комментирует ${[m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).map(hostLink).join(' и ')}` : ''}</div></div>
      ${vk ? watchCta(vk, DONE.includes(m.status) ? 'Смотреть запись на VK' : 'Смотреть на Больше!') : '<div class="empty">Ссылка на эфир появится ближе к началу</div>'}
    </div>` : ''}`;
  view.querySelectorAll('[data-pane]').forEach((b) => b.addEventListener('click', () => {
    matchPane[id] = b.dataset.pane;
    view.querySelectorAll('[data-pane]').forEach((x) => x.classList.toggle('on', x === b));
    view.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.pane; });
  }));
  view.querySelector('[data-share]')?.addEventListener('click', (e) => share(e.currentTarget.dataset.share));
  // Admins: this match becomes «Главный матч дня» (until its day is over; /main авто in the bot undoes it).
  view.querySelector('[data-main-pick]')?.addEventListener('click', async () => {
    try { await post('/api/home/main', { match_id: m.match_id }); toast('Готово: этот матч — главный на главной'); } catch (error) { toast(error.message); }
  });
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

// The player's «Больше» broadcasts: cover, date, opponent, tournament; ▶ VK and our highlights when cut.
let bcOpen = false;
function playerMediaBlock(media) {
  if (!media) return '';
  const hl = noSpoilers ? [] : media.highlights.filter((h) => h.files.length);
  const bcs = media.broadcasts;
  const date = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  const hlCards = hl.map((h, i) => {
    const b = bcs.find((x) => x.highlights?.key === h.key);
    const review = hlFiles(h).find((f) => f.kind === 'review') ?? hlFiles(h)[0];
    return `<button class="hl-card" type="button" data-hl-open="${i}">${h.cover ? `<img src="${esc(h.cover)}" alt="" loading="lazy" data-cover>` : ''}
      <span class="hl-play">${ICON.play}</span><span class="hl-cap"><b>${esc(b ? `с ${lastName({ name: b.opponent })}` : 'Хайлайты')}</b><small>${esc(date(h.date))} · ${hlLabel(review)} ${mmss(review.secs)}</small></span></button>`;
  }).join('');
  const row = (b, i) => `<div class="bc-row${i >= 6 && !bcOpen ? ' bc-more' : ''}">
    ${b.cover ? `<img class="th" src="${esc(b.cover)}" alt="" loading="lazy" data-cover>` : '<span class="th nocov"></span>'}
    <span class="who"><b>${b.opponent ? `с ${esc(lastName({ name: b.opponent }))}` : 'Эфир «Больше»'}</b><small>${esc([date(b.date), b.tournament, b.round].filter(Boolean).join(' · '))}</small></span>
    <span class="bc-acts">${b.highlights && !noSpoilers ? `<button class="mc-hl" type="button" data-hl-open="${hl.findIndex((h) => h.key === b.highlights.key)}"><i>${ICON.play}</i>Хайлайты</button>` : ''}
      ${b.vk_url ? `<span class="mc-watch" data-ext="${esc(b.vk_url)}" role="link"><i>${ICON.play}</i>ВК</span>` : ''}</span></div>`;
  return `${hl.length ? `<div class="sec-title"><span>Хайлайты</span><span class="r">${hl.length}</span></div><div class="hl-strip">${hlCards}</div>` : ''}
    ${bcs.length ? `<div class="sec-title"><span>Эфиры «Больше»</span><span class="r">${bcs.length}</span></div><div class="bc-list">${bcs.map(row).join('')}</div>
      ${bcs.length > 6 && !bcOpen ? `<button class="more-btn" type="button" data-bc-more>Показать все эфиры (${bcs.length})</button>` : ''}` : ''}`;
}

async function player(id, token) {
  const [{ player: p, insights }, { matches: list }, media] = await Promise.all([
    api(`/api/players/${encodeURIComponent(id)}`), api(`/api/players/${encodeURIComponent(id)}/matches`),
    api(`/api/players/${encodeURIComponent(id)}/media`).catch(() => null), loadMe(mskDay(0)),
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
    ${playerMediaBlock(media)}
    ${insightsBlock(insights)}
    <h2>Матчи</h2>${list.length ? list.map(matchCard).join('') : '<div class="empty">Свежих матчей нет — история появится по мере игр</div>'}`;
  const hlList = noSpoilers ? [] : (media?.highlights ?? []).filter((h) => h.files.length);
  view.querySelectorAll('[data-hl-open]').forEach((b) => b.addEventListener('click', () => {
    const h = hlList[Number(b.dataset.hlOpen)];
    const bc = media.broadcasts.find((x) => x.highlights?.key === h?.key);
    if (h) openHighlights(h, `${lastName({ name: p.name_ru })}${bc?.opponent ? ` — ${lastName({ name: bc.opponent })}` : ''}`);
  }));
  view.querySelector('[data-bc-more]')?.addEventListener('click', (e) => {
    bcOpen = true;
    view.querySelectorAll('.bc-more').forEach((r) => r.classList.remove('bc-more'));
    e.currentTarget.remove();
  });
  bindFanActions(view, () => player(id, token));
}

// ---------- «Эксперты «Больше»»: hosts and commentators vote in the app themselves ----------
let hostsCache = null;
async function loadHosts() {
  if (!hostsCache) hostsCache = await api('/api/hosts').catch(() => ({ hosts: [] }));
  return hostsCache;
}
const normName = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim();
const hostByName = (name) => (hostsCache?.hosts ?? []).find((h) => normName(h.name) === normName(name) || h.aliases.some((a) => normName(a) === normName(name)));
const ROLE_LABEL = { host: 'Ведущий', ambassador: 'Амбассадор', commentator: 'Комментатор' };
function hostAva(h, cls = 'h-ava') {
  if (h.photo) return `<img class="${cls}" src="${esc(h.photo)}" alt="" loading="lazy" data-head>`;
  const init = h.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
  return `<span class="${cls} h-init">${esc(init)}</span>`;
}
// A commentator's name links to their page when we know them.
const hostLink = (name) => {
  const h = hostByName(name);
  return h ? `<a href="#/host/${encodeURIComponent(h.id)}">${esc(name)}</a>` : esc(name);
};
// «Что говорят эксперты»: the hosts' picks for the match (✓ / ✗ once it is over).
function expertsBlock(m, experts) {
  if (!experts?.length) return '';
  const done = DONE.includes(m.status) && m.winner && showScore(m);
  return `<div class="sec-title" style="margin-top:4px"><span>Что говорят эксперты</span><a href="#/hosts">Все →</a></div>
    <div class="ex-strip">${experts.map((e) => `<a class="ex-card" href="#/host/${encodeURIComponent(e.id)}">${hostAva(e)}<b>${esc(lastName({ name: e.name }))}</b>
      <span class="ex-pick${done ? (m.winner === e.pick ? ' ok' : ' no') : ''}">${esc(lastName(e.pick === 1 ? m.p1 : m.p2))}${done ? (m.winner === e.pick ? ' ✓' : ' ✗') : ''}</span></a>`).join('')}</div>`;
}

async function hostsScreen(token) {
  const d = await loadHosts();
  if (stale(token)) return;
  const group = (role, title) => {
    const list = d.hosts.filter((h) => h.role === role);
    return list.length ? `<h2>${title}</h2><div class="host-grid">${list.map((h) => `<a class="host-card" href="#/host/${encodeURIComponent(h.id)}">${hostAva(h)}
      <b>${esc(h.name)}</b><small>${h.linked ? (h.decided ? `точность ${h.accuracy}% · ${h.decided} ${plural(h.decided, 'прогноз', 'прогноза', 'прогнозов')}` : 'прогнозов пока нет') : 'скоро в приложении'}</small></a>`).join('')}</div>` : '';
  };
  view.innerHTML = `<div class="page-head"><h1>Эксперты «Больше»</h1></div>
    <div class="vs-box"><div><small>Ведущие</small><b>${d.hosts_accuracy != null ? `${d.hosts_accuracy}%` : '—'}</b></div><span>против</span><div><small>Болельщики</small><b>${d.fans_accuracy != null ? `${d.fans_accuracy}%` : '—'}</b></div></div>
    <div class="note" style="margin-top:8px">Точность прогнозов «Кто выиграет?»: ведущие и комментаторы голосуют в приложении сами, как все.</div>
    ${group('host', 'Ведущие')}${group('ambassador', 'Амбассадоры')}${group('commentator', 'Комментаторы')}`;
}

async function hostScreen(id, token) {
  const [d] = await Promise.all([api(`/api/hosts/${encodeURIComponent(id)}`), loadMe(mskDay(0)), loadHosts()]);
  if (stale(token)) return;
  const h = d.host;
  const c = d.compare;
  const pick = (i) => {
    const m = i.match;
    const picked = i.pick === 1 ? m.p1 : m.p2;
    return `<a class="pred" href="#/match/${encodeURIComponent(m.match_id)}"><div class="pred-top"><span>${esc(tourTitle(m.tournament))}</span><span>${esc(`${cap(dayWord(m.start_at))}, ${localTime(m.start_at)}`)}</span></div>
      <div class="pred-body"><div class="pred-players"><div>${avatar(m.p1.photo)}<span class="${showScore(m) && m.winner === 1 ? 'w' : ''}">${esc(m.p1.name)}</span></div>
        <div>${avatar(m.p2.photo)}<span class="${showScore(m) && m.winner === 2 ? 'w' : ''}">${esc(m.p2.name)}</span></div></div>
        <div class="pred-pick ${i.right == null || !showScore(m) ? '' : i.right ? 'ok' : 'no'}"><small>Прогноз</small>${avatar(picked.photo, 'head')}<b>${esc(lastName(picked))}</b>
          ${i.right == null || !showScore(m) ? '' : `<span class="pred-xp">${i.right ? '✓ угадал' : '✗'}</span>`}</div></div></a>`;
  };
  const bc = d.broadcasts;
  const since = bc?.first ? new Date(`${bc.first}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '') : '';
  const date = (x) => new Date(`${x}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  const castRow = (b) => `<div class="bc-row">${b.cover ? `<img class="th" src="${esc(b.cover)}" alt="" loading="lazy" data-cover>` : '<span class="th nocov"></span>'}
    <span class="who"><b>${esc(b.players.map((n) => lastName({ name: n })).join(' — ') || 'Эфир «Больше»')}</b><small>${esc([date(b.date), b.tournament, b.round].filter(Boolean).join(' · '))}</small></span>
    <span class="bc-acts">${b.vk_url ? `<span class="mc-watch" data-ext="${esc(b.vk_url)}" role="link"><i>${ICON.play}</i>ВК</span>` : ''}</span></div>`;
  view.innerHTML = `<div class="host-head">${hostAva(h, 'h-ava big')}<div><small>${esc(ROLE_LABEL[h.role] ?? '')} «Больше»</small><h1>${esc(h.name)}</h1>
      ${h.bio ? `<p>${esc(h.bio)}</p>` : bc?.count ? `<p>Комментирует теннис на «Больше»${since ? ` с ${esc(since)}` : ''}.</p>` : ''}
      ${h.photo_credit ? `<p class="h-credit">${esc(h.photo_credit)}</p>` : ''}</div></div>
    ${h.linked ? `<div class="stats4" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><small>Точность</small><b>${h.accuracy != null ? `${h.accuracy}%` : '—'}</b></div>
      <div><small>Прогнозов</small><b>${h.votes}</b></div><div><small>Очки</small><b>${h.points}</b></div></div>` : '<div class="empty" style="margin-top:12px">Скоро здесь будут прогнозы — эксперт ещё не подключился к приложению</div>'}
    ${c ? `<div class="sec-title"><span>Сравнить со мной</span></div><div class="vs-box"><div><small>${esc(lastName({ name: h.name }))}</small><b>${c.host_right} из ${c.common}</b></div><span>общих матчей: ${c.common}</span><div><small>Ты</small><b>${c.me_right} из ${c.common}</b></div></div>
      ${c.common ? `<div class="note" style="margin-top:8px">${c.me_right > c.host_right ? 'Ты угадываешь лучше эксперта 🔥' : c.me_right === c.host_right ? 'Пока вровень — посмотрим, кто кого' : 'Эксперт пока впереди — догоняй'}</div>` : '<div class="note" style="margin-top:8px">Проголосуй в тех же матчах, что и эксперт, — здесь появится счёт.</div>'}` : ''}
    ${d.picks.length ? `<div class="sec-title"><span>Последние прогнозы</span></div>${d.picks.map(pick).join('')}` : ''}
    ${bc?.count ? `<div class="sec-title"><span>Эфиры «Больше»</span><span class="r">${bc.count}</span></div><div class="bc-list">${bc.last.map(castRow).join('')}</div>` : ''}`;
}

// ---------- profile: Профиль / Мои прогнозы / Мои игроки / Статистика; Достижения, Уровни, Рейтинг ----------
const PROFILE_TABS = [['', 'Профиль'], ['predictions', 'Мои прогнозы'], ['players', 'Мои игроки'], ['stats', 'Статистика']];
const ACH_CATS = [['all', 'Все'], ['predictions', 'Прогнозы'], ['tournaments', 'Турниры'], ['players', 'Игроки'], ['activity', 'Активность'], ['community', 'Сообщество']];
const nf = (n) => Number(n ?? 0).toLocaleString('ru-RU');
const delta = (n, unit = '') => (n ? `<i class="dl ${n > 0 ? 'up' : 'down'}">${n > 0 ? '↑' : '↓'} ${Math.abs(n)}${unit}</i>` : '');

// One achievement: icon, title, the condition, five stars, the bar, and the XP for the next level.
function achievementCard(a) {
  const stars = Array.from({ length: a.max_level }, (_, i) => `<i class="${i < a.level ? 'on' : ''}">★</i>`).join('');
  const goal = a.next ? `${nf(a.value)} из ${nf(a.next)} ${a.unit}` : `Высший уровень · ${nf(a.value)} ${a.unit}`;
  return `<button type="button" class="ach${a.level ? ' earned' : ' locked'}" data-ach>
    <span class="ach-ic">${a.icon}</span><b>${esc(a.title)}</b><span class="ach-stars">${stars}</span>
    <span class="ach-bar"><i style="width:${Math.round(a.progress * 100)}%"></i></span><small>${esc(goal)}</small>
    ${a.next ? `<small class="ach-xp">+${nf(a.reward)} XP</small>` : ''}
    <small class="more">${esc(a.about)}${a.next ? ` До ${a.level + 1}-го уровня ещё ${nf(a.to_next)}.` : ''}</small></button>`;
}
// The achievement closest to its next level — «Ближайшая цель».
const nearest = (achs) => [...achs].filter((a) => a.next).sort((a, c) => c.progress - a.progress || a.to_next - c.to_next);
function goalCard(a) {
  return `<a class="goal" href="#/achievements"><span class="ach-ic">${a.icon}</span><span class="goal-body"><b>${esc(a.title)}</b>
    <small>${esc(a.about)}</small><span class="ach-bar"><i style="width:${Math.round(a.progress * 100)}%"></i></span>
    <small>${nf(a.value)} из ${nf(a.next)} — ещё ${nf(a.to_next)}, и ${a.level ? `${a.level + 1}-й уровень` : 'достижение открыто'}</small></span>
    <span class="goal-xp">+${nf(a.reward)} XP</span></a>`;
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

function profileHead(sub) {
  const u = tg?.initDataUnsafe?.user ?? session?.user;
  const name = me?.user?.first_name || u?.first_name || 'Болельщик';
  const username = me?.user?.username || u?.username;
  return `<div class="page-head"><h1>Профиль</h1><a class="icon-btn" href="#/settings" aria-label="Настройки" title="Настройки">${ICON.gear}</a></div>
    <div class="me-card">${meAvatar()}<div><b>${esc(name)}</b><span>${username ? `@${esc(username)}` : signedIn() ? 'болельщик «Больше»' : 'Войди, чтобы копить опыт и видеть свои очки'}</span></div>
      ${signedIn() ? '<a class="me-edit" href="#/welcome">Редактировать</a>' : ''}</div>
    ${signedIn() ? '' : `<div style="margin-top:12px">${loginButton()}</div>`}
    <div class="tabs-line">${PROFILE_TABS.map(([k, label]) => `<a class="${k === sub ? 'on' : ''}" href="#/profile${k ? `/${k}` : ''}">${label}</a>`).join('')}</div>`;
}

async function profile(token, sub = '') {
  if (sub === 'predictions' || sub === 'stats') return predictionsScreen(token, sub);
  const [d] = await Promise.all([api('/api/levels?xp=0'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  if (sub === 'players') {
    view.innerHTML = `${profileHead(sub)}<div style="margin-top:14px">${me ? minePlayersBody() : '<div class="empty">Войди, чтобы отмечать игроков</div>'}</div>`;
    return;
  }
  const xp = me?.xp ?? 0;
  const lv = me?.level ?? levelFor(d.levels, d.legend_step, xp);
  const accuracy = me?.week?.accuracy_now ?? (me?.settled ? Math.round((100 * me.guessed) / me.settled) : null);
  const accDelta = me?.week?.accuracy_before != null && accuracy != null ? accuracy - me.week.accuracy_before : 0;
  const placeDelta = me?.rating?.place && me?.rating?.place_week_ago ? me.rating.place_week_ago - me.rating.place : 0;
  const achs = me?.achievements ?? d.achievements ?? [];
  const goal = nearest(achs)[0];
  const players = (me?.my_players ?? []).slice(0, 3);
  const plCard = (p) => {
    const g = p.live ?? p.next;
    return `<a class="mp-card" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo, 'head')}<b>${esc(p.name)}</b>
      ${p.live ? `<span class="pill-live">LIVE</span><small>${showScore({ status: 'live' }) ? `${esc(p.live.score)} · ` : ''}vs ${esc(lastName({ name: p.live.opponent }))}</small>`
        : g ? `<small>${esc(cap(dayWord(g.start_at)))}, ${esc(localTime(g.start_at))}<br>vs ${esc(lastName({ name: g.opponent }))}</small>` : '<small>матчей нет</small>'}</a>`;
  };
  view.innerHTML = `${profileHead('')}
    <a class="lv-card" href="#/levels">${BALL}<div class="cap">Твой уровень</div><div class="title">${esc(lv.title)}</div>
      <div class="prog"><i style="width:${Math.round((lv.progress ?? 0) * 100)}%"></i></div>
      <div class="xp">${nf(xp)} / ${nf(xp + (lv.to_next ?? 0))} XP</div>
      <div class="sub">${lv.next_title ? `Ещё ${nf(lv.to_next)} XP — и ты «${esc(lv.next_title)}»` : esc(lv.subtitle)}</div>
      <span class="go">${ICON.arrow}</span></a>
    <div class="stats4">
      <div><small>Точность</small><b>${accuracy != null ? `${accuracy}%` : '—'}</b>${delta(accDelta, '%')}</div>
      <div><small>Прогнозов</small><b>${nf(me?.votes_total)}</b>${me?.week?.votes ? `<i class="dl up">↑ ${me.week.votes}</i>` : ''}</div>
      <div><small>В серии</small><b>${nf(me?.streak)}</b><i class="dl">верных</i></div>
      <a href="#/rating"><small>Рейтинг</small><b>${me?.rating?.place ? `#${nf(me.rating.place)}` : '—'}</b>${delta(placeDelta)}</a>
    </div>
    ${goal ? `<div class="sec-title"><span>Ближайшая цель</span><a href="#/achievements">Все достижения →</a></div>${goalCard(goal)}` : ''}
    <div class="sec-title"><span>Мои игроки</span><a href="#/profile/players">Все игроки →</a></div>
    ${players.length ? `<div class="mp-grid">${players.map(plCard).join('')}</div>` : `<div class="empty">Отметь игроков звёздочкой — здесь будут их ближайшие матчи. <a href="#/players?all=1">Найти игроков</a></div>`}
    <div class="pf-links"><a href="#/achievements"><span>🏅</span><b>Достижения</b><small>${achs.filter((a) => a.level).length} из ${achs.length} открыто</small></a>
      <a href="#/rating"><span>📊</span><b>Рейтинг</b><small>${me?.rating?.place ? `ты №${nf(me.rating.place)} из ${nf(me.rating.of)}` : 'общий · неделя · турнир'}</small></a>
      <a href="#/hosts"><span>🎙</span><b>Эксперты «Больше»</b><small>прогнозы ведущих и сравнение с тобой</small></a></div>`;
}

// «Мои прогнозы» (Активные / Завершённые) and «Статистика».
let predTab = 'active';
let predTour = '';
let predRes = 'all';
async function predictionsScreen(token, sub) {
  const [d] = await Promise.all([signedIn() ? api('/api/me/predictions') : Promise.resolve({ items: [] }), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const items = d.items ?? [];
  const done = items.filter((i) => i.right != null);
  const active = items.filter((i) => i.right == null && i.match.status !== 'cancelled' && !DONE.includes(i.match.status));
  const tName = (i) => i.match.tournament.name;
  let body = '';
  if (!signedIn()) body = needLogin('Войди через Telegram — здесь будут все твои прогнозы.');
  else if (sub === 'stats') {
    const right = done.filter((i) => i.right).length;
    let run = 0;
    let best = 0;
    for (const i of [...done].sort((a, c) => Date.parse(a.match.start_at) - Date.parse(c.match.start_at))) { run = i.right ? run + 1 : 0; best = Math.max(best, run); }
    const group = (key) => {
      const m = new Map();
      for (const i of done) { const k = key(i); const r = m.get(k) ?? { n: 0, ok: 0 }; r.n += 1; r.ok += i.right ? 1 : 0; m.set(k, r); }
      return [...m].sort((a, c) => c[1].n - a[1].n);
    };
    const table = (rows, labelOf) => `<div class="stat-all">${rows.map(([k, r]) => `<div class="sa-row"><span>${esc(labelOf(k))}</span><b>${r.ok} из ${r.n}</b>
      <i class="sa-bar"><i style="width:${Math.round((100 * r.ok) / r.n)}%"></i></i></div>`).join('')}</div>`;
    body = done.length ? `<div class="stats4">
        <div><small>Точность</small><b>${Math.round((100 * right) / done.length)}%</b></div><div><small>Верных</small><b>${right}</b></div>
        <div><small>Неверных</small><b>${done.length - right}</b></div><div><small>Лучшая серия</small><b>${best}</b></div></div>
      <h2>По турнирам</h2>${table(group(tName), (k) => k)}
      <h2>По покрытиям</h2>${table(group((i) => i.match.tournament.surface ?? 'other'), (k) => cap(SURFACE[k] ?? 'другое'))}
      <div class="note" style="margin-top:12px">Ждут результата: ${active.length}. Опыт за прогнозы: ${nf(items.reduce((a, c) => a + (c.right == null ? 10 : c.xp), 0))} XP.</div>`
      : '<div class="empty">Статистика появится после первых завершённых прогнозов</div>';
  } else {
    const tours = [...new Set(done.map(tName))];
    let list = predTab === 'active' ? active : done;
    if (predTab === 'done') {
      if (predTour) list = list.filter((i) => tName(i) === predTour);
      if (predRes !== 'all') list = list.filter((i) => (predRes === 'ok' ? i.right : !i.right));
    }
    const card = (i) => {
      const m = i.match;
      const picked = i.pick === 1 ? m.p1 : m.p2;
      const when = `${cap(dayWord(m.start_at))}, ${localTime(m.start_at)}`;
      const score = i.right != null && showScore(m) ? ` · Счёт ${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '';
      return `<a class="pred" href="#/match/${encodeURIComponent(m.match_id)}" data-pred="${esc(m.match_id)}">
        <div class="pred-top"><span>${esc(tourTitle(m.tournament))}</span><span>${esc(when)}${esc(score)}</span></div>
        <div class="pred-body"><div class="pred-players"><div>${avatar(m.p1.photo)}<span class="${showScore(m) && m.winner === 1 ? 'w' : ''}">${esc(m.p1.name)}</span></div>
          <div>${avatar(m.p2.photo)}<span class="${showScore(m) && m.winner === 2 ? 'w' : ''}">${esc(m.p2.name)}</span></div></div>
          <div class="pred-pick ${i.right == null ? '' : i.right ? 'ok' : 'no'}"><small>Твой прогноз</small>${avatar(picked.photo, 'head')}<b>${esc(lastName(picked))}</b>
            ${i.right == null ? '' : `<span class="pred-xp">${i.right ? `✓ +${i.xp} XP` : '✗ +10 XP'}</span>`}</div></div></a>`;
    };
    body = `<div class="seg2 pred-tabs"><button type="button" data-pt="active" class="${predTab === 'active' ? 'on' : ''}">Активные ${active.length || ''}</button><button type="button" data-pt="done" class="${predTab === 'done' ? 'on' : ''}">Завершённые ${done.length || ''}</button></div>
      ${predTab === 'done' && done.length ? `<div class="chips"><button class="chip${predRes === 'all' ? ' on' : ''}" data-pr="all">Все</button><button class="chip${predRes === 'ok' ? ' on' : ''}" data-pr="ok">Верные</button><button class="chip${predRes === 'no' ? ' on' : ''}" data-pr="no">Неверные</button></div>
        ${tours.length > 1 ? `<div class="chips" style="margin-top:8px"><button class="chip${predTour ? '' : ' on'}" data-ptour="">Все турниры</button>${tours.map((t) => `<button class="chip${t === predTour ? ' on' : ''}" data-ptour="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}` : ''}
      <div style="margin-top:12px">${list.map(card).join('') || `<div class="empty">${predTab === 'active' ? 'Активных прогнозов нет — проголосуй «Кто выиграет?» в любом будущем матче' : 'Пока нет завершённых прогнозов'}</div>`}</div>`;
  }
  view.innerHTML = `${profileHead(sub === 'stats' ? 'stats' : 'predictions')}<div style="margin-top:14px">${body}</div>`;
  const rerender = () => predictionsScreen(token, sub).catch(() => {});
  view.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => { predTab = b.dataset.pt; rerender(); }));
  view.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => { predRes = b.dataset.pr; rerender(); }));
  view.querySelectorAll('[data-ptour]').forEach((b) => b.addEventListener('click', () => { predTour = b.dataset.ptour; rerender(); }));
  view.querySelectorAll('[data-pred]').forEach((a) => a.addEventListener('click', () => { matchPane[a.dataset.pred] = 'votes'; }));
}

// «Достижения»: Ближайшие / Все (by category) / Мои награды.
async function achievementsScreen(token, params) {
  const tab = params.get('tab') ?? 'near';
  const catSel = params.get('cat') ?? 'all';
  const [d] = await Promise.all([api('/api/levels?xp=0'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const achs = me?.achievements ?? d.achievements ?? [];
  const link = (over) => `#/achievements?${new URLSearchParams({ tab, cat: catSel, ...over })}`;
  let body = '';
  if (tab === 'near') {
    const near = nearest(achs).slice(0, 3);
    body = near.length ? near.map(goalCard).join('') : '<div class="empty">Все достижения на высшем уровне — легенда!</div>';
  } else if (tab === 'all') {
    const list = achs.filter((a) => catSel === 'all' || a.cat === catSel).sort((a, c) => c.level - a.level || c.progress - a.progress);
    body = `<div class="chips">${ACH_CATS.map(([k, label]) => `<a class="chip${k === catSel ? ' on' : ''}" href="${link({ cat: k })}">${label}</a>`).join('')}</div>
      <div class="achs" style="margin-top:12px">${list.map(achievementCard).join('')}</div>`;
  } else {
    const mine = achs.filter((a) => a.level).sort((a, c) => c.earned_xp - a.earned_xp);
    body = mine.length ? `<div class="note">Получено опыта за достижения: <b>${nf(mine.reduce((a, c) => a + c.earned_xp, 0))} XP</b></div><div class="achs">${mine.map(achievementCard).join('')}</div>`
      : '<div class="empty">Наград пока нет — первая ближе, чем кажется: загляни в «Ближайшие»</div>';
  }
  view.innerHTML = `<div class="page-head"><h1>Достижения</h1></div>
    <div class="ach-banner">🏆 Собирай достижения, получай опыт за каждый уровень и поднимайся выше</div>
    <div class="tabs-line">${[['near', 'Ближайшие'], ['all', 'Все достижения'], ['mine', 'Мои награды']].map(([k, label]) => `<a class="${k === tab ? 'on' : ''}" href="${link({ tab: k })}">${label}</a>`).join('')}</div>
    <div style="margin-top:12px">${body}</div>
    <div class="note" style="margin-top:12px">За уровни достижений — +50, +100, +200, +300 и +500 XP. У каждого достижения пять уровней.</div>`;
  view.querySelectorAll('[data-ach]').forEach((b) => b.addEventListener('click', () => b.classList.toggle('open')));
}

// «Уровни»: the ladder and how XP grows.
async function levelsScreen(token) {
  const [d] = await Promise.all([api('/api/levels?xp=0'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const xp = me?.xp ?? 0;
  const cur = d.levels.reduce((k, l, i) => (xp >= l.from ? i : k), 0);
  view.innerHTML = `<div class="page-head"><h1>Уровни</h1></div>
    <div class="ladder">${d.levels.map((l, i) => `<div class="${xp >= l.from ? 'on' : ''}${i === cur ? ' cur' : ''}"><b>${esc(l.title)}</b><small>${esc(l.subtitle)}</small><span>${nf(l.from)} XP</span></div>`).join('')}</div>
    <h2>Как растёт опыт</h2>
    <div class="note">+10 XP за прогноз, +20 за верный (вдвое — если угадал вопреки большинству). «Вопрос дня»: +10 за ответ, +20 за верный. Очки сеток турниров и уровни достижений — тоже в опыт.
      После «Легенды» каждые ${nf(d.legend_step)} XP — ещё один «титул Большого шлема».</div>
    ${me ? `<div class="note">Сейчас у тебя ${nf(xp)} XP: прогнозы и сетки — ${nf(me.xp_predictions)}, достижения — ${nf(me.xp_achievements)}.</div>` : ''}`;
}

// «Рейтинг»: points for right predictions (not XP) — overall, the week, one tournament.
async function ratingScreen(token, params) {
  const period = params.get('period') ?? 'all';
  const tKey = params.get('t') ?? '';
  const tours = period === 'tournament' ? (await api('/api/tournaments').catch(() => ({ tournaments: [] }))).tournaments.filter((t) => t.level === 'tour' && t.status !== 'soon') : [];
  const key = period === 'tournament' ? (tKey || tours[0]?.key || '') : '';
  const [d] = await Promise.all([key || period !== 'tournament' ? api(`/api/rating?period=${period}${key ? `&t=${encodeURIComponent(key)}` : ''}`) : Promise.resolve({ top: [], fans: 0 }), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const row = (r) => `<div class="bk-row${r.me ? ' me' : ''}"><span>${r.place}</span><span>${esc(r.name)}${r.me ? ' (ты)' : ''}<small class="muted"> · верных ${r.right}</small></span><b>${nf(r.points)}</b></div>`;
  view.innerHTML = `<div class="page-head"><h1>Рейтинг</h1></div>
    <div class="tabs-line">${[['all', 'Общий'], ['week', 'Неделя'], ['tournament', 'Турнир']].map(([k, label]) => `<a class="${k === period ? 'on' : ''}" href="#/rating?period=${k}">${label}</a>`).join('')}<a href="#/hosts">Ведущие</a></div>
    ${period === 'tournament' ? `<div class="chips" style="margin-top:10px">${tours.map((t) => `<a class="chip${t.key === key ? ' on' : ''}" href="#/rating?period=tournament&t=${encodeURIComponent(t.key)}">${esc(t.tour)} ${esc(t.name)}</a>`).join('')}</div>` : ''}
    ${d.me ? `<div class="rt-me"><span>Ты</span><b>№${nf(d.me.place)}</b><small>из ${nf(d.fans)} · ${nf(d.me.points)} очков</small></div>` : signedIn() ? '<div class="note" style="margin-top:12px">Тебя пока нет в таблице — очки дают верные прогнозы.</div>' : `<div style="margin-top:12px">${loginButton()}</div>`}
    <div class="bk-table" style="margin-top:12px">${(d.top ?? []).map(row).join('') || '<div class="empty">Пока никого — стань первым</div>'}</div>
    <div class="note" style="margin-top:12px">Очки рейтинга — только за верные прогнозы: победитель матча +10 (+20, если так думали меньше 35% болельщиков), «Вопрос дня» +10, очки сеток турниров. Опыт за активность и достижения в рейтинг не идёт — новичок может догнать любого. Ведущие «Больше» появятся здесь со своими профилями.</div>`;
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

const RULES = 'Выбери победителя каждого оставшегося матча — до финала. Отправленную сетку можно менять до начала первого матча, потом — до конца турнира уже нет. Очки дают матчи, которые начались после отправки: финал — 32, полуфинал — 16, четвертьфинал — 8, 1/8 — 4, 1/16 — 2, ранние круги — 1. Очки сеток идут и в опыт.';

let tourFilter = 'all';
let tourStatus = 'now';
const TOUR_TABS = [['now', 'Идут сейчас'], ['soon', 'Скоро'], ['done', 'Завершены']];
const dayIso = (d) => (d ? `${d}T12:00:00Z` : null);
// One tournament in the list: logo, ★, «ATP 1000», the city, dates · surface, the game bracket line, live now.
function tourCard(t) {
  const dates = datesLabel(t.starts_at ?? dayIso(t.first_day), t.ends_at ?? dayIso(t.last_day));
  const info = [dates, SURFACE[t.surface]].filter(Boolean).join(' · ');
  const b = t.bracket;
  const mine = b ? me?.brackets?.find((x) => x.bracket_key === b.key) : null;
  const bk = !b ? '' : `<a class="tl-bk" href="#/bracket/${encodeURIComponent(b.key)}"><span class="ic">🏆</span><span><b>Игровая сетка</b><small>${mine
    ? esc(`очков ${b.mine?.points ?? mine.points}${mine.better_than != null ? ` · лучше, чем у ${mine.better_than}% участников` : ''}`)
    : b.status === 'open' ? `Осталось ${b.open_matches} ${plural(b.open_matches, 'матч', 'матча', 'матчей')} для прогноза` : b.champion ? `Чемпион: ${esc(b.champion)}` : 'Турнир завершён'}</small></span><span class="go">›</span></a>`;
  const foot = t.status === 'soon'
    ? `<span class="tl-soon">🕑 Скоро начнётся${t.next_start ? ` · первый матч ${esc(dayWord(t.next_start))} в ${esc(localTime(t.next_start))}` : ''}</span>`
    : t.live ? `<span class="tl-live"><i></i>${t.live} ${plural(t.live, 'матч', 'матча', 'матчей')} сейчас</span>` : t.highlights ? `<span class="tl-hl">▶ хайлайтов: ${t.highlights}</span>` : '<span></span>';
  return `<div class="tl-card${t.tour === 'WTA' ? ' wta' : ''}"><a class="tl-main" href="#/tournament/${encodeURIComponent(t.key)}">
      ${t.logo ? `<img class="tc-logo" src="${esc(t.logo)}" alt="" loading="lazy" data-cover>` : ''}
      <div class="tc-tier">${esc(tierLabel(t))}</div><div class="tc-city">${esc(t.name)}</div>
      <div class="tc-dates">${esc(info)}${b?.round && t.status === 'now' ? ` · ${esc(b.round.toLowerCase())}` : ''}</div></a>
    <span class="tl-fav">${favButton(t.name)}</span>
    ${bk}
    <div class="tl-foot">${foot}<a class="tl-go" href="#/tournament/${encodeURIComponent(t.key)}?tab=matches">Матчи турнира →</a></div></div>`;
}

async function tournamentsTab(token) {
  const [d] = await Promise.all([api('/api/tournaments'), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const byTour = d.tournaments.filter((t) => tourFilter === 'all' || (tourFilter === 'challenger' ? t.level === 'challenger' : t.level === 'tour' && t.tour === tourFilter));
  const counts = Object.fromEntries(TOUR_TABS.map(([k]) => [k, byTour.filter((t) => t.status === k).length]));
  const order = (a, c) => isFav(c.name) - isFav(a.name) || (a.level === 'tour' ? 0 : 1) - (c.level === 'tour' ? 0 : 1)
    || ['slam', 'finals', '1000', '500', '250', 'tour', 'challenger'].indexOf(a.tier) - ['slam', 'finals', '1000', '500', '250', 'tour', 'challenger'].indexOf(c.tier)
    || (tourStatus === 'done' ? c.last_day.localeCompare(a.last_day) : a.first_day.localeCompare(c.first_day));
  const list = byTour.filter((t) => t.status === tourStatus).sort(order);
  view.innerHTML = `<div class="page-head"><h1>Турниры</h1></div>
    <div class="chips">${[['all', 'Все'], ['ATP', 'ATP'], ['WTA', 'WTA'], ['challenger', 'Челленджеры']].map(([k, label]) => `<button class="chip${k === tourFilter ? ' on' : ''}" type="button" data-tf="${k}">${label}</button>`).join('')}</div>
    <div class="tabs-line">${TOUR_TABS.map(([k, label]) => `<a href="#/tournaments" class="${k === tourStatus ? 'on' : ''}" data-ts="${k}">${label}${counts[k] ? ` <small>${counts[k]}</small>` : ''}</a>`).join('')}</div>
    <div class="tours" style="margin-top:12px">${list.map(tourCard).join('') || `<div class="empty">${tourStatus === 'soon' ? 'Новые турниры появятся, когда опубликуют их расписание' : tourStatus === 'done' ? 'Завершённых турниров за последние дни нет' : 'Сейчас турниров нет'}</div>`}</div>
    <details class="rules"><summary>Как играть в сетку</summary>${esc(RULES)}</details>`;
  view.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { tourFilter = b.dataset.tf; tournamentsTab(token).catch(() => {}); }));
  view.querySelectorAll('[data-ts]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); tourStatus = b.dataset.ts; tournamentsTab(token).catch(() => {}); }));
}

// ---------- the tournament page: Обзор / Матчи / Сетка / Игроки / Хайлайты ----------
const TOUR_PAGE_TABS = [['overview', 'Обзор'], ['matches', 'Матчи'], ['bracket', 'Сетка'], ['players', 'Игроки'], ['highlights', 'Хайлайты']];

function communityBlock(d) {
  if (!d?.community?.length) return '';
  const top = d.community.slice(0, 4);
  const rest = 100 - top.reduce((a, c) => a + c.pct, 0);
  const bar = (label, pct, cls = '') => `<div class="res-bar ${cls}"><div class="lbl"><span>${esc(label)}</span><b>${pct}%</b></div><div class="track"><i style="width:${pct}%"></i></div></div>`;
  return `<div class="score-card"><div class="res-title">Прогнозы сообщества — кто выиграет турнир</div>
    <div class="res-bars">${top.map((c, i) => bar(lastName({ name: c.name }), c.pct, i ? '' : 'picked')).join('')}${rest > 0 && d.community.length > 4 ? bar('Другие', rest) : ''}</div></div>`;
}

async function tournamentScreen(key, token, params) {
  const tab = params.get('tab') ?? 'overview';
  const [d] = await Promise.all([api(`/api/tournaments/${encodeURIComponent(key)}`), loadMe(mskDay(0))]);
  if (stale(token)) return;
  const t = d.tournament;
  const ms = d.matches.filter((m) => !m.is_doubles);
  const b = t.bracket;
  const needDraw = b && (tab === 'bracket' || tab === 'players');
  const bv = needDraw ? await api(`/api/brackets/${encodeURIComponent(b.key)}`).catch(() => null) : null;
  if (stale(token)) return;
  const tabs = TOUR_PAGE_TABS.filter(([k]) => k !== 'bracket' || b);
  const hl = ms.filter((m) => m.highlights && showScore(m));
  const link = (k) => `#/tournament/${encodeURIComponent(key)}?tab=${k}`;
  const dates = datesLabel(t.starts_at ?? dayIso(t.first_day), t.ends_at ?? dayIso(t.last_day));
  const live = ms.filter((m) => m.status === 'live');
  const next = ms.filter((m) => m.status === 'scheduled').slice(0, 4);
  const onBolshe = ms.filter((m) => m.bolshe && (m.status === 'live' || m.status === 'scheduled')).slice(0, 4);
  let body = '';
  if (tab === 'overview') {
    const mine = b ? me?.brackets?.find((x) => x.bracket_key === b.key) : null;
    body = `${b ? `<div class="tp-game"><div class="tp-game-top"><span class="ic">🏆</span><div><b>Игровая сетка</b><small>Выбери победителей и получай очки</small></div></div>
        <div class="tp-stats"><div><b>${b.fans}</b><small>${plural(b.fans, 'участник', 'участника', 'участников')}</small></div>
          <div><b>${b.mine ? b.mine.points : '—'}</b><small>твои очки</small></div><div><b>${b.mine ? b.mine.possible : b.open_matches}</b><small>${b.mine ? 'можно набрать' : 'матчей впереди'}</small></div></div>
        ${mine ? bracketLine(b.key) : ''}<a class="cta" href="#/bracket/${encodeURIComponent(b.key)}"><span class="ic">${ICON.play}</span>${b.mine ? 'Моя сетка' : b.status === 'open' ? 'Заполнить сетку' : 'Сетка турнира'}<span class="go">${ICON.arrow}</span></a></div>` : ''}
      ${live.length ? `<div class="sec-title"><span>Сейчас идут</span><span class="r">${live.length}</span></div>${live.map(matchCard).join('')}` : ''}
      ${next.length ? `<div class="sec-title"><span>Ближайшие матчи</span><a href="${link('matches')}">Все →</a></div>${next.map(matchCard).join('')}` : ''}
      ${onBolshe.length ? `<div class="sec-title"><span>Где смотреть</span></div>${onBolshe.map(matchCard).join('')}` : ''}
      ${hl.length ? `<div class="sec-title"><span>Хайлайты турнира</span><a href="${link('highlights')}">Все →</a></div>` : ''}
      ${t.about ? `<div class="note" style="margin-top:16px">${esc(t.about)}</div>` : ''}`;
  } else if (tab === 'matches') {
    const s = params.get('s') ?? 'all';
    const byS = { all: ms.length, live: 0, upcoming: 0, done: 0 };
    for (const m of ms) byS[statusOf(m)] += 1;
    const list = ms.filter((m) => s === 'all' || statusOf(m) === s);
    const days = [...new Set(list.map((m) => m.date_msk))].sort((a, c) => (s === 'done' ? c.localeCompare(a) : a.localeCompare(c)));
    body = `<div class="tabs-line">${STATUS_TABS.map(([k, label]) => `<a class="${k === s ? 'on' : ''}" href="${link('matches')}&s=${k}">${label}${k !== 'all' && byS[k] ? ` <small>${byS[k]}</small>` : ''}</a>`).join('')}</div>
      ${days.map((day) => `<div class="date-row"><b>${esc(dateTitle(day))}</b></div>${list.filter((m) => m.date_msk === day).map(matchCard).join('')}`).join('') || '<div class="empty" style="margin-top:12px">Матчей нет</div>'}`;
  } else if (tab === 'bracket') {
    body = `${b && me ? bracketLine(b.key) : ''}<a class="cta" style="margin-top:12px" href="#/bracket/${encodeURIComponent(b.key)}"><span class="ic">🏆</span>${b.mine ? 'Открыть мою сетку' : b.status === 'open' ? 'Заполнить сетку' : 'Сетка турнира'}<span class="go">${ICON.arrow}</span></a>
      <div style="margin-top:12px">${communityBlock(bv)}</div>
      ${bv?.table?.length ? `<h2>Таблица участников</h2><div class="bk-table">${bv.table.slice(0, 10).map((r) => `<div class="bk-row${r.me ? ' me' : ''}"><span>${r.place}</span><span>${esc(r.name)}${r.me ? ' (ты)' : ''}</span><b>${r.points}</b></div>`).join('')}</div>` : ''}`;
  } else if (tab === 'players') {
    if (bv) body = drawPlayers(bv);
    else {
      const seen = new Map();
      for (const m of ms) for (const p of [m.p1, m.p2]) if (p.player_id && !seen.has(p.player_id)) seen.set(p.player_id, p);
      const list = [...seen.values()].sort((a, c) => (a.rank ?? 9999) - (c.rank ?? 9999));
      body = list.length ? `<div class="stat-list">${list.map((p) => `<a class="dr-row" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo, 'ava')}<span><b>${esc(p.name)}</b></span><small>${p.rank ? `№${p.rank}` : ''}</small></a>`).join('')}</div>` : '<div class="empty">Игроков пока нет</div>';
    }
  } else if (tab === 'highlights') {
    body = hl.length ? `<div class="tl-hl-grid">${hl.map((m, i) => {
      const review = hlFiles(m.highlights).find((f) => f.kind === 'review') ?? hlFiles(m.highlights)[0];
      return `<button class="hl-card" type="button" data-thl="${i}">${m.highlights.cover ? `<img src="${esc(m.highlights.cover)}" alt="" loading="lazy" data-cover>` : ''}<span class="hl-play">${ICON.play}</span>
        <span class="hl-cap"><b>${esc(lastName(m.p1))} — ${esc(lastName(m.p2))}</b><small>${esc(shortDate(m.date_msk))} · ${hlLabel(review)} ${mmss(review.secs)}</small></span></button>`;
    }).join('')}</div>` : `<div class="empty">${noSpoilers ? 'Хайлайты скрыты — выключи «без спойлеров» вверху' : 'Хайлайтов этого турнира пока нет — они появляются после матчей, которые показывал «Больше»'}</div>`;
  }
  view.innerHTML = `<div class="tp-head${t.tour === 'WTA' ? ' wta' : ''}">${t.logo ? `<img class="tc-logo" src="${esc(t.logo)}" alt="" loading="lazy" data-cover>` : ''}
      <span class="tl-fav">${favButton(t.name)}</span>
      <div class="tc-tier">${esc(tierLabel(t))}</div><div class="tc-city">${esc(t.name)}</div>
      <div class="tc-dates">${esc([dates, SURFACE[t.surface], b?.round && t.status === 'now' ? b.round.toLowerCase() : t.status === 'done' ? 'завершён' : null].filter(Boolean).join(' · '))}</div></div>
    <div class="chips tp-tabs">${tabs.map(([k, label]) => `<a class="chip${k === tab ? ' on' : ''}" href="${link(k)}">${label}${k === 'highlights' && hl.length ? ` ${hl.length}` : ''}</a>`).join('')}</div>
    <div class="tp-body">${body}</div>`;
  view.querySelectorAll('[data-thl]').forEach((el) => el.addEventListener('click', () => {
    const m = hl[Number(el.dataset.thl)];
    if (m) openHighlights(m.highlights, `${lastName(m.p1)} — ${lastName(m.p2)}`);
  }));
  bindFanActions(view, () => tournamentScreen(key, token, params));
  if (t.status === 'now' && (tab === 'overview' || tab === 'matches')) refreshEvery(45000, () => tournamentScreen(key, token, params));
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
const bracketEditing = {};

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
  const head = `<h1>${d.tournament_key ? `<a class="h1-link" href="#/tournament/${encodeURIComponent(d.tournament_key)}">${esc(d.name)}</a>` : esc(d.name)}</h1>
    <div class="muted small" style="margin:-6px 2px 12px">${esc(SURFACE[d.surface] ?? '')}${d.status === 'open' ? ` · идёт ${esc(draw.rounds[current].title.toLowerCase())}` : ' · турнир завершён'}</div>
    <div class="seg2"><a class="${showPlayers ? '' : 'on'}" href="#/bracket/${encodeURIComponent(key)}">Сетка</a><a class="${showPlayers ? 'on' : ''}" href="#/bracket/${encodeURIComponent(key)}?view=players">Игроки</a></div>`;
  if (showPlayers) {
    view.innerHTML = `${head}${drawPlayers(d)}`;
    return;
  }
  const sent = d.entry;
  // A sent bracket can be changed until its first match starts («Изменить»).
  const editing = Boolean(sent?.editable && bracketEditing[key]);
  const editable = (editing || !sent) && d.status === 'open' && signedIn();
  if (editing && !bracketDrafts[`${key}:edit`]) bracketDrafts[`${key}:edit`] = { ...sent.picks };
  const draftKey = editing ? `${key}:edit` : key;
  const picks = editing ? cleanPicks(draw, bracketDrafts[draftKey]) : sent ? sent.picks : cleanPicks(draw, loadDraft(key));
  const sides = drawSides(draw, picks);
  const open = openKeys(draw);
  const filled = open.filter((k) => picks[k] != null).length;
  const r = bracketRound[key] ?? current;
  const player = (pos) => draw.players.find((p) => p.pos === pos);
  const sideRow = (pos, m, k, other, rr = r, compact = false) => {
    const p = pos == null ? null : player(pos);
    const myPick = picks[slotKey(rr, k)];
    const won = m.w != null && m.w === pos;
    const lost = m.w != null && pos != null && m.w !== pos;
    const picked = myPick != null && myPick === pos;
    const mark = picked && m.w != null ? (won ? '<span class="bk-ok">✓</span>' : '<span class="bk-no">✗</span>') : '';
    const name = p ? `${esc(lastName({ name: p.name_ru }))}${p.seed ? ` <small>(${esc(p.seed)})</small>` : p.tag ? ` <small>(${esc(p.tag)})</small>` : ''}` : `<span class="muted">${compact ? '—' : rr > 0 ? 'победитель прошлого круга' : '—'}</span>`;
    const canPick = editable && m.w == null && pos != null && other !== undefined;
    return `<button class="${compact ? 'tr-side' : 'bk-side'}${won ? ' won' : ''}${lost ? ' lost' : ''}${picked ? ' picked' : ''}" type="button"${canPick ? ` data-pick="${slotKey(rr, k)}" data-pos="${pos}"` : ' disabled'}>
      ${p ? avatar(p.photo, 'ava') : '<span class="ava ph"></span>'}<span class="bk-name">${name}</span>${!compact && p?.rank ? `<small class="muted">№${p.rank}</small>` : ''}${mark}</button>`;
  };
  // The visual bracket from round `from` to the final, and the champion (real or picked).
  const tree = (from) => {
    const last = draw.rounds.length - 1;
    const champPos = draw.rounds[last].matches[0]?.w ?? picks[slotKey(last, 0)] ?? null;
    const champ = champPos != null ? player(champPos) : null;
    return `<div class="tree">${draw.rounds.slice(from).map((round, i) => {
      const rr = from + i;
      return `<div class="tr-col"><div class="tr-cap">${esc(round.short)} <small>+${roundPoints(draw, rr)}</small></div>${round.matches.map((m, k) => {
        const [h, a] = sides[rr][k];
        return `<div class="tr-cell"><div class="tr-match">${sideRow(h, m, k, a, rr, true)}${sideRow(a, m, k, h, rr, true)}</div></div>`;
      }).join('')}</div>`;
    }).join('')}<div class="tr-col tr-champ"><div class="tr-cap">🏆</div><div class="tr-cell"><div class="tr-win">${champ
      ? `${avatar(champ.photo, 'head')}<span>${esc(lastName({ name: champ.name_ru }))}</span><small>${draw.rounds[last].matches[0]?.w != null ? 'чемпион' : 'твой выбор'}</small>` : '<span class="muted">Победитель</span>'}</div></div></div></div>`;
  };
  const round = draw.rounds[r];
  const status = !signedIn() && !sent
    ? needLogin('Войди через Telegram, чтобы заполнить сетку и попасть в таблицу.')
    : sent
      ? `<div class="bk-note"><b>${sent.updated_at ? 'Сетка сохранена' : 'Твоя сетка отправлена'}</b> ${esc(new Date(sent.updated_at ?? sent.submitted_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}.
        Очки: <b>${sent.points}</b> · угадано ${sent.correct} из ${sent.decided}${d.status === 'open' ? ` · ещё можно набрать до ${sent.possible}` : ''}${d.place ? ` · место ${d.place} из ${d.table.length}` : ''}
        ${sent.editable ? `<div class="bk-edit">${editing ? 'Меняешь сетку — сохрани до начала первого матча' : `Можно изменить до ${esc(`${dayWord(sent.lock_at)} ${localTime(sent.lock_at)}`)}`}
          <button type="button" class="chip${editing ? '' : ' on'}" data-edit>${editing ? 'Отменить' : 'Изменить'}</button></div>` : ''}</div>`
      : d.status === 'open' ? `<div class="bk-note">${esc(RULES)}</div>` : '<div class="bk-note">Турнир завершён.</div>';
  view.innerHTML = `${head}
    ${status}
    <div class="chips bk-rounds">${draw.rounds.map((x, i) => `<button class="chip${i === r ? ' on' : ''}" type="button" data-round="${i}">${esc(x.short)} <small>+${roundPoints(draw, i)}</small></button>`).join('')}</div>
    ${round.matches.length <= 8 ? tree(r) : `<div class="bk-list">${round.matches.map((m, k) => {
      const [h, a] = sides[r][k];
      const when = m.w != null ? '' : m.status === 'live' ? '<span class="pill-live">LIVE</span>' : m.start ? esc(`${dayWord(m.start)} ${localTime(m.start)}`) : '';
      return `<div class="bk-match"><div class="bk-meta"><span>${esc(round.title)} · матч ${k + 1}</span><span>${when}</span></div>${sideRow(h, m, k, a)}${sideRow(a, m, k, h)}</div>`;
    }).join('')}</div>`}
    ${communityBlock(d)}
    ${editable ? `<div class="bk-send"><button type="button" data-send${filled < open.length ? ' disabled' : ''}>${filled < open.length ? `Заполнено ${filled} из ${open.length}` : editing ? 'Сохранить изменения' : 'Отправить сетку'}</button></div>` : ''}
    ${d.table.length ? `<h2>Таблица</h2><div class="bk-table">${d.table.slice(0, 20).map((t) => `<div class="bk-row${t.me ? ' me' : ''}"><span>${t.place}</span><span>${esc(t.name)}${t.me ? ' (ты)' : ''}</span><b>${t.points}</b></div>`).join('')}</div>` : ''}`;
  view.querySelectorAll('[data-round]').forEach((b) => b.addEventListener('click', () => {
    bracketRound[key] = Number(b.dataset.round);
    bracketScreen(key, token, params).catch(() => {});
  }));
  view.querySelector('[data-edit]')?.addEventListener('click', () => {
    bracketEditing[key] = !editing;
    delete bracketDrafts[`${key}:edit`];
    bracketScreen(key, token, params).catch(() => {});
  });
  view.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    const next = cleanPicks(draw, { ...picks, [b.dataset.pick]: Number(b.dataset.pos) });
    if (editing) bracketDrafts[draftKey] = next;
    else saveDraft(key, next);
    tg?.HapticFeedback?.selectionChanged?.();
    bracketScreen(key, token, params).catch(() => {});
  }));
  view.querySelector('[data-send]')?.addEventListener('click', async (e) => {
    const go = () => post(`/api/brackets/${encodeURIComponent(key)}`, { picks: cleanPicks(draw, editing ? bracketDrafts[draftKey] : loadDraft(key)) })
      .then(() => { toast(editing ? 'Сетка изменена' : 'Сетка отправлена'); bracketEditing[key] = false; delete bracketDrafts[`${key}:edit`]; return bracketScreen(key, token, params); })
      .catch((error) => toast(error.message));
    e.currentTarget.disabled = true;
    const text = editing ? 'Сохранить новую сетку?' : 'Отправить сетку? Поменять её можно будет до начала первого матча.';
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
  if (!signedIn()) { location.hash = '#/'; return; }
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
    ${session ? `<h2>Вход на сайте</h2><p class="muted small">Ты вошёл через Telegram${session.user?.first_name ? ` как ${esc(session.user.first_name)}` : ''}.</p>
    <button class="more-btn" type="button" data-logout>Выйти на этом устройстве</button>` : !signedIn() ? `<h2>Вход</h2>${loginButton()}` : ''}
    <p class="muted small">Время матчей и эфиров показывается по часовому поясу телефона (${esc(tzLabel())}).</p>`;
  view.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await post('/api/web-logout', {}).catch(() => {});
    saveSession(null);
    me = null;
    toast('Ты вышел на этом устройстве');
    settings();
  });
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
    '': 'home', question: 'home', matches: 'matches', match: 'matches', tournaments: 'tournaments', tournament: 'tournaments', bracket: 'tournaments',
    players: 'players', player: 'players', profile: 'profile', settings: 'profile', achievements: 'profile', levels: 'profile', rating: 'profile', hosts: 'profile', host: 'profile',
  }[parts[0] ?? ''] ?? 'home';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const detail = ['match', 'player', 'settings', 'bracket', 'question', 'tournament', 'achievements', 'levels', 'rating', 'hosts', 'host'].includes(parts[0]);
  if (tg?.BackButton) { if (detail) tg.BackButton.show(); else tg.BackButton.hide(); }
  if (!view.innerHTML) view.innerHTML = '<div class="loading">Загружаем…</div>';
  try {
    if (parts[0] === 'match' && parts[1]) await match(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'player' && parts[1]) await player(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'matches') await matches(params, token);
    else if (parts[0] === 'players') await players(params, token);
    else if (parts[0] === 'profile') await profile(token, parts[1] ?? '');
    else if (parts[0] === 'achievements') await achievementsScreen(token, params);
    else if (parts[0] === 'levels') await levelsScreen(token);
    else if (parts[0] === 'rating') await ratingScreen(token, params);
    else if (parts[0] === 'hosts') await hostsScreen(token);
    else if (parts[0] === 'host' && parts[1]) await hostScreen(decodeURIComponent(parts[1]), token);
    else if (parts[0] === 'settings') await settings(token);
    else if (parts[0] === 'welcome') await welcome(token);
    else if (parts[0] === 'question') await questionScreen(token);
    else if (parts[0] === 'tournaments') await tournamentsTab(token);
    else if (parts[0] === 'tournament' && parts[1]) await tournamentScreen(decodeURIComponent(parts[1]), token, params);
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
