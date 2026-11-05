// Procedural rock of the 3D wall: shape (slabs, cracks, bands and an irregular summit), detail
// texture generated on the fly (nothing is downloaded) and a triplanar material used by the wall, the plateau and
// the boulders. The face is a height field z = wallZ(x, y) facing the camera (+z).
// At the bottom is the base camp (BASE_LEDGE_Y, from the token scale) and, at the height of each camp,
// a ledge with a tent (createCampLedges).
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASE_LEDGE_Y, FEET_DROP, campYs } from './scale.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const simplex = new SimplexNoise({ random: rand });
const n2 = (x, y) => simplex.noise(x, y);

// Integer hash → [0, 1): always the same value for the same cell.
function hash3(i, j, k) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x2545f491)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth ramp: 0 before u = 0, parabola up to L and a straight line (slope 1) after.
const ramp = (u, L) => (u <= 0 ? 0 : u < L ? (u * u) / (2 * L) : u - L / 2);

// ---------- Shape ----------

// right: end of the detailed area (where there are climbers); far: tip of the flank, out of frame
// even with the camera seeing the whole wall.
export const WALL = { right: 26, far: 110, bottom: -84 };
const RL = 1.5; // radius of the left edge (cliff silhouette)
const RT = 0.7; // radius of the summit edge
const FINE_BOTTOM = -56; // fine face rows down to here (below the base camp)

// Left edge of the cliff (x) at each height; near the top it stays constant. Further down
// it gains secondary shoulders and buttresses that open outward: from afar the silhouette is a massif,
// not a straight line. Never goes past x = -6.3 (the lanes start at -4.4 and the rounded edge is 1.5).
export function edgeX(y) {
  const yy = Math.min(y, -1);
  let x = -7.7 + n2(0.37, yy * 0.045) * 1.2 + n2(1.7, yy * 0.14) * 0.3;
  const below = Math.max(0, -yy - 5);
  const w = smooth(0, 9, below);
  const shoulder = 0.5 + 0.5 * n2(2.9, yy * 0.055);
  x -= w * (3.4 * shoulder * shoulder + 1.5 * Math.max(0, n2(5.3, yy * 0.12)) + 0.03 * below);
  return Math.min(x, -6.3);
}
export const XE0 = edgeX(-1);

// Past the summit area the crest slopes down to the right (shoulder of the mountain): from afar the wall
// is a peak, not a tower. Up to x = 16 nothing changes.
function ridgeDrop(x) {
  if (x <= 16) return 0;
  const w = smooth(16, 30, x);
  return -0.5 * ramp(x - 16, 8) + w * (n2(x * 0.06, 2.2) * 2.6 + n2(x * 0.21, 5.5) * 0.7);
}

// Summit line: flat where the leaders stand, jagged elsewhere (tower near the edge).
export function crest(x) {
  let c = n2(x * 0.17, 9.1) * 0.4 + n2(x * 0.55, 4.4) * 0.14;
  c *= 1 - 0.8 * smooth(-1.6, 0, x) * (1 - smooth(6.4, 8.2, x));
  c += 1.7 * Math.exp(-(((x - XE0 - 2.6) / 1.5) ** 2));
  c += 0.9 * Math.exp(-(((x - 11.5) / 2.2) ** 2));
  return c + ridgeDrop(x);
}

// Slabs: Voronoi stretched vertically. Each cell is a slightly tilted plane; between
// neighboring columns a crack remains, between stacked blocks, a step.
const SLAB_W = 2.4;
const SLAB_H = 5.5;
const slabD = new Float64Array(9);
const slabZ = new Float64Array(9);
function slabs(x, y, out) {
  const px = x / SLAB_W;
  const py = y / SLAB_H;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  let n = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const dx = px - (cx + 0.1 + 0.8 * hash3(cx, cy, 1));
      const dy = py - (cy + 0.1 + 0.8 * hash3(cx, cy, 2));
      const d = Math.sqrt(dx * dx + dy * dy);
      slabD[n] = d;
      slabZ[n++] = (hash3(cx, cy, 3) - 0.5) * 0.8 + (hash3(cx, cy, 4) - 0.5) * 0.5 * dx + (hash3(cx, cy, 5) - 0.5) * 0.35 * dy;
      if (d < d1) { d2 = d1; d1 = d; id = hash3(cx, cy, 6); } else if (d < d2) d2 = d;
    }
  }
  // Height: average of the neighboring slabs weighted by the distance to the edge of each one. Continuous
  // everywhere (before, only the 2nd closest entered and, near where three slabs meet, the
  // surface gave steps of several cm from one millimeter to the next).
  let zs = 0;
  let ws = 0;
  for (let k = 0; k < n; k++) {
    const w = 1 - smooth(0, 0.16, slabD[k] - d1);
    zs += w * slabZ[k];
    ws += w;
  }
  const e = d2 - d1; // ~distance to the slab edge
  out.tint = id;
  return zs / ws - 0.16 * (1 - smooth(0, 0.14, e));
}

// Horizontal bands (wavy): the protruding lower one becomes a ledge; the upper one, a roof.
const BAND = 4.6;
function bands(x, y) {
  const f = (y + n2(x * 0.045, 3.3) * 1.4 + x * 0.05) / BAND;
  const k = Math.floor(f);
  const off = (i) => n2(i * 1.37 + 0.5, x * 0.07) * 0.55;
  return mix(off(k), off(k + 1), smooth(0.86, 1, f - k));
}

const scratch = { tint: 0.5 };
// In the lane strip (x ≈ -5…15) the big buttresses stay shallow: everyone stands at almost the
// same depth and perspective does not push anyone off the ruler. Slabs, cracks and bands
// stay the same; outside the strip (edge and flank) the relief is full.
const laneFlat = (x) => 1 - 0.7 * smooth(-7.2, -5.4, x) * (1 - smooth(14.6, 17.6, x));

// Relief of the face, without the rounding of the edges.
export function faceZ(x, y, out = scratch) {
  let z = (n2(x * 0.032, y * 0.02) * 2.2 + n2(x * 0.075 + 7, y * 0.05) * 0.8) * laneFlat(x); // buttresses
  z += slabs(x, y, out);
  z += bands(x, y);
  z += n2(x * 0.21 + 3, y * 0.17) * 0.15 + n2(x * 0.5, y * 0.45 + 2) * 0.05;
  return z;
}

