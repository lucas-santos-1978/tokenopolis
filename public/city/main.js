// The city page: each team is a city and each person a building (1 floor = config.floorTokens
// tokens), in real 3D with three.js: a camera that turns, a sun whose shadows move with the time in
// the configured zone, night with the windows lit.
//
// Two views: the region (every city on the same terrain) and a city up close; the camera flies from
// one to the other. The HTML panels are in panels.js; the terrain in world.js; the buildings come
// from the kit of parts (buildings.js), merged by material; life (people, boats, planes, helicopter,
// airship, monster) is in life.js, the effects (fireworks, confetti, sparkles, ring, rocket) in
// effects.js and the history (time-lapse, race, timeline) in history.js. Every word comes from the
// dictionaries (i18n/<locale>/city.js, common.js and city-static.js).
//
// In the URL (docs/i18n.md): ?city=<id, name or code> opens in a city; ?person=<id> selects the
// building; ?tour alternates the region and the cities with the camera turning (TV); ?hour=14.5
// fixes the time; ?spin turns the camera; ?map=now|week|network|model|belts opens a data map;
// ?monuments=all raises every monument; ?style= forces a style; ?giant=N gives N floors to the
// tallest building; ?monster calls the monster; ?quality=low turns off shadows and glow; ?panels=0
// and ?names=0 hide the panels and the signs; ?ruins=0 keeps the abandoned buildings standing;
// ?mega=<floors> moves the Mega Builders' line (0 hides the Corporate District).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { skyColorsAt, zoneHour } from '../lib/sky.js';
import { copyText } from '../lib/clipboard.js';
import { noteServerClock } from '../lib/freshness.js';
import { t, plural, fmt, cityLabel, displayName, config } from '../i18n/index.js';
import { tierOf, BUILDING_TIERS, TEN_BI, advisors, context, floorsText, cityTier, buildingTier, monthOf, ruinOf, markOf, markText } from './rules.js';
import { L, seed, hash, kind, buildWorld, groundCanvas, dojoOf, megaLinks } from './world.js';
import { makeKit, craneJib, Batcher, mats, lit, blinkMats, matte, setAnisotropy, sweepSigns, SILVER, DARK, WARM_LIGHT, HOUSE_H, STYLE_PAL } from './buildings.js';
import { initPanels, renderPanels, countdownKey, queueToast, liveEvents, hasToasts, keyOf, esc, staleText, renderAge, missionOf, renderBell, setMe as panelsSetMe, renderFinder, finderKey, locatePerson, MAPKEYS, mapColorFor, renderMapKey, renderPaper, renderLeague } from './panels.js';
import { makeLife, blimpLines } from './life.js';
import { makeEffects, launchRocket } from './effects.js';
import { loadHistory, renderTimeline, startTimelapse, openRace, playRace, weekDiary, reachedOn } from './history.js';
import { initLinks } from './links.js';
import { drawCard } from './card.js';
import { drawMedalSheet, MEDAL_PX } from './medal.js';
import { canCopyImages } from '../lib/clipboard.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const LOW_Q = params.get('quality') === 'low';
const DEMO = params.has('demo'); // demo mode: the fictional region of the demo source (the API gets ?demo)
const API_Q = DEMO ? '?demo' : '';
// A device that asks to reduce motion (iOS Reduce Motion; Android "Remove animations", which some
// battery savers turn on by themselves) keeps the city's slow everyday life: cars, people, cranes,
// flames and smoke, the Ferris wheel, boats, clouds. It loses only the bursts (ANIM): fireworks,
// sparkles, confetti, rockets, blinking lights, the monster and its shake.
const ANIM = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// a new reading as often as the server makes one (REFRESH_SECONDS: a minute with real data, 15 s with generated data)
const REFRESH_MS = clamp((Number(config.refreshSeconds) || 60) * 1000, 5_000, 600_000), TOUR_MS = 24_000;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ───────── a scale that holds giants ─────────
// Linear up to the cloud line and compressed above it. FLOOR is the height of a floor in the world,
// the same in the whole region: the region's tallest building ends up ~16 lots tall.
const SQUEEZE = 0.5;
let CLOUD = Infinity, FLOOR = 0.5;
const scaled = (f) => (f <= CLOUD ? f : CLOUD + SQUEEZE * CLOUD * Math.log1p((f - CLOUD) / CLOUD));
// Breathing room at the base: next to a giant, a purely linear scale flattens every building from 15
// to a few dozen floors into the same low box, shorter than a townhouse. A rise that grows with the
// logarithm of the floors up to the skyscraper line and stays the same above it keeps the order (more
// floors is always taller) and lets the small ones be told apart.
const RISE0 = 5, RISE = 7, RISE_TOP = 450;
const rise = (f) => RISE0 + RISE * Math.min(1, Math.log(f / 15) / Math.log(RISE_TOP / 15));
const hOfFloors = (f) => (f < 15 ? HOUSE_H[kind(f)] : rise(f) + scaled(f) * FLOOR);
const heightOf = (b) => hOfFloors(b.floors);
// this week's floors at the top (the yellow scaffold): the same scale, so it is what the building grew
const wkOf = (b) => (b.floors < 15 ? (scaled(b.floors) - scaled(Math.max(0, b.floors - b.week))) * FLOOR : Math.max(0, hOfFloors(b.floors) - hOfFloors(Math.max(15, b.floors - b.week))));
// The Corporate District's scale: MEGA_R floors in the cities make one in the headquarters (the same
// FLOOR and squeeze, without the houses' minimum), so a campus grows ten times slower than the buildings
const MEGA_R = 10;
const hqH = (f) => Math.max(3, scaled(f / MEGA_R) * FLOOR);

// ───────── renderer, scene and camera ─────────
const stage = $('#stage');
// no WebGL (switched off by policy, a remote desktop, an old video card): say so instead of loading forever
const renderer = (() => {
  try { return new THREE.WebGLRenderer({ antialias: !LOW_Q, preserveDrawingBuffer: params.has('debug') }); } catch (err) {
    $('#loading')?.remove();
    const el = $('#error'); el.hidden = false; el.textContent = t('error.webgl');
    throw err;
  }
})();
// a phone: a lighter canvas (pixel ratio and shadow map), the drawers' framing and the folded panels
const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 820;
const narrow = () => innerWidth <= 700;
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_Q ? 0.85 : PHONE ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW_Q;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3' });
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe3f0, 600, 2400);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 12000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // never below the ground
controls.minDistance = 25; controls.maxDistance = 3000;
controls.autoRotate = params.has('spin') || params.has('tour'); controls.autoRotateSpeed = 0.4;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const sun = new THREE.DirectionalLight(0xfff2df, 3);
sun.castShadow = !LOW_Q;
sun.shadow.mapSize.set(LOW_Q ? 1024 : 4096, LOW_Q ? 1024 : 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 2600;
scene.add(sun, sun.target);
const moon = new THREE.DirectionalLight(0xa9bdff, 0);
moon.position.set(-200, 260, -120);
scene.add(moon);
const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6f7a55, 1);
scene.add(hemi);

// sky: a dome with the hour's gradient (the colors of lib/sky.js), stars at night, clouds and hills
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color('#2a63c9') }, mid: { value: new THREE.Color('#5591e3') }, hor: { value: new THREE.Color('#cfe6ff') }, low: { value: new THREE.Color('#9fb6cc') },
    orb: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: new THREE.Color('#fff2df') }, glowK: { value: 0 } }, // the sky brightens toward the sun (faintly toward the moon)
  vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 low; uniform vec3 orb; uniform vec3 glow; uniform float glowK; varying vec3 vPos;
    void main(){ float t = normalize(vPos).y; float d = max(dot(normalize(vPos), orb), 0.0); vec3 c = t < 0.0 ? mix(hor, low, clamp(-t * 6.0, 0.0, 1.0)) : (t < 0.16 ? mix(hor, mid, t / 0.16) : mix(mid, top, (t - 0.16) / 0.84));
      c += glow * (pow(d, 5.0) * 0.38 + pow(d, 48.0) * 0.5) * glowK;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(5500, 32, 16), skyMat));
const stars = (() => {
  const n = 1200, pos = new Float32Array(n * 3), r = seed('stars');
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, y = 0.08 + r() * 0.92, k = Math.sqrt(1 - y * y); pos.set([Math.cos(a) * k * 5200, y * 5200, Math.sin(a) * k * 5200], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  scene.add(p); return p;
})();
// The sun and the moon: a disc with a halo on the dome, where the light comes from. Below the horizon
// they are gone; buildings and hills pass in front of them.
function orbSprite(core, halo, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, core); gr.addColorStop(0.2, core); gr.addColorStop(0.26, halo); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(size, size, 1); s.renderOrder = -1; scene.add(s); return s;
}
const sunDisc = orbSprite('rgba(255,250,232,1)', 'rgba(255,226,160,.42)', 620), moonDisc = orbSprite('rgba(236,241,255,1)', 'rgba(190,205,255,.26)', 380);
const moonDir = new THREE.Vector3(0, 1, 0);
const clouds = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(), r = seed('clouds');
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    const k = 70 + r() * 110; s.scale.set(k * 1.6, k * 0.7, 1);
    s.position.set((r() - 0.5) * 2600, 260 + r() * 160, (r() - 0.5) * 2600); s.userData.v = 1.5 + r() * 2; g.add(s);
  }
  scene.add(g); return g;
})();
let hills = null, hillsSize = 0, fieldMat = null;
// The land beyond the map: a patchwork of fields and pasture up to the hills, instead of one flat green.
function fieldsMaterial() {
  if (fieldMat) return fieldMat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d'), r = seed('fields');
  x.fillStyle = '#7fb95a'; x.fillRect(0, 0, 512, 512);
  const tones = ['#86c05f', '#79b356', '#8cc566', '#a9c66a', '#c9c873', '#74ad5a', '#93c770'];
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) { // 8×8 plots, some joined, each with its tone and its furrows
    if (r() < 0.28) continue;
    const w = r() < 0.25 ? 2 : 1, h = r() < 0.25 ? 2 : 1, px = gx * 64, py = gy * 64;
    x.fillStyle = tones[Math.floor(r() * tones.length)]; x.globalAlpha = 0.55; x.fillRect(px + 2, py + 2, w * 64 - 4, h * 64 - 4);
    x.globalAlpha = 0.12; x.fillStyle = '#2f5a2a';
    const vert = r() < 0.5; for (let k = 6; k < 64 * (vert ? w : h) - 4; k += 7) { if (vert) x.fillRect(px + k, py + 3, 1.5, h * 64 - 6); else x.fillRect(px + 3, py + k, w * 64 - 6, 1.5); }
    x.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(22, 22); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  fieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, envMapIntensity: 0.2 });
  mats.add(fieldMat); // it darkens with the hour like every other material
  return fieldMat;
}
function makeHills(size) {
  if (hills) scene.remove(hills);
  // Two rings of low, rounded hills: green ones near, bluish ones behind them (the haze of the distance).
  const r = seed('hills'), g = new THREE.Group(), R0 = Math.max(1700, size * 1.15), dome = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const [n, mat, far, tall] of [[40, matte('#6c9c6e', { flatShading: true }), 1, 1], [34, matte('#7d9cab', { flatShading: true }), 1.65, 1.7]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.16, dist = (R0 + r() * R0 * 0.35) * far, h = (50 + r() * 130) * tall, w = (320 + r() * 460) * far;
      const m = new THREE.Mesh(dome, mat); m.scale.set(w, h, w * (0.7 + r() * 0.5)); m.position.set(Math.cos(a) * dist, -2, Math.sin(a) * dist); m.rotation.y = r() * 6; g.add(m);
    }
  }
  scene.add(g); hills = g; hillsSize = size;
}

// glow (bloom) at night: windows, neon and lamps get a halo
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: PHONE ? 0 : 4 })); // multisampled: without it the night's edges turn jagged
composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = false;

// ───────── state ─────────
let data = null, world = null, GW = 0, GH = 0, terrainSize = 0;
let view = { kind: 'region', id: null };
let selected = null; // { city, person }
let mapMode = MAPKEYS[params.get('map')] ? params.get('map') : null; // SimCity-like data maps: null (normal) | now | week | network | model | belts
let tl = null; // time-lapse running
const cityGroup = new THREE.Group(); scene.add(cityGroup);
const bldGroup = new THREE.Group(); cityGroup.add(bldGroup); // only the buildings (the time-lapse hides them)
// The land: the ground's texture, the water, the bridges, the trees, the lamps and the cars. A new floor
// changes none of it, so it is rebuilt only when the map's layout does (landKeyOf); the buildings, the
// hit boxes and the signs are rebuilt on every reading that changes the drawing.
const landGroup = new THREE.Group(); cityGroup.add(landGroup);
let landKey = '', lastBuild = { ms: 0, full: true };
function landKeyOf(w, grey) {
  let s = `${w.GW}x${w.GH}|${grey ? mapMode : ''}|${params.get('style') ?? ''}|`, n = 0;
  for (const [k, t] of w.tiles) s += `${k}${t.t[0]}${t.t.length}${t.bridge ? 'b' : ''}${t.alt ?? ''}${w.onRoute.has(k) ? 'g' : ''};`;
  for (const o of w.objs) if (o.kind === 'tree' || o.kind === 'lamp') n++;
  return `${s}${n}|${w.lanes.length}`;
}
const hitGroup = new THREE.Group(); scene.add(hitGroup);
const hitByKey = new Map(); // city|person → { x, z, h, b, c }
const dojoHits = new Map(); // city → { x, z, h, w, dojo, c } of the city's Dojo
const hqHits = new Map(); // person → { x, z, h, w, hq | found } in the Corporate District (a headquarters or a foundation)
const MON_H = { obelisk: 31, airport: 12, ferrisWheel: 20, centralPark: 6, tvTower: 53, leadershipStatue: 12, fountainSquare: 5, mayor: 8 }; // hit box heights
const MON_W = { obelisk: 5, tvTower: 6, leadershipStatue: 5 }; // the thin ones get a narrow hit box, so they do not hide what stands behind them
let anims = [], cars = null, kit = null, groundTex = null, life = null, rockets = [];
const fx = makeEffects(scene);
const wx = (gx) => (gx + 0.5 - GW / 2) * L, wz = (gy) => (gy + 0.5 - GH / 2) * L;
const cityOf = (id) => data?.cities.find((c) => c.id === id);
// "my building": whoever found themself in the finder can mark their own building (kept only in this browser)
let me = (() => { try { return localStorage.getItem('city.me'); } catch { return null; } })();
panelsSetMe(me);

