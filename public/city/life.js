// Life in the city: people on the sidewalks (from the open sessions and whoever is building now), the
// mayor's rally (speech, crowd and confetti on the stage of the mayor's lot), the fires of the
// abandoned buildings (flames on the roof and out of the windows, a column of smoke),
// boats on the river (they vanish under the bridges), planes taking off from the airport, the
// local TV helicopter circling the tallest building in view (with a searchlight at night), the
// airship with the news banner, the Cloud Tower's beacon, the Space Elevator's cabin, a plane
// crossing the sky and the Konami code's monster.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t, plural, displayName } from '../i18n/index.js';
import { L, hash, seed } from './world.js';
import { matte, SILVER, DARK, WARM_LIGHT, RED_LIGHT, GOLD_MAT } from './buildings.js';
import { floorsText, monthOf } from './rules.js';

const NI = (g) => (g.index ? g.toNonIndexed() : g);
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const WALK_COLORS = ['#e8463a', '#3d7bd9', '#f2c14e', '#7bc043', '#9b59b6', '#f2f2f2'];

export function makeLife({ scene, world, data, wx, wz, marks, airports, size }) {
  const group = new THREE.Group(); scene.add(group);
  const labels = [];
  const r = seed('life');

  // ───────── people on the sidewalks ─────────
  const walkers = [];
  world.lanes.forEach((Ln, i) => {
    const c = Ln.city; if (Ln.hwy || !c) return;
    const want = Math.min(4, ((c.sessions ?? 0) * 0.6 + c.building * 1.2) / Math.max(1, world.lanes.filter((x) => x.city === c).length) * 1.5);
    const m = Math.floor(want) + (hash(i, Ln.b - Ln.a, 17) < want % 1 ? 1 : 0);
    for (let j = 0; j < m; j++) walkers.push({ ln: Ln, s: hash(i, j, 18), v: (1.2 + hash(i, j, 19) * 1.2) / ((Ln.b - Ln.a) * L), dir: hash(i, j, 20) < 0.5 ? 1 : -1, side: hash(i, j, 22) < 0.5 ? -0.42 : 0.42, col: WALK_COLORS[Math.floor(hash(i, j, 23) * 6)] });
  });
  walkers.length = Math.min(walkers.length, 320);
  const peopleGeo = mergeGeometries([NI(new THREE.CylinderGeometry(0.32, 0.26, 1.3, 7).translate(0, 0.65, 0)), NI(new THREE.SphereGeometry(0.3, 8, 8).translate(0, 1.6, 0))], false);
  let people = null;
  if (walkers.length) {
    const geo = peopleGeo;
    people = new THREE.InstancedMesh(geo, matte('#ffffff', { roughness: 0.9 }), walkers.length);
    const col = new THREE.Color(); walkers.forEach((w, i) => people.setColorAt(i, col.set(w.col)));
    people.castShadow = true; group.add(people);
  }
  const laneAB = (Ln) => (Ln.axis === 'x' ? [[wx(Ln.a) - L / 2, wz(Ln.f)], [wx(Ln.b - 1) + L / 2, wz(Ln.f)]] : [[wx(Ln.f), wz(Ln.a) - L / 2], [wx(Ln.f), wz(Ln.b - 1) + L / 2]]);

  // ───────── boats ─────────
  const boats = [];
  if (world.PY > 1) for (let i = 0; i < Math.max(2, Math.round(world.GW / 18)); i++) {
    const g = new THREE.Group(), col = ['#f2f2f2', '#d9473f', '#f2c14e'][i % 3];
    g.add(box(6, 1, 2.4, matte(col), 0, 0.5, 0), box(2, 1.2, 1.6, matte('#e9eef2'), -0.5, 1.6, 0), box(0.3, 0.3, 0.3, WARM_LIGHT, 2.6, 1.4, 0));
    boats.push({ g, s: hash(i, 3, 31), v: (3.5 + hash(i, 4, 31) * 3) / (world.GW * L), dir: i % 2 ? -1 : 1, gy: (world.OY ?? 0) + world.PLOT - 1 + (i % 2) });
    group.add(g);
  }

  // ───────── the airport's planes ─────────
  const planeOf = (s = 1) => {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.4 * s, 5 * s, 8), matte('#f4f6f8')); fus.rotation.z = Math.PI / 2; g.add(fus);
    g.add(box(1.2 * s, 0.15 * s, 6 * s, matte('#f4f6f8')), box(1.2 * s, 1.4 * s, 0.2 * s, matte('#e8434b'), -2.2 * s, 0.7 * s, 0));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 6, 6), RED_LIGHT); light.position.set(0, -0.5 * s, 0); g.add(light);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  };
  const flights = airports.map((a, i) => { const g = planeOf(1); g.visible = false; group.add(g); return { ...a, g, seed: i * 9 }; });

  // ───────── helicopter ─────────
  const heli = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), matte('#d9473f')); body.scale.set(1.3, 0.75, 0.8); heli.add(body);
  heli.add(box(5, 0.5, 0.5, DARK, -4.5, 0.4, 0), box(0.4, 1.6, 0.2, DARK, -7, 1, 0), box(5.5, 0.14, 0.4, DARK, 0, -1.6, 1.2), box(5.5, 0.14, 0.4, DARK, 0, -1.6, -1.2));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), matte('#9fd3f2', { roughness: 0.1 })); canopy.position.set(1.8, 0.3, 0); heli.add(canopy);
  const rotor = box(12, 0.12, 0.5, DARK, 0, 2, 0); heli.add(rotor);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), RED_LIGHT); beacon.position.set(0, -1.9, 0); heli.add(beacon);
  const spotMat = new THREE.MeshBasicMaterial({ color: '#fff6d0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const spot = new THREE.Mesh(new THREE.ConeGeometry(14, 60, 16, 1, true), spotMat); spot.position.y = -31; heli.add(spot);
  heli.traverse((m) => { if (m.isMesh && m !== spot) m.castShadow = true; });
  group.add(heli);
  let heliTarget = null;

  // ───────── airship with the news banner ─────────
  const blimp = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), matte('#f4f6f8')); bag.scale.set(2.6, 1, 1); blimp.add(bag);
  blimp.add(box(3, 4, 0.3, matte('#d9473f'), -13, 2, 0), box(3, 0.3, 4, matte('#d9473f'), -13, 0, 0), box(4, 1.6, 2, DARK, 1, -6, 0));
  blimp.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  const bannerEl = document.createElement('div'); bannerEl.className = 'banner';
  const banner = new CSS2DObject(bannerEl); banner.position.set(-24, -2, 0); blimp.add(banner);
  group.add(blimp);
  let blimpMsgs = [], blimpIdx = -1;
  const setBlimpMsgs = (list) => { blimpMsgs = list; };

  // ───────── beacon, elevator ─────────
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff8d8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beams = marks.filter((m) => m.kind === 'beacon').map((m) => {
    const g = new THREE.Group(); g.position.set(m.x, m.y, m.z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 90, 14, 1, true), beamMat); cone.rotation.z = Math.PI / 2; cone.position.x = -45; g.add(cone); // the tip at the beacon, the mouth far away
    group.add(g); return g;
  });
  const cabins = marks.filter((m) => m.kind === 'cable').map((m) => { const g = new THREE.Group(); g.add(box(2.2, 3.2, 2.2, matte('#eef2f5')), box(1.6, 0.9, 2.3, matte('#3ef0ff'))); g.position.set(m.x, m.y, m.z); group.add(g); return { g, y0: m.y, seed: m.seed }; });

  // ───────── the mayor's rally: the mayor speaking on the stage, the crowd in front and the confetti ─────────
  const rallies = marks.filter((m) => m.kind === 'rally').map((m, i) => {
    const g = new THREE.Group(); g.position.set(m.x, m.y, m.z); group.add(g);
    const suit = matte('#2a3340'), skin = matte('#f1c9a5'), col = new THREE.Color();
    const mayor = new THREE.Group(); mayor.position.set(0, 0, 0.35); mayor.scale.setScalar(1.35); g.add(mayor);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 1.3, 7), suit); trunk.position.y = 0.65; trunk.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), skin); head.position.y = 1.6; head.castShadow = true;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10), DARK); brim.position.y = 1.82;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.42, 10), DARK); crown.position.y = 2.05;
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.72), GOLD_MAT); sash.position.y = 0.85; sash.rotation.z = 0.6;
    const arm = new THREE.Group(); arm.position.set(0.36, 1.2, 0);
    const armM = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), suit); armM.position.y = 0.45; armM.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), skin); hand.position.y = 0.95;
    arm.add(armM, hand); mayor.add(trunk, head, brim, crown, sash, arm);
    // the crowd stands on the ground in front of the stage, facing it
    const n = 12, crowd = new THREE.InstancedMesh(peopleGeo, matte('#ffffff', { roughness: 0.9 }), n), seats = [];
    for (let j = 0; j < n; j++) { seats.push({ x: -5 + hash(i, j, 41) * 10, z: 3.1 + hash(i, j, 42) * 2.4, ph: hash(i, j, 43) * 6.3, ry: Math.PI + (hash(i, j, 44) - 0.5) * 0.5 }); crowd.setColorAt(j, col.set(WALK_COLORS[Math.floor(hash(i, j, 45) * 6)])); }
    crowd.castShadow = true; crowd.position.y = -m.y; g.add(crowd);
    // confetti, in bursts of 6 s every 16 s
    const nc = 36, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), nc), bits = [];
    for (let j = 0; j < nc; j++) { bits.push({ x: -3.5 + hash(i, j, 46) * 7, z: 0.6 + hash(i, j, 47) * 4, d: hash(i, j, 48), r: hash(i, j, 49) * 6.3 }); conf.setColorAt(j, col.set(['#e8463a', '#f2c14e', '#3d7bd9', '#7bc043', '#f2f2f2'][j % 5])); }
    conf.visible = false; g.add(conf);
    // the label over the stage, like the city signs (it shrinks from afar with --signk)
    const wrap = document.createElement('div'), el = document.createElement('div'), name = document.createElement('b'), sub = document.createElement('small');
    el.className = 'rally'; name.textContent = `🎩 ${displayName(m.person).full}`; sub.textContent = t('rally.label', { month: monthOf(m.month, 'period.thisMonth') });
    el.append(name, sub); wrap.append(el);
    const lab = new CSS2DObject(wrap); lab.position.set(0, 7.2, 0); g.add(lab); labels.push(lab);
    return { arm, mayor, crowd, seats, conf, bits, seed: i * 3.7 };
  });

  // ───────── the fires: more than idle.fire days without Claude ─────────
  // Flames on the roof and licking up the facade, and a column of smoke. One instanced geometry per
  // kind, animated in the vertex shader: one uniform per frame, however many buildings are burning.
  const fireU = { uTime: { value: 0 }, uNight: { value: 0 }, uWind: { value: new THREE.Vector2(0.32, 0.14) } };
  const fl = [], sm = []; // flames: x y z radius height phase · smoke: x y z size rise phase speed
  marks.filter((m) => m.kind === 'fire').forEach((m, i) => {
    const k = m.house ? 0.62 : Math.min(2.4, 1 + m.h / 80), kw = m.house ? 0.62 : Math.min(1.7, 0.95 + m.h / 150); // the fire's size (roof, windows)
    for (let j = 0, n = m.house ? 5 : 10; j < n; j++) fl.push(m.x + (hash(i, j, 81) - 0.5) * m.w * 0.9, m.h - 0.2, m.z + (hash(i, j, 82) - 0.5) * m.d * 0.9, (0.9 + hash(i, j, 83) * 1.0) * k, (2.2 + hash(i, j, 84) * 3.2) * k, hash(i, j, 85) * 6.3);
    // out of the windows: on the four sides, at random heights of the first block
    const hw = (m.bw ?? m.w) / 2 + 0.3, hd = (m.bd ?? m.d) / 2 + 0.3;
    for (let j = 0, n = m.house ? 2 : Math.min(8, 3 + Math.floor(m.h / 25)); j < n; j++) {
      const side = (j + Math.floor(hash(i, 0, 86) * 4)) % 4, u = (hash(i, j, 87) - 0.5) * 1.4; // every side gets its share
      const y = m.house ? 0.9 : m.by0 + (m.by1 - m.by0) * (0.12 + hash(i, j, 88) * 0.8);
      const [dx, dz] = side === 0 ? [u * hw, hd] : side === 1 ? [hw, u * hd] : side === 2 ? [u * hw, -hd] : [-hw, u * hd];
      // a tall tongue in the middle and two short ones beside it, along the wall
      const ax = side % 2 ? 0 : 1, az = side % 2 ? 1 : 0, rw = (0.95 + hash(i, j, 89) * 0.45) * kw;
      fl.push(m.x + dx, y, m.z + dz, rw, (2.6 + hash(i, j, 90) * 1.8) * kw, hash(i, j, 91) * 6.3);
      for (const sgn of [-1, 1]) fl.push(m.x + dx + ax * sgn * rw * 0.95, y - 0.2, m.z + dz + az * sgn * rw * 0.95, rw * 0.7, (1.5 + hash(i, j, 98 + sgn) * 1.0) * kw, hash(i, j, 99 + sgn) * 6.3);
    }
    for (let j = 0, n = m.house ? 7 : 12; j < n; j++) sm.push(m.x + (hash(i, j, 92) - 0.5) * m.w * 0.5, m.h + 0.8, m.z + (hash(i, j, 93) - 0.5) * m.d * 0.5, (1.0 + hash(i, j, 94) * 0.8) * k, (16 + hash(i, j, 95) * 14) * k * (m.house ? 0.8 : 1), j / n + hash(i, j, 96) * 0.08, 0.075 + hash(i, j, 97) * 0.035);
  });
  const instanced = (base, list, stride, attrs) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(base.index); g.setAttribute('position', base.getAttribute('position')); g.setAttribute('normal', base.getAttribute('normal'));
    const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(list), stride);
    let off = 0; for (const [name, size] of attrs) { g.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, size, off)); off += size; }
    g.instanceCount = list.length / stride;
    return g;
  };
  // The firefighters' jets: drops of water that leave the tip of each truck's ladder, rise in an arc and
  // fall on the burning wall. One instanced geometry for every truck, moved in the vertex shader.
  const hs = []; // from (3) · to (3) · phase
  marks.filter((m) => m.kind === 'hose').forEach((m, i) => { for (let j = 0; j < 44; j++) hs.push(...m.from, ...m.to, j / 44 + hash(i, j, 71) * 0.015); });
  if (hs.length) {
    const mat = new THREE.ShaderMaterial({
      uniforms: fireU, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 aFrom; attribute vec3 aTo; attribute float aPhase;
        uniform float uTime; varying float vT;
        void main() {
          float t = fract(uTime * 0.85 + aPhase); vT = t;
          vec3 c = mix(aFrom, aTo, t);
          c.y += 8.8 * t * (1.0 - t);
          c.x += sin(aPhase * 40.0) * 0.3 * t; c.z += cos(aPhase * 31.0) * 0.3 * t;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(c + position * (0.7 + 1.6 * t), 1.0); // the jet opens into spray as it goes
        }`,
      fragmentShader: `
        varying float vT;
        void main() {
          gl_FragColor = vec4(0.86, 0.95, 1.0, 0.92 * (1.0 - smoothstep(0.8, 1.0, vT)));
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(instanced(new THREE.IcosahedronGeometry(0.26, 0), hs, 7, [['aFrom', 3], ['aTo', 3], ['aPhase', 1]]), mat);
    mesh.frustumCulled = false; mesh.renderOrder = 2; group.add(mesh);
  }
  if (fl.length) {
    const mat = new THREE.ShaderMaterial({
      uniforms: fireU, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `
        attribute vec3 aPos; attribute vec2 aSize; attribute float aPhase;
        uniform float uTime; varying float vY;
        void main() {
          vec3 p = position; vY = p.y;
          float t = uTime * 7.0 + aPhase, f = 1.0 + 0.3 * sin(t) + 0.16 * sin(t * 1.7 + 1.3) + 0.1 * sin(t * 3.1);
          p.xz *= (1.0 - 0.2 * sin(t * 1.3 + p.y * 5.0)) * aSize.x;
          p.y *= aSize.y * f;
          p.x += sin(t * 0.9 + vY * 2.5) * 0.22 * vY * aSize.x;
          p.z += cos(t * 0.8 + vY * 2.0) * 0.22 * vY * aSize.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos + p, 1.0);
        }`,
      fragmentShader: `
        uniform float uNight; varying float vY;
        void main() {
          vec3 hot = vec3(1.0, 0.86, 0.32), mid = vec3(1.0, 0.24, 0.01), tip = vec3(0.55, 0.03, 0.0);
          vec3 c = vY < 0.42 ? mix(hot, mid, vY / 0.42) : mix(mid, tip, (vY - 0.42) / 0.58);
          gl_FragColor = vec4(c * (1.0 + uNight * 0.9), 0.95 * (1.0 - smoothstep(0.5, 1.0, vY)));
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(instanced(new THREE.CylinderGeometry(0, 1, 1, 7, 5, true).translate(0, 0.5, 0), fl, 6, [['aPos', 3], ['aSize', 2], ['aPhase', 1]]), mat);
    mesh.frustumCulled = false; mesh.renderOrder = 2; group.add(mesh);
  }
  if (sm.length) {
    const mat = new THREE.ShaderMaterial({
      uniforms: fireU, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 aPos; attribute vec4 aSmoke; // size, rise, phase, speed
        uniform float uTime; uniform vec2 uWind; varying float vU; varying vec3 vN;
        void main() {
          float u = fract(uTime * aSmoke.w + aSmoke.z); vU = u; vN = normal;
          float rise = u * aSmoke.y, s = aSmoke.x * (0.55 + 2.6 * u);
          vec3 c = aPos + vec3(uWind.x * rise, rise, uWind.y * rise);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(c + position * s, 1.0);
        }`,
      fragmentShader: `
        uniform float uNight; varying float vU; varying vec3 vN;
        void main() {
          float light = 0.55 + 0.45 * max(dot(normalize(vN), normalize(vec3(0.4, 1.0, 0.3))), 0.0);
          vec3 c = vec3(0.075, 0.07, 0.066) * light * (1.0 - uNight * 0.35);
          c = mix(vec3(1.0, 0.28, 0.04) * (0.45 + uNight), c, smoothstep(0.0, 0.16, vU)); // lit by the flames at the base
          gl_FragColor = vec4(c, 0.66 * smoothstep(0.0, 0.05, vU) * (1.0 - smoothstep(0.5, 1.0, vU)));
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(instanced(new THREE.IcosahedronGeometry(1, 1), sm, 7, [['aPos', 3], ['aSmoke', 4]]), mat);
    mesh.frustumCulled = false; mesh.renderOrder = 3; group.add(mesh);
  }

  // ───────── plane in the sky ─────────
  const skyPlane = planeOf(2.2); skyPlane.visible = false; group.add(skyPlane);

  // ───────── the monster ─────────
  let monster = null;
  function summon() {
    if (monster) return;
    const g = new THREE.Group(), green = matte('#5c9e45'), dark = matte('#4a8a37'), belly = matte('#c9dd8a');
    const legs = [box(5, 12, 5, dark, -4, 6, 2.5), box(5, 12, 5, dark, 4, 6, -2.5)];
    g.add(...legs);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 12), green); torso.scale.set(1, 1.25, 0.8); torso.position.y = 20; g.add(torso);
    const bel = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), belly); bel.scale.set(0.7, 1.1, 0.5); bel.position.set(0, 18, 6.5); g.add(bel);
    const head = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 10), green); head.scale.set(1.3, 0.9, 1); head.position.set(0, 34, 5); g.add(head);
    const jaw = box(7, 2, 6, green, 0, 30.5, 7.5); g.add(jaw);
    for (let i = 0; i < 4; i++) g.add(box(0.8, 1.6, 0.8, matte('#ffffff'), -2.5 + i * 1.7, 32, 10.5));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), matte('#ffffff')); eye.position.set(2.5, 36, 9.5); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), matte('#1d2630')); pupil.position.set(2.8, 36, 10.4); g.add(pupil);
    for (let i = 0; i < 6; i++) g.add(box(1.2, 3, 2.2, matte('#3d7a2e'), 0, 24 + i * 2.4, -6 - i * 0.6));
    const tail = new THREE.Group(); for (let i = 0; i < 6; i++) tail.add(box(4 - i * 0.5, 4 - i * 0.5, 5, green, 0, 12 - i * 1.2, -10 - i * 4.5)); g.add(tail);
    const arms = [box(2, 7, 2, dark, -8, 20, 5), box(2, 7, 2, dark, 8, 20, 5)]; g.add(...arms);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    const roarEl = document.createElement('div'); roarEl.className = 'roar'; roarEl.textContent = t('monster.roar');
    const roar = new CSS2DObject(roarEl); roar.position.set(9, 42, 8); g.add(roar);
    g.position.set(-size * 0.55, 0, size * 0.1); g.rotation.y = Math.PI / 2;
    group.add(g);
    monster = { g, legs, tail, jaw, roarEl, t0: performance.now(), dur: 20000 };
  }

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
  let shake = 0;
  function step(dt, now, night, sec) {
    fireU.uTime.value = sec % 2400; fireU.uNight.value = night; // the shader works in float32: a small clock, not the epoch
    // people
    if (people) {
      walkers.forEach((w, i) => {
        w.s = (w.s + w.v * dt * w.dir + 1) % 1;
        const [a, b] = laneAB(w.ln), dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        const sx = (-dz / len) * w.side * L, sz = (dx / len) * w.side * L;
        _p.set(a[0] + dx * w.s + sx, Math.abs(Math.sin(w.s * len * 2.2)) * 0.12, a[1] + dz * w.s + sz);
        _q.setFromAxisAngle(_up, Math.atan2(-dz * w.dir, dx * w.dir) + Math.PI / 2);
        people.setMatrixAt(i, _m.compose(_p, _q, _s));
      });
      people.instanceMatrix.needsUpdate = true;
    }
    // the mayor's rallies: the arm waves, the crowd bobs, the confetti falls now and then
    for (const ra of rallies) {
      ra.arm.rotation.z = -0.55 - 0.45 * Math.sin(sec * 3.2 + ra.seed);
      ra.mayor.rotation.y = Math.sin(sec * 0.6 + ra.seed) * 0.35;
      ra.seats.forEach((p, j) => { _p.set(p.x, Math.abs(Math.sin(sec * 3 + p.ph)) * 0.1, p.z); _q.setFromAxisAngle(_up, p.ry); ra.crowd.setMatrixAt(j, _m.compose(_p, _q, _s)); });
      ra.crowd.instanceMatrix.needsUpdate = true;
      const cyc = (sec + ra.seed) % 16;
      ra.conf.visible = cyc < 6;
      if (ra.conf.visible) {
        const u = cyc / 6;
        ra.bits.forEach((bt, j) => { const uu = (u + bt.d) % 1; _p.set(bt.x + Math.sin(sec * 2 + bt.r) * 0.4, 6.4 - uu * 6, bt.z); _q.setFromAxisAngle(_up, bt.r + sec * 2); ra.conf.setMatrixAt(j, _m.compose(_p, _q, _s)); });
        ra.conf.instanceMatrix.needsUpdate = true;
      }
    }
    // boats: they vanish under the bridges
    for (const bt of boats) {
      bt.s = (bt.s + bt.v * dt * bt.dir + 1) % 1;
      const gx = bt.s * world.GW, t = world.getT(Math.floor(gx), bt.gy);
      bt.g.visible = t?.t === 'water';
      bt.g.position.set(wx(gx - 0.5), 0.1, wz(bt.gy)); bt.g.rotation.y = bt.dir > 0 ? 0 : Math.PI;
      bt.g.position.y = 0.1 + Math.sin(sec * 2 + bt.s * 30) * 0.08;
    }
    // planes: they take off every 26 s
    for (const f of flights) {
      const cyc = (sec + f.seed) % 26;
      if (cyc > 7.5) { f.g.visible = false; continue; }
      f.g.visible = true;
      let x, y = 1, s = 1, pitch = 0;
      if (cyc < 4) { const u = (cyc / 4) ** 2; x = f.x0 + (f.x1 - f.x0) * u; }
      else { const u = (cyc - 4) / 3.5; x = f.x1 + u * 140; y = 1 + u * u * 90; pitch = -0.35 * Math.min(1, u * 2); s = 1 + u * 0.3; }
      f.g.position.set(x, y, f.z); f.g.rotation.z = pitch; f.g.scale.setScalar(s);
    }
    // helicopter around the tallest building in view
    if (heliTarget) {
      const a = sec * 0.45, R = 46, cx = heliTarget.x + Math.cos(a) * R, cz = heliTarget.z + Math.sin(a) * R, cy = heliTarget.y + 30 + Math.sin(a * 2) * 3;
      heli.position.set(cx, cy, cz); heli.rotation.y = -a - Math.PI / 2; rotor.rotation.y += dt * 40;
      heli.visible = true;
      spotMat.opacity = 0.28 * night; spot.rotation.x = 0; spot.visible = night > 0.2;
      beacon.material = Math.sin(sec * 6) > 0 ? RED_LIGHT : DARK;
    } else heli.visible = false;
    // airship: goes around the region every 80 s, with the banner
    {
      const cyc = (sec + 15) / 80, u = cyc % 1, idx = Math.floor(cyc);
      if (idx !== blimpIdx) { blimpIdx = idx; bannerEl.textContent = blimpMsgs.length ? blimpMsgs[idx % blimpMsgs.length] : ''; bannerEl.hidden = !blimpMsgs.length; }
      const x = -size * 0.75 + u * size * 1.5, z = Math.sin(u * Math.PI * 2) * size * 0.35, y = 150 + Math.sin(sec * 0.8) * 2;
      const dz = Math.cos(u * Math.PI * 2) * size * 0.35 * Math.PI * 2, dx = size * 1.5;
      blimp.position.set(x, y, z); blimp.rotation.y = Math.atan2(-dz, dx);
    }
    // beacon and the elevator's cabin
    beamMat.opacity = 0.08 + 0.3 * night;
    for (const g of beams) g.rotation.y = sec * 1.4;
    for (const c of cabins) c.g.position.y = c.y0 + (0.5 - 0.5 * Math.cos(sec * 0.25 + c.seed)) * 420;
    // a plane crossing the sky every 47 s
    {
      const pc = sec % 47;
      skyPlane.visible = pc < 14;
      if (pc < 14) { const u = pc / 14; skyPlane.position.set(-size * 0.8 + u * size * 1.6, 260 + u * 60, -size * 0.3 + u * size * 0.2); skyPlane.rotation.y = -0.12; skyPlane.rotation.z = 0.08; }
    }
    // monster: crosses the region in 20 s, the screen shakes at every step
    shake = 0;
    if (monster) {
      const u = (now - monster.t0) / monster.dur;
      if (u >= 1) { group.remove(monster.g); monster.roarEl.remove(); const m = monster; monster = null; return { shake: 0, gone: m }; }
      const st = Math.sin(u * 64), roar = Math.sin(now / 260) > 0.65;
      monster.g.position.x = -size * 0.55 + u * size * 1.1; monster.g.position.y = Math.abs(st) * 1.2;
      monster.legs[0].rotation.x = st * 0.5; monster.legs[1].rotation.x = -st * 0.5;
      monster.tail.rotation.y = Math.sin(now / 300) * 0.25; monster.jaw.position.y = roar ? 28.5 : 30.5;
      monster.roarEl.hidden = !roar;
      shake = Math.abs(st) > 0.97 ? 1 : 0;
    }
    return { shake };
  }
  function setTarget(t) { heliTarget = t; }
  function dispose() { scene.remove(group); bannerEl.remove(); for (const l of labels) l.element.remove(); group.traverse((m) => { if (m.isMesh) m.geometry.dispose(); }); }
  return { group, step, setTarget, setBlimpMsgs, summon, dispose, get monster() { return !!monster; } };
}

// the airship's lines, all taken from the data
export function blimpLines(d, leader) {
  const all = d.cities.flatMap((c) => c.buildings.map((b) => ({ b, c })));
  const tallest = all.sort((p, q) => q.b.floors - p.b.floors)[0], cranesNow = d.cities.reduce((s, c) => s + c.building, 0);
  return [
    leader ? t('blimp.leader', { c: leader }) : t('blimp.newWeek'),
    tallest && t('blimp.tallest', { name: displayName(tallest.b).full, floors: floorsText(tallest.b.floors) }),
    t('blimp.find'),
    cranesNow ? plural(cranesNow, 'blimp.cranes') : t('blimp.paper'),
  ].filter(Boolean);
}
