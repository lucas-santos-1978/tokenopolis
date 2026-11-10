// History. The record (/api/history: floors per day of each building since the start), the timeline
// on the details card, the region's time-lapse (in 3D, the film's buildings are instanced boxes
// growing on today's lots) and the city race (bars week by week).

import * as THREE from 'three';
import { t, plural, fmt, config, displayName } from '../i18n/index.js';
import { tierOf, cityTier, floorsText, BUILDING_TIERS } from './rules.js';
import { STYLE_PAL, PAL } from './buildings.js';
import { esc, keyOf } from './panels.js';

const $ = (s) => document.querySelector(s);
const DAY_MS = 86_400_000;
let hist = null, historyAt = 0, historyLoading = null;
export function loadHistory() {
  if (hist && Date.now() - historyAt < 30 * 60_000) return Promise.resolve(hist);
  historyLoading ??= fetch(`api/history${new URLSearchParams(location.search).has('demo') ? '?demo' : ''}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j) => { hist = j; historyAt = Date.now(); return j; })
    .finally(() => { historyLoading = null; });
  return historyLoading;
}
const seriesOf = (cityId, personId) => hist?.cities.find((c) => c.id === cityId)?.people.find((p) => p.id === personId)?.d ?? null;
// Day i of the record: an instant at noon of that day (h.start is local midnight in the configured
// zone) and its ISO calendar day, for the formatters.
const dayMs = (h, i) => h.start + i * DAY_MS + 12 * 3600_000;
let isoFmt = null;
const dayIso = (h, i) => (isoFmt ??= new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })).format(dayMs(h, i));
const dayShort = (h, i) => fmt.date(dayMs(h, i), 'short'); // "Oct 21" / "21 out"
const weekday0 = (h) => new Date(`${dayIso(h, 0)}T12:00:00Z`).getUTCDay(); // the record's first day, Sunday = 0

// The week's diary: what happened since Monday, worked out from the record (nothing is stored, so it is
// there for whoever was not watching): who moved up a type of building, newcomers, buildings that
// caught fire, cities that changed title or passed another. Newest first. Needs loadHistory().
export function weekDiary(data) {
  if (!hist || !data) return [];
  const n = hist.days, w0 = Math.max(0, Math.round((data.week.start - hist.start) / DAY_MS)), fire = config.idle?.fire ?? 0, out = [], totals = [];
  for (const hc of hist.cities) {
    const c = data.cities.find((x) => x.id === hc.id);
    if (!c) continue;
    const byId = new Map(c.buildings.map((b) => [b.id, b])), cityCum = new Array(n).fill(0);
    for (const p of hc.people) {
      const b = byId.get(p.id);
      let cum = 0, first = -1, last = -1;
      for (let i = 0; i < n; i++) {
        const before = cum;
        cum += p.d[i] / 10; cityCum[i] += cum;
        if (p.d[i] > 0) { if (first < 0) first = i; last = i; }
        if (b && i >= w0 && before > 0 && cum >= 15) { // a new type of building (from the building up: the houses change too often)
          const t0 = tierOf(before, BUILDING_TIERS), t1 = tierOf(cum, BUILDING_TIERS);
          if (t1.key !== t0.key) out.push({ day: i, icon: t1.icon, kind: 'tier', b, c, tier: t1.key });
        }
      }
      if (b && first >= w0) out.push({ day: first, icon: '🎈', kind: 'new', b, c });
      const burn = last + fire + 1; // the day the fire starts, if nothing was built since
      if (b && fire > 0 && last >= 0 && burn >= w0 && burn < n) out.push({ day: burn, icon: '🔥', kind: 'fire', b, c });
    }
    for (let i = Math.max(1, w0); i < n; i++) { const t0 = tierOf(cityCum[i - 1]), t1 = tierOf(cityCum[i]); if (t0.key !== t1.key) out.push({ day: i, icon: t1.icon, kind: 'cityTier', c, tier: t1.key }); }
    totals.push({ c, cum: cityCum });
  }
  for (let i = Math.max(1, w0); i < n; i++) for (const a of totals) for (const b of totals) {
    if (a !== b && a.cum[i - 1] < b.cum[i - 1] && a.cum[i] > b.cum[i]) out.push({ day: i, icon: '🏁', kind: 'overtake', c: a.c, other: b.c });
  }
  return out.sort((x, y) => y.day - x.day).slice(0, 80).map((e) => ({ ...e, when: fmt.dayShort(dayIso(hist, e.day)) }));
}

// The details card's timeline: floors accumulated day by day, the best day and the best week;
// hovering (or touching) shows the day.
export function renderTimeline(c, b) {
  const el = $('#timeline');
  if (!el || el.dataset.key !== keyOf(c.id, b.id)) return;
  const d = seriesOf(c.id, b.id);
  if (!d?.some((v) => v > 0)) { el.innerHTML = `<small>${t('timeline.empty')}</small>`; return; }
  const cum = [];
  d.reduce((s, v, i) => (cum[i] = s + v / 10), 0);
  const best = d.reduce((bi, v, i) => (v > d[bi] ? i : bi), 0);
  const dow0 = weekday0(hist), weeks = new Map();
  d.forEach((v, i) => { const w = Math.floor((i + ((dow0 + 6) % 7)) / 7); weeks.set(w, (weeks.get(w) ?? 0) + v / 10); });
  const [bw, bwv] = [...weeks].reduce((m, x) => (x[1] > m[1] ? x : m), [0, -1]), bwStart = Math.max(0, bw * 7 - ((dow0 + 6) % 7));
  const bwEnd = Math.min(d.length - 1, bw * 7 - ((dow0 + 6) % 7) + 6);
  const Wd = 320, Hd = 64, max = Math.max(1, cum.at(-1)), n = d.length;
  // the card's race: last week against this one (the week of the record's last day)
  const wNow = Math.floor((n - 1 + ((dow0 + 6) % 7)) / 7), last = $('#race-last');
  if (last) { last.hidden = false; last.textContent = `📅 ${t('around.lastWeek', { last: fmt.int(weeks.get(wNow - 1) ?? 0), now: fmt.int(weeks.get(wNow) ?? 0) })}`; }
  const daysEl = $('#race-days'), span = Math.min(30, n), active = d.slice(-span).filter((v) => v > 0).length; // the days with any floor, of the last 30
  if (daysEl) { daysEl.hidden = false; daysEl.textContent = `🗓️ ${t('around.activeDays', { n: fmt.int(active), span: fmt.int(span) })}`; }
  const X = (i) => (n === 1 ? Wd / 2 : (i / (n - 1)) * Wd), Y = (v) => Hd - 4 - (v / max) * (Hd - 10);
  const line = cum.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  el.innerHTML = `
    <div class="tl-head"><b>${t('timeline.title')}</b><small>${t('timeline.since', { date: dayShort(hist, 0) })}</small></div>
    <div class="tl-plot"><svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none" role="img" aria-label="${esc(t('timeline.aria', { name: displayName(b).full }))}">
      <line x1="0" y1="${Hd - 4}" x2="${Wd}" y2="${Hd - 4}" class="base"/>
      <path d="${line}L${Wd},${Hd - 4}L0,${Hd - 4}Z" class="area"/><path d="${line}" class="line"/>
      <line class="cross" x1="0" x2="0" y1="0" y2="${Hd}" visibility="hidden"/>
    </svg><span class="dot" hidden></span><span class="tltip" hidden></span></div>
    <div class="tl-axis"><span>${dayShort(hist, 0)}</span><span>${t('timeline.today')}</span></div>
    <div class="tl-best"><span>${t('timeline.bestDay', { date: dayShort(hist, best), floors: floorsText(d[best] / 10) })}</span><span>${t('timeline.bestWeek', { from: dayShort(hist, bwStart), to: dayShort(hist, bwEnd), n: fmt.int(bwv) })}</span></div>`;
  const plot = el.querySelector('.tl-plot'), cross = el.querySelector('.cross'), tip = el.querySelector('.tltip'), dot = el.querySelector('.dot');
  const show = (ev) => {
    const r = plot.getBoundingClientRect(), u = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), i = Math.round(u * (n - 1));
    const px = (X(i) / Wd) * r.width, py = (Y(cum[i]) / Hd) * r.height;
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
    dot.hidden = false; dot.style.left = `${px}px`; dot.style.top = `${py}px`;
    tip.hidden = false; tip.innerHTML = `<b>${fmt.dayShort(dayIso(hist, i))}</b> ${floorsText(cum[i])}${d[i] ? ` · <span>+${fmt.int(d[i] / 10)}</span>` : ''}`;
    tip.style.left = `${Math.max(0, Math.min(r.width - tip.offsetWidth, px - tip.offsetWidth / 2))}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; dot.hidden = true; };
  plot.addEventListener('pointermove', show); plot.addEventListener('pointerdown', show); plot.addEventListener('pointerleave', hide);
}

