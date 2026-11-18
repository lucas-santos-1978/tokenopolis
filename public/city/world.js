// The region's terrain (buildWorld, buildLanes, goldRoutes and megaLinks). One region plot per city: blocks of
// 4×4 lots with streets between them, highways on the borders, the river between the 1st and 2nd
// rows (with bridges), monuments in the fields around, farms and woods. The tallest buildings stand
// in the middle of each city, like in a real city: in 3D the camera turns and nobody hides anybody.
// At the back, across a channel, the Corporate District with the Mega Builders' headquarters.

import { context, monumentsOf, tierOf, mayorOf, megaOf, ruinOf, BUILDING_TIERS } from './rules.js';

export const L = 10; // a lot, in world units
export const BLOCK = 4; // a block of 4×4 lots
export const K = (x, y) => x * 10000 + y;

export const seed = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h ^= h >>> 13, (h >>> 0) / 4294967296)); };
export const hash = (a, b, s = 0) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const strHash = (s) => { let h = 7; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761); return h >>> 0; };
// The facade family (palette and crown): house, building, tower or skyscraper (and above)
export const tier = (f) => (f >= 450 ? 'skyscraper' : f >= 150 ? 'tower' : f >= 15 ? 'building' : 'house');
// The city's Dojo: born with the team's first belt (white included) and grows with every belt (lots
// per side = level); only the black belt changes the person's building
export const DOJO_LEVELS = [{ min: 1, key: 'dojo', icon: '🏯' }, { min: 3, key: 'temple', icon: '⛩️' }, { min: 7, key: 'greatTemple', icon: '🏯' }];
export function dojoOf(c) {
  const members = c.buildings.filter((b) => b.belt), count = members.length, blacks = members.filter((b) => b.belt === 'black').length;
  if (!count) return null;
  let level = 0;
  for (let i = 0; i < DOJO_LEVELS.length; i++) if (count >= DOJO_LEVELS[i].min) level = i + 1;
  const cur = DOJO_LEVELS[level - 1], next = DOJO_LEVELS[level];
  return { count, blacks, level, key: cur.key, icon: cur.icon, next: next ? { key: next.key, missing: next.min - count } : null };
}
// The building type (a BUILDING_TIERS key), which is also what the kit draws
export const kind = (f) => { for (let i = BUILDING_TIERS.length - 1; i > 0; i--) if (f >= BUILDING_TIERS[i].min) return BUILDING_TIERS[i].key; return 'house'; };

