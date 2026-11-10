// The kit of parts for buildings, houses and monuments. Each part becomes geometry in a batch
// (Batcher) per material: the whole region, with hundreds of buildings, ends up in a few dozen
// meshes. Only what moves (cranes, the Ferris wheel) is its own object.
//
// Variety per person: a fixed draw from the id (seed) picks the footprint (square, slab, L-shaped or
// on a podium), the setback, the window tile, the crown and the rooftop details. The rooftop tells
// the story: yellow top for this week's floors, a crane for whoever is building now, newcomer
// balloons, helipad, garden, antenna, the night owl's neon sign and the network's flag (a black and
// gold banner for a Mega Builder, whose campus stands in the Corporate District). Whoever stops
// using Claude sees the building burn (soot on the walls; flames and smoke come from life.js) and
// then fall into a pile of rubble (ruinOf in rules.js).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seed, tier, kind, L } from './world.js';
import { t, fmt, displayName } from '../i18n/index.js';
import { monthOf, floorsText, ruinOf } from './rules.js';

const TILE_W = 4.8, TILE_H = 4; // one tile of the facade texture: 4 windows × 4 (visual) floors
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => clamp(Math.round(v * f), 0, 255).toString(16).padStart(2, '0')).join('')}`; };

// Colors of each city style (the milestone unlocks the style)
export const PAL = {
  house: ['#f3ead7', '#e9dcc3', '#f6f1e6', '#e3d2b4', '#f0d9c8', '#dfe6d2'], roof: ['#c0504d', '#4f7fb3', '#6a9f4f', '#8b5a3c', '#d08a3a'],
  tile: ['#b5532f', '#c4643a', '#a8482a'], solar: ['#2f4a7a', '#34508a'],
};
export const STYLE_PAL = {
  brick: { building: ['#b5563e', '#a94f3a', '#c0674a', '#9c4a36'], tower: ['#b86a50', '#a65d47', '#c07a5e'], skyscraper: ['#c27a5c', '#b56f52'] },
  concrete: { building: ['#e8dcc0', '#d9c7a3', '#c98d6b', '#bfc5cc', '#efe9dc', '#d7b48f'], tower: ['#7fb2d9', '#6fa9b8', '#8cb8c9', '#93a7c4'], skyscraper: ['#a9d4f0', '#9ec3e0', '#b7d0e6'] },
  glass: { building: ['#8fc1e3', '#7fb6dc', '#a4cbe6', '#b9d6ea'], tower: ['#4f93c9', '#5aa0d4', '#3f86c0'], skyscraper: ['#6fb3e8', '#5fa6df', '#7dbbe9'] },
  deco: { building: ['#efe3c4', '#e6d3a8', '#f2e8d0', '#dcc89c'], tower: ['#e9d9b0', '#dcc596', '#efdfb8'], skyscraper: ['#f0e2bd', '#e4cf9f'] },
  neon: { building: ['#8293b6', '#8c9dc0', '#7789ab'], tower: ['#647aa6', '#6e84b0', '#5b7099'], skyscraper: ['#5a71a3', '#647bad'] },
  // the three titles after the Megalopolis: white stone and sea-green glass; chrome and violet; Martian terracotta
  global: { building: ['#e9f1f2', '#d6e6e8', '#f4f7f7', '#cfe0e2'], tower: ['#5fb8b0', '#4fa7a3', '#73c4bb'], skyscraper: ['#7fd1c6', '#69c2b8'] },
  future: { building: ['#c9cedb', '#b9c0d1', '#d6dae6'], tower: ['#8f86c9', '#7d75ba', '#a39bd6'], skyscraper: ['#9a8fe0', '#8a7fd2'] },
  mars: { building: ['#c98a64', '#b97b58', '#d59a74'], tower: ['#b5593c', '#a44e35', '#c46a4b'], skyscraper: ['#c8623f', '#b85736'] },
};
// the styles of glass towers (the others are masonry), and the color of each one's lit windows
const GLASSY = new Set(['glass', 'neon', 'global', 'future', 'mars']);
const WINDOW_GLOW = { neon: '#9be8ff', global: '#c8fff0', future: '#dcc2ff', mars: '#ffbf8a' };
// Blocks of each type: [setback, fraction of the height where the block ends]; from the skyscraper
// up the tower narrows in steps. Art deco: a stepped crown from the tower up.
const SECTIONS = {
  building: [[0.12, 1]], tower: [[0.12, 1]], skyscraper: [[0.12, 1]],
  supertower: [[0.12, 0.62], [0.19, 0.86], [0.27, 1]], cloudTower: [[0.12, 0.5], [0.18, 0.8], [0.25, 1]],
  orbitalTower: [[0.15, 0.55], [0.21, 0.85], [0.28, 1]], spaceElevator: [[0.15, 0.5], [0.2, 0.8], [0.27, 1]],
};
const DECO_SECTIONS = [[0.12, 0.78], [0.2, 0.92], [0.28, 1]];
export const HOUSE_H = { house: 3.0, townhouse: 4.6, poolHouse: 4.6, condo: 4.0 };

// ───────── materials ─────────
export const mats = new Set(); // all of them: the environment intensity changes with the hour
export const lit = []; // the ones that light up at night: { m, i }
export const blinkMats = []; // the ones that blink
const reg = (m) => { mats.add(m); return m; };
const nightly = (m, i) => { lit.push({ m, i }); return m; };
const matteCache = new Map();
export function matte(hex, extra = {}) {
  const key = hex + JSON.stringify(extra);
  if (!matteCache.has(key)) matteCache.set(key, reg(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, envMapIntensity: 0.35, ...extra })));
  return matteCache.get(key);
}
const glowMat = (hex) => reg(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0, roughness: 0.6 }));
export const GOLD_MAT = matte('#e3c25a', { roughness: 0.35, metalness: 0.7, envMapIntensity: 0.9 });
export const SILVER = matte('#d5dbe2', { roughness: 0.4, metalness: 0.6, envMapIntensity: 0.8 });
const SCAFFOLD = matte('#f4c440'), SCAFFOLD_TOP = matte('#f6d77f');
export const STONE = matte('#d6d0c2'), DARK = matte('#3a4048');
const BRONZE = matte('#a8763f', { roughness: 0.45, metalness: 0.6 }), PATINA = matte('#5fae96', { roughness: 0.7, metalness: 0.2 });
export const RED_LIGHT = nightly(glowMat('#ff3b30'), 2.5), GREEN_LIGHT = nightly(glowMat('#5cff7a'), 2.5), WARM_LIGHT = nightly(glowMat('#ffd27a'), 1.8);
export const PINK = nightly(glowMat('#ff4fd8'), 2.2), CYAN = nightly(glowMat('#3ef0ff'), 2.2), BEACON = nightly(glowMat('#fff6d0'), 3);
blinkMats.push(RED_LIGHT, GREEN_LIGHT);
const HOUSE_GLASS = nightly(reg(new THREE.MeshStandardMaterial({ color: '#4a6a8c', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.3 })), 1.6);
const POOL = nightly(reg(new THREE.MeshStandardMaterial({ color: '#4fb4e6', emissive: '#3fa0e0', emissiveIntensity: 0, roughness: 0.08, metalness: 0.2 })), 0.8);
const CLOUD = matte('#ffffff', { transparent: true, opacity: 0.9 });
// Dojo (black belt): black lacquer, lead-grey tiles, vermilion, dark wood, paper that lights up at
// night, red lanterns (not blinking) and the golden tip that glows
const LACQUER = matte('#141418', { roughness: 0.38, metalness: 0.15, envMapIntensity: 0.6 }), TILES = matte('#2a2e36', { roughness: 0.7 });
const VERMILION = matte('#b8322a', { roughness: 0.6 }), WOOD = matte('#2a211c'), DECK = matte('#6b4b2e'), STONE_D = matte('#9a948a');
// the mayor's rally: stage, podium, cream stripes, speakers and bunting
const STAGE = matte('#8a5a32'), PODIUM = matte('#5a3a20'), CREAM = matte('#e9e2c6'), SPEAKER = matte('#15181d', { roughness: 0.6 });
const BUNTING = ['#e8463a', '#f2c14e', '#3d7bd9', '#7bc043'].map((h) => matte(h));
const SAND = matte('#e8e0cc'), ROCK = matte('#4d5058'), SAKURA = matte('#f0a2c0', { roughness: 0.95, envMapIntensity: 0.2 }), TRUNK = matte('#5a4030');
const POND = matte('#4b9ad6', { roughness: 0.15, metalness: 0.1 });
const PAPER = nightly(reg(new THREE.MeshStandardMaterial({ color: '#d8c7a0', emissive: '#ffb45a', emissiveIntensity: 0, roughness: 0.9 })), 1.3);
const LANTERN = nightly(glowMat('#e03b2e'), 2.2);
const GOLD_GLOW = nightly(reg(new THREE.MeshStandardMaterial({ color: '#e3c25a', emissive: '#ffb84a', emissiveIntensity: 0, roughness: 0.35, metalness: 0.7, envMapIntensity: 0.9 })), 0.7);
// the Corporate District: graphite glass, black and gold (the Mega Builders' colors)
const HQ_GLASS = '#56616f', INK = matte('#16181d', { roughness: 0.5, metalness: 0.2 });

// Facade tiles: 4 windows × 4 floors per style, with the lit windows drawn at random (emission
// map). The facade is white so the material tints it with the building's color.
let maxAniso = 4;
export const setAnisotropy = (n) => (maxAniso = n);
const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t; };
const tiles = {};
function windowTile(st, variant, glass) {
  const key = `${st}${variant}${glass}`;
  if (tiles[key]) return tiles[key];
  const cv = document.createElement('canvas'), em = document.createElement('canvas'); cv.width = cv.height = em.width = em.height = 256;
  const x = cv.getContext('2d'), e = em.getContext('2d'), r = seed(key);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256); e.fillStyle = '#000'; e.fillRect(0, 0, 256, 256);
  if (st === 'pagoda') { // black lacquer with paper lattices, all lit (the hours shader decides which ones glow)
    x.fillStyle = '#141418'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const wx = i * 64 + 17, wy = j * 64 + 15, w = 30, h = 34;
      x.fillStyle = '#d8c7a0'; x.fillRect(wx, wy, w, h);
      x.fillStyle = '#3a2f22'; x.fillRect(wx + w / 2 - 1, wy, 2, h); x.fillRect(wx, wy + h / 2 - 1, w, 2);
      e.fillStyle = '#ffe2b0'; e.fillRect(wx, wy, w, h);
    }
    return (tiles[key] = { map: tex(cv), emissive: tex(em) });
  }
  if (st === 'brick') { x.strokeStyle = 'rgba(0,0,0,.07)'; x.lineWidth = 1; for (let y = 4; y < 256; y += 8) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); } }
  const CW = 64, RH = 64;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const px = i * CW, py = j * RH;
    let wx, wy, w, h;
    if (glass) { // glass bands: wide window and a thin mullion
      wx = px + 3; wy = py + 7; w = CW - 6; h = RH - 14;
      x.fillStyle = '#4e739a'; x.fillRect(wx, wy, w, h);
      x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(wx, wy, w * 0.42, h);
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(wx, wy + h - 3, w, 3);
    } else {
      w = st === 'deco' ? 20 : 26; h = st === 'brick' ? 32 : 28; wx = px + (CW - w) / 2; wy = py + (RH - h) / 2 + 4;
      if (st === 'brick') { x.fillStyle = '#f3ece0'; x.fillRect(wx - 4, wy - 4, w + 8, h + 8); }
      x.fillStyle = '#2f4a66'; x.fillRect(wx, wy, w, h);
      x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(wx, wy, w * 0.45, h * 0.5);
      x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(wx, wy + h, w, 3);
    }
    if (r() < 0.5) { e.fillStyle = ['#ffffff', '#ffe6b8', '#fff6e0'][Math.floor(r() * 3)]; e.fillRect(wx, wy, w, h); }
  }
  if (st === 'deco') { x.fillStyle = 'rgba(201,154,46,.6)'; for (let j = 0; j < 4; j++) x.fillRect(0, j * RH, 256, 3); }
  if (glass) { x.fillStyle = 'rgba(20,40,70,.22)'; for (let i = 0; i < 4; i++) x.fillRect(i * CW, 0, 2, 256); }
  return (tiles[key] = { map: tex(cv), emissive: tex(em) });
}
// Windows lit by the hours of use: the building's whole height stands for the 24 hours, from the
// bottom (early morning) to the top (night), and the rows of the hours the person used light up.
// The bits go in aHours (3 bytes, one per 8 hours; w = how much it lights without hours) and the
// height in aH.
function hoursShader(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aHours; attribute float aH; varying vec4 vHours; varying float vH;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHours = aHours; vH = aH;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vHours; varying float vH;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float hr = floor(clamp(vMapUv.y * ${TILE_H.toFixed(1)} / max(vH, 1.0), 0.0, 0.999) * 24.0);
        float byte = hr < 8.0 ? vHours.x : (hr < 16.0 ? vHours.y : vHours.z);
        float bit = mod(floor(byte / pow(2.0, mod(hr, 8.0))), 2.0);
        float f = (vHours.x + vHours.y + vHours.z) > 0.0 ? mix(0.06, 1.0, bit) : vHours.w;
        totalEmissiveRadiance *= f;
      }`);
}
const facadeCache = new Map();
function facadeMat(st, variant, glass, hex) {
  const key = `${st}${variant}${glass}${hex}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const { map, emissive } = windowTile(st, variant, glass);
  const m = nightly(reg(new THREE.MeshStandardMaterial({
    color: hex, map, emissiveMap: emissive, emissive: new THREE.Color(WINDOW_GLOW[st] ?? '#ffd27a'), emissiveIntensity: 0,
    roughness: glass ? 0.22 : st === 'pagoda' ? 0.45 : 0.8, metalness: glass ? 0.45 : st === 'pagoda' ? 0.12 : 0, envMapIntensity: glass ? 1 : st === 'pagoda' ? 0.5 : 0.3,
  })), 1.5);
  m.userData.facade = true; m.onBeforeCompile = hoursShader; m.customProgramCacheKey = () => 'hours';
  facadeCache.set(key, m);
  return m;
}
// The same lacquer with paper, without the hours: for the monuments' pagodas (they belong to nobody)
let pagodaPlain = null;
function pagodaSide() {
  if (!pagodaPlain) { const { map, emissive } = windowTile('pagoda', 0, false); pagodaPlain = nightly(reg(new THREE.MeshStandardMaterial({ color: '#ffffff', map, emissiveMap: emissive, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0, roughness: 0.45, metalness: 0.12, envMapIntensity: 0.5 })), 1.2); }
  return pagodaPlain;
}

// ───────── geometries (all non-indexed, to merge) ─────────
const NI = (g) => (g.index ? g.toNonIndexed() : g);
const pickR = (r, a) => a[Math.floor(r() * a.length)];
function slice(g, ranges) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name], item = a.itemSize, parts = ranges.map(([s, e]) => a.array.subarray(s * item, e * item));
    const arr = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
    for (const p of parts) { arr.set(p, o); o += p.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, item));
  }
  return out;
}
// A box with its base at y = 0, split into sides (with UVs at world scale: one tile =
// TILE_W × TILE_H) and caps (top and bottom).
function boxParts(w, h, d, y0 = 0) { // y0: the base height, so the windows run on from one block to the next
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let i = 0; i < 24; i++) { const face = i >> 2; if (face === 2 || face === 3) continue; const fw = face < 2 ? d : w; uv.setXY(i, uv.getX(i) * fw / TILE_W, (uv.getY(i) * h + y0) / TILE_H); }
  g.translate(0, h / 2, 0);
  const n = g.toNonIndexed(); // 36 vertices: +x, -x, +y, -y, +z, -z
  return { sides: slice(n, [[0, 12], [24, 36]]), caps: slice(n, [[12, 24]]) };
}
const boxGeo = (w, h, d) => NI(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
const cylGeo = (rt, rb, h, seg = 12) => NI(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0));
const sphGeo = (r, seg = 10) => NI(new THREE.SphereGeometry(r, seg, seg));
const coneGeo = (r, h, seg = 4) => NI(new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0));
const torusFlat = (R, r, s1 = 8, s2 = 32) => NI(new THREE.TorusGeometry(R, r, s1, s2).rotateX(Math.PI / 2));
// gable roof: a triangular prism, with the ridge along z
function gableGeo(w, d, rh) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}
// curved pagoda eave: a 4-sided lathe with a concave profile (the corners go up), stretched for
// rectangular footprints; the base is at y = 0 and the eave reaches ov past the wall
function eaveGeo(w, d, ov, hgt) {
  const s = d / 2 + ov, R = s * Math.SQRT2, pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(t * R, hgt * Math.pow(1 - t, 1.9))); }
  pts.push(new THREE.Vector2(R, -0.16), new THREE.Vector2(0, -0.16));
  const g = new THREE.LatheGeometry(pts, 4, Math.PI / 4).toNonIndexed();
  g.computeVertexNormals();
  g.scale((w / 2 + ov) / s, 1, 1);
  return g;
}
const oddClamp = (n, lo, hi) => { n = Math.max(lo, Math.min(hi, Math.round(n))); return n % 2 ? n : n + 1 <= hi ? n + 1 : n - 1; };

// Geometries batched by material; build() returns one mesh per material.
export class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, ry = 0, s = null) {
    const g = geo.clone();
    if (s) g.scale(s[0], s[1], s[2]);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }
  build(shadow = true) {
    const out = [];
    for (const [mat, list] of this.groups) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = shadow; m.receiveShadow = shadow; out.push(m);
      for (const g of list) g.dispose();
    }
    this.groups.clear();
    return out;
  }
}

// ───────── signs drawn on a canvas ─────────
// The rally's banner, the headquarters' name and the foundation's board: one material per text, kept
// between readings (the scene is rebuilt whenever a building gains a floor) and freed when a reading
// no longer draws it (sweepSigns, after each build), so a TV that runs all day does not pile up textures.
const signCache = new Map();
let signUsed = new Set();
function signMat(key, w, h, draw, glow = 1.3) {
  signUsed.add(key);
  let m = signCache.get(key);
  if (!m) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    m = nightly(reg(new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.7 })), glow);
    signCache.set(key, m);
  }
  return m;
}
export function sweepSigns() {
  for (const [key, m] of signCache) {
    if (signUsed.has(key)) continue;
    signCache.delete(key); mats.delete(m); m.map?.dispose(); m.dispose();
    const i = lit.findIndex((x) => x.m === m); if (i >= 0) lit.splice(i, 1);
  }
  signUsed = new Set();
}
const fitFont = (c, text, max, size, min = 12) => { let s = size; c.font = `900 ${s}px Nunito, "Segoe UI", sans-serif`; while (c.measureText(text).width > max && s > min) { s -= 2; c.font = `900 ${s}px Nunito, "Segoe UI", sans-serif`; } return text; };

// ───────── the kit ─────────
// hOf(b): the building's height in the world (the scale lives in main.js). In each call, x and z are
// the lot's center; what moves comes back in anims; the lot's trees go into trees.
// colorOf(b): on the data maps, the building's color (no windows); null on the normal map.
// The crane's jib: two meshes (yellow and dark) made once and instanced for every crane.
let jibParts = null;
export function craneJib() {
  if (!jibParts) {
    const jb = new Batcher();
    jb.add(boxGeo(14, 0.5, 0.5), SCAFFOLD, 4, 0, 0); jb.add(boxGeo(1.2, 1, 1.2), SCAFFOLD, 1, -0.5, 0);
    jb.add(boxGeo(0.5, 0.5, 0.5), DARK, -3, 0, 0); jb.add(cylGeo(0.04, 0.04, 6, 4), DARK, 8, -6, 0); jb.add(boxGeo(1.2, 1.2, 1.2), DARK, 8, -7, 0);
    jibParts = jb.build().map((m) => ({ geometry: m.geometry, material: m.material }));
  }
  return jibParts;
}

export function makeKit(batch, hOf, wkOf, colorOf = null) {
  const B = (geo, mat, x, y, z, ry, s) => batch.add(geo, mat, x, y, z, ry, s);
  let cur = null; // the building being made: its hours of use and height, for the windows (aHours, aH)
  const bx = (w, h, d, side, roof, x, y, z, ry = 0) => {
    const facade = !!side.userData.facade, { sides, caps } = boxParts(w, h, d, facade ? y : 0);
    if (facade && cur) {
      const n = sides.attributes.position.count, hrs = new Float32Array(n * 4), hh = new Float32Array(n);
      for (let i = 0; i < n; i++) { hrs.set(cur.hours, i * 4); hh[i] = cur.H; }
      sides.setAttribute('aHours', new THREE.BufferAttribute(hrs, 4)); sides.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
    }
    B(sides, side, x, y, z, ry); B(caps, roof, x, y, z, ry);
  };
  const anims = [], trees = [], marks = [], cranes = [];

  function tower(b, c, x, z) {
    const r = seed(b.id + c.id), pick = (a) => a[Math.floor(r() * a.length)];
    const f = b.floors, t = tier(f), k = kind(f), st = c.style, h = hOf(b), ruin = ruinOf(b), fire = ruin === 'fire' && !colorOf;
    if (ruin === 'rubble') return rubble(b, x, z, colorOf ? colorOf(b) : pick(STYLE_PAL[st][t]), false, r);
    // Dojo black belt: a black pagoda (the giants keep their shape, with the palette and a pagoda on the podium)
    const dojo = b.belt === 'black' && !colorOf, giant = k === 'supertower' || k === 'cloudTower' || k === 'orbitalTower' || k === 'spaceElevator';
    const hex = colorOf ? colorOf(b) : fire ? shade(pick(STYLE_PAL[st][t]), 0.5) : pick(STYLE_PAL[st][t]); // on fire: soot
    const glass = GLASSY.has(st) || (st === 'concrete' && t !== 'building' && r() < 0.6);
    const side = colorOf ? matte(hex) : dojo ? facadeMat('pagoda', 0, false, '#ffffff') : facadeMat(st, Math.floor(r() * 3), glass, hex), roof = dojo ? LACQUER : matte(shade(hex, 0.72));
    const mask = b.hours || 0;
    cur = { hours: [mask & 255, (mask >> 8) & 255, (mask >> 16) & 255, fire ? 0 : b.now ? 1 : b.today > 0 ? 0.6 : 0.15], H: h };
    if (dojo && !giant) {
      const out = pagodaTower(b, x, z, h, side, r); cur = null;
      if (fire) marks.push({ kind: 'fire', x, z, h: out.h, w: L * 0.45, d: L * 0.45, bw: L * 0.74, bd: L * 0.74, by0: 1, by1: out.h * 0.7 });
      return out;
    }
    // footprint: setback from the lot and shape (square, rectangular slab, L-shaped or on a podium)
    const inset = 0.1 + r() * 0.08; let w = L * (1 - 2 * inset), d = w;
    const shape = dojo ? 'square' : pick(k === 'building' ? ['square', 'slab', 'L', 'square', 'slab'] : k === 'tower' ? ['square', 'slab', 'podium', 'square'] : ['square', 'podium', 'square']);
    if (shape === 'slab') { if (r() < 0.5) w *= 0.6 + r() * 0.15; else d *= 0.6 + r() * 0.15; }
    const secs = st === 'deco' && (k === 'tower' || k === 'skyscraper') ? DECO_SECTIONS : SECTIONS[k];
    let y = 0, topW = w, topD = d;
    if (shape === 'podium') { const ph = Math.min(h * 0.14, 6); bx(L * 0.84, ph, L * 0.84, side, roof, x, 0, z); y = ph; w *= 0.7; d *= 0.7; }
    if (dojo) { const ph = Math.min(h * 0.2, 18); pagodaBody(x, z, ph, side, { tiers: 3, sorin: false, w0: L * 0.8 }); y = ph; w *= 0.68; d *= 0.68; }
    const ins0 = secs[0][0], body = { bw: w, bd: d, by0: y, by1: Math.max(y + 1, h * secs[0][1]) }; // the first block: where the windows burn
    for (const [ins, frac] of secs) {
      const s = 1 - (ins - ins0) * 2.2, y1 = Math.max(y + 1, h * frac), sw = w * s, sd = d * s;
      bx(sw, y1 - y, sd, side, roof, x, y, z);
      if (st === 'deco' && y > 0 && !dojo) B(boxGeo(sw + 0.6, 0.4, sd + 0.6), GOLD_MAT, x, y, z);
      if (dojo) for (let yy = y + 6; yy < y1 - 3; yy += 9) B(boxGeo(sw + 0.5, 0.5, sd + 0.5), VERMILION, x, yy, z); // red bands
      topW = sw; topD = sd; y = y1;
    }
    if (shape === 'L') bx(w * 0.5, h * (0.55 + r() * 0.3), d * 0.5, side, roof, x + w * 0.32, 0, z + d * 0.32);
    // the street level: a ledge over the ground floor, the doors and a canopy on the front
    if (!colorOf && !dojo) {
      const bw0 = shape === 'podium' ? L * 0.84 : body.bw, bd0 = shape === 'podium' ? L * 0.84 : body.bd, fz = z + bd0 / 2, trim = TRIM; // one material for every building: a tint per facade would be one more mesh per color
      B(boxGeo(bw0 + 0.14, 0.2, bd0 + 0.14), trim, x, 1.55, z);
      B(boxGeo(Math.min(2.2, bw0 * 0.4), 1.3, 0.1), DARK, x, 0, fz + 0.03);
      B(boxGeo(Math.min(3, bw0 * 0.54), 0.14, 1), trim, x, 1.42, fz + 0.5);
      if (fire && r() < 0.4) fireTruck(x + L * 0.26, z + L * 0.47, r); // the firefighters are at some of the fires
    }
    // this week's floors: the top in yellow, with scaffolding
    const wk = Math.min(h - 1.5, wkOf(b));
    if (wk >= 0.8) bx(topW + 0.25, wk, topD + 0.25, SCAFFOLD, SCAFFOLD_TOP, x, h - wk, z);
    crownOf(b, k, st, t, h, topW, topD, hex, side, r, pick, x, z);
    roofBits(b, h, topW, topD, r, x, z);
    if (k === 'cloudTower') marks.push({ kind: 'beacon', x, y: h + 4.5, z });
    if (k === 'spaceElevator') marks.push({ kind: 'cable', x, y: h + 3, z, seed: r() * 6 });
    if (fire) marks.push({ kind: 'fire', x, z, h, w: topW, d: topD, ...body });
    cur = null;
    return { h };
  }
  // The crown of each type: golden spire (supertower), beacon and clouds (cloud tower), ring
  // (orbital), cable to the sky (elevator), art deco steps, machine room, antenna, water tank…
  function crownOf(b, k, st, t, h, w, d, hex, side, r, pick, x, z) {
    const mini = Math.min(w, d);
    if (k === 'supertower') { B(boxGeo(mini * 0.5, 2.5, mini * 0.5), GOLD_MAT, x, h, z); B(coneGeo(0.6, 12, 8), GOLD_MAT, x, h + 2.5, z); B(sphGeo(0.6, 8), WARM_LIGHT, x, h + 14.5, z); }
    else if (k === 'cloudTower') {
      B(boxGeo(mini * 0.45, 3, mini * 0.45), SILVER, x, h, z); B(sphGeo(1.4, 10), BEACON, x, h + 4.5, z);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B(sphGeo(2 + r() * 1.5, 8), CLOUD, x + Math.cos(a) * mini * 0.95, h * 0.55, z + Math.sin(a) * mini * 0.95, 0, [1, 0.55, 1]); }
    } else if (k === 'orbitalTower' || k === 'spaceElevator') {
      B(torusFlat(mini * 0.95, 0.7, 10, 40), SILVER, x, h * 0.78, z);
      B(boxGeo(mini * 0.45, 3, mini * 0.45), SILVER, x, h, z);
      B(sphGeo(1.2, 10), SILVER, x + mini * 0.2, h + 3.4, z, 0, [1, 0.3, 1]);
      if (k === 'spaceElevator') B(cylGeo(0.35, 0.35, 1500, 6), SILVER, x, h + 3, z); else B(sphGeo(0.5, 6), RED_LIGHT, x, h + 5, z);
    } else if (t === 'skyscraper') {
      if (st === 'deco') { let y = h, s = 1; for (let i = 0; i < 3; i++) { s *= 0.68; bx(w * s, 2.2, d * s, side, GOLD_MAT, x, y, z); y += 2.2; } B(coneGeo(0.5, 9, 6), GOLD_MAT, x, y, z); B(sphGeo(0.45, 6), WARM_LIGHT, x, y + 9.3, z); }
      else { B(boxGeo(w * 0.5, 2.6, d * 0.5), DARK, x, h, z); B(cylGeo(0.12, 0.35, 11, 6), SILVER, x, h + 2.6, z); B(sphGeo(0.45, 6), RED_LIGHT, x, h + 13.8, z); }
    } else if (t === 'tower') {
      const v = pick(['tank', 'antenna', 'crown', 'pyramid']);
      if (v === 'tank') B(boxGeo(w * 0.42, 1.8, d * 0.42), DARK, x + w * 0.12, h, z - d * 0.1);
      else if (v === 'antenna') { B(cylGeo(0.1, 0.25, 7, 6), SILVER, x + w * 0.25, h, z + d * 0.2); B(sphGeo(0.35, 6), RED_LIGHT, x + w * 0.25, h + 7.2, z + d * 0.2); }
      else if (v === 'crown') B(boxGeo(w + 0.5, 0.9, d + 0.5), matte(shade(hex, 1.12)), x, h, z);
      else B(coneGeo(Math.max(w, d) * 0.62, Math.min(w, d) * 0.45, 4), matte(shade(hex, 0.9)), x, h, z, Math.PI / 4);
    } else { // building
      if (r() < 0.4) { const tx = x + w * 0.22, tz = z - d * 0.2; B(cylGeo(0.9, 0.9, 1.6, 10), matte('#9aa0a6'), tx, h + 0.4, tz); B(coneGeo(0.95, 0.5, 10), matte('#7d848c'), tx, h + 2, tz); for (const [a, bb] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(cylGeo(0.07, 0.07, 0.4, 4), DARK, tx + a * 0.5, h, tz + bb * 0.5); }
      if (r() < 0.45) B(boxGeo(w + 0.3, 0.5, d + 0.3), matte(shade(hex, 1.08)), x, h, z);
      if (r() < 0.3) B(boxGeo(1.6, 1, 1.2), matte('#aeb4ba'), x - w * 0.25, h, z + d * 0.22);
    }
  }
  const TRIM = matte('#4a545e');
  // A fire truck at the door of a burning building: the red body, the cab, the ladder raised to the
  // facade and a blue light (static: it goes into the merged mesh).
  function fireTruck(x, z, r) {
    const red = matte('#c8302b'), a = (r() - 0.5) * 0.5;
    B(boxGeo(2.9, 1.0, 1.15), red, x, 0.25, z, a); B(boxGeo(0.9, 0.75, 1.1), matte('#e8eaec'), x - Math.cos(a) * 0.95, 1.2, z + Math.sin(a) * 0.95, a);
    const ladder = NI(boxGeo(0.16, 4.2, 0.5)); ladder.rotateX(0.75);
    B(ladder, SILVER, x + 0.4, 1.2, z - 0.2, a); B(sphGeo(0.16, 6), RED_LIGHT, x - Math.cos(a) * 0.95, 1.98, z + Math.sin(a) * 0.95);
    for (const s of [-1, 1]) B(cylGeo(0.26, 0.26, 0.2, 8), DARK, x + s * 0.9, 0.26, z + 0.55, 0, [1, 1, 1]);
  }
  // On the roof, what tells the story: helipad (biggest build of the week; golden in the region),
  // garden (5 workdays in a row), antenna (used today; green if using it now), neon sign (night
  // owl), crane (building now), balloons (newcomer) and the flag of whoever is in more cities.
  function roofBits(b, h, w, d, r, x, z) {
    const mini = Math.min(w, d);
    if (b.heli) { B(cylGeo(mini * 0.36, mini * 0.36, 0.25, 20), DARK, x, h, z); B(torusFlat(mini * 0.28, 0.14, 6, 30), b.heli === 2 ? GOLD_MAT : matte('#f4f6f8'), x, h + 0.28, z); }
    if (b.record && !b.heli) { // an infinity pool: today is the person's best day
      B(boxGeo(w * 0.72, 0.22, d * 0.5), matte('#f4f6f8'), x, h, z); B(boxGeo(w * 0.64, 0.24, d * 0.4), matte('#39b6e8', { roughness: 0.15, metalness: 0.2 }), x, h + 0.02, z);
      B(boxGeo(0.5, 0.18, 1.2), matte('#e8c56a'), x - w * 0.24, h, z + d * 0.33); B(boxGeo(0.5, 0.18, 1.2), matte('#e86a6a'), x + w * 0.02, h, z + d * 0.33);
    } else if (b.beltUp && !b.heli) { // a zen garden: a new belt this week
      B(boxGeo(w * 0.78, 0.16, d * 0.78), matte('#e9dfc6'), x, h, z);
      B(NI(new THREE.DodecahedronGeometry(0.42, 0)), matte('#7d7f84'), x - w * 0.2, h + 0.1, z + d * 0.14, 0.6, [1.3, 0.8, 1]); B(NI(new THREE.DodecahedronGeometry(0.28, 0)), matte('#8c8e92'), x + w * 0.08, h + 0.1, z + d * 0.24, 1.2);
      B(cylGeo(0.09, 0.12, 1.1, 5), matte('#5a3d2a'), x + w * 0.2, h + 0.16, z - d * 0.18); B(sphGeo(0.7, 7), matte('#f2a7c3'), x + w * 0.2, h + 1.5, z - d * 0.18, 0, [1, 0.8, 1]);
    } else if (b.streak >= 5 && !b.heli) { B(boxGeo(w * 0.8, 0.2, d * 0.8), matte('#6fae4f'), x, h, z); for (const [u, v] of [[0.25, 0.25], [-0.25, 0.3], [0.2, -0.28]]) { B(cylGeo(0.12, 0.12, 0.8, 5), matte('#6b4b2e'), x + w * u, h + 0.2, z + d * v); B(sphGeo(0.75, 8), matte('#3f8f4a'), x + w * u, h + 1.3, z + d * v); } }
    if (b.today > 0) { B(cylGeo(0.06, 0.12, 4, 5), SILVER, x + w * 0.35, h, z - d * 0.3); B(sphGeo(0.3, 6), b.now ? GREEN_LIGHT : WARM_LIGHT, x + w * 0.35, h + 4.2, z - d * 0.3); }
    if (b.night >= 2) { B(boxGeo(w * 0.5, 1.4, 0.2), matte('#3a2a40'), x - w * 0.15, h, z + d * 0.4); B(boxGeo(w * 0.46, 1.1, 0.1), PINK, x - w * 0.15, h + 0.15, z + d * 0.45); }
    if (b.now) crane(x - w * 0.3, h, z + w * 0.3, r);
    if (b.isNew || b.back) balloons(x, h, z); // a newcomer, or back today after the building had caught fire
    flagFor(b, x + w * 0.32, h, z + d * 0.32);
  }
  // whoever builds in more cities: the network's golden flag (with a tip from 3 cities); a Mega
  // Builder's is a black and golden banner with a diamond
  function flagFor(b, x, h, z) {
    if (!(b.cities > 1)) return;
    if (b.mega && !colorOf) megaFlag(x, h, z); else flag(x, h, z, b.cities >= 3);
  }
  function megaFlag(x, h, z) {
    B(cylGeo(0.09, 0.09, 6.2, 6), GOLD_MAT, x, h, z); B(sphGeo(0.32, 6), GOLD_GLOW, x, h + 6.35, z);
    B(boxGeo(2.6, 1.5, 0.08), INK, x + 1.3, h + 4.4, z);
    B(boxGeo(2.6, 0.22, 0.1), GOLD_MAT, x + 1.3, h + 4.4, z); B(boxGeo(2.6, 0.22, 0.1), GOLD_MAT, x + 1.3, h + 5.68, z);
    B(NI(new THREE.OctahedronGeometry(0.42)), GOLD_GLOW, x + 1.3, h + 5.15, z + 0.08, 0, [1, 1.3, 0.35]);
  }
  // The mast goes into the merged mesh; the jib (which turns) becomes an instance of two meshes
  // shared by all cranes (main.js builds and animates them): with a thousand cranes, two meshes per
  // jib would be two thousand draw calls per frame.
  function crane(x, y, z, r) {
    B(boxGeo(0.7, 12, 0.7), SCAFFOLD, x, y, z);
    cranes.push({ x, y: y + 12, z, rot: r() * 6, speed: 0.15 + r() * 0.2 });
  }
  function balloons(x, h, z) {
    [['#e8434b', -1.2], ['#3d7bd9', 0], ['#f2c14e', 1.2]].forEach(([c, dx], i) => { B(sphGeo(0.7, 8), matte(c), x + dx, h + 5 + (i % 2) * 1.2, z + 0.4 * (i - 1), 0, [1, 1.25, 1]); B(cylGeo(0.02, 0.02, 4.5 + (i % 2) * 1.2, 3), DARK, x + dx * 0.9, h + 0.6, z + 0.3 * (i - 1)); });
  }
  function flag(x, h, z, corp) {
    B(cylGeo(0.08, 0.08, 5.5, 5), SILVER, x, h, z); B(boxGeo(2.4, 1.4, 0.08), GOLD_MAT, x + 1.2, h + 4, z);
    if (corp) B(coneGeo(0.7, 1.2, 5), GOLD_MAT, x, h + 5.5, z);
  }

  // Houses: single-story, townhouse, with pool and condo (two houses and a wall). Tiled roof in the
  // village and solar panels in the megalopolis; a door and windows on each block.
  function house(b, c, x, z) {
    const r = seed(b.id + c.id), pick = (a) => a[Math.floor(r() * a.length)];
    const ruin = ruinOf(b), fire = ruin === 'fire' && !colorOf, soot = (hex) => (fire ? shade(hex, 0.5) : hex);
    if (ruin === 'rubble') return rubble(b, x, z, colorOf ? colorOf(b) : pick(PAL.house), true, r);
    if (b.belt === 'black' && !colorOf) { // black belt: a dark wooden house
      const out = woodHouse(b, x, z, r);
      if (fire) marks.push({ kind: 'fire', x, z, h: 4.6, w: 5, d: 4.4, house: true });
      return out;
    }
    const k = kind(b.floors), st = c.style, hh = HOUSE_H[k];
    const wall = matte(colorOf ? colorOf(b) : soot(pick(PAL.house))), roofM = colorOf ? matte(shade(colorOf(b), 0.8)) : matte(soot(st === 'brick' ? pick(PAL.tile) : WINDOW_GLOW[st] ? pick(PAL.solar) : pick(PAL.roof)), WINDOW_GLOW[st] ? { roughness: 0.3, metalness: 0.4 } : {}); // solar roofs from the Megalopolis on
    const door = matte('#7a5235');
    const units = k === 'condo' ? [[-2.3, 0.4, 3.4, 4.4], [2.3, 0.4, 3.4, 4.4]] : k === 'poolHouse' ? [[-0.9, -1.4, 5.2, 4.8]] : [[0, 0, 6, 5]];
    const walls = hh - 1.6;
    for (const [ux, uz, uw, ud] of units) {
      B(boxGeo(uw, walls, ud), wall, x + ux, 0, z + uz);
      const across = r() < 0.5;
      B(gableGeo((across ? ud : uw) + 0.7, (across ? uw : ud) + 0.7, 1.7), roofM, x + ux, walls, z + uz, across ? Math.PI / 2 : 0);
      B(boxGeo(0.9, 1.7, 0.12), door, x + ux - uw * 0.25, 0, z + uz + ud / 2 + 0.02);
      for (let i = 0; i < 2; i++) { B(boxGeo(0.9, 0.8, 0.12), HOUSE_GLASS, x + ux + uw * 0.2 + i * 1.1 - 0.5, 1.1, z + uz + ud / 2 + 0.02); B(boxGeo(0.12, 0.8, 0.9), HOUSE_GLASS, x + ux + uw / 2 + 0.02, 1.1 + (k !== 'house' ? i * 2.2 : 0), z + uz - ud * 0.2 + i * 1.2); }
    }
    if (k === 'poolHouse') { B(boxGeo(3.6, 0.25, 2.4), matte('#e9eef2'), x + 2.1, 0, z + 2.3); B(boxGeo(3.1, 0.3, 1.9), POOL, x + 2.1, 0.02, z + 2.3); }
    if (k === 'condo') { const wallM = matte('#d9d2c2'); B(boxGeo(L * 0.84, 0.9, 0.3), wallM, x, 0, z + L * 0.42); B(boxGeo(0.3, 0.9, L * 0.84), wallM, x + L * 0.42, 0, z); B(boxGeo(0.3, 0.9, L * 0.84), wallM, x - L * 0.42, 0, z); }
    if (b.streak >= 5) for (let i = 0; i < 5; i++) B(sphGeo(0.28, 6), matte(['#e8463a', '#f2c14e', '#ff9cf3', '#ffffff', '#e8463a'][i]), x - L * 0.4 + i * 0.7, 0.25, z + L * 0.42);
    if (b.night >= 2) for (let i = 0; i <= 5; i++) B(sphGeo(0.16, 5), [PINK, CYAN, WARM_LIGHT][i % 3], x - 2.5 + i, hh + 0.2, z);
    for (let i = 0; i < 1 + Math.floor(r() * 2); i++) trees.push({ x: x + (r() < 0.5 ? -1 : 1) * L * 0.4, z: z - L * 0.38 + r() * L * 0.3, s: 0.55 + r() * 0.3 });
    if (b.now) crane(x - 2, hh, z + 2, r);
    if (b.isNew) balloons(x, hh, z);
    flagFor(b, x + 1.3, hh - 0.5, z + 1.3);
    if (fire) marks.push({ kind: 'fire', x, z, h: hh, w: 5, d: 4, house: true });
    return { h: hh };
  }

  // Rubble: more than idle.rubble days without Claude. A scorched slab, a heap of concrete and
  // facade chunks, a broken wall with empty windows (the buildings) or the fallen roof (the houses)
  // and twisted beams. Low, so it leaves the skyline, but still a lot you can touch.
  function rubble(b, x, z, hex, isHouse, r) {
    const flat = !!colorOf; // the data maps: the person's color, no soot
    const ash = matte(flat ? shade(hex, 0.85) : '#4b4743'), conc = matte(flat ? hex : '#8f897f'), concD = matte(flat ? shade(hex, 0.9) : '#6c675f'), black = matte(flat ? shade(hex, 0.7) : '#2f2c2a');
    const wallM = matte(flat ? hex : shade(hex, 0.62)), rust = matte(flat ? shade(hex, 0.75) : '#70452f');
    const big = isHouse ? 0.7 : clamp(0.95 + b.floors / 1500, 0.95, 1.45); // a bigger building leaves a bigger heap
    const R = 3.4 * big, H = (isHouse ? 1.2 : 2.2) * big, cx = x + (r() - 0.5) * 1.2, cz = z + 0.6 + (r() - 0.5) * 1.2;
    B(boxGeo(L * 0.88, 0.22, L * 0.88), ash, x, 0, z);
    const lump = NI(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0, n = isHouse ? 4 : 7; i < n; i++) { // the heap: broken lumps, half buried
      const a = r() * Math.PI * 2, d = i ? r() * R * 0.6 : 0, s = R * (i ? 0.3 + r() * 0.25 : 0.55);
      B(lump, r() < 0.5 ? conc : concD, cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, r() * 3, [s, s * (H / R) * 1.5, s * (0.8 + r() * 0.4)]);
    }
    const pieces = [conc, concD, wallM, black, wallM, conc];
    for (let i = 0, n = isHouse ? 14 : 28; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 1.15, s = (0.3 + r() * 0.65) * big;
      const g = boxGeo(s * (1 + r()), s * (0.35 + r() * 0.5), s * (0.8 + r()));
      g.rotateX((r() - 0.5) * 1.3); g.rotateZ((r() - 0.5) * 1.3);
      B(g, pieces[Math.floor(r() * pieces.length)], cx + Math.cos(a) * d, Math.max(0, H * (1 - (d / R) ** 2)) - s * 0.3, cz + Math.sin(a) * d, r() * Math.PI);
    }
    let top = H;
    if (isHouse) { // the roof on the ground, tilted, and what is left of two walls
      const roof = NI(gableGeo(5.4, 4.2, 1.5)); roof.rotateZ(0.32);
      B(roof, matte(flat ? shade(hex, 0.8) : shade(pickR(r, PAL.roof), 0.7)), x - 0.4, 0.2, z - 0.3, (r() - 0.5) * 0.8);
      B(boxGeo(3.6, 1.2 + r() * 0.8, 0.4), wallM, x - 1.4, 0, z - 2.4); B(boxGeo(0.4, 0.9 + r() * 0.7, 2.6), wallM, x - 3.1, 0, z - 1.1);
    } else { // a piece of facade still standing at the back, with a broken top and empty windows
      const ww = 4.4 + r() * 2, wh = Math.min(9, 3.4 + b.floors / 90), ry = (r() - 0.5) * 0.5, px = x - 1 + (r() - 0.5), pz = z - 2.7;
      const along = (u) => [px + Math.cos(ry) * u, pz - Math.sin(ry) * u];
      B(boxGeo(ww, wh, 0.6), wallM, px, 0, pz, ry);
      for (let i = -1; i <= 1; i++) { const [ax, az] = along((i * ww) / 3); B(boxGeo((ww / 3) * 0.98, 0.5 + r() * 1.9, 0.6), wallM, ax, wh, az, ry); }
      for (let row = 0; row < Math.floor((wh - 0.6) / 2.3); row++) for (let col = -1; col <= 1; col++) { const [ax, az] = along((col * ww) / 3.2); B(boxGeo(0.9, 1.1, 0.7), black, ax, 0.8 + row * 2.3, az, ry); }
      top = Math.max(H, wh + 1);
    }
    for (let i = 0, n = isHouse ? 2 : 4; i < n; i++) { // twisted beams
      const g = boxGeo(0.22, (2.2 + r() * 2.4) * big, 0.22); g.rotateX((r() - 0.5) * 1.5); g.rotateZ((r() - 0.5) * 1.5);
      B(g, rust, cx + (r() - 0.5) * R, H * 0.35, cz + (r() - 0.5) * R);
    }
    if (!flat) { // closed off and taken by weeds: striped trestles with a tape between them, and tufts around the heap
      const tz = z + L * 0.43, stripe = matte('#f2c14e'), weed = matte('#5f9e45');
      for (const s of [-1, 1]) { B(boxGeo(1.5, 0.2, 0.14), stripe, x + s * L * 0.28, 0.72, tz); for (const u of [-0.6, 0.6]) B(boxGeo(0.1, 0.72, 0.1), DARK, x + s * L * 0.28 + u, 0, tz); }
      B(boxGeo(L * 0.56 - 1.5, 0.07, 0.03), matte('#f5d54a'), x, 0.82, tz);
      for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2, dd = R * (1 + r() * 0.35); B(coneGeo(0.2 + r() * 0.2, 0.6 + r() * 0.6, 5), weed, x + Math.cos(a) * dd, 0.2, z + Math.sin(a) * dd); }
    }
    return { h: top };
  }

  // ───────── monuments (the city's rewards) ─────────
  // Each one takes 1×1 or 2×2 lots; x and z are the center of the set.
  function monument(m, n, x, z) {
    B(boxGeo(n * L * 0.92, 0.3, n * L * 0.92), STONE, x, 0, z);
    if (m.key === 'dojo') return dojoMon(m.level ?? n, n, x, z);
    if (m.key === 'obelisk') { B(boxGeo(4.4, 1.2, 4.4), STONE, x, 0.3, z); B(cylGeo(0.9, 1.5, 26, 4), matte('#ece6d6'), x, 1.5, z); B(coneGeo(1.1, 2.6, 4), GOLD_MAT, x, 27.5, z); B(sphGeo(0.5, 6), WARM_LIGHT, x, 30, z); }
    else if (m.key === 'mayor') rally(m, x, z);
    else if (m.key === 'leadershipStatue') { B(boxGeo(3.6, 2.5, 3.6), matte('#e2dccd'), x, 0.3, z); B(cylGeo(0.9, 1.2, 5.5, 8), PATINA, x, 2.8, z); B(sphGeo(0.8, 10), PATINA, x, 9, z); const arm = cylGeo(0.25, 0.25, 4.5, 6); arm.rotateZ(-0.5); B(arm, PATINA, x + 0.8, 7.5, z); B(sphGeo(0.6, 8), WARM_LIGHT, x + 2.9, 11.7, z); }
    else if (m.key === 'tvTower') { B(cylGeo(1.4, 2, 2, 10), STONE, x, 0.3, z); B(cylGeo(0.5, 0.9, 40, 8), matte('#e9e6df'), x, 2.3, z); B(sphGeo(3, 14), SILVER, x, 33, z, 0, [1, 0.7, 1]); B(cylGeo(0.1, 0.2, 10, 5), SILVER, x, 42, z); B(sphGeo(0.5, 6), RED_LIGHT, x, 52.3, z); }
    else if (m.key === 'fountainSquare') { B(cylGeo(3.4, 3.6, 0.8, 20), matte('#bdb6a6'), x, 0.3, z); B(cylGeo(3, 3, 0.4, 20), matte('#5aa7e0', { roughness: 0.1, metalness: 0.2 }), x, 1, z); B(cylGeo(0.5, 0.7, 1.6, 10), matte('#bdb6a6'), x, 1.3, z); B(coneGeo(0.5, 2.6, 8), matte('#bfe6ff', { transparent: true, opacity: 0.8 }), x, 2.9, z); }
    else if (m.key === 'centralPark') { B(boxGeo(n * L * 0.92, 0.1, n * L * 0.92), matte('#7cc35c'), x, 0.3, z); B(cylGeo(4.5, 4.5, 0.2, 24), matte('#4b9ad6', { roughness: 0.1 }), x + 2, 0.4, z + 3); for (const [u, v, s] of [[-6, -6, 1.3], [6, -5, 1.1], [-5, 6, 1.2], [7, 7, 0.9], [-1, -2, 1]]) trees.push({ x: x + u, z: z + v, s }); }
    else if (m.key === 'stadium') {
      const s = new THREE.Shape(); s.absellipse(0, 0, 8.5, 7, 0, Math.PI * 2); const hole = new THREE.Path(); hole.absellipse(0, 0, 6.3, 5, 0, Math.PI * 2); s.holes.push(hole);
      B(new THREE.ExtrudeGeometry(s, { depth: 4.5, bevelEnabled: false }).rotateX(-Math.PI / 2), matte('#c9c4b6'), x, 0.3, z);
      B(cylGeo(6.3, 6.3, 0.5, 24), matte('#c95a4f'), x, 0.3, z); B(cylGeo(5, 5, 0.6, 24), matte('#4fae53'), x, 0.3, z, 0, [1, 1, 0.75]);
      for (const [u, v] of [[-8, -7], [8, -7], [8, 7], [-8, 7]]) { B(cylGeo(0.15, 0.25, 14, 6), SILVER, x + u, 0.3, z + v); B(boxGeo(1.6, 0.8, 0.3), BEACON, x + u, 14, z + v); }
    } else if (m.key === 'ferrisWheel') {
      const hub = new THREE.Group(); hub.position.set(x, 10.5, z);
      const hb = new Batcher(); hb.add(NI(new THREE.TorusGeometry(8.5, 0.35, 8, 48)), matte('#e8eef3'));
      for (let i = 0; i < 12; i++) { const sp = cylGeo(0.12, 0.12, 8.5, 5); sp.rotateZ((i / 12) * Math.PI * 2 + Math.PI); hb.add(sp, SILVER); }
      for (const mm of hb.build()) hub.add(mm);
      const cabGeo = new THREE.BoxGeometry(1.4, 1.3, 1.1);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + Math.PI / 2, cab = new THREE.Mesh(cabGeo, matte(['#e8434b', '#3d7bd9', '#f2c14e', '#7bc043'][i % 4])); cab.position.set(Math.cos(a) * 8.5, Math.sin(a) * 8.5 - 0.6, 0); cab.castShadow = true; cab.userData.cabin = true; hub.add(cab); }
      anims.push({ kind: 'wheel', obj: hub, speed: 0.12 });
      for (const sgn of [-1, 1]) for (const zz of [-1.4, 1.4]) { const leg = cylGeo(0.3, 0.4, 11.4, 6); leg.rotateZ(sgn * 0.456); B(leg, matte('#8b94a0'), x + sgn * 5, 0.3, z + zz); }
    } else if (m.key === 'airport') {
      B(boxGeo(n * L * 1.1, 0.2, 5), DARK, x, 0.3, z - 4);
      for (let i = -4; i <= 4; i++) B(boxGeo(1.4, 0.05, 0.4), matte('#ffffff'), x + i * 2.4, 0.5, z - 4);
      B(boxGeo(8, 3.5, 5), matte('#e8e4dc'), x - 3, 0.3, z + 4); B(cylGeo(0.9, 1.1, 10, 8), matte('#d9d4c8'), x + 5, 0.3, z + 5); B(cylGeo(2, 1.4, 2, 8), matte('#7fc4e8', { roughness: 0.2 }), x + 5, 10.3, z + 5);
      const fus = cylGeo(0.5, 0.5, 5, 8); fus.rotateX(Math.PI / 2); B(fus, matte('#f4f6f8'), x - 4, 1, z - 6.5); B(boxGeo(6, 0.15, 1.2), matte('#f4f6f8'), x - 4, 1, z - 4); B(boxGeo(0.2, 1.4, 1.2), matte('#e8434b'), x - 4, 1, z - 1.8);
    }
  }

  // ───────── Dojo: the black belt's black pagoda and the city's Dojo ─────────
  // The pagoda's body: the height h is still the floors'; the tiers are odd, from 3 to 13. On each
  // tier, walls (side: the facade with the hours, or the plain one on monuments) with vermilion
  // pillars and balcony, a curved eave with lanterns at the corners; on top, the golden tip.
  function pagodaBody(x, z, h, side, { w0 = L * 0.74, tiers = null, platform = true, sorin = true } = {}) {
    const T = tiers ?? oddClamp(h / 5.5, 3, 13);
    let y = 0;
    if (platform) { B(boxGeo(w0 + 3.2, 0.25, w0 + 3.2), STONE_D, x, 0, z); B(boxGeo(w0 + 1.6, 0.6, w0 + 1.6), STONE, x, 0, z); y = 0.6; }
    const tierH = (h - y) / T, rh = Math.max(0.7, Math.min(2.4, tierH * 0.45)), bodyH = Math.max(0.6, tierH - rh * 0.55);
    let top = y, topW = w0, eaveY = y, ov = 1.5;
    for (let i = 0; i < T; i++) {
      const wi = w0 * Math.max(0.45, 1 - 0.055 * i); ov = Math.max(0.6, 1.5 * wi / w0);
      bx(wi, bodyH, wi, side, LACQUER, x, y, z);
      for (const [a, c2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(boxGeo(0.32, bodyH, 0.32), VERMILION, x + a * wi / 2, y, z + c2 * wi / 2);
      if (bodyH > 1.2) for (const [dx, dz, w, d] of [[0, wi / 2 + 0.45, wi + 1, 0.1], [0, -wi / 2 - 0.45, wi + 1, 0.1], [wi / 2 + 0.45, 0, 0.1, wi + 1], [-wi / 2 - 0.45, 0, 0.1, wi + 1]]) B(boxGeo(w, 0.45, d), VERMILION, x + dx, y + 0.25, z + dz);
      eaveY = y + bodyH; B(eaveGeo(wi, wi, ov, rh), TILES, x, eaveY, z);
      const lr = wi / 2 + ov - 0.5; for (const [a, c2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(cylGeo(0.26, 0.26, 0.5, 8), LANTERN, x + a * lr, eaveY - 0.55, z + c2 * lr);
      y = eaveY + rh * 0.55; top = eaveY + rh; topW = wi;
    }
    if (sorin) { const sh = Math.max(1.6, Math.min(6, h * 0.12)); B(cylGeo(0.14, 0.2, sh, 8), GOLD_GLOW, x, top - 0.1, z); for (let i = 0; i < 5; i++) B(torusFlat(0.55 - i * 0.07, 0.06, 6, 16), GOLD_GLOW, x, top + sh * (0.2 + i * 0.15), z); B(sphGeo(0.26, 8), GOLD_GLOW, x, top + sh + 0.1, z); top += sh + 0.4; }
    return { top, topW, eaveY, ov };
  }
  // The building of a black belt (from building to skyscraper): the pagoda instead of the tower.
  // What tells the story stays: this week's yellow scaffolding, crane, balloons and flag; the owl
  // becomes a big lantern in front. Helipad, garden and antenna go.
  function pagodaTower(b, x, z, h, side, r) {
    const { top, topW, eaveY, ov } = pagodaBody(x, z, h, side);
    const wk = Math.min(h - 1.5, wkOf(b));
    if (wk >= 0.8) {
      const s = L * 0.37 + 1.9, y0 = h - wk;
      for (const [a, c2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(boxGeo(0.22, wk + 0.6, 0.22), SCAFFOLD, x + a * s, y0, z + c2 * s);
      for (const yy of [y0, y0 + wk + 0.4]) for (const [dx, dz, w, d] of [[0, s, 2 * s, 0.18], [0, -s, 2 * s, 0.18], [s, 0, 0.18, 2 * s], [-s, 0, 0.18, 2 * s]]) B(boxGeo(w, 0.18, d), SCAFFOLD, x + dx, yy, z + dz);
    }
    if (b.night >= 2) B(cylGeo(0.5, 0.5, 1, 10), LANTERN, x, eaveY - 1.3, z + topW / 2 + ov - 0.5);
    if (b.now) crane(x - topW * 0.3, top, z + topW * 0.3, r);
    if (b.isNew) balloons(x, top, z);
    flagFor(b, x + topW * 0.4, top - 0.4, z + topW * 0.4);
    return { h: top };
  }
  // A dark wooden house, for black belts under 15 floors
  function woodHouse(b, x, z, r) {
    B(boxGeo(8.2, 0.4, 7.2), STONE, x, 0, z); B(boxGeo(6.2, 0.3, 5.4), DECK, x, 0.4, z);
    B(boxGeo(5.6, 2.2, 4.8), WOOD, x, 0.7, z);
    for (const [a, c2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(boxGeo(0.28, 2.2, 0.28), VERMILION, x + a * 2.8, 0.7, z + c2 * 2.4);
    B(boxGeo(2.4, 1.1, 0.08), PAPER, x - 1.1, 1.5, z + 2.44); B(boxGeo(0.08, 1.0, 2.2), PAPER, x + 2.84, 1.5, z);
    B(boxGeo(0.9, 1.6, 0.08), VERMILION, x + 1.4, 0.7, z + 2.44); B(cylGeo(0.18, 0.18, 0.4, 8), LANTERN, x + 2.2, 1.9, z + 2.6);
    B(eaveGeo(5.6, 4.8, 1.3, 1.9), TILES, x, 2.9, z);
    stoneLantern(x - 3.4, z + 3.2);
    const hh = 4.8;
    if (b.now) crane(x - 2, hh, z + 2, r);
    if (b.isNew) balloons(x, hh, z);
    flagFor(b, x + 1.3, hh - 0.5, z + 1.3);
    return { h: hh };
  }
  function stoneLantern(x, z) { B(cylGeo(0.22, 0.3, 1.0, 8), STONE_D, x, 0, z); B(boxGeo(0.7, 0.22, 0.7), STONE_D, x, 1.0, z); B(boxGeo(0.45, 0.42, 0.45), WARM_LIGHT, x, 1.22, z); B(boxGeo(0.9, 0.18, 0.9), STONE_D, x, 1.64, z); B(sphGeo(0.14, 6), STONE_D, x, 1.95, z); }
  function torii(x, z, w, h) { B(cylGeo(0.2, 0.22, h, 8), VERMILION, x - w / 2, 0.3, z); B(cylGeo(0.2, 0.22, h, 8), VERMILION, x + w / 2, 0.3, z); B(boxGeo(w + 1.6, 0.32, 0.36), VERMILION, x, h + 0.2, z); B(boxGeo(w + 1.6, 0.12, 0.42), LACQUER, x, h + 0.52, z); B(boxGeo(w, 0.24, 0.24), VERMILION, x, h - 0.7, z); }
  function sakura(x, z, s = 1) { B(cylGeo(0.16 * s, 0.22 * s, 1.6 * s, 6), TRUNK, x, 0.3, z); B(sphGeo(1.2 * s, 8), SAKURA, x, 2.3 * s, z); B(sphGeo(0.9 * s, 8), SAKURA, x + 0.7 * s, 2.8 * s, z + 0.3 * s); B(sphGeo(0.8 * s, 8), SAKURA, x - 0.6 * s, 2.7 * s, z - 0.4 * s); }
  // the dojo hall: deck, wooden walls, red pillars, a paper front and an eave (two on the temple)
  function hall(x, z, w, d, hw, double = false) {
    B(boxGeo(w + 1.6, 0.35, d + 1.6), DECK, x, 0.3, z);
    B(boxGeo(w, hw, d), WOOD, x, 0.65, z);
    for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) { B(boxGeo(0.34, hw, 0.34), VERMILION, x + a * w, 0.65, z + d / 2); B(boxGeo(0.34, hw, 0.34), VERMILION, x + a * w, 0.65, z - d / 2); }
    for (const a of [-0.5, 0, 0.5]) { B(boxGeo(0.34, hw, 0.34), VERMILION, x + w / 2, 0.65, z + a * d); B(boxGeo(0.34, hw, 0.34), VERMILION, x - w / 2, 0.65, z + a * d); }
    for (const a of [-0.375, -0.125, 0.125, 0.375]) B(boxGeo(w * 0.2, hw * 0.55, 0.06), PAPER, x + a * w, 0.65 + hw * 0.22, z + d / 2 + 0.03);
    B(boxGeo(1.4, hw * 0.7, 0.1), LACQUER, x, 0.65, z + d / 2 + 0.05);
    const y1 = 0.65 + hw;
    if (double) {
      B(eaveGeo(w, d, 1.8, hw * 0.55), TILES, x, y1, z);
      B(boxGeo(w * 0.62, hw * 0.5, d * 0.62), WOOD, x, y1 + hw * 0.3, z);
      for (const a of [-0.31, 0.31]) for (const c2 of [-0.31, 0.31]) B(boxGeo(0.3, hw * 0.5, 0.3), VERMILION, x + a * w, y1 + hw * 0.3, z + c2 * d);
      B(eaveGeo(w * 0.62, d * 0.62, 1.6, hw * 0.6), TILES, x, y1 + hw * 0.8, z); B(sphGeo(0.3, 8), GOLD_GLOW, x, y1 + hw * 1.45, z);
    } else { B(eaveGeo(w, d, 1.8, hw * 0.75), TILES, x, y1, z); B(sphGeo(0.28, 8), GOLD_GLOW, x, y1 + hw * 0.78, z); }
  }
  function lowWall(x, z, n) { const s = n * L * 0.46; for (const [cx, cz, w, d] of [[x, z - s, 2 * s, 0.3], [x - s, z, 0.3, 2 * s], [x + s, z, 0.3, 2 * s], [x - s * 0.62, z + s, s * 0.76, 0.3], [x + s * 0.62, z + s, s * 0.76, 0.3]]) { B(boxGeo(w, 1.0, d), matte('#d9d2c2'), cx, 0.3, cz); B(boxGeo(w + 0.2, 0.16, d + 0.2), STONE_D, cx, 1.3, cz); } }
  function pond(x, z, rad) { B(cylGeo(rad, rad, 0.12, 24), POND, x, 0.3, z); B(NI(new THREE.TorusGeometry(rad * 0.6, 0.22, 6, 20, Math.PI)), VERMILION, x, 0.4, z); }
  function zen(x, z, w, d) { B(boxGeo(w, 0.12, d), SAND, x, 0.3, z); for (let i = 0; i < 4; i++) B(boxGeo(w - 1, 0.03, 0.08), matte('#cfc5ab'), x, 0.42, z - d / 2 + 0.8 + i * (d - 1.6) / 3); B(sphGeo(0.7, 8), ROCK, x - w * 0.25, 0.7, z + d * 0.1, 0, [1, 0.7, 1]); B(sphGeo(0.5, 8), ROCK, x + w * 0.2, 0.6, z - d * 0.15, 0, [1.2, 0.7, 1]); }
  function bellTower(x, z) { for (const [a, c2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(boxGeo(0.3, 3.2, 0.3), VERMILION, x + a * 1.4, 0.3, z + c2 * 1.4); B(boxGeo(3.4, 0.3, 3.4), DECK, x, 0.3, z); B(eaveGeo(3.0, 3.0, 1.0, 1.4), TILES, x, 3.5, z); B(cylGeo(0.55, 0.6, 0.9, 10), GOLD_GLOW, x, 1.6, z); B(sphGeo(0.25, 8), GOLD_GLOW, x, 2.6, z); }
  // ───────── the mayor's rally: the statue at the back of the lot and, in front of it, the stage ─────────
  // The static part lives here (platform, striped skirt, steps, podium, microphone, banner with the
  // name, poles with bunting, speakers, lamps); the mayor's figure, the crowd and the confetti are
  // animated by life.js from the 'rally' mark.
  function rally(m, x, z) {
    const sz = z - 3.2;
    B(boxGeo(3.4, 3, 3.4), matte('#e6e0d2'), x, 0.3, sz); B(sphGeo(1.3, 10), BRONZE, x, 3.3, sz, 0, [1, 0.6, 1]); B(sphGeo(0.9, 10), BRONZE, x, 4.6, sz); B(cylGeo(1.1, 1.1, 0.2, 10), DARK, x, 5.3, sz); B(cylGeo(0.65, 0.65, 1, 10), DARK, x, 5.5, sz);
    const pz = z + 1.2, PW = 7, PD = 3.6, PH = 1.1, top = 0.3 + PH;
    B(boxGeo(PW, PH, PD), STAGE, x, 0.3, pz);
    for (let i = 0; i < 7; i++) B(boxGeo(PW / 7 - 0.08, PH - 0.1, 0.12), i % 2 ? VERMILION : CREAM, x - PW / 2 + PW / 14 + i * PW / 7, 0.3, pz + PD / 2 + 0.02);
    B(boxGeo(1.2, 0.35, 1.0), PODIUM, x + PW / 2 + 0.6, 0.3, pz + 0.6); B(boxGeo(1.2, 0.7, 1.0), PODIUM, x + PW / 2 + 0.6, 0.3, pz - 0.4);
    B(boxGeo(1.1, 1.25, 0.7), PODIUM, x, top, pz + 1.1); B(boxGeo(1.3, 0.1, 0.9), STAGE, x, top + 1.25, pz + 1.1);
    B(cylGeo(0.03, 0.03, 0.7, 6), DARK, x + 0.3, top + 1.35, pz + 1.0); B(sphGeo(0.09, 6), DARK, x + 0.3, top + 2.1, pz + 1.0);
    for (const sx of [-PW / 2 + 0.2, PW / 2 - 0.2]) B(cylGeo(0.06, 0.06, 4.2, 6), DARK, x + sx, top, pz - PD / 2 + 0.25);
    for (let i = 0; i < 12; i++) { const fx = -PW / 2 + 0.5 + i * (PW - 1) / 11, sag = 0.35 * Math.sin((i / 11) * Math.PI); B(boxGeo(0.42, 0.42, 0.04).clone().rotateZ(Math.PI / 4), BUNTING[i % 4], x + fx, top + 4.0 - sag, pz - PD / 2 + 0.3); }
    for (const sx of [-PW / 2 + 0.6, PW / 2 - 0.6]) { B(cylGeo(0.05, 0.05, 1.2, 6), DARK, x + sx, top, pz + 0.6); B(boxGeo(0.7, 0.9, 0.5), SPEAKER, x + sx, top + 1.2, pz + 0.6); }
    for (const sx of [-4.6, 4.6]) { B(cylGeo(0.08, 0.08, 6.2, 6), DARK, x + sx, 0.3, pz + 3.9); B(sphGeo(0.25, 8), WARM_LIGHT, x + sx, 6.6, pz + 3.9); }
    B(boxGeo(PW - 0.4, 2.6, 0.18), matte('#2b3542'), x, top + 0.1, pz - PD / 2 + 0.25);
    B(NI(new THREE.PlaneGeometry(PW - 0.6, 2.4)), bannerMat(m), x, top + 0.2 + 1.2, pz - PD / 2 + 0.35);
    marks.push({ kind: 'rally', x, y: top, z: pz, person: m.person, month: m.month, lastMonth: m.lastMonth });
  }
  // The banner's canvas: "MAYOR FOR NOVEMBER", the name and last month's floors (lit at night).
  function bannerMat(m) {
    const head = t('rally.banner', { month: monthOf(m.month, 'period.thisMonth') }).toUpperCase(), who = displayName(m.person).full;
    const foot = t('rally.floors', { floors: floorsText(m.person.lastMonth), lastMonth: monthOf(m.lastMonth, 'period.lastMonth') });
    return signMat(`rally|${head}|${who}|${foot}`, 512, 200, (c) => {
      c.fillStyle = '#1d2630'; c.fillRect(0, 0, 512, 200); c.fillStyle = '#f2b705'; c.fillRect(0, 0, 512, 8); c.fillRect(0, 192, 512, 8);
      c.textAlign = 'center';
      c.fillStyle = '#f2b705'; c.fillText(fitFont(c, head, 470, 26, 14), 256, 58);
      c.fillStyle = '#ffffff'; c.fillText(fitFont(c, who, 470, 50, 14), 256, 120);
      c.fillStyle = '#cfd8e3'; c.fillText(fitFont(c, foot, 470, 24, 14), 256, 166);
    }, 1.4);
  }


  // The city's Dojo: Dojo (1 black belt, 1 lot), Temple (3, 2×2) and Great Temple (7, 3×3). The
  // level comes from the count; n is how much fit in the field (the great temple fits where it can).
  function dojoMon(level, n, x, z) {
    if (level >= 3 && n >= 3) {
      lowWall(x, z, 3);
      hall(x, z - 5, 14, 9, 4.4, true);
      pagodaBody(x + 9.6, z + 6.5, 15, pagodaSide(), { w0: 4.2, tiers: 5, platform: false });
      bellTower(x - 10, z + 7.5);
      pond(x - 9, z - 7.5, 3.2); zen(x + 9.5, z - 7, 6, 6);
      for (const [u, v] of [[-12, 2], [12, -11], [-4, 11.5], [5, 12]]) sakura(x + u, z + v, 1.0);
      B(boxGeo(2.6, 0.08, 13), STONE_D, x, 0.3, z + 6.5); for (const u of [-2.4, 2.4]) { stoneLantern(x + u, z + 3); stoneLantern(x + u, z + 9); }
      torii(x, z + 13.9, 4.4, 5.2);
      return { h: 20 };
    }
    if (level >= 2 && n >= 2) {
      lowWall(x, z, 2);
      hall(x - 1.5, z - 2.5, 10, 7, 3.4, true);
      pagodaBody(x + 6.3, z + 4.6, 9, pagodaSide(), { w0: 3.2, tiers: 3, platform: false });
      pond(x - 5.2, z + 5.2, 2.6); sakura(x - 7.6, z - 7, 1.0); sakura(x + 7.4, z - 6.8, 0.9);
      B(boxGeo(2.2, 0.08, 9), STONE_D, x - 1.5, 0.3, z + 4.6); stoneLantern(x - 3.3, z + 7.5); stoneLantern(x + 0.3, z + 7.5);
      torii(x - 1.5, z + 9.5, 3.4, 4.0);
      return { h: 13 };
    }
    hall(x, z - 0.6, 5.8, 4.6, 2.6);
    stoneLantern(x - 3.4, z + 3.4); stoneLantern(x + 3.4, z + 3.4);
    torii(x, z + 4.3, 2.6, 3.2); sakura(x + 3.6, z - 2.6, 0.8);
    return { h: 7 };
  }

  // ───────── the Corporate District: headquarters, foundations and the diamond ─────────
  // A Mega Builder's headquarters, a campus on a 2×2 lot (p from rules.js megaOf). One wing per city
  // around a lawn (back, left and right, then two short ones at the front; past five, the rest share
  // the last), each as tall as that city's floors on the headquarters' scale (H: main.js, 10 floors in
  // the cities make one here, so a campus grows ten times slower than the buildings), with golden
  // cornices and corner fins and the city's name at its door; the lobby at the front with the person's
  // name over the door and one pennant per city; the golden crown and the diamond on the tallest wing.
  // Windows by the person's hours; this week's floors scaffolded on the wing that grew most; a crane on
  // the wing being built now; on fire or in rubble like any building.
  function hq(p, x, z, H = (f) => hOf({ floors: f })) {
    const r = seed(`hq${p.id}`), ruin = ruinOf(p), fire = ruin === 'fire' && !colorOf, S = L * 0.92;
    B(boxGeo(S * 2, 0.3, S * 2), STONE, x, 0, z);
    if (ruin === 'rubble') return rubble(p, x, z, colorOf ? colorOf(p) : HQ_GLASS, false, r);
    const hex = colorOf ? colorOf(p) : fire ? shade(HQ_GLASS, 0.5) : HQ_GLASS;
    const side = colorOf ? matte(hex) : facadeMat('hq', 0, true, hex), roof = colorOf ? matte(shade(hex, 0.8)) : INK;
    const gold = colorOf ? matte(shade(hex, 1.15)) : GOLD_MAT, glow = colorOf ? gold : GOLD_GLOW, unit = colorOf ? roof : matte('#8a8f96');
    const mask = p.hours || 0, hours = [mask & 255, (mask >> 8) & 255, (mask >> 16) & 255, fire ? 0 : p.now ? 1 : p.today > 0 ? 0.6 : 0.15];
    const wings = p.parts.slice(0, 5).map(({ b, c }) => ({ b, name: c.name ?? c.code ?? '', f: b.floors, week: b.week || 0, now: !!b.now }));
    if (p.parts.length > 5) { const rest = p.parts.slice(4), w = wings[4]; w.name = `+${rest.length}`; w.f = rest.reduce((s, { b }) => s + b.floors, 0); w.week = rest.reduce((s, { b }) => s + (b.week || 0), 0); w.now = rest.some(({ b }) => b.now); }
    const front = wings.length >= 4, e = S - 0.5, back = -e + 4.8, mid = front ? S * 0.3 : S * 0.55;
    const slots = [[0, (back - e) / 2, 2 * e, 4.8], [-e + 2.2, (back + mid) / 2, 4.4, mid - back], [e - 2.2, (back + mid) / 2, 4.4, mid - back], [-e + 2.2, (mid + 0.6 + e) / 2, 4.4, e - mid - 0.6], [e - 2.2, (mid + 0.6 + e) / 2, 4.4, e - mid - 0.6]];
    B(boxGeo(2 * (e - 4.4), 0.08, e - 3.6 - back), matte(colorOf ? shade(hex, 1.3) : '#7cc35c'), x, 0.3, z + (e - 3.6 + back) / 2); // the lawn, up to the lobby
    let top = null; const busy = wings.reduce((a, w) => (w.week >= 1 && w.week > (a?.week ?? 0) ? w : a), null); // the scaffold goes on the wing that grew most this week
    wings.forEach((w, i) => {
      const [u, v, ww, dd] = slots[i], cx = x + u, cz = z + v, hw = H(w.f), y1 = 0.3 + hw;
      cur = { hours, H: hw };
      bx(ww, hw, dd, side, roof, cx, 0.3, cz);
      B(boxGeo(ww + 0.5, 0.4, dd + 0.5), gold, cx, y1 - 0.5, cz); // the cornice: a band under the roof's edge
      const fin = boxGeo(0.4, hw, 0.4);
      for (const [a, c2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) B(fin, gold, cx + a * (ww / 2 + 0.03), 0.3, cz + c2 * (dd / 2 + 0.03));
      B(boxGeo(Math.min(ww, dd) * 0.4, 0.8, Math.min(ww, dd) * 0.4), unit, cx + (ww > dd ? ww * 0.25 : 0), y1, cz + (ww > dd ? 0 : -dd * 0.25)); // a rooftop unit
      if (!colorOf && w.name) { const pw = Math.min(ww - 1, 4.4); B(NI(new THREE.PlaneGeometry(pw, pw / 4)), wingSign(w.name), cx, 1.9, cz + dd / 2 + 0.06); } // the city's name at the wing's door
      const wk = H(w.f) - H(Math.max(0, w.f - w.week));
      if (w === busy && hw > 2) { const s = clamp(Math.max(0.8, wk), 0.8, hw - 1.5); bx(ww + 0.25, s, dd + 0.25, SCAFFOLD, SCAFFOLD_TOP, cx, y1 - s, cz); }
      if (w.now) crane(cx - ww * 0.2, y1, cz + dd * 0.2, r);
      if (!top || hw > top.hw) top = { cx, cz, ww, dd, hw, y1 };
    });
    cur = null;
    // the lobby: low glass at the front, the name over the door, a golden canopy and band
    const lz = z + e - 1.8, lf = lz + 1.8;
    cur = { hours, H: 4.4 }; bx(7, 4.4, 3.6, side, roof, x, 0.3, lz); cur = null;
    B(boxGeo(7.6, 0.45, 4.2), gold, x, 4.2, lz);
    B(boxGeo(2.2, 2, 0.1), INK, x, 0.3, lf + 0.05); B(boxGeo(4, 0.25, 1.2), gold, x, 2.4, lf + 0.6);
    if (!colorOf) B(NI(new THREE.PlaneGeometry(6.4, 1.4)), hqSign(p), x, 3.65, lf + 0.06);
    p.parts.forEach((_, i) => { // one pennant per city, on both sides of the lobby
      const sd = i % 2 ? -1 : 1, px = x + sd * (4.6 + 1.9 * Math.floor(i / 2)), pz = z + S - 0.2;
      B(cylGeo(0.07, 0.07, 2.8, 6), SILVER, px, 0.3, pz); B(boxGeo(1.3, 0.75, 0.06), i % 2 ? gold : INK, px + sd * 0.68, 2.3, pz);
    });
    // the crown on the tallest wing: a golden pavilion, a pyramid and the diamond
    B(boxGeo(3, 1.4, 3), gold, top.cx, top.y1, top.cz); B(coneGeo(2.1, 2.6, 4), gold, top.cx, top.y1 + 1.4, top.cz, Math.PI / 4);
    B(NI(new THREE.OctahedronGeometry(1.0)), glow, top.cx, top.y1 + 6.2, top.cz, Math.PI / 4, [1, 1.5, 1]);
    if (fire) marks.push({ kind: 'fire', x: top.cx, z: top.cz, h: top.y1, w: top.ww, d: top.dd, bw: top.ww, bd: top.dd, by0: 0.3, by1: top.y1 });
    return { h: top.y1 + 7.8 };
  }
  // The foundation of a future headquarters (the next in line): hoarding with a golden stripe, a
  // concrete slab, a steel frame as tall as the progress, the site office and the board with the name
  // and how far it is ("761 of 1,000"). No crane: the crane means "building now".
  function foundation(p, x, z, line, top = 14) { // top: the steel at 100% (lower than the campus it turns into)
    const prog = clamp(p.floors / Math.max(1, line), 0, 1), flat = colorOf ? matte(colorOf(p)) : null;
    const conc = flat ?? matte('#bdb7ab'), steel = flat ?? matte('#7d848c', { roughness: 0.5, metalness: 0.4 }), hoard = flat ?? matte('#e6e0d0');
    B(boxGeo(L * 1.5, 0.5, L * 1.5), conc, x, 0, z);
    const s = L * 0.88;
    for (const [cx, cz, w, d] of [[x, z - s, 2 * s, 0.25], [x - s, z, 0.25, 2 * s], [x + s, z, 0.25, 2 * s], [x - s * 0.6, z + s, s * 0.8, 0.25], [x + s * 0.6, z + s, s * 0.8, 0.25]]) {
      B(boxGeo(w, 1.6, d), hoard, cx, 0, cz);
      if (!flat) B(boxGeo(w + 0.02, 0.25, d + 0.02), GOLD_MAT, cx, 1.1, cz);
    }
    const H = 0.8 + prog * top, g = L * 0.55;
    for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) B(boxGeo(0.4, H, 0.4), steel, x + u * g, 0.5, z + v * g);
    for (const yy of [0.5 + H * 0.5, 0.5 + H]) for (const u of [-1, 0, 1]) { B(boxGeo(2 * g + 0.4, 0.35, 0.35), steel, x, yy - 0.35, z + u * g); B(boxGeo(0.35, 0.35, 2 * g + 0.4), steel, x + u * g, yy - 0.35, z); }
    if (prog >= 0.75) B(boxGeo(2 * g + 0.6, 0.3, 2 * g + 0.6), conc, x, 0.5 + H * 0.5, z);
    B(boxGeo(4, 2.4, 2), flat ?? matte('#3d7bd9'), x + s * 0.55, 0.5, z - s * 0.55); // the site office
    const bxp = x - s * 0.45, bzp = z + s + 0.5; // the board, at the gate
    for (const sx of [-2.25, 2.25]) B(cylGeo(0.1, 0.1, 4.3, 6), DARK, bxp + sx, 0, bzp);
    if (!flat) B(NI(new THREE.PlaneGeometry(4.8, 2.4)), boardMat(p, line), bxp, 3.05, bzp + 0.06);
    return { h: Math.max(4.4, 0.5 + H) };
  }
  // The district's square: a golden diamond on a dark pedestal, glowing at night
  function diamond(x, z) {
    B(cylGeo(2.6, 3, 0.6, 16), STONE, x, 0, z); B(cylGeo(1.1, 1.5, 2.4, 8), colorOf ? matte('#8d9199') : INK, x, 0.6, z);
    B(NI(new THREE.OctahedronGeometry(1.6)), colorOf ? matte('#c9c3b5') : GOLD_GLOW, x, 5.4, z, Math.PI / 4, [1, 1.45, 1]);
    return { h: 7.8 };
  }
  // The headquarters' name over the door and the foundation's board (signMat: one texture per text)
  function hqSign(p) {
    const who = displayName(p).full, head = `◆ ${t('mega.one').toUpperCase()} ◆`;
    return signMat(`hq|${head}|${who}`, 512, 112, (c, w, h) => {
      c.fillStyle = '#14171c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e3c25a'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5);
      c.textAlign = 'center'; c.fillText(fitFont(c, head, 470, 22), w / 2, 34);
      c.fillStyle = '#ffffff'; c.fillText(fitFont(c, who, 470, 44), w / 2, 86);
    });
  }
  function wingSign(name) {
    return signMat(`wing|${name}`, 256, 64, (c, w, h) => {
      c.fillStyle = '#14171c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e3c25a'; c.fillRect(0, h - 4, w, 4);
      c.textAlign = 'center'; c.fillText(fitFont(c, name.toUpperCase(), 236, 34), w / 2, 44);
    });
  }
  function boardMat(p, line) {
    const who = displayName(p).full, head = t('mega.future').toUpperCase(), n = Math.floor(p.floors), of = t('mega.of', { floors: fmt.int(n), line: fmt.int(line) });
    return signMat(`board|${head}|${who}|${of}`, 480, 240, (c, w) => {
      c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, w, 240); c.fillStyle = '#14171c'; c.fillRect(0, 0, w, 58);
      c.textAlign = 'center'; c.fillStyle = '#e3c25a'; c.fillText(fitFont(c, head, 440, 26), w / 2, 39);
      c.fillStyle = '#14171c'; c.fillText(fitFont(c, who, 440, 34), w / 2, 112);
      const prog = clamp(n / Math.max(1, line), 0, 1);
      c.fillStyle = '#d9d3c4'; c.fillRect(40, 136, w - 80, 26); c.fillStyle = '#e3a90a'; c.fillRect(40, 136, (w - 80) * prog, 26);
      c.fillStyle = '#3a3f47'; c.fillText(fitFont(c, of, 440, 28), w / 2, 206);
    });
  }
  return { tower, house, monument, hq, foundation, diamond, anims, trees, marks, cranes };
}
