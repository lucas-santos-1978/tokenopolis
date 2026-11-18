// The Stock Exchange: the region's own building, there only when the server quotes a share (STOCK_SYMBOL).
// A stone hall with a portico, a glass tower over it, and three things that tell the share's day: the
// ticker running along the frieze, the screen on the tower with the last month's line, and the beacon on
// the mast, green on a day up and red on a day down (the arrow and the sign say the same, for whoever
// does not tell the colors apart). main.js gives it the texts already in the visitor's language.
import * as THREE from 'three';
import { Batcher, matte, DARK, WARM_LIGHT } from './buildings.js';

const NI = (g) => (g.index ? g.toNonIndexed() : g);
const box = (w, h, d) => NI(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
const cyl = (r, h, seg = 14) => NI(new THREE.CylinderGeometry(r, r, h, seg).translate(0, h / 2, 0));
function gable(w, d, rh) { // a pediment: a triangle across x, d deep
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.closePath();
  return NI(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2));
}
const FONT = (px, w = 900) => `${w} ${px}px Nunito, "Segoe UI", sans-serif`;
export const TONE = { up: '#3ddc84', down: '#ff5a52', flat: '#cfd8e3' }; // a day up, a day down, no change
const toneOf = (dir) => (dir > 0 ? TONE.up : dir < 0 ? TONE.down : TONE.flat);

const SIDE = 30, TOP = 36.8; // the square it is drawn for (3 lots) and how high the beacon stands
const HALL_W = 20.6, BAND_H = 1.15, BAND_Y = 9.65;

// the tower's curtain wall: panes by day and, at night, the ones with the lights on
function glassMaterial() {
  const N = 4, P = 32, day = document.createElement('canvas'), night = document.createElement('canvas');
  day.width = day.height = night.width = night.height = N * P;
  const d = day.getContext('2d'), n = night.getContext('2d');
  d.fillStyle = '#1b2735'; d.fillRect(0, 0, N * P, N * P); n.fillStyle = '#000'; n.fillRect(0, 0, N * P, N * P);
  let h = 7;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    h = Math.imul(h ^ (i * 31 + j * 17 + 5), 2654435761) >>> 0;
    const g = d.createLinearGradient(i * P, j * P, i * P + P, j * P + P); g.addColorStop(0, '#5d7a96'); g.addColorStop(1, '#34495e');
    d.fillStyle = g; d.fillRect(i * P + 2, j * P + 2, P - 4, P - 4);
    if (h % 7 < 2) { n.fillStyle = h % 3 ? '#b8905a' : '#7f9db8'; n.fillRect(i * P + 3, j * P + 3, P - 6, P - 6); }
  }
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 4.25); t.anisotropy = 4; return t; };
  return new THREE.MeshStandardMaterial({ map: tex(day), emissiveMap: tex(night), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.18, metalness: 0.55, envMapIntensity: 1 });
}