export function buildWorld(d, { allMonuments = false, exchange = false } = {}) {
  const cities = d.cities;
  for (const c of cities) {
    const blocks = Math.max(1, Math.ceil(c.buildings.length / (BLOCK * BLOCK)));
    c.k = Math.ceil(Math.sqrt(blocks)); c.m = Math.ceil(blocks / c.k);
    c.style = tierOf(c.floors).style;
  }
  const kmax = Math.max(1, ...cities.map((c) => Math.max(c.k, c.m)));
  // blocks + streets + the street around the city + margin (fields on every side, where the monuments
  // go, with at least a lot of grass between that street and the highways)
  const PLOT = kmax * (BLOCK + 1) + 5;
  const mx = context(d);
  const PX = Math.max(1, Math.ceil(Math.sqrt(cities.length * 4 / 3))), PY = Math.max(1, Math.ceil(cities.length / PX));
  const GW = PLOT * PX;
  // the Corporate District (the Mega Builders' headquarters) takes a band at the back, across a
  // channel; the cities' grid starts OY rows down
  const mega = megaOf(d), dLots = [...mega.members.map((p) => ({ p, hq: true })), ...mega.queue.map((p) => ({ p, hq: false }))];
  const bridgeX = PX > 1 ? Math.round(PX / 2) * PLOT : Math.floor(GW / 2); // a highway column of the grid, near the middle
  const dist = dLots.length ? districtLayout(dLots.length, GW, bridgeX) : null;
  const OY = dist ? dist.DH + 2 : 0, GH = PLOT * PY + OY;
  const slots = [];
  for (let px = 0; px < PX; px++) for (let py = 0; py < PY; py++) slots.push([px, py]);
  slots.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[1] - b[1]);
  [...cities].sort((a, b) => (b.buildings[0]?.floors ?? 0) - (a.buildings[0]?.floors ?? 0) || a.id.localeCompare(b.id)).forEach((c, i) => (c.slot = slots[i]));
  // helipad: each city's biggest build of the week (the region's one, golden)
  let champ = null;
  for (const c of cities) {
    const top = c.buildings.reduce((best, b) => (b.week > 0 && (!best || b.week > best.week) ? b : best), null);
    for (const b of c.buildings) b.heli = b === top ? 1 : 0;
    if (top && (!champ || top.week > champ.week)) champ = top;
  }
  if (champ) champ.heli = 2;

  const tiles = new Map(), objs = [];
  const getT = (x, y) => tiles.get(K(x, y));
  // river between the 1st and 2nd rows of plots; highways on the other borders, the region's outer edge
  // included, so no highway stops in the fields
  for (let gx = 0; gx < GW; gx++) for (let gy = OY; gy < GH; gy++) {
    const lx = gx % PLOT, ry = gy - OY, ly = ry % PLOT, edgeX = lx === 0 || gx === GW - 1;
    let t = { t: 'grass' };
    if (PY > 1 && (ry === PLOT - 1 || ry === PLOT)) t = edgeX ? { t: 'hwy', dir: 'y', bridge: true } : { t: 'water' };
    else if (edgeX) t = { t: 'hwy', dir: 'y' };
    else if (ly === 0 || gy === GH - 1) t = { t: 'hwy', dir: 'x' };
    tiles.set(K(gx, gy), t);
  }
  const district = dist ? placeDistrict(dist, dLots, { tiles, objs, GW, OY }) : null;
  for (const c of cities) {
    const [px, py] = c.slot, ox0 = px * PLOT, oy0 = OY + py * PLOT;
    const cw = c.k * (BLOCK + 1) - 1, ch = c.m * (BLOCK + 1) - 1, inner = PLOT - 2;
    const sx = ox0 + 1 + Math.floor((inner - cw) / 2), sy = oy0 + 1 + Math.floor((inner - ch) / 2);
    c.box = { ox0, oy0, sx, sy, cw, ch };
    const lots = [];
    for (let u = 0; u < cw; u++) for (let v = 0; v < ch; v++) {
      if (u % (BLOCK + 1) === BLOCK || v % (BLOCK + 1) === BLOCK) tiles.set(K(sx + u, sy + v), { t: 'road', city: c });
      else lots.push([sx + u, sy + v]);
    }
    // a street all around the city, so every street inside it comes out somewhere
    for (let u = -1; u <= cw; u++) for (let v = -1; v <= ch; v++) {
      if ((u === -1 || u === cw || v === -1 || v === ch) && getT(sx + u, sy + v)?.t === 'grass') tiles.set(K(sx + u, sy + v), { t: 'road', city: c });
    }
    // street linking the city to the highways on both sides of the plot
    const row = c.m > 1 ? sy + BLOCK : Math.min(oy0 + PLOT - 2, sy + ch);
    for (let gx = ox0 + 1; gx < ox0 + PLOT; gx++) if (getT(gx, row)?.t === 'grass') tiles.set(K(gx, row), { t: 'road', city: c });
    const cx = sx + cw / 2 - 0.5, cy = sy + ch / 2 - 0.5;
    c.center = [sx + cw / 2, sy + ch / 2];
    // the tallest in the middle, with a bit of chance so the city is not too symmetric
    const dist = ([x, y]) => Math.hypot(x - cx, y - cy) + hash(x, y, 3) * 0.9;
    lots.sort((a, b) => dist(a) - dist(b));
    lots.forEach(([gx, gy], i) => {
      const b = c.buildings[i];
      if (b && b.floors > 0) { tiles.set(K(gx, gy), { t: tier(b.floors) === 'house' ? 'lawn' : 'plaza', city: c }); objs.push({ gx, gy, kind: 'bld', b, c }); }
      else { tiles.set(K(gx, gy), { t: 'park', city: c }); for (let i = 0; i < 3; i++) objs.push({ gx, gy, kind: 'tree', s: 0.8 + hash(gx, gy, 70 + i) * 0.5, u: 0.2 + hash(gx, gy, 50 + i) * 0.6, v: 0.2 + hash(gx, gy, 60 + i) * 0.6 }); }
    });
    // Where a size×size object fits in the plot's fields: the closest to the city, off the front corner (the sign).
    const spot = (size) => {
      let best = null;
      for (let lx = 1; lx <= PLOT - 1 - size; lx++) for (let ly = 1; ly <= PLOT - 1 - size; ly++) {
        if (lx + ly + 2 * size > 2 * PLOT - 6) continue;
        const gx = ox0 + lx, gy = oy0 + ly;
        let free = true;
        for (let u = 0; u < size && free; u++) for (let v = 0; v < size; v++) if (getT(gx + u, gy + v)?.t !== 'grass') { free = false; break; }
        if (!free) continue;
        const dx = Math.max(0, sx - (gx + size - 1), gx - (sx + cw - 1)), dy = Math.max(0, sy - (gy + size - 1), gy - (sy + ch - 1));
        const score = Math.max(dx, dy) * 10 - (lx + ly) * 0.1;
        if (!best || score < best.score) best = { gx, gy, score };
      }
      return best;
    };
    // monuments earned and the statue of the mayor of the month (who built the most last month)
    c.monuments = monumentsOf(c, mx);
    const mayor = mayorOf(c), dojo = dojoOf(c);
    const placed = [
      ...(dojo ? [{ key: 'dojo', icon: '🥋', size: dojo.level, level: dojo.level, levelKey: dojo.key, count: dojo.count, blacks: dojo.blacks }] : []), // first: it stays close to the city
      ...c.monuments.filter((k) => k.ok || allMonuments),
      ...(mayor ? [{ key: 'mayor', icon: '🎩', size: 1, person: mayor, month: d.month, lastMonth: d.lastMonth }] : []),
    ];
    // the great temple fits where it can (down to 1×1), the stadium down to its smaller size
    const size0 = placed.map((m) => m.size);
    const placeAll = (shrink) => {
      placed.forEach((m, i) => { m.size = shrink && m.min ? m.min : size0[i]; delete m.at; });
      const taken = [], start = objs.length;
      for (const m of placed) {
        let best = null;
        for (let s = m.size, low = m.key === 'dojo' ? 1 : m.min ?? m.size; s >= low && !best; s--) { best = spot(s); if (best) m.size = s; }
        if (!best) continue;
        for (let u = 0; u < m.size; u++) for (let v = 0; v < m.size; v++) { taken.push(K(best.gx + u, best.gy + v)); tiles.set(K(best.gx + u, best.gy + v), { t: 'mon', city: c, mon: m.key }); }
        m.at = [best.gx, best.gy];
        objs.push({ gx: best.gx, gy: best.gy, kind: 'mon', m, c, size: m.size });
      }
      return { taken, start, n: objs.length - start };
    };
    const undo = (p) => { for (const key of p.taken) tiles.set(key, { t: 'grass' }); objs.length = p.start; }; // the lots it took were all grass
    // a big stadium must not push out another monument the city earned: everything is placed again with
    // the stadium at its smaller size, and that is kept only if more monuments fit
    const big = placeAll(false);
    if (big.n < placed.length && placed.some((m) => m.min && m.at && m.size > m.min)) {
      undo(big);
      const small = placeAll(true);
      if (small.n <= big.n) { undo(small); placeAll(false); }
    }
    // farms around, where there is field left
    const r = seed(c.id);
    for (let f = 0; f < 3; f++) {
      const fw = 3 + Math.floor(r() * 3), fh = 3 + Math.floor(r() * 2);
      const fx = ox0 + 1 + Math.floor(r() * Math.max(1, inner - fw)), fy = oy0 + 1 + Math.floor(r() * Math.max(1, inner - fh));
      let ok = true;
      for (let x = fx - 1; x <= fx + fw && ok; x++) for (let y = fy - 1; y <= fy + fh; y++) if (getT(x, y)?.t !== 'grass') { ok = false; break; }
      if (ok) for (let x = fx; x < fx + fw; x++) for (let y = fy; y < fy + fh; y++) tiles.set(K(x, y), { t: 'farm', alt: y % 2 });
    }
  }
  const exch = exchange ? placeExchange({ tiles, getT, GW, GH, OY, cities, district }) : null;
  // the river bends: on the banks, where there is still field, it takes a lot here and there
  if (PY > 1) for (let gx = 0; gx < GW; gx++) {
    for (const [gy, ph] of [[OY + PLOT - 2, 0], [OY + PLOT + 1, 2.1]]) {
      if (getT(gx, gy)?.t === 'grass' && Math.sin(gx * 0.37 + ph) + hash(gx, gy, 21) * 0.6 > 0.75) tiles.set(K(gx, gy), { t: 'water' });
    }
  }
  // patches of woods in the fields and lamps at the crossings
  for (const [key, t] of tiles) {
    const gx = Math.floor(key / 10000), gy = key % 10000;
    if (t.t === 'grass') {
      const forest = hash(gx >> 1, gy >> 1, 9) < 0.42, p = forest ? 0.75 : 0.07;
      const n = hash(gx, gy, 1) < p ? 1 + Math.floor(hash(gx, gy, 12) * 3) : 0;
      for (let i = 0; i < n; i++) objs.push({ gx, gy, kind: 'tree', s: 0.8 + hash(gx, gy, 40 + i) * 0.7, u: 0.1 + hash(gx, gy, 20 + i) * 0.8, v: 0.1 + hash(gx, gy, 30 + i) * 0.8 });
    }
    if (t.t === 'road' && roadDir(gx, gy, getT) === 'xy') objs.push({ gx, gy, kind: 'lamp' });
    if (t.t === 'hwy' && !t.bridge && (gx + gy) % 4 === 0) objs.push({ gx, gy, kind: 'lamp' });
  }
  const lanes = buildLanes(GW, GH, getT), routes = goldRoutes(d, cities, getT);
  const onRoute = new Set(routes.flatMap((r) => r.path));
  for (const Ln of lanes) {
    let n = 0;
    for (let s = Ln.a; s < Ln.b; s++) if (onRoute.has(Ln.axis === 'x' ? K(s, Ln.f) : K(Ln.f, s))) n++;
    Ln.gold = n >= 2;
  }
  const maxWeek = Math.max(1, ...cities.flatMap((c) => c.buildings.map((b) => b.week)));
  return { PLOT, PX, PY, GW, GH, OY, tiles, objs, getT, cities, maxWeek, lanes, routes, onRoute, mega, district, exchange: exch };
}

