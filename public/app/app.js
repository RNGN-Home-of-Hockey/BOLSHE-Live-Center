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
const dayLabel = (date) => {
  const names = { [mskDay(-1)]: 'Вчера', [mskDay(0)]: 'Сегодня', [mskDay(1)]: 'Завтра' };
  return names[date] ?? new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
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

function avatar(src, cls = 'ava') {
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls}"></span>`;
}

const showScore = (m) => !noSpoilers || m.status === 'scheduled';

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
  const ru = p.is_russian ? ' 🇷🇺' : '';
  const score = m.status === 'scheduled' ? '' : showScore(m) ? `<span class="sets">${setsOf(m, side)}</span>` : '';
  return `<div class="row${won ? ' won' : ''}">${avatar(p.photo)}<span class="name">${esc(p.short ?? p.name)}${ru}${rank}</span>${score}</div>`;
}

function matchCard(m) {
  const meta = m.status === 'live'
    ? `<span class="live">● LIVE${m.live_set ? ` · ${m.live_set}-й сет` : ''}</span>`
    : m.status === 'scheduled' ? `<span>${mskTime(m.start_at)}</span>` : `<span>${STATUS[m.status] ?? ''}</span>`;
  const t = m.tournament;
  const hidden = noSpoilers && m.status !== 'scheduled' ? '<div class="hidden-score">Счёт скрыт</div>' : '';
  const bolshe = m.bolshe
    ? `<div class="bolshe"><span><span class="badge">Больше</span> ${esc(m.bolshe.commentator1 ?? '')}</span>${m.bolshe.vk_url ? '<span>▶ VK</span>' : ''}</div>`
    : '';
  return `<a class="card" href="#/match/${encodeURIComponent(m.match_id)}">
    <div class="meta"><span>${esc(t.tour ?? '')} ${esc(t.name ?? '')}${t.surface ? ` · ${SURFACE[t.surface]}` : ''}</span>${meta}</div>
    ${matchRow(m, 1)}${matchRow(m, 2)}${hidden}${bolshe}</a>`;
}

const section = (title, items, empty) => `<h2>${esc(title)}</h2>${items.length ? items.map(matchCard).join('') : `<div class="empty">${esc(empty)}</div>`}`;

function daysStrip(current) {
  return `<div class="days">${[-2, -1, 0, 1, 2].map((o) => {
    const d = mskDay(o);
    return `<button class="day${d === current ? ' on' : ''}" data-day="${d}">${dayLabel(d)}</button>`;
  }).join('')}</div>`;
}

// ---------- screens ----------
async function home(params, token) {
  const date = params.get('date') ?? mskDay(0);
  const d = await api(`/api/home?date=${date}`);
  if (stale(token)) return;
  const pairKey = (a, b) => [a, b].sort().join('|');
  const shown = new Set(d.bolshe.map((m) => pairKey(m.p1.player_id, m.p2.player_id)));
  const other = d.broadcasts.filter((b) => b.status !== 'cancelled' && !shown.has(pairKey(b.player1_id, b.player2_id)));
  view.innerHTML = `${daysStrip(date)}
    ${section('Эфиры «Больше»', d.bolshe, other.length ? 'Матчи эфиров ещё не появились в ленте' : 'В этот день эфиров «Больше» нет')}
    ${other.length ? `<div class="muted" style="font-size:13px;margin:-2px 2px 8px">Ещё в расписании «Больше»: ${other.map((b) => `${esc(b.time_msk ?? '')} ${esc(b.player1_name ?? b.player1_ru)} — ${esc(b.player2_name ?? b.player2_ru ?? '')}`).join('; ')}</div>` : ''}
    ${section('Наши', d.russians, 'В этот день россияне не играют')}
    ${d.live.length ? section('Сейчас играют', d.live, '') : ''}
    ${section('ATP и WTA', d.tour, 'Матчей основного тура нет')}`;
  view.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/?date=${b.dataset.day}`; }));
  if (date === mskDay(0)) timer = setInterval(() => home(params, token).catch(() => {}), 30000);
}

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
    ${[...groups].map(([name, list]) => `<h2>${esc(name)}</h2>${list.map(matchCard).join('')}`).join('') || '<div class="empty" style="margin-top:12px">Матчей нет</div>'}`;
  view.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/matches?date=${b.dataset.day}&level=${level}`; }));
  view.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/matches?date=${date}&level=${b.dataset.level}`; }));
  if (date === mskDay(0)) timer = setInterval(() => matches(params, token).catch(() => {}), 30000);
}

