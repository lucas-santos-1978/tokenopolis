// Environment of the 3D wall: gradient sky (same colors as the other versions), distant mountain
// ranges with atmospheric perspective, a sea of clouds far below, clouds, moon and stars — and the "look" of
// each hour of the day (light colors and intensities), interpolated between key times.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { skyColorsAt, SUNRISE, SUNSET } from '../lib/sky.js';
import { campGlow } from './rock.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const SEA_Y = -70; // height of the sea of clouds

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const simplex = new SimplexNoise({ random: rand });

// ---------- Palette by hour ----------

// At night, moonlight strong enough for the rock to turn blue-grey and the climbers to show up on it
// (the wall gets ~60% of the daytime brightness; it used to be ~30% and a dark body vanished against dark stone).
// Dawn and dusk also go up, so the passage from day to night does not get darker than the night itself.
const LOOK = {
  night: {
    key: '#a9bdff', keyI: 2.25, hemiSky: '#566cb6', hemiGround: '#2d2a3c', hemiI: 1.05, exposure: 1.28, fog: '#1d2447',
    rim: '#9fb6ff', rimI: 0.5, cloudLit: '#7882b8', cloudShade: '#1f2547', range: '#323c6c', snow: '#9aa8d6',
    seaLit: '#6b77ab', seaShade: '#1c2142', glow: 0, night: 1,
  },
  dawn: {
    key: '#ffb48c', keyI: 2.7, hemiSky: '#8f88c8', hemiGround: '#4a3a44', hemiI: 1.15, exposure: 1.14, fog: '#e2ab9b',
    rim: '#ffc4a2', rimI: 0.38, cloudLit: '#ffc8ad', cloudShade: '#7c6a96', range: '#5f5a82', snow: '#f8cbbb',
    seaLit: '#fbc5ad', seaShade: '#7a6991', glow: 1.0, night: 0.25,
  },
  day: {
    key: '#fff2df', keyI: 3.1, hemiSky: '#bcd6ff', hemiGround: '#7a6650', hemiI: 1.15, exposure: 0.95, fog: '#cbdff1',
    rim: '#fff6e8', rimI: 0.16, cloudLit: '#ffffff', cloudShade: '#aebfd8', range: '#73839f', snow: '#f4f8ff',
    seaLit: '#ffffff', seaShade: '#b3c5dc', glow: 0.55, night: 0,
  },
  golden: {
    key: '#ffc994', keyI: 2.7, hemiSky: '#c8c6e8', hemiGround: '#7a5a45', hemiI: 1.0, exposure: 0.95, fog: '#efd3b8',
    rim: '#ffd6a2', rimI: 0.28, cloudLit: '#fff1dc', cloudShade: '#bba7bb', range: '#857c99', snow: '#ffe9d2',
    seaLit: '#fff1de', seaShade: '#c3adbb', glow: 1.0, night: 0,
  },
  dusk: {
    key: '#ff9c66', keyI: 2.8, hemiSky: '#9384c6', hemiGround: '#4e3a46', hemiI: 1.2, exposure: 1.12, fog: '#d99b8e',
    rim: '#ffb592', rimI: 0.42, cloudLit: '#ffb690', cloudShade: '#6b5a8c', range: '#575177', snow: '#f6bba8',
    seaLit: '#f6b39a', seaShade: '#6a5a88', glow: 1.25, night: 0.2,
  },
  blue: {
    key: '#9fb2ff', keyI: 2.2, hemiSky: '#5e6cb0', hemiGround: '#34304a', hemiI: 1.1, exposure: 1.26, fog: '#484a7c',
    rim: '#aebcff', rimI: 0.48, cloudLit: '#8f92c4', cloudShade: '#383b69', range: '#373b66', snow: '#aab2df',
    seaLit: '#7f85ba', seaShade: '#33365f', glow: 0.35, night: 0.7,
  },
};
const KEYS = [[0, 'night'], [4.8, 'night'], [5.8, 'dawn'], [7.2, 'day'], [16.3, 'day'], [17.4, 'golden'], [18.2, 'dusk'], [19.2, 'blue'], [20.3, 'night'], [24, 'night']];
const PARSED = Object.fromEntries(Object.entries(LOOK).map(([name, o]) => [
  name, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v])),
]));