// ───────── the Stock Exchange ─────────
// The region's own building (only when the server has a share to quote): a paved square in the fields,
// EXCHANGE lots a side (one less where nothing bigger fits). It looks for the place the region's picture
// shows best: as near the middle as it can, with a few rows of open ground in front of it (a river, a
// highway, fields), so no tower stands between it and whoever looks from the front, and where the plate
// over its roof does not fall on a city's sign in the region's picture: the sign stands at the back of its
// city and, in the picture of a big region, takes the room of SIGN_ROOM lots; the plate shows some lots
// behind the building's foot, so the square keeps to the front half of a plot, or to its front fields. With no
// field left anywhere it goes outside the map, past the front highway (off: true, no tiles of its own).
// Returns { gx, gy, size, off }: the square's corner and side, in tiles.
export const EXCHANGE = 3;
const SIGN_ROOM = { across: 13, from: 1, to: 13 }; // lots from a city's middle to each side, and in front of its back street, where a plate would fall on the city's sign
export function placeExchange({ tiles, getT, GW, GH, OY, cities, district }) {
  const signs = cities.filter((c) => c.box).map((c) => [c.center[0], c.box.sy]);
  if (district) signs.push([district.sign[0], district.sign[1] + 2]);
  const free = (x, y) => { const t = getT(x, y)?.t; return t === 'grass' || t === 'farm'; };
  const built = (x, y) => { const t = getT(x, y)?.t; return t === 'plaza' || t === 'lawn' || t === 'mon' || t === 'site'; }; // a building, a house, a monument, a foundation
  const midX = GW / 2, midY = OY + (GH - OY) * 0.55;
  for (let size = EXCHANGE; size >= 2; size--) {
    let best = null;
    for (let gx = 1; gx + size < GW; gx++) for (let gy = OY + 1; gy + size < GH; gy++) {
      let ok = true;
      for (let u = 0; u < size && ok; u++) for (let v = 0; v < size; v++) if (!free(gx + u, gy + v)) { ok = false; break; }
      if (!ok) continue;
      let open = 0; // rows in front of the square with nothing built on them (up to 8)
      scan: for (; open < 8; open++) for (let u = -1; u <= size; u++) if (built(gx + u, gy + size + open)) break scan;
      const cx = gx + size / 2, cy = gy + size / 2, hid = signs.some(([sx, sy]) => Math.abs(cx - sx) < SIGN_ROOM.across && cy - sy > SIGN_ROOM.from && cy - sy < SIGN_ROOM.to);
      const score = Math.abs(cx - midX) + Math.abs(cy - midY) * 0.7 - Math.min(open, 3) * 4 - Math.max(0, open - 3) * 0.5 + (hid ? 40 : 0);
      if (!best || score < best.score) best = { gx, gy, size, score };
    }
    if (!best) continue;
    for (let u = 0; u < size; u++) for (let v = 0; v < size; v++) tiles.set(K(best.gx + u, best.gy + v), { t: 'mon', exchange: true });
    return { gx: best.gx, gy: best.gy, size, off: false };
  }
  return { gx: Math.floor(GW / 2) - 1, gy: GH + 1, size: EXCHANGE, off: true };
}

