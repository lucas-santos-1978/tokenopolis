// The HTML panels: trophies and the ranking of this week's builds, the derby, the countdown, the
// City Hall of the open city, the details card of the touched building, the live notices (toasts)
// and what changed between two readings (liveEvents).

import { t, plural, fmt, cityLabel, displayName, config, locale as uiLocale } from '../i18n/index.js';
import { tierOf, BUILDING_TIERS, TEN_BI, monumentsOf, context, mayorOf, raceOf, derby, countdowns, paperHtml, cityTier, buildingTier, monumentText, monthOf, floorsText, htmlCity, ruinOf, megaOf, markOf, markText } from './rules.js';
import { dojoOf } from './world.js';
import { ageText, readingTime } from '../lib/freshness.js';

const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const keyOf = (cityId, personId) => `${cityId}|${personId}`;
const name = (b) => displayName(b).full;
// the × of a panel: hides it (the 👁️ brings it back)
const closer = (panel) => {
  const label = t(`close.${panel}`);
  return `<button type="button" class="panel-x" data-hide-panel="${panel}" aria-label="${esc(label)}" title="${esc(t('close.title', { label }))}">×</button>`;
};
// the stale pill: the data source's error (or no server at all), and when the reading on screen was made
export const staleText = (error, at) => `⚠️ ${error ? t(`error.${error.code}`, error) : t('error.offline')} · ${at ? t('error.lastReading', { time: readingTime(at) }) : t('error.stale')}`;
// How old the reading is: "3 min ago" on a narrow screen (where the date of the bar has no room), and
// the exact time on hover; main.js calls it again every few seconds, so it keeps counting between readings.
export function renderAge() {
  if (!data) return;
  const el = $('#age'), when = t('age.title', { time: fmt.dateTime(data.generatedAt) });
  el.textContent = `🕒 ${ageText(data.generatedAt)}`; el.title = when; el.setAttribute('aria-label', when);
  $('#stat-date').parentElement.title = when;
}

let api = null, data = null, me = null, mega = null; // mega: rules.js megaOf of the reading (it also marks b.mega)
export function initPanels(a) { api = a; }
export const setMe = (id) => { me = id; };

const weekRank = () => [...data.cities].sort((a, b) => b.week - a.week || b.floors - a.floors);
const rankOf = (c) => weekRank().indexOf(c) + 1;

export function renderPanels(d, view, selected) {
  data = d; mega = megaOf(d);
  renderNews();
  const city = view.kind === 'city' && data.cities.find((c) => c.id === view.id), isCity = !!city, v = isCity ? 'city' : 'region';
  document.documentElement.dataset.view = v;
  document.querySelectorAll('[data-for]').forEach((el) => (el.hidden = el.dataset.for !== v));
  $('#back').hidden = !isCity;
  $('#title').textContent = isCity ? cityLabel(city) : t('html.header.title');
  $('#subtitle').textContent = t(isCity ? 'header.cityView' : 'header.regionView', { week: fmt.period(data.week, 'long') });
  const totalB = data.cities.reduce((a, c) => a + c.people, 0), totalF = data.cities.reduce((a, c) => a + c.floors, 0);
  $('#stat-buildings').textContent = plural(totalB, 'count.building');
  $('#stat-floors').textContent = floorsText(totalF);
  $('#stat-date').textContent = fmt.dateTime(data.generatedAt);
  renderAge();
  const pill = $('#mode-pill');
  pill.hidden = data.mode !== 'mock' && data.mode !== 'demo';
  if (data.mode === 'demo') pill.textContent = t('header.demoPill');
  const stale = $('#stale-pill'); stale.hidden = !data.error; if (data.error) stale.textContent = stale.title = staleText(data.error, data.generatedAt);
  if (isCity) renderHall(city); else renderRegionPanels();
  if (document.documentElement.dataset.map) renderMapKey(document.documentElement.dataset.map); // the key's counts follow the reading
  focusable();
  renderSheet(city, selected);
}

// The region's mission: this week's floors of the whole region against last week's plus a few percent
// (the server sets the target); a bar under the week's ranking.
export const missionOf = (d) => (d?.mission ? { ...d.mission, done: d.cities.reduce((a, c) => a + c.week, 0) } : null);
function renderMission() {
  const el = $('#mission'), m = missionOf(data);
  // one line and a thin bar (the column is short of room), with the spreadsheet link at its end
  const csv = `<button type="button" class="csv" data-csv="region" title="${esc(t('html.ranking.csvTitle'))}">⬇️ CSV</button>`;
  el.hidden = false;
  if (!m) { el.title = ''; el.className = 'mission none'; el.innerHTML = `<div class="row"><span></span>${csv}</div>`; return; }
  const p = m.done / m.target, met = m.done >= m.target;
  el.title = `${t('mission.title')}: ${t('mission.why', { growth: fmt.int(m.growth), last: fmt.int(m.lastWeek) })}`;
  el.className = `mission${met ? ' met' : ''}`;
  el.innerHTML = `<div class="row"><span>🎯 ${t('mission.text', { done: fmt.int(m.done), target: floorsText(m.target) })}</span><small>${met ? '🎉 ' : ''}${fmt.percent(p)}</small>${csv}</div><i style="--p:${Math.min(1, p).toFixed(3)}"></i>`;
  return;
  el.innerHTML = `<h3>${t('mission.title')}</h3><div class="row"><span>${t('mission.text', { done: fmt.int(m.done), target: floorsText(m.target) })}</span><small>${met ? t('mission.met', { pct: fmt.percent(p) }) : t('mission.left', { floors: floorsText(Math.max(1, Math.ceil(m.target - m.done))), pct: fmt.percent(p) })}</small></div><i style="--p:${Math.min(1, p).toFixed(3)}"></i>`;
}

function renderRegionPanels() {
  renderMission();
  const rank = weekRank(), lead = rank[0];
  const byF = [...data.cities].sort((a, b) => b.floors - a.floors)[0];
  const alive = (c) => c.builders / Math.max(1, c.people);
  const byA = [...data.cities].sort((a, b) => alive(b) - alive(a))[0], byG = [...data.cities].sort((a, b) => b.growth - a.growth)[0];
  const trophies = lead ? [
    ['🏗️', 'trophy.week', lead, `+${floorsText(lead.week)}`, true],
    ['🏙️', 'trophy.metropolis', byF, floorsText(byF.floors)],
    ['💡', 'trophy.alive', byA, t('trophy.aliveWhat', { pct: fmt.percent(alive(byA)) })],
    ['🚀', 'trophy.growth', byG, t('trophy.growthWhat', { pct: fmt.percent(byG.growth) })],
  ] : [];
  $('#trophies').innerHTML = trophies.map(([ic, label, c, what, isLead]) => `
    <div class="trophy${isLead ? ' lead' : ''}" data-city="${esc(c.id)}"><span class="icon">${ic}</span>
      <div><div class="label">${t(label)}</div><div class="who">${esc(cityLabel(c))}</div><div class="what">${esc(what)}</div></div></div>`).join('')
    + (trophies.length ? closer('trophies') : '');
  const max = Math.max(1, lead?.week ?? 1);
  $('#ranking-list').innerHTML = rank.slice(0, 12).map((c, i) => `
    <li data-city="${esc(c.id)}" title="${esc(t('ranking.see', { c }))}"><span class="pos">${i + 1}</span>
      <span class="name">${esc(cityLabel(c))}</span><span class="bar" style="--w:${(c.week / max).toFixed(4)}"></span><span class="val">+${fmt.int(c.week)}</span></li>`).join('');
  renderDerby();
  renderCountdown();
  renderMega();
  fitColumn();
}