const roundOff = (d, r) => (d >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));

// Wall surface (where hands and feet rest).
export function wallZ(x, y) {
  return faceZ(x, y) - roundOff(x - edgeX(y), RL) - roundOff(crest(x) - y, RT);
}

// Front of the plateau (where the rounded edge ends) and height of the summit floor.
export const frontZ = (x) => faceZ(x, crest(x)) - RT - roundOff(x - XE0, RL);
function plateau(x, back) {
  let p = n2(x * 0.16, back * 0.16 + 4) * 0.3 + n2(x * 0.6, back * 0.6) * 0.06;
  p += 2.2 * Math.exp(-(((x + 2.5) / 3.5) ** 2) - (((back - 10) / 4.5) ** 2));
  p += 3.4 * Math.exp(-(((x - 14) / 5) ** 2) - (((back - 12) / 6) ** 2));
  // on the right shoulder the plateau drops along with the crest, with the massif rising a little behind
  p += ridgeDrop(x) + smooth(18, 34, x) * smooth(1, 10, back) * (2 + n2(x * 0.045 + 3, back * 0.06) * 2.4);
  if (back > 22) p -= ((back - 22) * 0.35) ** 2; // the other side of the mountain falls away
  return mix(crest(x), p, smooth(0.2, 3.4, back));
}
export const groundY = (x, z) => plateau(x, Math.max(0, frontZ(x) - z));

// Columns: 1 folded backward (cliff side), NR rounding the edge, NU up to WALL.right
// and NX on the flank, increasingly spaced out up to WALL.far (the last one also folds backward).
const NR = 8;
const NU = 132;
const NX = 90;
const NC = NR + NU + 2 + NX;
const colOffset = (k, span) => (k < NR ? RL * (1 - Math.cos((Math.PI / 2) * (k / NR))) : RL + (span - RL) * ((k - NR) / NU));
function colX(col, xe) {
  if (col === 0) return xe - 0.25;
  const k = col - 1;
  if (k <= NR + NU) return xe + colOffset(k, WALL.right - xe);
  return WALL.right + (WALL.far - WALL.right) * ((k - NR - NU) / NX) ** 1.4;
}

function gridIndex(rows, cols) {
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  return idx;
}

function faceGeometry() {
  const rows = [];
  for (let y = WALL.bottom; y < FINE_BOTTOM; y += 0.8) rows.push({ yn: y });
  for (let y = FINE_BOTTOM; y < -RT - 0.01; y += 0.25) rows.push({ yn: y });
  for (let i = 0; i <= 7; i++) rows.push({ e: RT * Math.cos((Math.PI / 2) * (i / 7)) });
  const NRows = rows.length;
  const pos = new Float32Array(NRows * NC * 3);
  const tint = new Float32Array(NRows * NC);
  const out = { tint: 0.5 };
  // The top rows follow the crest (y scales from the bottom up to crest(x) - RT).
  const scaleY = (yn, c) => WALL.bottom + ((yn - WALL.bottom) * (c - RT - WALL.bottom)) / (-RT - WALL.bottom);
  let v = 0;
  for (const row of rows) {
    for (let col = 0; col < NC; col++, v++) {
      let y = row.e !== undefined ? -row.e : row.yn;
      let x = colX(col, edgeX(y));
      const c = crest(x);
      y = row.e !== undefined ? c - row.e : scaleY(row.yn, c);
      const xe = edgeX(y);
      x = colX(col, xe);
      let z;
      if (col === 0) z = faceZ(xe, y, out) - RL - 6;
      else z = faceZ(x, y, out) - roundOff(x - xe, RL) - roundOff(crest(x) - y, RT) - (col === NC - 1 ? 6 : 0);
      pos.set([x, y, z], v * 3);
      tint[v] = out.tint;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(gridIndex(NRows, NC));
  geo.computeVertexNormals();

  // Per-vertex data: crack occlusion (from concavity), moss on the ledges, slab tone.
  const nrm = geo.attributes.normal;
  const data = new Float32Array(NRows * NC * 3);
  const zAt = (r, c) => pos[(clamp(r, 0, NRows - 1) * NC + clamp(c, 0, NC - 1)) * 3 + 2];
  for (let r = 0; r < NRows; r++) {
    for (let c = 0; c < NC; c++) {
      const i = r * NC + c;
      const z0 = zAt(r, c);
      const ring = (k) => (zAt(r - k, c) + zAt(r + k, c) + zAt(r, c - k) + zAt(r, c + k)) * 0.25 - z0;
      const ny = nrm.getY(i);
      let ao = 1 - 1.5 * Math.max(0, ring(2)) - 0.45 * Math.max(0, ring(6));
      ao *= 1 - 0.35 * smooth(0.15, 0.7, -ny); // roofs get dark
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const moss = smooth(0.42, 0.8, ny) * clamp(0.65 + 0.6 * n2(x * 0.35, y * 0.35), 0, 1);
      data.set([clamp(ao, 0.25, 1), moss, tint[i]], i * 3);
    }
  }
  geo.setAttribute('rockData', new THREE.BufferAttribute(data, 3));
  return geo;
}

function topGeometry() {
  const NB = 46;
  const backs = [];
  for (let j = 0; j <= NB; j++) backs.push(60 * (j / NB) ** 1.8);
  const pos = new Float32Array(backs.length * NC * 3);
  const data = new Float32Array(backs.length * NC * 3);
  let v = 0;
  for (const back of backs) {
    for (let col = 0; col < NC; col++, v++) {
      const x = col === 0 ? XE0 : colX(col, XE0);
      let y = plateau(x, back);
      if (col === 0 || col === NC - 1) y -= 6; // skirt: hides the junction with the edge
      pos.set([col === 0 ? x - 0.05 : x, y, frontZ(x) - back], v * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(gridIndex(backs.length, NC));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3];
    const z = pos[i * 3 + 2];
    const back = backs[Math.floor(i / NC)];
    // at 8,848 m there is almost no vegetation: just a bit of dry lichen between the rocks and the snow (shader)
    const grass = 0.3 * smooth(0.55, 0.9, nrm.getY(i)) * smooth(0.15, 1.1, back) * clamp(0.6 + 0.9 * n2(x * 0.22, z * 0.22), 0, 1);
    data.set([0.92, grass, 0.5 + 0.35 * n2(x * 0.1 + 5, z * 0.1)], i * 3);
  }
  geo.setAttribute('rockData', new THREE.BufferAttribute(data, 3));
  return geo;
}

// Boulder: icosahedron deformed and "cleaved" by a few planes (smooth faces of broken rock).
function boulderGeometry(r, k) {
  let geo = new THREE.IcosahedronGeometry(1, 5);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const planes = [...Array(5)].map(() => ({ n: new THREE.Vector3(rand() * 2 - 1, rand() * 1.4 - 0.2, rand() * 2 - 1).normalize(), d: 0.6 + rand() * 0.25 }));
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const stretch = new THREE.Vector3(1.25 + rand() * 0.3, 0.75 + rand() * 0.2, 1 + rand() * 0.2).multiplyScalar(r);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + simplex.noise3d(v.x * 1.3 + k * 5, v.y * 1.3, v.z * 1.3) * 0.18 + simplex.noise3d(v.x * 3.1, v.y * 3.1 + k, v.z * 3.1) * 0.05);
    for (const { n, d } of planes) {
      const e = v.dot(n) - d;
      if (e > 0) v.addScaledVector(n, -e * 0.85);
    }
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    v.multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const data = new Float32Array(pos.count * 3);
  const tint = rand();
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    data.set([0.5 + 0.5 * smooth(-0.7, 0.3, ny), smooth(0.6, 0.95, ny) * 0.65, tint], i * 3);
  }
  geo.setAttribute('rockData', new THREE.BufferAttribute(data, 3));
  return geo;
}

// ---------- Detail texture (generated, seamless) ----------

// Periodic gradient noise: repeats every (px, py) cells, so the texture has no seams.
// (Self-contained: it also runs inside the worker.)
function periodicNoise(seedValue) {
  let s = seedValue;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  return (x, y, px, py) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = xi % px; // x and y are never negative here
    const y0 = yi % py;
    const a = perm[x0 & 255];
    const b = perm[(x0 + 1 === px ? 0 : x0 + 1) & 255];
    const ya = y0 & 255;
    const yb = (y0 + 1 === py ? 0 : y0 + 1) & 255;
    const h00 = perm[a + ya];
    const h10 = perm[b + ya];
    const h01 = perm[a + yb];
    const h11 = perm[b + yb];
    const n00 = gx[h00] * fx + gy[h00] * fy;
    const n10 = gx[h10] * (fx - 1) + gy[h10] * fy;
    const n01 = gx[h01] * fx + gy[h01] * (fy - 1);
    const n11 = gx[h11] * (fx - 1) + gy[h11] * (fy - 1);
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const w = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const nx0 = n00 + u * (n10 - n00);
    return (nx0 + w * (n01 + u * (n11 - n01) - nx0)) * 1.42;
  };
}