// ───────── the Corporate District ─────────
// The Mega Builders' headquarters (rules.js megaOf) on 2×2 lots along a boulevard, the tallest next
// to the bridge that comes from the region's highway, alternating right and left; the next in line
// get a foundation after them. Up to 8 lots in one row; beyond that, rows in pairs facing a
// boulevard (the headquarters at the back, the foundations in front).
function districtLayout(n, GW, bridge) {
  const perMax = Math.max(2, Math.floor((GW - 6) / 3));
  const rows = n <= Math.min(8, perMax) ? 1 : Math.max(2, Math.ceil(n / perMax)), per = Math.ceil(n / rows);
  const pos = [];
  for (let i = 0; pos.length < per; i++) { pos.push(bridge + 2 + 3 * i); if (pos.length < per) pos.push(bridge - 3 - 3 * i); }
  const rowList = [], blvds = [];
  let gy = 1; // a row of lawn at the far edge
  for (let r = 0; r < rows; r += 2) {
    rowList.push(gy); gy += 2; blvds.push(gy); gy += 1;
    if (r + 1 < rows) { rowList.push(gy); gy += 2; }
    gy += 1;
  }
  const xs = pos.flatMap((x) => [x, x + 1]);
  return { DH: gy, bridge, pos, rows: rowList, blvds, x0: Math.max(0, Math.min(...xs, bridge) - 2), x1: Math.min(GW - 1, Math.max(...xs, bridge) + 2) };
}
// The district's tiles and objects: lawn, boulevards, the bridge over the channel, the lots (paved
// for a headquarters, bare for a foundation), trees between the lots, lamps and the diamond on the
// square at the end of the bridge. Returns where everything went, for main.js.
function placeDistrict(dist, lots, { tiles, objs, GW, OY }) {
  const { DH, bridge, pos, rows, blvds, x0, x1 } = dist;
  for (let gx = 0; gx < GW; gx++) {
    for (let gy = 0; gy < DH; gy++) tiles.set(K(gx, gy), { t: gx >= x0 && gx <= x1 ? 'campus' : 'grass' });
    for (let gy = DH; gy < OY; gy++) tiles.set(K(gx, gy), gx === bridge ? { t: 'hwy', dir: 'y', bridge: true } : { t: 'water' });
  }
  // the boulevards cross the whole band and meet the highways on the region's sides, which go over the
  // channel down to the cities (no boulevard stops in the lawn)
  for (const gy of blvds) for (let gx = 1; gx < GW - 1; gx++) tiles.set(K(gx, gy), { t: 'road', district: true });
  for (const gx of [0, GW - 1]) for (let gy = blvds[0]; gy < OY; gy++) tiles.set(K(gx, gy), { t: 'hwy', dir: 'y', ...(gy >= DH ? { bridge: true } : {}) });
  for (let gy = blvds[0]; gy < DH; gy++) tiles.set(K(bridge, gy), { t: 'road', district: true }); // from the first boulevard down to the bridge
  const placed = [];
  lots.forEach((lot, i) => {
    const per = pos.length, gy = rows[Math.floor(i / per)], gx = pos[i % per];
    for (let u = 0; u < 2; u++) for (let v = 0; v < 2; v++) tiles.set(K(gx + u, gy + v), { t: lot.hq ? 'plaza' : 'site', district: true });
    const o = { kind: lot.hq ? 'hq' : 'found', p: lot.p, gx, gy, size: 2, rank: i + 1 };
    objs.push(o); placed.push(o);
  });
  // trees in the gaps between the lots and along the far edge; lamps along the boulevards
  const gaps = new Set();
  for (const gy of rows) for (const gx of pos) for (const tx of [gx - 1, gx + 2]) {
    if (tx === bridge || gaps.has(K(tx, gy)) || tiles.get(K(tx, gy))?.t !== 'campus') continue;
    gaps.add(K(tx, gy));
    for (const v of [0, 1]) objs.push({ gx: tx, gy: gy + v, kind: 'tree', s: 0.9, u: 0.5, v: 0.5 });
  }
  for (let gx = x0; gx <= x1; gx += 2) if (tiles.get(K(gx, 0))?.t === 'campus') objs.push({ gx, gy: 0, kind: 'tree', s: 1, u: 0.5, v: 0.6 });
  for (const gy of blvds) for (let gx = x0 + 2; gx < x1 - 1; gx += 3) objs.push({ gx, gy, kind: 'lamp' });
  const square = [bridge, blvds[0] - 1]; // the diamond: where the bridge's road meets the district
  tiles.set(K(square[0], square[1]), { t: 'mon', district: true });
  objs.push({ kind: 'diamond', gx: square[0], gy: square[1] });
  return { ...dist, OY, lots: placed, square, sign: [bridge, DH - 1] };
}

// a street's direction from its neighbors (highways carry their own)
export function roadDir(gx, gy, getT) {
  const t = getT(gx, gy);
  if (t?.dir) return t.dir;
  const r = (x, y) => { const q = getT(x, y); return !!q && (q.t === 'road' || q.t === 'hwy'); };
  const h = r(gx - 1, gy) || r(gx + 1, gy), v = r(gx, gy - 1) || r(gx, gy + 1);
  return h && v ? 'xy' : v ? 'y' : 'x';
}

const isRoadT = (t) => !!t && (t.t === 'road' || t.t === 'hwy');
// the road tile in the box closest to (cx, cy); ok: which tiles count (any street or highway, unless told otherwise)
export function nearRoad(getT, x0, y0, x1, y1, cx, cy, ok = isRoadT) {
  let best = null;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (ok(getT(x, y))) { const d = Math.hypot(x - cx, y - cy); if (!best || d < best.d) best = { x, y, d }; }
  return best;
}
// Breadth-first search along streets, highways and bridges from a road tile: prev[key] = the tile
// before it on the way (-1 at the start). pathTo reads the way from the start to any tile it reached.
// ok: which tiles the search may cross (the sightseeing bus keeps to its own city's streets).
export function roadTree(getT, x, y, ok = isRoadT) {
  const isRoad = (a, b) => ok(getT(a, b));
  const prev = new Map([[K(x, y), -1]]), queue = [[x, y]];
  for (let i = 0; i < queue.length; i++) {
    const [qx, qy] = queue[i];
    for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
      const k = K(nx, ny);
      if (!prev.has(k) && isRoad(nx, ny)) { prev.set(k, K(qx, qy)); queue.push([nx, ny]); }
    }
  }
  return prev;
}
export function pathTo(prev, x, y) {
  if (!prev.has(K(x, y))) return null;
  const path = [];
  for (let k = K(x, y); k !== -1; k = prev.get(k)) path.push(k);
  return path.reverse();
}