// panels hidden by the 👁️ (or by each one's ×), and 'names', the cities' signs.
const PANELS = ['trophies', 'mega', 'ranking', 'derby', 'countdown', 'legend', 'hall', 'news'];
const hiddenPanels = (() => {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('city.hiddenPanels') || '[]'); } catch {}
  const set = new Set(Array.isArray(saved) ? saved.filter((p) => PANELS.includes(p) || p === 'names') : []);
  if (params.get('panels') === '0') PANELS.forEach((p) => set.add(p));
  if (params.get('names') === '0') set.add('names');
  return set;
})();

// ───────── the scene from the data ─────────
function clearScene(full = true) {
  const drop = (o) => o.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
  // the buildings, the signs and the hit boxes go every time (bldGroup is emptied too: otherwise the
  // cranes and meshes of the previous reading pile up under the new ones, every minute)
  // the signs and labels go every time; the parts of the scene (one per city) are dropped one by one, when
  // they change (buildScene); the cranes' jibs are one mesh for the whole region, made again every time
  for (const ch of [...cityGroup.children]) if (ch !== landGroup && ch !== bldGroup) { drop(ch); cityGroup.remove(ch); }
  for (const m of craneMeshes) bldGroup.remove(m);
  craneMeshes = [];
  if (full) { for (const k of [...parts.keys()]) dropPart(k); drop(landGroup); landGroup.clear(); groundTex?.dispose(); groundTex = null; cars = null; }
  life?.dispose(); life = null;
  anims = [];
}
// ───────── the parts of the scene: one per city ─────────
const PER_CITY_MAX = 24;
// One piece for the whole region instead of one per city: fewer draw calls per frame, a full redraw on
// every change. Asked for with ?parts=0, or chosen by the page itself when the machine cannot keep up
// with the pieces (a weak video card, a TV): the first seconds are timed, and under 38 frames a second
// the region is merged into one piece (?parts=1 keeps the pieces whatever the speed).
let onePiece = params.get('parts') === '0';
const paceCheck = { on: params.get('parts') == null, from: 0, frames: 0 };
function watchPace(now) {
  if (!paceCheck.on || onePiece || !data || tl || document.hidden || parts.size < 2) { paceCheck.from = 0; return; }
  if (!paceCheck.from) { paceCheck.from = now + 3000; paceCheck.frames = 0; return; } // the first seconds (loading, the first flight) do not count
  if (now < paceCheck.from) return;
  paceCheck.frames++;
  if (now - paceCheck.from < 6000) return;
  const fps = paceCheck.frames / ((now - paceCheck.from) / 1000);
  paceCheck.on = false; // one measure per visit
  if (fps < 38) { onePiece = true; console.info(`[city] ${fps.toFixed(0)} frames a second with one piece per city: the region is now one piece`); buildScene(); }
}
const parts = new Map(); // city id (or '~district', or '~all') → { sig, group, hits, entries, kit, airports, maxH }
let craneMeshes = [], backMarks = []; // backMarks: the buildings back from the ashes today (the golden scaffold)
// what a building's drawing depends on (the same fields decide whether a reading redraws anything)
const bSig = (b) => `${b.id}|${Math.floor(b.floors)}|${Math.round(b.week)}|${+b.now}|${+b.isNew}|${b.heli}|${b.streak}|${+(b.today > 0)}|${b.night}|${b.cities}|${b.hours}|${b.belt}|${b.back ?? 0}|${+!!b.record}|${+!!b.beltUp}|${+!!b.mega}|${ruinOf(b) ?? ''}`;
const flat = (v) => (v && typeof v === 'object' ? (v.id ?? v.key ?? '') + (Array.isArray(v) ? v.length : '') + (v.lastMonth ?? '') + (v.floors ? Math.floor(v.floors) : '') : v);
function partSig(o) {
  const at = `${o.gx},${o.gy}`;
  if (o.kind === 'bld') return `${at}|${o.c.style}|${bSig(o.b)}`;
  if (o.kind === 'mon') return `m${at}|${o.size}|${o.c.style}|${Object.values(o.m).map(flat).join(',')}`;
  if (o.kind === 'hq' || o.kind === 'found') return `${o.kind}${at}|${o.rank}|${bSig(o.p)}|${o.p.parts.map((x) => `${x.c.id}:${Math.floor(x.b.floors)}:${Math.round(x.b.week)}`).join('.')}`;
  return o.kind + at;
}
function dropPart(k) {
  const part = parts.get(k);
  if (!part) return;
  part.group.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
  bldGroup.remove(part.group);
  for (const hit of part.hits) { hit.geometry.dispose(); hitGroup.remove(hit); }
  for (const [map, key] of part.keys) map.delete(key);
  parts.delete(k);
}
// a part that did not change keeps its meshes: only its hit boxes learn the new reading's objects
function refreshPart(part, objs) {
  objs.forEach((o, i) => {
    const ud = part.entries[i];
    if (!ud) return;
    if (o.kind === 'bld') { ud.b = o.b; ud.c = o.c; } else if (o.kind === 'mon') { ud.c = o.c; if (ud.dojo) ud.dojo = o.m; else ud.mon = o.m; } else ud[o.kind] = o.p;
  });
}
function buildPart(objs, sig, colorOf) {
  const batch = new Batcher(), group = new THREE.Group(), part = { sig, group, hits: [], entries: [], keys: [], airports: [], maxH: new Map(), kit: null };
  kit = part.kit = makeKit(batch, heightOf, wkOf, colorOf);
  const addHit = (hit, ud) => { hit.layers.set(1); hit.userData = ud; hitGroup.add(hit); part.hits.push(hit); return ud; };
  for (const o of objs) {
    const x = wx(o.gx), z = wz(o.gy);
    let ud = null;
    if (o.kind === 'bld') {
      const { h, top } = o.b.floors < 15 ? kit.house(o.b, o.c, x, z) : kit.tower(o.b, o.c, x, z);
      part.maxH.set(o.c.id, Math.max(part.maxH.get(o.c.id) ?? 0, h));
      const hit = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, h + 2, L * 0.9), DARK);
      hit.position.set(x, (h + 2) / 2, z);
      ud = addHit(hit, { b: o.b, c: o.c, h, top: top ?? h, x, z }); // top: the tip of the spire or the antenna (the outline goes up to it)
      hitByKey.set(keyOf(o.c.id, o.b.id), ud); part.keys.push([hitByKey, keyOf(o.c.id, o.b.id)]);
    } else if (o.kind === 'mon') {
      const mx = x + (o.size - 1) * L / 2, mz = z + (o.size - 1) * L / 2;
      const out = kit.monument(o.m, o.size, mx, mz);
      // every monument can be hovered (its name and what earns it); the Dojo also opens the masters' card
      const h = out?.h ?? MON_H[o.m.key] ?? 8, w = MON_W[o.m.key] ?? o.size * L * 0.95, hit = new THREE.Mesh(new THREE.BoxGeometry(w, h + 1, w), DARK);
      hit.position.set(mx, (h + 1) / 2, mz);
      ud = addHit(hit, o.m.key === 'dojo' ? { dojo: o.m, c: o.c, h, x: mx, z: mz, w } : { mon: o.m, c: o.c, h, x: mx, z: mz, w });
      if (o.m.key === 'dojo') { dojoHits.set(o.c.id, ud); part.keys.push([dojoHits, o.c.id]); }
      if (o.m.key === 'airport') part.airports.push({ x0: mx - o.size * L * 0.5, x1: mx + o.size * L * 0.5, z: mz - 4 });
    } else if (o.kind === 'hq' || o.kind === 'found') { // the Corporate District: a headquarters or the foundation of the next in line
      const cx = x + L / 2, cz = z + L / 2;
      const { h } = o.kind === 'hq' ? kit.hq(o.p, cx, cz, hqH) : kit.foundation(o.p, cx, cz, world.mega.line, Math.max(2, hqH(world.mega.line / 2) - 0.8));
      const w = L * (o.kind === 'hq' ? 1.84 : 1.76), hit = new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, w), DARK); // the campus's pad, the foundation's fence
      hit.position.set(cx, (h + 2) / 2, cz);
      ud = addHit(hit, { [o.kind]: o.p, h, x: cx, z: cz, w, rank: o.rank });
      hqHits.set(o.p.id, ud); part.keys.push([hqHits, o.p.id]);
    } else if (o.kind === 'diamond') kit.diamond(x, z);
    part.entries.push(ud);
  }
  for (const m of batch.build()) group.add(m);
  for (const a of kit.anims) group.add(a.obj);
  bldGroup.add(group);
  return part;
}
function buildScene() {
  const t0 = performance.now(), src = data;
  world = buildWorld(src, { allMonuments: params.get('monuments') === 'all' });
  GW = world.GW; GH = world.GH; terrainSize = Math.max(GW, GH) * L;
  // a big scene (the dense ?demo region): a smaller shadow map, otherwise the shadow pass rules the frame
  const want = LOW_Q ? 1024 : PHONE || src.cities.reduce((a, c) => a + c.buildings.length, 0) > 1500 ? 2048 : 4096;
  if (sun.shadow.mapSize.x !== want) { sun.shadow.mapSize.set(want, want); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (STYLE_PAL[params.get('style')]) for (const c of src.cities) c.style = params.get('style');
  const grey = !!mapMode, key = landKeyOf(world, grey), full = key !== landKey;
  landKey = key;
  clearScene(full);
  if (full) {
  // ground: the terrain's texture and the field up to the horizon
  groundTex = new THREE.CanvasTexture(groundCanvas(world, { grey })); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0, envMapIntensity: 0.2 * (0.15 + 0.85 * dayF) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW * L, GH * L), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; landGroup.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), grey || LOW_Q ? matte(grey ? '#aeb3aa' : '#7fb95a') : fieldsMaterial());
  far.rotation.x = -Math.PI / 2; far.position.y = -0.3; far.receiveShadow = true; landGroup.add(far);
  // river: a sheet of water over the texture; bridges where the highways cross
  const scen = new Batcher(), waterTiles = [];
  for (const [key, t] of world.tiles) {
    const gx = Math.floor(key / 10000), gy = key % 10000;
    if (t.t === 'water' || t.bridge) waterTiles.push(new THREE.PlaneGeometry(L, L).rotateX(-Math.PI / 2).translate(wx(gx), 0.08, wz(gy)));
    if (t.bridge) {
      scen.add(new THREE.BoxGeometry(L * 0.6, 0.7, L).translate(0, 0.35, 0).toNonIndexed(), DARK, wx(gx), 0.2, wz(gy));
      for (const s of [-1, 1]) scen.add(new THREE.BoxGeometry(0.3, 1.1, L).translate(0, 0.55, 0).toNonIndexed(), SILVER, wx(gx) + s * L * 0.29, 0.9, wz(gy));
    }
  }
  if (waterTiles.length) {
    const water = new THREE.Mesh(mergeGeometries(waterTiles, false), matte(grey ? '#8ea3b5' : '#3f8fd0', { roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.72, envMapIntensity: 0.9 }));
    landGroup.add(water);
    waterMat = grey ? null : water.material;
    if (!grey && !LOW_Q) { const rip = new THREE.Mesh(water.geometry.clone().translate(0, 0.03, 0), rippleMat); rip.renderOrder = 1; landGroup.add(rip); } // glints drifting over the water
    applyWater();
  }
  for (const m of scen.build()) landGroup.add(m);
  } // (the land)
  // Buildings, houses and monuments, from the kit, merged by material, in parts: a reading that changes one
  // city redraws only its part, and the others stay as they are. Up to PER_CITY_MAX cities, each city is
  // a part; a bigger region is cut into PER_CITY_MAX blocks of neighboring cities (in the map's reading
  // order), so the draw calls stay those of PER_CITY_MAX parts. The Corporate District is a part of its own.
  const colorOf = grey ? mapColorFor(mapMode, world.maxWeek) : null;
  const blockOf = new Map();
  if (!onePiece) {
    const order = [...src.cities].filter((c) => c.box).sort((a, b) => a.box.sy - b.box.sy || a.box.sx - b.box.sx), size = Math.max(1, Math.ceil(order.length / PER_CITY_MAX));
    order.forEach((c, i) => blockOf.set(c.id, size === 1 ? c.id : '~b' + Math.floor(i / size)));
  }
  const groups = new Map(), trees = [], lamps = [];
  for (const o of world.objs) {
    if (o.kind === 'tree') trees.push({ x: wx(o.gx) - L / 2 + o.u * L, z: wz(o.gy) - L / 2 + o.v * L, s: o.s });
    else if (o.kind === 'lamp') lamps.push({ x: wx(o.gx) + L * 0.36, z: wz(o.gy) + L * 0.36 });
    else { const k = onePiece ? '~all' : o.c ? blockOf.get(o.c.id) ?? '~loose' : '~district'; (groups.get(k) ?? groups.set(k, []).get(k)).push(o); }
  }
  const head = `${FLOOR}|${CLOUD}|${grey ? `${mapMode}${world.maxWeek}` : ''}|${world.mega.line}|${params.get('style') ?? ''}|`;
  const patch = !full && parts.size === groups.size && [...groups.keys()].every((k) => parts.has(k));
  if (!patch) for (const k of [...parts.keys()]) dropPart(k);
  let rebuilt = 0;
  for (const [k, objs] of groups) {
    const sig = head + objs.map(partSig).join(';'), old = parts.get(k);
    if (old && old.sig === sig) { refreshPart(old, objs); continue; } // nothing to redraw here: only the new reading's objects
    if (old) dropPart(k);
    parts.set(k, buildPart(objs, sig, colorOf)); rebuilt++;
  }
  if (!patch) sweepSigns(); // frees the canvas signs this reading no longer draws (not when some parts were kept: theirs are still in use)
  // what belongs to the whole region, gathered from the parts: the heights, the animations, the cranes' jibs
  for (const c of src.cities) c.maxH = 0;
  anims = [];
  const cranes = [], marks = [], airports = [], kitTrees = [];
  backMarks = [];
  for (const part of parts.values()) {
    anims.push(...part.kit.anims); cranes.push(...part.kit.cranes); marks.push(...part.kit.marks); backMarks.push(...part.kit.marks.filter((m) => m.kind === 'back')); airports.push(...part.airports); kitTrees.push(...part.kit.trees);
    for (const [id, h] of part.maxH) { const c = cityOf(id); if (c) c.maxH = Math.max(c.maxH, h); }
  }
  if (cranes.length) { // the jibs of every crane: two instanced meshes, turned every frame
    craneMeshes = craneJib().map(({ geometry, material }) => { const im = new THREE.InstancedMesh(geometry, material, cranes.length); im.castShadow = true; im.frustumCulled = false; bldGroup.add(im); return im; });
    anims.push({ kind: 'cranes', meshes: craneMeshes, list: cranes });
    stepCranes(anims[anims.length - 1], 0);
  }
  if (full) for (const m of [...makeTrees([...trees, ...kitTrees]), ...makeLamps(lamps), makeCars()]) if (m) landGroup.add(m);
  // the cities' signs and the little "N in common" plates on the golden roads
  for (const c of src.cities) {
    const tr = tierOf(c.floors), dj = dojoOf(c), wrap = document.createElement('div'); // the sign sits in a wrapper, to shrink from afar (--signk)
    wrap.innerHTML = `<div class="sign" data-city="${esc(c.id)}">${esc(cityLabel(c))}<small>${tr.icon} ${cityTier(tr.key).name} · ${floorsText(c.floors)} · ${plural(c.people, 'count.building')}</small>${dj ? `<em>🥋 ${plural(dj.count, 'dojo.members')}</em>` : ''}</div>`;
    const sign = new CSS2DObject(wrap); sign.position.set(wx(c.center[0] - 0.5), 5, wz(c.box.sy - 2.2)); cityGroup.add(sign);
  }
  for (const r of world.routes) {
    const mid = r.path[Math.floor(r.path.length / 2)], el = document.createElement('div');
    el.className = 'route'; el.textContent = t('sign.route', { n: fmt.int(r.n) });
    const lab = new CSS2DObject(el); lab.position.set(wx(Math.floor(mid / 10000)), 5, wz(mid % 10000)); cityGroup.add(lab);
  }
  const dt = world.district;
  if (dt) { // the district's sign, at the end of the bridge
    const wrap = document.createElement('div'), n = world.mega.members.length;
    wrap.innerHTML = `<div class="sign district" data-district="1">💎 ${esc(t('mega.district'))}<small>${esc(n ? plural(n, 'mega.count') : t('mega.none'))}</small></div>`;
    const sign = new CSS2DObject(wrap); sign.position.set(wx(dt.sign[0]), 5, wz(dt.sign[1])); cityGroup.add(sign);
  }
  world.maxH = Math.max(0, ...src.cities.map((c) => c.maxH), ...[...hqHits.values()].map((h) => h.h)); // and the district's campuses, in case one stands above the buildings
  if (!hills || Math.abs(hillsSize - terrainSize) > terrainSize * 0.15) makeHills(terrainSize); // the hills follow the region when it grows
  // life: people, boats, planes, helicopter, airship, beacon, elevator
  life = makeLife({ scene, world, data: src, wx, wz, marks, airports, size: terrainSize });
  life.setBlimpMsgs(blimpLines(src, context(src).leader));
  updateHeli();
  applyHour(hour);
  paintMe();
  lastBuild = { ms: Math.round(performance.now() - t0), full, parts: parts.size, rebuilt };
}