// Everything that changes with the hour: colors, intensities and light directions (sun/moon).
export function lookAt(h) {
  const i = KEYS.findIndex(([at]) => at > h);
  const [h0, a] = KEYS[i - 1];
  const [h1, b] = KEYS[i];
  const t = smooth(0, 1, (h - h0) / (h1 - h0));
  const out = {};
  for (const [k, va] of Object.entries(PARSED[a])) {
    const vb = PARSED[b][k];
    out[k] = va.isColor ? va.clone().lerp(vb, t) : va + (vb - va) * t;
  }
  out.sky = skyColorsAt(h).map((c) => new THREE.Color(c));
  const deg = THREE.MathUtils.degToRad;
  const dayT = (h - SUNRISE) / (SUNSET - SUNRISE);
  const elev = Math.max(-14, 62 * Math.sin(Math.PI * clamp(dayT, -0.25, 1.25)));
  // Sunlight: from the right in the morning, from the left in the afternoon, never too grazing for the face.
  const az = (0.5 - clamp(dayT, 0, 1)) * deg(130);
  const le = deg(Math.max(13, elev));
  const sunLight = V(Math.sin(az) * Math.cos(le), Math.sin(le), Math.cos(az) * Math.cos(le));
  const moonLight = V(-0.55, 0.62, 0.56).normalize();
  // from the moon (left) to the dawn sun (right) the light passes overhead, not head-on: halfway
  // along it hit the face straight on and the wall gave a flat flash in the small hours
  const toMoon = smooth(0.3, 0.8, out.night);
  out.lightDir = sunLight.lerp(moonLight, toMoon);
  out.lightDir.y += 1.2 * toMoon * (1 - toMoon);
  out.lightDir.normalize();
  // Sun drawn in the sky: at dusk it appears on the open side (left), behind the mountain ranges.
  const skyAz = Math.PI + (clamp(dayT, -0.1, 1.1) - 0.5) * 0.8;
  const se = deg(elev);
  out.sunSky = V(Math.sin(skyAz) * Math.cos(se), Math.sin(se), Math.cos(skyAz) * Math.cos(se));
  out.sunUp = smooth(-3, 1, elev); // visible disc
  out.moonSky = V(-0.36, 0.22, -0.9).normalize();
  return out;
}

// ---------- Sky ----------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uUpper;
uniform vec3 uLower;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uGlow;
uniform float uDisc;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  // "tight" gradient near the horizon: the camera is a telephoto (sees only ~±11° of height),
  // so the blue needs to start right above the horizon
  vec3 c = mix(uHorizon, uLower, smoothstep(-0.02, 0.05, e));
  c = mix(c, uUpper, smoothstep(0.03, 0.14, e));
  c = mix(c, uTop, smoothstep(0.12, 0.42, e));
  float s = max(dot(d, uSunDir), 0.0);
  float band = exp(-abs(e - uSunDir.y) * 5.0);
  c += uSunColor * uGlow * (pow(s, 5.0) * 0.32 * (0.35 + band) + pow(s, 60.0) * 0.45);
  c = mix(c, vec3(1.0, 0.96, 0.86), smoothstep(0.99965, 0.99985, s) * uDisc);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`;

// ---------- Mountain ranges ----------

// Each vertex carries the smoothed slope (light on one side, shadow on the other), the height of the
// ridge in that column (vertical gradient: light on top, darker and hazier at the bottom) and the distance
// to the ends of the strip (the ends fade into the fog, with no straight cut).
const RANGE_VERT = /* glsl */ `
attribute vec3 aShade;
varying vec3 vPos;
varying vec3 vShade;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vShade = aShade;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;