// Golden roads: the path along streets, highways and bridges between the cities that share the
// most people (up to 4 pairs, with 2 people or more). The golden cars carry the people in common.
export function goldRoutes(d, cities, getT) {
  const byId = new Map(cities.map((c) => [c.id, c])), out = [];
  const door = (c) => {
    let best = null;
    for (let x = c.box.ox0; x < c.box.ox0 + 40; x++) for (let y = c.box.oy0; y < c.box.oy0 + 40; y++) {
      const t = getT(x, y);
      if (t?.t !== 'road' || t.city !== c) continue;
      const dd = Math.hypot(x - c.center[0], y - c.center[1]);
      if (!best || dd < best.dd) best = { x, y, dd };
    }
    return best;
  };
  for (const { a, b, n } of (d.links ?? []).filter((l) => l.n >= 2 && byId.has(l.a) && byId.has(l.b)).slice(0, 4)) {
    const A = door(byId.get(a)), B = door(byId.get(b));
    if (!A || !B) continue;
    const path = pathTo(roadTree(getT, A.x, A.y), B.x, B.y);
    if (path) out.push({ a, b, n, path });
  }
  return out;
}

// A Mega Builder's links (main.js draws them golden while the person is chosen): the way along the
// streets from each of their buildings to their lot in the Corporate District (a campus or a
// foundation), as [{ from, to: the edges of the building's lot and of the district lot facing their
// roads (in tiles), path: the road tiles, from the building }].
export function megaLinks(world, id) {
  const lot = world.district?.lots.find((o) => o.p.id === id);
  if (!lot) return [];
  const { getT } = world, near = (x0, y0, x1, y1, cx, cy) => nearRoad(getT, x0, y0, x1, y1, cx, cy);
  const gate = near(lot.gx - 1, lot.gy - 1, lot.gx + 2, lot.gy + 2, lot.gx + 0.5, lot.gy + 0.5);
  if (!gate) return [];
  const prev = roadTree(getT, gate.x, gate.y), out = [], edge = (r, x0, y0, n) => [Math.min(x0 + n - 0.5, Math.max(x0 - 0.5, r.x)), Math.min(y0 + n - 0.5, Math.max(y0 - 0.5, r.y))]; // a lot's edge, toward its road
  for (const { b } of lot.p.parts) {
    const o = world.objs.find((q) => q.kind === 'bld' && q.b === b);
    const door = o && near(o.gx - 2, o.gy - 2, o.gx + 2, o.gy + 2, o.gx, o.gy), path = door && pathTo(prev, door.x, door.y);
    if (path) out.push({ from: edge(door, o.gx, o.gy, 1), to: edge(gate, lot.gx, lot.gy, 2), path: path.reverse() });
  }
  return out;
}

