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
// and ?names=0 hide the panels and the signs.

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
import { t, plural, fmt, cityLabel, displayName } from '../i18n/index.js';
import { tierOf, BUILDING_TIERS, TEN_BI, advisors, context, mayorOf, floorsText, cityTier, buildingTier } from './rules.js';
import { L, seed, hash, kind, buildWorld, groundCanvas, dojoOf } from './world.js';
import { makeKit, craneJib, Batcher, mats, lit, blinkMats, matte, setAnisotropy, SILVER, DARK, WARM_LIGHT, HOUSE_H, STYLE_PAL } from './buildings.js';
import { initPanels, renderPanels, countdownKey, queueToast, liveEvents, hasToasts, keyOf, esc, staleText, setMe as panelsSetMe, renderFinder, finderKey, locatePerson, MAPKEYS, mapColorFor, renderMapKey, renderPaper } from './panels.js';
import { makeLife, blimpLines } from './life.js';
import { makeEffects, launchRocket } from './effects.js';
import { loadHistory, renderTimeline, startTimelapse, openRace, playRace } from './history.js';
import { initLinks } from './links.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const LOW_Q = params.get('quality') === 'low';
const DEMO = params.has('demo'); // demo mode: the fictional region of the demo source (the API gets ?demo)
const API_Q = DEMO ? '?demo' : '';
const ANIM = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const REFRESH_MS = 60_000, TOUR_MS = 24_000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ───────── a scale that holds giants ─────────
// Linear up to the cloud line and compressed above it. FLOOR is the height of a floor in the world,
// the same in the whole region: the region's tallest building ends up ~16 lots tall.
const SQUEEZE = 0.5;
let CLOUD = Infinity, FLOOR = 0.5;
const scaled = (f) => (f <= CLOUD ? f : CLOUD + SQUEEZE * CLOUD * Math.log1p((f - CLOUD) / CLOUD));
const hOfFloors = (f) => (f < 15 ? HOUSE_H[kind(f)] : Math.max(4.2, scaled(f) * FLOOR));
const heightOf = (b) => hOfFloors(b.floors);
const wkOf = (b) => (scaled(b.floors) - scaled(Math.max(0, b.floors - b.week))) * FLOOR;

// ───────── renderer, scene and camera ─────────
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: !LOW_Q, preserveDrawingBuffer: params.has('debug') });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_Q ? 0.85 : 1.5));
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
  uniforms: { top: { value: new THREE.Color('#2a63c9') }, mid: { value: new THREE.Color('#5591e3') }, hor: { value: new THREE.Color('#cfe6ff') }, low: { value: new THREE.Color('#9fb6cc') } },
  vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 low; varying vec3 vPos;
    void main(){ float t = normalize(vPos).y; vec3 c = t < 0.0 ? mix(hor, low, clamp(-t * 6.0, 0.0, 1.0)) : (t < 0.16 ? mix(hor, mid, t / 0.16) : mix(mid, top, (t - 0.16) / 0.84));
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
let hills = null;
function makeHills(size) {
  if (hills) scene.remove(hills);
  const r = seed('hills'), g = new THREE.Group(), mat = matte('#6f9a8a', { flatShading: true }), R0 = Math.max(1700, size * 1.15);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + r() * 0.12, dist = R0 + r() * R0 * 0.5, h = 70 + r() * 180, w = 280 + r() * 420;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7), mat); m.position.set(Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist); m.rotation.y = r() * 6; g.add(m);
  }
  scene.add(g); hills = g;
}

// glow (bloom) at night: windows, neon and lamps get a halo
const composer = new EffectComposer(renderer);
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
const hitGroup = new THREE.Group(); scene.add(hitGroup);
const hitByKey = new Map(); // city|person → { x, z, h, b, c }
const dojoHits = new Map(); // city → { x, z, h, w, dojo, c } of the city's Dojo
let anims = [], cars = null, kit = null, groundTex = null, life = null, rockets = [];
const fx = makeEffects(scene);
const wx = (gx) => (gx + 0.5 - GW / 2) * L, wz = (gy) => (gy + 0.5 - GH / 2) * L;
const cityOf = (id) => data?.cities.find((c) => c.id === id);
// "my building": whoever found themself in the finder can mark their own building (kept only in this browser)
let me = (() => { try { return localStorage.getItem('city.me'); } catch { return null; } })();
panelsSetMe(me);