// Mega Builders: who already has a headquarters in the Corporate District (the floors added up across
// the cities) and the next in line, with how far the line is. A tap flies to the headquarters.
const MEGA_ROWS = 3; // it sits under this week's builds: compact, one line per person
// The right column (the week's builds and the Mega Builders) stops above the panels at the bottom right.
// When both do not fit whole (a laptop, or a short window), they fold into chips, one open at a time
// (.fold, city.css), and the week's list scrolls inside instead of running under the derby.
export function fitColumn() {
  const col = $('.rcol'); if (!col) return;
  const below = [$('#derby'), $('#countdown')].filter((e) => e && !e.hidden && e.getBoundingClientRect().height > 0).map((e) => e.getBoundingClientRect().top);
  const zoom = Number(getComputedStyle(col).zoom) || 1, top = col.getBoundingClientRect().top;
  const maxH = below.length && innerWidth > 900 ? Math.max(160, (Math.min(...below) - top - 10) / zoom) : 0;
  col.style.maxHeight = maxH ? `${maxH}px` : '';
  let fold = innerWidth > 900 && innerWidth <= 1300;
  if (innerWidth > 1300 && maxH) { // both panels at their natural height: do they fit?
    col.classList.remove('fold'); col.style.gridTemplateRows = 'auto auto';
    const parts = [...col.children].filter((e) => e.getBoundingClientRect().height > 0);
    fold = parts.reduce((s, e) => s + e.getBoundingClientRect().height / zoom, 0) + 10 * Math.max(0, parts.length - 1) > maxH + 0.5;
    col.style.gridTemplateRows = '';
  }
  const was = col.classList.contains('fold');
  col.classList.toggle('fold', fold);
  if (fold && !was && !$('#mega')?.classList.contains('open')) $('#ranking')?.classList.add('open'); // folding: the week's builds start open
  // the same on the left: the trophies stop above the legend (the last card scrolls instead of hiding under it)
  const tro = $('#trophies'), leg = $('.legend');
  if (tro) {
    const lt = leg && !leg.hidden && leg.getBoundingClientRect().height > 0 ? leg.getBoundingClientRect().top : 0, z = Number(getComputedStyle(tro).zoom) || 1;
    tro.style.maxHeight = lt && innerWidth > 900 ? `${Math.max(120, (lt - tro.getBoundingClientRect().top - 10) / z)}px` : '';
  }
}
addEventListener('resize', () => fitColumn());
function renderMega() {
  const el = $('#mega'), m = mega, empty = !m.line || (!m.members.length && !m.queue.length);
  el.classList.toggle('empty', empty);
  if (empty) { el.innerHTML = ''; return; }
  const where = (p) => esc(fmt.list(p.parts.map(({ c }) => cityLabel(c))));
  const row = (p, i) => `<li data-hq="${esc(p.id)}" title="${where(p)}"><span class="pos">${i + 1}</span><span class="name">${esc(name(p))}</span><span class="cities">${plural(p.cities, 'count.city')}</span><span class="val">${fmt.int(p.floors)}</span></li>`;
  const more = m.members.length - MEGA_ROWS, next = m.queue[0];
  el.innerHTML = `${closer('mega')}
    <h2>💎 ${t('mega.title')} <small>${t('mega.rule', { line: fmt.int(m.line) })}</small></h2>
    <ol>${m.members.slice(0, MEGA_ROWS).map(row).join('') || `<li class="none">${t('mega.noneYet')}</li>`}</ol>
    <div class="foot">${next ? `<button type="button" class="next" data-hq="${esc(next.id)}" title="${where(next)}">🚧 ${t('mega.next', { name: esc(displayName(next).short), floors: fmt.int(Math.floor(next.floors)), line: fmt.int(m.line) })}${m.queue.length > 1 ? ` · +${fmt.int(m.queue.length - 1)}` : ''}</button>` : '<span></span>'}
      <button type="button" class="go" data-district="1">${more > 0 ? `${plural(more, 'mega.more')} · ` : ''}${t('mega.see')}</button></div>`;
}

// Derby of the week: the two cities closest in total, and who climbs more this week.
function renderDerby() {
  const el = $('#derby'), d = derby(data);
  el.classList.toggle('empty', !d);
  if (!d) { el.innerHTML = ''; return; }
  const { a, b } = d, tot = a.week + b.week, share = tot > 0 ? a.week / tot : 0.5;
  const ahead = a.week === b.week ? t('derby.tie') : t('derby.ahead', { c: a.week > b.week ? a : b });
  el.innerHTML = `${closer('derby')}
    <h2>${t('derby.heading')} <small>${plural(Math.round(d.gap), 'derby.gap')}</small></h2>
    <div class="duel">
      <button type="button" data-city="${esc(a.id)}" class="side"><b>${esc(cityLabel(a))}</b><span>${fmt.int(a.floors)}</span></button>
      <div class="score"><b>+${fmt.int(a.week)}</b><i>×</i><b>+${fmt.int(b.week)}</b></div>
      <button type="button" data-city="${esc(b.id)}" class="side r"><b>${esc(cityLabel(b))}</b><span>${fmt.int(b.floors)}</span></button>
    </div>
    <div class="tug" title="${esc(t('derby.tug'))}"><i style="--p:${share.toFixed(3)}"></i></div>
    <small class="ahead">${esc(ahead)}</small>`;
}
// Countdown: the milestone closest to falling (changes every 12 s).
let cdList = [], cdIdx = 0, cdKey = null;
export const countdownKey = () => cdKey; // the countdown's building (city|person), for the ring on the map
export function renderCountdown() {
  const el = $('#countdown');
  if (!data) return;
  cdList = countdowns(data);
  el.classList.toggle('empty', !cdList.length);
  if (!cdList.length) { el.innerHTML = ''; cdKey = null; return; }
  const x = cdList[cdIdx % cdList.length], n = Math.max(1, Math.ceil(x.missing));
  cdKey = x.person ? keyOf(x.city, x.person) : null;
  const when = x.eta < 1 ? t('countdown.today') : x.eta < 2 ? t('countdown.tomorrow') : plural(Math.ceil(x.eta), 'countdown.days');
  el.innerHTML = `${closer('countdown')}
    <h2>${t('countdown.heading')} <small>${cdList.length > 1 ? t('countdown.page', { i: (cdIdx % cdList.length) + 1, n: cdList.length }) : ''}</small></h2>
    <button type="button" class="cd" data-city="${esc(x.city)}"${x.person ? ` data-person="${esc(x.person)}"` : ''}>
      <span class="ic">${x.icon}</span><span class="n"><b>${fmt.int(n)}</b><small>${plural(n, 'countdown.unit')}</small></span>
      <span class="what"><b>${esc(x.text)}</b><small>${esc(x.who)} · ${esc(when)}</small></span>
    </button>`;
}
setInterval(() => { if (data && cdList.length > 1 && !document.hidden && document.documentElement.dataset.view === 'region') { cdIdx++; renderCountdown(); } }, 12_000);