const RANGE_FRAG = /* glsl */ `
uniform vec3 uRock;
uniform vec3 uSnow;
uniform vec3 uHaze;
uniform float uLightSide;
uniform float uDepth;
uniform float uSnowLine;
uniform float uDark;
uniform float uAmp;
varying vec3 vPos;
varying vec3 vShade;
void main() {
  float slope = vShade.x;
  float top = vShade.y;
  float lit = clamp(0.5 + slope * uLightSide * 1.1, 0.0, 1.0);
  float below = clamp((top - vPos.y) / uAmp, 0.0, 1.0);
  lit *= mix(1.0, 0.72, smoothstep(0.0, 0.8, below)); // the lower part of the slopes gets darker
  float gully = sin(vPos.x * 0.03 + sin(vPos.z * 0.017) * 2.0) * 0.5 + sin(vPos.x * 0.083 + vPos.z * 0.031) * 0.25;
  float snow = smoothstep(uSnowLine - 10.0, uSnowLine + 10.0, vPos.y + gully * 16.0 * (0.6 + 0.4 * lit));
  vec3 rock = uRock * uDark * mix(0.62, 1.12, lit);
  vec3 sn = uSnow * mix(0.68, 1.0, lit);
  vec3 c = mix(rock, sn, snow);
  float low = 1.0 - smoothstep(${SEA_Y.toFixed(1)}, uSnowLine + 20.0, vPos.y);
  c = mix(c, uHaze, clamp(uDepth + low * 0.4 + (1.0 - vShade.z), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// "Folded" ridge with a rounded fold: peaks without needles.
const softRidge = (n) => 1 - Math.sqrt(n * n + 0.018);

function buildRanges(scene, shared) {
  const layers = [
    { r: 430, base: -66, amp: 62, f: 6, depth: 0.14, snow: -18, dark: 0.8, s: 1.3 },
    { r: 840, base: -60, amp: 110, f: 4.8, depth: 0.32, snow: 5, dark: 0.9, s: 2.1 },
    { r: 1500, base: -44, amp: 185, f: 3.8, depth: 0.5, snow: 45, dark: 1, s: 3.7 },
    { r: 2600, base: -20, amp: 260, f: 3, depth: 0.68, snow: 100, dark: 1, s: 4.9 },
  ];
  const N = 420;
  const t0 = -1.95;
  const t1 = 1.4;
  for (const L of layers) {
    const hs = [];
    for (let i = 0; i <= N; i++) {
      const q = (t0 + ((t1 - t0) * i) / N) * L.f;
      const ridge = softRidge(simplex.noise(q, L.s));
      const ridge2 = softRidge(simplex.noise(q * 4.3, L.s + 3));
      hs.push(L.base + L.amp * (0.55 * ridge ** 1.6 + 0.33 * (0.5 + 0.5 * simplex.noise(q * 2.3, L.s + 9)) + 0.07 * ridge2));
    }
    const pos = [];
    const shade = [];
    const idx = [];
    const ds = ((t1 - t0) / N) * L.r;
    const slopeAt = (i) => (hs[Math.min(N, i + 1)] - hs[Math.max(0, i - 1)]) / (2 * ds);
    for (let i = 0; i <= N; i++) {
      const th = t0 + ((t1 - t0) * i) / N;
      const x = Math.sin(th) * L.r;
      const z = -Math.cos(th) * L.r;
      pos.push(x, hs[i], z, x, SEA_Y - 60, z);
      // average slope of ±3 columns (no vertical stripes) and limited (no "paper" faces)
      let sl = 0;
      for (let k = -3; k <= 3; k++) sl += slopeAt(clamp(i + k, 0, N)) * (4 - Math.abs(k));
      sl = clamp(sl / 16, -0.9, 0.9);
      const end = smooth(0, 0.06, Math.min(i, N - i) / N);
      shade.push(sl, hs[i], end, sl, hs[i], end);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uDepth: { value: L.depth }, uSnowLine: { value: L.snow }, uDark: { value: L.dark }, uAmp: { value: L.amp } },
      vertexShader: RANGE_VERT,
      fragmentShader: RANGE_FRAG,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
}

// ---------- Sea of clouds ----------

const SEA_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;

const SEA_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
uniform vec3 uCam;
uniform float uTime;
varying vec3 vPos;
void main() {
  vec2 p = vPos.xz * 0.0032 + vec2(uTime * 0.0012, 0.0);
  float n = texture2D(uNoise, p).a * 0.6 + texture2D(uNoise, p * 2.3 + 0.37).a * 0.28 + texture2D(uNoise, p * 6.1 + 0.11).a * 0.12;
  vec3 c = mix(uShade, uLit, smoothstep(0.34, 0.72, n));
  float d = length(vPos.xz - uCam.xz);
  c = mix(c, uHaze, 0.12 + 0.82 * smoothstep(60.0, 2400.0, d));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// ---------- Clouds (cumulus billboards) ----------

// Texture of a cumulus: several "puffs" with a flat base; R = light (bright top), A = density.
function cloudTexture(W = 256, H = 128) {
  const puffs = [];
  const n = 16 + Math.floor(rand() * 10);
  for (let i = 0; i < n; i++) {
    const t = rand();
    const bump = Math.sin(Math.PI * t);
    const rad = H * (0.12 + 0.25 * bump * (0.55 + 0.45 * rand()));
    puffs.push([W * (0.12 + 0.76 * t), H * 0.8 - rad * (0.2 + 0.9 * rand() * bump), rad]);
  }
  const data = new Uint8Array(W * H * 4);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let dens = 0;
      let lsum = 0;
      let lw = 0;
      for (const [x, y, rad] of puffs) {
        const dx = (px - x) / rad;
        const dy = (py - y) / rad;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const w = (1 - d2) * (1 - d2);
        dens += w;
        lsum += w * w * (0.55 - dy * 0.42 - dx * 0.1);
        lw += w * w;
      }
      dens *= smooth(H * 0.86, H * 0.74, py); // flat base
      const edge = simplex.noise(px * 0.06, py * 0.06) * 0.12 + simplex.noise(px * 0.16, py * 0.16) * 0.06;
      const alpha = smooth(0.16, 0.55, dens + edge);
      const light = clamp((lw > 0 ? lsum / lw : 0.5) * 0.75 + (1 - py / H) * 0.3 + edge, 0, 1);
      const k = ((H - 1 - py) * W + px) * 4;
      data[k] = light * 255;
      data[k + 3] = alpha * 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  vec3 c = mix(uShade, uLit, t.r);
  c = mix(c, uHaze, uHazeAmt);
  gl_FragColor = vec4(c, t.a * uOpacity);
  #include <colorspace_fragment>
}`;