export function makeExchange({ x, z, side = SIDE }) {
  const k = side / SIDE, group = new THREE.Group();
  group.position.set(x, 0, z); group.scale.setScalar(k);
  const STONE = matte('#ece5d3'), SHADE = matte('#cfc7b2'), STEP = matte('#dcd5c2'), SLAB = matte('#8d9aa5'), BRONZE = matte('#a8763f', { roughness: 0.45, metalness: 0.6 }), DOOR = matte('#3d2c1f');
  const b = new Batcher();
  // the square's slab and the steps
  b.add(box(27, 0.7, 26), STEP, 0, 0, 0);
  b.add(box(14, 0.47, 0.9), STEP, 0, 0, 13.45); b.add(box(14, 0.23, 0.9), STEP, 0, 0, 14.35);
  // the hall and its portico: six columns, the frieze and the pediment
  b.add(box(HALL_W, 10, 12), STONE, 0, 0.7, -3);
  b.add(box(HALL_W + 0.6, 0.4, 12.6), SHADE, 0, 10.7, -3);
  for (let i = 0; i < 6; i++) {
    const cx = -8.5 + i * 3.4;
    b.add(box(1.5, 0.35, 1.5), SHADE, cx, 0.7, 5.4); b.add(cyl(0.62, 7.5), STONE, cx, 1.05, 5.4); b.add(box(1.5, 0.35, 1.5), SHADE, cx, 8.55, 5.4);
  }
  b.add(box(HALL_W, 1.5, 3.6), STONE, 0, 8.9, 4.6);
  b.add(gable(HALL_W + 0.4, 3.6, 3.1), STONE, 0, 10.4, 4.6); b.add(gable(HALL_W - 2.6, 3.7, 2.3), SHADE, 0, 10.55, 4.6);
  b.add(box(3, 5.2, 0.2), DOOR, 0, 0.7, 3.02); // the door, behind the columns
  for (const wx of [-6.8, -3.4, 3.4, 6.8]) b.add(box(1.5, 3.4, 0.2), DARK, wx, 3.2, 3.02);
  // the tower: glass, a roof slab, the mast
  b.add(box(12.6, 0.5, 9.6), SLAB, 0, 28.1, -3.5);
  b.add(box(11.3, 8.7, 0.3), DARK, 0, 16.65, 1.0); // the screen's frame
  b.add(cyl(0.22, 6, 8), SLAB, 0, 28.6, -3.5);
  // the bull on its pedestal, by the steps
  const bull = (g, w, h, d, px, py, pz) => b.add(box(w, h, d), g, -10 + px, 0.7 + py, 9.6 + pz);
  bull(SHADE, 2.2, 0.8, 3.6, 0, 0, 0);
  bull(BRONZE, 1.1, 1.15, 2.5, 0, 1.55, -0.1); bull(BRONZE, 0.85, 0.85, 0.95, 0, 1.75, 1.5); // the body and the lowered head
  for (const [lx, lz] of [[-0.38, -1.1], [0.38, -1.1], [-0.38, 0.85], [0.38, 0.85]]) bull(BRONZE, 0.3, 0.78, 0.3, lx, 0.8, lz);
  for (const s of [-1, 1]) bull(STONE, 0.14, 0.5, 0.14, s * 0.5, 2.5, 1.75);
  // two lamps at the front corners
  for (const s of [-1, 1]) { b.add(cyl(0.12, 4.2, 6), DARK, s * 12, 0.7, 11.3); b.add(NI(new THREE.SphereGeometry(0.45, 8, 6)), WARM_LIGHT, s * 12, 5.2, 11.3); }
  for (const cx of [-8.5, 8.5]) b.add(box(0.5, 0.18, 0.5), WARM_LIGHT, cx, 0.7, 6.5); // lights at the foot of the portico
  for (const m of b.build()) group.add(m);

  const GLASS = glassMaterial();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 17, 9).translate(0, 19.6, -3.5), GLASS); tower.castShadow = tower.receiveShadow = true; group.add(tower);

  // the screen: a canvas, redrawn with each quote
  const scv = document.createElement('canvas'); scv.width = 768; scv.height = 584;
  const stex = new THREE.CanvasTexture(scv); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = 8;
  const SCREEN = new THREE.MeshStandardMaterial({ map: stex, emissiveMap: stex, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.6 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 8.2).translate(0, 21, 1.18), SCREEN); group.add(screen);

  // the ticker: one canvas the width of its text, repeated along the frieze (left side, front, right side)
  const bcv = document.createElement('canvas'); bcv.width = 256; bcv.height = 96;
  const btex = new THREE.CanvasTexture(bcv); btex.colorSpace = THREE.SRGBColorSpace; btex.wrapS = THREE.RepeatWrapping; btex.anisotropy = 8;
  const BAND = new THREE.MeshStandardMaterial({ map: btex, emissiveMap: btex, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.6 });
  const strip = (len, u0, ry, px, pz) => {
    const g = new THREE.PlaneGeometry(len, BAND_H); g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 1, u0 + len, 1, u0, 0, u0 + len, 0], 2));
    group.add(new THREE.Mesh(g.rotateY(ry).translate(px, BAND_Y, pz), BAND));
  };
  const SIDE_LEN = 15.4, HW = HALL_W / 2 + 0.03;
  strip(SIDE_LEN, 0, -Math.PI / 2, -HW, -1.3); strip(HALL_W, SIDE_LEN, 0, 0, 6.43); strip(SIDE_LEN, SIDE_LEN + HALL_W, Math.PI / 2, HW, -1.3);

  // the beacon on the mast
  const BEACON = new THREE.MeshStandardMaterial({ color: TONE.flat, emissive: TONE.flat, emissiveIntensity: 0.9, roughness: 0.5 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10).translate(0, 35.55, -3.5), BEACON); group.add(beacon);

  // What the pointer finds: a box round the whole building, in the world's own coordinates (it is never drawn).
  const target = new THREE.Mesh(new THREE.BoxGeometry(27 * k, TOP * k, 26 * k).translate(x, (TOP * k) / 2, z), new THREE.MeshBasicMaterial()); target.layers.set(1);

  let night = 0, glow = 1, at = 0;
  const light = () => { SCREEN.emissiveIntensity = 0.55 + 0.3 * night; BAND.emissiveIntensity = 0.65 + 0.4 * night; BEACON.emissiveIntensity = (0.9 + 1.5 * night) * glow; GLASS.emissiveIntensity = 0.7 * night; };

  // q: { label, price, change, dir (1 up, -1 down, 0), series: [numbers], caption }, every text ready to show
  function setQuote(q) {
    const col = toneOf(q.dir);
    // the ticker
    const item = [[q.label, '#ffc940'], [q.price, '#ffffff'], [q.change, col], ['◆', '#5d6b7c']];
    let c = bcv.getContext('2d'); c.font = FONT(62);
    const GAP = 34, w = Math.ceil(item.reduce((a, [s]) => a + c.measureText(s).width + GAP, GAP));
    if (bcv.width !== Math.min(2048, w)) { bcv.width = Math.min(2048, w); btex.dispose(); } // another width: the texture is made again (its size on the card is fixed once sent)
    c = bcv.getContext('2d');
    c.fillStyle = '#05070b'; c.fillRect(0, 0, bcv.width, bcv.height);
    c.font = FONT(62); c.textBaseline = 'middle';
    let px = GAP;
    for (const [s, hex] of item) { c.fillStyle = hex; c.fillText(s, px, 51); px += c.measureText(s).width + GAP; }
    btex.repeat.x = 1 / ((bcv.width / bcv.height) * BAND_H); btex.needsUpdate = true;
    // the screen
    const W = scv.width, H = scv.height; c = scv.getContext('2d');
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1220'); bg.addColorStop(1, '#122036');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillStyle = '#ffc940'; c.font = FONT(92); c.fillText(q.label, 36, 108, W * 0.5);
    c.textAlign = 'right'; c.fillStyle = '#ffffff'; c.font = FONT(84); c.fillText(q.price, W - 36, 104, W * 0.42);
    c.fillStyle = col; c.font = FONT(58); c.fillText(q.change, W - 36, 176, W * 0.6);
    c.textAlign = 'left'; c.fillStyle = '#9fb0c4'; c.font = FONT(30, 800); c.fillText(q.caption ?? '', 36, 170, W * 0.4);
    const s = q.series ?? [];
    if (s.length > 1) {
      const x0 = 36, x1 = W - 36, y0 = 224, y1 = H - 40, lo = Math.min(...s), hi = Math.max(...s), span = hi - lo || 1;
      const X = (i) => x0 + ((x1 - x0) * i) / (s.length - 1), Y = (v) => y1 - ((y1 - y0) * (v - lo)) / span;
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2; c.setLineDash([10, 10]); c.beginPath(); c.moveTo(x0, Y(s[0])); c.lineTo(x1, Y(s[0])); c.stroke(); c.setLineDash([]); // where the month began
      const trend = toneOf(Math.sign(s.at(-1) - s[0]));
      c.beginPath(); s.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
      c.lineTo(x1, y1 + 20); c.lineTo(x0, y1 + 20); c.closePath();
      const fill = c.createLinearGradient(0, y0, 0, y1 + 20); fill.addColorStop(0, `${trend}66`); fill.addColorStop(1, `${trend}00`);
      c.fillStyle = fill; c.fill();
      c.beginPath(); s.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
      c.strokeStyle = trend; c.lineWidth = 7; c.lineJoin = c.lineCap = 'round'; c.stroke();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x1, Y(s.at(-1)), 9, 0, Math.PI * 2); c.fill();
    }
    stex.needsUpdate = true;
    BEACON.color.set(col); BEACON.emissive.set(col);
  }

  return {
    group, side, top: TOP * k,
    mid: new THREE.Vector3(x, 15 * k, z), // what a camera in front of it looks at
    reach: 330 * k, // how near a camera reads the screen
    setQuote,
    setNight(n) { night = n; light(); },
    step(dt) { // the ticker runs to the left; the beacon breathes
      at += dt; btex.offset.x = (btex.offset.x + dt * 0.11) % 1;
      const g = 0.82 + 0.18 * Math.sin(at * 2.2); if (Math.abs(g - glow) > 0.01) { glow = g; light(); }
    },
    pick(rc) { const hit = rc.intersectObject(target, false)[0]; return hit ? { dist: hit.distance, x, h: TOP * k, z } : null; },
    dispose() {
      group.removeFromParent();
      group.traverse((m) => m.geometry?.dispose());
      for (const m of [GLASS, SCREEN, BAND, BEACON]) { m.map?.dispose(); if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose(); m.dispose(); }
      target.geometry.dispose(); target.material.dispose();
    },
  };
}