// N×N pixels of the texture: RG = detail normal, B = brightness of grain/fractures/stains,
// A = soft noise (streaks, lichen, clouds). Pure function (uses only periodicNoise, clamp, smooth).
function rockDetailPixels(N) {
  const pn = periodicNoise(1234567);
  const height = new Float32Array(N * N);
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    const v = j / N;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const k = j * N + i;
      let lumps = 0;
      for (let o = 0, f = 4, a = 0.5; o < 6; o++, f *= 2, a *= 0.5) lumps += pn(u * f, v * f, f, f) * a;
      const t = (lumps * 0.9 + 0.5) * 5; // flakes: soft steps
      const terr = (Math.floor(t) + smooth(0.7, 1, t - Math.floor(t))) / 5;
      const fv = pn(u * 5, v * 2, 5, 2) + 0.35 * pn(u * 10, v * 4, 10, 4) + 0.12 * pn(u * 40, v * 40, 40, 40);
      const crackV = 1 - smooth(0, 0.05, Math.abs(fv)); // almost vertical fractures
      const fh = pn(u * 2 + 7, v * 6, 2, 6) + 0.35 * pn(u * 4, v * 12 + 3, 4, 12) + 0.12 * pn(u * 40 + 9, v * 40, 40, 40);
      const crackH = (1 - smooth(0, 0.04, Math.abs(fh))) * smooth(-0.05, 0.3, pn(u * 3 + 5, v * 3, 3, 3));
      const grain = pn(u * 128, v * 128, 128, 128) * 0.6 + pn(u * 256, v * 256, 256, 256) * 0.4;
      height[k] = terr * 0.5 + lumps * 0.3 + grain * 0.035 - crackV * 0.2 - crackH * 0.14;
      const speck = pn(u * 192 + 0.5, v * 192 + 0.5, 192, 192);
      let l = 0.5 + lumps * 0.32 + pn(u * 6, v * 6 + 2, 6, 6) * 0.12 + (terr - 0.5) * 0.12 + grain * 0.06;
      l -= smooth(0.42, 0.62, speck) * 0.2; // dark minerals
      l += smooth(0.45, 0.65, -speck) * 0.12; // quartz
      l -= crackV * 0.42 + crackH * 0.3;
      const soft = 0.5 + 0.5 * (pn(u * 4 + 11, v * 4, 4, 4) * 0.6 + pn(u * 8, v * 8 + 7, 8, 8) * 0.3 + pn(u * 16 + 3, v * 16, 16, 16) * 0.15);
      data[k * 4 + 2] = clamp(l, 0, 1) * 255;
      data[k * 4 + 3] = clamp(soft, 0, 1) * 255;
    }
  }
  const strength = N / 96;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = height[j * N + ((i + 1) % N)] - height[j * N + ((i - 1 + N) % N)];
      const dy = height[((j + 1) % N) * N + i] - height[((j - 1 + N) % N) * N + i];
      const nx = -dx * strength;
      const ny = -dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (j * N + i) * 4;
      data[k] = (nx * inv * 0.5 + 0.5) * 255;
      data[k + 1] = (ny * inv * 0.5 + 0.5) * 255;
    }
  }
  return data;
}

