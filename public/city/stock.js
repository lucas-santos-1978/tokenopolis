// The Stock Exchange's words and its card: what the building shows (the ticker, the screen) and the sheet
// that opens on a click, with the share's line over a day, a month and a year. The quote comes from
// /api/stock (docs/contract.md); exchange.js draws the building.
import { t, fmt } from '../i18n/index.js';

const DAY = 86400_000;
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const dirOf = (v) => (Math.abs(v) < 0.005 ? 0 : v > 0 ? 1 : -1);
// "▲ 1.25%": the arrow carries the direction, for whoever does not tell green from red
export const pctText = (v) => `${dirOf(v) > 0 ? '▲' : dirOf(v) < 0 ? '▼' : '•'} ${fmt.dec(Math.abs(v), 2, 2)}%`;
const priceText = (q, v = q.price) => fmt.money(v, q.currency);

// The points of a range: the last session, the last 30 days or the whole year of daily closes.
// base: what the change is measured from (yesterday's close for the day, the first point otherwise).
export function rangeOf(q, range) {
  if (range === 'day') return { points: q.day, base: q.prevClose, from: q.session?.start ?? q.day[0]?.[0], to: q.session?.end ?? q.day.at(-1)?.[0] };
  const points = range === 'month' ? q.year.filter((p) => p[0] >= q.at - 31 * DAY) : q.year;
  return { points, base: points[0]?.[1], from: points[0]?.[0], to: points.at(-1)?.[0] };
}
const changeOf = (r) => (r.points.length && r.base ? (r.points.at(-1)[1] / r.base - 1) * 100 : 0);

// Without a quote: still waiting for the first one, or the source did not answer (main.js says which).
let down = false;
export const markDown = (v) => { down = !!v; };
const noQuote = () => t(down ? 'stock.down' : 'stock.wait');
// What the building shows, in the visitor's language. Without a quote: the share's code and a dash.
export function quoteView(q, label = '') {
  if (!q) return { label, price: '—', change: '', dir: 0, series: [], caption: noQuote() };
  return { label: q.label, price: priceText(q), change: pctText(q.changePct), dir: dirOf(q.changePct), series: rangeOf(q, 'month').points.map((p) => p[1]), caption: t('stock.ranges.month') };
}
export const tipText = (q) => (q ? t('stock.tip', { price: priceText(q), change: pctText(q.changePct) }) : noQuote());

// ───────── the card ─────────
let range = 'month';
// a point's moment, as the range needs it: the hour in a day, the day in a month, and the year with it in a year
const whenText = (ms) => (range === 'day' ? fmt.time(ms) : range === 'month' ? fmt.date(ms, 'short') : `${fmt.date(ms, 'short')} ${new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: fmt.timeZone }).format(ms)}`);
const W = 404, H = 168, PAD = { l: 4, r: 52, t: 10, b: 20 };
function chart(q, r) {
  const pts = r.points;
  if (pts.length < 2) return `<p class="note">${escH(t('stock.noLine'))}</p>`;
  const vals = pts.map((p) => p[1]), lo = Math.min(...vals, r.base ?? Infinity), hi = Math.max(...vals, r.base ?? -Infinity), span = hi - lo || 1;
  const x0 = PAD.l, x1 = W - PAD.r, y0 = PAD.t, y1 = H - PAD.b, tSpan = (r.to - r.from) || 1;
  const X = (ms) => x0 + ((x1 - x0) * (ms - r.from)) / tSpan, Y = (v) => y1 - ((y1 - y0) * (v - lo)) / span;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(''), endX = X(pts.at(-1)[0]).toFixed(1);
  const tick = (ms) => whenText(ms);
  return `<svg class="stock-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escH(t('stock.chartAria', { range: t(`stock.ranges.${range}`), from: priceText(q, pts[0][1]), to: priceText(q, pts.at(-1)[1]) }))}" data-dir="${dirOf(changeOf(r))}">
    <line class="grid" x1="${x0}" x2="${x1}" y1="${Y(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}"/><line class="grid" x1="${x0}" x2="${x1}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}"/>
    <line class="base" x1="${x0}" x2="${x1}" y1="${Y(r.base).toFixed(1)}" y2="${Y(r.base).toFixed(1)}"/>
    <path class="area" d="${line}L${endX} ${y1}L${X(pts[0][0]).toFixed(1)} ${y1}Z"/><path class="line" d="${line}"/>
    <circle class="last" cx="${endX}" cy="${Y(pts.at(-1)[1]).toFixed(1)}" r="4"/>
    <text class="ax" x="${x1 + 6}" y="${(Y(hi) + 4).toFixed(1)}">${escH(fmt.dec(hi, 2, 2))}</text><text class="ax" x="${x1 + 6}" y="${(Y(lo) + 4).toFixed(1)}">${escH(fmt.dec(lo, 2, 2))}</text>
    <text class="ax" x="${x0}" y="${H - 4}">${escH(tick(r.from))}</text><text class="ax" x="${x1}" y="${H - 4}" text-anchor="end">${escH(tick(r.to))}</text>
    <g class="hover" hidden><line y1="${y0}" y2="${y1}"/><circle r="4.5"/></g>
    <rect class="hit" x="${x0}" y="0" width="${x1 - x0}" height="${H}"/>
  </svg><div class="stock-tip" hidden></div>`;
}

