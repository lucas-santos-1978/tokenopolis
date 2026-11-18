// The Stock Exchange's quote: the server's module (server/stock.js) with the generated source and with a
// source of one's own, and the page's helpers that cut the ranges (public/city/stock.js). No network here:
// the public source (yahoo) is answered by a stand-in for fetch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStock } from '../server/stock.js';

const HOUR = 3600_000;
const config = (stock = {}) => ({ root: process.cwd(), locale: 'en', timeZone: 'America/Sao_Paulo', season: { utcOffsetHours: -3 }, stock: { symbol: '', label: '', name: '', source: 'mock', refreshSeconds: 300, ...stock } });

let dir, S;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tokenopolis-stock-'));
  globalThis.location = { search: '', href: 'http://localhost/', pathname: '/' };
  await import('../public/i18n/index.js');
  S = await import('../public/city/stock.js');
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('without a symbol there is no exchange', async () => {
  assert.equal(await createStock(config()), null);
});

test('the generated quote is whole, and the same for the same minute', async () => {
  const stock = await createStock(config({ symbol: 'TEST3.SA', label: 'TEST3' }));
  const now = Date.UTC(2026, 10, 18, 15, 2); // a Wednesday, 12:02 in the zone: the session is on
  const q = await stock.build(now);
  assert.deepEqual(await stock.build(now), q);
  assert.equal(q.symbol, 'TEST3.SA'); assert.equal(q.label, 'TEST3'); assert.equal(q.name, 'TEST3', 'no name given: the label');
  assert.equal(q.source, 'mock'); assert.equal(q.open, true);
  assert.ok(q.price > 0 && q.prevClose > 0);
  assert.ok(Math.abs(q.changePct - (q.price / q.prevClose - 1) * 100) < 1e-9);
  assert.ok(Math.abs(q.change - (q.price - q.prevClose)) < 1e-9);
  assert.equal(q.year.length, 250, 'a year of daily closes');
  assert.equal(q.year.at(-1)[1], q.price, "today's point is the price");
  assert.equal(q.year.at(-2)[1], q.prevClose, "and the one before, yesterday's close");
  assert.ok(q.day.length > 1 && q.day.at(-1)[0] <= now && q.day[0][0] === q.session.start, 'the day runs from the opening to now');
  for (const list of [q.day, q.year]) for (let i = 1; i < list.length; i++) assert.ok(list[i][0] > list[i - 1][0], 'in time order');
  assert.equal(q.at, q.day.at(-1)[0]);
  // later the same day there are more points, and the ones already seen did not change
  const later = await stock.build(now + 30 * 60_000);
  assert.ok(later.day.length > q.day.length);
  assert.deepEqual(later.day.slice(0, q.day.length), q.day);
});

test('on a weekend the generated quote is Friday\'s close', async () => {
  const stock = await createStock(config({ symbol: 'TEST3.SA', label: 'TEST3' }));
  const now = Date.UTC(2026, 10, 21, 15); // a Saturday
  const q = await stock.build(now);
  assert.equal(q.open, false);
  assert.equal(new Date(q.session.start - 3 * HOUR).getUTCDay(), 5, 'the last session was on Friday');
  assert.equal(q.session.end - q.session.start, 7 * HOUR);
  assert.equal(q.day.at(-1)[0], q.session.end, 'the whole session');
});