// ───────── trees, lamps and cars (instanced) ─────────
function makeTrees(list) {
  const n = list.length; if (!n) return [];
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0), matte('#6b4b2e'), n);
  // in a dense region (tens of thousands of trees) the crown gets 20 faces instead of 80: unnoticeable from afar, and the shadows are grateful
  // Three shapes, fixed by where each tree stands: round crowns, pines and tall poplars, each with its greens.
  const det = n > 6000 ? 0 : 1, kinds = [[], [], []];
  list.forEach((t, i) => { const v = hash(Math.round(t.x * 7), Math.round(t.z * 7), 12); kinds[v < 0.62 ? 0 : v < 0.86 ? 1 : 2].push(i); });
  const geos = [new THREE.IcosahedronGeometry(1, det), new THREE.ConeGeometry(0.92, 2.3, 7).translate(0, 0.3, 0), new THREE.IcosahedronGeometry(1, det).scale(0.6, 1.5, 0.6).translate(0, 0.4, 0)];
  const greens = mapMode ? [['#9aa89a', '#a3b0a3', '#93a193', '#aab6aa'], ['#8e9a8e', '#96a296'], ['#a6b2a6', '#aebaae']]
    : [['#3f8f4a', '#4c9c3f', '#2f7d45', '#58a84a'], ['#1f6b45', '#2a7a4e', '#236a3c'], ['#6aa84f', '#7ab85a', '#5c9c48']];
  const crowns = geos.map((g, k) => new THREE.InstancedMesh(g, matte('#ffffff', { roughness: 0.95, envMapIntensity: 0.2 }), kinds[k].length));
  const mt = new THREE.Matrix4(), col = new THREE.Color();
  list.forEach((t, i) => { const s = t.s * 2.2; mt.makeScale(s * 0.9, s * 0.8, s * 0.9).setPosition(t.x, 0, t.z); trunk.setMatrixAt(i, mt); });
  kinds.forEach((idx, k) => idx.forEach((i, j) => {
    const t = list[i], s = t.s * 2.2;
    mt.makeScale(s * 1.05, s * 1.15, s * 1.05).setPosition(t.x, s * 0.8 + s * 0.95, t.z); crowns[k].setMatrixAt(j, mt);
    crowns[k].setColorAt(j, col.set(greens[k][Math.floor(hash(Math.round(t.x * 10), Math.round(t.z * 10), 8) * greens[k].length)]));
  }));
  trunk.castShadow = true;
  for (const c of crowns) { c.castShadow = true; c.receiveShadow = true; }
  return [trunk, ...crowns.filter((c) => c.count > 0)];
}
// The pool of light under each street lamp: a flat disc that adds a warm glow to the ground at night
// (no real light: hundreds of lamps would cost every pixel of every material).
const poolMat = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.35, 'rgba(255,196,120,.5)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
})();
function makeLamps(list) {
  const n = list.length; if (!n) return [];
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6).translate(0, 2.5, 0), SILVER, n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 8), WARM_LIGHT, n);
  const mt = new THREE.Matrix4();
  const pool = LOW_Q || mapMode ? null : new THREE.InstancedMesh(new THREE.CircleGeometry(6.5, 20).rotateX(-Math.PI / 2), poolMat, n);
  list.forEach((p, i) => { mt.makeTranslation(p.x, 0, p.z); pole.setMatrixAt(i, mt); mt.makeTranslation(p.x, 5.1, p.z); head.setMatrixAt(i, mt); mt.makeTranslation(p.x, 0.14, p.z); pool?.setMatrixAt(i, mt); });
  pole.castShadow = true;
  if (pool) pool.renderOrder = 1;
  return pool ? [pole, head, pool] : [pole, head];
}
const CAR_COLORS = ['#d9473f', '#f2f2f2', '#3d7bd9', '#f2c14e', '#2f3640', '#7bc043'];
function makeCars() {
  const list = [], r = seed('cars');
  const laneAB = (ln) => (ln.axis === 'x' ? [[wx(ln.a) - L / 2, wz(ln.f)], [wx(ln.b - 1) + L / 2, wz(ln.f)]] : [[wx(ln.f), wz(ln.a) - L / 2], [wx(ln.f), wz(ln.b - 1) + L / 2]]);
  for (const ln of world.lanes) {
    const [a, b] = laneAB(ln), len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / (ln.hwy ? 34 : 48)));
    for (let i = 0; i < n; i++) for (const dir of [1, -1]) list.push({ a, b, len, t: r(), v: (6 + r() * 5) / len, dir, col: ln.gold ? '#f2b705' : CAR_COLORS[Math.floor(r() * CAR_COLORS.length)] });
  }
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.1, 1.3), matte('#ffffff', { roughness: 0.4, metalness: 0.3, envMapIntensity: 0.8 }), list.length);
  const col = new THREE.Color();
  list.forEach((c, i) => mesh.setColorAt(i, col.set(c.col)));
  mesh.castShadow = true;
  cars = { list, mesh };
  return mesh;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
function stepCars(dt) {
  if (!cars) return;
  cars.list.forEach((c, i) => {
    c.t = (c.t + c.v * dt * c.dir + 1) % 1;
    const { a, b } = c, dx = (b[0] - a[0]) / c.len, dz = (b[1] - a[1]) / c.len;
    _p.set(a[0] + (b[0] - a[0]) * c.t - dz * c.dir * 1.7, 0.6, a[1] + (b[1] - a[1]) * c.t + dx * c.dir * 1.7); // drive on the right
    _q.setFromAxisAngle(_up, Math.atan2(-dz * c.dir, dx * c.dir));
    cars.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  cars.mesh.instanceMatrix.needsUpdate = true;
}

// ───────── the time of day ─────────
// The sun goes east to west with the time in the configured zone; at night, a bluish moon, lit
// windows and lamps, and glow. Automatic (the zone's time, minute by minute) or fixed (?hour= or the 🌗 control).
let hour = zoneHour(), hourAuto = !params.has('hour'), dayF = 1, groundMat = null, waterMat = null;
// Living water: soft glints that drift over the river and the channel (a texture that slides, no
// shader), and the water takes some of the sky's color with the hour.
const rippleMat = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), r = seed('ripples');
  for (let i = 0; i < 46; i++) {
    const px = r() * 256, py = r() * 256, w = 14 + r() * 34, h = 2 + r() * 3;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { // repeated at the edges, so the texture tiles
      const gr = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, w);
      gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.save(); x.translate(px + ox, py + oy); x.scale(1, h / w); x.translate(-px - ox, -py - oy); x.fillStyle = gr; x.fillRect(px + ox - w, py + oy - w, w * 2, w * 2); x.restore();
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false });
})();
function applyWater() {
  rippleMat.opacity = 0.14 + 0.4 * dayF;
  if (waterMat) waterMat.color.set('#3f8fd0').lerp(new THREE.Color(skyColorsAt(hour)[1]), 0.22 + 0.3 * (1 - dayF));
}
const sunDir = new THREE.Vector3(0, 1, 0);
function applyHour(h) {
  h = ((h % 24) + 24) % 24; hour = h;
  const el = Math.sin(((h - 6) / 12) * Math.PI), az = ((h - 12) / 12) * Math.PI;
  dayF = smooth(-0.08, 0.28, el);
  const dusk = 1 - smooth(0.05, 0.45, Math.abs(el));
  sunDir.set(Math.sin(az) * 0.85, Math.max(0.04, el), Math.cos(az) * 0.6 - 0.2).normalize();
  // the discs: the sun on its arc (it sets instead of stopping at the horizon), the moon on the night's arc
  const elM = Math.sin((((h + 6) % 24) / 12) * Math.PI), azM = ((((h + 12) % 24) - 12) / 12) * Math.PI;
  const sunVis = smooth(-0.1, 0.04, el), moonVis = smooth(-0.06, 0.1, elM) * (1 - dayF);
  sunDisc.position.set(Math.sin(az) * 0.85, el, Math.cos(az) * 0.6 - 0.2).normalize().multiplyScalar(5000);
  moonDir.set(Math.sin(azM) * 0.85, Math.max(0.05, elM), Math.cos(azM) * 0.6 - 0.2).normalize();
  moonDisc.position.set(Math.sin(azM) * 0.85, elM, Math.cos(azM) * 0.6 - 0.2).normalize().multiplyScalar(5000);
  sunDisc.material.opacity = sunVis; sunDisc.visible = sunVis > 0.01; moonDisc.material.opacity = moonVis; moonDisc.visible = moonVis > 0.01;
  moon.position.copy(moonDir).multiplyScalar(400);
  sun.intensity = 3.2 * dayF; sun.color.set('#fff2df').lerp(new THREE.Color('#ffb070'), dusk * 0.7);
  sunDisc.material.color.copy(sun.color);
  renderer.shadowMap.autoUpdate = dayF > 0.02; // at night the sun casts nothing: the shadow pass rests
  if (sunVis > moonVis * 0.3) { skyMat.uniforms.orb.value.copy(sunDisc.position).normalize(); skyMat.uniforms.glow.value.copy(sun.color); skyMat.uniforms.glowK.value = sunVis * (0.55 + 0.6 * dusk); }
  else { skyMat.uniforms.orb.value.copy(moonDir); skyMat.uniforms.glow.value.set('#8fa6e8'); skyMat.uniforms.glowK.value = moonVis * 0.35; }
  moon.intensity = 0.45 * (1 - dayF);
  const sky = skyColorsAt(h);
  skyMat.uniforms.top.value.set(sky[0]); skyMat.uniforms.mid.value.set(sky[1]); skyMat.uniforms.hor.value.set(sky[3]); skyMat.uniforms.low.value.set(sky[3]).multiplyScalar(0.7);
  hemi.color.set(sky[1]).lerp(new THREE.Color('#ffffff'), 0.3); hemi.groundColor.set('#6f7a55'); hemi.intensity = 0.28 + 0.92 * dayF;
  const size = Math.max(600, terrainSize);
  scene.fog.color.set(sky[3]); scene.fog.near = size * (0.7 + 0.4 * dayF); scene.fog.far = size * (2 + 1.2 * dayF);
  renderer.toneMappingExposure = 1 + 0.25 * (1 - dayF);
  stars.material.opacity = 0.9 * (1 - dayF);
  for (const m of mats) m.envMapIntensity = (m.userData.env ??= m.envMapIntensity) * (0.15 + 0.85 * dayF);
  if (groundMat) groundMat.envMapIntensity = 0.2 * (0.15 + 0.85 * dayF); // the ground darkens with everything else (it stayed bright green at night)
  const night = 1 - dayF;
  for (const { m, i } of lit) { m.userData.base = i; m.emissiveIntensity = i * night; }
  useBloom = !LOW_Q && night > 0.35; bloom.strength = 0.65 * night;
  // the clouds take the hour's light: white by day, orange at dusk, slate under the moon
  const cloudCol = new THREE.Color('#ffffff').lerp(new THREE.Color('#ffb98f'), dusk * 0.55 * dayF).lerp(new THREE.Color('#46507a'), 1 - dayF);
  clouds.children.forEach((s) => { s.material.opacity = 0.35 + 0.5 * dayF; s.material.color.copy(cloudCol); });
  poolMat.opacity = 0.5 * night; // the pools of light under the street lamps
  applyWater();
  $('#hour').value = h; $('#hour-out').value = fmt.clock(h);
  $('#sky-btn').classList.toggle('lit', !hourAuto);
  document.querySelectorAll('[data-hour]').forEach((b) => b.classList.toggle('on', b.dataset.hour === 'auto' ? hourAuto : !hourAuto && Number(b.dataset.hour) === h));
}
setInterval(() => { if (hourAuto) applyHour(zoneHour(undefined, { real: true })); }, 60_000);

