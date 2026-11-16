// The sightseeing buses: one open-top double-decker per city, going round its tallest buildings (the
// way and the timetable are world.js's busRoute and busAt). Every bus of the region is an instance of
// the same three meshes: the body (one geometry, the colors on the vertices), the warm lights
// (headlights and the string of bulbs along the deck) and the red tail lights, which come on at night
// with the rest of the city. Where a bus is depends only on the clock, so a new reading (the scene is
// rebuilt) does not send it back to the start, and everyone looking sees it in the same place.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, strHash, busRoute, busAt, BUS_STOPS } from './world.js';
import { ruinOf } from './rules.js';
import { matte, WARM_LIGHT, RED_LIGHT } from './buildings.js';

export const BUS = { len: 5.4, wid: 1.8, deck: 1.69, top: 2.72, lane: 0.19 }; // world units; deck: the upper floor; lane: tiles to the right of the street's middle

const NI = (g) => (g.index ? g.toNonIndexed() : g);
const col = new THREE.Color();
function paint(g, hex) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  col.set(hex);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (w, h, d, x, y, z, hex) => { const g = NI(new THREE.BoxGeometry(w, h, d).translate(x, y, z)); return hex ? paint(g, hex) : g; };

// the bus faces +x; the ground is y = 0
let parts = null;
function busParts() {
  if (parts) return parts;
  const RED = '#d63a2f', CREAM = '#f5ead2', GLASS = '#1c2a36', TYRE = '#1d2126', SEAT = '#27496d', FLOOR = '#8a8f96';
  const g = [];
  for (const x of [-1.7, 1.7]) for (const z of [-0.78, 0.78]) g.push(paint(NI(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12).rotateX(Math.PI / 2).translate(x, 0.42, z)), TYRE));
  g.push(box(BUS.len, 1.3, BUS.wid, 0, 0.95, 0, RED)); // the lower deck
  g.push(box(4.3, 0.5, BUS.wid + 0.04, -0.3, 1.16, 0, GLASS), box(0.1, 0.62, 1.5, 2.68, 1.12, 0, GLASS)); // its windows and the windshield
  g.push(box(BUS.len + 0.04, 0.16, BUS.wid + 0.04, 0, 1.62, 0, CREAM)); // the band between the decks
  g.push(box(BUS.len - 0.2, 0.04, BUS.wid - 0.2, 0, BUS.deck + 0.02, 0, FLOOR)); // the open deck's floor
  for (const z of [-0.86, 0.86]) g.push(box(BUS.len, 0.5, 0.09, 0, 1.94, z, RED)); // the parapet
  g.push(box(0.09, 0.5, BUS.wid, -2.66, 1.94, 0, RED), box(0.09, 0.62, BUS.wid, 2.66, 2.0, 0, RED), box(0.06, 0.26, BUS.wid - 0.12, 2.66, 2.44, 0, GLASS)); // the back, the front and its wind shield
  // seats in pairs, and the tourists on most of them
  const SHIRTS = ['#e8463a', '#3d7bd9', '#f2c14e', '#7bc043', '#9b59b6', '#f2f2f2', '#ff8a3d'], SKINS = ['#f1c9a5', '#c68e5f', '#8d5a3b', '#e6b48a'];
  let k = 0;
  for (let r = 0; r < 5; r++) for (const z of [-0.43, 0.43]) {
    const x = -2.05 + r * 0.93;
    g.push(box(0.4, 0.36, 0.6, x, BUS.deck + 0.2, z, SEAT), box(0.08, 0.5, 0.6, x - 0.2, BUS.deck + 0.42, z, SEAT));
    if ((k++ * 7 + 3) % 10 < 7) {
      g.push(paint(NI(new THREE.CylinderGeometry(0.15, 0.17, 0.44, 7).translate(x + 0.02, BUS.deck + 0.6, z)), SHIRTS[k % SHIRTS.length]));
      g.push(paint(NI(new THREE.SphereGeometry(0.16, 8, 6).translate(x + 0.02, BUS.deck + 0.97, z)), SKINS[k % SKINS.length]));
    }
  }
  const warm = [box(0.08, 0.2, 0.34, 2.72, 0.72, -0.58), box(0.08, 0.2, 0.34, 2.72, 0.72, 0.58), box(0.06, 0.12, 1.2, 2.72, 1.5, 0)]; // the headlights and the lit sign over the windshield
  for (const z of [-0.86, 0.86]) for (let i = 0; i < 9; i++) warm.push(box(0.1, 0.1, 0.1, -2.4 + i * 0.6, 2.24, z)); // the bulbs along the deck
  const red = [box(0.08, 0.18, 0.3, -2.72, 0.8, -0.62), box(0.08, 0.18, 0.3, -2.72, 0.8, 0.62)];
  for (const s of [...warm, ...red]) s.deleteAttribute('uv');
  for (const s of g) s.deleteAttribute('uv');
  parts = [
    { geometry: mergeGeometries(g, false), material: matte('#ffffff', { roughness: 0.5, metalness: 0.1, envMapIntensity: 0.6 }).userData.tint, shadow: true },
    { geometry: mergeGeometries(warm, false), material: WARM_LIGHT },
    { geometry: mergeGeometries(red, false), material: RED_LIGHT },
  ];
  return parts;
}