// City Hall's list of people: the six tallest or, once opened, everyone, sorted by floors, by this
// week's or today's build or by the days stopped, and filtered by name as one types.
let hallCity = null, hallAll = false, hallSort = 'floors', hallQ = '';
const HALL_SORTS = { floors: (b) => b.floors, week: (b) => b.week, today: (b) => b.today, idle: (b) => b.idle ?? -1 };
function hallRows(c) {
  const val = HALL_SORTS[hallSort], q = norm(hallQ.trim());
  const list = hallAll ? c.buildings.filter((b) => !q || norm(name(b)).includes(q)).sort((a, b) => val(b) - val(a) || b.floors - a.floors) : c.buildings.slice(0, 6);
  const max = Math.max(1, ...list.map(val));
  const chip = (b) => (b.cities > 1 ? `<span class="chip" title="${esc(b.mega ? t('mega.badge', { bi: fmt.dec(mega.line / 1000, 1) }) : t('hall.chipTitle', { cities: plural(b.cities, 'count.city') }))}">${b.mega ? '💎' : b.cities >= 3 ? '👑' : '🚩'}${b.cities}</span>` : '');
  const mark = (b) => { const r = ruinOf(b); return r === 'rubble' ? ' 🧱' : r === 'fire' ? ' 🔥' : b.now ? ' 🏗️' : ''; };
  const shown = (b) => (hallSort === 'floors' ? fmt.int(b.floors) : hallSort === 'idle' ? (b.idle == null ? '—' : t('hall.days', { n: fmt.int(b.idle) })) : `+${fmt.int(val(b))}`);
  return list.map((b, i) => `<li data-building="${esc(b.id)}"${b.id === me ? ' class="me"' : ''}><span class="n">${i + 1}</span><span class="who">${esc(name(b))}${chip(b)}${hallAll ? mark(b) : ''}</span>
    <span class="bar" style="width:${Math.max(2, (120 * Math.max(0, val(b))) / max)}px"></span><span class="v">${shown(b)}</span></li>`).join('') || `<li class="none">${t('finder.none')}</li>`;
}
document.addEventListener('click', (e) => {
  const all = e.target.closest('[data-hall-all]'), sort = e.target.closest('[data-hall-sort]'), c = data?.cities.find((x) => x.id === hallCity);
  if (!c || (!all && !sort)) return;
  if (all) { hallAll = !hallAll; hallQ = ''; } else hallSort = sort.dataset.hallSort;
  renderHall(c);
  if (all && hallAll) $('#hall h3.people')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});
// The numbers as a spreadsheet: one line per building (a city's, or the whole region's). Semicolons and
// decimal commas where the language uses them, so Excel opens it right; the BOM keeps the accents.
function downloadCsv(cities, file) {
  const comma = (1.5).toLocaleString(uiLocale).includes(','), sep = comma ? ';' : ',';
  const num = (v) => (v == null ? '' : String(Math.round(v * 10) / 10).replace('.', comma ? ',' : '.'));
  const cell = (v) => { const s = String(v ?? ''); return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replaceAll('"', '""')}"` : s; };
  const lines = [t('csv.head').map(cell).join(sep)];
  for (const c of cities) for (const b of c.buildings) lines.push([cityLabel(c), name(b), num(b.floors), num(b.week), num(b.today), num(b.month), b.idle ?? '', b.cities, b.belt ? t(`belt.${b.belt}`).lower : '', b.model ? t(`model.${b.model}`).name : ''].map(cell).join(sep));
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.href = url; a.download = file; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const slug = (s) => String(s).normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'city';
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-csv]');
  if (!b || !data) return;
  const c = b.dataset.csv === 'city' && data.cities.find((x) => x.id === hallCity), day = new Date(data.generatedAt).toISOString().slice(0, 10);
  downloadCsv(c ? [c] : data.cities, `${slug(config.appName ?? 'tokenopolis')}-${c ? slug(cityLabel(c)) : 'region'}-${day}.csv`);
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'hall-q') return;
  hallQ = e.target.value;
  const c = data?.cities.find((x) => x.id === hallCity), ol = $('#hall ol.tall');
  if (c && ol) { ol.innerHTML = hallRows(c); focusable(ol.parentElement); }
});

