// The HTML panels: trophies and the ranking of this week's builds, the derby, the countdown, the
// City Hall of the open city, the details card of the touched building, the live notices (toasts)
// and what changed between two readings (liveEvents).

import { t, plural, fmt, cityLabel, displayName } from '../i18n/index.js';
import { tierOf, BUILDING_TIERS, TEN_BI, monumentsOf, context, mayorOf, raceOf, derby, countdowns, paperHtml, cityTier, buildingTier, monumentText, monthOf, floorsText, htmlCity } from './rules.js';
import { dojoOf } from './world.js';

const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const keyOf = (cityId, personId) => `${cityId}|${personId}`;
const name = (b) => displayName(b).full;
// the × of a panel: hides it (the 👁️ brings it back)
const closer = (panel) => {
  const label = t(`close.${panel}`);
  return `<button type="button" class="panel-x" data-hide-panel="${panel}" aria-label="${esc(label)}" title="${esc(t('close.title', { label }))}">×</button>`;
};
// the stale pill: the data source's error (or no server at all), and that this is the last reading
export const staleText = (error) => `⚠️ ${error ? t(`error.${error.code}`, error) : t('error.offline')} · ${t('error.stale')}`;

let api = null, data = null, me = null;
export function initPanels(a) { api = a; }
export const setMe = (id) => { me = id; };

const weekRank = () => [...data.cities].sort((a, b) => b.week - a.week || b.floors - a.floors);
const rankOf = (c) => weekRank().indexOf(c) + 1;

export function renderPanels(d, view, selected) {
  data = d;
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
  const pill = $('#mode-pill');
  pill.hidden = data.mode !== 'mock' && data.mode !== 'demo';
  if (data.mode === 'demo') pill.textContent = t('header.demoPill');
  const stale = $('#stale-pill'); stale.hidden = !data.error; if (data.error) stale.textContent = staleText(data.error);
  if (isCity) renderHall(city); else renderRegionPanels();
  renderSheet(city, selected);
}

