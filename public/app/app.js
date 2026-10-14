// «Больше. Теннис» Telegram Mini App: one small router, no framework, no patch layers.
// Screens: home (#/), matches of a day (#/matches), match card (#/match/<id>),
// players (#/players), player (#/player/<id>), profile with levels (#/profile).

const tg = window.Telegram?.WebApp;
const view = document.getElementById('view');
let timer = null;
// Every navigation gets a token; a screen whose data arrives after the user moved on draws nothing.
let routeToken = 0;
const stale = (token) => token !== routeToken;

if (tg) {
  tg.ready();
  tg.expand();
  document.documentElement.dataset.tg = '1';
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mskTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }) : '');
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
  const res = await fetch(path);
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
  if (m.status === 'scheduled') return `<span>${mskTime(m.start_at)}</span>`;
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
    ${matchRow(m, 1)}${matchRow(m, 2)}${hidden}${bolshe}</a>`;
}

// One line per match for the home screen: "13:00 · Медведев — Циципас".
function compactLine(m) {
  const score = m.status === 'scheduled' ? '' : showScore(m) ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '';
  const when = m.status === 'live' ? '<span class="live">LIVE</span>' : m.status === 'scheduled' ? mskTime(m.start_at) : (STATUS[m.status] ?? '');
  const n1 = lastName(m.p1);
  const n2 = lastName(m.p2);
  const w = showScore(m) ? m.winner : null;
  return `<a class="line" href="#/match/${encodeURIComponent(m.match_id)}"><span class="when">${when}</span>
    <span class="who">${w === 1 ? `<b>${esc(n1)}</b>` : esc(n1)} — ${w === 2 ? `<b>${esc(n2)}</b>` : esc(n2)}<small>${esc(m.tournament.name ?? '')}</small></span>
    <span class="sc">${esc(score)}</span></a>`;
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

// ---------- home ----------
const TIPS = [
  ['Тай-брейк', 'При счёте 6:6 в сете играют тай-брейк — до 7 очков с разницей в два. Маленькая цифра рядом со счётом, например 6⁴, — сколько очков набрал проигравший в тай-брейке.'],
  ['Как считают гейм', '15, 30, 40 и гейм. При 40:40 — «ровно»: чтобы взять гейм, нужно выиграть два розыгрыша подряд.'],
  ['Брейк', 'Брейк — это выигранный гейм на подаче соперника. Подающему играть легче, поэтому именно брейки чаще всего решают сет.'],
  ['Рейтинг', 'Рейтинг ATP и WTA — сумма очков за последние 52 недели. Чем дальше игрок проходит на крупных турнирах, тем больше очков.'],
  ['Рейтинг Эло', 'Эло учитывает, у кого ты выигрываешь, а не только сколько. Разница в 100 пунктов — это примерно 64% шансов у более сильного.'],
  ['Покрытия', 'Хард — ровный и довольно быстрый, грунт — медленный, мяч отскакивает выше, трава — самая быстрая, отскок низкий.'],
  ['Сеяные', 'Сеяные — лучшие по рейтингу участники турнира. Их разводят по сетке, чтобы они не встретились в первых кругах.'],
  ['Квалификация', 'Перед турниром идёт квалификация: несколько её победителей получают места в основной сетке.'],
  ['Отказ и неявка', 'Отказ — игрок снялся по ходу матча. Неявка — не вышел на корт. В обоих случаях победа засчитывается сопернику.'],
  ['Челленджеры', 'Челленджеры — второй уровень после основного тура. Здесь набирают очки, чтобы пробиться к лучшим.'],
  ['Большой шлем', 'Четыре главных турнира года: Australian Open, Ролан Гаррос, Уимблдон и US Open. Победитель получает 2000 очков.'],
  ['Итоговые турниры', 'В конце сезона восемь лучших игроков года выходят на итоговый турнир: сначала группы, потом полуфиналы и финал.'],
];

function tipOfDay(date) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400e3);
  const [title, text] = TIPS[day % TIPS.length];
  return `<div class="tip"><div class="cap">Теннис простыми словами</div><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
}

function tournamentCard(t) {
  const tags = [t.tier_label, SURFACE[t.surface]].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join('');
  const stats = [
    `${t.matches} ${t.matches === 1 ? 'матч' : t.matches < 5 ? 'матча' : 'матчей'} сегодня`,
    t.live ? `${t.live} идёт сейчас` : null,
    t.bolshe ? `${t.bolshe} в эфире «Больше»` : null,
    t.russians ? `наши: ${t.russians}` : null,
  ].filter(Boolean).join(' · ');
  return `<a class="tcard" href="#/matches?level=${esc(t.level)}"><div class="tt">${esc(t.tour ?? '')} ${esc(t.name ?? '')}</div>
    <div class="tags">${tags}</div>${t.about ? `<p>${esc(t.about)}</p>` : ''}<div class="muted small">${esc(stats)}</div></a>`;
}