// ---------- Moon and stars ----------

function moonTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d');
  const halo = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
  halo.addColorStop(0, 'rgba(200,215,255,0.45)');
  halo.addColorStop(0.35, 'rgba(160,180,255,0.12)');
  halo.addColorStop(1, 'rgba(140,160,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, s, s);
  const disc = g.createRadialGradient(s * 0.46, s * 0.45, 0, s / 2, s / 2, s * 0.13);
  disc.addColorStop(0, '#fffdf2');
  disc.addColorStop(1, '#e6e2cf');
  g.fillStyle = disc;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(150,150,140,0.28)';
  for (const [x, y, r] of [[0.47, 0.46, 0.035], [0.54, 0.52, 0.025], [0.5, 0.56, 0.018], [0.44, 0.53, 0.014], [0.55, 0.44, 0.012]]) {
    g.beginPath();
    g.arc(s * x, s * y, s * r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildStars(scene) {
  const sets = [];
  for (const [count, size] of [[1500, 1.4], [260, 2.6]]) {
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const az = rand() * Math.PI * 2;
      const e = Math.asin(0.02 + rand() * 0.88);
      pos.push(Math.cos(az) * Math.cos(e) * 4000, Math.sin(e) * 4000, Math.sin(az) * Math.cos(e) * 4000);
      c.setHSL(0.58 + rand() * 0.12, 0.5, 0.8 + rand() * 0.2);
      col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    sets.push(pts);
  }
  return sets;
}

// ---------- Assembly ----------

export function createEnvironment(scene, noiseTex) {
  const skyU = {
    uTop: { value: new THREE.Color() }, uUpper: { value: new THREE.Color() }, uLower: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uSunDir: { value: V(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uGlow: { value: 0 }, uDisc: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  sky.scale.setScalar(9000);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const stars = buildStars(scene);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  moon.scale.setScalar(560);
  scene.add(moon);

  const rangeU = { uRock: { value: new THREE.Color() }, uSnow: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uLightSide: { value: 0 } };
  buildRanges(scene, rangeU);

  const seaU = {
    uNoise: { value: noiseTex }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() }, uCam: { value: V() }, uTime: { value: 0 },
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: seaU, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG }));
  sea.rotation.x = -Math.PI / 2;
  sea.scale.set(9000, 9000, 1);
  sea.position.y = SEA_Y;
  sea.frustumCulled = false;
  scene.add(sea);

  // Clouds: on the left (open sky), some low near the base and others behind the summit.
  const cloudU = { uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() } };
  const textures = [cloudTexture(), cloudTexture(), cloudTexture(), cloudTexture()];
  const clouds = [];
  const spots = [];
  // (sizes designed for the camera's tight lens: clouds too large would cover the sky)
  for (let i = 0; i < 11; i++) spots.push([-60 - rand() * 640, -58 + rand() * 120, -130 - rand() * 800, (70 + rand() * 190) * 0.55]);
  for (let i = 0; i < 4; i++) spots.push([-28 - rand() * 60, -64 + rand() * 18, -40 - rand() * 70, (20 + rand() * 25) * 0.7]);
  for (let i = 0; i < 6; i++) spots.push([170 + rand() * 480, 40 + rand() * 150, -260 - rand() * 900, (90 + rand() * 200) * 0.55]); // behind the shoulder (on the right), not behind the summit
  // A cloud (a plane facing the camera) never crosses a mountain range: the distance from the center
  // goes to the middle of the gap between two strips, with no straight cut in the silhouette.
  const RINGS = [0, 430, 840, 1500, 2600, 4200];
  for (const p of spots) {
    const R = Math.hypot(p[0], p[2]);
    if (R < 140) continue; // the low ones, near the wall, stay where they are
    let k = RINGS.findIndex((r) => r > R);
    if (k < 1) k = RINGS.length - 1;
    const lo = RINGS[k - 1];
    const hi = RINGS[k];
    const half = Math.max(0, (hi - lo) / 2 - p[3] * 0.9);
    const R2 = clamp(R, (lo + hi) / 2 - half, (lo + hi) / 2 + half);
    p[0] *= R2 / R;
    p[2] *= R2 / R;
  }
  spots.forEach(([x, y, z, s], i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...cloudU, map: { value: textures[i % textures.length] }, uHazeAmt: { value: 0 }, uOpacity: { value: 0.95 } },
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), mat);
    mesh.scale.set(s, s, 1);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    // moves around the center (fixed radius): stays in the gap between the ranges
    const R = Math.hypot(x, z);
    clouds.push({ mesh, speed: 0.5 + rand() * 1.4, R, th: Math.atan2(x, -z), ring: R >= 140 });
  });

  // Scene fog measured from the framed group: the value for when the camera is close
  // (~24–48) serves as the base and, from afar, starts after the wall (near ≈ distance + 30).
  const fog0 = { near: scene.fog?.near ?? 70, far: scene.fog?.far ?? 460 };

  return {
    stars,
    moon,
    // Report the camera's distance to the framed point (view.dist) when it changes.
    setViewDistance(d) {
      if (!scene.fog || !Number.isFinite(d)) return;
      const near = Math.max(fog0.near, d + 30);
      scene.fog.near = near;
      scene.fog.far = near + (fog0.far - fog0.near);
    },
    apply(look) {
      const [top, upper, lower, horizon] = look.sky;
      skyU.uTop.value.copy(top);
      skyU.uUpper.value.copy(upper);
      skyU.uLower.value.copy(lower);
      skyU.uHorizon.value.copy(horizon);
      skyU.uSunDir.value.copy(look.sunSky);
      skyU.uSunColor.value.copy(look.key);
      skyU.uGlow.value = look.glow;
      skyU.uDisc.value = look.sunUp * (1 - look.night);
      for (const s of stars) s.material.opacity = smooth(0.15, 0.85, look.night);
      moon.material.opacity = smooth(0.3, 0.8, look.night);
      moon.visible = look.night > 0.3;
      rangeU.uRock.value.copy(look.range);
      rangeU.uSnow.value.copy(look.snow);
      rangeU.uHaze.value.copy(horizon).lerp(look.fog, 0.35);
      rangeU.uLightSide.value = -look.lightDir.x;
      seaU.uLit.value.copy(look.seaLit);
      seaU.uShade.value.copy(look.seaShade);
      seaU.uHaze.value.copy(horizon).lerp(look.fog, 0.35);
      cloudU.uLit.value.copy(look.cloudLit);
      cloudU.uShade.value.copy(look.cloudShade);
      cloudU.uHaze.value.copy(horizon).lerp(look.fog, 0.35);
      campGlow.value = 0.7 * smooth(0.3, 0.8, look.night); // lanterns lit in the tents at night (with moonlight, dimmer: otherwise the tent washes out)
      this.moonDir = look.moonSky;
    },
    update(dt, t, camera) {
      sky.position.copy(camera.position);
      for (const s of stars) s.position.copy(camera.position);
      if (this.moonDir) moon.position.copy(camera.position).addScaledVector(this.moonDir, 3500);
      sea.position.x = camera.position.x;
      sea.position.z = camera.position.z;
      seaU.uCam.value.copy(camera.position);
      seaU.uTime.value = t;
      for (const c of clouds) {
        if (c.ring) {
          c.th += (c.speed * dt) / c.R;
          if (c.th > 1.35) c.th = -1.9;
          c.mesh.position.x = Math.sin(c.th) * c.R;
          c.mesh.position.z = -Math.cos(c.th) * c.R;
        } else {
          c.mesh.position.x += c.speed * dt;
          if (c.mesh.position.x > 520) c.mesh.position.x = -820;
        }
        c.mesh.quaternion.copy(camera.quaternion);
        c.mesh.material.uniforms.uHazeAmt.value = 0.75 * smooth(80, 1700, c.mesh.position.distanceTo(camera.position));
      }
    },
  };
}
