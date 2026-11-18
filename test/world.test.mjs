// The sightseeing bus's way (public/city/world.js): a closed loop along the city's own streets, a stop
// by each of the tallest buildings, and where the bus is at a given second. The module is the browser's.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let W;
before(async () => {
  globalThis.location = { search: '', href: 'http://localhost/', pathname: '/' };
  const i18n = await import('../public/i18n/index.js');
  Object.assign(i18n.config, { idle: { fire: 15, rubble: 30 }, mega: { floors: 1000 } });
  W = await import('../public/city/world.js');
});

const person = (id, floors) => ({ id, name: id, floors, week: 0, month: 0, lastMonth: 0, today: 0, idle: 0, hours: 0, now: false, cities: 1 });
// a region of cities with `sizes` buildings each, the floors falling from the first building on
function region(sizes) {
  const cities = sizes.map((n, i) => {
    const buildings = Array.from({ length: n }, (_, j) => person(`c${i}p${j}`, 2000 - j * 7 - i));
    return { id: `c${i}`, name: `City ${i}`, code: `C${i}`, buildings, people: n, floors: buildings.reduce((a, b) => a + b.floors, 0), week: 0, sessions: 0, building: 0 };
  });
  const d = { cities, links: [], week: { start: 0 }, month: '2026-11', lastMonth: '2026-10' };
  return { d, world: W.buildWorld(d) };
}
const isCityRoad = (world, c, [x, y]) => { const t = world.getT(x, y); return !!t && t.t === 'road' && t.city === c; };

test('the bus goes round a closed way of city streets, a stop by each of the six tallest', () => {
  const { d, world } = region([120, 40, 9]); // streets inside, a few blocks, a single block
  for (const c of d.cities) {
    const r = W.busRoute(world, c);
    assert.ok(r, `${c.id} has a way`);
    r.tiles.forEach((p, i) => {
      assert.ok(isCityRoad(world, c, p), `${c.id}: tile ${p} is one of its streets`);
      const q = r.tiles[(i + 1) % r.tiles.length], back = r.tiles[(i + 2) % r.tiles.length];
      assert.equal(Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]), 1, `${c.id}: one step from ${p} to ${q}`);
      assert.ok(p[0] !== back[0] || p[1] !== back[1], `${c.id}: no turning on the spot at ${q}`);
    });
    const tallest = [...c.buildings].sort((a, b) => b.floors - a.floors).slice(0, W.BUS_STOPS).map((b) => b.id);
    assert.deepEqual(r.stops.map((s) => s.id).sort(), [...tallest].sort(), `${c.id}: the stops are its tallest`);
    assert.deepEqual(r.stops.map((s) => s.s), [...r.stops.map((s) => s.s)].sort((a, b) => a - b), 'in the order of the way');
    for (const s of r.stops) {
      const [x, y] = r.tiles[s.s];
      assert.ok(Math.max(Math.abs(x - s.gx), Math.abs(y - s.gy)) <= 4, `${c.id}: ${s.id} stops near its building (${x},${y} for ${s.gx},${s.gy})`);
      assert.equal(s.rank, tallest.indexOf(s.id) + 1);
    }
    assert.equal(r.legs.reduce((a, g) => a + g.dist, 0), r.tiles.length, 'the legs add up to one lap');
  }
});

test('the bus stops in front of a building that stands on a street', () => {
  const { d, world } = region([120, 70, 40, 16, 9]);
  for (const c of d.cities) {
    const r = W.busRoute(world, c);
    for (const s of r.stops) {
      const onStreet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isCityRoad(world, c, [s.gx + dx, s.gy + dy]));
      const [x, y] = r.tiles[s.s];
      if (onStreet) {
        assert.equal(Math.abs(x - s.gx) + Math.abs(y - s.gy), 1, `${c.id}: ${s.id} is shown from the street at its door (${x},${y} for ${s.gx},${s.gy})`);
        assert.equal(s.hid, 0, 'in plain view');
      } else assert.ok(Math.max(Math.abs(x - s.gx), Math.abs(y - s.gy)) <= 3, `${c.id}: ${s.id}, with no street at its door, is shown from close by`);
    }
    assert.ok(r.total < 240, `${c.id}: a lap takes ${Math.round(r.total)} s`);
  }
});

test('a city with fewer buildings than stops stops at each one', () => {
  const { d, world } = region([3]);
  const r = W.busRoute(world, d.cities[0]);
  assert.equal(r.stops.length, 3);
  assert.ok(r.tiles.length >= 8, 'still a lap of the street around the block');
});