function renderHall(c) {
  if (hallCity !== c.id) { hallCity = c.id; hallAll = false; hallSort = 'floors'; hallQ = ''; }
  // the panel is drawn again on every reading: where it was scrolled and what was being typed stay
  const hall = $('#hall'), scroll = hall.scrollTop, typing = document.activeElement?.id === 'hall-q' ? document.activeElement.selectionStart : null;
  const rank = rankOf(c), alive = c.builders / Math.max(1, c.people);
  const newcomers = c.buildings.filter((b) => b.isNew).length, corp = c.buildings.filter((b) => b.cities > 1).length;
  const works =[...c.buildings].filter((b) => b.week > 0).sort((a, b) => b.week - a.week).slice(0, 3);
  const tr = tierOf(c.floors), mons = c.monuments ?? monumentsOf(c, context(data)), missing = Math.max(1, Math.round(tr.missing));
  const mayor = mayorOf(c), race = raceOf(c), duel = derby(data), rival = duel && (duel.a === c ? duel.b : duel.b === c ? duel.a : null);
  const lastM = monthOf(data.lastMonth, 'period.lastMonth'), thisM = monthOf(data.month, 'period.thisMonth');
  const dj = dojoOf(c), building = (b, text) => `<b data-building="${esc(b.id)}">${esc(text)}</b>`;
  $('#hall').innerHTML = `
    <div class="head"><button class="back" type="button" data-back>${t('hall.back')}</button><span><span class="tag">${t('hall.tag')}</span>${closer('hall')}</span></div>
    <div class="body">
      <h1>${esc(cityLabel(c))}</h1>
      <div class="rank"><span class="medal${rank <= 3 ? ` m${rank}` : ''}">${fmt.ordinal(rank)}</span> ${t('hall.rank')}${c.floors >= TEN_BI ? `<span class="club" title="${esc(t('hall.clubTitle'))}">${t('hall.club')}</span>` : ''}</div>
      <div class="tier"><span class="ticon">${tr.icon}</span><div><b>${cityTier(tr.key).name} <small>${t('hall.style', { style: t(`style.${tr.style}`).lower })}</small></b><span>${tr.next ? t('hall.nextTier', { n: missing, floors: floorsText(missing), tier: cityTier(tr.next.key) }) : t('hall.topTier')}</span><i style="--p:${tr.progress.toFixed(3)}"></i></div></div>
      ${mayor || race ? `<div class="mayor"><span class="ticon">🎩</span><div>${mayor ? `${building(mayor, name(mayor))}<span>${t('hall.mayor', { month: thisM, lastMonth: lastM, floors: floorsText(mayor.lastMonth) })}</span>` : `<b>${t('hall.vacant')}</b><span>${t('hall.vacantText', { lastMonth: lastM })}</span>`}
        ${race ? `<span class="mrace">${t('hall.race', { month: thisM, name: building(race, displayName(race).short), n: fmt.int(race.month) })}</span>` : ''}</div></div>` : ''}
      ${dj ? `<div class="mayor dojo" data-dojo="${esc(c.id)}"><span class="ticon">🥋</span><div><b>${plural(dj.count, 'dojo.members')} · ${t(`dojoLevel.${dj.key}`).name}</b><span>${dj.next ? plural(dj.next.missing, 'dojo.next', { level: t(`dojoLevel.${dj.next.key}`) }) : t('dojo.top')} · ${t('dojo.tap')}</span></div></div>` : ''}
      ${rival ? `<div class="rival" data-city="${esc(rival.id)}">${t('hall.rival', { c: htmlCity(rival, true), mine: fmt.int(c.week), theirs: fmt.int(rival.week) })}</div>` : ''}
      <div class="grid">
        <div><b>${fmt.int(c.floors)}</b><span>${t('hall.grid.total')}</span></div>
        <div class="up"><b>+${fmt.int(c.week)}</b><span>${t('hall.grid.week')}</span></div>
        <div><b>${fmt.percent(alive)}</b><span>${t('hall.grid.built')}</span></div>
        <div><b>${fmt.int(c.floors / Math.max(1, c.people))}</b><span>${t('hall.grid.perBuilding')}</span></div>
        <div class="now"><b>${fmt.int(c.building)}</b><span>${t('hall.grid.building')}</span></div>
        <div><b>${fmt.int(newcomers)}</b><span>${t('hall.grid.newcomers')}</span></div>
      </div>
      <h3 class="people">${hallAll ? t('hall.everyone') : t('hall.tallest')}${hallAll ? ` <small>${plural(c.buildings.length, 'count.building')}</small>` : ''}</h3>
      ${hallAll ? `<div class="hall-tools"><input id="hall-q" type="search" value="${esc(hallQ)}" placeholder="${esc(t('hall.filter'))}" aria-label="${esc(t('hall.filter'))}" autocomplete="off" spellcheck="false" />
        <div class="sorts" role="group" aria-label="${esc(t('hall.sortBy'))}">${Object.keys(HALL_SORTS).map((k) => `<button type="button" data-hall-sort="${k}" aria-pressed="${k === hallSort}">${t(`hall.sort.${k}`)}</button>`).join('')}<button type="button" class="csv" data-csv="city" title="${esc(t('csv.cityTitle'))}">⬇️ CSV</button></div></div>` : ''}
      <ol class="tall${hallAll ? ' all' : ''}">${hallRows(c)}</ol>
      ${c.buildings.length > 6 ? `<button type="button" class="more" data-hall-all>${hallAll ? t('hall.less') : t('hall.all', { n: fmt.int(c.buildings.length) })}</button>` : ''}
      <h3>${t('hall.works')}</h3>
      <ol class="works">${works.map((b) => `<li data-building="${esc(b.id)}"><span>${esc(name(b))}</span><b>+${fmt.int(b.week)}</b></li>`).join('') || `<li>${t('hall.noWorks')}</li>`}</ol>
      <h3>${t('hall.achievements')} <small>${t('hall.achieved', { n: mons.filter((m) => m.ok).length, total: mons.length })}</small></h3>
      <div class="mons">${mons.map((m) => {
        const mt = monumentText(m.key), pct = fmt.percent(m.progress);
        return `<div class="mon${m.ok ? ' ok' : ''}" title="${esc(t('hall.monTitle', { name: mt.name, req: mt.req, state: m.ok ? t('hall.monDone') : pct }))}"><span>${m.icon}</span><small>${m.ok ? '✓' : pct}</small></div>`;
      }).join('')}</div>
      ${corp && !rival ? `<div class="corp">🚩 ${plural(corp, 'hall.corp')}</div>` : ''}
    </div>`;
  hall.scrollTop = scroll;
  if (typing !== null) { const q = $('#hall-q'); if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(typing, typing); } }
}

// The clickable rows of the panels (a city, a building, a headquarters) are not buttons: they get a
// place in the Tab order and the button role, and main.js turns Enter or Space on them into a click.
export function focusable(root = document) {
  for (const el of root.querySelectorAll('#trophies [data-city], #ranking-list li, #mega [data-hq], #mega [data-district], #derby [data-city], #hall [data-building], #hall [data-dojo], #hall [data-city], #sheet [data-building], #sheet li[data-city], #sheet [data-hq], #sheet [data-dojo], #finder-list li[data-city]')) {
    if (!el.matches('button, a, input')) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
  }
}

// the hour of the day the person builds most (the first of the best ones)
const peakHour = (clock) => [...clock].reduce((best, d, h) => (Number(d) > Number(clock[best]) ? h : best), 0);

// the person's token medal (every city added up) as a chip that opens the medal to download
const medalChip = (id, total) => { const m = markOf(total ?? 0); return m ? `<span class="badge tokmedal" data-medal="${esc(id)}" title="${esc(t('medal.chipTitle'))}">🏅 ${esc(t('medal.chip', { mark: markText(m.floors) }))}</span>` : ''; };