// panels hidden by the 👁️ (or by each one's ×), and 'names', the cities' signs.
const PANELS = ['trophies', 'ranking', 'derby', 'countdown', 'legend', 'hall', 'news'];
const hiddenPanels = (() => {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('city.hiddenPanels') || '[]'); } catch {}
  const set = new Set(Array.isArray(saved) ? saved.filter((p) => PANELS.includes(p) || p === 'names') : []);
  if (params.get('panels') === '0') PANELS.forEach((p) => set.add(p));
  if (params.get('names') === '0') set.add('names');
  return set;
})();

// ───────── the scene from the data ─────────
function clearScene() {
  // bldGroup is the scene's grandchild: cityGroup.clear() only detaches it, so it must be emptied too
  // (otherwise the cranes and meshes of the previous reading pile up under the new ones, every minute)
  for (const g of [cityGroup, hitGroup]) { g.traverse((m) => { if (m.isMesh) m.geometry.dispose(); }); g.clear(); }
  bldGroup.clear(); cityGroup.add(bldGroup);
  groundTex?.dispose(); groundTex = null;
  life?.dispose(); life = null;
  hitByKey.clear(); dojoHits.clear(); anims = []; cars = null;
}
function buildScene() {
  clearScene();
  const src = data;
  world = buildWorld(src, { allMonuments: params.get('monuments') === 'all' });
  GW = world.GW; GH = world.GH; terrainSize = Math.max(GW, GH) * L;
  // a big scene (the dense ?demo region): a smaller shadow map, otherwise the shadow pass rules the frame
  const want = LOW_Q ? 1024 : src.cities.reduce((a, c) => a + c.buildings.length, 0) > 1500 ? 2048 : 4096;
  if (sun.shadow.mapSize.x !== want) { sun.shadow.mapSize.set(want, want); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (STYLE_PAL[params.get('style')]) for (const c of src.cities) c.style = params.get('style');
  const grey = !!mapMode;
  // ground: the terrain's texture and the field up to the horizon
  groundTex = new THREE.CanvasTexture(groundCanvas(world, { grey })); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW * L, GH * L), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0, envMapIntensity: 0.2 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; cityGroup.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), matte(grey ? '#aeb3aa' : '#7fb95a'));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.3; far.receiveShadow = true; cityGroup.add(far);
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
    cityGroup.add(water);
  }
  // buildings, houses and monuments, from the kit, in one batch per material
  const batch = new Batcher();
  kit = makeKit(batch, heightOf, wkOf, grey ? mapColorFor(mapMode, world.maxWeek) : null);
  const trees = [], lamps = [], airports = [];
  for (const c of src.cities) c.maxH = 0;
  for (const o of world.objs) {
    const x = wx(o.gx), z = wz(o.gy);
    if (o.kind === 'bld') {
      const { h } = o.b.floors < 15 ? kit.house(o.b, o.c, x, z) : kit.tower(o.b, o.c, x, z);
      o.c.maxH = Math.max(o.c.maxH, h);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, h + 2, L * 0.9), DARK);
      hit.position.set(x, (h + 2) / 2, z); hit.layers.set(1); hit.userData = { b: o.b, c: o.c, h, x, z };
      hitGroup.add(hit); hitByKey.set(keyOf(o.c.id, o.b.id), hit.userData);
    } else if (o.kind === 'mon') {
      const mx = x + (o.size - 1) * L / 2, mz = z + (o.size - 1) * L / 2;
      const out = kit.monument(o.m, o.size, mx, mz);
      if (o.m.key === 'dojo') { // the city's Dojo can be touched too: the masters' card
        const h = out?.h ?? 8, w = o.size * L, hit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, h + 1, w * 0.95), DARK);
        hit.position.set(mx, (h + 1) / 2, mz); hit.layers.set(1); hit.userData = { dojo: o.m, c: o.c, h, x: mx, z: mz, w };
        hitGroup.add(hit); dojoHits.set(o.c.id, hit.userData);
      }
      if (o.m.key === 'airport') airports.push({ x0: mx - o.size * L * 0.5, x1: mx + o.size * L * 0.5, z: mz - 4 });
    } else if (o.kind === 'tree') trees.push({ x: x - L / 2 + o.u * L, z: z - L / 2 + o.v * L, s: o.s });
    else if (o.kind === 'lamp') lamps.push({ x: x + L * 0.36, z: z + L * 0.36 });
  }
  for (const m of batch.build()) bldGroup.add(m);
  for (const m of scen.build()) cityGroup.add(m);
  for (const a of kit.anims) bldGroup.add(a.obj);
  anims = kit.anims;
  if (kit.cranes.length) { // the jibs of every crane: two instanced meshes, turned every frame
    const meshes = craneJib().map(({ geometry, material }) => { const im = new THREE.InstancedMesh(geometry, material, kit.cranes.length); im.castShadow = true; im.frustumCulled = false; bldGroup.add(im); return im; });
    anims.push({ kind: 'cranes', meshes, list: kit.cranes });
    stepCranes(anims[anims.length - 1], 0);
  }
  for (const m of [...makeTrees([...trees, ...kit.trees]), ...makeLamps(lamps), makeCars()]) if (m) cityGroup.add(m);
  // the cities' signs and the little "N in common" plates on the golden roads
  for (const c of src.cities) {
    const tr = tierOf(c.floors), dj = dojoOf(c), wrap = document.createElement('div'); // the sign sits in a wrapper, to shrink from afar (--signk)
    wrap.innerHTML = `<div class="sign" data-city="${esc(c.id)}">${esc(cityLabel(c))}<small>${tr.icon} ${cityTier(tr.key).name} · ${floorsText(c.floors)} · ${plural(c.people, 'count.building')}</small>${dj ? `<em>🥋 ${plural(dj.blacks, 'dojo.blackBelts')}</em>` : ''}</div>`;
    const sign = new CSS2DObject(wrap); sign.position.set(wx(c.center[0] - 0.5), 5, wz(c.box.sy - 2.2)); cityGroup.add(sign);
  }
  for (const r of world.routes) {
    const mid = r.path[Math.floor(r.path.length / 2)], el = document.createElement('div');
    el.className = 'route'; el.textContent = t('sign.route', { n: fmt.int(r.n) });
    const lab = new CSS2DObject(el); lab.position.set(wx(Math.floor(mid / 10000)), 5, wz(mid % 10000)); cityGroup.add(lab);
  }
  world.maxH = Math.max(0, ...src.cities.map((c) => c.maxH));
  if (!hills) makeHills(terrainSize);
  // life: people, boats, planes, helicopter, airship, beacon, elevator
  life = makeLife({ scene, world, data: src, wx, wz, marks: kit.marks, airports, size: terrainSize });
  life.setBlimpMsgs(blimpLines(src, context(src).leader));
  updateHeli();
  applyHour(hour);
  paintMe();
}