test('a module of one\'s own is a source, and what it answers is tidied', async () => {
  const file = join(dir, 'quotes.mjs');
  writeFileSync(file, `export function createQuotes(config) {
    return { mode: 'mine', quote: async (now) => ({ name: '  Acme   Corp ', currency: 'usd', exchange: 'Somewhere', price: '10', prevClose: 8, at: now - 5, open: 1,
      day: [[1, 9], [2, 'x'], [3, 10], [4, -1]], year: [[1, 8], [3, 10]], session: { start: 1, end: 3 } }) };
  }`);
  const stock = await createStock(config({ symbol: 'ACME', label: 'ACME', source: file }));
  const q = await stock.build(1000);
  assert.equal(q.source, 'mine'); assert.equal(q.name, 'Acme Corp'); assert.equal(q.currency, 'USD');
  assert.equal(q.price, 10); assert.equal(q.changePct, 25); assert.equal(q.open, true); assert.equal(q.at, 995);
  assert.deepEqual(q.day, [[1, 9], [3, 10]], 'a point that is not a positive number is dropped');
  assert.deepEqual(q.session, { start: 1, end: 3 });
  // STOCK_NAME wins over the source's name
  const named = await (await createStock(config({ symbol: 'ACME', label: 'ACME', name: 'Acme', source: file }))).build(1000);
  assert.equal(named.name, 'Acme');
});

test('a source that is not there, or has no price, fails with a clear message', async () => {
  await assert.rejects(createStock(config({ symbol: 'X', source: join(dir, 'missing.mjs') })), /STOCK_SOURCE/);
  const bare = join(dir, 'bare.mjs');
  writeFileSync(bare, 'export const nothing = 1;');
  await assert.rejects(createStock(config({ symbol: 'X', source: bare })), /createQuotes/);
  const empty = join(dir, 'empty.mjs');
  writeFileSync(empty, 'export const createQuotes = () => ({ quote: async () => ({ day: [], year: [] }) });');
  await assert.rejects((await createStock(config({ symbol: 'X', source: empty }))).build(1), /no price/);
});

test("the year's last point is the price now, even when the source's year is behind", async () => {
  const file = join(dir, 'lagging.mjs');
  writeFileSync(file, 'export const createQuotes = () => ({ quote: async () => globalThis.__quote });');
  const stock = await createStock(config({ symbol: 'LAG', label: 'LAG', source: file }));
  const build = (q) => { globalThis.__quote = { prevClose: 9, session: { start: 1000, end: 2000 }, day: [[1000, 9.5]], ...q }; return stock.build(5000); };
  // the year already has a point of this session, read some time ago: it becomes the price
  let q = await build({ price: 10, at: 1500, year: [[100, 8], [500, 9], [1000, 9.5]] });
  assert.deepEqual(q.year, [[100, 8], [500, 9], [1500, 10]]);
  // the year was read before the session opened: today's point is added
  q = await build({ price: 10, at: 1500, year: [[100, 8], [500, 9]] });
  assert.deepEqual(q.year, [[100, 8], [500, 9], [1500, 10]]);
  // the first minutes of a session, the source still on yesterday's last trade: nothing to add
  q = await build({ price: 9, at: 600, day: [], year: [[100, 8], [500, 9]] });
  assert.deepEqual(q.year, [[100, 8], [500, 9]]);
  // no session told: the day's first point says where it starts
  q = await build({ price: 10, at: 1500, session: null, year: [[100, 8], [500, 9]] });
  assert.deepEqual(q.year, [[100, 8], [500, 9], [1500, 10]]);
  // nothing says where the session starts: the last point is today's, as the source should give it
  q = await build({ price: 10, at: 1500, session: null, day: [], year: [[100, 8], [500, 9]] });
  assert.deepEqual(q.year, [[100, 8], [1500, 10]]);
  // without a year there is none to bring up to date, and the close before comes from the year when not told
  q = await build({ price: 10, at: 1500, year: [] });
  assert.deepEqual(q.year, []);
  q = await build({ price: 10, at: 1500, prevClose: null, year: [[100, 8], [500, 9]] });
  assert.equal(q.prevClose, 9, "yesterday's close, not the one before it");
  delete globalThis.__quote;
});