// The details card of the touched (or clicked) building.
function renderSheet(c, selected) {
  const el = $('#sheet');
  if (selected?.hq) return renderHqSheet(selected.hq);
  if (c && selected?.dojo) return renderDojoSheet(c);
  const b = c && selected && c.buildings.find((x) => x.id === selected.person);
  el.hidden = !b;
  if (!b) return;
  const inRegion = data.cities.flatMap((k) => k.buildings).sort((x, y) => y.floors - x.floors).indexOf(b) + 1, inCity = c.buildings.indexOf(b) + 1;
  const others = (b.others ?? []).map((id) => data.cities.find((x) => x.id === id)).filter(Boolean);
  const tr = tierOf(b.floors, BUILDING_TIERS), topWork = [...c.buildings].sort((x, y) => y.week - x.week)[0], missing = Math.max(1, Math.round(tr.missing));
  const badges = [
    inCity <= 3 && t('sheet.badge.cityRank', { rank: fmt.ordinal(inCity) }),
    b.heli === 2 ? t('sheet.badge.workRegion') : topWork === b && b.week > 0 && t('sheet.badge.workCity'),
    mayorOf(c) === b && t('sheet.badge.mayor', { month: monthOf(data.month, 'period.thisMonth') }),
    b.streak >= 2 && `${b.streak >= 5 ? '🌿' : '📅'} ${plural(b.streak, 'sheet.badge.streak')}`,
    b.night >= 2 && t('sheet.badge.night', { n: fmt.int(b.night) }),
    b.model && t('sheet.badge.model', { model: t(`model.${b.model}`).name, pct: fmt.percent(b.modelShare) }),
    b.cities >= 3 ? t('sheet.badge.corp', { cities: plural(b.cities, 'count.city') }) : b.cities === 2 && t('sheet.badge.network', { cities: plural(2, 'count.city') }),
  ].filter(Boolean);
  const ruin = ruinOf(b), state = ruin // on fire or rubble: how long without Claude, instead of "idle now"
    ? `<span class="ruin ${ruin}" title="${esc(t('ruin.note'))}">${t(`ruin.${ruin}`, { days: plural(b.idle, 'count.day') })}</span>`
    : b.now ? `<span>${t('sheet.now')}</span>` : `<span class="off">${t('sheet.idle')}</span>`;
  // The race around this building: where it stands in the week's builds, who is just above (or below,
  // for the tallest) and by how much, and how long until it catches fire. Last week's line comes with
  // the history (history.js fills #race-last).
  const byWeek = [...c.buildings].sort((x, y) => y.week - x.week || y.floors - x.floors), weekPos = b.week > 0 ? byWeek.indexOf(b) + 1 : 0;
  const above = c.buildings[inCity - 2], below = c.buildings[inCity], other = (x) => `<b data-building="${esc(x.id)}">${esc(displayName(x).full)}</b>`;
  const gap = (x) => floorsText(Math.max(1, Math.ceil(Math.abs(x.floors - b.floors))));
  const fireDays = config.idle?.fire > 0 && !ruin && b.idle >= 5 ? config.idle.fire + 1 - b.idle : 0;
  const race = [
    `<li>📈 ${weekPos ? t('around.week', { pos: fmt.ordinal(weekPos), n: fmt.int(b.week) }) : t('around.weekNone')}</li>`,
    above ? `<li>⬆️ ${t('around.above', { name: other(above), floors: gap(above) })}</li>` : below ? `<li>👑 ${t('around.lead', { name: other(below), floors: gap(below) })}</li>` : '',
    '<li id="race-last" hidden></li>',
    '<li id="race-days" hidden></li>',
    fireDays > 0 ? `<li class="warn">🔥 ${plural(fireDays, 'around.fire')}</li>` : '',
  ].join('');
  const q = new URLSearchParams(location.search), climbUrl = `climb.html?person=${encodeURIComponent(b.id)}${q.has('demo') ? '&demo' : ''}${q.get('lang') ? `&lang=${encodeURIComponent(q.get('lang'))}` : ''}`;
  el.innerHTML = `
    <button class="close" type="button" data-close aria-label="${esc(t('html.close'))}">×</button>
    <div class="who"><b>${esc(name(b))}</b><span>${esc(t('sheet.ranks', { c, inCity: fmt.ordinal(inCity), inRegion: fmt.ordinal(inRegion) }))}</span></div>
    <div class="nums"><div><b>${fmt.int(b.floors)}</b><span>${plural(Math.round(b.floors), 'sheet.floors')}</span></div><div class="up"><b>+${fmt.int(b.week)}</b><span>${t('sheet.week')}</span></div><div><b>+${fmt.int(b.today)}</b><span>${t('sheet.today')}</span></div></div>
    <div class="ptier"><div class="row"><span>${tr.icon} ${buildingTier(tr.key).name}</span><small>${tr.next ? t('sheet.nextTier', { n: missing, floors: floorsText(missing), tier: buildingTier(tr.next.key) }) : t('sheet.topTier')}</small></div><i style="--p:${tr.progress.toFixed(3)}"></i></div>
    <div class="chips">${state}${medalChip(b.id, b.total)}${b.mega ? `<span class="badge mega" data-hq="${esc(b.id)}" title="${esc(t('mega.badgeTitle'))}">${esc(t('mega.badge', { bi: fmt.dec(mega.line / 1000, 1) }))}</span>` : ''}${b.isNew ? `<span>${t('sheet.new')}</span>` : ''}${b.back ? `<span class="badge">${esc(t('sheet.back', { days: plural(b.back, 'count.day') }))}</span>` : ''}${b.record ? `<span class="badge">${t('sheet.record')}</span>` : ''}${b.belt ? `<span class="badge dojo" data-dojo="${esc(c.id)}" title="${esc(t('sheet.dojoTitle'))}">${t('sheet.belt', { belt: t(`belt.${b.belt}`), since: b.beltSince ? fmt.isoDate(b.beltSince) : '' })}</span>` : ''}${badges.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>
    ${others.length ? `<div class="corp">${b.cities >= 3 ? '👑' : '🚩'} ${t('sheet.alsoIn', { list: fmt.list(others.map((k) => `<button type="button" data-city="${esc(k.id)}" data-person="${esc(b.id)}">${esc(cityLabel(k))}</button>`)) })}</div>` : ''}
    <div class="race${me === b.id ? ' mine' : ''}"><h3>${me === b.id ? t('around.mine') : t('around.title')}</h3><ul>${race}</ul></div>
    ${b.clock || b.models ? `<div class="habits">${b.clock ? `<h3>${t('habits.clock')} <small>${t('habits.clockSub')}</small></h3><div class="clock" role="img" aria-label="${esc(t('habits.clockAria', { peak: fmt.clock(peakHour(b.clock)) }))}">${[...b.clock].map((d, h) => `<i style="--v:${Number(d) / 7}" title="${esc(t('habits.hour', { hour: fmt.clock(h), days: plural(Number(d), 'count.day') }))}"></i>`).join('')}</div><div class="clock-axis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>` : ''}${b.models ? `<h3>${t('habits.models')} <small>${t('habits.modelsSub')}</small></h3><div class="mix">${b.models.map(([m, s]) => `<i style="flex:${s};background:${MODEL_COLORS[m] ?? GREY}" title="${esc(`${t(`model.${m}`).name} ${fmt.percent(s)}`)}"></i>`).join('')}</div><div class="mix-key">${b.models.map(([m, s]) => `<span><i style="background:${MODEL_COLORS[m] ?? GREY}"></i>${esc(t(`model.${m}`).name)} ${fmt.percent(s)}</span>`).join('')}</div>` : ''}</div>` : ''}
    <div class="timeline" id="timeline" data-key="${esc(keyOf(c.id, b.id))}"><small>${t('sheet.timelineLoading')}</small></div>
    <div class="actions"><button class="share" type="button" data-share="${esc(c.id)}|${esc(b.id)}">${t('sheet.share')}</button>
    <button class="share mine${me === b.id ? ' on' : ''}" type="button" data-me="${esc(b.id)}">${me === b.id ? t('sheet.mine') : t('sheet.setMine')}</button>
    <button class="share roof" type="button" data-roof="${esc(c.id)}|${esc(b.id)}" title="${esc(t('sheet.roofTitle'))}">${t('sheet.roof')}</button>
    <button class="share card" type="button" data-card="${esc(c.id)}|${esc(b.id)}" title="${esc(t('sheet.cardTitle'))}">${t('sheet.card')}</button>
    ${markOf(b.total ?? 0) ? `<button class="share tokmedal" type="button" data-medal="${esc(b.id)}" title="${esc(t('medal.buttonTitle'))}">${t('medal.button')}</button>` : ''}
    <a class="share climb" href="${esc(climbUrl)}" title="${esc(t('sheet.climbTitle'))}">${t('sheet.climb')}</a></div>`;
  api.timeline?.(c, b);
}