function matchOfDay(mod) {
  if (!mod) return '';
  const m = mod.match;
  const side = (p) => `<div class="pl">${avatar(p.photo, 'pa')}<div class="nm">${esc(lastName(p))}</div><div class="rk">${p.rank ? `№${p.rank}` : ''}</div></div>`;
  const center = m.status === 'scheduled' ? mskTime(m.start_at) : m.status === 'live' ? (showScore(m) ? `${m.sets_p1}:${m.sets_p2}` : 'LIVE') : (showScore(m) ? `${m.sets_p1}:${m.sets_p2}` : '—');
  return `<h2>Матч дня</h2><a class="hero mod" href="#/match/${encodeURIComponent(m.match_id)}">
    ${m.bolshe?.cover ? coverBox(m.bolshe.cover, m.p1, m.p2, 'in-hero') : ''}
    <div class="muted small">${esc(m.tournament.tour ?? '')} ${esc(m.tournament.name ?? '')}${m.status === 'live' ? ' · <span class="live">LIVE</span>' : ''}</div>
    <div class="vs">${side(m.p1)}<div class="score">${esc(center)}</div>${side(m.p2)}</div>
    ${mod.why.length ? `<p class="why">${mod.why.map(esc).join(' ')}</p>` : ''}<div class="more">Сравнение и факты →</div></a>`;
}