test('the public source reads the year once an hour, and the month and the year still follow the price', async (t) => {
  const DAY = 24 * HOUR, MIN = 60_000, opens = Date.UTC(2026, 10, 18, 13), period = { start: opens / 1000, end: (opens + 7 * HOUR) / 1000 };
  const calls = { '1d': 0, '1y': 0 };
  let price = 6.12, at = opens - 16 * HOUR, today = false; // before the first trade the source is still on yesterday
  t.mock.method(globalThis, 'fetch', async (url) => {
    const range = new URL(url).searchParams.get('range');
    calls[range]++;
    const closes = [[opens - 2 * DAY, 5.44], [opens - DAY, 6.12], ...(today ? [[opens, price]] : [])];
    const pts = range === '1d' ? (today ? [[opens, 6.1], [at, price]] : []) : closes;
    const meta = { longName: 'Test S.A.', currency: 'BRL', fullExchangeName: 'São Paulo', regularMarketPrice: price, previousClose: today ? 6.12 : 5.44, regularMarketTime: at / 1000, currentTradingPeriod: { regular: period }, tradingPeriods: [[period]] };
    return Response.json({ chart: { result: [{ meta, timestamp: pts.map((p) => p[0] / 1000), indicators: { quote: [{ close: pts.map((p) => p[1]) }] } }] } });
  });
  const stock = await createStock(config({ symbol: 'TEST3.SA', label: 'TEST3', source: 'yahoo' }));
  let q = await stock.build(opens + 2 * MIN);
  assert.deepEqual(q.year.at(-1), [opens - DAY, 6.12], 'no trade yet today: the year ends yesterday');
  assert.equal(q.open, true); assert.equal(q.name, 'Test S.A.');
  // the first trades arrive; the year in hand is the one read before them
  today = true; price = 6.11; at = opens + 5 * MIN;
  q = await stock.build(opens + 12 * MIN);
  assert.equal(calls['1y'], 1, 'the year is not read again within the hour');
  assert.deepEqual(q.year.at(-1), [at, 6.11], "today's point is there all the same");
  assert.equal(q.year.length, 3); assert.equal(q.year.at(-2)[1], q.prevClose);
  price = 6.35; at = opens + 50 * MIN;
  q = await stock.build(opens + 57 * MIN);
  assert.equal(calls['1y'], 1);
  assert.deepEqual(q.year.at(-1), [at, 6.35], 'and it moves with the price');
  assert.equal(q.year.length, 3, 'one point a day');
  const month = S.rangeOf(q, 'month');
  assert.equal(month.points.at(-1)[1], q.price, 'the month ends at the price the day shows');
  // past the hour the year is read again, and it brings its own point of today: still one a day
  price = 6.4; at = opens + 60 * MIN;
  q = await stock.build(opens + 67 * MIN);
  assert.equal(calls['1y'], 2);
  assert.deepEqual(q.year, [[opens - 2 * DAY, 5.44], [opens - DAY, 6.12], [at, 6.4]]);
  assert.equal(calls['1d'], 4, 'the day is read every time');
});

test('the page cuts the day, the month and the year out of a quote', () => {
  const DAY = 24 * HOUR, at = 400 * DAY;
  const year = Array.from({ length: 250 }, (_, i) => [at - (249 - i) * DAY, 10 + i * 0.1]);
  const q = { price: 34.9, prevClose: 34.8, at, session: { start: at - 6 * HOUR, end: at + HOUR }, day: [[at - 6 * HOUR, 34.8], [at, 34.9]], year };
  const day = S.rangeOf(q, 'day'), month = S.rangeOf(q, 'month'), all = S.rangeOf(q, 'year');
  assert.equal(day.base, 34.8, "the day is measured from yesterday's close");
  assert.equal(day.from, q.session.start); assert.equal(day.to, q.session.end);
  assert.equal(month.points.length, 32, 'the last 31 days, both ends in');
  assert.equal(month.base, month.points[0][1]);
  assert.equal(all.points.length, 250);
  assert.equal(S.dirOf(0.004), 0); assert.equal(S.dirOf(0.2), 1); assert.equal(S.dirOf(-3), -1);
  assert.equal(S.pctText(1.254), '▲ 1.25%'); assert.equal(S.pctText(-0.5), '▼ 0.50%'); assert.equal(S.pctText(0), '• 0.00%');
});
