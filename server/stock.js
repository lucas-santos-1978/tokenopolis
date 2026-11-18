// The Stock Exchange: the quote of one share, read from a public source and kept for the page. It exists
// only when STOCK_SYMBOL is set: without it there is no building, no route and no request to anyone.
//
// STOCK_SOURCE picks where the quote comes from: yahoo (the public chart endpoint, no key, any market it
// lists: PETR4.SA, AAPL, SAP.DE…), mock (a generated walk, for trying the building out) or a path to a
// module exporting createQuotes(config) → { mode?, quote(now) }. Every source answers with
//   { name, currency, exchange, price, prevClose, at, open, session: { start, end } | null,
//     day: [[ms, price]…] (the last session), year: [[ms, close]…] (daily closes, the last one today's) }
// and build() turns that into what /api/stock serves (docs/contract.md).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const HOUR = 3600_000, DAY = 24 * HOUR;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const points = (list) => (Array.isArray(list) ? list.map((p) => [Number(p?.[0]), Number(p?.[1])]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0) : []);
const cents = (v) => Math.round(v * 100) / 100;

// ───────── yahoo ─────────
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
async function yahooChart(symbol, range, interval) {
  let res;
  try {
    res = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  } catch (err) { throw new Error('the quote source did not answer', { cause: err }); }
  if (res.status === 404) throw Object.assign(new Error(`STOCK_SYMBOL "${symbol}" is not known to the quote source`), { config: true });
  if (!res.ok) throw Object.assign(new Error(`the quote source answered ${res.status}`), { status: res.status, retryAfter: Number(res.headers.get('retry-after')) || null });
  const r = (await res.json().catch(() => null))?.chart?.result?.[0];
  if (!r?.meta) throw new Error('the quote source answered something else');
  const close = r.indicators?.quote?.[0]?.close ?? [];
  return { meta: r.meta, points: (r.timestamp ?? []).map((s, i) => [s * 1000, close[i]]).filter((p) => Number.isFinite(p[1])) };
}
function yahoo(symbol) {
  let slow = null; // the year of daily closes changes once a day: read once an hour
  return async (now) => {
    const day = await yahooChart(symbol, '1d', '5m');
    if (!slow || now - slow.at > HOUR) slow = { at: now, ...(await yahooChart(symbol, '1y', '1d')) };
    const m = day.meta, next = m.currentTradingPeriod?.regular, last = [m.tradingPeriods].flat(3).find((p) => p?.start);
    return {
      name: m.longName ?? m.shortName, currency: m.currency, exchange: m.fullExchangeName ?? m.exchangeName,
      price: m.regularMarketPrice, prevClose: m.previousClose ?? m.chartPreviousClose, at: (m.regularMarketTime ?? 0) * 1000,
      open: !!next && now >= next.start * 1000 && now < next.end * 1000,
      session: last ? { start: last.start * 1000, end: last.end * 1000 } : null,
      day: day.points, year: slow.points,
    };
  };
}

// ───────── mock ─────────
// A walk that depends only on the symbol and the calendar: every reading of the same minute is the same
// quote. The session runs from 10:00 to 17:00 in the configured zone (config.season.utcOffsetHours),
// Monday to Friday.
const rnd = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h ^= h >>> 13, (h >>> 0) / 4294967296)); };
function mock(symbol, config) {
  return async (now) => {
    const off = (Number(config.season?.utcOffsetHours) || 0) * HOUR;
    const weekday = (n) => { const wd = new Date(n * DAY).getUTCDay(); return wd !== 0 && wd !== 6; };
    const opens = (n) => n * DAY - off + 10 * HOUR, closes = (n) => n * DAY - off + 17 * HOUR;
    let d = Math.floor((now + off) / DAY); // the local day of the last session
    while (!weekday(d) || now < opens(d)) d--;
    const move = (n) => (rnd(`${symbol}|${n}`)() - 0.485) * 0.045; // a day's change
    const days = [];
    for (let n = d - 1; days.length < 249; n--) if (weekday(n)) days.unshift(n);
    let p = 18 + rnd(symbol)() * 30;
    const year = days.map((n) => [closes(n), cents((p *= 1 + move(n)))]);
    const prevClose = year.at(-1)[1], end = Math.min(now, closes(d)), r = rnd(`${symbol}|${d}|day`), day = [], STEPS = 84;
    for (let i = 0, wob = 0; i <= STEPS && opens(d) + i * 5 * 60_000 <= end; i++) {
      wob = wob * 0.9 + (r() - 0.5) * 0.006;
      day.push([opens(d) + i * 5 * 60_000, cents(prevClose * (1 + move(d) * (i / STEPS) + wob * (1 - i / STEPS / 2)))]);
    }
    const [at, price] = day.at(-1);
    year.push([at, price]);
    return { name: '', currency: config.locale === 'pt-BR' ? 'BRL' : 'USD', exchange: 'Mock', price, prevClose, at, open: now < closes(d), session: { start: opens(d), end: closes(d) }, day, year };
  };
}

// ───────── the exchange ─────────
export async function createStock(config) {
  const { symbol, source, label } = config.stock;
  if (!symbol) return null;
  let quote, mode = source;
  if (source === 'yahoo') quote = yahoo(symbol);
  else if (source === 'mock') quote = mock(symbol, config);
  else {
    let mod;
    try { mod = await import(pathToFileURL(resolve(config.root, source)).href); } catch (err) {
      throw new Error(`STOCK_SOURCE "${source}" is not yahoo or mock, and could not be loaded as a module: ${err.message}`);
    }
    if (typeof mod.createQuotes !== 'function') throw new Error(`STOCK_SOURCE "${source}" must export createQuotes(config)`);
    const made = await mod.createQuotes(config);
    quote = (now) => made.quote(now); mode = made.mode ?? 'custom';
  }
  return {
    mode,
    async build(now) {
      const q = await quote(now), day = points(q.day), year = points(q.year);
      const price = num(q.price) ?? day.at(-1)?.[1] ?? year.at(-1)?.[1] ?? null;
      if (!(price > 0)) throw new Error(`no price for STOCK_SYMBOL "${symbol}"`);
      const prevClose = num(q.prevClose) > 0 ? num(q.prevClose) : year.at(-2)?.[1] ?? price;
      const start = num(q.session?.start), end = num(q.session?.end);
      return {
        symbol, label, name: config.stock.name || String(q.name ?? '').replace(/\s+/g, ' ').trim() || label,
        currency: String(q.currency ?? '').toUpperCase().slice(0, 3), exchange: String(q.exchange ?? ''),
        price, prevClose, change: price - prevClose, changePct: (price / prevClose - 1) * 100,
        at: num(q.at) || day.at(-1)?.[0] || now, open: !!q.open, session: start && end ? { start, end } : null,
        day, year, source: mode, generatedAt: now,
      };
    },
  };
}