// Fills the sheet with the share's card. Called with every reading; the chosen range stays.
export function renderStockSheet(el, q) {
  el.hidden = false;
  const close = `<button class="close" type="button" data-close aria-label="${escH(t('html.close'))}">×</button>`;
  if (!q) { el.innerHTML = `${close}<div class="who"><b>🏛️ ${escH(t('stock.title'))}</b><span>${escH(noQuote())}</span></div>`; return; }
  const r = rangeOf(q, range), month = changeOf(rangeOf(q, 'month')), year = changeOf(rangeOf(q, 'year'));
  const num = (v, label) => `<div class="${dirOf(v) > 0 ? 'up' : dirOf(v) < 0 ? 'down' : ''}"><b>${escH(pctText(v))}</b><span>${escH(label)}</span></div>`;
  el.innerHTML = `${close}
    <div class="who"><b>🏛️ ${escH(q.label)} <i class="stock-price">${escH(priceText(q))}</i></b><span>${escH([q.name !== q.label && q.name, q.exchange].filter(Boolean).join(' · ') || t('stock.title'))}</span></div>
    <div class="nums stock">${num(q.changePct, t('stock.nums.day'))}${num(month, t('stock.nums.month'))}${num(year, t('stock.nums.year'))}</div>
    <div class="stock-tabs" role="tablist">${['day', 'month', 'year'].map((k) => `<button type="button" role="tab" aria-selected="${k === range}" data-stock-range="${k}">${escH(t(`stock.ranges.${k}`))}</button>`).join('')}</div>
    <div class="stock-plot">${chart(q, r)}</div>
    <p class="note">${escH(t(q.open ? 'stock.open' : 'stock.closed'))} · ${escH(t('stock.note', { time: fmt.dateTime(q.at) }))}${q.error ? ` · ${escH(t('stock.stale'))}` : ''}</p>`;
  for (const b of el.querySelectorAll('[data-stock-range]')) b.onclick = () => { range = b.dataset.stockRange; renderStockSheet(el, q); el.querySelector(`[data-stock-range="${range}"]`)?.focus(); };
  // the hover layer: the nearest point, a hairline and what it was worth then
  const svg = el.querySelector('.stock-chart'), tip = el.querySelector('.stock-tip'), g = svg?.querySelector('.hover');
  if (!svg) return;
  const pts = r.points, vals = pts.map((p) => p[1]), lo = Math.min(...vals, r.base ?? Infinity), hi = Math.max(...vals, r.base ?? -Infinity), span = hi - lo || 1;
  const x0 = PAD.l, x1 = W - PAD.r, y0 = PAD.t, y1 = H - PAD.b, tSpan = (r.to - r.from) || 1;
  const move = (e) => {
    const box = svg.getBoundingClientRect(), ms = r.from + ((((e.clientX - box.left) / box.width) * W - x0) / (x1 - x0)) * tSpan;
    const p = pts.reduce((a, c) => (Math.abs(c[0] - ms) < Math.abs(a[0] - ms) ? c : a)), px = x0 + ((x1 - x0) * (p[0] - r.from)) / tSpan, py = y1 - ((y1 - y0) * (p[1] - lo)) / span;
    g.hidden = false; g.firstElementChild.setAttribute('x1', px); g.firstElementChild.setAttribute('x2', px); g.lastElementChild.setAttribute('cx', px); g.lastElementChild.setAttribute('cy', py);
    tip.hidden = false; tip.textContent = `${priceText(q, p[1])} · ${whenText(p[0])}`;
    tip.style.left = `${Math.min(Math.max((px / W) * 100, 16), 84)}%`;
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { g.hidden = true; tip.hidden = true; });
}