// Generates the pixels in a Web Worker (does not freeze the page); if there is no worker, generates right here.
function rockDetailPixelsAsync(N) {
  const local = () => new Promise((resolve) => setTimeout(() => resolve(rockDetailPixels(N)), 0));
  let url = null;
  try {
    const src = `const clamp = ${clamp};\nconst smooth = ${smooth};\n${periodicNoise}\n${rockDetailPixels}\n`
      + 'onmessage = (e) => { const d = rockDetailPixels(e.data); postMessage(d, [d.buffer]); };';
    url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    return new Promise((resolve) => {
      const done = (fn) => { worker.terminate(); URL.revokeObjectURL(url); fn(); };
      worker.onmessage = (e) => done(() => resolve(e.data));
      worker.onerror = (e) => { e.preventDefault?.(); done(() => local().then(resolve)); };
      worker.postMessage(N);
    });
  } catch {
    if (url) URL.revokeObjectURL(url);
    return local();
  }
}

function detailTexture(data, N, renderer) {
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

// Synchronous detail texture (512² ≈ 4× faster than 1024² and identical to the naked eye: the shader
// already blends two scales).
export function makeRockDetail(renderer, N = 512) {
  return detailTexture(rockDetailPixels(N), N, renderer);
}

// Same texture, generated off the main thread. Resolves with the ready DataTexture.
export function makeRockDetailAsync(renderer, N = 512) {
  return rockDetailPixelsAsync(N).then((data) => detailTexture(data, N, renderer));
}

// Swaps the image of a texture already in use (rock and sea of clouds point to the same object)
// for the N×N version generated in the worker.
function refineRockDetail(tex, N) {
  return rockDetailPixelsAsync(N).then((data) => {
    tex.dispose(); // the size changes: frees the old texture on the GPU; it goes up again on the next frame
    tex.image = { data, width: N, height: N };
    tex.needsUpdate = true;
    return tex;
  });
}

// ---------- Triplanar material ----------

export const rockUniforms = {
  uDetail: { value: null },
  uRockLight: { value: new THREE.Color('#bdb1a0') },
  uRockDark: { value: new THREE.Color('#6a6058') },
  uStreak: { value: new THREE.Color('#8f8478') },
  uMoss: { value: new THREE.Color('#5e7a36') },
  uLichenA: { value: new THREE.Color('#b3b06a') },
  uLichenB: { value: new THREE.Color('#c99a5b') },
  uLowFog: { value: new THREE.Color('#ffffff') },
  uLowFogY: { value: new THREE.Vector2(-64, -55) }, // low fog: full at -64, gone at -55 (above the base)
  uBump: { value: 0.9 },
  uSnow: { value: new THREE.Color('#e6ecf2') },
  uDry: { value: new THREE.Color('#77705a') }, // dry moss/grass at the top
};

const ROCK_HEAD = /* glsl */ `
uniform sampler2D uDetail;
uniform vec3 uRockLight;
uniform vec3 uRockDark;
uniform vec3 uStreak;
uniform vec3 uMoss;
uniform vec3 uLichenA;
uniform vec3 uLichenB;
uniform vec3 uLowFog;
uniform vec2 uLowFogY;
uniform float uBump;
uniform vec3 uSnow;
uniform vec3 uDry;
varying vec3 vRock;
varying vec3 vWPos;
varying vec3 vWNrm;
`;

// Color: two detail scales projected on the 3 axes + large stains, streaks, lichen and moss.
const ROCK_COLOR = /* glsl */ `
vec3 wN = normalize(vWNrm);
vec3 bw = pow(abs(wN), vec3(4.0));
bw /= bw.x + bw.y + bw.z;
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
vec4 tX = texture2D(uDetail, vWPos.zy * 0.143);
vec4 tY = texture2D(uDetail, vWPos.xz * 0.143);
vec4 tZ = texture2D(uDetail, vWPos.xy * 0.143);
vec4 fX = texture2D(uDetail, ROT * vWPos.zy * 0.47 + 0.31);
vec4 fY = texture2D(uDetail, ROT * vWPos.xz * 0.47 + 0.31);
vec4 fZ = texture2D(uDetail, ROT * vWPos.xy * 0.47 + 0.31);
vec4 tex = tX * bw.x + tY * bw.y + tZ * bw.z;
vec4 fine = fX * bw.x + fY * bw.y + fZ * bw.z;
float lum = tex.b * 0.65 + fine.b * 0.35;
float macro = texture2D(uDetail, vWPos.xy * 0.019 + vec2(0.13, 0.71)).a;
float streakN = texture2D(uDetail, vec2(vWPos.x * 0.085, vWPos.y * 0.006 + 0.4)).a;
vec3 rock = mix(uRockDark, uRockLight, clamp(lum * 1.35 - 0.2 + (macro - 0.5) * 0.7, 0.0, 1.0));
rock *= mix(vec3(1.07, 1.0, 0.92), vec3(0.9, 0.96, 1.05), vRock.b);
float vertical = 1.0 - smoothstep(0.4, 0.8, abs(wN.y));
float streak = smoothstep(0.5, 0.72, streakN) * vertical;
rock = mix(rock, rock * uStreak * 0.7, streak * 0.8);
float lichenN = tex.a * 0.55 + fine.a * 0.45 + (lum - 0.5) * 0.35;
float lichen = smoothstep(0.64, 0.69, lichenN) * (1.0 - streak) * smoothstep(-0.3, 0.3, wN.z + wN.y);
rock = mix(rock, mix(uLichenA, uLichenB, smoothstep(0.35, 0.65, macro)) * (0.75 + 0.5 * lum), lichen * 0.75);
// green moss at the bottom; near the summit it turns into dry grass
vec3 mossC = mix(uMoss, uDry, smoothstep(-16.0, -2.0, vWPos.y));
rock = mix(rock, mossC * (0.55 + 0.9 * fine.b), vRock.g);
rock *= mix(0.4, 1.0, vRock.r);
// snow at the top: in patches, only where the surface is almost flat (plateau, steps near the summit)
float snowN = texture2D(uDetail, vWPos.xz * 0.04 + vec2(0.61, 0.27)).a * 0.75 + fine.a * 0.25;
float snowAlt = smoothstep(-14.0, -1.5, vWPos.y);
float snow = smoothstep(0.6, 0.9, wN.y) * smoothstep(0.62 - 0.22 * snowAlt, 0.7 - 0.2 * snowAlt, snowN) * snowAlt;
rock = mix(rock, uSnow * (0.88 + 0.12 * lum), snow);
diffuseColor.rgb = rock;
`;

// Normal: triplanar "whiteout blend" of the two scales, in world space → view space.
const ROCK_NORMAL = /* glsl */ `
{
  vec2 dX = (tX.rg * 2.0 - 1.0) + ((fX.rg * 2.0 - 1.0) * ROT) * 0.6;
  vec2 dY = (tY.rg * 2.0 - 1.0) + ((fY.rg * 2.0 - 1.0) * ROT) * 0.6;
  vec2 dZ = (tZ.rg * 2.0 - 1.0) + ((fZ.rg * 2.0 - 1.0) * ROT) * 0.6;
  vec3 nX = vec3(dX * uBump + wN.zy, abs(wN.x));
  vec3 nY = vec3(dY * uBump + wN.xz, abs(wN.y));
  vec3 nZ = vec3(dZ * uBump + wN.xy, abs(wN.z));
  vec3 wBump = normalize(nX.zyx * bw.x + nY.xzy * bw.y + nZ.xyz * bw.z);
  normal = normalize((viewMatrix * vec4(wBump, 0.0)).xyz);
}
`;

export function rockMaterial(detail) {
  rockUniforms.uDetail.value = detail;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rockUniforms);
    sh.vertexShader = 'attribute vec3 rockData;\nvarying vec3 vRock;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
  vRock = rockData;
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWNrm = normalize(mat3(modelMatrix) * objectNormal);`,
    );
    sh.fragmentShader = ROCK_HEAD + sh.fragmentShader
      .replace('#include <map_fragment>', ROCK_COLOR)
      .replace('#include <normal_fragment_maps>', ROCK_NORMAL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= mix(0.3, 1.0, vRock.r);')
      .replace('#include <fog_fragment>', LOW_FOG);
  };
  return mat;
}

// Low fog (the sea of clouds rising up the wall), with an irregular edge like wisps of cloud.
const LOW_FOG = /* glsl */ `#include <fog_fragment>
  float lowN = texture2D(uDetail, vec2(vWPos.x * 0.013 + vWPos.z * 0.009, vWPos.y * 0.035) + vec2(0.37, 0.11)).a;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uLowFog, 1.0 - smoothstep(uLowFogY.x, uLowFogY.y, vWPos.y + (lowN - 0.5) * 6.0));`;

// ---------- Grass ----------

export const grassTime = { value: 0 };

function tuftGeometry() {
  const pos = [];
  const col = [];
  const nrm = [];
  // altitude grass: dry, yellowish (no green lawn near the summit)
  const base = new THREE.Color('#4a4a2c');
  const tip = new THREE.Color('#c2b98a');
  for (let b = 0; b < 9; b++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.06;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.12 + rand() * 0.22;
    const lean = 0.04 + rand() * 0.12;
    const la = a + (rand() - 0.5);
    const w = 0.012 + rand() * 0.01;
    const px = Math.cos(a + Math.PI / 2) * w;
    const pz = Math.sin(a + Math.PI / 2) * w;
    pos.push(x - px, 0, z - pz, x + px, 0, z + pz, x + Math.cos(la) * lean, h, z + Math.sin(la) * lean);
    col.push(...base, ...base, ...tip);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

function buildGrass(scene) {
  const spots = [];
  // summit plateau: a few low, sparse tufts (at 8,848 m there is almost no grass)
  for (let i = 0; i < 260; i++) {
    const x = mix(XE0 + 0.4, WALL.right - 1, rand());
    const back = i < 50 ? 0.1 + rand() * 0.5 : 0.3 + 9 * rand() ** 2;
    const s = 0.45 + rand() * 0.3;
    if (n2(x * 0.22, (frontZ(x) - back) * 0.22) < -0.2) continue;
    spots.push([x, plateau(x, back), frontZ(x) - back, s]);
  }
  // ledges of the face (from the base camp up to near the summit)
  for (let i = 0, found = 0; i < 6000 && found < 330; i++) {
    const x = mix(-6, 22, rand());
    const y = mix(BASE_LEDGE_Y + 1.5, -1.2, rand());
    if (y > crest(x) - RT - 0.3) continue;
    const dzdy = (wallZ(x, y + 0.08) - wallZ(x, y - 0.08)) / 0.16;
    const dzdx = (wallZ(x + 0.08, y) - wallZ(x - 0.08, y)) / 0.16;
    const ny = -dzdy / Math.hypot(dzdx, dzdy, 1);
    if (ny < 0.55 || n2(x * 0.4, y * 0.4) < -0.25) continue;
    spots.push([x, y - 0.03, wallZ(x, y) + 0.02, 0.6 + rand() * 0.6]);
    found++;
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassTime;
    // The blades have an "up" normal on both faces: without this the back faces downward and the blade
    // turns black (it only receives light from the ground).
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
  #endif
  float sway = sin(uTime * 1.7 + ip.x * 0.9 + ip.z * 0.7) * 0.6 + sin(uTime * 3.3 + ip.x * 2.3) * 0.25;
  transformed.x += sway * 0.12 * position.y;`,
    );
  };
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  spots.forEach(([x, y, z, s], i) => {
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.12 + rand() * 0.05, 0.12 + rand() * 0.14, 0.6 + rand() * 0.25));
  });
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ---------- Ledges: base camp and camps ----------

