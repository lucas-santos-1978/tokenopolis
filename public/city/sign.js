// The names on the hill: a mountain of its own behind the region, with white letters standing on its
// slope, the way a famous hillside does it. The upper row is the region's number one, the lower row the
// week's leader (one row when it is the same person). The letters are flat sheets on poles (a few layers,
// so they have an edge), cut from one canvas of glyphs; by night they are floodlit. The sign does not
// grow with the region: whoever calls gives the room for the upper name, and everything follows from it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { matte, mats, lit, DARK, WARM_LIGHT } from './buildings.js';
import { seed } from './world.js';

const CELL = 256, PX = 180, BASE = 202, PAD = 12; // the glyph canvas: a cell per letter, the baseline's row in it
const FONT = `900 ${PX}px Nunito, "Segoe UI", sans-serif`;
const TALL = [0.089, 0.052]; // how tall the letters may stand, the upper row and the lower one, as a share of the upper name's room
const NARROW = 0.86; // the letters are a little condensed, like the real ones
const TILT = 0.62; // the region's camera looks down at this angle (fitRegion): what must fit in its picture
const BELL = 1.6; // the mountain's profile: height = top × (1 − ρ²)^BELL, steep in the middle and gentle at the foot
let FRONT = null, BODY = null, atlas = null; // one pair of materials for every sign; the glyphs of the current one