// ───────── camera: framings and flights ─────────
let camTween = null, shadowR = 0;
function currentView() {
  const t = controls.target, d = camera.position.clone().sub(t), dist = d.length();
  return { theta: Math.atan2(d.x, -d.z), phi: Math.asin(clamp(d.y / dist, -1, 1)), dist };
}
const posFor = (t, theta, phi, dist) => new THREE.Vector3(t.x + Math.sin(theta) * Math.cos(phi) * dist, t.y + Math.sin(phi) * dist, t.z - Math.cos(theta) * Math.cos(phi) * dist);
function fitRegion() {
  const mh = world?.maxH ?? 0;
  return { target: new THREE.Vector3(0, Math.min(30, mh * 0.2), 0), phi: 0.62, dist: terrainSize * 0.78 + mh * 0.8 };
}
function fitCity(c) {
  const bx = c.box, mh = c.maxH ?? 10;
  return { target: new THREE.Vector3(wx(bx.sx + bx.cw / 2 - 0.5), clamp(mh * 0.35, 5, 60), wz(bx.sy + bx.ch / 2 - 0.5)), phi: 0.42, dist: Math.max(bx.cw, bx.ch) * L * 1.2 + mh * 1.5 };
}
function flyTo(fit, ms = 1500, theta = null) {
  const v = currentView(), th = theta ?? v.theta;
  const to = posFor(fit.target, th, fit.phi, fit.dist);
  if (ms <= 0) { controls.target.copy(fit.target); camera.position.copy(to); controls.update(); return; }
  camTween = { fromT: controls.target.clone(), toT: fit.target.clone(), fromP: camera.position.clone(), toP: to, t0: performance.now(), ms };
}
function stepCamera(now) {
  if (!camTween) return;
  const k = smooth(0, 1, (now - camTween.t0) / camTween.ms);
  controls.target.lerpVectors(camTween.fromT, camTween.toT, k);
  camera.position.lerpVectors(camTween.fromP, camTween.toP, k);
  if (k >= 1) camTween = null;
}
const refit = (ms = 1200) => { const c = view.kind === 'city' && cityOf(view.id); flyTo(c ? fitCity(c) : fitRegion(), ms); };

// ───────── views ─────────
// the helicopter circles the tallest building in view; the countdown's ring stays in the region
function updateHeli() {
  if (!life) return;
  let best = null;
  for (const h of hitByKey.values()) if ((view.kind !== 'city' || h.c.id === view.id) && (!best || h.b.floors > best.b.floors)) best = h;
  life.setTarget(best ? { x: best.x, y: best.h, z: best.z } : null);
}
function updateRing() { const h = view.kind === 'region' && countdownKey() ? hitByKey.get(countdownKey()) : null; fx.setRing(h ? { x: h.x, z: h.z } : null); }
// the flight to a building (finder, card, link): the camera comes close, with the building in the middle of the screen
const fitBuilding = (h) => ({ target: new THREE.Vector3(h.x, Math.min(h.h * 0.45, 40), h.z), phi: 0.42, dist: 180 });
// On a narrow screen City Hall and the card are drawers at the bottom: the picture's center goes up,
// so the touched building (always flown to the middle) stays above them.
function frameForDrawers() {
  if (narrow() && (selected || view.kind === 'city')) camera.setViewOffset(innerWidth, innerHeight, 0, Math.round(innerHeight * 0.18), innerWidth, innerHeight);
  else camera.clearViewOffset();
}
function setMenu(on) {
  if (on) document.documentElement.dataset.menu = ''; else delete document.documentElement.dataset.menu;
  $('#menu-btn').setAttribute('aria-expanded', String(on));
}
function setView(next, person = null) { // person: the person's id, or { dojo: true } for the city's Dojo
  view = next; selected = person?.dojo ? { city: next.id, dojo: true } : person ? { city: next.id, person } : null;
  renderPanels(data, view, selected); $('#hall').classList.remove('open'); frameForDrawers();
  const h = person?.dojo ? dojoHits.get(next.id) : person && hitByKey.get(keyOf(next.id, person));
  if (h) flyTo(fitBuilding(h), 1500); else refit(1500);
  updateHeli(); updateRing(); syncUrl();
  atDistrict = false; if (tourTimer) tourCaption();
}
// the card of the city's Dojo (masters and who is on the way), with the Dojo in the middle of the screen
function selectDojo(cityId) {
  selected = { city: cityId, dojo: true };
  renderPanels(data, view, selected); frameForDrawers();
  const h = dojoHits.get(cityId);
  if (h) { const v = currentView(); flyTo({ target: new THREE.Vector3(h.x, 6, h.z), phi: v.phi, dist: clamp(v.dist, 80, 240) }, 900); }
  syncUrl();
}
// The Corporate District: a headquarters' (or foundation's) card with the camera on it; the view
// goes back to the region (the district is outside every city)
function fitDistrict() {
  const d = world?.district; if (!d) return fitRegion();
  const top = Math.max(10, ...[...hqHits.values()].map((h) => h.h));
  return { target: new THREE.Vector3(wx((d.x0 + d.x1) / 2), top * 0.3, wz(d.DH / 2)), phi: 0.48, dist: Math.max((d.x1 - d.x0) * L * 0.7, top * 2.2) }; // from above: the campuses are low, behind the cities
}
function toRegion() { view = { kind: 'region', id: null }; renderPanels(data, view, selected); $('#hall').classList.remove('open'); frameForDrawers(); updateHeli(); updateRing(); }
function selectHq(id) {
  const h = hqHits.get(id); if (!h) return;
  closeModals(); selected = { hq: id }; toRegion();
  const v = currentView();
  flyTo({ target: new THREE.Vector3(h.x, h.h * 0.4, h.z), phi: clamp(v.phi, 0.2, 0.5), dist: clamp(h.h * 2.6, 60, 800) }, 1200); // the whole campus, crown included
  syncUrl();
}
function goDistrict() { if (!world?.district) return; closeModals(); selected = null; toRegion(); flyTo(fitDistrict(), 1500); syncUrl(); atDistrict = true; if (tourTimer) tourCaption(); }
function goRegion() { if (view.kind !== 'region') setView({ kind: 'region', id: null }); else refit(); }
function goCity(id, person = null) { if (!cityOf(id)) return; closeModals(); setView({ kind: 'city', id }, person); }
function goPerson(cityId, personId) { goCity(cityId, personId); }

// ───────── the address follows the screen ─────────
// The city, the building (or the Dojo, or a headquarters), the data map and a fixed hour go to the URL
// as the user moves: Back returns to where they were, and a reload or a copied address opens the same
// screen. A new place is a step in the history; a map or an hour only rewrites the current step. Not
// during the TV tour, which would fill the history.
const NAV_KEYS = ['city', 'person', 'dojo', 'hq', 'map', 'hour'];
let urlBusy = false, lastNav = '', hourSync = 0;
const navNow = () => `${view.kind === 'city' ? view.id : ''}|${selected?.person ?? ''}|${selected?.dojo ? 1 : ''}|${selected?.hq ?? ''}`;
function syncUrl() {
  if (urlBusy || !data || params.has('tour')) return;
  const u = new URL(location.href), q = u.searchParams;
  for (const k of NAV_KEYS) q.delete(k);
  if (view.kind === 'city') { q.set('city', view.id); if (selected?.dojo) q.set('dojo', '1'); else if (selected?.person) q.set('person', selected.person); }
  else if (selected?.hq) q.set('hq', selected.hq);
  if (mapMode) q.set('map', mapMode);
  if (!hourAuto) q.set('hour', String(Math.round(hour * 4) / 4));
  const href = u.pathname + u.search.replace(/=(?=&|$)/g, '') + u.hash, nav = navNow(); // "?demo", not "?demo="
  if (href !== location.pathname + location.search + location.hash) { try { history[nav !== lastNav ? 'pushState' : 'replaceState'](null, '', href); } catch { /* a browser that limits history calls: the address just stays behind */ } }
  lastNav = nav;
}
const syncUrlSoon = () => { clearTimeout(hourSync); hourSync = setTimeout(syncUrl, 400); }; // the hour slider fires on every step
addEventListener('popstate', () => {
  if (!data) return;
  const p = new URLSearchParams(location.search), c = findCity(data, p.get('city')), hq = p.get('hq'), h = p.get('hour');
  urlBusy = true;
  try {
    closeModals();
    const m = MAPKEYS[p.get('map')] ? p.get('map') : null;
    if (m !== mapMode) setMapMode(m);
    if (!c && hq && hqHits.has(hq)) selectHq(hq);
    else if (c) { const person = p.get('person'); setView({ kind: 'city', id: c.id }, p.has('dojo') ? { dojo: true } : c.buildings.some((b) => b.id === person) ? person : null); }
    else { selected = null; setView({ kind: 'region', id: null }); }
    if (h !== null && h !== '' && Number.isFinite(Number(h))) { hourAuto = false; applyHour(Number(h)); }
    else if (!hourAuto) { hourAuto = true; applyHour(zoneHour(undefined, { real: true })); }
  } finally { urlBusy = false; lastNav = navNow(); }
});
// the touched building goes to the middle of the screen (the card on the left, City Hall on the
// right), keeping the angle; from very far the camera comes a bit closer
function select(cityId, personId) {
  if (roofBack) { roofBack = null; delete document.documentElement.dataset.roof; } // another building (or none): the roof is left behind
  selected = personId ? { city: cityId, person: personId } : null;
  renderPanels(data, view, selected); frameForDrawers();
  const h = personId && hitByKey.get(keyOf(cityId, personId));
  if (h) { const v = currentView(); flyTo({ target: new THREE.Vector3(h.x, Math.min(h.h * 0.45, 40), h.z), phi: v.phi, dist: clamp(v.dist, 80, 240) }, 900); }
  syncUrl();
}
function celebrate(cityId, n = 3) {
  const c = cityOf(cityId), h = c?.buildings[0] && hitByKey.get(keyOf(c.id, c.buildings[0].id));
  if (h && ANIM) for (let i = 0; i < n; i++) fx.spawn('firework', { x: h.x, y: h.h, z: h.z }, { hue: i * 2, delay: i * 380, dur: 2600 });
}

// the TV tour: the region, then each city, with the camera turning slowly
let tourIdx = -1, tourTimer = null;
// The tour's caption says what is on screen (the stop and its numbers), big enough for a TV across the
// room. Touching the screen (mouse, key, wheel) holds the tour for a minute.
let tourHold = 0, atDistrict = false;
function tourCaption() {
  const el = $('#tour-cap'); if (!el || !data) return;
  let title, sub;
  if (view.kind === 'city') {
    const c = cityOf(view.id), top = c.buildings[0];
    title = cityLabel(c);
    sub = t('tour.citySub', { tier: cityTier(tierOf(c.floors).key).name, buildings: plural(c.people, 'count.building'), week: fmt.int(c.week), top: top ? displayName(top).full : '—', floors: top ? floorsText(top.floors) : '' });
  } else if (atDistrict && world?.mega) {
    title = t('tour.district'); sub = t('tour.districtSub', { members: `${fmt.int(world.mega.members.length)} Mega Builders` });
  } else {
    const lead = [...data.cities].sort((a, b) => b.week - a.week)[0];
    title = t('tour.region');
    sub = t('tour.regionSub', { cities: plural(data.cities.length, 'count.city'), buildings: plural(data.cities.reduce((a, c) => a + c.people, 0), 'count.building'), leader: lead ? cityLabel(lead) : '—', n: lead ? fmt.int(lead.week) : '0' });
  }
  el.hidden = false; el.firstElementChild.textContent = title; el.lastElementChild.textContent = sub;
}
for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, () => { if (tourTimer) tourHold = Date.now() + 60_000; }, { passive: true });
function tourStep() {
  if (tl || Date.now() < tourHold) return;
  const ids = data.cities.map((c) => c.id), stops = ids.length + 1 + (world?.district ? 1 : 0); // the region, each city and the Corporate District
  tourIdx = (tourIdx + 1) % stops;
  if (tourIdx === 0) setView({ kind: 'region', id: null });
  else if (tourIdx > ids.length) goDistrict();
  else setView({ kind: 'city', id: ids[tourIdx - 1] });
}