// Wall just above a ledge (the top starts slightly inside the rock).
const ledgeBackZ = (x, y) => Math.min(wallZ(x, y + 0.05), wallZ(x, y + 0.35));

// Relief of the top at s units from the wall: flat next to the rock (where you step), small stones further out.
function shelfBump(x, s, D, lip) {
  const out = smooth(1.3, 2.6, s) * (1 - smooth(D - lip - 0.7, D - lip, s));
  // the edge sags a little, irregularly: the ledge line is not straight from afar
  const droop = smooth(Math.min(Math.max(1.4, D * 0.45), (D - lip) * 0.6), D - lip, s) * (0.08 + 0.3 * (0.5 + 0.5 * n2(x * 0.13, 3.7))) * Math.min(1, D / 4);
  return out * (n2(x * 0.9, s * 0.9 + 11) * 0.1 + n2(x * 2.3, s * 2.3) * 0.04) - Math.max(0, s - 1.3) * 0.015 - droop;
}

// Ledge attached to the wall, assembled column by column (xs) from a (z, y) profile that comes out of the
// rock: flat top, rounded edge and, underneath, a cliff that fades into the fog (base) or a
// slab going back into the rock (camps). At the tips (taper → 0) the profile sinks into the wall.
function ledgeGeometry({ xs, top, depth, taper, base }) {
  const lip = base ? 0.45 : 0.22;
  const NT = base ? 10 : 6;
  const ND = 16;
  const pos = [];
  const data = [];
  let cols = 0;
  for (const x of xs) {
    const w = taper(x);
    const yT = top(x);
    const D = Math.max(depth(x), lip + 0.4);
    const zb = ledgeBackZ(x, yT);
    const P = [[zb - 0.9, yT, 0], [zb - 0.35, yT, 0]]; // [z, y, role: 0 top · 1 front · 2 underneath]
    for (let i = 0; i <= NT; i++) {
      const s = ((D - lip) * i) / NT;
      P.push([zb + s, yT + shelfBump(x, s, D, lip), 0]);
    }
    const y0 = P.at(-1)[1];
    for (let i = 1; i <= 4; i++) {
      const a = (Math.PI / 2) * (i / 4);
      P.push([zb + D - lip + lip * Math.sin(a), y0 - lip + lip * Math.cos(a), 1]);
    }
    if (base) {
      // cliff below the base, leaning slightly outward, until it vanishes under the sea of clouds
      for (let i = 1; i <= ND; i++) {
        const t = (i / ND) ** 1.25 * (y0 - lip + 77);
        const y = y0 - lip - t;
        const z = zb + D + 0.24 * t + (n2(x * 0.22, y * 0.22) * 0.6 + n2(x * 0.7, y * 0.7 + 4) * 0.18) * smooth(0, 1.5, t);
        P.push([Math.max(z, wallZ(x, y) + 0.5), y, 1]);
      }
    } else {
      // slab: short front, bottom corner and, underneath, a long wedge of rock that goes back to the
      // wall (corbel): the ledge comes out of the face instead of looking like a loose shelf
      const th = 0.5 + 0.12 * n2(x * 0.6, yT);
      P.push([zb + D - 0.03, y0 - th + 0.1, 1], [zb + D - 0.15, y0 - th - 0.02, 2]);
      const yEnd = y0 - th - (0.9 + 0.25 * n2(x * 0.35, yT + 3)) * D;
      const zEnd = Math.min(zb, wallZ(x, yEnd)) - 0.4;
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const y = mix(y0 - th - 0.1, yEnd, t);
        const rough = (n2(x * 0.9, y * 0.9 + 5) * 0.12 + n2(x * 2.1, y * 2.1) * 0.05) * Math.sin(Math.PI * t);
        P.push([mix(zb + D - 0.4, zEnd, t) + rough, y, 2]); // straight underside, diagonal down to the wall
      }
    }
    cols = P.length;
    for (const [zo, yo, role] of P) {
      const zIn = Math.min(zb, wallZ(x, yo)) - 0.35;
      const y = base ? yo : mix(yT - 0.2, yo, w);
      pos.push(x, y, mix(zIn, zo, w));
      const s = zo - zb;
      const ao = role === 0 ? 0.55 + 0.45 * smooth(-0.4, 1.0, s) : role === 1 ? 0.95 : mix(0.5, 0.82, smooth(0, D, s));
      const moss = role === 0 ? 0.3 * smooth(0.25, 0.7, n2(x * 0.35, s * 0.35 + 2)) * smooth(0.5, 1.5, s) : 0;
      data.push(ao, moss, 0.5 + 0.3 * n2(x * 0.1 + 5, yo * 0.1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('rockData', new THREE.Float32BufferAttribute(data, 3));
  geo.setIndex(gridIndex(xs.length, cols));
  geo.computeVertexNormals();
  return geo;
}

const range = (a, b, step) => {
  const xs = [];
  for (let x = a; x < b - 1e-6; x += typeof step === 'function' ? step(x) : step) xs.push(x);
  xs.push(b);
  return xs;
};

// Base camp: ledge along the whole foot of the wall, on the floor of whoever has 0 tokens.
// Flat in the climbers' area; deeper to the right (tents) and descending into the fog on the flank.
const BASE_X0 = (() => {
  let m = -Infinity;
  for (let y = -77; y <= BASE_LEDGE_Y + 2; y += 0.5) m = Math.max(m, edgeX(y));
  return m + 0.6; // starts after the cliff edge at any height of the lower wall
})();
const BASE_X1 = 74;
const baseTop = (x) => BASE_LEDGE_Y - 0.16 * ramp(x - 30, 6);
const baseDepth = (x) => 3.3 + 2.3 * smooth(12.5, 16, x) * (1 - smooth(28, 34, x)) + n2(x * 0.11, 7.7) * 0.6 + n2(x * 0.4, 1.3) * 0.15;
const baseTaper = (x) => smooth(BASE_X0, BASE_X0 + 1.6, x) * (1 - smooth(BASE_X1 - 6, BASE_X1, x));

// Base camp floor at x: height and flat depth range (from the wall to the edge).
// To put people standing at the base, use z between zWall + 0.4 and zFront - 0.5.
export function baseGround(x) {
  const zWall = ledgeBackZ(x, baseTop(x));
  return { y: baseTop(x), zWall, zFront: zWall + baseDepth(x) * baseTaper(x) };
}

// ---------- Tents, backpacks and bunting (primitives, merged by material) ----------

// Glow of the tents at night (lantern inside): 0 by day, ~1 at night. The environment updates it.
export const campGlow = { value: 0 };

const TENT_COLORS = ['#ff7a1a', '#ffc21a', '#d93a2b', '#2f7fd8', '#3fae5a'];
const FLAG_COLORS = ['#2f6fd6', '#f4f4f0', '#d8332a', '#2e9e4f', '#f2c12e'];
const PROP = {
  dome: new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  ridge: new THREE.CylinderGeometry(1, 1, 1, 3, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  pole: new THREE.CylinderGeometry(1, 1, 1, 6),
  barrel: new THREE.CylinderGeometry(1, 1, 1, 12),
  coil: new THREE.TorusGeometry(1, 0.14, 6, 18),
  flag: new THREE.PlaneGeometry(0.24, 0.17),
};
let propMats = null;
function propMaterials() {
  if (propMats) return propMats;
  const tents = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.72 });
  tents.onBeforeCompile = (sh) => {
    sh.uniforms.uCampGlow = campGlow;
    sh.fragmentShader = 'uniform float uCampGlow;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * uCampGlow * 0.9;',
    );
  };
  propMats = {
    tents,
    gear: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }),
    flags: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }),
  };
  return propMats;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