// The ways are kept from one reading to the next: working one out tries every order of the stops, and a
// reading that moves no building of a city, changes no place among its tallest and adds less than ten
// floors to a building leaves the city's way as it was.
const kept = new Map(); // city id → { sig, route }
function routesOf(world, cities) {
  const sigs = new Map();
  for (const o of world.objs) if (o.kind === 'bld') sigs.set(o.c.id, `${sigs.get(o.c.id) ?? ''}${o.gx},${o.gy},${Math.round(o.b.floors / 10)}${ruinOf(o.b) === 'rubble' ? 'r' : ''};`);
  const out = new Map();
  for (const c of cities) {
    const bx = c.box;
    if (!bx) continue;
    const top = [...c.buildings].sort((a, b) => b.floors - a.floors).slice(0, BUS_STOPS + 1).map((b) => b.id).join(',');
    const sig = `${bx.sx},${bx.sy},${bx.cw},${bx.ch}|${top}|${sigs.get(c.id) ?? ''}`, was = kept.get(c.id);
    const route = was?.sig === sig ? was.route : busRoute(world, c);
    kept.set(c.id, { sig, route });
    if (route) out.set(c.id, route);
  }
  for (const id of kept.keys()) if (!cities.some((c) => c.id === id)) kept.delete(id);
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);

// cities: the reading's; wx, wz: a tile's middle in the world. Returns { group, list, has, routeOf,
// poseOf(id, t), step(t, own), pick(ray), dispose }; t: seconds (the wall clock); own: { id, t } gives
// one bus its own time (the one being ridden may run ahead to the next stop).
export function makeBuses({ scene, world, cities, wx, wz }) {
  const list = [], routes = routesOf(world, cities);
  for (const c of cities) { const route = routes.get(c.id); if (route) list.push({ id: c.id, c, route, phase: ((strHash(c.id) % 997) / 997) * route.total, pose: null, hit: { bus: c.id, c } }); }
  const byId = new Map(list.map((b) => [b.id, b]));
  const group = new THREE.Group(); scene.add(group);
  const meshes = list.length ? busParts().map(({ geometry, material, shadow }) => { const im = new THREE.InstancedMesh(geometry, material, list.length); im.castShadow = !!shadow; im.frustumCulled = false; group.add(im); return im; }) : [];
  // the bus in the world at lap time tt: on the right of the street, facing the way it goes
  function poseAt(b, tt) {
    const a = busAt(b.route, tt);
    return { ...a, x: wx(a.x - a.dy * BUS.lane), z: wz(a.y + a.dx * BUS.lane), dx: a.dx, dz: a.dy, yaw: Math.atan2(-a.dy, a.dx) };
  }
  const timeOf = (b, t, own) => (own && own.id === b.id ? own.t : t + b.phase);
  function step(t, own = null) {
    list.forEach((b, i) => {
      const p = b.pose = poseAt(b, timeOf(b, t, own));
      _m.compose(_p.set(p.x, 0, p.z), _q.setFromAxisAngle(_up, p.yaw), _s);
      for (const im of meshes) im.setMatrixAt(i, _m);
    });
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;
  }
  // the bus under the pointer: it is small from afar, so the ray only has to pass close to it (the
  // farther the camera, the more room); returns { hit: { bus, c, x, h, z }, dist } or null
  function pick(ray) {
    let best = null;
    for (const b of list) {
      if (!b.pose) continue;
      _p.set(b.pose.x, 1.4, b.pose.z);
      const along = _p.clone().sub(ray.origin).dot(ray.direction);
      if (along <= 0) continue;
      const off = Math.sqrt(ray.distanceSqToPoint(_p));
      if (off <= Math.max(2.6, along * 0.016) && (!best || along < best.dist)) best = { hit: Object.assign(b.hit, { x: b.pose.x, h: BUS.top, z: b.pose.z, w: 6 }), dist: along };
    }
    return best;
  }
  return {
    group, list, step, pick,
    has: (id) => byId.has(id),
    routeOf: (id) => byId.get(id)?.route ?? null,
    phaseOf: (id) => byId.get(id)?.phase ?? 0,
    poseOf: (id, t, own = null) => { const b = byId.get(id); return b ? poseAt(b, timeOf(b, t, own)) : null; },
    dispose() { scene.remove(group); for (const im of meshes) im.dispose(); }, // the geometries and the materials are shared: they stay
  };
}