// ───────── highlight: the building under the mouse (white) and the chosen one (gold, with a beam and a ring) ─────────
// To find the right building in the city: the outline follows the whole lot, from the ground to the
// roof; the chosen one's pulses and has a beam of light rising from the roof, visible from afar.
// A wide lot (a campus, a foundation, a temple, a stadium) gets only the outline and, when chosen, a
// golden frame on the ground: a filled box that size would hide what it marks.
function makeHighlight(hex, op, edge = hex) { // white edge on the chosen one: gold vanishes on art deco buildings
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.95 })));
  g.visible = false; scene.add(g); return g;
}
const hoverHi = makeHighlight('#ffffff', 0.18), selHi = makeHighlight('#f2b705', 0.2, '#ffffff');
const WIDE = L * 1.2; // from here on, outline only
const selFrame = new THREE.Mesh(new THREE.RingGeometry(0.655, Math.SQRT1_2, 4, 1).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b705', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
const selBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 70, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
const selRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b705', transparent: true, opacity: 0.8, depthWrite: false }));
selBeam.visible = selRing.visible = selFrame.visible = false; scene.add(selBeam, selRing, selFrame);
const placeHi = (g, h) => { const w = (h.w ?? L) * 1.02; g.position.set(h.x, 0, h.z); g.scale.set(w, (h.top ?? h.h) + 1, w); g.children[0].visible = w < WIDE; g.visible = true; return w; };
const selectedHit = () => (selected?.hq ? hqHits.get(selected.hq) : selected?.dojo ? dojoHits.get(selected.city) : selected && hitByKey.get(keyOf(selected.city, selected.person)));
const isSelectedHit = (h) => !!selected && (selected.hq ? (h.hq ?? h.found)?.id === selected.hq
  : !!h.c && h.c.id === selected.city && (h.dojo ? !!selected.dojo : h.mon ? false : !selected.dojo && h.b?.id === selected.person));
function stepHighlights(now) {
  const hh = !tl && hovered && hoveredHit;
  if (hh && !isSelectedHit(hoveredHit)) placeHi(hoverHi, hoveredHit); else hoverHi.visible = false;
  const s = !tl && selectedHit();
  if (!s) { selHi.visible = selBeam.visible = selRing.visible = selFrame.visible = false; return; }
  const pulse = 0.5 + 0.5 * Math.sin(now / 320);
  const w = placeHi(selHi, s); selHi.children[0].material.opacity = 0.1 + 0.14 * pulse;
  selFrame.visible = w >= WIDE;
  if (selFrame.visible) { selFrame.position.set(s.x, 0.62, s.z); selFrame.scale.set(w, 1, w); selFrame.material.opacity = 0.5 + 0.4 * pulse; }
  selBeam.position.set(s.x, (s.top ?? s.h) + 35, s.z); selBeam.material.opacity = 0.22 + 0.14 * pulse; selBeam.visible = true;
  const r = Math.max(7, w * 0.72) + 5 * ((now % 1400) / 1400); // the ring starts around the lot, however wide
  selRing.position.set(s.x, 0.5, s.z); selRing.scale.set(r, 1, r); selRing.material.opacity = 0.9 * (1 - (now % 1400) / 1400); selRing.visible = true;
}

// ───────── a Mega Builder's links: golden lines along the streets from each building to the campus ─────────
// While the person is chosen (on the campus or foundation, or on one of their buildings); a light runs
// along them from the buildings to the district (standing still with reduced motion).
const linkMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `attribute float aS; attribute vec3 aOff; varying float vS;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      wp.xyz += aOff * clamp(distance(wp.xyz, cameraPosition) * 0.003, 0.6, 6.0); // as wide as a few pixels
      vS = aS; gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: 'uniform float uT; varying float vS; void main() { float k = fract((vS - uT) / 30.0); float p = smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.1, 0.5, k)); gl_FragColor = vec4(mix(vec3(0.95, 0.72, 0.02), vec3(1.0, 0.95, 0.65), p), 0.5 + 0.5 * p); }',
});
let linkMesh = null, linkKey = '';
// Flat ribbons, one per straight stretch: the vertices sit on the line and aOff pushes them across
// (and past the ends, so the corners close) by the width the shader picks; aS: the way from the building.
function linkGeo(list) {
  const pos = [], off = [], ss = [], Y = 0.55, at = (k) => [Math.floor(k / 10000), k % 10000];
  const elbow = (p, q) => (p[0] !== q[0] && p[1] !== q[1] ? [[p[0], q[1]]] : []); // a right angle between a lot and its road
  for (const { from, to, path } of list) {
    const tiles = path.map(at), first = tiles[0], last = tiles[tiles.length - 1];
    const pts = [from, ...elbow(from, first), ...tiles, ...elbow(last, to), to].map(([x, y]) => [wx(x), wz(y)]);
    const cs = pts.filter((p, i) => i === 0 || i === pts.length - 1 || (p[0] - pts[i - 1][0]) * (pts[i + 1][1] - p[1]) !== (p[1] - pts[i - 1][1]) * (pts[i + 1][0] - p[0]));
    let s0 = 0;
    for (let i = 1; i < cs.length; i++) {
      const [x0, z0] = cs[i - 1], [x1, z1] = cs[i], len = Math.hypot(x1 - x0, z1 - z0);
      if (!len) continue;
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const q = [[x0, z0, -ux - uz, -uz + ux, s0], [x0, z0, -ux + uz, -uz - ux, s0], [x1, z1, ux - uz, uz + ux, s0 + len], [x1, z1, ux + uz, uz - ux, s0 + len]];
      for (const j of [0, 1, 2, 2, 1, 3]) { pos.push(q[j][0], Y, q[j][1]); off.push(q[j][2], 0, q[j][3]); ss.push(q[j][4]); }
      s0 += len;
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1));
  return g;
}
function stepLinks(now) {
  const id = tl || !world ? null : selected?.hq ?? (selected?.person && !selected.dojo && hqHits.has(selected.person) ? selected.person : null);
  const key = id ? `${id}|${dataSig}` : '';
  if (key !== linkKey) {
    linkKey = key;
    if (linkMesh) { scene.remove(linkMesh); linkMesh.geometry.dispose(); linkMesh = null; }
    const g = key && linkGeo(megaLinks(world, id));
    if (g) { linkMesh = new THREE.Mesh(g, linkMat); linkMesh.renderOrder = 2; linkMesh.frustumCulled = false; scene.add(linkMesh); }
  }
  if (linkMesh) linkMat.uniforms.uT.value = ANIM ? now * 0.02 : 0;
}

// ───────── mouse: the building under the cursor and the click ─────────
const ray = new THREE.Raycaster(); ray.layers.set(1);
const ptr = new THREE.Vector2(-2, -2);
const tipEl = document.createElement('div'); tipEl.className = 'hovertip off';
const tip = new CSS2DObject(tipEl); scene.add(tip);
let hovered = null, hoveredHit = null, downAt = null;
renderer.domElement.addEventListener('pointermove', (e) => ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
renderer.domElement.addEventListener('pointerleave', () => ptr.set(-2, -2));
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  downAt = null;
  if (tl) return;
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const hit = pick();
  closePopovers();
  if (!hit) { if (selected) select(null); return; }
  if (hit.hq || hit.found) return selectHq((hit.hq ?? hit.found).id);
  if (hit.dojo) { if (view.kind === 'city' && hit.c.id === view.id) selectDojo(hit.c.id); else goCity(hit.c.id, { dojo: true }); return; }
  if (hit.mon) { // the rally opens the mayor's building; the other monuments only take you to their city
    const person = hit.mon.key === 'mayor' ? hit.mon.person.id : null;
    if (view.kind === 'city' && hit.c.id === view.id) { if (person) select(hit.c.id, person); } else goCity(hit.c.id, person);
    return;
  }
  if (view.kind === 'city' && hit.c.id === view.id) select(hit.c.id, hit.b.id); else goCity(hit.c.id, hit.b.id);
});
function pick() { ray.setFromCamera(ptr, camera); return ray.intersectObjects(hitGroup.children, false)[0]?.object.userData ?? null; }
function pickHover() {
  const h = ptr.x < -1 || tl ? null : pick(), b = h ? h.b ?? h.dojo ?? h.mon ?? h.hq ?? h.found : null;
  renderer.domElement.style.cursor = b ? 'pointer' : '';
  if (b === hovered) return;
  hovered = b; hoveredHit = h;
  if (!b) { tipEl.classList.add('off'); return; }
  if (h.dojo) tipEl.innerHTML = `🥋 ${esc(t(`dojoLevel.${h.dojo.levelKey}`).name)}${view.kind === 'region' ? ` · ${esc(cityLabel(h.c))}` : ''}<small>${plural(h.dojo.count, 'tip.dojo')}</small>`;
  else if (h.hq) { // the Corporate District: a Mega Builder's headquarters (the floors added up) or the next one's foundation
    const p = h.hq, ruin = ruinOf(p);
    tipEl.innerHTML = `💎 ${esc(displayName(p).full)}<small>${ruin ? `${t(`ruin.${ruin}`, { days: plural(p.idle, 'count.day') })} · ` : ''}${esc(t('mega.tipHq', { floors: floorsText(p.floors), cities: plural(p.cities, 'count.city') }))}</small>`;
  } else if (h.found) tipEl.innerHTML = `🚧 ${esc(displayName(h.found).full)}<small>${esc(t('mega.tipFound', { floors: fmt.int(Math.floor(h.found.floors)), line: fmt.int(world.mega.line) }))}</small>`;
  else if (h.mon) { // a monument: its name and what earns it (the rally: the mayor and last month's floors)
    const where = view.kind === 'region' ? `${esc(cityLabel(h.c))} · ` : '', m = h.mon;
    tipEl.innerHTML = m.key === 'mayor'
      ? `🎩 ${esc(displayName(m.person).full)}<small>${where}${esc(t('rally.tip', { month: monthOf(m.month, 'period.thisMonth'), floors: floorsText(m.person.lastMonth), lastMonth: monthOf(m.lastMonth, 'period.lastMonth') }))}</small>`
      : `${m.icon} ${esc(t(`monument.${m.key}`).name)}<small>${where}${esc(t(`monument.${m.key}`).req)}</small>`;
  } else {
    const tr = tierOf(b.floors, BUILDING_TIERS), ruin = ruinOf(b);
    tipEl.innerHTML = `${esc(displayName(b).full)}<small>${ruin ? `${t(`ruin.${ruin}`, { days: plural(b.idle, 'count.day') })} · ` : ''}${view.kind === 'region' ? `${esc(cityLabel(h.c))} · ` : ''}${b.belt ? `🥋 ${t(`belt.${b.belt}`).lower} · ` : ''}${tr.icon} ${buildingTier(tr.key).name} · ${floorsText(b.floors)}${b.week > 0 ? ` · <span class="up">${t('tip.week', { n: fmt.int(b.week) })}</span>` : ''}</small>`;
  }
  tipEl.classList.remove('off');
  tip.position.set(h.x, h.h + 2, h.z);
}
// "+N floors" floating over the building that grew
// (the animated labels sit in a wrapper: the CSS2DRenderer places the wrapper with its transform,
// and the child's animation does not fight it)
const wrapped = (cls, text) => { const w = document.createElement('div'); const el = document.createElement('div'); el.className = cls; el.textContent = text; w.append(el); return w; };
function spawnFloat(key, text, gold = false) {
  const h = hitByKey.get(key); if (!h) return;
  const el = wrapped(`float${gold ? ' gold' : ''}`, text);
  const o = new CSS2DObject(el); o.position.set(h.x, h.h + 3, h.z); scene.add(o);
  setTimeout(() => { scene.remove(o); el.remove(); }, 2700);
}
const atKey = (key) => { const h = hitByKey.get(key); return h ? { x: h.x, y: h.h, z: h.z } : null; };
// names on the facades, only up close: the buildings nearest to the camera's target
const nameLabels = [];
let namesAt = 0;
function updateNames(now, dist) {
  if (now - namesAt < 400) return;
  namesAt = now;
  const show = dist < 240 && !tl ? [...hitByKey.values()].map((h) => ({ h, d: Math.hypot(h.x - controls.target.x, h.z - controls.target.z) })).filter((x) => x.d < 70).sort((a, b) => a.d - b.d).slice(0, 24) : [];
  while (nameLabels.length < show.length) { const el = document.createElement('div'); el.className = 'bname'; const o = new CSS2DObject(el); scene.add(o); nameLabels.push(o); }
  nameLabels.forEach((o, i) => {
    const x = show[i];
    o.visible = !!x;
    if (x) { o.element.textContent = displayName(x.h.b).short; o.position.set(x.h.x, x.h.h + 1.2, x.h.z); }
  });
}
// the "YOU" pin bouncing over each of the person's buildings
let mePins = [];
function paintMe() {
  for (const p of mePins) { scene.remove(p); p.element.remove(); }
  mePins = [];
  $('#me-btn').hidden = !me || !data?.cities.some((c) => c.buildings.some((x) => x.id === me));
  if (!me) return;
  const mine = [...[...hitByKey.values()].filter((h) => h.b.id === me), ...[...hqHits.values()].filter((h) => (h.hq ?? h.found).id === me)]; // and the headquarters (or foundation) in the district
  for (const h of mine) { const o = new CSS2DObject(wrapped('mepin', t('me.pin'))); o.position.set(h.x, h.h + 2, h.z); scene.add(o); mePins.push(o); }
}
// The view from the roof: the camera stands on the building's roof looking at the middle of the city
// (the owner of a house looks up at the giants). A second press, or Esc, goes back to where it was.
let roofBack = null;
function roofView(cityId, personId) {
  if (roofBack) return leaveRoof();
  const c = cityOf(cityId), h = hitByKey.get(keyOf(cityId, personId));
  if (!c || !h) return;
  const mid = fitCity(c).target, dir = new THREE.Vector3(mid.x - h.x, 0, mid.z - h.z);
  if (dir.lengthSq() < 4) dir.set(0, 0, 1); // the building in the very middle: any way
  dir.normalize();
  // the most open way: of 16 directions, the one with the farthest taller neighbor in front (toward the
  // middle of the city when it is a tie), so the view is the city and not the wall next door
  const taller = [...hitByKey.values()].filter((o) => o !== h && o.c.id === cityId && o.h > h.h + 1);
  let best = dir.clone(), bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    let clear = 400;
    for (const o of taller) { const rx = o.x - h.x, rz = o.z - h.z, along = rx * d.x + rz * d.z; if (along > 0 && Math.abs(rx * d.z - rz * d.x) < L * 0.9) clear = Math.min(clear, along); }
    const score = Math.min(clear, 160) + 25 * d.dot(dir);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  dir.copy(best);
  roofBack = { position: camera.position.clone(), target: controls.target.clone() };
  controls.autoRotate = false; $('#spin').setAttribute('aria-pressed', 'false');
  const eye = new THREE.Vector3(h.x, h.h + 2.2, h.z).addScaledVector(dir, -1.5), look = eye.clone().addScaledVector(dir, 42); look.y = Math.max(1, eye.y - 5);
  camTween = { fromT: controls.target.clone(), toT: look, fromP: camera.position.clone(), toP: eye, t0: performance.now(), ms: 1400 };
  document.documentElement.dataset.roof = '';
  camera.clearViewOffset(); $('#hall').classList.remove('open'); // the whole screen is the view (on a phone the drawers hide)
}
function leaveRoof() {
  if (!roofBack) return;
  camTween = { fromT: controls.target.clone(), toT: roofBack.target, fromP: camera.position.clone(), toP: roofBack.position, t0: performance.now(), ms: 1100 };
  roofBack = null; delete document.documentElement.dataset.roof;
  frameForDrawers();
}
// The cards: a frame of the scene as it is now (the subject in the middle of the screen) plus the
// person's numbers, as a PNG to download or, where the browser can, to copy. The building's card,
// the campus's (every city added up), both square, and the token medal alone share the same window.
let cardBlob = null, cardUrl = null;
const fileSlug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'card';
const brandName = () => config.appName ?? 'Tokenopolis';
// the frame: the camera steps to `at` for the picture and returns; drawn and read in the same turn,
// before the browser clears the drawing buffer
function snapshot(at) {
  const keepP = camera.position.clone(), keepT = controls.target.clone(), keepTween = camTween;
  const marks = [hoverHi, selHi, selFrame, selBeam, selRing], shown = marks.map((o) => o.visible); // the photo without the selection's box and beam
  for (const o of marks) o.visible = false;
  camera.clearViewOffset(); camera.updateProjectionMatrix();
  if (at) flyTo(at, 0);
  if (useBloom) composer.render(); else renderer.render(scene, camera);
  marks.forEach((o, i) => { o.visible = shown[i]; });
  camera.position.copy(keepP); controls.target.copy(keepT); controls.update(); camTween = keepTween;
  return renderer.domElement;
}
// plain: a second picture to download (the medal without the name), with its file name; note: a line
// under the buttons
let plainUrl = null;
const blobOf = (cv) => new Promise((ok) => cv.toBlob(ok, 'image/png'));
async function showCard(cv, { alt, file, plain = null, plainFile = '', note = '' }) {
  frameForDrawers();
  const [blob, blob2] = await Promise.all([blobOf(cv), plain && blobOf(plain)]);
  if (!blob) return;
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  if (plainUrl) URL.revokeObjectURL(plainUrl);
  cardBlob = blob; cardUrl = URL.createObjectURL(blob); plainUrl = blob2 ? URL.createObjectURL(blob2) : null;
  const img = $('#card-img'); img.src = cardUrl; img.alt = alt;
  const dl = $('#card-dl'); dl.href = cardUrl; dl.download = `${fileSlug(brandName())}-${file}.png`;
  const dl2 = $('#card-dl2'); dl2.hidden = !plainUrl;
  if (plainUrl) { dl2.href = plainUrl; dl2.download = `${fileSlug(brandName())}-${plainFile}.png`; }
  $('#card-note').hidden = !note; $('#card-note').textContent = note;
  $('#card-copy').hidden = !canCopyImages(); // plain http has no clipboard for images: the download stays
  openModal('cardbox');
}
// The person's token medal (rules.js TOKEN_MARKS) for drawMedal, or null below the first mark
function medalFor(total) {
  const m = markOf(total ?? 0);
  if (!m) return null;
  const bi = m.floors >= 1000, n = bi ? m.floors / 1000 : m.floors;
  return { step: m.i, floors: m.floors, value: fmt.int(n), unit: t(bi ? 'medal.unitBi' : 'medal.unitMi'), ribbon: plural(n, bi ? 'medal.ribbonBi' : 'medal.ribbonMi'), brand: brandName() };
}
// the day the mark was reached (ISO), from the record; null when the record does not come
async function medalSince(id, floors) { try { await loadHistory(); return reachedOn(id, floors); } catch { return null; } }
const medalChip = (medal, since) => `🏅 ${since ? t('medal.chipSince', { mark: markText(medal.floors), date: fmt.dayMonth(since) }) : markText(medal.floors)}`;
async function openCard(cityId, personId) {
  const c = cityOf(cityId), b = c?.buildings.find((x) => x.id === personId);
  if (!b) return;
  const medal = medalFor(b.total), since = medal && (await medalSince(b.id, medal.floors));
  // the camera steps back to frame the whole building for the picture
  const hit = hitByKey.get(keyOf(cityId, personId));
  const shot = snapshot(hit && { target: new THREE.Vector3(hit.x, hit.h * 0.52, hit.z), phi: 0.3, dist: clamp(hit.h * 2.3, 90, 1100) });
  const tr = tierOf(b.floors, BUILDING_TIERS), chips = [`${tr.icon} ${buildingTier(tr.key).name}`];
  if (medal) chips.push(medalChip(medal, since));
  if (b.mega) chips.push('💎 Mega Builder');
  if (b.belt) chips.push(`🥋 ${t(`belt.${b.belt}`).name}`);
  if (b.streak >= 2) chips.push(`📅 ${plural(b.streak, 'sheet.badge.streak')}`);
  const cv = drawCard({
    shot, title: displayName(b).full, sub: t('card.sub', { c, rank: fmt.ordinal(c.buildings.indexOf(b) + 1) }),
    stats: [{ value: fmt.int(b.floors), label: t('card.floors') }, { value: `+${fmt.int(b.week)}`, label: t('card.week'), up: true }, { value: `+${fmt.int(b.today)}`, label: t('card.today') }],
    chips, brand: `🏙️ ${brandName()}`, date: fmt.date(data.generatedAt, 'long'), medal,
  });
  showCard(cv, { alt: displayName(b).full, file: fileSlug(displayName(b).full) });
}
// The campus's card (the Mega Builder's corporate profile): the campus in the Corporate
// District, every city added up, the week, the month and each city with its floors.
async function openHqCard(id) {
  const h = hqHits.get(id), p = world?.mega.members.find((x) => x.id === id);
  if (!h || !p) return;
  const medal = medalFor(p.floors), since = medal && (await medalSince(p.id, medal.floors));
  const shot = snapshot({ target: new THREE.Vector3(h.x, h.h * 0.42, h.z), phi: 0.36, dist: clamp(h.h * 2.4, 55, 800) });
  const rank = world.mega.members.indexOf(p) + 1, who = displayName(p).full, chips = [];
  if (medal) chips.push(medalChip(medal, since));
  if (p.belt) chips.push(`🥋 ${t(`belt.${p.belt}`).name}`);
  for (const { b, c } of p.parts) chips.push(`🏙️ ${cityLabel(c)} · ${fmt.int(b.floors)}`);
  const cv = drawCard({
    shot, title: who, sub: t('hqCard.sub', { rank: fmt.ordinal(rank), cities: plural(p.parts.length, 'count.city') }),
    stats: [
      { value: p.floors >= 1000 ? t('medal.bi', { n: fmt.dec(p.floors / 1000, 2, 2) }) : t('medal.mi', { n: fmt.int(p.floors) }), label: t('hqCard.total') },
      { value: `+${fmt.int(p.week)}`, label: t('hqCard.week'), up: true },
      { value: `+${fmt.int(p.month)}`, label: t('hqCard.month') },
    ],
    chips, brand: `💎 ${brandName()} · ${t('mega.district')}`, date: fmt.date(data.generatedAt, 'long'), medal,
  });
  showCard(cv, { alt: who, file: `${fileSlug(who)}-campus` });
}
// The medal alone, to download and print (a sticker, a pin, a badge): MEDAL_PX on a transparent
// background, with the name and the day it was reached, or without the name (the mark's medal).
async function openMedal(id) {
  const parts = data.cities.flatMap((c) => c.buildings.filter((b) => b.id === id)).sort((a, b) => b.floors - a.floors), b = parts[0];
  const medal = b && medalFor(b.total);
  if (!medal) return;
  const since = await medalSince(id, medal.floors), who = displayName(b).full, mark = fileSlug(markText(medal.floors));
  const cv = drawMedalSheet(medal, { name: who, since: since ? t('medal.reached', { date: fmt.isoDate(since) }) : '' });
  showCard(cv, {
    alt: t('medal.alt', { name: who, mark: markText(medal.floors) }), file: `${fileSlug(who)}-${mark}`,
    plain: drawMedalSheet(medal), plainFile: `${fileSlug(t('medal.file'))}-${mark}`, note: t('medal.print', { px: fmt.int(MEDAL_PX), cm: fmt.int(MEDAL_PX / 300 * 2.54) }),
  });
}
async function copyCard() {
  if (!cardBlob) return;
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })]); queueToast({ icon: '📸', title: t('card.copied.title'), text: t('card.copied.text'), ms: 3500, quiet: true }); }
  catch { queueToast({ icon: '📸', title: t('card.failed.title'), text: t('card.failed.text'), ms: 5000, quiet: true }); }
}
// First visit: an invitation to find one's own building. Without it nothing personal works (the pin,
// the 📍 button, the greeting, the notice that the building grew), and nothing else suggests it. Shown
// once (city.welcomed), never on a TV link (tour, spin, no panels) or when a link opens on a building.
const seenWelcome = () => { try { return !!localStorage.getItem('city.welcomed'); } catch { return true; } };
function closeWelcome(find) {
  $('#welcome').hidden = true;
  try { localStorage.setItem('city.welcomed', '1'); } catch {}
  if (find) { document.documentElement.dataset.invite = ''; openTool('find'); } // the "this is my building" button pulses until one is marked
}
function offerWelcome() {
  if (me || seenWelcome() || params.has('tour') || params.has('spin') || params.get('panels') === '0' || params.has('person') || params.has('hq')) return;
  setTimeout(() => { if (!me && !selected && !anyModal() && !tl) $('#welcome').hidden = false; }, 2500);
}
function setMe(id) {
  me = me === id ? null : id;
  if (me) { delete document.documentElement.dataset.invite; $('#welcome').hidden = true; try { localStorage.setItem('city.welcomed', '1'); } catch {} }
  try { if (me) localStorage.setItem('city.me', me); else localStorage.removeItem('city.me'); } catch {}
  panelsSetMe(me); paintMe(); renderPanels(data, view, selected);
  if (me) queueToast({ icon: '📍', title: t('toast.mine.title'), text: t('toast.mine.text'), ms: 6000, quiet: true });
}

// ───────── panels, popovers, dialogs and keyboard ─────────
function applyPanels() {
  document.documentElement.dataset.hidden = [...hiddenPanels].join(' ');
  for (const b of document.querySelectorAll('#panels [data-panel]')) b.setAttribute('aria-checked', String(!hiddenPanels.has(b.dataset.panel)));
  $('#panels-btn').classList.toggle('lit', hiddenPanels.size > 0);
}
function setPanels(list, show) { for (const p of list) if (show) hiddenPanels.delete(p); else hiddenPanels.add(p); try { localStorage.setItem('city.hiddenPanels', JSON.stringify([...hiddenPanels])); } catch {} applyPanels(); }
function toggleAllPanels() { const show = PANELS.every((p) => hiddenPanels.has(p)); setPanels(PANELS, show); if (!show) queueToast({ icon: '👁️', title: t('toast.panelsHidden.title'), text: t('toast.panelsHidden.text'), ms: 3500, quiet: true }); }
// Signs that would sit on top of one another: the city's sign nearest the camera stays, and the ones it
// would cover (other signs, then the "in common" pills, then the mayors' tags) fade until there is room.
let clutterAt = 0;
function declutter() {
  const rank = (e) => (e.classList.contains('sign') ? 0 : e.classList.contains('route') ? 1 : 2);
  const boxes = [...labels.domElement.querySelectorAll('.sign, .route, .rally')].filter((e) => e.offsetParent !== null)
    .map((e) => ({ e, r: e.getBoundingClientRect(), k: rank(e) })).filter((b) => b.r.width > 0).sort((a, b) => a.k - b.k || b.r.bottom - a.r.bottom);
  const kept = [];
  for (const b of boxes) {
    const hit = kept.some((r) => b.r.left < r.right - 4 && b.r.right > r.left + 4 && b.r.top < r.bottom - 3 && b.r.bottom > r.top + 3);
    b.e.classList.toggle('clash', hit);
    if (!hit) kept.push(b.r);
  }
}
// The text size of the panels and signs (A, A+, A++ in the 👁️ list), kept between visits.
let textZoom = 1;
function setTextZoom(v, save = true) {
  textZoom = [1, 1.15, 1.3].includes(Number(v)) ? Number(v) : 1;
  document.documentElement.style.setProperty('--ui-zoom', textZoom);
  for (const b of document.querySelectorAll('[data-text]')) b.setAttribute('aria-pressed', String(Number(b.dataset.text) === textZoom));
  if (save) { try { localStorage.setItem('city.textSize', String(textZoom)); } catch {} }
}
try { setTextZoom(localStorage.getItem('city.textSize') ?? 1, false); } catch { setTextZoom(1, false); }
// A dialog takes the focus when it opens, keeps Tab inside it and gives the focus back when it closes.
let modalBack = null;
function trapFocus(e) {
  const d = [...document.querySelectorAll('.modal')].find((m) => !m.hidden)?.querySelector('[role="dialog"]');
  if (!d) return;
  const f = [...d.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const inside = d.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === f[0])) { e.preventDefault(); f.at(-1).focus(); }
  else if (!e.shiftKey && (!inside || document.activeElement === f.at(-1))) { e.preventDefault(); f[0].focus(); }
}
function closePopovers() { document.querySelectorAll('.popover').forEach((el) => (el.hidden = true)); document.querySelectorAll('.tools .on').forEach((b) => b.classList.remove('on')); }
function closeModals() {
  const was = anyModal();
  closePopovers(); document.querySelectorAll('.modal').forEach((el) => (el.hidden = true));
  if (was) { if (modalBack?.isConnected) modalBack.focus({ preventScroll: true }); modalBack = null; }
}
const anyModal = () => [...document.querySelectorAll('.modal')].some((el) => !el.hidden);
function openModal(id) {
  const back = anyModal() ? modalBack : document.activeElement;
  closeModals(); modalBack = back;
  const m = $(`#${id}`), d = m.querySelector('[role="dialog"]');
  m.hidden = false;
  if (d) { d.setAttribute('aria-modal', 'true'); d.tabIndex = -1; (d.querySelector('input, .close, button, a[href]') ?? d).focus({ preventScroll: true }); }
}
// the overall ranking; focus: a person to show in it (from the details card)
function openLeague(focus = null) { closeModals(); openModal('league'); renderLeague(focus); }
function openTool(name, btn) {
  setMenu(false);
  if (name === 'me') { const hit = me && locatePerson(me); if (hit) goPerson(hit.c.id, hit.b.id); return; }
  if (name === 'find') { openModal('finder'); $('#finder-q').value = ''; renderFinder(); $('#finder-q').focus(); return; }
  if (name === 'paper') { renderPaper(dayF < 0.5); openModal('newspaper'); return; }
  if (name === 'league') { openLeague(); return; }
  if (name === 'help') { openModal('help'); links.showTab('read'); return; }
  const pop = $({ panels: '#panels', sky: '#sky', maps: '#maps', history: '#films', bell: '#bell' }[name]), was = pop && !pop.hidden;
  closeModals();
  if (!pop || was) return;
  pop.hidden = false; btn?.classList.add('on');
  if (name === 'bell') { renderBell(null); loadHistory().then(() => { if (!pop.hidden) renderBell(weekDiary(data)); }, () => { if (!pop.hidden) renderBell([]); }); } // the diary comes with the record
}
function setMapMode(m) {
  if (tl) stopFilm();
  mapMode = MAPKEYS[m] ? m : null;
  if (mapMode) document.documentElement.dataset.map = mapMode; else delete document.documentElement.dataset.map;
  renderMapKey(mapMode);
  closeModals();
  if (data) { buildScene(); updateRing(); }
  syncUrl();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-menu], [data-hide-panel], [data-panel], [data-panels], [data-tool], [data-back], [data-close], [data-close-modal], [data-share], [data-me], [data-building], [data-dojo], [data-hq], [data-district], [data-city], [data-dir], [data-map-mode], [data-film], [data-race], [data-tl-stop], #spin, #refit, [data-hour], [data-welcome], [data-card], [data-hq-card], [data-medal], [data-league], [data-card-copy], [data-text], [data-roof], [data-roof-exit], .sign');
  if (el?.hasAttribute('data-menu')) return setMenu(!('menu' in document.documentElement.dataset));
  if (!e.target.closest('#menu')) setMenu(false);
  if (!el) { if (e.target.classList.contains('modal')) closeModals(); else if (!e.target.closest('.popover')) closePopovers(); return; }
  if (el.dataset.welcome) return closeWelcome(el.dataset.welcome === 'find');
  if (el.dataset.card) return openCard(...el.dataset.card.split('|'));
  if (el.dataset.hqCard) return openHqCard(el.dataset.hqCard);
  if (el.dataset.medal) return openMedal(el.dataset.medal);
  if (el.dataset.league) return openLeague(el.dataset.league);
  if (el.dataset.text) return setTextZoom(el.dataset.text);
  if (el.hasAttribute('data-roof-exit')) return leaveRoof();
  if (el.dataset.roof) return roofView(...el.dataset.roof.split('|'));
  if (el.hasAttribute('data-card-copy')) return copyCard();
  if (el.dataset.dojo) { const id = el.dataset.dojo; if (view.kind === 'city' && view.id === id) selectDojo(id); else goCity(id, { dojo: true }); return; }
  if (el.dataset.hq) return selectHq(el.dataset.hq);
  if (el.dataset.district) return goDistrict();
  if (el.dataset.hidePanel) return setPanels([el.dataset.hidePanel], false);
  if (el.dataset.panel) return setPanels([el.dataset.panel], hiddenPanels.has(el.dataset.panel));
  if (el.dataset.panels) return setPanels(PANELS, el.dataset.panels === 'show');
  if (el.dataset.tool) return openTool(el.dataset.tool, el);
  if (el.hasAttribute('data-back')) return goRegion();
  if (el.hasAttribute('data-close')) return select(null);
  if (el.hasAttribute('data-close-modal')) return closeModals();
  if (el.dataset.share) {
    const [c, p] = el.dataset.share.split('|'), u = new URL(location.href), lang = params.get('lang');
    u.search = `?city=${encodeURIComponent(c)}&person=${encodeURIComponent(p)}${DEMO ? '&demo' : ''}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;
    const url = u.toString();
    // nothing worked (a browser without the copy command): the link in a box, to copy by hand
    copyText(url).then((ok) => (ok ? queueToast({ icon: '🔗', title: t('toast.linkCopied.title'), text: t('toast.linkCopied.text'), ms: 3000, quiet: true }) : window.prompt(t('links.copyFailed.text'), url)));
    return;
  }
  if (el.dataset.me) return setMe(el.dataset.me);
  if (el.dataset.building) return select(view.id, el.dataset.building);
  if (el.dataset.city) return goCity(el.dataset.city, el.dataset.person ?? null);
  if (el.dataset.mapMode) return setMapMode(el.dataset.mapMode);
  if (el.dataset.film) return el.dataset.film === 'timelapse' ? startFilm() : openRaceModal();
  if (el.dataset.race) return playRace();
  if (el.hasAttribute('data-tl-stop')) return stopFilm();
  if (el.dataset.dir) { const v = currentView(); const c = view.kind === 'city' && cityOf(view.id); flyTo({ ...(c ? fitCity(c) : fitRegion()), phi: v.phi, dist: v.dist }, 900, Number(el.dataset.dir) * Math.PI / 2 + 0.55); return; }
  if (el.id === 'spin') { controls.autoRotate = !controls.autoRotate; el.setAttribute('aria-pressed', String(controls.autoRotate)); return; }
  if (el.id === 'refit') return refit();
  if (el.dataset.hour) { if (el.dataset.hour === 'auto') { hourAuto = true; applyHour(zoneHour(undefined, { real: true })); } else { hourAuto = false; applyHour(Number(el.dataset.hour)); } syncUrl(); }
});
$('#hour').addEventListener('input', (e) => { hourAuto = false; applyHour(Number(e.target.value)); syncUrlSoon(); });
$('#finder-q').addEventListener('input', renderFinder);
// on a phone a drawer goes down with a swipe (started at its top, so its own scrolling still works)
for (const [sel, close] of [['#sheet', () => select(null)], ['#hall', () => $('#hall').classList.remove('open')]]) {
  let y0 = null;
  $(sel).addEventListener('touchstart', (e) => { y0 = narrow() && $(sel).scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  $(sel).addEventListener('touchend', (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) close(); y0 = null; }, { passive: true });
}
$('#finder-q').addEventListener('keydown', finderKey);
// easter egg: the monster (Konami code or ?monster)
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
let konami = 0;
function summonMonster() {
  if (!ANIM || !life || life.monster) return;
  life.summon();
  queueToast({ icon: '🦖', title: t('toast.monster.title'), text: t('toast.monster.text'), ms: 6000, quiet: true });
}
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  konami = k === KONAMI[konami] ? konami + 1 : k === KONAMI[0] ? 1 : 0;
  if (konami === KONAMI.length) { konami = 0; summonMonster(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][tabindex]')) { e.preventDefault(); e.target.click(); return; } // a row of a panel, reached with Tab
  if (e.key === 'Tab' && anyModal()) trapFocus(e);
  // the arrows walk a list: from a row of a panel (or a button of a menu) to the next or the previous one,
  // Home and End to its ends
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && e.target.matches?.('[role="button"][tabindex], .popover button, .hall .sorts button')) {
    const box = e.target.closest('ol, ul, .popover, .sorts, #trophies, .rcol, #hall, #sheet') ?? document.body;
    const rows = [...box.querySelectorAll('[role="button"][tabindex], button:not([disabled])')].filter((x) => x.getClientRects().length), i = rows.indexOf(e.target);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, rows.length - 1);
    if (rows[j]) { e.preventDefault(); rows[j].focus(); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) { if (e.key === 'Escape') closeModals(); return; }
  if (e.key === '/') { e.preventDefault(); openTool('find'); return; } // the finder, as in most apps
  if (e.key === 'p' || e.key === 'P') toggleAllPanels();
  else if (e.key === '?') openTool('help');
  else if (e.key === 'Escape') { setMenu(false); if (roofBack && !anyModal()) leaveRoof(); else if (anyModal()) closeModals(); else if (tl) stopFilm(); else { closePopovers(); if (selected) select(null); else if (view.kind === 'city') goRegion(); } }
  else if (e.key === 'g' || e.key === 'G') { controls.autoRotate = !controls.autoRotate; $('#spin').setAttribute('aria-pressed', String(controls.autoRotate)); }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; frameForDrawers(); camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); });
// the folded panels of a narrow screen: this week's builds and the Mega Builders open on their title; City Hall opens on any
// touch and folds again on its top (the buttons and names inside keep working as usual)
const folds = () => innerWidth <= 900 || $('.rcol').classList.contains('fold'); // the panels fold into chips on a phone, a mid-size window and a short one (panels.js fitColumn)
if (innerWidth > 900 && innerWidth <= 1300) $('#ranking').classList.add('open'); // on a laptop the week's builds start open; the Mega Builders start as a chip
// one open at a time: the column is short, and the other one folds back into its chip
$('#ranking h2').addEventListener('click', () => { if (folds() && $('#ranking').classList.toggle('open')) $('#mega').classList.remove('open'); });
$('#mega').addEventListener('click', (e) => { if (folds() && e.target.closest('h2') && $('#mega').classList.toggle('open')) $('#ranking').classList.remove('open'); }); // the Mega Builders too (the panel is drawn again on every reading, its box stays)
$('#hall').addEventListener('click', (e) => {
  if (!narrow() || e.target.closest('button, a, input, [data-building], [data-dojo], [data-city]')) return;
  const hall = $('#hall');
  if (!hall.classList.contains('open') || e.target.closest('.head')) hall.classList.toggle('open');
});

// ───────── history: time-lapse and race ─────────
async function startFilm() {
  if (tl || !data) return;
  closeModals(); select(null);
  let h;
  try { h = await loadHistory(); } catch { return queueToast({ icon: '🎬', title: t('toast.history.timelapse'), text: t('toast.history.failed'), ms: 4000, quiet: true }); }
  if (tl) return;
  if (view.kind !== 'region') { view = { kind: 'region', id: null }; selected = null; updateHeli(); updateRing(); }
  flyTo(fitRegion(), 1200);
  const real = data;
  const film = startTimelapse({
    h, data: real, scene, bldGroup, hitByKey, hOfFloors,
    onDay: (frame, i, dateText, subText) => { data = frame; renderPanels(frame, view, null); $('#tl-bar .tl-date').textContent = dateText; $('#tl-bar .tl-sub').textContent = subText; },
    onTier: (c) => celebrate(c.id, 2),
    onDone: () => { data = real; tl = null; $('#tl-bar').hidden = true; delete document.documentElement.dataset.timelapse; renderPanels(data, view, selected); updateHeli(); updateRing(); },
  });
  tl = { film, frame: null, real };
  $('#tl-bar').hidden = false; document.documentElement.dataset.timelapse = '';
}
function stopFilm() { tl?.film.stop(); }
async function openRaceModal() {
  let h;
  try { h = await loadHistory(); } catch { return queueToast({ icon: '🏁', title: t('toast.history.race'), text: t('toast.history.failed'), ms: 4000, quiet: true }); }
  openModal('race');
  openRace(h, (id) => { const c = cityOf(id); return c ? cityLabel(c) : id.slice(0, 4); });
}

// ───────── frame by frame ─────────
const craneM = new THREE.Matrix4(), craneQ = new THREE.Quaternion(), craneP = new THREE.Vector3(), craneS = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
function stepCranes(a, dt) {
  a.list.forEach((c, i) => {
    c.rot += c.speed * dt;
    craneM.compose(craneP.set(c.x, c.y, c.z), craneQ.setFromAxisAngle(UP, c.rot), craneS);
    for (const im of a.meshes) im.setMatrixAt(i, craneM);
  });
  for (const im of a.meshes) im.instanceMatrix.needsUpdate = true;
}
let last = performance.now(), ambientAt = 0, partyAt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  stepCamera(now);
  controls.update();
  const dist = camera.position.distanceTo(controls.target), R = clamp(dist * 0.95, 140, 1400);
  if (Math.abs(R - shadowR) > shadowR * 0.1) { shadowR = R; Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R }); sun.shadow.camera.updateProjectionMatrix(); }
  sun.target.position.copy(controls.target); sun.position.copy(controls.target).addScaledVector(sunDir, 900);
  document.documentElement.style.setProperty('--signk', (clamp(420 / dist, 0.62, 1) * (1 + (textZoom - 1) * 0.6)).toFixed(2)); // from afar the signs shrink, but stay readable
  if (now - clutterAt > 350) { clutterAt = now; declutter(); }
  watchPace(now);
  const night = 1 - dayF, sec = now / 1000;
  rippleMat.map.offset.set((sec * 0.011) % 1, (sec * 0.007) % 1);
  // everyday life: always moving
  stepCars(dt);
  for (const a of anims) {
    if (a.kind === 'cranes') stepCranes(a, dt);
    else if (a.kind === 'wheel') { a.obj.rotation.z -= a.speed * dt; a.obj.children.forEach((c) => { if (c.userData.cabin) c.rotation.z = -a.obj.rotation.z; }); }
  }
  const blink = ANIM && Math.sin(now / 350) <= 0.2 ? 0.15 : 1; // reduced motion: the lights stay on, steady
  for (const m of blinkMats) m.emissiveIntensity = (m.userData.base ?? 2.5) * Math.max(night, 0.12) * blink;
  clouds.children.forEach((s) => { s.position.x += s.userData.v * dt; if (s.position.x > 1400) s.position.x = -1400; });
  const lf = life?.step(dt, now, night, sec);
  if (lf?.gone) queueToast({ icon: '🦖', title: t('toast.monsterGone.title'), text: t('toast.monsterGone.text'), ms: 5000, quiet: true });
  // the bursts: only when the device does not ask to reduce motion
  if (ANIM) {
    if (lf?.shake) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.6));
    // background life: sparkles on whoever is building now; at night, fireworks over the leading city
    if (data && now >= ambientAt) {
      ambientAt = now + 1800 + Math.random() * 2600;
      const busy = [...hitByKey.values()].filter((h) => h.b.now);
      if (busy.length) { const h = busy[Math.floor(Math.random() * busy.length)]; fx.spawn('sparkle', { x: h.x, y: h.h, z: h.z }, { dur: 1100 }); }
    }
    if (data && night > 0.6 && now >= partyAt) { partyAt = now + 35000 + Math.random() * 25000; const lead = context(data).leader; if (lead) celebrate(lead.id, 2); }
    rockets = rockets.filter((r) => r(now));
  }
  fx.step(now);
  tl?.film.step(now);
  pickHover();
  stepHighlights(now); stepLinks(now);
  updateNames(now, dist);
  if (useBloom) composer.render(); else renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

// ───────── data ─────────
// ?city=: the id, the name (case-insensitive), the code or an id prefix of 4+ characters
function findCity(d, q) {
  q = (q ?? '').trim().toLowerCase();
  if (!q) return null;
  const is = (s) => String(s ?? '').toLowerCase() === q;
  return d.cities.find((c) => is(c.id) || is(c.name) || is(c.code) || (q.length >= 4 && c.id.toLowerCase().startsWith(q))) ?? null;
}
// What changes the drawing: the scene is rebuilt only when something here differs (a reading comes every minute)
const signature = (d) => d.cities.map((c) => `${c.id}:${Math.round(c.floors)}:${c.sessions}:${c.buildings.map(bSig).join(',')}`).join(';');
let dataAt = 0, dataSig = '', pending = null;
const showStale = (error) => { const s = $('#stale-pill'); s.hidden = !error; if (error) s.textContent = s.title = staleText(error, dataAt); };
async function load() {
  try {
    let res;
    try { res = await fetch(`api/cities${API_Q}`, { cache: 'no-store' }); } catch (e) { throw Object.assign(new Error('offline', { cause: e }), { offline: true }); }
    noteServerClock(res);
    const json = await res.json().catch(() => ({}));
    // a failed reading answers with the error object ({ code, status, retryAfter, at }) or carries it in `error`
    if (!res.ok || !json.cities) throw Object.assign(new Error(`HTTP ${res.status}`), { info: json.code ? json : json.error ?? { code: 'unknown' } });
    if (tl) { pending = json; return; } // in the middle of the time-lapse: the new reading comes in when it ends
    if (data && json.generatedAt === dataAt) { data.error = json.error; showStale(json.error); return; } // the same reading: only the notice may have changed
    if (params.has('giant')) { const c = json.cities[0], b = c?.buildings[0]; if (b) { const n = Number(params.get('giant')) || TEN_BI; c.floors += n - b.floors; b.floors = n; } }
    const prev = data;
    data = json; dataAt = json.generatedAt;
    // a belt earned this week (the zen garden on the roof)
    for (const c of data.cities) for (const b of c.buildings) b.beltUp = !!b.beltSince && Date.parse(`${b.beltSince}T12:00:00Z`) >= data.week.start;
    const tops = data.cities.flatMap((c) => c.buildings.map((b) => b.floors)).sort((a, b) => b - a);
    // in steps of 2%: one more floor on the tallest building must not change every height in the region
    // (and with it every city's drawing); the scale follows when the top has grown a step
    const step = (v) => 1.02 ** Math.ceil(Math.log(Math.max(1, v)) / Math.log(1.02));
    CLOUD = Math.max(2500, 1.5 * step(tops[2] ?? 0));
    FLOOR = clamp(160 / Math.max(15, scaled(step(tops[0] ?? 15))), 0.03, 0.9);
    const sig = signature(data);
    if (sig !== dataSig) { dataSig = sig; buildScene(); }
    else { // nothing changed in the drawing: only the panels' data (the buildings stay the same objects)
      for (const h of hitByKey.values()) { const c = cityOf(h.c.id); const b = c?.buildings.find((x) => x.id === h.b.id); if (b) { h.b = b; h.c = c; } }
      for (const c of data.cities) { const p = prev?.cities.find((x) => x.id === c.id); if (p) { c.box = p.box; c.center = p.center; c.maxH = p.maxH; c.monuments = p.monuments; c.style = p.style; } }
    }
    $('#error').hidden = true;
    if (prev) {
      const ev = liveEvents(prev, data);
      // back from the ashes: used again after the building had caught fire
      for (const c of data.cities) for (const b of c.buildings) {
        if (!b.back || prev.cities.find((x) => x.id === c.id)?.buildings.find((x) => x.id === b.id)?.back) continue;
        queueToast({ icon: '🎉', title: t('toast.back.title', { name: displayName(b).short }), text: t('toast.back.text', { days: plural(b.back, 'count.day'), c }), city: c.id, person: b.id, ms: 9000 });
        setTimeout(() => spawnFloat(keyOf(c.id, b.id), t('float.back'), true), 700);
        const at = atKey(keyOf(c.id, b.id)); if (at && ANIM) fx.spawn('confetti', at, { dur: 2600, delay: 600 });
      }
      const m0 = missionOf(prev), m1 = missionOf(data); // the region's mission, met between two readings
      if (m0 && m1 && m0.done < m0.target && m1.done >= m1.target) {
        queueToast({ icon: '🎯', title: t('mission.toast.title'), text: t('mission.toast.text', { target: floorsText(m1.target) }), ms: 10_000 });
        [...data.cities].sort((a, b) => b.week - a.week).slice(0, 3).forEach((c, i) => setTimeout(() => celebrate(c.id, 4), i * 900));
      }
      for (const f of ev.floats) setTimeout(() => spawnFloat(keyOf(f.city, f.person), f.text, f.gold), f.delay);
      if (ANIM) {
        for (const s of ev.sparkles) { const at = atKey(s.key); if (at) fx.spawn('sparkle', at, { dur: 1200, delay: s.delay }); }
        for (const s of ev.confetti) { const at = atKey(s.key); if (at) fx.spawn('confetti', at, { dur: 2600, delay: s.delay }); }
        for (const s of ev.fireworks) { const at = atKey(s.key); if (at) fx.spawn('firework', at, { hue: 1, dur: 2600, delay: s.delay }); }
        for (const s of ev.rockets) { const at = atKey(s.key); if (at) { rockets.push(launchRocket(scene, { x: at.x, y: at.y + 3, z: at.z }, matte)); const c = cityOf(s.key.split('|')[0]); if (c) celebrate(c.id, 5); } }
      }
    } else {
      const c = findCity(data, params.get('city'));
      view = c ? { kind: 'city', id: c.id } : { kind: 'region', id: null };
      const person = c && params.get('person') && c.buildings.find((b) => b.id === params.get('person'))?.id;
      selected = person ? { city: c.id, person } : c && params.has('dojo') && dojoHits.has(c.id) ? { city: c.id, dojo: true } : null;
      const fit = c ? fitCity(c) : fitRegion(), cam = (params.get('cam') ?? '').split(',').map(Number); // ?cam=angle,tilt,distance (screenshots)
      if (cam.length === 3 && cam.every(Number.isFinite)) flyTo({ ...fit, phi: cam[1], dist: cam[2] }, 0, cam[0]); else flyTo(fit, 0);
      if (person) { const h = hitByKey.get(keyOf(c.id, person)); if (h) flyTo(fitBuilding(h), 0); } // a building's link: opened right on it
      if (params.has('tour')) { document.documentElement.dataset.tour = '1'; tourIdx = c ? data.cities.findIndex((x) => x.id === c.id) + 1 : 0; tourTimer = setInterval(tourStep, TOUR_MS); setTimeout(tourCaption, 0); }
      if (params.has('monster')) setTimeout(summonMonster, 2500);
      const hq0 = !c && params.get('hq'); // a headquarters' link: opened right on it
      if (hq0 && hqHits.has(hq0)) { urlBusy = true; selectHq(hq0); urlBusy = false; }
      lastNav = navNow();
      offerWelcome();
    }
    if (view.kind === 'city' && !cityOf(view.id)) view = { kind: 'region', id: null };
    renderPanels(data, view, selected);
    updateHeli(); updateRing();
    // a link with only the person (the climb's "🏙️ Building"): opened on their tallest building
    if (!prev && !params.get('city') && params.get('person')) {
      const hit = locatePerson(params.get('person'));
      if (hit) { lastNav = `${hit.c.id}|${hit.b.id}||`; goPerson(hit.c.id, hit.b.id); flyTo(fitBuilding(hitByKey.get(keyOf(hit.c.id, hit.b.id)) ?? { x: 0, z: 0, h: 10 }), 0); }
    }
    // whoever marked their own building is greeted with its numbers (after the panels: the finder uses their data)
    if (!prev && me && !selected) {
      const mine = locatePerson(me);
      if (mine) setTimeout(() => queueToast({ icon: '📍', title: t('toast.welcome.title', { name: displayName(mine.b).short }), text: t('toast.welcome.text', { c: mine.c, floors: floorsText(mine.b.floors), week: mine.b.week > 0 ? fmt.int(mine.b.week) : '' }), city: mine.c.id, person: me, ms: 7000, quiet: true }), 1800);
    }
  } catch (err) {
    if (!data) {
      const el = $('#error'), why = err.info ? t(`error.${err.info.code}`, err.info) : t('error.offline');
      el.hidden = false; el.textContent = t('load.failed', { error: why });
    } else { data.error = err.info ?? { code: 'offline' }; showStale(data.error); } // kept on the reading, so the notice survives the panels being drawn again (no info: the server did not answer)
    console.error('[city] loading failed:', err);
    throw err;
  }
}
// advisors: a tip every now and then; the countdown's ring follows the panel's turn
setInterval(() => {
  if (!data || hasToasts() || document.hidden || tl) return;
  const tips = advisors(data);
  if (!tips.length) return;
  const tip = tips[Math.floor(Math.random() * tips.length)];
  queueToast({ icon: tip.icon, title: tip.who, text: tip.text, city: tip.city, person: tip.person, tip: true, ms: 9000 });
}, 150_000);
setInterval(updateRing, 12_500);
// back from the ashes: all day, sparkles climb the golden scaffold in a spiral
setInterval(() => {
  if (!ANIM || document.hidden || tl || !backMarks.length) return;
  const turn = performance.now() / 900;
  // a few at a time, taking turns (the effects share a pool of 60: the fireworks must keep their room)
  const start = Math.floor(performance.now() / 2600) % Math.max(1, backMarks.length);
  for (const m of [...backMarks.slice(start), ...backMarks.slice(0, start)].slice(0, 3)) for (let i = 0; i < 5; i++) fx.spawn('sparkle', { x: m.x + Math.cos(turn + i * 1.05) * m.r, y: m.h * (0.1 + i * 0.17), z: m.z + Math.sin(turn + i * 1.05) * m.r }, { dur: 1100, delay: i * 170 });
}, 2600);
setInterval(renderAge, 20_000); // "3 min ago" keeps counting between readings

initPanels({ goCity, goPerson, goRegion, select, closeModals, celebrate, timeline: (c, b) => loadHistory().then(() => renderTimeline(c, b), () => { const el = $('#timeline'); if (el) el.innerHTML = `<small>${t('sheet.timelineFailed')}</small>`; }) });
// the help's "Links, TV and parameters" tab: the builder starts from what is on screen now
const links = initLinks({ root: $('#help'), state: () => ({
  cities: data?.cities ?? [], city: view.kind === 'city' ? view.id : '', person: selected?.person ?? '',
  map: mapMode ?? '', hour: hourAuto ? '' : String(Math.round(hour) % 24), style: STYLE_PAL[params.get('style')] ? params.get('style') : '',
  tour: params.has('tour'), spin: controls.autoRotate && !params.has('tour'), panels: PANELS.every((p) => hiddenPanels.has(p)), names: hiddenPanels.has('names'),
  quality: LOW_Q, monuments: params.get('monuments') === 'all', demo: DEMO, lang: params.get('lang') ?? '',
}) });
if (DEMO) $('.switch').href = 'climb.html?demo'; // the climb shows the demo too
applyPanels();
if (mapMode) document.documentElement.dataset.map = mapMode;
renderMapKey(mapMode);
$('#spin').setAttribute('aria-pressed', String(controls.autoRotate));
applyHour(hour);
load().then(() => { const el = $('#loading'); el.style.opacity = 0; setTimeout(() => el.remove(), 700); requestAnimationFrame(frame); })
  .catch(() => { $('#loading').remove(); requestAnimationFrame(frame); });
setInterval(() => { if (pending && !tl) { const p = pending; pending = null; dataAt = 0; load().catch(() => {}); return; } load().catch(() => {}); }, REFRESH_MS);
window.city = { scene, camera, controls, renderer, applyHour, goCity, goPerson, goRegion, select, selectDojo, selectHq, goDistrict, fitDistrict, flyTo, fitCity, fitRegion, reload: load, rebuild: buildScene, setMapMode, startFilm, stopFilm, summonMonster, celebrate, fx, hi: { hoverHi, selHi, selBeam, selRing, selFrame }, get life() { return life; }, get lastBuild() { return lastBuild; }, get onePiece() { return onePiece; }, set onePiece(v) { onePiece = !!v; }, get data() { return data; }, get world() { return world; }, get view() { return view; }, get selected() { return selected; } };