// Part = base geometry + color + transform (position, Euler rotation, scale).
// 'YXZ' order: tilts/lays the part down first and only then rotates around the vertical axis.
const part = (geo, color, [x, y, z], [rx, ry, rz], [sx, sy, sz], order = 'XYZ') => ({
  geo, color, m: new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order)), _s.set(sx, sy, sz)),
});

// Merges the parts into a single geometry (per-vertex color): one draw call per material.
function mergeParts(parts) {
  if (!parts.length) return null;
  const c = new THREE.Color();
  return mergeGeometries(parts.map(({ geo, color, m }) => {
    const g = geo.clone();
    g.applyMatrix4(m);
    c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }));
}

// Igloo tent (faceted dome) or A-frame (prism), with the door facing the camera (+z).
// The door is a dark half dome lying in front: an open entrance with a bit of volume.
function tentParts(out, x, y, z, r, color, ry, kind) {
  const dark = `#${new THREE.Color(color).multiplyScalar(0.3).getHexString()}`; // door: the fabric in shadow
  const front = kind === 'ridge' ? 0.85 : 0.93;
  if (kind === 'ridge') {
    // triangular prism (edge up) lying along z
    out.push(part(PROP.ridge, color, [x, y + r * 0.39, z], [-Math.PI / 2, ry, 0], [r * 0.82, r * 1.7, r * 0.82], 'YXZ'));
  } else {
    out.push(part(PROP.dome, color, [x, y - 0.02, z], [0, ry, 0], [r * 1.15, r * 0.78, r]));
  }
  const [dw, dh] = kind === 'ridge' ? [0.34, 0.62] : [0.4, 0.55];
  out.push(part(PROP.dome, dark, [x + Math.sin(ry) * r * front, y, z + Math.cos(ry) * r * front], [Math.PI / 2, ry, 0], [r * dw, r * 0.14, r * dh], 'YXZ'));
}

