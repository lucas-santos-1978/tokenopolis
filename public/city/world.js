// The region's terrain (buildWorld, buildLanes and goldRoutes). One region plot per city: blocks of
// 4×4 lots with streets between them, highways on the borders, the river between the 1st and 2nd
// rows (with bridges), monuments in the fields around, farms and woods. The tallest buildings stand
// in the middle of each city, like in a real city: in 3D the camera turns and nobody hides anybody.

import { context, monumentsOf, tierOf, mayorOf, BUILDING_TIERS } from './rules.js';

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

export function buildWorld(d, { allMonuments = false } = {}) {
  const cities = d.cities;
  for (const c of cities) {
    const blocks = Math.max(1, Math.ceil(c.buildings.length / (BLOCK * BLOCK)));
    c.k = Math.ceil(Math.sqrt(blocks)); c.m = Math.ceil(blocks / c.k);
    c.style = tierOf(c.floors).style;
  }
  const kmax = Math.max(1, ...cities.map((c) => Math.max(c.k, c.m)));
  // blocks + streets + margin (1 lot behind and 2 in front, where the monuments go)
  const PLOT = kmax * (BLOCK + 1) + 3;
  const mx = context(d);
  const PX = Math.max(1, Math.ceil(Math.sqrt(cities.length * 4 / 3))), PY = Math.max(1, Math.ceil(cities.length / PX));
  const GW = PLOT * PX, GH = PLOT * PY;
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
  // river between the 1st and 2nd rows of plots; highways on the other borders
  for (let gx = 0; gx < GW; gx++) for (let gy = 0; gy < GH; gy++) {
    const lx = gx % PLOT, ly = gy % PLOT, row = Math.floor(gy / PLOT);
    let t = { t: 'grass' };
    if (PY > 1 && (gy === PLOT - 1 || gy === PLOT)) t = lx === 0 && gx > 0 ? { t: 'hwy', dir: 'y', bridge: true } : { t: 'water' };
    else if (lx === 0 && gx > 0) t = { t: 'hwy', dir: 'y' };
    else if (ly === 0 && row >= 2) t = { t: 'hwy', dir: 'x' };
    tiles.set(K(gx, gy), t);
  }
  for (const c of cities) {
    const [px, py] = c.slot, ox0 = px * PLOT, oy0 = py * PLOT;
    const cw = c.k * (BLOCK + 1) - 1, ch = c.m * (BLOCK + 1) - 1, inner = PLOT - 2;
    const sx = ox0 + 1 + Math.floor((inner - cw) / 2), sy = oy0 + 1 + Math.floor((inner - ch) / 2);
    c.box = { ox0, oy0, sx, sy, cw, ch };
    const lots = [];
    for (let u = 0; u < cw; u++) for (let v = 0; v < ch; v++) {
      if (u % (BLOCK + 1) === BLOCK || v % (BLOCK + 1) === BLOCK) tiles.set(K(sx + u, sy + v), { t: 'road', city: c });
      else lots.push([sx + u, sy + v]);
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
    for (const m of placed) {
      let best = null;
      if (m.key === 'dojo') { for (let s = m.size; s >= 1 && !best; s--) { best = spot(s); if (best) m.size = s; } } // the great temple fits where it can
      else best = spot(m.size);
      if (!best) continue;
      for (let u = 0; u < m.size; u++) for (let v = 0; v < m.size; v++) tiles.set(K(best.gx + u, best.gy + v), { t: 'mon', city: c, mon: m.key });
      m.at = [best.gx, best.gy];
      objs.push({ gx: best.gx, gy: best.gy, kind: 'mon', m, c, size: m.size });
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
  // the river bends: on the banks, where there is still field, it takes a lot here and there
  if (PY > 1) for (let gx = 0; gx < GW; gx++) {
    for (const [gy, ph] of [[PLOT - 2, 0], [PLOT + 1, 2.1]]) {
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
  return { PLOT, PX, PY, GW, GH, tiles, objs, getT, cities, maxWeek, lanes, routes, onRoute };
}

// a street's direction from its neighbors (highways carry their own)
export function roadDir(gx, gy, getT) {
  const t = getT(gx, gy);
  if (t?.dir) return t.dir;
  const r = (x, y) => { const q = getT(x, y); return !!q && (q.t === 'road' || q.t === 'hwy'); };
  const h = r(gx - 1, gy) || r(gx + 1, gy), v = r(gx, gy - 1) || r(gx, gy + 1);
  return h && v ? 'xy' : v ? 'y' : 'x';
}

// Golden roads: the path along streets, highways and bridges between the cities that share the
// most people (up to 4 pairs, with 2 people or more). The golden cars carry the people in common.
export function goldRoutes(d, cities, getT) {
  const byId = new Map(cities.map((c) => [c.id, c])), out = [];
  const isRoad = (x, y) => { const t = getT(x, y); return t && (t.t === 'road' || t.t === 'hwy'); };
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
    const prev = new Map([[K(A.x, A.y), -1]]), queue = [[A.x, A.y]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      if (x === B.x && y === B.y) break;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const k = K(nx, ny);
        if (!prev.has(k) && isRoad(nx, ny)) { prev.set(k, K(x, y)); queue.push([nx, ny]); }
      }
    }
    if (!prev.has(K(B.x, B.y))) continue;
    const path = [];
    for (let k = K(B.x, B.y); k !== -1; k = prev.get(k)) path.push(k);
    out.push({ a, b, n, path: path.reverse() });
  }
  return out;
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
    ? { grass: ['#b3b8ae', '#afb4aa', '#b7bcb2'], road: '#76787c', hwy: '#686a6e', walk: '#c6c5bf', lawn: '#b8bdb4', plaza: '#c6c5bf', park: '#adb3a6', water: '#8ea3b5', shore: '#aebcc8', farm: ['#bdbcb0', '#b5b7ab'], mon: '#c6c5bf', line: 'rgba(255,255,255,.6)', gold: 'rgba(242,183,5,.7)' }
    : { grass: ['#86c05f', '#7fb95a', '#8cc566'], road: '#5b5e63', hwy: '#4c4f54', walk: '#b8b4a8', lawn: '#93c96c', plaza: '#cdc8b8', park: '#7cc35c', water: '#3f8fd0', shore: '#8fd0f0', farm: ['#d4bd63', '#9cc251'], mon: '#d6d0c2', line: 'rgba(255,255,255,.8)', gold: 'rgba(242,183,5,.85)' };
  const isWater = (t) => t && (t.t === 'water' || t.bridge);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const t = getT(gx, gy), px = gx * PX, py = gy * PX, v = hash(gx, gy, 4);
    x.fillStyle = C.grass[Math.floor(v * 3)]; x.fillRect(px, py, PX, PX);
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
    }
    if (t.t === 'plaza' || t.t === 'mon') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = t.t === 'mon' ? C.mon : C.plaza; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); }
    if (t.t === 'lawn') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = C.lawn; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); }
    if (t.t === 'park') { x.fillStyle = C.walk; x.fillRect(px, py, PX, PX); x.fillStyle = C.park; x.fillRect(px + 2, py + 2, PX - 4, PX - 4); }
    if (t.t === 'farm') { const w = Math.max(3, PX / 8); for (let i = 0; i < PX; i += w) { x.fillStyle = C.farm[(Math.round(i / w) + t.alt) % 2]; x.fillRect(px + i, py, w, PX); } }
  }
  return cv;
}