// ───────── the sightseeing bus ─────────
// One per city: a closed way along the city's own streets, with a stop for each of its BUS_STOPS tallest
// buildings on the street the building shows best from: in front of it, or, for a lot with no street
// at its door, where the neighbor in between is the lowest. The bus comes in by the front (the sign's
// side), passes every stop, reaches the back and returns to the front, in the order that makes the
// shortest lap, and it never turns back on the spot: out of a side street it goes on to the next corner.
// A city of a single block only has the street around it, and the bus goes round it.
// In tiles: { tiles: [[x, y]…] (each a step from the one before, the first from the last), stops:
// [{ id, gx, gy, rank, s, hid }] in the order of the way (s: the index in tiles; rank: 1 = the tallest;
// hid: how much of it a neighbor hides from there, in tenths of its floors, 0 = in plain view),
// legs: [{ dist, T }] from each stop to the next, total: the seconds of a whole lap }.
export const BUS_STOPS = 6, BUS_SPEED = 0.7, BUS_DWELL = 7, BUS_ACCEL = 1.6; // tiles a second; seconds at a stop; seconds to reach the speed
const legTime = (d) => (d <= 0 ? 0 : d >= BUS_SPEED * BUS_ACCEL ? d / BUS_SPEED + BUS_ACCEL : 2 * Math.sqrt((d * BUS_ACCEL) / BUS_SPEED));
// the way made after tau seconds of a leg: it pulls away, cruises and brakes
function legPos(d, T, tau) {
  if (d <= 0 || T <= 0) return 0;
  const acc = BUS_SPEED / BUS_ACCEL, ta = d >= BUS_SPEED * BUS_ACCEL ? BUS_ACCEL : T / 2;
  if (tau < ta) return 0.5 * acc * tau * tau;
  if (tau > T - ta) return d - 0.5 * acc * (T - tau) ** 2;
  return 0.5 * acc * ta * ta + acc * ta * (tau - ta);
}
// A closed walk along the streets from `start` through every tile of `via` and back, never turning back
// on the spot: the search runs over (tile, heading), and with a handful of tiles every order is tried
// for the shortest lap. Returns [[x, y]…], start first, or null when the streets do not allow it.
const HEAD = [[-1, 0], [1, 0], [0, 1], [0, -1]]; // a heading and its reverse differ in the last bit; a tie goes to the first: along the front to the left, the outer side of the street
function busLoop(isRoad, start, via) {
  const SK = (x, y, h) => K(x, y) * 4 + h, memo = new Map();
  // from a state: how far every other one is (d), and the one before it on the way there (p)
  const from = (x, y, h) => {
    const k0 = SK(x, y, h);
    let m = memo.get(k0);
    if (m) return m;
    m = new Map([[k0, { d: 0, p: -1 }]]);
    const queue = [[x, y, h]];
    for (let i = 0; i < queue.length; i++) {
      const [qx, qy, qh] = queue[i], kq = SK(qx, qy, qh), d = m.get(kq).d + 1;
      for (let g = 0; g < 4; g++) {
        const nx = qx + HEAD[g][0], ny = qy + HEAD[g][1], k = SK(nx, ny, g);
        if (g === (qh ^ 1) || m.has(k) || !isRoad(nx, ny)) continue;
        m.set(k, { d, p: kq }); queue.push([nx, ny, g]);
      }
    }
    memo.set(k0, m);
    return m;
  };
  // the shortest way to get to a tile, whatever the heading it arrives with
  const arrive = (st, p) => { const m = from(...st); let best = null; for (let h = 0; h < 4; h++) { const e = m.get(SK(p.x, p.y, h)); if (e && (!best || e.d < best.d)) best = { d: e.d, to: [p.x, p.y, h] }; } return best; };
  let best = null;
  for (let h0 = 0; h0 < 4; h0++) {
    if (!isRoad(start.x - HEAD[h0][0], start.y - HEAD[h0][1])) continue; // it gets to the start along a street
    const s0 = [start.x, start.y, h0], used = via.map(() => false), order = [];
    const go = (st, cost) => {
      if (best && cost >= best.cost) return;
      if (order.length === via.length) { // and back to where the lap began, heading the same way
        const e = from(...st).get(SK(...s0));
        if (e && cost + e.d > 0 && (!best || cost + e.d < best.cost)) best = { cost: cost + e.d, states: [s0, ...order, s0] };
        return;
      }
      const next = [];
      via.forEach((p, i) => { const a = !used[i] && arrive(st, p); if (a) next.push({ i, a }); });
      next.sort((a, b) => a.a.d - b.a.d); // the closest first: a short lap is found early and cuts the search
      for (const { i, a } of next) { used[i] = true; order.push(a.to); go(a.to, cost + a.d); order.pop(); used[i] = false; }
    };
    go(s0, 0);
  }
  if (!best) return null;
  const tiles = [];
  for (let i = 0; i + 1 < best.states.length; i++) { // each leg is read backwards, from where it ends
    const a = best.states[i], m = from(...a), ka = SK(...a), leg = [];
    for (let k = SK(...best.states[i + 1]); k !== ka; k = m.get(k).p) leg.push(k);
    if (!leg.length) continue;
    tiles.push([a[0], a[1]]);
    for (const k of leg.reverse().slice(0, -1)) { const t = Math.floor(k / 4); tiles.push([Math.floor(t / 10000), t % 10000]); }
  }
  return tiles;
}
export function busRoute(world, c, n = BUS_STOPS) {
  const { getT } = world, bx = c.box;
  if (!bx) return null;
  const mine = (t) => !!t && t.t === 'road' && t.city === c;
  const cx = bx.sx + bx.cw / 2 - 0.5, cy = bx.sy + bx.ch / 2 - 0.5;
  const all = world.objs.filter((o) => o.kind === 'bld' && o.c === c), tall = [...all].sort((a, b) => b.b.floors - a.b.floors).slice(0, n);
  // how tall each lot stands, in floors (rubble hides nothing)
  const lot = new Map(all.map((o) => [K(o.gx, o.gy), ruinOf(o.b) === 'rubble' ? 0 : o.b.floors]));
  // How a building shows from a street tile: hid, the tallest neighbor in the line of sight, in tenths
  // of the building's own floors (so a house in front does not count), and d, how far. The line has a
  // width: a lot whose middle is within 0.8 of a tile from it is in the way, so a look between the
  // corners of two towers does not pass for a clear one. The clearer of two tiles hides less; the same,
  // it is the closer. A building on the street gets the tile in front of it.
  const sight = (o, x, y) => {
    const ux = o.gx - x, uy = o.gy - y, d = Math.hypot(ux, uy);
    let wall = 0;
    for (let px = Math.min(x, o.gx) - 1; px <= Math.max(x, o.gx) + 1; px++) for (let py = Math.min(y, o.gy) - 1; py <= Math.max(y, o.gy) + 1; py++) {
      const fl = lot.get(K(px, py));
      if (!fl || fl <= wall || (px === o.gx && py === o.gy)) continue;
      const k = d ? Math.min(1, Math.max(0, ((px - x) * ux + (py - y) * uy) / (d * d))) : 0;
      if (Math.hypot(px - x - ux * k, py - y - uy * k) < 0.8) wall = fl;
    }
    return { x, y, d, hid: Math.round((wall / Math.max(1, o.b.floors)) * 10) };
  };
  const clearer = (a, b) => !b || a.hid < b.hid || (a.hid === b.hid && a.d < b.d);
  const near3 = (o, x, y) => Math.max(Math.abs(x - o.gx), Math.abs(y - o.gy)) <= 3;
  const stops = [];
  tall.forEach((o, i) => {
    let r = null;
    for (let x = o.gx - 3; x <= o.gx + 3; x++) for (let y = o.gy - 3; y <= o.gy + 3; y++) if (mine(getT(x, y))) { const v = sight(o, x, y); if (clearer(v, r)) r = v; }
    if (r) stops.push({ id: o.b.id, gx: o.gx, gy: o.gy, rank: i + 1, x: r.x, y: r.y, o });
  });
  if (!stops.length) return null;
  const ang = (p) => (Math.atan2(p.x - cx, cy - p.y) + 2 * Math.PI) % (2 * Math.PI); // round the middle: 0 at the front
  const anchor = ([x, y]) => nearRoad(getT, x - 1, y - 1, x + 1, y + 1, x, y, mine);
  const x0 = bx.sx - 1, x1 = bx.sx + bx.cw, y0 = bx.sy - 1, y1 = bx.sy + bx.ch, xm = Math.round(cx);
  stops.sort((a, b) => ang(a) - ang(b) || a.rank - b.rank);
  const front = anchor([xm, y0]), back = anchor([xm, y1]);
  // the lap: from the front through each stop's tile and the back (two stops may share a tile)
  const via = [];
  for (const p of front ? [...stops, back].filter(Boolean) : []) if (!via.some((q) => q.x === p.x && q.y === p.y)) via.push({ x: p.x, y: p.y });
  const loop = front && via.length <= 8 ? busLoop((x, y) => mine(getT(x, y)), front, via) : null;
  let nodes = [];
  if (loop) {
    nodes = loop.map(([x, y]) => ({ x, y, at: [] }));
    for (const p of stops) nodes.find((nd) => nd.x === p.x && nd.y === p.y)?.at.push(p);
  } else {
    // streets that do not close such a lap: round the middle by the shortest ways, past the four corners
    const way = [...stops, ...[[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(anchor)].filter(Boolean).sort((a, b) => ang(a) - ang(b));
    // only what the first point reaches along the city's streets (they are all linked: the street around it)
    const reach = roadTree(getT, way[0].x, way[0].y, mine), pts = way.filter((p) => reach.has(K(p.x, p.y)));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], from = nodes.length;
      const path = pathTo(roadTree(getT, a.x, a.y, mine), b.x, b.y) ?? [K(a.x, a.y)];
      for (const k of path.slice(0, -1)) nodes.push({ x: Math.floor(k / 10000), y: k % 10000, at: [] });
      a.node = from; // the same tile as the next point: it sits on the next point's first tile
    }
    if (nodes.length < 2) return null;
    for (const p of pts) if (p.id) nodes[p.node % nodes.length].at.push(p);
  }
  if (nodes.length < 2) return null;
  // into a street and back out the same way: the two tiles go, and their stops wait at the corner
  for (let changed = true; changed && nodes.length > 3;) {
    changed = false;
    for (let i = 0; i < nodes.length && nodes.length > 3; i++) {
      const m = nodes.length, a = nodes[(i + m - 1) % m], b = nodes[i], d = nodes[(i + 1) % m];
      if (a === d || a.x !== d.x || a.y !== d.y) continue;
      a.at.push(...b.at, ...d.at);
      if (i + 1 < m) nodes.splice(i, 2); else { nodes.splice(i, 1); nodes.shift(); }
      changed = true; i = Math.max(-1, i - 2);
    }
  }
  // The way is set: each building is shown from the tile of the way it shows best from (a stop moved
  // to a corner may look at it across a taller neighbor, while another stretch of the way sees it).
  const out = [];
  nodes.forEach((nd, s) => { for (const p of nd.at) {
    let best = { ...sight(p.o, nd.x, nd.y), s };
    nodes.forEach((q, j) => { if (near3(p.o, q.x, q.y)) { const v = sight(p.o, q.x, q.y); if (clearer(v, best)) best = { ...v, s: j }; } });
    out.push({ id: p.id, gx: p.gx, gy: p.gy, rank: p.rank, s: best.s, hid: best.hid });
  } });
  out.sort((a, b) => a.s - b.s);
  if (!out.length) return null;
  const len = nodes.length;
  const legs = out.map((st, i) => { const dist = i + 1 < out.length ? out[i + 1].s - st.s : len - (st.s - out[0].s); return { dist, T: legTime(dist) }; });
  return { tiles: nodes.map((nd) => [nd.x, nd.y]), stops: out, legs, total: legs.reduce((a, g) => a + g.T + BUS_DWELL, 0) };
}
// Where the bus is t seconds into its laps: { x, y: in tiles (fractions between them), dx, dy: the way
// it faces, stop: the stop it stands at (-1 on the road), prev, next: the stops behind and ahead, done,
// left: tiles since the one and to the other, u: 0..1 of the wait at a stop }. The corners are cut
// short, so it turns instead of snapping.
export function busAt(route, t) {
  const n = route.stops.length, len = route.tiles.length;
  const point = (s) => { const f = ((s % len) + len) % len, i = Math.floor(f), a = route.tiles[i], b = route.tiles[(i + 1) % len], k = f - i; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
  const place = (s, more) => {
    const p0 = point(s - 0.32), p1 = point(s + 0.32), q0 = point(s), q1 = point(s + 0.05);
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1], d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = q1[0] - q0[0]; dy = q1[1] - q0[1]; d = Math.hypot(dx, dy) || 1; }
    return { x: (p0[0] + p1[0]) / 2, y: (p0[1] + p1[1]) / 2, dx: dx / d, dy: dy / d, s: ((s % len) + len) % len, ...more };
  };
  let tt = ((t % route.total) + route.total) % route.total;
  for (let i = 0; i < n; i++) {
    const leg = route.legs[i], next = (i + 1) % n;
    if (tt < BUS_DWELL) return place(route.stops[i].s, { stop: i, prev: i, next, done: 0, left: leg.dist, u: tt / BUS_DWELL });
    tt -= BUS_DWELL;
    if (tt < leg.T) { const d = legPos(leg.dist, leg.T, tt); return place(route.stops[i].s + d, { stop: -1, prev: i, next, done: d, left: leg.dist - d, u: 0 }); }
    tt -= leg.T;
  }
  return place(route.stops[0].s, { stop: 0, prev: 0, next: 1 % n, done: 0, left: route.legs[0].dist, u: 0 });
}
// when the bus reaches a stop (the seconds into the lap): to board at a stop, or to jump to the next one
export function busStopTime(route, i) {
  let t = 0;
  for (let k = 0; k < i; k++) t += BUS_DWELL + route.legs[k].T;
  return t;
}