function materials() {
  if (FRONT) return;
  FRONT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, envMapIntensity: 0.3, alphaTest: 0.4, emissive: '#fff0d6', emissiveIntensity: 0, fog: false });
  BODY = new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.9, metalness: 0, envMapIntensity: 0.3, alphaTest: 0.4, side: THREE.DoubleSide, fog: false });
  mats.add(FRONT); mats.add(BODY); lit.push({ m: FRONT, i: 0.55 });
}
// One canvas with every letter the rows need: { tex, cap (the height of a capital, in pixels), of: letter → { u0, u1, v0, v1, w } }
function glyphs(text) {
  const chars = [...new Set([...text].filter((c) => c.trim()))], cols = Math.min(8, Math.max(1, chars.length)), rows = Math.max(1, Math.ceil(chars.length / cols));
  const cv = document.createElement('canvas'); cv.width = cols * CELL; cv.height = rows * CELL;
  const x = cv.getContext('2d'); x.font = FONT; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineJoin = 'round';
  const cap = x.measureText('H').actualBoundingBoxAscent || PX * 0.7, of = new Map();
  chars.forEach((c, i) => {
    const cx = (i % cols) * CELL + CELL / 2, cy = Math.floor(i / cols) * CELL, w = Math.min(CELL - 2 * PAD, x.measureText(c).width);
    x.strokeText(c, cx, cy + BASE, CELL - 2 * PAD); x.fillText(c, cx, cy + BASE, CELL - 2 * PAD); // the stroke fattens them: they are read from far away
    of.set(c, { w, u0: (cx - w / 2 - PAD) / cv.width, u1: (cx + w / 2 + PAD) / cv.width, v0: 1 - (cy + CELL) / cv.height, v1: 1 - cy / cv.height });
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, cap, of };
}
// a quad in the XY plane, facing +z, with the glyph's corner of the canvas
function quad(w, y0, y1, g, z) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, y0, z, w / 2, y0, z, w / 2, y1, z, -w / 2, y1, z], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([g.u0, g.v0, g.u1, g.v0, g.u1, g.v1, g.u0, g.v1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  return geo;
}
// The mountain's skin: rings round the top, each point at the bell's height, a little off where no letter stands.
function bell(a, h, b, r, calm) {
  const NR = 15, NS = 60, pos = [], idx = [];
  pos.push(0, h * (1 + (r() - 0.5) * 0.06), 0);
  for (let i = 1; i <= NR; i++) for (let j = 0; j < NS; j++) {
    const rho = i / NR, th = (j / NS) * Math.PI * 2 + (i % 2) * (Math.PI / NS), x = a * rho * Math.cos(th), z = b * rho * Math.sin(th);
    const y = h * (1 - rho * rho) ** BELL, k = i === NR ? 0 : calm(x, y, z) ? 0.02 : 0.2;
    pos.push(x * (1 + (r() - 0.5) * k * 0.5), y * (1 + (r() - 0.5) * k) - (i === NR ? 2 : 0), z * (1 + (r() - 0.5) * k * 0.5));
  }
  for (let j = 0; j < NS; j++) idx.push(0, 1 + ((j + 1) % NS), 1 + j);
  for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) {
    const p = 1 + (i - 1) * NS, q = p + NS, j1 = (j + 1) % NS;
    idx.push(p + j, p + j1, q + j, p + j1, q + j1, q + j);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const flat = geo.toNonIndexed(); flat.computeVertexNormals(); geo.dispose();
  return flat;
}

// a plain quad in the XY plane from x0 to x1, for the pointer (no picture on it)
function pane(x0, x1, y0, y1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  return geo;
}

// depth: the region's side along z; maxH: its tallest building; rows: [{ text }] (the upper one first, 1
// or 2); wide: how wide the upper name may get before its letters shrink (the sign's whole size comes from it).
// Returns { group, anchors: [{ x, y, z, h, w, base }] (a caption's place by each row), frame (how much
// more ground the region's picture needs behind the map), font (the letters came out in the page's font),
// pick(raycaster) → { row, dist, x, h, z } | null, show(on) (the names, not the mountain), dispose }.
export function makeHillSign({ depth, maxH = 0, rows, wide = 270 }) {
  materials();
  rows = rows.filter((q) => q?.text);
  const g = new THREE.Group(), r = seed('hillsign'), out = { group: g, anchors: [], frame: 0, font: true, pick: () => null, show() {}, dispose() {} };
  if (!rows.length) return out;
  out.font = !document.fonts || document.fonts.check(FONT);
  atlas?.tex.dispose();
  atlas = glyphs(rows.map((q) => q.text).join(''));
  FRONT.map = BODY.map = atlas.tex; FRONT.emissiveMap = atlas.tex; FRONT.needsUpdate = BODY.needsUpdate = true;

  // each row's letters, laid out flat first: the upper row is the big one
  const s0 = 1 / atlas.cap;
  let above = Infinity; // the lower row is always the smaller one, however long the upper name
  const lay = rows.map((row, k) => {
    const room = wide * (k ? 0.7 : 1);
    let H = Math.min(wide * (TALL[k] ?? TALL.at(-1)), above * 0.75), w = 0, list;
    for (let pass = 0; pass < 2; pass++) { // the letters shrink when the name is long
      const gap = H * 0.2; w = 0; list = [];
      for (const ch of row.text) {
        const gl = atlas.of.get(ch);
        if (!gl) { w += H * 0.5; continue; }
        const lw = (gl.w + 2 * PAD) * s0 * H * NARROW;
        list.push({ gl, lw, x: w + lw / 2 }); w += lw + gap;
      }
      w -= gap;
      if (w <= room) break;
      H *= room / w;
    }
    for (const l of list) l.x -= w / 2;
    above = H;
    return { H, w, list, at: k ? 0.3 : rows.length > 1 ? 0.63 : 0.5 }; // how high on the mountain the row stands
  });

  // The mountain: a green back behind the region, wide enough for the upper row to stand level on it and
  // high enough for the names to show above most of the skyline.
  const W = Math.max(...lay.map((l) => l.w));
  const h = Math.max(lay[0].H * 3.7, maxH * 0.7), a = Math.max(W * 1.25, h * 2.2), b = Math.max(a * 0.34, h * 1.3);
  const cz = -(depth / 2 + 6 + b), rise = (x, z) => 1 - (x / a) ** 2 - ((z - cz) / b) ** 2, yOf = (x, z) => h * Math.max(0, rise(x, z)) ** BELL;
  const zAt = (x, y0) => cz + b * Math.sqrt(Math.max(0.01, 1 - (y0 / h) ** (1 / BELL) - (x / a) ** 2)); // the slope's line at one height, on the region's side
  const bands = lay.map((row) => ({ y0: h * row.at - row.H * 0.7, y1: h * row.at + row.H * 1.7, w: row.w / 2 + row.H * 1.5 })); // where the letters stand
  const onSign = (x, y, z) => z > 0 && bands.some((q) => y > q.y0 && y < q.y1 && Math.abs(x) < q.w);
  const green = matte('#5d8c5f', { flatShading: true }), skin = bell(a, h, b, r, onSign), rough = new THREE.SphereGeometry(1, 11, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const hill = new THREE.Mesh(skin, green); hill.position.set(0, 0, cz); hill.receiveShadow = true; g.add(hill);
  // the ground under a point, from the mountain's own faces (they are flat: the formula alone would bury a letter here and there)
  hill.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
  const ground = (x, z) => { ray.set(from.set(x, h * 3, z), DOWN); return ray.intersectObject(hill, false)[0]?.point.y ?? yOf(x, z); };
  for (const [dx, k, up] of [[-0.5, 0.42, 0.95], [0.46, 0.4, 0.8], [0.02, 0.32, 1.12], [-0.9, 0.3, 0.5], [0.92, 0.32, 0.45]]) { // the ridge behind it
    const m = new THREE.Mesh(rough, green); m.scale.set(a * k, h * up * (0.9 + r() * 0.2), b * (0.5 + r() * 0.3)); m.position.set(a * dx, -2, cz - b * (0.45 + r() * 0.3)); m.rotation.y = (r() - 0.5) * 0.6; g.add(m);
  }

  const fronts = [], bodies = [], steel = [], lamps = [], panes = [], cuts = [], tips = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  let need = 0;
  lay.forEach((row) => {
    const H = row.H, y0 = h * row.at, thick = H * 0.05, cell = CELL * s0 * H, drop = (CELL - BASE) * s0 * H;
    row.list.forEach((l, i) => {
      const z = zAt(l.x, y0), zf = z + thick * 0.6, gy = Math.max(ground(l.x - l.lw * 0.4, zf), ground(l.x, zf), ground(l.x + l.lw * 0.4, zf)); // it stands on the highest ground under it
      const lift = H * (0.03 + r() * 0.07); // and each one a little higher or lower, as on the real hillside
      const yaw = Math.atan2(l.x / (a * a), (z - cz) / (b * b)) * 0.45 + (r() - 0.5) * 0.05;
      M.compose(P.set(l.x, gy + lift, zf), Q.setFromEuler(E.set(-0.035 + (r() - 0.5) * 0.03, yaw, 0)), ONE);
      fronts.push(quad(l.lw, -drop, cell - drop, l.gl, 0).applyMatrix4(M));
      // for the pointer: the letter and half of the gap to each neighbor (the space between two words too)
      const p = row.list[i - 1], n = row.list[i + 1], x0 = p ? (p.x + p.lw / 2 + l.x - l.lw / 2) / 2 : l.x - l.lw / 2 - H * 0.15, x1 = n ? (l.x + l.lw / 2 + n.x - n.lw / 2) / 2 : l.x + l.lw / 2 + H * 0.15;
      panes.push(pane(x0 - l.x - H * 0.04, x1 - l.x + H * 0.04, -H * 0.1, H * 1.15).applyMatrix4(M));
      for (let i = 1; i <= 3; i++) bodies.push(quad(l.lw, -drop, cell - drop, l.gl, (-thick * i) / 3).applyMatrix4(M));
      // the poles behind it, down into the slope, and a brace leaning back
      for (const sx of l.lw > H * 0.55 ? [-0.3, 0.3] : [0]) {
        steel.push(new THREE.BoxGeometry(H * 0.035, H * 1.3, H * 0.035).translate(sx * l.lw, H * 0.25, -thick - H * 0.03).applyMatrix4(M));
        steel.push(new THREE.BoxGeometry(H * 0.03, H * 0.95, H * 0.03).rotateX(0.62).translate(sx * l.lw, H * 0.3, -thick - H * 0.3).applyMatrix4(M));
      }
    });
    cuts.push(panes.length * 2); tips.push(y0 + H * 1.55);
    // the floodlights at the foot of the row
    const n = Math.max(2, Math.round(row.w / (H * 1.6)));
    for (let i = 0; i < n; i++) { const x = -row.w / 2 + (row.w * (i + 0.5)) / n, z = zAt(x, y0) + H * 0.5; lamps.push(new THREE.BoxGeometry(H * 0.09, H * 0.06, H * 0.07).translate(x, ground(x, z) + H * 0.04, z)); }
    // the caption's place: its foot just above the upper row, its head just under the lower one, so that neither covers a letter
    const zc = zAt(0, y0) + (out.anchors.length ? H * 0.9 : 0);
    out.anchors.push({ x: 0, y: out.anchors.length ? ground(0, zc) - H * 0.05 : y0 + H * 1.3, z: zc, h: H, w: row.w, base: y0 });
    need = Math.max(need, -depth / 2 - (zAt(row.w / 2, y0) - (y0 + H * 1.5) / Math.tan(TILT)));
  });
  const mesh = (list, mat, cast) => { const m = new THREE.Mesh(mergeGeometries(list, false), mat); m.castShadow = cast; m.frustumCulled = false; g.add(m); return m; };
  const names = [mesh(fronts, FRONT, true), mesh(bodies, BODY, false), mesh(steel.map((x) => x.toNonIndexed()), DARK, false), mesh(lamps.map((x) => x.toNonIndexed()), WARM_LIGHT, false)];
  out.letters = names[0];
  // the pointer's target is never drawn (it is not in the scene): one pane per letter, in the world's own coordinates
  const target = new THREE.Mesh(mergeGeometries(panes, false), new THREE.MeshBasicMaterial()); target.layers.set(1);
  let shown = true;
  out.pick = (rc) => {
    const hit = shown ? rc.intersectObject(target, false)[0] : null; if (!hit) return null;
    const row = Math.max(0, cuts.findIndex((n) => hit.faceIndex < n));
    return { row, dist: hit.distance, x: hit.point.x, h: tips[row], z: hit.point.z };
  };
  out.show = (on) => { if (on !== shown) { shown = on; for (const m of names) m.visible = on; } };

  // scrub on the slopes: low dark bushes, away from the letters
  const N = 170, bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), matte('#426f4a', { flatShading: true }), N), o = new THREE.Object3D();
  let put = 0;
  for (let tries = 0; put < N && tries < N * 12; tries++) {
    const x = (r() * 2 - 1) * a * 0.9, z = cz + (r() * 1.5 - 0.5) * b, y = ground(x, z);
    if (y < h * 0.02 || onSign(x, y, z - cz)) continue;
    const k = wide * (0.01 + r() * 0.015); o.position.set(x, y + k * 0.2, z); o.scale.set(k * (1 + r()), k * (0.6 + r() * 0.5), k * (1 + r())); o.rotation.y = r() * 6; o.updateMatrix(); bush.setMatrixAt(put++, o.matrix);
  }
  bush.count = put; g.add(bush);

  out.frame = Math.max(0, need); out.top = h; out.cz = cz; out.front = cz + b;
  out.dispose = () => { g.traverse((m) => { if (m.isMesh && m.geometry !== rough) m.geometry.dispose(); }); rough.dispose(); target.geometry.dispose(); target.material.dispose(); g.removeFromParent(); };
  return out;
}