// ───────── time-lapse: the region day by day, from the first day until today, in ~22 s ─────────
// The buildings stay on today's lots and grow as instanced boxes (a single mesh), in the city's
// style color; whoever had not started yet has no building. The panels follow along.
const TL_MS = 22_000;
export function startTimelapse({ h, data, scene, bldGroup, hitByKey, hOfFloors, onDay, onTier, onDone }) {
  const cum = new Map();
  for (const c of h.cities) for (const p of c.people) { const a = new Float64Array(h.days); p.d.reduce((s, v, i) => (a[i] = s + v / 10), 0); cum.set(keyOf(c.id, p.id), a); }
  const frame = { ...data, cities: data.cities.map((c) => ({ ...c, buildings: c.buildings.map((b) => ({ ...b, floors: 0, week: 0, today: 0, now: false, isNew: false, hours: 0, streak: 0, night: 0 })) })) };
  const items = [];
  for (const c of frame.cities) for (const b of c.buildings) { const hit = hitByKey.get(keyOf(c.id, b.id)), a = cum.get(keyOf(c.id, b.id)); if (hit && a) items.push({ b, c, x: hit.x, z: hit.z, a }); }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), Math.max(1, items.length));
  const col = new THREE.Color();
  items.forEach((it, i) => mesh.setColorAt(i, col.set(STYLE_PAL[it.c.style]?.building[0] ?? PAL.house[0])));
  mesh.castShadow = mesh.receiveShadow = true; mesh.count = items.length; scene.add(mesh);
  bldGroup.visible = false;
  const tl = { t0: performance.now(), day: -1, hold: 0, tiers: new Map(data.cities.map((c) => [c.id, -1])), news: null };
  const _m = new THREE.Matrix4();
  function step(now) {
    const u = Math.min(1, (now - tl.t0) / TL_MS), x = u * (h.days - 1), i = Math.floor(x), f = x - i;
    for (const c of frame.cities) { c.floors = 0; c.week = 0; c.people = 0; c.builders = 0; c.building = 0; }
    items.forEach((it, idx) => {
      const a = it.a, v = a[i] + ((a[Math.min(h.days - 1, i + 1)] ?? a[i]) - a[i]) * f, wk = Math.max(0, v - (i >= 7 ? a[i - 7] : 0));
      it.b.floors = v; it.b.week = wk; it.c.floors += v; it.c.week += wk;
      if (v > 0) it.c.people++;
      if (wk > 0.05) it.c.builders++;
      const hh = v > 0 ? hOfFloors(v) : 0, w = v >= 15 ? 7 : 5;
      mesh.setMatrixAt(idx, _m.makeScale(w, Math.max(0.001, hh), w).setPosition(it.x, 0, it.z));
    });
    mesh.instanceMatrix.needsUpdate = true;
    for (const c of frame.cities) { c.people = Math.max(1, c.people); c.growth = c.week / Math.max(1, c.floors - c.week); }
    if (i !== tl.day) {
      tl.day = i;
      for (const c of frame.cities) {
        const tr = tierOf(c.floors), was = tl.tiers.get(c.id);
        if (was >= 0 && tr.index > was) { onTier?.(c); tl.news = { text: `${tr.icon} ${t('timelapse.tier', { c, tier: cityTier(tr.key) })}`, day: i }; }
        tl.tiers.set(c.id, tr.index);
      }
      const tot = frame.cities.reduce((s, c) => s + c.floors, 0), bld = items.filter((it) => it.b.floors > 0).length;
      const news = tl.news && i - tl.news.day < 6 ? ` · ${tl.news.text}` : '';
      onDay?.(frame, i, fmt.date(dayMs(h, i), 'long'), `${floorsText(tot)} · ${plural(bld, 'count.building')}${news}`);
    }
    $('#tl-bar .tl-prog').style.setProperty('--p', u.toFixed(4));
    if (u >= 1) { tl.hold ||= now; if (now - tl.hold > 2500) stop(); }
  }
  function stop() {
    if (tl.done) return;
    tl.done = true;
    scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
    bldGroup.visible = true;
    onDone?.();
  }
  return { step, stop, get done() { return !!tl.done; } };
}