function resultLine(m, fsId) {
  const mine = m.p1_fs_id === fsId ? 1 : 2;
  const opp = mine === 1 ? m.p2_name : m.p1_name;
  const won = m.winner === mine;
  const score = mine === 1 ? `${m.sets_p1}:${m.sets_p2}` : `${m.sets_p2}:${m.sets_p1}`;
  const date = m.start_at ? new Date(m.start_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  return `<div class="item"><span class="muted">${esc(date)}</span><span>${esc(opp)} <span class="muted">· ${esc(m.tournament ?? '')}</span></span><span class="${won ? 'w' : 'l'}">${won ? 'В' : 'П'} ${esc(score)}</span></div>`;
}

async function match(id, token) {
  const d = await api(`/api/matches/${encodeURIComponent(id)}`);
  if (stale(token)) return;
  const m = d.match;
  const t = m.tournament;
  const status = m.status === 'live' ? '<span style="color:var(--live);font-weight:700">● LIVE</span>'
    : m.status === 'scheduled' ? `начало в ${mskTime(m.start_at)} МСК` : STATUS[m.status] ?? '';
  const scoreBig = m.status === 'scheduled' ? 'vs' : showScore(m) ? `${m.sets_p1 ?? 0}:${m.sets_p2 ?? 0}` : '—';
  const setLine = m.status !== 'scheduled' && showScore(m) ? m.sets.map((s) => `${s.p1}:${s.p2}`).join('  ') : '';
  const player = (p) => {
    const inner = `${avatar(p.photo, 'pa')}<div class="nm">${esc(p.name)}${p.is_russian ? ' 🇷🇺' : ''}</div><div class="rk">${p.rank ? `№${p.rank}` : ''}</div>`;
    return p.player_id ? `<a class="pl" href="#/player/${encodeURIComponent(p.player_id)}">${inner}</a>` : `<div class="pl">${inner}</div>`;
  };
  const pv = d.preview;
  const chance = pv.chance
    ? `<div class="chance"><div class="bar"><i style="width:${pv.chance.p1}%"></i><i style="width:${pv.chance.p2}%"></i></div>
       <div class="lbl"><span>${pv.chance.p1}%</span><span class="muted">шансы по Эло</span><span>${pv.chance.p2}%</span></div></div>`
    : '';
  const lastBlock = (p, list) => (list.length ? `<h2>${esc(p.short ?? p.name)}: последние матчи</h2><div class="hero list">${list.map((x) => resultLine(x, p.fs_id)).join('')}</div>` : '');
  view.innerHTML = `
    <div class="muted" style="font-size:13px">${esc(t.tour ?? '')} ${esc(t.name ?? '')}${t.surface ? ` · ${SURFACE[t.surface]}` : ''} · ${status}</div>
    <div class="hero">
      <div class="vs">${player(m.p1)}<div class="score">${esc(scoreBig)}</div>${player(m.p2)}</div>
      ${setLine ? `<div class="setline">${esc(setLine)}</div>` : ''}
      ${m.bolshe ? `<div class="bolshe" style="justify-content:center;margin-top:10px"><span class="badge">Больше</span>&nbsp;${esc([m.bolshe.commentator1, m.bolshe.commentator2].filter(Boolean).join(' и '))}</div>` : ''}
      ${m.bolshe?.vk_url ? `<a class="watch" href="${esc(m.bolshe.vk_url)}" target="_blank" rel="noopener">▶ Смотреть на VK</a>` : ''}
    </div>
    ${pv.lines.length ? `<h2>Теннис для чайников</h2><div class="hero">${chance}<ul class="facts">${pv.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    ${d.meetings.length ? `<h2>Личные встречи</h2><div class="hero list">${d.meetings.map((x) => resultLine(x, m.p1.fs_id)).join('')}</div>` : ''}
    ${noSpoilers ? '' : lastBlock(m.p1, d.last.p1) + lastBlock(m.p2, d.last.p2)}`;
  if (m.status === 'live' || m.status === 'scheduled') timer = setInterval(() => match(id, token).catch(() => {}), 30000);
}

function playerRows(list) {
  return list.map((p) => `<a class="player-row" href="#/player/${encodeURIComponent(p.player_id)}">${avatar(p.photo_url, '')}<span><b>${esc(p.name_ru)}</b>${p.is_russian ? ' 🇷🇺' : ''}<br><span class="muted" style="font-size:12px">${esc(p.tour)} · ${esc(p.country_code ?? '')}</span></span><span class="rk">${p.singles_rank ? `№${p.singles_rank}` : p.doubles_rank ? `пары №${p.doubles_rank}` : ''}</span></a>`).join('');
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
    <div class="profile-head">${avatar(p.photo_url, '')}<div><h1>${esc(p.name_ru)}${p.is_russian ? ' 🇷🇺' : ''}</h1>
      <div class="muted">${esc(p.name_latin ?? '')} · ${esc(p.tour)}${p.country_code ? ` · ${esc(p.country_code)}` : ''}${a != null ? ` · ${a} лет` : ''}</div>
      ${p.sportsru_url ? `<a href="${esc(p.sportsru_url)}" target="_blank" rel="noopener" style="font-size:13px">sports.ru</a>` : ''}</div></div>
    <div class="kv">
      <div><b>${p.singles_rank ?? '—'}</b><span>рейтинг</span></div>
      <div><b>${p.elo ? Math.round(p.elo) : '—'}</b><span>Эло</span></div>
      <div><b>${p.doubles_rank ?? '—'}</b><span>пары</span></div>
    </div>
    <h2>Матчи</h2>${list.length ? list.map(matchCard).join('') : '<div class="empty">Свежих матчей нет — история появится по мере игр</div>'}`;
}

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
    <div class="muted" style="font-size:13px;margin:8px 2px">Прогнозы и опыт появятся в ближайших обновлениях. Пока можно посмотреть, как растут уровни.</div>
    <h2>Достижения</h2>
    <div class="badges">${ACHIEVEMENTS.map(([i, t, s]) => `<div>${i}<b>${esc(t)}</b><small>${esc(s)}</small></div>`).join('')}</div>`;
  const box = view.querySelector('#lvl');
  function paint(xp) {
    const lv = levelFor(d.levels, d.legend_step, xp);
    box.innerHTML = `<div class="cap">Твой профиль</div><div class="title">${esc(lv.title)}</div><div class="sub">${esc(lv.subtitle)}</div>
      <div class="xp"><b>${xp.toLocaleString('ru-RU')} XP</b><span>До уровня «${esc(lv.next_title)}»: ${lv.to_next.toLocaleString('ru-RU')} XP</span></div>
      <div class="progress"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
      <input type="range" min="0" max="${max}" step="50" value="${xp}" aria-label="Опыт">
      <div class="muted" style="font-size:13px;margin-top:6px">Передвинь ползунок, чтобы посмотреть, как меняется уровень.</div>`;
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