function backpackParts(out, x, y, z, color, ry) {
  out.push(part(PROP.box, color, [x, y + 0.26, z], [0.12, ry, 0.05], [0.36, 0.52, 0.24]));
  out.push(part(PROP.box, '#2b2f36', [x, y + 0.54, z - 0.01], [0.12, ry, 0.05], [0.33, 0.1, 0.26]));
  out.push(part(PROP.barrel, '#c9d84a', [x, y + 0.64, z - 0.03], [0, ry, Math.PI / 2], [0.07, 0.42, 0.07])); // rolled foam mat
}

function flagLineParts(gear, flags, a, b, sag) {
  const h = 2.3;
  for (const p of [a, b]) gear.push(part(PROP.pole, '#8a8378', [p.x, p.y + h / 2, p.z], [0, 0, 0], [0.035, h, 0.035]));
  const n = 16;
  const ry = -Math.atan2(b.z - a.z, b.x - a.x);
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3(mix(a.x, b.x, t), mix(a.y, b.y, t) + h - 0.08 - sag * 4 * t * (1 - t), mix(a.z, b.z, t));
    if (prev) {
      const mid = prev.clone().add(p).multiplyScalar(0.5);
      const len = prev.distanceTo(p);
      const tilt = Math.atan2(p.y - prev.y, Math.hypot(p.x - prev.x, p.z - prev.z));
      gear.push(part(PROP.pole, '#d8d2c4', [mid.x, mid.y, mid.z], [0, ry, tilt - Math.PI / 2], [0.008, len, 0.008]));
      flags.push(part(PROP.flag, FLAG_COLORS[i % FLAG_COLORS.length], [mid.x, mid.y - 0.1, mid.z], [0.12 * Math.sin(i * 2.3), ry, tilt], [1, 1, 1]));
    }
    prev = p;
  }
}