// ───────── the city race: floors accumulated week by week (bars that swap places) ─────────
let race = null;
export function openRace(h, nameOf) {
  const off = (weekday0(h) + 6) % 7; // Monday = 0
  const ends = [];
  for (let i = 0; i < h.days; i++) if ((i + off) % 7 === 6 || i === h.days - 1) ends.push(i);
  const rows = h.cities.map((c) => {
    const daily = new Float64Array(h.days);
    for (const p of c.people) p.d.forEach((v, i) => (daily[i] += v / 10));
    const cum = []; daily.reduce((s, v, i) => (cum[i] = s + v), 0);
    return { id: c.id, name: nameOf(c.id), cum };
  });
  const box = $('#race-bars'), rowH = 30;
  box.style.height = `${rows.length * rowH}px`;
  box.innerHTML = rows.map((r) => `<div class="rb" data-id="${esc(r.id)}"><span class="rn">${esc(r.name)}</span><span class="rt"><i class="rbar"></i><span class="rv">0</span></span></div>`).join('');
  race = { h, rows, ends, step: 0, rowH, timer: null, prev: null };
  playRace();
}
export function playRace() {
  if (!race) return;
  clearInterval(race.timer);
  race.step = 0; race.prev = null;
  const tick = () => {
    if ($('#race').hidden) { clearInterval(race.timer); return; }
    const i = race.ends[race.step], vals = race.rows.map((r) => ({ r, v: r.cum[i] })).sort((a, b) => b.v - a.v), max = Math.max(1, vals[0].v);
    const news = [];
    vals.forEach(({ r, v }, pos) => {
      const el = $('#race-bars').querySelector(`[data-id="${CSS.escape(r.id)}"]`);
      el.style.transform = `translateY(${pos * race.rowH}px)`;
      el.querySelector('.rbar').style.width = `${Math.max(0.4, (v / max) * 100)}%`;
      el.querySelector('.rv').textContent = fmt.int(v);
      const prevV = race.step ? r.cum[race.ends[race.step - 1]] : 0;
      el.title = t('race.barTitle', { name: r.name, floors: floorsText(v), week: fmt.int(v - prevV) });
      const was = race.prev?.get(r.id);
      if (was != null && pos < was && pos < 6) news.push(t('race.up', { name: r.name, pos: fmt.ordinal(pos + 1) }));
    });
    race.prev = new Map(vals.map(({ r }, pos) => [r.id, pos]));
    const last = race.step === race.ends.length - 1;
    $('#race-label').textContent = last ? t('race.today', { date: dayShort(race.h, i) }) : t('race.weekTo', { date: dayShort(race.h, i) });
    $('#race-news').textContent = news.length ? `🏁 ${news.slice(0, 2).join(' · ')}` : '';
    if (last) clearInterval(race.timer); else race.step++;
  };
  tick();
  race.timer = setInterval(tick, 1100);
}