// The card of a headquarters in the Corporate District (or of a foundation, for the next in line):
// the floors added up, each city's building (a tap flies to it) and how far the line is.
function renderHqSheet(id) {
  const el = $('#sheet'), m = mega, rank = m.members.findIndex((x) => x.id === id) + 1;
  const p = rank ? m.members[rank - 1] : m.queue.find((x) => x.id === id);
  el.hidden = !p;
  if (!p) return;
  const ruin = ruinOf(p), state = ruin
    ? `<span class="ruin ${ruin}" title="${esc(t('ruin.note'))}">${t(`ruin.${ruin}`, { days: plural(p.idle, 'count.day') })}</span>`
    : p.now ? `<span>${t('sheet.now')}</span>` : `<span class="off">${t('sheet.idle')}</span>`;
  const progress = Math.min(1, p.floors / m.line);
  el.innerHTML = `
    <button class="close" type="button" data-close aria-label="${esc(t('html.close'))}">×</button>
    <div class="who"><b>${rank ? '💎' : '🚧'} ${esc(name(p))}</b><span>${esc(rank ? t('mega.hqOf', { rank: fmt.ordinal(rank) }) : t('mega.foundOf'))}</span></div>
    <div class="nums"><div><b>${fmt.int(p.floors)}</b><span>${t('mega.sum')}</span></div><div class="up"><b>+${fmt.int(p.week)}</b><span>${t('sheet.week')}</span></div><div><b>+${fmt.int(p.month)}</b><span>${t('mega.month')}</span></div></div>
    ${rank ? `<p class="note">${t('mega.badgeText')}</p>`
      : `<div class="ptier"><div class="row"><span>🚧 ${t('mega.future')}</span><small>${t('mega.missing', { floors: floorsText(Math.max(1, Math.ceil(m.line - p.floors))) })}</small></div><i style="--p:${progress.toFixed(3)}"></i></div>`}
    <div class="chips">${state}${medalChip(p.id, p.floors)}${me === p.id ? `<span>${t('me.pin')}</span>` : ''}</div>
    <h3>${t('mega.parts')}</h3>
    <ol class="works">${p.parts.map(({ b, c }) => `<li data-city="${esc(c.id)}" data-person="${esc(b.id)}"><span>${esc(cityLabel(c))}</span><b>${fmt.int(b.floors)}</b></li>`).join('')}</ol>
    ${rank ? `<div class="actions"><button class="share card" type="button" data-hq-card="${esc(p.id)}" title="${esc(t('hqCard.buttonTitle'))}">${t('sheet.card')}</button>${markOf(p.floors) ? `<button class="share tokmedal" type="button" data-medal="${esc(p.id)}" title="${esc(t('medal.buttonTitle'))}">${t('medal.button')}</button>` : ''}</div>` : ''}`;
}

// The details card of the city's Dojo: the masters (black belts) and, only here, who is on the way
// (brown, purple, blue, white). Every belt counts for the level.
function renderDojoSheet(c) {
  const el = $('#sheet'), d = dojoOf(c);
  el.hidden = !d;
  if (!d) return;
  const belts = { black: [], brown: [], purple: [], blue: [], white: [] };
  for (const b of c.buildings) if (belts[b.belt]) belts[b.belt].push(b);
  const byFloors = (a, b) => b.floors - a.floors;
  const li = (b) => `<li data-building="${esc(b.id)}"><span>${esc(name(b))}</span><b>${fmt.int(b.floors)}</b></li>`;
  const road = ['brown', 'purple', 'blue', 'white'].filter((k) => belts[k].length);
  const progress = d.next ? d.count / (d.count + d.next.missing) : 1, level = t(`dojoLevel.${d.key}`);
  el.innerHTML = `
    <button class="close" type="button" data-close aria-label="${esc(t('html.close'))}">×</button>
    <div class="who"><b>🥋 ${esc(level.name)}</b><span>${esc(cityLabel(c))} · ${plural(d.count, 'dojo.members')}${d.blacks ? ` · ${plural(d.blacks, 'dojo.blackBelts')}` : ''}</span></div>
    <div class="ptier"><div class="row"><span>${d.icon} ${level.name}</span><small>${d.next ? plural(d.next.missing, 'dojo.next', { level: t(`dojoLevel.${d.next.key}`) }) : t('dojo.top')}</small></div><i style="--p:${progress.toFixed(3)}"></i></div>
    <h3>${t('dojo.masters')} <small>${t('belt.black').lower}</small></h3>
    ${belts.black.length ? `<ol class="works">${belts.black.sort(byFloors).map(li).join('')}</ol>` : `<p class="note">${t('dojo.noMasters')}</p>`}
    ${road.length ? `<h3>${t('dojo.onTheWay')}</h3>${road.map((k) => { const bt = t(`belt.${k}`); return `<div class="belt"><span>${bt.icon} ${bt.lower}</span><ol class="works">${belts[k].sort(byFloors).map(li).join('')}</ol></div>`; }).join('')}` : ''}
    <p class="note">${t('dojo.note')}</p>`;
}

// ───────── finder: one row per person, with their tallest building ─────────
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function people() {
  const best = new Map();
  for (const c of data.cities) for (const b of c.buildings) { const p = best.get(b.id); if (!p || b.floors > p.b.floors) best.set(b.id, { b, c }); }
  return [...best.values()];
}
export function renderFinder() {
  if (!data) return;
  const q = norm($('#finder-q').value.trim()), all = people(), key = (x) => norm(name(x.b));
  let list, head, cities = [];
  if (q) {
    list = all.filter((x) => key(x).includes(q)).sort((x, y) => (key(y).startsWith(q) - key(x).startsWith(q)) || y.b.floors - x.b.floors);
    head = list.length ? plural(list.length, 'count.building') : '';
    // the cities with that name come first: a tap opens the city
    cities = data.cities.filter((c) => norm(cityLabel(c)).includes(q)).sort((x, y) => y.floors - x.floors).slice(0, 3);
  } else {
    list = all.filter(({ b }) => b.now).sort((x, y) => y.b.floors - x.b.floors);
    head = list.length ? t('finder.now') : t('finder.tallest');
    if (!list.length) list = all.sort((x, y) => y.b.floors - x.b.floors);
  }
  const cityRows = cities.map((c, i) => { const tr = tierOf(c.floors); return `<li data-city="${esc(c.id)}" class="${i ? '' : 'on'}"><span class="ic">${tr.icon}</span>
    <div><b>${esc(cityLabel(c))}</b><small>${esc(t('finder.city', { tier: cityTier(tr.key).name, buildings: plural(c.people, 'count.building') }))}</small></div><span class="fl">${fmt.int(c.floors)}</span></li>`; });
  const rows = list.slice(0, 8).map(({ b, c }, i) => `<li data-person="${esc(b.id)}" data-city="${esc(c.id)}" class="${i || cities.length ? '' : 'on'}"><span class="ic">${tierOf(b.floors, BUILDING_TIERS).icon}</span>
    <div><b>${esc(name(b))}${b.mega ? ' 💎' : ''}</b><small>${esc(cityLabel(c))}${b.cities > 1 ? ` · ${esc(t('finder.inCities', { cities: plural(b.cities, 'count.city') }))}` : ''}${b.now ? ` · ${t('finder.nowTag')}` : ''}</small></div><span class="fl">${fmt.int(b.floors)}</span></li>`);
  queueMicrotask(() => focusable($('#finder')));
  $('#finder-list').innerHTML = (cityRows.length ? `<li class="hd">${esc(plural(cityRows.length, 'count.city'))}</li>${cityRows.join('')}` : '')
    + (head ? `<li class="hd">${esc(head)}</li>` : '') + (rows.join('') || (cityRows.length ? '' : `<li class="hd">${t('finder.none')}</li>`));
}
export function finderKey(e) {
  const items = [...document.querySelectorAll('#finder-list li[data-city]')], i = items.findIndex((li) => li.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const j = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((li, k) => li.classList.toggle('on', k === j)); items[j]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && items[Math.max(0, i)]) { const li = items[Math.max(0, i)]; api.closeModals(); if (li.dataset.person) api.goPerson(li.dataset.city, li.dataset.person); else api.goCity(li.dataset.city); }
}
export function locatePerson(pid, cityId) {
  const found = data.cities.flatMap((c) => c.buildings.filter((b) => b.id === pid).map((b) => ({ b, c })));
  return found.find((x) => x.c.id === cityId) ?? found.sort((p, q) => q.b.floors - p.b.floors)[0] ?? null;
}