function renderRegionPanels() {
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
  $('#ranking-list').innerHTML = rank.slice(0, 14).map((c, i) => `
    <li data-city="${esc(c.id)}" title="${esc(t('ranking.see', { c }))}"><span class="pos">${i + 1}</span>
      <span class="name">${esc(cityLabel(c))}</span><span class="bar" style="--w:${(c.week / max).toFixed(4)}"></span><span class="val">+${fmt.int(c.week)}</span></li>`).join('');
  renderDerby();
  renderCountdown();
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

function renderHall(c) {
  const rank = rankOf(c), alive = c.builders / Math.max(1, c.people);
  const newcomers = c.buildings.filter((b) => b.isNew).length, corp = c.buildings.filter((b) => b.cities > 1).length;
  const top = c.buildings.slice(0, 6), maxF = Math.max(1, top[0]?.floors ?? 1);
  const works = [...c.buildings].filter((b) => b.week > 0).sort((a, b) => b.week - a.week).slice(0, 3);
  const chip = (b) => (b.cities > 1 ? `<span class="chip" title="${esc(t('hall.chipTitle', { cities: plural(b.cities, 'count.city') }))}">${b.cities >= 3 ? '👑' : '🚩'}${b.cities}</span>` : '');
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
      ${dj ? `<div class="mayor dojo" data-dojo="${esc(c.id)}"><span class="ticon">🥋</span><div><b>${plural(dj.blacks, 'dojo.blackBelts')} · ${t(`dojoLevel.${dj.key}`).name}</b><span>${dj.next ? plural(dj.next.missing, 'dojo.next', { level: t(`dojoLevel.${dj.next.key}`) }) : t('dojo.top')} · ${t('dojo.tap')}</span></div></div>` : ''}
      ${rival ? `<div class="rival" data-city="${esc(rival.id)}">${t('hall.rival', { c: htmlCity(rival, true), mine: fmt.int(c.week), theirs: fmt.int(rival.week) })}</div>` : ''}
      <div class="grid">
        <div><b>${fmt.int(c.floors)}</b><span>${t('hall.grid.total')}</span></div>
        <div class="up"><b>+${fmt.int(c.week)}</b><span>${t('hall.grid.week')}</span></div>
        <div><b>${fmt.percent(alive)}</b><span>${t('hall.grid.built')}</span></div>
        <div><b>${fmt.int(c.floors / Math.max(1, c.people))}</b><span>${t('hall.grid.perBuilding')}</span></div>
        <div class="now"><b>${fmt.int(c.building)}</b><span>${t('hall.grid.building')}</span></div>
        <div><b>${fmt.int(newcomers)}</b><span>${t('hall.grid.newcomers')}</span></div>
      </div>
      <h3>${t('hall.tallest')}</h3>
      <ol class="tall">${top.map((b, i) => `<li data-building="${esc(b.id)}"><span class="n">${i + 1}</span><span class="who">${esc(name(b))}${chip(b)}</span>
        <span class="bar" style="width:${Math.max(2, (120 * b.floors) / maxF)}px"></span><span class="v">${fmt.int(b.floors)}</span></li>`).join('')}</ol>
      <h3>${t('hall.works')}</h3>
      <ol class="works">${works.map((b) => `<li data-building="${esc(b.id)}"><span>${esc(name(b))}</span><b>+${fmt.int(b.week)}</b></li>`).join('') || `<li>${t('hall.noWorks')}</li>`}</ol>
      <h3>${t('hall.achievements')} <small>${t('hall.achieved', { n: mons.filter((m) => m.ok).length, total: mons.length })}</small></h3>
      <div class="mons">${mons.map((m) => {
        const mt = monumentText(m.key), pct = fmt.percent(m.progress);
        return `<div class="mon${m.ok ? ' ok' : ''}" title="${esc(t('hall.monTitle', { name: mt.name, req: mt.req, state: m.ok ? t('hall.monDone') : pct }))}"><span>${m.icon}</span><small>${m.ok ? '✓' : pct}</small></div>`;
      }).join('')}</div>
      ${corp && !rival ? `<div class="corp">🚩 ${plural(corp, 'hall.corp')}</div>` : ''}
    </div>`;
}

// The details card of the touched (or clicked) building.
function renderSheet(c, selected) {
  const el = $('#sheet');
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
  el.innerHTML = `
    <button class="close" type="button" data-close aria-label="${esc(t('html.close'))}">×</button>
    <div class="who"><b>${esc(name(b))}</b><span>${esc(t('sheet.ranks', { c, inCity: fmt.ordinal(inCity), inRegion: fmt.ordinal(inRegion) }))}</span></div>
    <div class="nums"><div><b>${fmt.int(b.floors)}</b><span>${plural(Math.round(b.floors), 'sheet.floors')}</span></div><div class="up"><b>+${fmt.int(b.week)}</b><span>${t('sheet.week')}</span></div><div><b>+${fmt.int(b.today)}</b><span>${t('sheet.today')}</span></div></div>
    <div class="ptier"><div class="row"><span>${tr.icon} ${buildingTier(tr.key).name}</span><small>${tr.next ? t('sheet.nextTier', { n: missing, floors: floorsText(missing), tier: buildingTier(tr.next.key) }) : t('sheet.topTier')}</small></div><i style="--p:${tr.progress.toFixed(3)}"></i></div>
    <div class="chips">${b.now ? `<span>${t('sheet.now')}</span>` : `<span class="off">${t('sheet.idle')}</span>`}${b.isNew ? `<span>${t('sheet.new')}</span>` : ''}${b.belt === 'black' ? `<span class="badge dojo" data-dojo="${esc(c.id)}" title="${esc(t('sheet.dojoTitle'))}">${t('sheet.blackBelt', { since: b.beltSince ? fmt.isoDate(b.beltSince) : '' })}</span>` : ''}${badges.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>
    ${others.length ? `<div class="corp">${b.cities >= 3 ? '👑' : '🚩'} ${t('sheet.alsoIn', { list: fmt.list(others.map((k) => `<button type="button" data-city="${esc(k.id)}" data-person="${esc(b.id)}">${esc(cityLabel(k))}</button>`)) })}</div>` : ''}
    <div class="timeline" id="timeline" data-key="${esc(keyOf(c.id, b.id))}"><small>${t('sheet.timelineLoading')}</small></div>
    <div class="actions"><button class="share" type="button" data-share="${esc(c.id)}|${esc(b.id)}">${t('sheet.share')}</button>
    <button class="share mine${me === b.id ? ' on' : ''}" type="button" data-me="${esc(b.id)}">${me === b.id ? t('sheet.mine') : t('sheet.setMine')}</button></div>`;
  api.timeline?.(c, b);
}

// The details card of the city's Dojo: the masters (black belts) and, only here, who is on the way.
function renderDojoSheet(c) {
  const el = $('#sheet'), d = dojoOf(c);
  el.hidden = !d;
  if (!d) return;
  const belts = { black: [], brown: [], purple: [], blue: [] };
  for (const b of c.buildings) if (belts[b.belt]) belts[b.belt].push(b);
  const byFloors = (a, b) => b.floors - a.floors;
  const li = (b) => `<li data-building="${esc(b.id)}"><span>${esc(name(b))}</span><b>${fmt.int(b.floors)}</b></li>`;
  const road = ['brown', 'purple', 'blue'].filter((k) => belts[k].length);
  const progress = d.next ? d.blacks / (d.blacks + d.next.missing) : 1, level = t(`dojoLevel.${d.key}`);
  el.innerHTML = `
    <button class="close" type="button" data-close aria-label="${esc(t('html.close'))}">×</button>
    <div class="who"><b>🥋 ${esc(level.name)}</b><span>${esc(cityLabel(c))} · ${plural(d.blacks, 'dojo.blackBelts')}</span></div>
    <div class="ptier"><div class="row"><span>${d.icon} ${level.name}</span><small>${d.next ? plural(d.next.missing, 'dojo.next', { level: t(`dojoLevel.${d.next.key}`) }) : t('dojo.top')}</small></div><i style="--p:${progress.toFixed(3)}"></i></div>
    <h3>${t('dojo.masters')} <small>${t('belt.black').lower}</small></h3>
    <ol class="works">${belts.black.sort(byFloors).map(li).join('')}</ol>
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
  let list, head;
  if (q) {
    list = all.filter((x) => key(x).includes(q)).sort((x, y) => (key(y).startsWith(q) - key(x).startsWith(q)) || y.b.floors - x.b.floors);
    head = list.length ? plural(list.length, 'count.building') : '';
  } else {
    list = all.filter(({ b }) => b.now).sort((x, y) => y.b.floors - x.b.floors);
    head = list.length ? t('finder.now') : t('finder.tallest');
    if (!list.length) list = all.sort((x, y) => y.b.floors - x.b.floors);
  }
  const rows = list.slice(0, 8).map(({ b, c }, i) => `<li data-person="${esc(b.id)}" data-city="${esc(c.id)}" class="${i ? '' : 'on'}"><span class="ic">${tierOf(b.floors, BUILDING_TIERS).icon}</span>
    <div><b>${esc(name(b))}</b><small>${esc(cityLabel(c))}${b.cities > 1 ? ` · ${esc(t('finder.inCities', { cities: plural(b.cities, 'count.city') }))}` : ''}${b.now ? ` · ${t('finder.nowTag')}` : ''}</small></div><span class="fl">${fmt.int(b.floors)}</span></li>`);
  $('#finder-list').innerHTML = (head ? `<li class="hd">${esc(head)}</li>` : '') + (rows.join('') || `<li class="hd">${t('finder.none')}</li>`);
}
export function finderKey(e) {
  const items = [...document.querySelectorAll('#finder-list li[data-person]')], i = items.findIndex((li) => li.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const j = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((li, k) => li.classList.toggle('on', k === j)); items[j]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && items[Math.max(0, i)]) { const li = items[Math.max(0, i)]; api.closeModals(); api.goPerson(li.dataset.city, li.dataset.person); }
}
export function locatePerson(pid, cityId) {
  const found = data.cities.flatMap((c) => c.buildings.filter((b) => b.id === pid).map((b) => ({ b, c })));
  return found.find((x) => x.c.id === cityId) ?? found.sort((p, q) => q.b.floors - p.b.floors)[0] ?? null;
}

// ───────── data maps ─────────
const HEAT = ['#9aa5b1', '#c9e7a2', '#f3d85a', '#f59a3c', '#e8463a'];
const MODEL_COLORS = { opus: '#2a78d6', sonnet: '#eb6834', haiku: '#1baf7a', fable: '#eda100' };
const GREY = '#9aa5b1';
// The data maps (like SimCity's): icon and legend colors, in the order of the map.<key>.legend texts.
export const MAPKEYS = {
  now: { icon: '🔥', colors: ['#e8463a', '#f5a63c', GREY] },
  week: { icon: '📈', colors: HEAT },
  network: { icon: '🚩', colors: ['#e0a400', '#ffd76e', GREY] },
  model: { icon: '🧠', colors: [MODEL_COLORS.opus, MODEL_COLORS.sonnet, MODEL_COLORS.haiku, MODEL_COLORS.fable, GREY] },
  belts: { icon: '🥋', colors: ['#141418', '#c9ced4'] },
};
export function mapColorFor(mode, maxWeek) {
  return (b) => {
    if (mode === 'belts') return b.belt === 'black' ? '#141418' : '#c9ced4';
    if (mode === 'model') return MODEL_COLORS[b.model] ?? GREY;
    if (mode === 'now') return b.now ? '#e8463a' : b.today > 0 ? '#f5a63c' : GREY;
    if (mode === 'network') return b.cities >= 3 ? '#e0a400' : b.cities === 2 ? '#ffd76e' : GREY;
    const r = b.week / Math.max(1, maxWeek);
    return b.week <= 0 ? HEAT[0] : HEAT[Math.min(4, 1 + Math.floor(r * 3.999))];
  };
}
export function renderMapKey(mode) {
  const k = MAPKEYS[mode], m = k && t(`map.${mode}`);
  $('#mapkey').innerHTML = k ? `<b>${k.icon} ${esc(m.title)}</b>${k.colors.map((c, i) => `<span><i style="background:${c}"></i>${esc(m.legend?.[i] ?? '')}</span>`).join('')}<button type="button" data-map-mode="default" title="${esc(t('mapkey.back'))}">✕</button>` : '';
  document.querySelectorAll('#maps [data-map-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mapMode === (k ? mode : 'default')));
}

// ───────── newspaper and news ticker ─────────
export function renderPaper(night) { $('#newspaper-body').innerHTML = paperHtml(data, { night }); }
const recentNews = [];
export function renderNews() {
  if (!data) return;
  const rank = weekRank(), news = [];
  if (rank[0]) news.push(t('news.leader', { c: rank[0], floors: floorsText(rank[0].week) }));
  for (const a of data.cities) for (const b of data.cities) {
    if (a !== b && a.floors > b.floors && a.floors - a.week < b.floors - b.week) news.push(t('news.overtook', { c: a, other: b }));
  }
  const all = data.cities.flatMap((c) => c.buildings.map((b) => ({ b, c })));
  const tallest = all.sort((x, y) => y.b.floors - x.b.floors)[0];
  if (tallest) news.push(t('news.tallest', { name: name(tallest.b), c: tallest.c, floors: floorsText(tallest.b.floors) }));
  const work = [...all].sort((x, y) => y.b.week - x.b.week)[0];
  if (work?.b.week > 0) news.push(t('news.work', { name: name(work.b), floors: floorsText(work.b.week), c: work.c }));
  const fresh = all.filter((x) => x.b.isNew).length, active = all.filter((x) => x.b.now).length;
  if (fresh) news.push(plural(fresh, 'news.newcomers'));
  news.push(plural(active, 'news.active'));
  news.unshift(...[...recentNews].reverse().map((n) => `🔴 ${n}`));
  const el = $('#news'), html = news.map((n) => `<span>${esc(n)}</span>`).join('');
  if (el.innerHTML !== html) { el.innerHTML = html; el.style.setProperty('--ticker-s', `${Math.max(30, news.join(' ').length / 7)}s`); }
}

// ───────── live notices ─────────
const toastQ = []; let toastBusy = false;
export function queueToast(x) { toastQ.push(x); if (toastQ.length > 12) toastQ.splice(0, toastQ.length - 12); pumpToasts(); }
function pumpToasts() {
  if (toastBusy || !toastQ.length) return;
  toastBusy = true; showToast(toastQ.shift());
  setTimeout(() => { toastBusy = false; pumpToasts(); }, 3400);
}
function showToast(x) {
  if (!x.tip && !x.quiet) { // the real notices also run on the ticker, with the time
    recentNews.push(`${fmt.time(Date.now())} · ${x.title}: ${x.text}`);
    if (recentNews.length > 6) recentNews.shift();
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