// Merges the lists of parts into meshes (tents, gear, bunting) inside a group.
function propsGroup({ tents = [], gear = [], flags = [] }) {
  const mats = propMaterials();
  const group = new THREE.Group();
  for (const [parts, mat, shadow] of [[tents, mats.tents, true], [gear, mats.gear, true], [flags, mats.flags, false]]) {
    const geo = mergeParts(parts);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// Point on top of the base camp, s units from the wall.
function basePoint(x, s) {
  const g = baseGround(x);
  return { x, y: g.y + shelfBump(x, s, baseDepth(x), 0.45), z: g.zWall + s };
}

function buildBaseCamp(scene, mat) {
  const shelf = new THREE.Mesh(ledgeGeometry({ xs: range(BASE_X0, BASE_X1, (x) => (x < 34 ? 0.3 : 0.9)), top: baseTop, depth: baseDepth, taper: baseTaper, base: true }), mat);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  scene.add(shelf);

  // Tents and gear to the right of the climbers' area (x > 15), away from the wall.
  const tents = [];
  const gear = [];
  const flags = [];
  const spots = [[16.4, 2.4, 0.95, 'dome'], [18.9, 3.4, 1.05, 'dome'], [21.4, 2.3, 0.85, 'ridge'], [23.9, 3.2, 1.0, 'dome'], [26.6, 2.5, 0.8, 'ridge']];
  spots.forEach(([x, s, r, kind], i) => {
    const p = basePoint(x, s);
    tentParts(tents, x, p.y, p.z, r, TENT_COLORS[i % TENT_COLORS.length], (hash3(i, 3, 9) - 0.5) * 0.7, kind);
  });
  for (const [x, s, color, ry] of [[17.7, 4.1, '#c0392b', 0.4], [22.6, 3.9, '#34495e', -0.3], [25.2, 1.2, '#16a085', 0.9]]) {
    const p = basePoint(x, s);
    backpackParts(gear, x, p.y, p.z, color, ry);
  }
  for (const [x, s] of [[20.2, 1.0], [20.75, 1.15]]) {
    const p = basePoint(x, s);
    gear.push(part(PROP.barrel, '#2f6fbf', [x, p.y + 0.3, p.z], [0, 0, 0], [0.21, 0.6, 0.21]));
  }
  const c = basePoint(24.6, 4.4);
  gear.push(part(PROP.coil, '#e8742a', [c.x, c.y + 0.04, c.z], [Math.PI / 2, 0, 0], [0.24, 0.24, 0.24]));
  flagLineParts(gear, flags, basePoint(15.3, 4.0), basePoint(25.8, 4.6), 0.45);
  const props = propsGroup({ tents, gear, flags });
  scene.add(props);

  // A few fallen boulders on the outer part of the ledge (outside the climbers' lanes).
  [[13.8, 3.0, 0.55], [28.2, 3.9, 0.95], [31.5, 2.4, 0.6], [36.5, 2.2, 0.85]].forEach(([x, s, r], k) => {
    const p = basePoint(x, s);
    const b = new THREE.Mesh(boulderGeometry(r, k + 20), mat);
    b.position.set(p.x, p.y - 0.18 * r, p.z);
    b.rotation.y = rand() * Math.PI * 2;
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
  });
  return { shelf, props };
}

// ---------- Camps (Camp 1–4) ----------

// Camp ledges on the current scale, from state.mountain and S (season.summitTokens).
// Each one: { kind, n, altitude, tokens, y (token line, for plaque/ruler), ledgeY (ledge
// floor = y - FEET_DROP), x0, x1, depth, anchor {x, y, z} (point on the floor, at the front, for the plaque) }.
// They sit to the right of the lanes (x > 15) so as not to cut anyone off.
export function campLedges(mountain, S) {
  return campYs(mountain, S).filter((c) => c.kind === 'camp').map((c, i) => {
    const x0 = 15.4 + hash3(i, 7, 1) * 1.4;
    const x1 = x0 + 5.6 + hash3(i, 7, 2) * 1.8;
    const ledgeY = c.y - FEET_DROP;
    const depth = 1.75 + hash3(i, 7, 3) * 0.45;
    const xm = (x0 + x1) / 2;
    return { ...c, ledgeY, x0, x1, depth, anchor: { x: xm, y: ledgeY, z: ledgeBackZ(xm, ledgeY) + depth * 0.6 } };
  });
}

// Camp ledges in the scene. Call update(state.mountain, S) on every new state: it only rebuilds
// when the camps change (the height does not depend on S) and returns the campLedges list.
export function createCampLedges(scene, mat = rockMat) {
  const group = new THREE.Group();
  group.name = 'camps';
  scene.add(group);
  let key = null;
  const clear = () => {
    for (const o of [...group.children]) {
      o.traverse((m) => m.geometry?.dispose());
      group.remove(o);
    }
  };
  const handle = {
    group,
    list: [],
    update(mountain, S) {
      const list = campLedges(mountain, S);
      handle.list = list;
      const k = list.map((c) => `${c.kind}${c.n}:${c.ledgeY.toFixed(3)}`).join('|');
      if (k === key) return list;
      key = k;
      clear();
      if (!list.length) return list;
      // all ledges in a single mesh, and all tents/backpacks in another (few draw calls)
      const geos = [];
      const tents = [];
      const gear = [];
      list.forEach((c, i) => {
        const taper = (x) => smooth(c.x0, c.x0 + 1.8, x) * (1 - smooth(c.x1 - 1.8, c.x1, x)); // the tips enter the rock slowly
        const depth = (x) => c.depth * (0.85 + 0.15 * n2(x * 0.5, i * 3.1)) * (0.75 + 0.25 * smooth(c.x0, c.x0 + 2.5, x));
        geos.push(ledgeGeometry({ xs: range(c.x0, c.x1, 0.25), top: () => c.ledgeY, depth, taper, base: false }));
        const xt = c.x0 + (c.x1 - c.x0) * (0.55 + 0.1 * hash3(i, 8, 1));
        const zt = ledgeBackZ(xt, c.ledgeY) + 0.95;
        tentParts(tents, xt, c.ledgeY, zt, 0.58, TENT_COLORS[(i + 1) % TENT_COLORS.length], (hash3(i, 8, 2) - 0.5) * 0.6, 'dome');
        const xb = xt - 1.0;
        backpackParts(gear, xb, c.ledgeY, ledgeBackZ(xb, c.ledgeY) + 0.55, ['#c0392b', '#34495e', '#8e44ad', '#16a085'][i % 4], 0.3);
      });
      const ledges = new THREE.Mesh(mergeGeometries(geos), mat ?? rockMaterial(rockUniforms.uDetail.value));
      for (const g of geos) g.dispose();
      ledges.castShadow = true;
      ledges.receiveShadow = true;
      group.add(ledges, propsGroup({ tents, gear }));
      return list;
    },
    dispose() {
      clear();
      scene.remove(group);
    },
  };
  return handle;
}

// ---------- Assembly ----------

let rockMat = null;

// Builds the wall, the plateau, the boulders, the grass and the base camp. The detail texture comes out
// already in its final version (detailSize², synchronous). With asyncDetail, a quick preview comes out (128²) and the
// final one comes from a worker without freezing the page (note: a background tab can make the worker
// very slow). `ready` resolves when the final texture is ready.
export function buildRock(scene, renderer, { detailSize = 512, asyncDetail = false } = {}) {
  const detail = makeRockDetail(renderer, asyncDetail ? 128 : detailSize);
  const ready = asyncDetail ? refineRockDetail(detail, detailSize) : Promise.resolve(detail);
  const mat = rockMaterial(detail);
  rockMat = mat;
  const face = new THREE.Mesh(faceGeometry(), mat);
  const top = new THREE.Mesh(topGeometry(), mat);
  for (const m of [face, top]) {
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  // The face (the heaviest mesh) does not cast shadows: in the shadow map it cost almost half of the
  // frame on an integrated GPU; the shading of the cracks already comes from per-vertex occlusion.
  face.castShadow = false;
  // Boulders: [x, distance from the edge, radius]; outside the area where the leaders stand.
  const rocks = [[XE0 + 1.2, 1.0, 1.25], [-2.4, 2.6, 0.6], [7.7, 0.9, 0.85], [9.5, 2.7, 0.5], [12.7, 1.2, 1.15], [15.6, 3.3, 0.7], [-0.7, 5.2, 0.8], [3.4, 7.2, 0.55], [19, 1.6, 1.4], [6.6, 4.4, 0.4]];
  rocks.forEach(([x, back, r], k) => {
    const b = new THREE.Mesh(boulderGeometry(r, k), mat);
    b.position.set(x, plateau(x, back) - 0.18 * r, frontZ(x) - back);
    b.rotation.y = rand() * Math.PI * 2;
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
  });
  buildGrass(scene);
  const base = buildBaseCamp(scene, mat);
  return { detail, material: mat, ready, base };
}