// Traffic: straight stretches of street and highway where the cars drive. Streets cross streets at
// the corners; a highway only follows its own direction.
export function buildLanes(GW, GH, getT) {
  const roadAt = (x, y) => { const t = getT(x, y); return t && (t.t === 'road' || t.t === 'hwy') ? t : null; };
  const along = (x, y, axis) => {
    const t = roadAt(x, y);
    if (!t) return false;
    if (t.t === 'hwy') return t.dir === axis;
    return axis === 'x' ? !!(roadAt(x - 1, y) || roadAt(x + 1, y)) : !!(roadAt(x, y - 1) || roadAt(x, y + 1));
  };
  const lanes = [];
  for (const axis of ['x', 'y']) {
    const [n1, n2] = axis === 'x' ? [GH, GW] : [GW, GH];
    for (let f = 0; f < n1; f++) {
      let a = -1;
      for (let s = 0; s <= n2; s++) {
        const on = s < n2 && (axis === 'x' ? along(s, f, 'x') : along(f, s, 'y'));
        if (on && a < 0) a = s;
        if (!on && a >= 0) {
          const t = axis === 'x' ? roadAt(a, f) : roadAt(f, a);
          if (s - a >= 2) lanes.push({ axis, f, a, b: s, hwy: t.t === 'hwy', city: t.city ?? null });
          a = -1;
        }
      }
    }
  }
  return lanes;
}