test('the bus waits at each stop, moves a little at a time and repeats every lap', () => {
  const { d, world } = region([120]);
  const r = W.busRoute(world, d.cities[0]);
  r.stops.forEach((s, i) => {
    const t = W.busStopTime(r, i), a = W.busAt(r, t + 0.1), b = W.busAt(r, t + W.BUS_DWELL - 0.1);
    assert.equal(a.stop, i); assert.equal(b.stop, i);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, 'standing still at the stop');
    assert.ok(Math.hypot(a.x - r.tiles[s.s][0], a.y - r.tiles[s.s][1]) <= 0.5, 'at its tile');
  });
  let prev = W.busAt(r, 0), moved = 0;
  for (let t = 0.1; t <= r.total; t += 0.1) {
    const p = W.busAt(r, t), step = Math.hypot(p.x - prev.x, p.y - prev.y);
    assert.ok(step <= W.BUS_SPEED * 0.1 * 1.6, `no jump at ${t.toFixed(1)} s (${step.toFixed(3)} tiles)`);
    assert.ok(Math.abs(Math.hypot(p.dx, p.dy) - 1) < 1e-9, 'it always faces somewhere');
    moved += step; prev = p;
  }
  assert.ok(moved > r.tiles.length * 0.8, 'it went round');
  const again = W.busAt(r, 12.3 + r.total * 3), once = W.busAt(r, 12.3);
  assert.ok(Math.hypot(again.x - once.x, again.y - once.y) < 1e-6, 'the same place a lap later');
});

// ───────── the Stock Exchange's square ─────────
const squareOf = (e) => { const out = []; for (let u = 0; u < e.size; u++) for (let v = 0; v < e.size; v++) out.push([e.gx + u, e.gy + v]); return out; };

test('the Stock Exchange gets a square only when asked for, on ground nothing else uses', () => {
  const sizes = [120, 40, 9, 30, 64];
  assert.equal(region(sizes).world.exchange, null, 'no setting, no square');
  const plain = region(sizes), d = plain.d.cities.map((c) => ({ ...c, buildings: c.buildings.map((b) => ({ ...b })) }));
  const world = W.buildWorld({ ...plain.d, cities: d }, { exchange: true }), e = world.exchange;
  assert.ok(e && !e.off, 'a square inside the map');
  assert.ok(e.size >= 2 && e.size <= W.EXCHANGE);
  for (const [x, y] of squareOf(e)) {
    const t = world.getT(x, y);
    assert.ok(t.t === 'mon' && t.exchange, `(${x},${y}) is the square's`);
    const was = plain.world.getT(x, y).t;
    assert.ok(was === 'grass' || was === 'farm', `(${x},${y}) was open field (${was})`);
  }
  for (const o of world.objs) { // nothing of the world stands on it: no building, monument, tree or lamp
    const s = o.size ?? 1;
    assert.ok(o.gx + s <= e.gx || o.gx >= e.gx + e.size || o.gy + s <= e.gy || o.gy >= e.gy + e.size, `${o.kind} at (${o.gx},${o.gy}) is off the square`);
  }
  // the cities stand where they stood without it
  for (const c of d) assert.deepEqual(c.box, plain.d.cities.find((x) => x.id === c.id).box, `${c.id} did not move`);
  assert.equal(world.GW, plain.world.GW); assert.equal(world.GH, plain.world.GH);
  const again = W.buildWorld(region(sizes).d, { exchange: true }).exchange;
  assert.deepEqual(again, e, 'the same region gives the same square');
});

test('the square keeps its plate clear of the cities\' signs where the fields allow it', () => {
  const { d } = region([9, 9, 9, 9, 9, 9]); // small cities: fields all round
  const e = W.buildWorld(d, { exchange: true }).exchange, cx = e.gx + e.size / 2, cy = e.gy + e.size / 2;
  for (const c of d.cities) assert.ok(!(Math.abs(cx - c.center[0]) < 13 && cy - c.box.sy > 1 && cy - c.box.sy < 13), `clear of ${c.id}'s sign`);
});

test('with no field left the square goes outside the map, in front of it', () => {
  // a map of streets and lots only, with single lots of grass here and there: nowhere for 2×2
  const GW = 12, GH = 10, tiles = new Map(), getT = (x, y) => tiles.get(W.K(x, y));
  for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) tiles.set(W.K(x, y), { t: (x + y) % 3 === 0 ? 'grass' : x % 2 ? 'road' : 'plaza' });
  const before = [...tiles].map(([k, t]) => k + t.t).join(), e = W.placeExchange({ tiles, getT, GW, GH, OY: 0, cities: [], district: null });
  assert.ok(e.off, 'outside');
  assert.ok(e.gy >= GH, 'past the front edge');
  assert.ok(e.gx >= 0 && e.gx + e.size <= GW, 'within the map from side to side');
  assert.equal([...tiles].map(([k, t]) => k + t.t).join(), before, 'no tile of the map is taken');
});