// ───────── data maps ─────────
const HEAT = ['#9aa5b1', '#c9e7a2', '#f3d85a', '#f59a3c', '#e8463a'];
const MODEL_COLORS = { opus: '#2a78d6', sonnet: '#eb6834', haiku: '#1baf7a', fable: '#eda100' };
const GREY = '#9aa5b1';
const MEGA_COLOR = '#7b3fe4'; // the network map: the Mega Builders in violet, apart from the network's two golds
// The belts map paints each building with its belt (and the rest grey).
export const BELT_COLORS = { black: '#141418', brown: '#8b5a2b', purple: '#8e44ad', blue: '#2f7fe0', white: '#ffffff' };
// The data maps (like SimCity's): icon and legend colors, in the order of the map.<key>.legend texts.
export const MAPKEYS = {
  now: { icon: '⚡', colors: ['#e8463a', '#f5a63c', GREY] },
  week: { icon: '📈', colors: HEAT },
  network: { icon: '🚩', colors: [MEGA_COLOR, '#e0a400', '#ffd76e', GREY] },
  model: { icon: '🧠', colors: [MODEL_COLORS.opus, MODEL_COLORS.sonnet, MODEL_COLORS.haiku, MODEL_COLORS.fable, GREY] },
  belts: { icon: '🥋', colors: [BELT_COLORS.black, BELT_COLORS.brown, BELT_COLORS.purple, BELT_COLORS.blue, BELT_COLORS.white, GREY] },
  // health: how long since each building was used, from today to rubble (who to nudge before the fire)
  health: { icon: '🚒', colors: ['#3aa655', '#f3d85a', '#f59a3c', '#e8463a', '#5b6068'] },
};
export function mapColorFor(mode, maxWeek) {
  return (b) => {
    if (mode === 'belts') return BELT_COLORS[b.belt] ?? GREY;
    if (mode === 'health') {
      const c = MAPKEYS.health.colors, fire = config.idle?.fire ?? 15, ruin = ruinOf(b);
      if (ruin === 'rubble' || b.idle == null) return c[4];
      if (ruin === 'fire') return c[3];
      return !(b.idle > 0) ? c[0] : fire > 0 && b.idle > (fire * 2) / 3 ? c[2] : c[1];
    }
    if (mode === 'model') return MODEL_COLORS[b.model] ?? GREY;
    if (mode === 'now') return b.now ? '#e8463a' : b.today > 0 ? '#f5a63c' : GREY;
    if (mode === 'network') return b.mega ? MEGA_COLOR : b.cities >= 3 ? '#e0a400' : b.cities === 2 ? '#ffd76e' : GREY;
    const r = b.week / Math.max(1, maxWeek);
    return b.week <= 0 ? HEAT[0] : HEAT[Math.min(4, 1 + Math.floor(r * 3.999))];
  };
}
export function renderMapKey(mode) {
  const k = MAPKEYS[mode], m = k && t(`map.${mode}`);
  // how many buildings wear each color (once there is a reading)
  const counts = new Map();
  if (k && data) { const all = data.cities.flatMap((c) => c.buildings), colorOf = mapColorFor(mode, Math.max(1, ...all.map((b) => b.week))); for (const b of all) { const c = colorOf(b); counts.set(c, (counts.get(c) ?? 0) + 1); } }
  $('#mapkey').innerHTML = k ? `<b>${k.icon} ${esc(m.title)}</b>${k.colors.map((c, i) => `<span><i style="background:${c}"></i>${esc(m.legend?.[i] ?? '')}${data ? ` <em>${fmt.int(counts.get(c) ?? 0)}</em>` : ''}</span>`).join('')}<button type="button" data-map-mode="default" title="${esc(t('mapkey.back'))}">✕</button>` : '';
  document.querySelectorAll('#maps [data-map-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mapMode === (k ? mode : 'default')));
}

// ───────── newspaper and news ticker ─────────
export function renderPaper(night) { $('#newspaper-body').innerHTML = paperHtml(data, { night }); }
const recentNews = [];
export function renderNews() {
  if (!data) return;
  const rank = weekRank(), news = [];
  if (rank[0]) news.push({ text: t('news.leader', { c: rank[0], floors: floorsText(rank[0].week) }), city: rank[0].id });
  for (const a of data.cities) for (const b of data.cities) {
    if (a !== b && a.floors > b.floors && a.floors - a.week < b.floors - b.week) news.push({ text: t('news.overtook', { c: a, other: b }), city: a.id });
  }
  const all = data.cities.flatMap((c) => c.buildings.map((b) => ({ b, c })));
  const tallest = all.sort((x, y) => y.b.floors - x.b.floors)[0];
  if (tallest) news.push({ text: t('news.tallest', { name: name(tallest.b), c: tallest.c, floors: floorsText(tallest.b.floors) }), city: tallest.c.id, person: tallest.b.id });
  const work = [...all].sort((x, y) => y.b.week - x.b.week)[0];
  if (work?.b.week > 0) news.push({ text: t('news.work', { name: name(work.b), floors: floorsText(work.b.week), c: work.c }), city: work.c.id, person: work.b.id });
  const fresh = all.filter((x) => x.b.isNew).length, active = all.filter((x) => x.b.now).length;
  if (fresh) news.push({ text: plural(fresh, 'news.newcomers') });
  const back = all.filter((x) => x.b.back); // back today after the building had caught fire
  if (back.length) news.push({ text: plural(back.length, 'news.back', { name: name(back[0].b) }), city: back[0].c.id, person: back[0].b.id });
  news.push({ text: plural(active, 'news.active') });
  news.unshift(...[...recentNews].reverse().map((n) => ({ ...n, text: `🔴 ${n.text}` })));
  // an item about a city or a person is a button that goes there
  const el = $('#news'), html = news.map((n) => (n.city ? `<button type="button" data-city="${esc(n.city)}"${n.person ? ` data-person="${esc(n.person)}"` : ''}>${esc(n.text)}</button>` : `<span>${esc(n.text)}</span>`)).join('');
  if (el.innerHTML !== html) { el.innerHTML = html; el.style.setProperty('--ticker-s', `${Math.max(30, news.map((n) => n.text).join(' ').length / 7)}s`); }
}

// ───────── live notices ─────────
// 🔔: the notices of this visit (they leave the screen in seconds) and the week's diary, which
// history.js works out from the record; each line goes to its city or building.
const notices = [];
export function renderBell(diary) {
  const el = $('#bell'), go = (e) => (e.city ? ` data-city="${esc(e.city)}"${e.person ? ` data-person="${esc(e.person)}"` : ''}` : ' disabled');
  const row = (icon, who, what, when, e) => `<button type="button"${go(e)}><span>${icon}</span><div><b>${esc(who)}</b><small>${esc(what)}</small></div><em>${esc(when)}</em></button>`;
  const said = notices.map((x) => row(x.icon, x.title, x.text, fmt.time(x.at), x)).join('');
  const week = diary?.map((e) => {
    const city = cityLabel(e.c), at = { city: e.c.id, person: e.b?.id };
    if (e.kind === 'tier') return row(e.icon, name(e.b), t('diary.tier', { tier: buildingTier(e.tier).name, city }), e.when, at);
    if (e.kind === 'new') return row(e.icon, name(e.b), t('diary.new', { city }), e.when, at);
    if (e.kind === 'fire') return row(e.icon, name(e.b), t('diary.fire', { city }), e.when, at);
    if (e.kind === 'cityTier') return row(e.icon, city, t('diary.cityTier', { tier: cityTier(e.tier).name }), e.when, at);
    return row(e.icon, city, t('diary.overtake', { other: cityLabel(e.other) }), e.when, at);
  }).join('');
  el.innerHTML = `<h4>${t('bell.now')}</h4>${said || `<p>${t('bell.none')}</p>`}<h4>${t('bell.week')}</h4>${diary ? week || `<p>${t('bell.quiet')}</p>` : `<p>${t('bell.loading')}</p>`}`;
  $('#bell-btn')?.classList.remove('lit');
}
const toastQ = []; let toastBusy = false;
export function queueToast(x) { toastQ.push(x); if (toastQ.length > 12) toastQ.splice(0, toastQ.length - 12); pumpToasts(); }
function pumpToasts() {
  if (toastBusy || !toastQ.length) return;
  toastBusy = true; showToast(toastQ.shift());
  setTimeout(() => { toastBusy = false; pumpToasts(); }, 3400);
}
function showToast(x) {
  if (!x.tip && !x.quiet) { // the real notices also run on the ticker, with the time
    recentNews.push({ text: `${fmt.time(Date.now())} · ${x.title}: ${x.text}`, city: x.city, person: x.person });
    if (recentNews.length > 6) recentNews.shift();
    notices.unshift({ at: Date.now(), icon: x.icon, title: x.title, text: x.text, city: x.city, person: x.person });
    if (notices.length > 40) notices.pop();
    $('#bell-btn')?.classList.add('lit'); // something new since the list was last opened
    renderNews();
  }
  if (x.fireworks && x.city) api.celebrate?.(x.city);
  const box = $('#toasts'), el = document.createElement('div');
  el.className = `toast${x.tip ? ' tip' : ''}`;
  el.innerHTML = `<span class="ti">${x.icon}</span><div><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`;
  el.addEventListener('click', () => { if (x.person) api.goPerson(x.city, x.person); else if (x.city) api.goCity(x.city); el.remove(); });
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, x.ms ?? 7000);
}
export const hasToasts = () => toastQ.length > 0;