// The whole ground is a single texture drawn on a canvas: grass, streets with sidewalks and lane
// marks, lots, parks, the river with its banks, farms and the monuments' bases. Drawn once per reading.
// grey: on the data maps (like SimCity's) the ground turns grey and only the buildings get colors.
export function groundCanvas(world, { grey = false } = {}) {
  const { GW, GH, getT } = world;
  const PX = Math.max(16, Math.min(32, Math.floor(4096 / Math.max(GW, GH))));
  const cv = document.createElement('canvas'); cv.width = GW * PX; cv.height = GH * PX;
  const x = cv.getContext('2d');
  const C = grey
    ? { grass: ['#b3b8ae', '#afb4aa', '#b7bcb2'], road: '#76787c', hwy: '#686a6e', walk: '#c6c5bf', lawn: '#b8bdb4', plaza: '#c6c5bf', park: '#adb3a6', water: '#8ea3b5', shore: '#aebcc8', farm: ['#bdbcb0', '#b5b7ab'], mon: '#c6c5bf', campus: '#bcc1b8', site: '#bdb9ae', line: 'rgba(255,255,255,.6)', gold: 'rgba(242,183,5,.7)' }
    : { grass: ['#86c05f', '#7fb95a', '#8cc566'], road: '#5b5e63', hwy: '#4c4f54', walk: '#b8b4a8', lawn: '#93c96c', plaza: '#cdc8b8', park: '#7cc35c', water: '#3f8fd0', shore: '#8fd0f0', farm: ['#d4bd63', '#9cc251'], mon: '#d6d0c2', campus: '#97d070', site: '#a88e66', line: 'rgba(255,255,255,.8)', gold: 'rgba(242,183,5,.85)' };
  const isWater = (t) => t && (t.t === 'water' || t.bridge);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const t = getT(gx, gy), px = gx * PX, py = gy * PX, v = hash(gx, gy, 4);
    x.fillStyle = C.grass[Math.floor(v * 3)]; x.fillRect(px, py, PX, PX);
    if (!grey && !isWater(t)) for (let i = 0; i < 5; i++) { // a grain on the grass: a few darker and lighter tufts per lot
      const u = hash(gx, gy, 20 + i), w = hash(gx, gy, 30 + i), k = Math.max(2, PX / 9);
      x.fillStyle = i % 2 ? 'rgba(40,96,40,.16)' : 'rgba(214,240,150,.2)'; x.fillRect(px + u * (PX - k), py + w * (PX - k), k, k * 0.7);
    }
    if (isWater(t)) {
      x.fillStyle = C.water; x.fillRect(px, py, PX, PX);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { // light bank where it touches land
        const nb = getT(gx + dx, gy + dy);
        if (nb && !isWater(nb)) { x.fillStyle = C.shore; x.fillRect(px + (dx > 0 ? PX - 4 : 0), py + (dy > 0 ? PX - 4 : 0), dx ? 4 : PX, dy ? 4 : PX); }
      }
    }
    if (t.t === 'road' || t.t === 'hwy') {
      const hwy = t.t === 'hwy', dir = roadDir(gx, gy, getT), s = hwy ? 4 : 6;
      if (t.bridge) { x.fillStyle = C.hwy; x.fillRect(px + 5, py, PX - 10, PX); x.fillStyle = '#e8e4da'; x.fillRect(px + 5, py, 2, PX); x.fillRect(px + PX - 7, py, 2, PX); }
      else {
        x.fillStyle = hwy ? C.hwy : C.road; x.fillRect(px, py, PX, PX);
        x.fillStyle = C.walk;
        if (dir === 'x') { x.fillRect(px, py, PX, s); x.fillRect(px, py + PX - s, PX, s); }
        if (dir === 'y') { x.fillRect(px, py, s, PX); x.fillRect(px + PX - s, py, s, PX); }
      }
      const gold = world.onRoute.has(K(gx, gy));
      x.strokeStyle = gold ? C.gold : C.line; x.lineWidth = gold ? 3 : hwy ? 1.5 : 1; x.setLineDash(hwy || gold ? [] : [5, 6]);
      if (dir === 'x' || (gold && dir === 'xy')) { x.beginPath(); x.moveTo(px, py + PX / 2); x.lineTo(px + PX, py + PX / 2); x.stroke(); }
      if (dir === 'y' || (gold && dir === 'xy')) { x.beginPath(); x.moveTo(px + PX / 2, py); x.lineTo(px + PX / 2, py + PX); x.stroke(); }
      x.setLineDash([]);
      if (!hwy && !t.bridge && (dir === 'x' || dir === 'y')) { // a crosswalk at each end that meets a crossing
        const k = Math.max(2, PX / 8), step = Math.max(2, PX / 10);
        x.fillStyle = C.line;
        for (const e of [-1, 1]) {
          if (roadDir(gx + (dir === 'x' ? e : 0), gy + (dir === 'y' ? e : 0), getT) !== 'xy') continue;
          for (let a = s + 1; a < PX - s - 1; a += step) {
            if (dir === 'x') x.fillRect(e > 0 ? px + PX - k - 1 : px + 1, py + a, k, step * 0.55);
            else x.fillRect(px + a, e > 0 ? py + PX - k - 1 : py + 1, step * 0.55, k);
          }
        }
      }
    }
    if (t.t === 'plaza' || t.t === 'mon') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = t.t === 'mon' ? C.mon : C.plaza; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); }
    if (t.t === 'lawn') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = C.lawn; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); }
    if (t.t === 'park') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = C.park; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); }
    if (t.t === 'farm') { const w = Math.max(3, PX / 8); for (let i = 0; i < PX; i += w) { x.fillStyle = C.farm[(Math.round(i / w) + t.alt) % 2]; x.fillRect(px + i, py, w, PX); } }
    if (t.t === 'campus') { x.fillStyle = C.campus; x.fillRect(px, py, PX, PX); } // the district's mown lawn
    if (t.t === 'site') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = C.site; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); } // a foundation's bare ground
  }
  // A soft shadow at the foot of every building and house: it sits them on the ground (painted here, so
  // it costs nothing per frame).
  for (const o of world.objs) {
    if (o.kind !== 'bld') continue;
    const cx = (o.gx + 0.5) * PX, cy = (o.gy + 0.5) * PX, r = PX * (o.b.floors < 15 ? 0.5 : 0.66);
    const gr = x.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    gr.addColorStop(0, `rgba(20,30,20,${grey ? 0.16 : 0.3})`); gr.addColorStop(1, 'rgba(20,30,20,0)');
    x.fillStyle = gr; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  return cv;
}