// ───────── trees, lamps and cars (instanced) ─────────
function makeTrees(list) {
  const n = list.length; if (!n) return [];
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0), matte('#6b4b2e'), n);
  // in a dense region (tens of thousands of trees) the crown gets 20 faces instead of 80: unnoticeable from afar, and the shadows are grateful
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, n > 6000 ? 0 : 1), matte('#ffffff', { roughness: 0.95, envMapIntensity: 0.2 }), n);
  const greens = mapMode ? ['#9aa89a', '#a3b0a3', '#93a193', '#aab6aa'] : ['#3f8f4a', '#4c9c3f', '#2f7d45', '#58a84a'], mt = new THREE.Matrix4(), col = new THREE.Color();
  list.forEach((t, i) => {
    const s = t.s * 2.2;
    mt.makeScale(s * 0.9, s * 0.8, s * 0.9).setPosition(t.x, 0, t.z); trunk.setMatrixAt(i, mt);
    mt.makeScale(s * 1.05, s * 1.15, s * 1.05).setPosition(t.x, s * 0.8 + s * 0.95, t.z); crown.setMatrixAt(i, mt);
    crown.setColorAt(i, col.set(greens[Math.floor(hash(Math.round(t.x * 10), Math.round(t.z * 10), 8) * 4)]));
  });
  trunk.castShadow = crown.castShadow = true; crown.receiveShadow = true;
  return [trunk, crown];
}
function makeLamps(list) {
  const n = list.length; if (!n) return [];
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6).translate(0, 2.5, 0), SILVER, n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 8), WARM_LIGHT, n);
  const mt = new THREE.Matrix4();
  list.forEach((p, i) => { mt.makeTranslation(p.x, 0, p.z); pole.setMatrixAt(i, mt); mt.makeTranslation(p.x, 5.1, p.z); head.setMatrixAt(i, mt); });
  pole.castShadow = true;
  return [pole, head];
}
const CAR_COLORS = ['#d9473f', '#f2f2f2', '#3d7bd9', '#f2c14e', '#2f3640', '#7bc043'];
function makeCars() {
  const list = [], r = seed('cars');
  const laneAB = (ln) => (ln.axis === 'x' ? [[wx(ln.a) - L / 2, wz(ln.f)], [wx(ln.b - 1) + L / 2, wz(ln.f)]] : [[wx(ln.f), wz(ln.a) - L / 2], [wx(ln.f), wz(ln.b - 1) + L / 2]]);
  for (const ln of world.lanes) {
    const [a, b] = laneAB(ln), len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / (ln.hwy ? 34 : 48)));
    for (let i = 0; i < n; i++) for (const dir of [1, -1]) list.push({ a, b, len, t: r(), v: (6 + r() * 5) / len, dir, col: ln.gold ? '#f2b705' : CAR_COLORS[Math.floor(r() * CAR_COLORS.length)] });
  }
  // the mayor's official car: black, driving around the mayor's city
  for (const c of world.cities) {
    if (!mayorOf(c)) continue;
    const ln = world.lanes.find((x) => x.city === c && !x.hwy && x.b - x.a >= 3);
    if (ln) { const [a, b] = laneAB(ln), len = Math.hypot(b[0] - a[0], b[1] - a[1]); list.push({ a, b, len, t: 0, v: 4.5 / len, dir: 1, col: '#1d2630', official: true }); }
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
let hour = zoneHour(), hourAuto = !params.has('hour'), dayF = 1;
const sunDir = new THREE.Vector3(0, 1, 0);
function applyHour(h) {
  h = ((h % 24) + 24) % 24; hour = h;
  const el = Math.sin(((h - 6) / 12) * Math.PI), az = ((h - 12) / 12) * Math.PI;
  dayF = smooth(-0.08, 0.28, el);
  const dusk = 1 - smooth(0.05, 0.45, Math.abs(el));
  sunDir.set(Math.sin(az) * 0.85, Math.max(0.04, el), Math.cos(az) * 0.6 - 0.2).normalize();
  sun.intensity = 3.2 * dayF; sun.color.set('#fff2df').lerp(new THREE.Color('#ffb070'), dusk * 0.7);
  moon.intensity = 0.45 * (1 - dayF);
  const sky = skyColorsAt(h);
  skyMat.uniforms.top.value.set(sky[0]); skyMat.uniforms.mid.value.set(sky[1]); skyMat.uniforms.hor.value.set(sky[3]); skyMat.uniforms.low.value.set(sky[3]).multiplyScalar(0.7);
  hemi.color.set(sky[1]).lerp(new THREE.Color('#ffffff'), 0.3); hemi.groundColor.set('#6f7a55'); hemi.intensity = 0.28 + 0.92 * dayF;
  const size = Math.max(600, terrainSize);
  scene.fog.color.set(sky[3]); scene.fog.near = size * (0.7 + 0.4 * dayF); scene.fog.far = size * (2 + 1.2 * dayF);
  renderer.toneMappingExposure = 1 + 0.25 * (1 - dayF);
  stars.material.opacity = 0.9 * (1 - dayF);
  for (const m of mats) m.envMapIntensity = (m.userData.env ??= m.envMapIntensity) * (0.15 + 0.85 * dayF);
  const night = 1 - dayF;
  for (const { m, i } of lit) { m.userData.base = i; m.emissiveIntensity = i * night; }
  useBloom = !LOW_Q && night > 0.35; bloom.strength = 0.65 * night;
  clouds.children.forEach((s) => (s.material.opacity = 0.35 + 0.5 * dayF));
  $('#hour').value = h; $('#hour-out').value = fmt.clock(h);
  $('#sky-btn').classList.toggle('lit', !hourAuto);
  document.querySelectorAll('[data-hour]').forEach((b) => b.classList.toggle('on', b.dataset.hour === 'auto' ? hourAuto : !hourAuto && Number(b.dataset.hour) === h));
}
setInterval(() => { if (hourAuto) applyHour(zoneHour()); }, 60_000);

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
function setView(next, person = null) { // person: the person's id, or { dojo: true } for the city's Dojo
  view = next; selected = person?.dojo ? { city: next.id, dojo: true } : person ? { city: next.id, person } : null;
  renderPanels(data, view, selected);
  const h = person?.dojo ? dojoHits.get(next.id) : person && hitByKey.get(keyOf(next.id, person));
  if (h) flyTo(fitBuilding(h), 1500); else refit(1500);
  updateHeli(); updateRing();
}
// the card of the city's Dojo (masters and who is on the way), with the Dojo in the middle of the screen
function selectDojo(cityId) {
  selected = { city: cityId, dojo: true };
  renderPanels(data, view, selected);
  const h = dojoHits.get(cityId);
  if (h) { const v = currentView(); flyTo({ target: new THREE.Vector3(h.x, 6, h.z), phi: v.phi, dist: clamp(v.dist, 80, 240) }, 900); }
}
function goRegion() { if (view.kind !== 'region') setView({ kind: 'region', id: null }); else refit(); }
function goCity(id, person = null) { if (!cityOf(id)) return; closeModals(); setView({ kind: 'city', id }, person); }
function goPerson(cityId, personId) { goCity(cityId, personId); }
// the touched building goes to the middle of the screen (the card on the left, City Hall on the
// right), keeping the angle; from very far the camera comes a bit closer
function select(cityId, personId) {
  selected = personId ? { city: cityId, person: personId } : null;
  renderPanels(data, view, selected);
  const h = personId && hitByKey.get(keyOf(cityId, personId));
  if (h) { const v = currentView(); flyTo({ target: new THREE.Vector3(h.x, Math.min(h.h * 0.45, 40), h.z), phi: v.phi, dist: clamp(v.dist, 80, 240) }, 900); }
}
function celebrate(cityId, n = 3) {
  const c = cityOf(cityId), h = c?.buildings[0] && hitByKey.get(keyOf(c.id, c.buildings[0].id));
  if (h && ANIM) for (let i = 0; i < n; i++) fx.spawn('firework', { x: h.x, y: h.h, z: h.z }, { hue: i * 2, delay: i * 380, dur: 2600 });
}

// the TV tour: the region, then each city, with the camera turning slowly
let tourIdx = -1, tourTimer = null;
function tourStep() {
  if (tl) return;
  const ids = data.cities.map((c) => c.id);
  tourIdx = (tourIdx + 1) % (ids.length + 1);
  if (tourIdx === 0) setView({ kind: 'region', id: null }); else setView({ kind: 'city', id: ids[tourIdx - 1] });
}

// ───────── highlight: the building under the mouse (white) and the chosen one (gold, with a beam and a ring) ─────────
// To find the right building in the city: the outline follows the whole lot, from the ground to the
// roof; the chosen one's pulses and has a beam of light rising from the roof, visible from afar.
function makeHighlight(hex, op, edge = hex) { // white edge on the chosen one: gold vanishes on art deco buildings
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.95 })));
  g.visible = false; scene.add(g); return g;
}
const hoverHi = makeHighlight('#ffffff', 0.22), selHi = makeHighlight('#f2b705', 0.28, '#ffffff');
const selBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 70, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
const selRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b705', transparent: true, opacity: 0.8, depthWrite: false }));
selBeam.visible = selRing.visible = false; scene.add(selBeam, selRing);
const placeHi = (g, h) => { const w = (h.w ?? L) * 1.02; g.position.set(h.x, 0, h.z); g.scale.set(w, h.h + 1, w); g.visible = true; };
const selectedHit = () => (selected?.dojo ? dojoHits.get(selected.city) : selected && hitByKey.get(keyOf(selected.city, selected.person)));
const isSelectedHit = (h) => !!selected && h.c.id === selected.city && (h.dojo ? !!selected.dojo : !selected.dojo && h.b.id === selected.person);
function stepHighlights(now) {
  const hh = !tl && hovered && hoveredHit;
  if (hh && !isSelectedHit(hoveredHit)) placeHi(hoverHi, hoveredHit); else hoverHi.visible = false;
  const s = !tl && selectedHit();
  if (!s) { selHi.visible = selBeam.visible = selRing.visible = false; return; }
  const pulse = 0.5 + 0.5 * Math.sin(now / 320);
  placeHi(selHi, s); selHi.children[0].material.opacity = 0.18 + 0.2 * pulse;
  selBeam.position.set(s.x, s.h + 35, s.z); selBeam.material.opacity = 0.22 + 0.14 * pulse; selBeam.visible = true;
  const r = 7 + 5 * ((now % 1400) / 1400);
  selRing.position.set(s.x, 0.5, s.z); selRing.scale.set(r, 1, r); selRing.material.opacity = 0.9 * (1 - (now % 1400) / 1400); selRing.visible = true;
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
  if (hit.dojo) { if (view.kind === 'city' && hit.c.id === view.id) selectDojo(hit.c.id); else goCity(hit.c.id, { dojo: true }); return; }
  if (view.kind === 'city' && hit.c.id === view.id) select(hit.c.id, hit.b.id); else goCity(hit.c.id, hit.b.id);
});
function pick() { ray.setFromCamera(ptr, camera); return ray.intersectObjects(hitGroup.children, false)[0]?.object.userData ?? null; }
function pickHover() {
  const h = ptr.x < -1 || tl ? null : pick(), b = h ? h.b ?? h.dojo : null;
  renderer.domElement.style.cursor = b ? 'pointer' : '';
  if (b === hovered) return;
  hovered = b; hoveredHit = h;
  if (!b) { tipEl.classList.add('off'); return; }
  if (h.dojo) tipEl.innerHTML = `🥋 ${esc(t(`dojoLevel.${h.dojo.levelKey}`).name)}${view.kind === 'region' ? ` · ${esc(cityLabel(h.c))}` : ''}<small>${plural(h.dojo.blacks, 'tip.dojo')}</small>`;
  else {
    const tr = tierOf(b.floors, BUILDING_TIERS);
    tipEl.innerHTML = `${esc(displayName(b).full)}<small>${view.kind === 'region' ? `${esc(cityLabel(h.c))} · ` : ''}${b.belt === 'black' ? `🥋 ${t('belt.black').lower} · ` : ''}${tr.icon} ${buildingTier(tr.key).name} · ${floorsText(b.floors)}${b.week > 0 ? ` · <span class="up">${t('tip.week', { n: fmt.int(b.week) })}</span>` : ''}</small>`;
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
  for (const h of hitByKey.values()) if (h.b.id === me) { const o = new CSS2DObject(wrapped('mepin', t('me.pin'))); o.position.set(h.x, h.h + 2, h.z); scene.add(o); mePins.push(o); }
}
function setMe(id) {
  me = me === id ? null : id;
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
function closePopovers() { document.querySelectorAll('.popover').forEach((el) => (el.hidden = true)); document.querySelectorAll('.tools .on').forEach((b) => b.classList.remove('on')); }
function closeModals() { closePopovers(); document.querySelectorAll('.modal').forEach((el) => (el.hidden = true)); }
const anyModal = () => [...document.querySelectorAll('.modal')].some((el) => !el.hidden);
function openModal(id) { closeModals(); $(`#${id}`).hidden = false; }
function openTool(name, btn) {
  if (name === 'me') { const hit = me && locatePerson(me); if (hit) goPerson(hit.c.id, hit.b.id); return; }
  if (name === 'find') { openModal('finder'); $('#finder-q').value = ''; renderFinder(); $('#finder-q').focus(); return; }
  if (name === 'paper') { renderPaper(dayF < 0.5); openModal('newspaper'); return; }
  if (name === 'help') { openModal('help'); links.showTab('read'); return; }
  const pop = $({ panels: '#panels', sky: '#sky', maps: '#maps', history: '#films' }[name]), was = pop && !pop.hidden;
  closeModals();
  if (!pop || was) return;
  pop.hidden = false; btn?.classList.add('on');
}
function setMapMode(m) {
  if (tl) stopFilm();
  mapMode = MAPKEYS[m] ? m : null;
  if (mapMode) document.documentElement.dataset.map = mapMode; else delete document.documentElement.dataset.map;
  renderMapKey(mapMode);
  closeModals();
  if (data) { buildScene(); updateRing(); }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-hide-panel], [data-panel], [data-panels], [data-tool], [data-back], [data-close], [data-close-modal], [data-share], [data-me], [data-building], [data-dojo], [data-city], [data-dir], [data-map-mode], [data-film], [data-race], [data-tl-stop], #spin, #refit, [data-hour], .sign');
  if (!el) { if (e.target.classList.contains('modal')) closeModals(); else if (!e.target.closest('.popover')) closePopovers(); return; }
  if (el.dataset.dojo) { const id = el.dataset.dojo; if (view.kind === 'city' && view.id === id) selectDojo(id); else goCity(id, { dojo: true }); return; }
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
    navigator.clipboard?.writeText(u.toString()).then(() => queueToast({ icon: '🔗', title: t('toast.linkCopied.title'), text: t('toast.linkCopied.text'), ms: 3000, quiet: true }));
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
  if (el.dataset.hour) { if (el.dataset.hour === 'auto') { hourAuto = true; applyHour(zoneHour()); } else { hourAuto = false; applyHour(Number(el.dataset.hour)); } }
});
$('#hour').addEventListener('input', (e) => { hourAuto = false; applyHour(Number(e.target.value)); });
$('#finder-q').addEventListener('input', renderFinder);
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
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) { if (e.key === 'Escape') closeModals(); return; }
  if (e.key === 'p' || e.key === 'P') toggleAllPanels();
  else if (e.key === '?') openTool('help');
  else if (e.key === 'Escape') { if (anyModal()) closeModals(); else if (tl) stopFilm(); else { closePopovers(); if (selected) select(null); else if (view.kind === 'city') goRegion(); } }
  else if (e.key === 'g' || e.key === 'G') { controls.autoRotate = !controls.autoRotate; $('#spin').setAttribute('aria-pressed', String(controls.autoRotate)); }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); });

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
  document.documentElement.style.setProperty('--signk', clamp(420 / dist, 0.5, 1).toFixed(2));
  const night = 1 - dayF, sec = now / 1000;
  if (ANIM) {
    stepCars(dt);
    for (const a of anims) {
      if (a.kind === 'cranes') stepCranes(a, dt);
      else if (a.kind === 'wheel') { a.obj.rotation.z -= a.speed * dt; a.obj.children.forEach((c) => { if (c.userData.cabin) c.rotation.z = -a.obj.rotation.z; }); }
    }
    const blink = Math.sin(now / 350) > 0.2 ? 1 : 0.15;
    for (const m of blinkMats) m.emissiveIntensity = (m.userData.base ?? 2.5) * Math.max(night, 0.12) * blink;
    clouds.children.forEach((s) => { s.position.x += s.userData.v * dt; if (s.position.x > 1400) s.position.x = -1400; });
    const lf = life?.step(dt, now, night, sec);
    if (lf?.gone) queueToast({ icon: '🦖', title: t('toast.monsterGone.title'), text: t('toast.monsterGone.text'), ms: 5000, quiet: true });
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
  stepHighlights(now);
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
const signature = (d) => d.cities.map((c) => `${c.id}:${Math.round(c.floors)}:${c.sessions}:${c.buildings.map((b) => `${b.id}|${Math.floor(b.floors)}|${Math.round(b.week)}|${+b.now}|${+b.isNew}|${b.heli}|${b.streak}|${+(b.today > 0)}|${b.night}|${b.cities}|${b.hours}|${b.belt}`).join(',')}`).join(';');
let dataAt = 0, dataSig = '', pending = null;
const showStale = (error) => { const s = $('#stale-pill'); s.hidden = !error; if (error) s.textContent = staleText(error); };
async function load() {
  try {
    let res;
    try { res = await fetch(`api/cities${API_Q}`, { cache: 'no-store' }); } catch (e) { throw Object.assign(new Error('offline', { cause: e }), { offline: true }); }
    const json = await res.json().catch(() => ({}));
    // a failed reading answers with the error object ({ code, status, retryAfter, at }) or carries it in `error`
    if (!res.ok || !json.cities) throw Object.assign(new Error(`HTTP ${res.status}`), { info: json.code ? json : json.error ?? { code: 'unknown' } });
    if (tl) { pending = json; return; } // in the middle of the time-lapse: the new reading comes in when it ends
    if (data && json.generatedAt === dataAt) { showStale(json.error); return; }
    if (params.has('giant')) { const c = json.cities[0], b = c?.buildings[0]; if (b) { const n = Number(params.get('giant')) || TEN_BI; c.floors += n - b.floors; b.floors = n; } }
    const prev = data;
    data = json; dataAt = json.generatedAt;
    const tops = data.cities.flatMap((c) => c.buildings.map((b) => b.floors)).sort((a, b) => b - a);
    CLOUD = Math.max(2500, 1.5 * (tops[2] ?? 0));
    FLOOR = clamp(160 / Math.max(15, scaled(tops[0] ?? 15)), 0.03, 0.9);
    const sig = signature(data);
    if (sig !== dataSig) { dataSig = sig; buildScene(); }
    else { // nothing changed in the drawing: only the panels' data (the buildings stay the same objects)
      for (const h of hitByKey.values()) { const c = cityOf(h.c.id); const b = c?.buildings.find((x) => x.id === h.b.id); if (b) { h.b = b; h.c = c; } }
      for (const c of data.cities) { const p = prev?.cities.find((x) => x.id === c.id); if (p) { c.box = p.box; c.center = p.center; c.maxH = p.maxH; c.monuments = p.monuments; c.style = p.style; } }
    }
    $('#error').hidden = true;
    if (prev) {
      const ev = liveEvents(prev, data);
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
      selected = person ? { city: c.id, person } : null;
      const fit = c ? fitCity(c) : fitRegion(), cam = (params.get('cam') ?? '').split(',').map(Number); // ?cam=angle,tilt,distance (screenshots)
      if (cam.length === 3 && cam.every(Number.isFinite)) flyTo({ ...fit, phi: cam[1], dist: cam[2] }, 0, cam[0]); else flyTo(fit, 0);
      if (person) { const h = hitByKey.get(keyOf(c.id, person)); if (h) flyTo(fitBuilding(h), 0); } // a building's link: opened right on it
      if (params.has('tour')) { document.documentElement.dataset.tour = '1'; tourIdx = c ? data.cities.findIndex((x) => x.id === c.id) + 1 : 0; tourTimer = setInterval(tourStep, TOUR_MS); }
      if (params.has('monster')) setTimeout(summonMonster, 2500);
    }
    if (view.kind === 'city' && !cityOf(view.id)) view = { kind: 'region', id: null };
    renderPanels(data, view, selected);
    updateHeli(); updateRing();
    // whoever marked their own building is greeted with its numbers (after the panels: the finder uses their data)
    if (!prev && me && !selected) {
      const mine = locatePerson(me);
      if (mine) setTimeout(() => queueToast({ icon: '📍', title: t('toast.welcome.title', { name: displayName(mine.b).short }), text: t('toast.welcome.text', { c: mine.c, floors: floorsText(mine.b.floors), week: mine.b.week > 0 ? fmt.int(mine.b.week) : '' }), city: mine.c.id, person: me, ms: 7000, quiet: true }), 1800);
    }
  } catch (err) {
    if (!data) {
      const el = $('#error'), why = err.info ? t(`error.${err.info.code}`, err.info) : t('error.offline');
      el.hidden = false; el.textContent = t('load.failed', { error: why });
    } else { const s = $('#stale-pill'); s.hidden = false; s.textContent = staleText(err.info); } // no info: the server did not answer
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
window.city = { scene, camera, controls, renderer, applyHour, goCity, goPerson, goRegion, select, selectDojo, flyTo, fitCity, fitRegion, reload: load, rebuild: buildScene, setMapMode, startFilm, stopFilm, summonMonster, celebrate, fx, hi: { hoverHi, selHi, selBeam, selRing }, get life() { return life; }, get data() { return data; }, get world() { return world; }, get view() { return view; }, get selected() { return selected; } };