// What changed between two readings (every minute): a new floor, a milestone, a newcomer, an
// overtake, the lead and a monument. Returns the "+N floors" that float over the buildings.
export function liveEvents(prev, next) {
  const floats = [], sparkles = [], confetti = [], fireworks = [], rockets = [];
  const before = new Map(prev.cities.flatMap((c) => c.buildings.map((b) => [keyOf(c.id, b.id), b])));
  const known = new Set(prev.cities.map((c) => c.id));
  for (const c of next.cities) for (const b of c.buildings) {
    const key = keyOf(c.id, b.id), p = before.get(key), delay = Math.random() * 45_000;
    if (!p) {
      if (known.has(c.id)) { queueToast({ icon: '🎈', title: t('toast.newcomer.title'), text: t('toast.newcomer.text', { name: name(b), c }), city: c.id, person: b.id }); confetti.push({ key, delay }); }
      continue;
    }
    if (b.floors - p.floors < 0.02) continue;
    const n = Math.floor(b.floors) - Math.floor(p.floors);
    if (n > 0) floats.push({ city: c.id, person: b.id, text: plural(n, 'float.floors'), delay, gold: b.id === me });
    if (n > 0 && b.id === me) queueToast({ icon: '📍', title: t('toast.grew.title'), text: t('toast.grew.text', { floors: plural(n, 'count.floor'), c, total: fmt.int(b.floors) }), city: c.id, person: b.id });
    sparkles.push({ key, delay });
    const t0 = tierOf(p.floors, BUILDING_TIERS), t1 = tierOf(b.floors, BUILDING_TIERS);
    if (t1.index > t0.index) {
      if (t1.key === 'spaceElevator') { queueToast({ icon: '🚀', title: t('toast.elevator.title'), text: t('toast.elevator.text', { name: name(b), c }), city: c.id, person: b.id, ms: 10000, fireworks: true }); rockets.push({ key }); }
      else { const tier = buildingTier(t1.key); queueToast({ icon: t1.icon, title: t('toast.buildingTier.title', { tier }), text: t('toast.buildingTier.text', { name: name(b), c, n: fmt.int(t1.min) }), city: c.id, person: b.id }); fireworks.push({ key, delay }); }
    }
  }
  const pc = new Map(prev.cities.map((c) => [c.id, c])), px = context(prev), nx = context(next);
  for (const a of next.cities) for (const b of next.cities) {
    const pa = pc.get(a.id), pb = pc.get(b.id);
    if (pa && pb && a !== b && a.floors > b.floors && pa.floors <= pb.floors) queueToast({ icon: '🏁', title: t('toast.overtake.title'), text: t('toast.overtake.text', { c: a, other: b }), city: a.id, fireworks: true });
  }
  for (const c of next.cities) {
    const p = pc.get(c.id);
    if (!p) continue;
    const t0 = tierOf(p.floors), t1 = tierOf(c.floors);
    if (t1.index > t0.index) { const tier = cityTier(t1.key); queueToast({ icon: t1.icon, title: t('toast.cityTier.title', { c, tier }), text: t('toast.cityTier.text', { floors: floorsText(t1.min), tier }), city: c.id, fireworks: true }); }
    const m0 = mayorOf(p), m1 = mayorOf(c);
    if (m1 && m0?.id !== m1.id) queueToast({ icon: '🎩', title: t('toast.mayor.title', { c }), text: t('toast.mayor.text', { name: name(m1), lastMonth: monthOf(next.lastMonth, 'period.lastMonth') }), city: c.id, person: m1.id });
    const had = new Set(monumentsOf(p, px).filter((m) => m.ok).map((m) => m.key));
    for (const m of monumentsOf(c, nx)) if (m.ok && !had.has(m.key)) { const mon = monumentText(m.key); queueToast({ icon: m.icon, title: t('toast.monument.title', { mon }), text: t('toast.monument.text', { c, mon }), city: c.id, fireworks: true }); }
  }
  if (nx.leader && px.leader?.id !== nx.leader.id) queueToast({ icon: '🏗️', title: t('toast.leader.title'), text: t('toast.leader.text', { c: nx.leader }), city: nx.leader.id, fireworks: true });
  return { floats, sparkles, confetti, fireworks, rockets };
}