async function home(params, token) {
  const date = mskDay(0);
  const d = await api(`/api/home?date=${date}`);
  if (stale(token)) return;
  const tourNames = d.tournaments.filter((t) => t.level === 'tour').map((t) => `${t.tour} ${t.name}`);
  const lead = [
    tourNames.length ? `Идут ${tourNames.slice(0, 3).join(', ')}.` : 'Крупных турниров сегодня нет.',
    d.bolshe.length ? `«Больше» показывает ${d.bolshe.length} ${d.bolshe.length === 1 ? 'матч' : d.bolshe.length < 5 ? 'матча' : 'матчей'}.` : '',
    d.russians.length ? `Наши играют ${d.russians.length} ${d.russians.length === 1 ? 'матч' : d.russians.length < 5 ? 'матча' : 'матчей'}.` : '',
  ].filter(Boolean).join(' ');
  const pairKey = (a, b) => [a, b].sort().join('|');
  const shown = new Set(d.bolshe.map((m) => pairKey(m.p1.player_id, m.p2.player_id)));
  const otherBroadcasts = d.broadcasts.filter((b) => b.status !== 'cancelled' && !shown.has(pairKey(b.player1_id, b.player2_id)));
  // The «Больше» schedule reads left to right by broadcast time, finished or not: our VK cover
  // of each broadcast, or both players' heads when there is no cover yet.
  const tile = ({ href, external, cover, p1, p2, when, names, commentator }) => `<a class="bc" href="${esc(href ?? '#/')}"${external ? ' target="_blank" rel="noopener"' : ''}>
    ${coverBox(cover, p1, p2)}<div class="bc-when">${when}</div><div class="bc-names">${esc(names)}</div>
    ${commentator ? `<div class="muted small">${esc(commentator)}</div>` : ''}</a>`;
  const broadcastTiles = [
    ...d.bolshe.map((m) => ({
      time: m.bolshe?.time_msk ?? mskTime(m.start_at),
      html: tile({
        href: `#/match/${encodeURIComponent(m.match_id)}`, cover: m.bolshe?.cover, p1: m.p1, p2: m.p2,
        when: m.status === 'live' ? `<span class="live">● LIVE</span>${showScore(m) ? ` · ${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : ''}`
          : m.status === 'scheduled' ? esc(m.bolshe?.time_msk ?? mskTime(m.start_at)) : `${esc(STATUS[m.status] ?? '')}${showScore(m) ? ` · ${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : ''}`,
        names: `${lastName(m.p1)} — ${lastName(m.p2)}`, commentator: m.bolshe?.commentator1,
      }),
    })),
    ...otherBroadcasts.map((b) => ({
      time: b.time_msk ?? '',
      html: tile({
        href: b.vk_url, external: Boolean(b.vk_url), cover: b.cover,
        p1: { photo: b.player1_photo }, p2: { photo: b.player2_photo }, when: esc(b.time_msk ?? ''),
        names: `${b.player1_name ?? b.player1_ru} — ${b.player2_name ?? b.player2_ru ?? ''}`, commentator: b.commentator1,
      }),
    })),
  ].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  view.innerHTML = `
    <div class="hello"><div class="date">${esc(longDate(date))}</div><p>${esc(lead)}</p></div>
    ${matchOfDay(d.match_of_day)}
    ${d.tournaments.length ? `<h2>Что сейчас идёт</h2>${d.tournaments.filter((t) => t.level === 'tour').map(tournamentCard).join('')}
      ${d.tournaments.some((t) => t.level === 'challenger') ? `<a class="tcard slim" href="#/matches?level=challenger">Ещё ${d.tournaments.filter((t) => t.level === 'challenger').length} челленджеров — второй уровень тура →</a>` : ''}` : ''}
    <h2>Наши сегодня</h2>${d.russians.length ? `<div class="lines">${d.russians.map(compactLine).join('')}</div>` : '<div class="empty">Сегодня россияне не играют</div>'}
    ${d.russians_yesterday.length ? `<h2>Наши вчера</h2><div class="lines">${d.russians_yesterday.map(compactLine).join('')}</div>` : ''}
    <h2>Эфиры «Больше» сегодня</h2>${broadcastTiles.length ? `<div class="shelf">${broadcastTiles.map((x) => x.html).join('')}</div>` : '<div class="empty">Сегодня эфиров нет</div>'}
    ${tipOfDay(date)}
    <div class="links"><a href="#/matches">Все матчи дня →</a><a href="#/players">Найти игрока →</a></div>`;
  timer = setInterval(() => home(params, token).catch(() => {}), 60000);
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
  if (date === mskDay(0)) timer = setInterval(() => matches(params, token).catch(() => {}), 30000);
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
  const d = await api(`/api/matches/${encodeURIComponent(id)}`);
  if (stale(token)) return;
  const m = d.match;
  const t = m.tournament;
  const status = m.status === 'live' ? '<span class="live">● LIVE</span>'
    : m.status === 'scheduled' ? `начало в ${mskTime(m.start_at)} МСК` : STATUS[m.status] ?? '';
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
      ${m.bolshe ? `<div class="bolshe" style="justify-content:center;margin-top:10px"><span class="badge">Больше</span>&nbsp;${esc([m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).join(' и '))}</div>` : ''}
      ${m.bolshe?.vk_url ? `<a class="watch" href="${esc(m.bolshe.vk_url)}" target="_blank" rel="noopener">▶ Смотреть на VK</a>` : ''}
    </div>
    ${compareBlock(m, d.preview)}
    ${d.meetings.length ? `<h2>Личные встречи</h2><div class="hero list">${d.meetings.map((x) => resultLine(x, m.p1.fs_id)).join('')}</div>` : ''}
    ${noSpoilers ? '' : lastBlock(m.p1, d.last.p1) + lastBlock(m.p2, d.last.p2)}`;
  if (m.status === 'live' || m.status === 'scheduled') timer = setInterval(() => match(id, token).catch(() => {}), 30000);
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
    api(`/api/players/${encodeURIComponent(id)}`), api(`/api/players/${encodeURIComponent(id)}/matches`),
  ]);
  if (stale(token)) return;
  const a = age(p.birth_date);
  view.innerHTML = `
    <div class="profile-head">${avatar(p.photo_url, '')}<div><h1>${esc(p.name_ru)}</h1>
      <div class="muted">${esc(p.name_latin ?? '')} · ${esc(p.tour)}${p.country_code ? ` · ${esc(p.country_code)}` : ''}${a != null ? ` · ${a} лет` : ''}</div>
      ${p.sportsru_url ? `<a href="${esc(p.sportsru_url)}" target="_blank" rel="noopener" class="small">sports.ru</a>` : ''}</div></div>
    <div class="kv">
      <div><b>${p.singles_rank ?? '—'}</b><span>рейтинг</span></div>
      <div><b>${p.elo ? Math.round(p.elo) : '—'}</b><span>Эло</span></div>
      <div><b>${p.doubles_rank ?? '—'}</b><span>пары</span></div>
    </div>
    <h2>Матчи</h2>${list.length ? list.map(matchCard).join('') : '<div class="empty">Свежих матчей нет — история появится по мере игр</div>'}`;
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
  const d = await api('/api/levels?xp=0');
  if (stale(token)) return;
  const max = d.levels[d.levels.length - 1].from + d.legend_step;
  view.innerHTML = `
    <div class="level" id="lvl"></div>
    <div class="muted small" style="margin:8px 2px">Прогнозы и опыт появятся в ближайших обновлениях. Пока можно посмотреть, как растут уровни.</div>
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
  paint(0);
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
