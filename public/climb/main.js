// Token Climb 3D — prototype. Three.js + real people (Microsoft Rocketbox avatars, MIT, converted to
// GLB in ../models), posed with two-bone IK: hands and feet grab points on the rock, always within
// reach of the arm and the leg. Each climber has their own seed (hash of the id): rhythm, breathing,
// habits and the order of the moves are theirs, so nobody moves in sync.
// Linear scale (./scale.js): the hands sit on the token line, so the same token difference is the
// same distance anywhere on the wall. The 25 of the ranking show up, each in their own lane; the
// camera has levels (Top 5, Top 10, Top 25, whole wall), zoom and drag.
// Rock, sky and the light of each hour live in ./rock.js and ./environment.js (procedural).
// Every visible string comes from the dictionaries (public/i18n/<locale>/climb.js), through `tr`
// (the i18n `t`, renamed here because `t` is the time or the tag parts all over this file).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { zoneHour } from '../lib/sky.js';
import { t as tr, plural, fmt, config, displayName } from '../i18n/index.js';
import { buildRock, createCampLedges, baseGround, wallZ, frontZ, groundY, crest, edgeX, grassTime, rockUniforms } from './rock.js';
import { createEnvironment, lookAt } from './environment.js';
import { WALL_HEIGHT, FEET_DROP, BASE_LEDGE_Y, yLine, yLineFree, tokensAtY, tokensPerBody, gapY, stableSummit, bodiesText } from './scale.js';
import { createPlaques, fitToRock, plaqueGlow } from './plaques.js';
import { drawCard, CARD_W, CARD_H, HERO } from './card.js';

const MANIFEST_URL = 'models/climbers.json';
// Fallback when the manifest fails to load: one of the local Rocketbox people (MIT, shipped with the
// project). Every climber then wears it.
const FALLBACK_MODEL = { id: 'Male_Adult_12', file: 'models/rocketbox/Male_Adult_12.glb', sex: 'male' };
const SHOWN = 25; // climbers drawn (the top 25 the API sends)
const RANK_COLORS = ['#ffcf3a', '#dfe6ef', '#e0955f', '#b388ff', '#4cc9f0'];
const rankColor = (r) => RANK_COLORS[r - 1] ?? (r <= 10 ? '#7bd389' : '#9aa0ad');
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
// ?demo: the demo region (made-up data); the link to the city carries the mode along. This module is
// imported after initI18n(), when the document is already parsed.
if (PARAMS.has('demo')) for (const a of document.querySelectorAll('a[href="city.html"]')) a.href = 'city.html?demo';

const $ = (sel) => document.querySelector(sel);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (s) => (s < 0.5 ? 4 * s * s * s : 1 - (-2 * s + 2) ** 3 / 2);
const TAU = Math.PI * 2;
const UP = V(0, 1, 0);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Seeded draw (mulberry32): the same id always yields the same person, with the same habits.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const range = (rng, a, b) => a + (b - a) * rng();
function pickWeighted(rng, weights) {
  let sum = 0;
  for (const k in weights) sum += weights[k];
  let r = rng() * sum;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

// JSON fetch with a timeout: a hanging request must not stall the automatic refresh.
// A failure carries `info`, an API error object ({ code, status, retryAfter }, docs/contract.md) shown
// with t('error.' + code): the 502 body is that object; no answer at all is 'offline'.
const apiError = (info, msg = info.code) => Object.assign(new Error(msg), { info });
async function fetchJSON(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw apiError(data?.code ? data : { code: 'unknown', status: res.status });
    if (data === null) throw apiError({ code: 'unknown', status: res.status });
    return data;
  } catch (err) {
    if (err.info) throw err;
    throw apiError({ code: 'offline' }, err.name === 'AbortError' ? 'timed out' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Renderer, scene and camera ----------

const stage = $('#stage');
// Quality: ?quality=low (TV, kiosk, weak machine) turns the shadows off and lowers the resolution.
const LOW_Q = PARAMS.get('quality') === 'low';
const renderer = new THREE.WebGLRenderer({ antialias: !LOW_Q, preserveDrawingBuffer: DEBUG }); // debug: captures show the last frame
// Resolution: at most 1.25× (at 2× an integrated GPU does not get past ~10 frames/s) and it drops by itself
// if frames get slow (adaptResolution).
const DPR_MAX = Math.min(devicePixelRatio, LOW_Q ? 0.85 : 1.25);
let dpr = DPR_MAX;
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW_Q;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // the shadow map is only redrawn when needed (updateShadow)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
stage.appendChild(renderer.domElement);

const vignette = document.createElement('div');
vignette.className = 'vignette';
stage.appendChild(vignette);

// On top of the scene: token ruler (2D canvas), tags/plates (DOM) and the CSS2D balloons.
const rulerCv = $('#ruler');
const rctx = rulerCv.getContext('2d');
const marksEl = $('#marks');
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3' });
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe3f0, 70, 460);
// Narrow lens (telephoto, from farther away): the smaller the angle, the less perspective pulls off the
// ruler anyone who is higher or lower than the camera's eye or deeper in the rock.
const CAM_FOV = 22;
const camera = new THREE.PerspectiveCamera(CAM_FOV, innerWidth / innerHeight, 0.5, 20000);
camera.position.set(0, -6, 20);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  document.body.classList.toggle('compact', innerWidth < 640);
  for (const a of actors.values()) a.tagW = 0; // measure again
  measureUI();
  sizeRuler();
  setTimeout(measureUI, 150); // again once the layout has settled (the top sign depends on the width of the panels)
});
document.body.classList.toggle('compact', innerWidth < 640);

// ---------- Light and time (configured time zone) ----------

const sunLight = new THREE.DirectionalLight(0xfff1dd, 3);
sunLight.castShadow = !LOW_Q;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xbfdcff, 0x5a4636, 1);
scene.add(hemi);

// Uniforms shared by the climbers: rim light and a minimum of their own light at night.
const RIM = { uRimColor: { value: new THREE.Color() }, uSelfLit: { value: 0 } };
const NIGHT_RIM = new THREE.Color(0.21, 0.255, 0.36);
const lightDir = V(0, 1, 1).normalize();
let env = null;
let forcedHour = null; // debug: climb.hour(h)
let night = 0;

const glowMat = new THREE.SpriteMaterial({
  map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,245,215,1)');
    grad.addColorStop(0.25, 'rgba(255,230,170,0.45)');
    grad.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })(),
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  opacity: 0,
});
const lampMat = new THREE.MeshStandardMaterial({ color: '#3a3a40', emissive: '#fff1c4', emissiveIntensity: 0, roughness: 0.4 });

// Reflections of a neutral "studio" on the climbers only: without it skin and clothes (textured PBR)
// look flat. The intensity follows the time of day.
const climberMats = new Set();
let climberEnvI = 0.5;
let envTex = null;
function climberEnv() {
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    envTex = pm.fromScene(room, 0.04).texture;
    room.dispose?.();
    pm.dispose();
  }
  return envTex;
}

function updateTimeOfDay() {
  const h = forcedHour ?? zoneHour();
  const look = lookAt(h);
  night = look.night;
  env.apply(look);
  lightDir.copy(look.lightDir);
  sunLight.color.copy(look.key);
  sunLight.intensity = look.keyI;
  hemi.color.copy(look.hemiSky);
  hemi.groundColor.copy(look.hemiGround);
  hemi.intensity = look.hemiI;
  renderer.toneMappingExposure = look.exposure;
  scene.fog.color.copy(look.fog);
  rockUniforms.uLowFog.value.copy(look.sky[3]).lerp(look.seaLit, 0.5); // low fog in the horizon color (at twilight it does not turn orange)
  // at night: the warm daytime rim light goes away (no "ghost"), but a cool rim light stays, like moonlight, and
  // a bit of their own light: with the pale moonlit rock, moonlight alone left the body the color of the stone
  RIM.uRimColor.value.copy(look.rim).multiplyScalar(look.rimI * (1 - 0.35 * night)).add(NIGHT_RIM.clone().multiplyScalar(night));
  RIM.uSelfLit.value = 0.22 * night;
  climberEnvI = 0.5 * (1 - 0.82 * night);
  for (const m of climberMats) m.envMapIntensity = climberEnvI;
  lampMat.emissiveIntensity = 4 * smooth(0.3, 0.8, night);
  glowMat.opacity = smooth(0.3, 0.8, night); // full headlamp: against the moonlit wall it still has to look lit
  plaqueGlow.value = 0.04 + 0.21 * smooth(0.2, 0.85, night); // record plaques: readable at night, without glowing more than by day
  shadowKey.t = -Infinity; // new light: shadow redrawn
  $('#clock').textContent = `${night < 0.15 ? '☀️' : night < 0.6 ? '🌇' : '🌙'} ${fmt.clock(h)} ${tr('clock.in', { zone: fmt.zone })}`;
}

// ---------- Summit: flag ----------

const FLAG = { x: 3.4 };
let flagCloth = null;
function buildFlag() {
  FLAG.z = frontZ(FLAG.x) - 2.1;
  FLAG.y = groundY(FLAG.x, FLAG.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 }));
  pole.position.set(FLAG.x, FLAG.y + 1.2, FLAG.z);
  pole.castShadow = true;
  scene.add(pole);
  const geo = new THREE.PlaneGeometry(1.1, 0.65, 16, 6);
  geo.translate(0.55, 0, 0);
  flagCloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xef476f, side: THREE.DoubleSide, roughness: 0.8 }));
  flagCloth.position.set(FLAG.x + 0.03, FLAG.y + 2.15, FLAG.z);
  flagCloth.castShadow = true;
  flagCloth.userData.base = geo.attributes.position.array.slice();
  scene.add(flagCloth);
  FLAG.top = FLAG.y + 2.6;
}

function waveFlag(t) {
  const pos = flagCloth.geometry.attributes.position;
  const base = flagCloth.userData.base;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    pos.setZ(i, Math.sin(x * 5 - t * 6) * 0.08 * x);
  }
  pos.needsUpdate = true;
  flagCloth.geometry.computeVertexNormals();
}

// ---------- Skeleton: names, chains and two-bone IK ----------

// Canonical names (Mixamo without a prefix). Accepts mixamorig/mixamorig1:/mixamorig_, Biped (Bip01) and UE/CC.
const BONE_ALIASES = (() => {
  const m = {
    Bip01_Pelvis: 'Hips', Bip01_Spine: 'Spine', Bip01_Spine1: 'Spine1', Bip01_Spine2: 'Spine2', Bip01_Neck: 'Neck', Bip01_Head: 'Head', Bip01_HeadNub: 'HeadTop_End',
    pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  };
  for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) {
    const l = s.toLowerCase();
    Object.assign(m, {
      [`Bip01_${s}_Clavicle`]: `${S}Shoulder`, [`Bip01_${s}_UpperArm`]: `${S}Arm`, [`Bip01_${s}_Forearm`]: `${S}ForeArm`, [`Bip01_${s}_Hand`]: `${S}Hand`,
      [`Bip01_${s}_Thigh`]: `${S}UpLeg`, [`Bip01_${s}_Calf`]: `${S}Leg`, [`Bip01_${s}_Foot`]: `${S}Foot`, [`Bip01_${s}_Toe0`]: `${S}ToeBase`, [`Bip01_${s}_Toe0Nub`]: `${S}Toe_End`,
      [`clavicle_${l}`]: `${S}Shoulder`, [`upperarm_${l}`]: `${S}Arm`, [`lowerarm_${l}`]: `${S}ForeArm`, [`hand_${l}`]: `${S}Hand`,
      [`thigh_${l}`]: `${S}UpLeg`, [`calf_${l}`]: `${S}Leg`, [`foot_${l}`]: `${S}Foot`, [`ball_${l}`]: `${S}ToeBase`,
    });
  }
  return m;
})();
const canonBone = (name) => {
  const n = name.replace(/\s+/g, '_').replace(/^mixamorig\d*[:_]?/, '').replace(/^DEF-/, '');
  return BONE_ALIASES[n] ?? n;
};
const REQUIRED = ['Hips', 'Spine', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
// Bones whose matrices the pose reads mid-frame (the renderer updates the rest by itself).
const CORE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const SPINE = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
const LIMBS = {
  LH: ['LeftArm', 'LeftForeArm', 'LeftHand'],
  RH: ['RightArm', 'RightForeArm', 'RightHand'],
  LF: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'],
  RF: ['RightUpLeg', 'RightLeg', 'RightFoot'],
};
const LIMB_KEYS = ['LH', 'RH', 'LF', 'RF'];
const HANDS = ['LH', 'RH'];
const FEET = ['LF', 'RF'];
const HAND_SIDES = [['Left', 'LH'], ['Right', 'RH']];
const FOOT_SIDES = [['Left', 'LF'], ['Right', 'RF']];
const FINGER_CURL = [0.45, 0.75, 0.5];
const THUMB_CURL = [0.15, 0.3, 0.3];

// Scratch vectors and quaternions (nothing is allocated per frame).
const _p0 = V(), _p1 = V(), _p2 = V(), _sc = V(), _sc2 = V();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _s = V(), _u = V(), _pv = V(), _k = V();
const _m4 = new THREE.Matrix4();
const _on = V(), _ob = V();

// Updates a bone's matrix from its parent (the parent must already be up to date).
function refresh(o) {
  o.updateMatrix();
  if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  else o.matrixWorld.copy(o.matrix);
}

// Only the chain from the root to the CORE bones, in parent → child order.
function updateCore(a) {
  for (const o of a.core) refresh(o);
}

// Rotates `bone` (minimal rotation, in world space) so the child points at `target`.
function aimBone(bone, child, target) {
  _p0.setFromMatrixPosition(bone.matrixWorld);
  _p1.setFromMatrixPosition(child.matrixWorld).sub(_p0).normalize();
  _p2.copy(target).sub(_p0).normalize();
  _qa.setFromUnitVectors(_p1, _p2);
  bone.matrixWorld.decompose(_sc, _qb, _sc2);
  _qb.premultiply(_qa);
  bone.parent.matrixWorld.decompose(_sc, _qc, _sc2);
  bone.quaternion.copy(_qc.invert().multiply(_qb));
  refresh(bone);
  refresh(child);
}

// Analytic two-bone IK (lengths a and b measured at calibration); `pole` bends the elbow/knee.
function solveLimb(upper, lower, end, a, b, target, pole) {
  _s.setFromMatrixPosition(upper.matrixWorld);
  _u.copy(target).sub(_s);
  const d = clamp(_u.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  _u.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  _pv.copy(pole).sub(_s);
  _pv.addScaledVector(_u, -_pv.dot(_u)).normalize();
  _k.copy(_s).addScaledVector(_u, along).addScaledVector(_pv, h);
  aimBone(upper, lower, _k);
  refresh(end);
  _k.copy(_s).addScaledVector(_u, d);
  aimBone(lower, end, _k);
}

// Local basis (f, n) of a bone, measured at rest: returns the inverse rotation of the basis.
function localBasisInv(bone, fW, nW) {
  const qInv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const f = fW.clone().applyQuaternion(qInv).normalize();
  const n = nW.clone().applyQuaternion(qInv);
  n.addScaledVector(f, -n.dot(f)).normalize();
  const b = V().crossVectors(f, n);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, n, b)).invert();
}

// Orients a hand or foot: the local `f` axis goes to fW (fingers) and `n` to nW (palm/sole), blended by w.
function orientBone(bone, qLocalInv, fW, nW, w) {
  _on.copy(nW).addScaledVector(fW, -nW.dot(fW)).normalize();
  _ob.crossVectors(fW, _on);
  _m4.makeBasis(fW, _on, _ob);
  _qa.setFromRotationMatrix(_m4).multiply(qLocalInv);
  if (w < 1) {
    bone.matrixWorld.decompose(_sc, _qb, _sc2);
    _qa.copy(_qb.slerp(_qa, w));
  }
  bone.parent.matrixWorld.decompose(_sc, _qc, _sc2);
  bone.quaternion.copy(_qc.invert().multiply(_qa));
  refresh(bone);
}

// Rotation in the bone's own reference frame (axes measured at calibration): pitches, twists and bends sideways.
function bendBone(a, name, pitch, yaw, roll) {
  const b = a.bones[name];
  const ax = a.axes[name];
  if (!b || !ax) return;
  if (pitch) b.quaternion.multiply(_qa.setFromAxisAngle(ax.p, pitch));
  if (yaw) b.quaternion.multiply(_qa.setFromAxisAngle(ax.y, yaw));
  if (roll) b.quaternion.multiply(_qa.setFromAxisAngle(ax.r, roll));
}

// Raises both clavicles (axes measured at calibration).
function shrugShoulders(a, ang) {
  for (const L of ['Left', 'Right']) {
    const ax = a.shrugAx?.[L];
    if (ax) a.bones[`${L}Shoulder`].quaternion.multiply(_qa.setFromAxisAngle(ax, ang));
  }
}

function curlFingers(list, grip) {
  if (!list || grip <= 0) return;
  for (const f of list) {
    const ang = grip * (f.thumb ? THUMB_CURL : FINGER_CURL)[f.k];
    f.bone.quaternion.multiply(_qa.setFromAxisAngle(f.axis, ang));
  }
}

function resetBones(a) {
  for (const [bone, q] of a.rest) bone.quaternion.copy(q);
}

// ---------- Models (people) ----------

const loader = new GLTFLoader();
let models = []; // manifest entries (models/climbers.json)
const templates = []; // by model index: { promise, tpl, failed }
const modelOf = new Map(); // climber id → model index (fixed for the session)

// ---------- Body of each person ----------
// The server sends c.body: 'f', 'm' or the id of a manifest model ('body' field of
// nicknames.json; without it, inferred from the first name). Without a body, any body will do.
function sexOf(c) {
  if (c.body === 'f') return 'female';
  if (c.body === 'm') return 'male';
  return models.find((m) => m.id === c.body)?.sex ?? null;
}

async function loadManifest() {
  if (DEBUG && PARAMS.get('models') === 'fallback') return [FALLBACK_MODEL]; // tests the fallback path
  try {
    const man = await fetchJSON(MANIFEST_URL, 6000);
    const list = (man.models ?? []).filter((m) => m && m.file);
    if (!list.length) throw new Error('manifest without models');
    return list;
  } catch (err) {
    console.warn(`Climb 3D: no ${MANIFEST_URL} (${err.message}); using the fallback model.`);
    return [FALLBACK_MODEL];
  }
}

function requestTemplate(i) {
  let t = templates[i];
  if (t) return t;
  t = templates[i] = { tpl: null, failed: false, promise: null };
  t.promise = loader.loadAsync(models[i].file)
    .then((gltf) => { t.tpl = prepareTemplate(gltf, models[i]); })
    .catch((err) => {
      t.failed = true;
      console.warn(`Climb 3D: model ${models[i].id} failed:`, err);
      for (const [id, k] of modelOf) if (k === i) modelOf.delete(id);
      if (templates.every((x) => x?.failed) && !models.some((m) => m.id === FALLBACK_MODEL.id)) {
        models.push(FALLBACK_MODEL);
        requestTemplate(models.length - 1);
      } else if (templates.every((x) => x?.failed)) {
        showError(tr('error.models', { msg: err.message }));
      }
    })
    .finally(() => {
      if (state) applyState(simTime);
      maybeHideLoading();
    });
  return t;
}

// The model's material is kept (textures!): it only becomes PBR if it is not already, and gets the environment map and the
// rim light/own light, the same for any model.
const CLIMBER_RIM = `#include <emissivemap_fragment>
  float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += uRimColor * pow(rimF, 2.5) + diffuseColor.rgb * uSelfLit;
`;
function climberShader(sh) {
  Object.assign(sh.uniforms, RIM);
  sh.fragmentShader = `uniform vec3 uRimColor;\nuniform float uSelfLit;\n${sh.fragmentShader.replace('#include <emissivemap_fragment>', CLIMBER_RIM)}`;
}

function prepareMaterial(m) {
  let mat = m;
  if (!m.isMeshStandardMaterial) {
    mat = new THREE.MeshStandardMaterial({
      name: m.name, map: m.map ?? null, normalMap: m.normalMap ?? null, color: m.map ? 0xffffff : m.color,
      roughness: 0.78, metalness: 0, alphaTest: m.alphaTest, side: m.side,
    });
  }
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  if (!(mat.alphaTest > 0)) {
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;
  }
  mat.envMap = climberEnv();
  mat.envMapIntensity = climberEnvI;
  mat.onBeforeCompile = climberShader;
  mat.needsUpdate = true;
  climberMats.add(mat);
  return mat;
}

// Prepares the model once: checks the bones, turns it to face +Z, measures height and the parts of the
// body where the gear goes (top of the head, waist, thighs), already with the skin weights.
function prepareTemplate(gltf, entry) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const nodes = {};
  root.traverse((o) => {
    const k = canonBone(o.name);
    if (!nodes[k] || (o.isBone && !nodes[k].isBone)) nodes[k] = o;
  });
  const missing = REQUIRED.filter((n) => !nodes[n]?.isBone);
  if (missing.length) throw new Error(`model ${entry.id} lacks the bones ${missing.join(', ')}`);
  const P = (n) => nodes[n].getWorldPosition(V());

  // Front: from the toe tips (the average of the two cancels out a turned-out foot) or, without them, from the hip axis.
  const toe = (s) => nodes[`${s}Toe_End`] ?? nodes[`${s}ToeBase`];
  const fwd = V();
  if (toe('Left') && toe('Right')) fwd.copy(toe('Left').getWorldPosition(V())).sub(P('LeftFoot')).add(toe('Right').getWorldPosition(V()).sub(P('RightFoot')));
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) fwd.crossVectors(P('LeftUpLeg').sub(P('RightUpLeg')), UP);
  const yaw = Math.round(Math.atan2(fwd.x, fwd.z) / (Math.PI / 2)) * (Math.PI / 2);
  root.rotation.y = -yaw;
  root.updateMatrixWorld(true);

  const meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) throw new Error(`model ${entry.id} has no skinned mesh`);

  // Height from the mesh with the bones already applied; without it, from the bones (never NaN or 0).
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const m of meshes) {
    m.computeBoundingBox();
    box.union(tmp.copy(m.boundingBox).applyMatrix4(m.matrixWorld));
  }
  let h = box.max.y - box.min.y;
  let sole = box.min.y;
  if (!(h > 0.05) || !Number.isFinite(h)) {
    const top = nodes.HeadTop_End ? P('HeadTop_End').y : P('Head').y + 1.4 * (P('Head').y - P('Neck').y);
    sole = Math.min(...['LeftToe_End', 'LeftToeBase', 'LeftFoot', 'RightFoot'].filter((n) => nodes[n]).map((n) => P(n).y));
    h = top - sole;
  }
  const ok = Number.isFinite(h) && h > 0.05;
  const scale = ok && h > 1.4 && h < 2.2 ? 1 : ok ? 1.75 / h : 1;
  if (!ok) { h = 1.75; sole = 0; }

  // Materials (the same for all clones) and a clipping sphere that covers any pose.
  const swap = new Map();
  const center = P('Hips').setY(sole + h / 2);
  for (const m of meshes) {
    const conv = (mat) => {
      if (!swap.has(mat)) swap.set(mat, prepareMaterial(mat));
      return swap.get(mat);
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
    m.boundingSphere = new THREE.Sphere(center.clone().applyMatrix4(inv), (0.8 * h) / m.matrixWorld.getMaxScaleOnAxis());
  }

  const body = measureBody(meshes, nodes, h);
  // Hair: whatever would end up above the helmet rim disappears (never pokes through the shell); whatever hangs
  // below it (ponytail, nape, sides) stays.
  for (const m of meshes) {
    const mat = m.material;
    if (Array.isArray(mat) || !(mat.alphaTest > 0 || /hair/i.test(`${mat.name} ${m.name}`))) continue;
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
    const hm = body.helmet;
    const U = {
      uHelmC: { value: V(hm.cx, hm.cy, hm.cz).applyMatrix4(inv) },
      uHelmR: { value: V(hm.rx * 1.6, 1, hm.rz * 1.6).divideScalar(m.matrixWorld.getMaxScaleOnAxis()) },
      uHelmRim: { value: V(0, hm.rim + 0.008, 0).applyMatrix4(inv).y },
    };
    mat.onBeforeCompile = (sh) => hairShader(sh, U);
    mat.needsUpdate = true;
  }
  for (const m of meshes) for (const mat of [m.material].flat()) for (const t of [mat.map, mat.normalMap]) if (t) renderer.initTexture(t); // upload to the GPU now (no hitch on the 1st zoom)
  return { entry, root, scale, height: h * scale, sole, body };
}

// Hair with the helmet cutout (in the mesh's rest space: the same for all clones).
function hairShader(sh, U) {
  climberShader(sh);
  Object.assign(sh.uniforms, U);
  sh.vertexShader = `varying vec3 vHelm;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHelm = position;')}`;
  sh.fragmentShader = `uniform vec3 uHelmC;\nuniform vec3 uHelmR;\nuniform float uHelmRim;\nvarying vec3 vHelm;\n${sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  vec2 hq = (vHelm.xz - uHelmC.xz) / uHelmR.xz;
  if (vHelm.y > uHelmRim && dot(hq, hq) < 1.0) discard;`)}`;
}

// Body measurements for the gear and to keep from entering the rock, in model space (facing
// +Z, native scale), from the vertices of each bone (skin weights): skull (without the hair),
// chin, front of the face and chest, section of the waist and thighs.
function measureBody(meshes, nodes, h) {
  const P = (n) => nodes[n].getWorldPosition(V());
  const head = P('Head');
  const hips = P('Hips');
  const topY = nodes.HeadTop_End ? P('HeadTop_End').y : head.y + 1.4 * (head.y - P('Neck').y);
  const capY = head.y + 0.55 * (topY - head.y);
  const beltY = hips.y + 0.04 * h;
  const chestY = nodes.Spine2 ? P('Spine2').y : head.y - 0.35;
  const cap = new THREE.Box3();
  const belt = new THREE.Box3();
  // torso section just below the armpits (top of the yellow jersey)
  const vestY = chestY + 0.02;
  const vestTop = new THREE.Box3();
  let chinY = Infinity;
  let chinZ = head.z + 0.08;
  let faceZ = head.z + 0.09;
  let chestZ = -Infinity;
  const thigh = {};
  for (const s of ['Left', 'Right']) {
    const base = P(`${s}UpLeg`);
    const dir = P(`${s}Leg`).sub(base).normalize();
    const p1 = V(1, 0, 0).addScaledVector(dir, -dir.x).normalize();
    const p2 = V().crossVectors(dir, p1);
    thigh[s] = { base, dir, p1, p2, a0: Infinity, a1: -Infinity, b0: Infinity, b1: -Infinity };
  }
  const v = V();
  const d = V();
  for (const m of meshes) {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const hair = mat?.alphaTest > 0 || /hair/i.test(`${mat?.name} ${m.name}`);
    const bones = m.skeleton.bones;
    const idx = (n) => (nodes[n] ? bones.indexOf(nodes[n]) : -2);
    const iHead = idx('Head');
    const torso = new Set([idx('Hips'), idx('Spine'), idx('LeftUpLeg'), idx('RightUpLeg')]);
    const chest = new Set([idx('Spine1'), idx('Spine2')]);
    const iL = idx('LeftUpLeg');
    const iR = idx('RightUpLeg');
    const { position, skinIndex, skinWeight } = m.geometry.attributes;
    if (!skinIndex || !skinWeight) continue;
    for (let i = 0; i < position.count; i++) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      let wh = 0;
      let wt = 0;
      let wc = 0;
      let wl = 0;
      let wr = 0;
      for (let k = 0; k < 4; k++) {
        const b = skinIndex.getComponent(i, k);
        const w = skinWeight.getComponent(i, k);
        if (b === iHead) wh += w;
        if (torso.has(b)) wt += w;
        if (chest.has(b)) wc += w;
        if (b === iL) wl += w;
        if (b === iR) wr += w;
      }
      if (hair) continue; // the skull and face without the hair (the helmet sits on the skull)
      if (wh > 0.5) {
        if (v.y > capY) cap.expandByPoint(v);
        if (v.z > head.z + 0.03 && v.y < chinY) { chinY = v.y; chinZ = v.z; }
        faceZ = Math.max(faceZ, v.z);
      }
      if (wc > 0.5 && Math.abs(v.y - chestY) < 0.12) chestZ = Math.max(chestZ, v.z);
      if (wt > 0.5 && Math.abs(v.y - beltY) < 0.03) belt.expandByPoint(v);
      if (wc + wt > 0.6 && Math.abs(v.y - vestY) < 0.025) vestTop.expandByPoint(v);
      // thigh: the mesh is light (few vertices per slice), so it measures a longer band of the thigh
      for (const [w, T] of [[wl, thigh.Left], [wr, thigh.Right]]) {
        if (w <= 0.3) continue;
        d.copy(v).sub(T.base);
        const ax = d.dot(T.dir);
        if (ax < 0.1 || ax > 0.26) continue;
        const a = d.dot(T.p1);
        const b = d.dot(T.p2);
        T.a0 = Math.min(T.a0, a); T.a1 = Math.max(T.a1, a);
        T.b0 = Math.min(T.b0, b); T.b1 = Math.max(T.b1, b);
      }
    }
  }
  const out = {};
  out.cap = cap.isEmpty()
    ? { cx: head.x, cz: head.z, top: topY, hx: 0.08, hz: 0.1 }
    : { cx: (cap.min.x + cap.max.x) / 2, cz: (cap.min.z + cap.max.z) / 2, top: cap.max.y, hx: (cap.max.x - cap.min.x) / 2, hz: (cap.max.z - cap.min.z) / 2 };
  // Climbing helmet: shell ~2 cm outside the skull, slightly longer than wide, rim at the
  // forehead (above the eyes), no brim.
  const c = out.cap;
  // voluminous hair that is part of the head mesh (afro) stays inside the shell, with less
  // clearance (hair compresses); the rest gets ~2 cm of shell outside the skull
  const shell = c.hx > 0.1 ? 0.01 : 0.02;
  const rx = c.hx + shell;
  const rz = Math.min(c.hz + shell, 1.25 * rx);
  const ry = 1.04 * Math.min(rx, rz);
  const eyeY = nodes.LeftEye ? P('LeftEye').y : head.y + 0.45 * (c.top - head.y);
  let cy = c.top + 0.02 - ry;
  const rimOf = (y) => y - 0.187 * ry; // the cap goes down 0.56·π: the rim sits ~19% of the radius below the center
  if (rimOf(cy) < eyeY + 0.045) cy = eyeY + 0.045 + 0.187 * ry;
  out.helmet = { cx: c.cx, cy, cz: c.cz - 0.005, rx, ry, rz, rim: rimOf(cy) };
  out.chin = { y: Number.isFinite(chinY) ? chinY : head.y - 0.02, z: chinZ };
  out.face = faceZ - head.z; // front of the face (nose) ahead of the head bone
  out.chest = Number.isFinite(chestZ) && nodes.Spine2 ? chestZ - P('Spine2').z : 0.14;
  const hipW = P('LeftUpLeg').distanceTo(P('RightUpLeg'));
  out.belt = belt.isEmpty() || belt.max.x - belt.min.x < 0.1
    ? { cx: hips.x, cy: beltY, cz: hips.z, rx: 0.9 * hipW, rz: 0.65 * hipW }
    : { cx: (belt.min.x + belt.max.x) / 2, cy: beltY, cz: (belt.min.z + belt.max.z) / 2, rx: (belt.max.x - belt.min.x) / 2, rz: (belt.max.z - belt.min.z) / 2 };
  // yellow jersey: from the waist (belt section) up to the torso section just below the armpits
  out.vest = {
    y0: beltY - 0.035,
    y1: vestY,
    top: vestTop.isEmpty() || vestTop.max.x - vestTop.min.x < 0.12
      ? { cx: out.belt.cx, cz: out.belt.cz + 0.01, rx: out.belt.rx * 1.05, rz: out.belt.rz * 1.1 }
      : { cx: (vestTop.min.x + vestTop.max.x) / 2, cz: (vestTop.min.z + vestTop.max.z) / 2, rx: (vestTop.max.x - vestTop.min.x) / 2, rz: (vestTop.max.z - vestTop.min.z) / 2 },
  };
  out.thigh = {};
  for (const s of ['Left', 'Right']) {
    const T = thigh[s];
    const ok = T.a1 - T.a0 > 0.05 && T.b1 - T.b0 > 0.05;
    const pos = T.base.clone().addScaledVector(T.dir, 0.165); // leg loop 2–3 cm below the groin
    if (ok) pos.addScaledVector(T.p1, (T.a0 + T.a1) / 2).addScaledVector(T.p2, (T.b0 + T.b1) / 2);
    out.thigh[s] = { pos, dir: T.dir, p1: T.p1, p2: T.p2, ra: ok ? (T.a1 - T.a0) / 2 : 0.08, rb: ok ? (T.b1 - T.b0) / 2 : 0.08 };
  }
  return out;
}

// Person of each climber: the model requested in the "body" field of nicknames.json, if present; otherwise only
// bodies of the same sex (sexOf), in order of preference by the hash of the id (the same person gets the
// same face) and, if the ranking neighbor already uses that body, takes the next one. Fixed for the session.
function pickModel(c, list) {
  if (modelOf.has(c.id)) return modelOf.get(c.id);
  let usable = models.map((m, i) => i).filter((i) => !templates[i]?.failed);
  if (!usable.length) return -1;
  const chosen = usable.find((i) => models[i].id === c.body);
  if (chosen !== undefined) {
    modelOf.set(c.id, chosen);
    return chosen;
  }
  const sex = sexOf(c);
  const same = sex ? usable.filter((i) => models[i].sex === sex) : [];
  if (same.length) usable = same;
  usable.sort((i, j) => hash(`${c.id}|${models[i].id}`) - hash(`${c.id}|${models[j].id}`));
  const avoid = new Set();
  for (const o of list) if (Math.abs(o.rank - c.rank) === 1 && modelOf.has(o.id)) avoid.add(modelOf.get(o.id));
  const pick = usable.find((i) => !avoid.has(i)) ?? usable[0];
  modelOf.set(c.id, pick);
  return pick;
}

// ---------- Gear (attached to the bones, measured on each body) ----------

const gearGeo = {
  dome: new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI * 0.56),
  shellBand: new THREE.CylinderGeometry(1, 1, 1, 32, 1, true),
  strap: new THREE.TorusGeometry(1, 0.012, 4, 20, Math.PI),
  lamp: new THREE.CylinderGeometry(0.022, 0.026, 0.028, 12),
  band: new THREE.CylinderGeometry(1, 1, 1, 32, 1, true),
  buckle: new THREE.BoxGeometry(0.055, 0.04, 0.014),
  bag: new THREE.CylinderGeometry(0.047, 0.054, 0.085, 14),
  bagTop: new THREE.CylinderGeometry(0.02, 0.047, 0.024, 14),
  ring: new THREE.TorusGeometry(0.022, 0.006, 6, 14),
};
const metalMat = new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 0.8, roughness: 0.35 });
const vestMat = new THREE.MeshStandardMaterial({ color: '#ffd21a', roughness: 0.62, side: THREE.DoubleSide });
const cordMat = new THREE.MeshStandardMaterial({ color: '#2b2a2c', roughness: 0.9 });
// Materials per ranking color (shared; switching rankings only swaps the reference).
const gearMats = new Map();
function gearMatsFor(color) {
  let m = gearMats.get(color);
  if (!m) {
    const c = new THREE.Color(color);
    m = {
      helmet: new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.02, side: THREE.DoubleSide }), // inside too (seen from below)
      // cloth pouch: the ranking color, more muted, with no shine
      bag: new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#6e6a64'), 0.45), roughness: 0.97 }),
      webbing: new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.42), roughness: 0.8, side: THREE.DoubleSide }),
    };
    gearMats.set(color, m);
  }
  return m;
}

// Climbing helmet with headlamp (shell over the skull, darker band and chin strap), harness
// at the waist, leg loops on the real section of each thigh, chalk bag resting at the back left
// and the point where the rope ties in (at the front). Built at rest (facing forward, root at the origin);
// `attach` keeps the world position.
function addGear(a, sc) {
  const B = a.tpl.body;
  const mats = gearMatsFor('#9aa0ad');
  a.paint = { helmet: [], bag: [], webbing: [] };
  // `small`: small piece, hidden when the climber gets small on screen (LOD)
  const mesh = (geo, mat, kind, setup, small = false) => {
    const m = new THREE.Mesh(geo, mat);
    if (kind) a.paint[kind].push(m);
    m.userData.small = small;
    setup?.(m);
    return m;
  };
  const at = (bone, x, y, z, ...children) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (children.length) g.add(...children);
    a.bones[bone].attach(g);
    return g;
  };

  const hm = B.helmet;
  const [rx, ry, rz] = [hm.rx * sc, hm.ry * sc, hm.rz * sc];
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(0.22);
  glow.position.set(0, ry * 0.36, rz + 0.035);
  // chin strap: half ellipse from the rim (at the sides) down to under the chin
  const drop = Math.max(0.08, (hm.rim - B.chin.y) * sc + 0.012);
  const fwd = (B.chin.z - hm.cz) * sc;
  const strapLen = Math.hypot(drop, fwd);
  const strap = new THREE.Group();
  strap.position.y = (hm.rim - hm.cy) * sc + 0.01;
  strap.rotation.x = -Math.atan2(fwd, drop);
  strap.add(mesh(gearGeo.strap, cordMat, null, (m) => { m.rotation.z = Math.PI; m.scale.set(rx * 0.93, strapLen, 1); }, true));
  const helmet = at('Head', hm.cx * sc, hm.cy * sc, hm.cz * sc,
    mesh(gearGeo.dome, mats.helmet, 'helmet', (m) => { m.scale.set(rx, ry, rz); m.castShadow = true; }),
    mesh(gearGeo.shellBand, mats.webbing, 'webbing', (m) => { m.scale.set(rx * 1.004, 0.016, rz * 1.004); m.position.y = -0.12 * ry; }, true),
    mesh(gearGeo.lamp, lampMat, null, (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, ry * 0.36, rz * 0.94); }, true),
    strap, glow);
  a.helmet = helmet;
  a.helmetR = Math.max(rx, rz);
  a.headTop = hm.cy * sc + ry - a.bones.Head.getWorldPosition(V()).y;
  a.glow = glow; // headlamp lit only at night (by day it is not even drawn)
  // points on the face and chest that the rock must not cut through (in the bone's reference frame, via attach)
  a.chinPt = at('Head', 0, B.chin.y * sc + 0.01, B.chin.z * sc);
  a.facePt = at('Head', hm.cx * sc, (B.chin.y + 0.4 * (hm.rim - B.chin.y)) * sc, a.bones.Head.getWorldPosition(V()).z + B.face * sc);
  if (a.bones.Spine2) a.chestPt = at('Spine2', 0, a.bones.Spine2.getWorldPosition(V()).y, a.bones.Spine2.getWorldPosition(V()).z + B.chest * sc);

  const bt = B.belt;
  const bx = bt.rx * sc + 0.012;
  const bz = bt.rz * sc + 0.012;
  const [cx, by, cz] = [bt.cx * sc, bt.cy * sc, bt.cz * sc];
  const left = a.calib.front.side; // the character's left side in x, facing forward
  at('Hips', cx, by, cz,
    mesh(gearGeo.band, mats.webbing, 'webbing', (m) => { m.scale.set(bx, 0.045, bz); m.castShadow = true; }),
    mesh(gearGeo.buckle, metalMat, null, (m) => { m.position.z = bz + 0.004; }, true),
    mesh(gearGeo.ring, metalMat, null, (m) => { m.position.set(0, -0.045, bz + 0.012); }, true));
  a.tieIn = at('Hips', cx, by - 0.05, cz + bz + 0.025);
  // bag resting against the harness, at the back left: on the belt ellipse at that x
  const bagX = 0.5 * bx;
  const backZ = bz * Math.sqrt(1 - (bagX / bx) ** 2);
  a.bag = at('Hips', cx + left * bagX, by - 0.03, cz - backZ - 0.047,
    mesh(gearGeo.bag, mats.bag, 'bag', (m) => { m.castShadow = true; }, true),
    mesh(gearGeo.bagTop, mats.bag, 'bag', (m) => { m.position.y = 0.054; }, true),
    mesh(gearGeo.ring, cordMat, null, (m) => { m.rotation.x = Math.PI / 2; m.position.y = 0.068; m.scale.setScalar(0.85); }, true));
  // leg loops: ellipse of the (measured) thigh section, slightly loose, attached to the thigh bone
  for (const s of ['Left', 'Right']) {
    const T = B.thigh[s];
    const loop = mesh(gearGeo.band, mats.webbing, 'webbing', (m) => {
      m.scale.set(T.ra * sc + 0.007, 0.035, T.rb * sc + 0.007);
      m.quaternion.setFromRotationMatrix(_m4.makeBasis(T.p1, T.dir, _p0.copy(T.p2).negate())); // right-handed basis: p1 × dir = −p2
    }, true);
    at(`${s}UpLeg`, T.pos.x * sc, T.pos.y * sc, T.pos.z * sc, loop);
  }
  // yellow jersey (week leader): vest from the waist to the armpits, on the measured torso section, with
  // ~2 cm of slack at the chest (the torso bends a little inside it) and snug at the waist, under the
  // harness. Built already at rest and hidden until someone wears it (applyState).
  const vestGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
  const vp = vestGeo.attributes.position;
  for (let i = 0; i < vp.count; i++) {
    const up = vp.getY(i) > 0;
    const e = up ? B.vest.top : bt;
    const m = up ? 0.022 : 0.007;
    vp.setXYZ(i, e.cx * sc + vp.getX(i) * (e.rx * sc + m), (up ? B.vest.y1 : B.vest.y0) * sc, e.cz * sc + vp.getZ(i) * (e.rz * sc + m));
  }
  vestGeo.computeVertexNormals();
  a.vestGeo = vestGeo; // belongs to this person only: removeActor frees it
  a.vest = at(a.bones.Spine1 ? 'Spine1' : 'Spine', 0, 0, 0, mesh(vestGeo, vestMat, null, (m) => { m.castShadow = true; }));
  a.vest.visible = false;
  // LOD: what casts shadows and the small pieces (switched on/off according to the size on screen)
  a.casters = [];
  a.small = [];
  a.root.traverse((o) => {
    if (o.isMesh && o.castShadow) a.casters.push(o);
    if (o.userData.small) a.small.push(o);
  });
  a.casting = true;
  a.smallOn = true;
}

function paintActor(a, color) {
  const m = gearMatsFor(color);
  for (const kind of ['helmet', 'bag', 'webbing']) for (const mesh of a.paint[kind]) mesh.material = m[kind];
  if (a.ropeSlot >= 0) {
    const c = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.1);
    for (let i = 0; i < ROPE_SEGS; i++) ropeMesh.setColorAt(a.ropeSlot * ROPE_SEGS + i, c);
    ropeMesh.instanceColor.needsUpdate = true;
  }
}

// ---------- Rope (all the ropes in one instanced mesh) ----------

const ROPE_DROP = [0.45, 1.3, 2.6, 4.5, 7, 10.5, 15, 20.5, 27, 35];
const ROPE_SEGS = ROPE_DROP.length + 1; // + stretch up to the anchor (sleeping)
const ROPE_MAX = 40;
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const ropeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), new THREE.MeshStandardMaterial({ roughness: 0.85 }), ROPE_MAX * ROPE_SEGS);
ropeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ropeMesh.castShadow = true;
ropeMesh.frustumCulled = false;
for (let i = 0; i < ropeMesh.count; i++) {
  ropeMesh.setMatrixAt(i, ZERO_M);
  ropeMesh.setColorAt(i, new THREE.Color('#ffffff'));
}
scene.add(ropeMesh);
const ropeFree = Array.from({ length: ROPE_MAX }, (_, i) => ROPE_MAX - 1 - i);
const _r0 = V(), _r1 = V(), _r2 = V(), _rm = V(), _rd = V(), _rs = V();
const _rq = new THREE.Quaternion();
const _rmat = new THREE.Matrix4();

function placeRopeSeg(i, p, q) {
  _rm.addVectors(p, q).multiplyScalar(0.5);
  _rd.subVectors(q, p);
  const len = _rd.length();
  _rq.setFromUnitVectors(UP, _rd.divideScalar(len || 1));
  _rmat.compose(_rm, _rq, _rs.set(1, len, 1));
  ropeMesh.setMatrixAt(i, _rmat);
}

function hideRope(a) {
  if (a.ropeSlot < 0) return;
  for (let i = 0; i < ROPE_SEGS; i++) ropeMesh.setMatrixAt(a.ropeSlot * ROPE_SEGS + i, ZERO_M);
}

// Rope: leaves the harness and runs down hugging the rock; when sleeping (or rappelling), it also goes up to the
// anchor. Just below the climber it moves to the seam beside the lane (half a lane to the side),
// so it does not pass over whoever is lower down in the same lane. At the summit and when sitting at
// base camp there is no rope.
function updateRope(a, mode) {
  if (a.ropeSlot < 0) return;
  const base = a.ropeSlot * ROPE_SEGS;
  if (mode === 'summit' || mode === 'camp') {
    hideRope(a);
    return;
  }
  const start = _r0.copy(a.tieIn.position).applyMatrix4(a.bones.Hips.matrixWorld);
  _r1.copy(start);
  const floor = BASE_LEDGE_Y + 0.05; // the rope ends at the base camp floor
  const side = (hash(a.id) & 1 ? 1 : -1) * 0.48 * LANE.w;
  for (let i = 0; i < ROPE_DROP.length; i++) {
    if (_r1.y <= floor + 0.01) { ropeMesh.setMatrixAt(base + i, ZERO_M); continue; }
    const x = start.x + side * smooth(0, 3, i) + 0.02 * i;
    const y = Math.max(floor, start.y - ROPE_DROP[i]);
    _r2.set(x, y, Math.max(start.z - 0.05 * (i + 1), wallZ(x, y) + 0.12));
    placeRopeSeg(base + i, _r1, _r2);
    _r1.copy(_r2);
  }
  if (mode === 'sleep') placeRopeSeg(base + ROPE_DROP.length, start, _r2.copy(start).add(_r1.set(0, 2.3, -0.45)));
  else if (mode === 'wall' && a.restW > 0.3) { // sitting in the harness: the rope goes up to the seam above (the hand on it)
    const top = start.y + 2.3;
    placeRopeSeg(base + ROPE_DROP.length, start, _r2.set(start.x, top, wallZ(start.x, top) + 0.12));
  } else if (mode === 'rappel') { // rappel: the rope goes up taut to an anchor well above, on the rock
    const top = start.y + 7;
    placeRopeSeg(base + ROPE_DROP.length, start, _r2.set(start.x, top, wallZ(start.x, top) + 0.12));
  } else ropeMesh.setMatrixAt(base + ROPE_DROP.length, ZERO_M);
}

// ---------- Chalk dust (fixed pool, reused) ----------
// A few grains loosen from the fingers when the hand leaves the bag: they fall slowly, swaying like snow,
// without growing. The on-screen size stays at ~1–2 px at any zoom (grainR, updated per frame).

const GRAIN_N = 48;
const grainGeo = new THREE.SphereGeometry(1, 5, 3);
const grainR = { value: 0.02 };
const grains = Array.from({ length: GRAIN_N }, () => {
  const m = new THREE.Mesh(grainGeo, new THREE.MeshBasicMaterial({ color: 0xf3eee4, transparent: true, opacity: 0, depthWrite: false }));
  m.visible = false;
  m.userData = { v: V(), life: 2, age: 0, fall: 0.3, sway: 0.06, phase: 0, s: 1 };
  scene.add(m);
  return m;
});
let grainNext = 0;
function emitGrain(p) {
  const m = grains[grainNext++ % GRAIN_N];
  const u = m.userData;
  m.position.set(p.x + (Math.random() - 0.5) * 0.06, p.y - Math.random() * 0.04, p.z + 0.02);
  u.v.set((Math.random() - 0.5) * 0.08, -0.04 - Math.random() * 0.06, 0.03 + Math.random() * 0.05);
  u.fall = 0.22 + Math.random() * 0.16;
  u.sway = 0.04 + Math.random() * 0.06;
  u.phase = Math.random() * TAU;
  u.s = 0.7 + Math.random() * 0.6;
  u.life = 1.8 + Math.random() * 0.8;
  u.age = 0;
  m.visible = true;
}
function updateParticles(dt) {
  const ease = Math.min(1, dt * 2);
  for (const p of grains) {
    if (!p.visible) continue;
    const u = p.userData;
    u.age += dt;
    u.v.y += (-u.fall - u.v.y) * ease; // reaches the falling speed and stays at it
    u.v.z *= 1 - ease * 0.5;
    p.position.addScaledVector(u.v, dt);
    p.position.x += Math.sin(u.age * 2.4 + u.phase) * u.sway * dt;
    p.position.z = Math.max(p.position.z, wallZ(p.position.x, p.position.y) + 0.03);
    p.scale.setScalar(grainR.value * u.s);
    p.material.opacity = 0.55 * smooth(0, 0.12, u.age) * (1 - smooth(u.life * 0.55, u.life, u.age));
    if (u.age >= u.life) p.visible = false;
  }
}

// ---------- Chalk trail (of the last hour) ----------
// Dashed ribbon stuck to the rock, below each climber of the stage: it starts where the feet were
// 60 min ago (today's tokens up to then) and ends at the feet now. The part above the feet is cut in
// the shader (uTop), so the trail grows along with the animated climb. Width and dash follow the
// zoom (frame): they stay at ~2.3 px and ~18 px on screen at any level.
const trailW = { value: 0.06 };
const trailDash = { value: 0.3 };
const TRAIL_COLOR = new THREE.Color('#f3eee4');
function makeTrail() {
  const mat = new THREE.MeshBasicMaterial({
    color: TRAIL_COLOR.clone(), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const top = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTrailW: trailW, uDash: trailDash, uTop: top });
    sh.vertexShader = `attribute vec2 aOff;\nattribute float aAlong;\nuniform float uTrailW;\nvarying float vAlong;\nvarying float vY;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.xy += aOff * uTrailW;\n  vAlong = aAlong;\n  vY = position.y;')}`;
    sh.fragmentShader = `uniform float uDash;\nuniform float uTop;\nvarying float vAlong;\nvarying float vY;\n${sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vY > uTop || fract(vAlong / uDash) > 0.55) discard;')}`;
  };
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.visible = false;
  mesh.renderOrder = 1;
  mesh.userData = { top, key: '' };
  scene.add(mesh);
  return mesh;
}

// Trail geometry: ribbon vertical in x, from the feet of 60 min ago (y0) to the feet now (y1), on the
// rock surface, with a horizontal tick at the start (the "1 h ago" mark).
function buildTrail(mesh, x, y0, y1) {
  const key = `${x.toFixed(2)}|${y0.toFixed(3)}|${y1.toFixed(3)}`;
  if (mesh.userData.key === key) return;
  mesh.userData.key = key;
  const n = Math.max(2, Math.ceil((y1 - y0) / 0.15) + 1);
  const pos = [];
  const off = [];
  const along = [];
  const idx = [];
  const zAt = (y) => Math.max(wallZ(x, y), wallZ(x, y + 0.12), wallZ(x, y - 0.12)) + 0.035;
  let s = 0;
  let py = y0;
  let pz = zAt(y0);
  for (let i = 0; i < n; i++) {
    const y = lerp(y0, y1, i / (n - 1));
    const z = zAt(y);
    s += Math.hypot(y - py, z - pz);
    py = y;
    pz = z;
    pos.push(x, y, z, x, y, z);
    off.push(-0.5, 0, 0.5, 0);
    along.push(s, s);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  const b = pos.length / 3;
  const z0 = zAt(y0) + 0.004;
  for (const [ox, oy] of [[-2.5, -0.6], [2.5, -0.6], [-2.5, 0.6], [2.5, 0.6]]) {
    pos.push(x, y0, z0);
    off.push(ox, oy);
    along.push(0);
  }
  idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 2));
  geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 1;
  mesh.geometry.dispose();
  mesh.geometry = geo;
}

// ---------- Climbers ----------

const actors = new Map();
const bottleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10);
const bottleMat = new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.3 });
const HIP_OUT = 0.28; // hip away from the rock (was 0.40: the arms could not reach)
const HAND_OFF = 0.075; // wrist to the rock surface
// Hip depth: kept away from the most protruding part of the rock behind the torso.
const bodyZ = (x, y) => Math.max(wallZ(x, y), wallZ(x, y + 0.5) - 0.06, wallZ(x, y - 0.45) - 0.06);

// Directions of each orientation: where the body faces and "behind" it.
const FACE = {
  wall: { fwd: V(0, 0, -1), behind: V(0, 0, 1), toe: V(0, -0.45, -1).normalize(), sole: V(0, -1, 0.45).normalize() },
  front: { fwd: V(0, 0, 1), behind: V(0, 0, -1), toe: V(0, 0, 1), sole: V(0, -1, 0) },
};

// Habits of each person, drawn with the seed of the id.
function personality(a) {
  const r = a.rng;
  a.tempo = range(r, 0.55, 0.9); // s per limb move
  a.pushSpeed = range(r, 0.2, 0.35); // m/s of the hip in the pushes
  a.stepLen = range(r, 0.32, 0.48); // how far the hip rises per push
  a.pauseK = range(r, 0.7, 1.3);
  a.doubleFoot = range(r, 0.15, 0.5);
  a.kReach = range(r, 0.93, 0.97);
  a.kFoot = range(r, 0.86, 0.92);
  // Still on the wall: one hand high with the arm almost straight (it marks the token line),
  // the other a bit lower; legs almost straight, feet ~0.8 below the hip. Only a few
  // stand with their legs spread and bent ("frog").
  a.frog = r() < 0.22;
  const hi = r() < 0.5 ? 'LH' : 'RH';
  const step = r() < 0.5 ? 'LF' : 'RF';
  const footK = (high) => (high ? (a.frog ? range(r, 0.66, 0.74) : range(r, 0.84, 0.9)) : range(r, 0.91, 0.95));
  a.restK = {
    LH: hi === 'LH' ? range(r, 0.955, 0.975) : range(r, 0.86, 0.93),
    RH: hi === 'RH' ? range(r, 0.955, 0.975) : range(r, 0.86, 0.93),
    LF: footK(step === 'LF'),
    RF: footK(step === 'RF'),
  };
  const footLat = () => (a.frog ? range(r, 0.15, 0.24) : range(r, 0.05, 0.14));
  a.lat = {
    LH: hi === 'LH' ? range(r, 0.02, 0.07) : range(r, 0.07, 0.17),
    RH: hi === 'RH' ? range(r, 0.02, 0.07) : range(r, 0.07, 0.17),
    LF: footLat(),
    RF: footLat(),
  };
  a.hiHand = hi;
  a.lean = range(r, 0.08, 0.15);
  a.shrug = range(r, 0.22, 0.32); // clavicles raised on the wall: the shoulder goes up and the arm reaches farther
  a.breath = { f: range(r, 0.22, 0.33), ph: r() * TAU, A: range(r, 0.025, 0.04) };
  a.sway = { f1: range(r, 0.12, 0.25), f2: range(r, 0.05, 0.11), f3: range(r, 0.15, 0.3), p1: r() * TAU, p2: r() * TAU, p3: r() * TAU };
  a.gaze = { f1: range(r, 0.05, 0.11), f2: range(r, 0.13, 0.21), p1: r() * TAU, p2: r() * TAU, up: range(r, 0.05, 0.3) };
  a.idleW = { shake: range(r, 0.3, 1.6), chalk: range(r, 0.3, 1.6), drink: range(r, 0.2, 1.2), look: range(r, 0.3, 1.6), wipe: range(r, 0.2, 1.2), regrip: range(r, 0.4, 1.6), shift: range(r, 0.3, 1.2) };
  a.idleDurK = range(r, 0.8, 1.3);
  a.idleGap = range(r, 4, 10);
  a.shakeF = range(r, 6, 9);
  a.sleepP = { f: range(r, 0.08, 0.14), ph: r() * TAU, out: range(r, 0.55, 0.75), head: range(r, 0.45, 0.8), yaw: range(r, -0.3, 0.3) };
  a.celebW = { cheer: range(r, 0.6, 1.6), wave: range(r, 0.4, 1.4), hips: range(r, 0.3, 1.2), shade: range(r, 0.3, 1.2) };
  a.cheerF = range(r, 1.5, 2.4);
  a.stance = range(r, 0.0, 0.04);
  a.backOff = range(r, 0, 0.4);
}

function createActor(c, tpl) {
  const rng = mulberry32(hash(c.id));
  const height = clamp(tpl.height * range(rng, 0.94, 1.06), 1.6, 1.92);
  const sc = (tpl.scale * height) / tpl.height;
  const model = SkeletonUtils.clone(tpl.root);
  model.scale.setScalar(sc);
  const body = new THREE.Group();
  body.add(model);
  const root = new THREE.Group();
  root.add(body);
  scene.add(root);
  const bones = {};
  const rest = new Map();
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) {
      const k = canonBone(o.name);
      if (!bones[k]) bones[k] = o;
      rest.set(o, o.quaternion.clone());
    }
    if (o.isSkinnedMesh) {
      meshes.push(o);
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // The parts (body, head, hair) use the same bones: a single skeleton, updated once.
  const base = meshes[0].skeleton;
  for (const m of meshes.slice(1)) {
    const s = m.skeleton;
    if (s.bones.length === base.bones.length && s.bones.every((b, i) => b === base.bones[i]) && s.boneInverses.every((M, i) => M.equals(base.boneInverses[i]))) m.bind(base, m.bindMatrix);
  }

  const bottle = new THREE.Mesh(bottleGeo, bottleMat);
  bottle.visible = false;
  scene.add(bottle);
  // Tag (full or one-line) and ranking plate, positioned in layoutMarks().
  const tagWrap = document.createElement('div');
  tagWrap.className = 'tag-wrap';
  tagWrap.style.display = 'none';
  const line = document.createElement('div');
  line.className = 'tag-line';
  const tag = document.createElement('div');
  tag.className = 'tag full';
  const el = (cls, tagName = 'span') => {
    const e = document.createElement(tagName);
    e.className = cls;
    return e;
  };
  const tagParts = { rank: el('rank'), name: el('name'), ctok: el('ctok'), tok: el('tok', 'small'), gap: el('gap', 'small'), sum: el('sum', 'small') };
  const t1 = el('t1', 'div');
  t1.append(tagParts.rank, tagParts.name, tagParts.ctok);
  // "📸 Card": only on the tag of whoever was clicked (class .sel, layoutMarks). The pointerdown does
  // not reach the stage (it would become a drag or a click on the climber)
  const cardBtn = el('tag-card', 'button');
  cardBtn.type = 'button';
  cardBtn.textContent = tr('tag.card');
  cardBtn.title = tr('tag.cardTitle');
  cardBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  cardBtn.addEventListener('click', () => openCard(c.id));
  tag.append(t1, tagParts.tok, tagParts.gap, tagParts.sum, cardBtn);
  tagWrap.append(line, tag);
  const plate = el('plate', 'div');
  plate.style.display = 'none';
  marksEl.append(tagWrap, plate);
  // The CSS animation lives in a child: the wrapper's transform belongs to the CSS2DRenderer.
  const zzz = document.createElement('div');
  zzz.innerHTML = '<div class="zzz"></div>';
  zzz.firstChild.textContent = tr('tag.zzz');
  const zzzLabel = new CSS2DObject(zzz);
  scene.add(zzzLabel);

  const a = {
    id: c.id, rng, tpl, height, root, body, model, bones, rest, meshes, bottle, tag, tagWrap, tagParts, line, plate, zzzLabel,
    labelPos: V(), handPt: V(), onScreen: true, bodyPx: 99, posedAt: -1, lastTokens: c.tokens, pop: null, slot: null, summitBack: 0,
    trail: makeTrail(), trailOn: false, gainAcc: 0, gainShownAt: -Infinity, creep: null, creepStep: 0.15, lastGainAt: null,
    rap: null, rapPending: null, campG: null, leaving: null, restW: 0, restAt: null, demote: 0, demoteUntil: 0, tagSize: {},
    m: { top: { x: 0, y: 0 }, foot: { x: 0, y: 0 }, hand: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, rect: { x: 0, y: 0, w: 0, h: 0 }, body: 0, kind: 'none', extra: false, on: false },
    tagShown: false, tagKind: 'full', tagSel: false, plateShown: false,
    ropeSlot: ropeFree.length ? ropeFree.pop() : -1,
    holds: { LH: V(), RH: V(), LF: V(), RF: V() },
    H: V(), T: { LH: V(), RH: V(), LF: V(), RF: V() },
    lastH: V(), lastT: { LH: V(), RH: V(), LF: V(), RF: V() },
    blendH: V(), blendT: { LH: V(), RH: V(), LF: V(), RF: V() }, blendAt: -Infinity, blendDur: 1, blendYaw: 0,
    hip: V(), goal: { x: 0, y: 0 }, guard: V(), clear: 0, look: { y: 0, p: 0 }, settled: {}, wasOn: true, arrive: null, celebN: 0,
    mv: { active: false, limb: 'LH', from: V(), to: V(), dir: V(), t0: 0, dur: 1, arc: 0.1 },
    push: null, nextAt: 0, last: 'P', extra: null, stuck: 0, climbing: false, hurry: 1,
    action: null, nextIdle: 0, celeb: null, celebAt: 0, celebFirst: true,
    queued: null, mode: 'wall', wantMode: 'wall', modeAt: 0, pendingSummit: false, summitX: null,
    stateName: 'still', log: [], headPos: V(), footY: 0, x: 0, y: 0, ctx: makeCtx(),
    limbBones: Object.fromEntries(LIMB_KEYS.map((l) => [l, LIMBS[l].map((n) => bones[n])])),
  };
  personality(a);
  calibrate(a, sc);
  addGear(a, sc);
  // Chain that the pose updates by hand: from the root to each CORE bone (parent before child).
  const core = new Set();
  for (const n of CORE) {
    if (!bones[n]) continue;
    const chain = [];
    for (let p = bones[n]; p && p !== scene; p = p.parent) chain.push(p);
    for (let i = chain.length - 1; i >= 0; i--) core.add(chain[i]);
  }
  a.core = [...core];
  return a;
}

// Calibration at rest: spine axes, hand/foot/finger bases, limb lengths and, for
// each orientation (back to the camera on the wall, facing it at the summit), where the hip, shoulders and hip joints are.
function calibrate(a, sc) {
  const { bones, root, body } = a;
  const P = (n) => V().setFromMatrixPosition(bones[n].matrixWorld);
  const node = (n) => bones[n] ?? a.model.getObjectByName(n);
  const pose = (yaw, lean, shrug = 0) => {
    body.rotation.y = yaw;
    resetBones(a);
    if (lean) {
      bendBone(a, 'Spine', lean * 0.45, 0, 0);
      bendBone(a, 'Spine1', lean * 0.35, 0, 0);
      bendBone(a, 'Spine2', lean * 0.2, 0, 0);
    }
    if (shrug) shrugShoulders(a, shrug);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
  };
  pose(0, 0);
  // clavicle: axis (in the bone's reference frame) that rotates the shoulder up
  a.shrugAx = {};
  for (const L of ['Left', 'Right']) {
    const sh = bones[`${L}Shoulder`];
    if (!sh || !bones[`${L}Arm`]) continue;
    const axW = V().crossVectors(P(`${L}Arm`).sub(P(`${L}Shoulder`)), UP).normalize();
    a.shrugAx[L] = axW.applyQuaternion(sh.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  }
  const side = Math.sign(P('LeftArm').x - P('Hips').x) || 1;
  // axes (in each bone's reference frame): p tilts forward, y turns left, r bends left
  const fwd = V(0, 0, 1);
  const pW = V().crossVectors(UP, fwd);
  const yW = UP.clone().multiplyScalar(side);
  const rW = V(0, 0, -side);
  a.axes = {};
  for (const n of SPINE) {
    if (!bones[n]) continue;
    const qi = bones[n].getWorldQuaternion(new THREE.Quaternion()).invert();
    a.axes[n] = { p: pW.clone().applyQuaternion(qi).normalize(), y: yW.clone().applyQuaternion(qi).normalize(), r: rW.clone().applyQuaternion(qi).normalize() };
  }
  a.seg = {};
  a.len = {};
  for (const l of LIMB_KEYS) {
    const [u, lo, e] = LIMBS[l];
    a.seg[l] = [P(u).distanceTo(P(lo)), P(lo).distanceTo(P(e))];
    a.len[l] = a.seg[l][0] + a.seg[l][1];
  }
  const sole = a.tpl.sole * sc;
  a.stand = P('Hips').y - sole;
  a.ankle = P('LeftFoot').y - sole;
  a.headUp = P('Head').y - P('Hips').y;
  // hands: fingers (f) and palm (n); fingers with the bend axis of each phalanx
  a.hands = {};
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    if (!bones[`${L}HandMiddle1`] || !bones[`${L}HandIndex1`] || !bones[`${L}HandPinky1`]) continue;
    const h0 = P(`${L}Hand`);
    const f = P(`${L}HandMiddle1`).sub(h0).normalize();
    const across = P(`${L}HandIndex1`).sub(P(`${L}HandPinky1`));
    const n = V().crossVectors(f, across).normalize().multiplyScalar(s);
    const fingers = [];
    for (const F of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      let dir = null;
      for (let k = 1; k <= 3; k++) {
        const b = bones[`${L}Hand${F}${k}`];
        if (!b) continue;
        const next = bones[`${L}Hand${F}${k + 1}`];
        if (next) dir = P(`${L}Hand${F}${k + 1}`).sub(P(`${L}Hand${F}${k}`)).normalize();
        if (!dir) continue;
        const axW = V().crossVectors(dir, n).normalize();
        const qi = b.getWorldQuaternion(new THREE.Quaternion()).invert();
        fingers.push({ bone: b, axis: axW.applyQuaternion(qi).normalize(), k: k - 1, thumb: F === 'Thumb' });
      }
    }
    a.hands[L] = { bone: bones[`${L}Hand`], qInv: localBasisInv(bones[`${L}Hand`], f, n), fingers };
  }
  // feet: toe (f) and sole (n)
  a.feet = {};
  a.toe3 = 0.2; // ankle → tip of the shoe
  for (const L of ['Left', 'Right']) {
    const toe = node(`${L}Toe_End`) ?? node(`${L}ToeBase`);
    if (!toe) continue;
    toe.updateWorldMatrix(true, false);
    const f = V().setFromMatrixPosition(toe.matrixWorld).sub(P(`${L}Foot`));
    a.toe3 = f.length() || a.toe3;
    f.normalize();
    a.feet[L] = { bone: bones[`${L}Foot`], qInv: localBasisInv(bones[`${L}Foot`], f, V(0, -1, 0)) };
  }

  a.calib = {};
  for (const [mode, yaw, lean, shrug] of [['wall', Math.PI, a.lean, a.shrug], ['front', 0, 0, 0]]) {
    pose(yaw, lean, shrug);
    const hips = P('Hips');
    a.calib[mode] = {
      hips,
      side: Math.sign(P('LeftArm').x - hips.x) || 1,
      sh: { LH: P('LeftArm').sub(hips), RH: P('RightArm').sub(hips) },
      hp: { LF: P('LeftUpLeg').sub(hips), RF: P('RightUpLeg').sub(hips) },
      ft: { LF: P('LeftFoot').sub(hips), RF: P('RightFoot').sub(hips) },
    };
  }
  pose(0, 0); // the gear is built at rest, facing forward
}

function removeActor(a) {
  scene.remove(a.root, a.bottle, a.zzzLabel, a.trail);
  a.trail.geometry.dispose();
  a.trail.material.dispose();
  a.vestGeo?.dispose(); // yellow vest (geometry measured for each person's body)
  a.tagWrap.remove();
  a.plate.remove();
  a.zzzLabel.element.remove();
  // bone texture on the GPU (one skeleton per part that could not be shared)
  for (const s of new Set(a.meshes.map((m) => m.skeleton))) s.dispose();
  if (a.ropeSlot >= 0) {
    for (let i = 0; i < ROPE_SEGS; i++) ropeMesh.setMatrixAt(a.ropeSlot * ROPE_SEGS + i, ZERO_M);
    ropeFree.push(a.ropeSlot);
  }
  actors.delete(a.id);
}

function logMove(a, t, what, dur) {
  a.log.push({ t, what, dur });
  if (a.log.length > 40) a.log.shift();
}

// ---------- Holds within reach ----------

const _j = V(), _h = V(), _w = V();

// Joint of the limb (shoulder or hip) with the body's hip at (hx, hy), on the wall.
function jointAt(a, l, hx, hy, out) {
  const cal = a.calib.wall;
  // a.clear: how far the body is pushed out right now so the head/chest do not enter a bulge
  return out.set(hx, hy, bodyZ(hx, hy) + HIP_OUT + a.clear).add(l[1] === 'H' ? cal.sh[l] : cal.hp[l]);
}

// Depth of the hold at (x, y): the hand sits outside the most protruding rock under the fingers (which
// point up) and the foot outside the rock under the shoe (the toe goes inward and a little
// down and touches, without entering). That way fingers and toe caps do not vanish inside roofs and steps.
function holdZ(a, l, x, y) {
  if (l[1] === 'H') return Math.max(wallZ(x, y), wallZ(x, y + 0.08) - 0.015, wallZ(x, y + 0.15) - 0.035) + HAND_OFF;
  const t = a.toe3;
  return Math.max(wallZ(x, y) + 0.06, wallZ(x, y - 0.2 * t) + 0.5 * t, wallZ(x, y - 0.41 * t) + 0.91 * t + 0.008);
}

// Hold point on the rock at most k·limb length away, starting from the joint with the
// hip at (hx, hy). `lat` spreads outward; the height comes from whatever reach is left.
function wallHold(a, l, hx, hy, k, lat, out) {
  const hand = l[1] === 'H';
  const J = jointAt(a, l, hx, hy, _j);
  const R = k * a.len[l];
  const sgn = l[0] === 'L' ? a.calib.wall.side : -a.calib.wall.side;
  const lx = sgn * Math.min(lat, 0.6 * R);
  const x = J.x + lx;
  let y = J.y + (hand ? 0.8 : -0.9) * R;
  for (let i = 0; i < 3; i++) {
    const dz = J.z - holdZ(a, l, x, y);
    const v = Math.sqrt(Math.max(R * R - lx * lx - dz * dz, (0.3 * R) ** 2));
    y = J.y + (hand ? v : -v);
  }
  out.set(x, y, holdZ(a, l, x, y));
  if (out.distanceTo(J) <= R + 0.005) return out;
  // Deep rock (recess above a ledge): looks, within reach, for the rock point closest
  // to the intended one (lower, higher or a bit to the side) instead of leaving the limb in the air.
  let bx = x;
  let by = y;
  let bs = Infinity;
  for (const dx of [0, -0.12, 0.12, -0.24, 0.24]) {
    for (let f = 0.95; f >= -0.15; f -= 0.1) {
      const px = x + dx;
      const py = J.y + (hand ? f : -f) * R;
      const pz = holdZ(a, l, px, py);
      const d = Math.hypot(px - J.x, py - J.y, pz - J.z);
      const s = Math.max(0, d - R) * 10 + Math.abs(py - y) + Math.abs(dx) * 0.5;
      if (s < bs) {
        bs = s;
        bx = px;
        by = py;
      }
    }
  }
  return out.set(bx, by, holdZ(a, l, bx, by));
}

// How much of its reach the limb uses with the hip at (hx, hy).
function reachRatio(a, l, hx, hy, p) {
  return jointAt(a, l, hx, hy, _h).distanceTo(p) / a.len[l];
}

// Comfort limits: hands up to 0.98 of the arm, feet up to 0.96 of the leg (and without bunching up too much).
const REACH = { H: [0.22, 0.98], F: [0.4, 0.96] };
function limbExcess(a, l, hx, hy, p = a.holds[l]) {
  const r = reachRatio(a, l, hx, hy, p);
  const [lo, hi] = REACH[l[1]];
  return Math.max(r - hi, lo - r, 0);
}
// How badly placed limb l is with hold p (hip still): too stretched/bunched up or,
// for a hand, below the shoulder.
function limbBadness(a, l, p) {
  let e = limbExcess(a, l, a.hip.x, a.hip.y, p) * 4;
  if (l[1] === 'H') {
    if (p.y < jointAt(a, l, a.hip.x, a.hip.y, _w).y + 0.1) e += 0.3;
    // hand much lower (arm much more bent) than this person's usual way of standing still
    e += Math.max(0, a.restK[l] - 0.12 - reachRatio(a, l, a.hip.x, a.hip.y, p)) * 4;
  }
  return e;
}

function restHolds(a, hx, hy) {
  for (const l of LIMB_KEYS) wallHold(a, l, hx, hy, a.restK[l], a.lat[l], a.holds[l]);
}

// ---------- Climbing state machine (each one on their own timing) ----------

// Pause between moves: 0.1–0.8 s, short more often than long.
const pause = (a, k = 1) => ((0.1 + 0.7 * a.rng() ** 2) * a.pauseK * k) / a.hurry;

function startMove(a, l, to, t, durK = 1) {
  const mv = a.mv;
  mv.active = true;
  mv.limb = l;
  mv.from.copy(a.holds[l]);
  mv.to.copy(to);
  const d = mv.from.distanceTo(mv.to);
  mv.dir.subVectors(mv.to, mv.from).normalize();
  // duration by distance, with each move's own variation; hurry shortens it only a little
  mv.dur = (a.tempo * clamp((0.6 + d / 0.7) * range(a.rng, 0.85, 1.2), 0.6, 1.8) * (l[1] === 'F' ? 0.85 : 1) * durK) / Math.sqrt(a.hurry);
  mv.arc = 0.04 + 0.2 * clamp(d / 0.6, 0, 1);
  mv.t0 = t;
  a.last = l[1];
  logMove(a, t, l, mv.dur);
}

function startPush(a, tx, ty, t) {
  const d = Math.hypot(tx - a.hip.x, ty - a.hip.y);
  const speed = Math.min(0.45, a.pushSpeed * Math.sqrt(a.hurry)) * range(a.rng, 0.85, 1.15); // never "sped up"
  a.push = { fx: a.hip.x, fy: a.hip.y, tx, ty, t0: t, dur: Math.max(0.35, d / speed) };
  a.last = 'P';
  logMove(a, t, 'hip', a.push.dur);
}

// Fraction of the way to (tx, ty) the hip can travel without stretching any limb beyond comfort.
function feasiblePush(a, tx, ty) {
  for (const f of [1, 0.75, 0.5, 0.3]) {
    const hx = lerp(a.hip.x, tx, f);
    const hy = lerp(a.hip.y, ty, f);
    if (LIMB_KEYS.every((l) => limbExcess(a, l, hx, hy) <= 0)) return f;
  }
  return 0;
}

const _hold = V();

// Decides the next step: the low hand reaches higher, the limiting foot goes up (sometimes both),
// and the hip rises in a push when the holds allow. At the target, fixes a badly placed limb, one at a time.
function decide(a, t) {
  const dx = a.goal.x - a.hip.x;
  const dy = a.goal.y - a.hip.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    a.stuck = 0;
    a.hurry = 1;
    if (a.pendingSummit) {
      // at the edge: first traverses sideways (still on the wall) to the height of their spot on the plateau,
      // then climbs over the edge right there (startMantle) — nothing slides through the rock
      const sx = clamp(a.slot?.x ?? SUMMIT_SLOTS[0][0], LANE.x0, LANE.x0 + (LANE.n - 1) * LANE.w);
      if (Math.abs(sx - a.hip.x) > 0.05) {
        a.goal.x = sx;
        a.nextAt = t + 0.1;
        return;
      }
      a.pendingSummit = false;
      a.wantMode = 'summit';
      startMantle(a, t);
      return;
    }
    // fixes, one at a time, the stretched or bunched-up limb or the hand below the shoulder — only if the
    // new hold is actually better; otherwise the limb stays "settled" until the hip moves
    // (without swapping between two points forever)
    const here = `${a.hip.x.toFixed(3)},${a.hip.y.toFixed(3)}`;
    const order = LIMB_KEYS.filter((l) => a.settled[l] !== here).map((l) => [limbBadness(a, l, a.holds[l]), l]).filter(([e]) => e > 0.04).sort((p, q) => q[0] - p[0]);
    for (const [e, l] of order) {
      wallHold(a, l, a.hip.x, a.hip.y, a.restK[l], a.lat[l], _hold);
      if (_hold.distanceTo(a.holds[l]) < 0.04 || limbBadness(a, l, _hold) > e - 0.05) {
        a.settled[l] = here; // the rock offers nothing better: stays as it is
        continue;
      }
      a.stateName = 'settling';
      startMove(a, l, _hold, t);
      return;
    }
    a.climbing = false;
    a.stateName = 'still';
    a.nextAt = t + 0.4;
    return;
  }
  a.climbing = true;
  a.stateName = dy >= 0 ? 'climbing' : Math.abs(dx) > Math.abs(dy) ? 'traversing' : 'descending';
  // far behind (e.g. the tab sat idle for hours): climbs a bit faster with short pauses
  a.hurry = clamp(dist / 2, 1, 2.5);
  // each hip push has its own size (no metronome)
  if (!a.stepNow) a.stepNow = a.stepLen * range(a.rng, 0.7, 1.3);
  const s = Math.min(1, a.stepNow / dist);
  const fx = a.hip.x + dx * s;
  const fy = a.hip.y + dy * s;
  const up = dy >= 0;
  const jitter = () => range(a.rng, -0.05, 0.05);
  const push = (tx, ty) => {
    a.stuck = 0;
    a.stepNow = 0;
    return startPush(a, tx, ty, t);
  };

  if (a.extra) { // second step in a row (the other foot, or the other hand)
    const l = a.extra;
    a.extra = null;
    if (l[1] === 'F' && a.holds[l].y < reachFoot(a, l, fx, fy).y - 0.08) return startMove(a, l, _hold, t);
    if (l[1] === 'H') {
      wallHold(a, l, lerp(a.hip.x, fx, 0.5), a.hip.y, a.kReach, a.lat[l] + jitter(), _hold);
      if (_hold.y > a.holds[l].y + 0.08) return startMove(a, l, _hold, t);
    }
  }
  // climbing: after each push, the lower hand goes first, reaching from the current hip
  if (up && (a.last === 'P' || a.newGain)) {
    a.newGain = false;
    const l = a.holds.LH.y <= a.holds.RH.y ? 'LH' : 'RH';
    if (a.holds[l].y - jointAt(a, l, a.hip.x, a.hip.y, _w).y < 0.55 * a.len[l]) {
      wallHold(a, l, lerp(a.hip.x, fx, 0.6), a.hip.y, a.kReach, a.lat[l] + jitter(), _hold);
      if (_hold.y > a.holds[l].y + 0.05) {
        startMove(a, l, _hold, t);
        const o = l === 'LH' ? 'RH' : 'LH';
        if (a.rng() < 0.3 && a.holds[o].y < _hold.y - 0.15) a.extra = o; // sometimes both hands before the feet
        return;
      }
    } else if (dist < 0.15) {
      // small gain (less than one move): just regrips a little higher
      const p = a.holds[l];
      _hold.set(p.x + jitter() * 0.8, p.y + dist + range(a.rng, 0.02, 0.06), 0);
      _hold.z = holdZ(a, l, _hold.x, _hold.y);
      if (reachRatio(a, l, a.hip.x, a.hip.y, _hold) <= REACH.H[1]) return startMove(a, l, _hold, t, 0.8);
    }
  }
  // the hip travels as far as the holds allow
  const f = feasiblePush(a, fx, fy);
  if (f * dist * s >= Math.min(dist, 0.05)) return push(lerp(a.hip.x, fx, f), lerp(a.hip.y, fy, f));
  // otherwise, moves the limiting limb: going up, the feet (the lowest); going down, the hands (the highest)
  const bad = LIMB_KEYS.filter((l) => limbExcess(a, l, fx, fy) > 0);
  if (!bad.length || ++a.stuck > 8) return push(fx, fy); // the reach guard holds the body; the fix-up comes later
  const pref = up ? 'F' : 'H';
  bad.sort((p, q) => (p[1] === pref ? 0 : 1) - (q[1] === pref ? 0 : 1) || (up ? a.holds[p].y - a.holds[q].y : a.holds[q].y - a.holds[p].y));
  const l = bad[0];
  if (l[1] === 'F') {
    reachFoot(a, l, fx, fy);
    if (_hold.distanceTo(a.holds[l]) < 0.03) return push(fx, fy); // the rock offers no other hold: pushes anyway
    startMove(a, l, _hold, t);
    const o = l === 'LF' ? 'RF' : 'LF';
    if (up && a.rng() < a.doubleFoot && a.holds[o].y < _hold.y - 0.12) a.extra = o;
    return;
  }
  // hand: a hold for the future hip, but one reachable from where the body is
  wallHold(a, l, fx, fy, a.restK[l], a.lat[l] + jitter(), _hold);
  if (reachRatio(a, l, a.hip.x, a.hip.y, _hold) > 0.97) wallHold(a, l, (a.hip.x + fx) / 2, (a.hip.y + fy) / 2, a.restK[l], a.lat[l], _hold);
  if (_hold.distanceTo(a.holds[l]) < 0.03) return push(fx, fy); // same point: no "tapping" in place
  startMove(a, l, _hold, t);
}

function reachFoot(a, l, fx, fy) {
  return wallHold(a, l, fx, fy, a.kFoot + range(a.rng, -0.04, 0.03), a.lat[l] + range(a.rng, -0.05, 0.05), _hold);
}

// Advances moves and pushes; when free (and with no idle action), decides the next one.
function climbStep(a, t) {
  const mv = a.mv;
  if (mv.active) {
    if (t < mv.t0 + mv.dur) return;
    a.holds[mv.limb].copy(mv.to);
    mv.active = false;
    a.nextAt = t + pause(a, mv.limb[1] === 'F' ? 0.6 : 1);
  }
  if (a.push) {
    const k = (t - a.push.t0) / a.push.dur;
    if (k < 1) {
      const e = easeInOut(k);
      a.hip.x = lerp(a.push.fx, a.push.tx, e);
      a.hip.y = lerp(a.push.fy, a.push.ty, e);
      return;
    }
    a.hip.x = a.push.tx;
    a.hip.y = a.push.ty;
    a.push = null;
    a.nextAt = t + range(a.rng, 0.08, 0.35) * a.pauseK;
  }
  if (t < a.nextAt || a.action) return;
  decide(a, t);
}

// Short anticipation, a smooth go and a slight overshoot that settles.
const moveEase = (s) => easeInOut(s) + 0.04 * Math.sin(Math.PI * clamp((s - 0.55) / 0.45, 0, 1));

// ---------- Resting actions (on the wall, still) ----------

const _i0 = V(), _i1 = V();
const IDLE_ACTIONS = {
  // Lets go with one hand and shakes the arm out to rest the forearm.
  shake: { dur: 2.2, apply(k, a, t, ctx, W, H, l) {
    const w = smooth(0, 0.18, k) * (1 - smooth(0.82, 1, k));
    const s = l === 'LH' ? 1 : -1;
    const J = jointAt(a, l, H.x, H.y, _i0);
    _i1.copy(J).addScaledVector(W.left, s * 0.14).addScaledVector(UP, -0.72 * a.len[l]).addScaledVector(W.behind, 0.2);
    _i1.x += Math.sin(t * a.shakeF * TAU * 0.5) * 0.05;
    _i1.y += Math.sin(t * a.shakeF * TAU * 0.65) * 0.03;
    a.T[l].lerp(_i1, w);
    ctx.soft[l] = true;
    ctx.hw[l] *= 1 - w;
    ctx.grip[l] = lerp(ctx.grip[l], 0.1, w);
    ctx.shiftX -= s * 0.05 * w;
  } },
  // Left hand in the chalk bag (behind, on the harness); as the hand comes out, a few grains fall from the fingers.
  chalk: { dur: 1.9, apply(k, a, t, ctx, W, H, l) {
    const w = smooth(0, 0.25, k) * (1 - smooth(0.75, 1, k));
    _i1.copy(a.bag.position).applyMatrix4(a.bones.Hips.matrixWorld).addScaledVector(UP, 0.07).addScaledVector(W.behind, 0.02);
    a.T[l].lerp(_i1, w);
    ctx.soft[l] = true;
    ctx.hw[l] *= 1 - w;
    ctx.grip[l] = lerp(ctx.grip[l], 0.6, w);
    if (k > 0.7 && k < 0.95) ctx.puff = l;
    ctx.lookP -= 0.35 * w;
    ctx.lookY += (l === 'LH' ? 0.5 : -0.5) * w;
  } },
  // Water bottle: hand to the mouth, head tilted back.
  drink: { dur: 2.8, apply(k, a, t, ctx, W, H, l) {
    const w = smooth(0, 0.22, k) * (1 - smooth(0.78, 1, k));
    _i1.copy(a.headPos).addScaledVector(W.fwd, 0.1).addScaledVector(UP, -0.08);
    _i1.z = Math.max(_i1.z, wallZ(_i1.x, _i1.y) + 0.09); // the hand (and the bottle) between the face and the rock, without entering it
    a.T[l].lerp(_i1, w);
    ctx.soft[l] = true;
    ctx.hw[l] *= 1 - w;
    ctx.grip[l] = lerp(ctx.grip[l], 0.9, w);
    ctx.lookP += 0.45 * smooth(0.25, 0.4, k) * (1 - smooth(0.65, 0.78, k));
    ctx.bottle = w > 0.5 ? l : false;
  } },
  // Looks down, over the shoulder.
  look: { dur: 2.6, apply(k, a, t, ctx, W, H, l) {
    const w = smooth(0, 0.2, k) * (1 - smooth(0.8, 1, k));
    ctx.lookP -= 0.6 * w;
    ctx.lookY += (l === 'LH' ? 0.8 : -0.8) * w;
  } },
  // Wipes the forehead with a hand.
  wipe: { dur: 1.9, apply(k, a, t, ctx, W, H, l) {
    const w = smooth(0, 0.2, k) * (1 - smooth(0.8, 1, k));
    const s = l === 'LH' ? 1 : -1;
    _i1.copy(a.headPos).addScaledVector(W.fwd, 0.12).addScaledVector(UP, 0.08).addScaledVector(W.left, s * (0.1 - 0.2 * smooth(0.3, 0.7, k)));
    if (a.mode === 'wall') _i1.z = Math.max(_i1.z, wallZ(_i1.x, _i1.y) + 0.1);
    a.T[l].lerp(_i1, w);
    ctx.soft[l] = true;
    ctx.hw[l] *= 1 - w;
    ctx.grip[l] = lerp(ctx.grip[l], 0.2, w);
  } },
};

// In the stage, whoever is climbing right now only makes climbing gestures (regrip, adjust the foot, chalk,
// shake out the arm), one after another: between one gain and the next in the data they keep moving hands and
// feet on the wall. Whoever is resting sits in the harness (restPose) and only drinks water, looks around,
// wipes the forehead or chalks up; no moving holds.
const IDLE_BIAS = {
  climbing: { regrip: 2.6, shift: 2.3, chalk: 1.2, shake: 0.6, drink: 0, look: 0.15, wipe: 0 },
  resting: { drink: 1.6, look: 1.6, wipe: 1.2, chalk: 0.5, shake: 0, regrip: 0, shift: 0 },
};
const IDLE_GAP_K = { climbing: 0.22, resting: 0.8 };
// Interval until the next resting gesture (each at their own pace; whoever climbs, almost without pause).
const idleGapFor = (a) => a.idleGap * range(a.rng, 0.6, 1.6) * (IDLE_GAP_K[stageOn() ? a.data?.state : null] ?? 1);
function pickIdle(a, t) {
  // sitting in the harness counts as "resting", even if the data has already changed at this instant
  const st = a.restW > 0.3 ? 'resting' : stageOn() ? a.data?.state : null;
  const bias = IDLE_BIAS[st];
  const key = pickWeighted(a.rng, bias ? Object.fromEntries(Object.entries(a.idleW).map(([k, v]) => [k, v * (bias[k] ?? 1)])) : a.idleW);
  a.nextIdle = t + idleGapFor(a);
  const r = () => range(a.rng, -0.05, 0.05);
  if (key === 'regrip' || key === 'shift') { // readjusts a hand or a foot near where it is
    const l = key === 'regrip' ? (a.rng() < 0.5 ? 'LH' : 'RH') : (a.rng() < 0.5 ? 'LF' : 'RF');
    const p = a.holds[l];
    _hold.set(p.x + r(), p.y + r() * 1.5, 0);
    _hold.z = holdZ(a, l, _hold.x, _hold.y);
    if (reachRatio(a, l, a.hip.x, a.hip.y, _hold) > REACH[l[1]][1] - 0.01) return;
    a.stateName = key === 'regrip' ? 'regripping' : 'adjusting a foot';
    startMove(a, l, _hold, t, 0.8);
    return;
  }
  const hand = key === 'chalk' ? 'LH' : key === 'drink' ? 'RH' : a.holds.LH.y < a.holds.RH.y ? 'LH' : 'RH';
  a.action = { key, def: IDLE_ACTIONS[key], t0: t, dur: IDLE_ACTIONS[key].dur * a.idleDurK * range(a.rng, 0.9, 1.1), l: a.rng() < 0.25 ? (hand === 'LH' ? 'RH' : 'LH') : hand };
  if (key === 'chalk') a.action.l = 'LH';
  a.stateName = `idle: ${key}`;
}

// ---------- Poses ----------

function makeCtx() {
  return {
    soft: { LH: false, RH: false, LF: false, RF: false },
    hf: { LH: V(), RH: V() }, hn: { LH: V(), RH: V() }, hw: { LH: 0, RH: 0 }, grip: { LH: 0, RH: 0 },
    ff: { LF: V(), RF: V() }, fn: { LF: V(), RF: V() }, fw: { LF: 0, RF: 0 },
    lookAt: null, lookAtV: V(), lookP: 0, lookY: 0, lean: 0, twist: 0, bend: 0,
    bottle: false, puff: false, elbowOut: 1, shiftX: 0, kneeOut: 0.45, kneeUp: 0.05, kneeFwd: 0.6, shrug: 0,
  };
}
function resetCtx(ctx) {
  for (const l of LIMB_KEYS) ctx.soft[l] = false;
  ctx.hw.LH = ctx.hw.RH = 0;
  ctx.grip.LH = ctx.grip.RH = 0.3;
  ctx.fw.LF = ctx.fw.RF = 0;
  ctx.lookAt = null;
  ctx.lookP = ctx.lookY = ctx.lean = ctx.twist = ctx.bend = ctx.shiftX = ctx.shrug = 0;
  ctx.bottle = false;
  ctx.puff = false;
  ctx.elbowOut = 1;
  ctx.kneeOut = 0.45;
  ctx.kneeUp = 0.05;
  ctx.kneeFwd = 0.6;
}

const _left = V(), _pole = V(), _hd = V(), _hf = V(), _ff = V(), _cv = V();
const DOWN = V(0, -1, 0);
const W_CTX = { fwd: null, behind: null, left: _left };

function poseWall(a, t, cal, H, T, ctx, W) {
  // resting in the stage, at the target: sits in the harness (restW from 0 to 1 over REST_BLEND s). A new gain
  // (or the state turning "climbing") first lifts them up; only then do they go back to deciding moves.
  const dtR = clamp(t - (a.restAt ?? t), 0, 1);
  a.restAt = t;
  const wantRest = stageOn() && a.data?.state === 'resting' && !a.queued && !a.creep && !a.pendingSummit
    && Math.abs(a.goal.y - a.hip.y) < 0.01 && Math.abs(a.goal.x - a.hip.x) < 0.01;
  a.restW = clamp(a.restW + (wantRest ? dtR : -dtR) / REST_BLEND, 0, 1);
  if (a.restW < 0.05 || a.mv.active || a.push) climbStep(a, t);
  else if (!a.action) a.stateName = wantRest ? 'sitting on the rope' : 'getting up';
  const mv = a.mv;
  const sw = a.sway;
  // hip: base + slow weight shift + drift toward the side that holds while a limb moves
  let shift = 0.03 * (0.6 * Math.sin(TAU * sw.f2 * t + sw.p1) + 0.4 * Math.sin(TAU * sw.f1 * t + sw.p2));
  let s = 0;
  if (mv.active) {
    s = clamp((t - mv.t0) / mv.dur, 0, 1);
    shift -= (mv.limb[0] === 'L' ? 1 : -1) * (mv.limb[1] === 'H' ? 0.04 : 0.05) * Math.sin(Math.PI * s);
  }
  for (const l of LIMB_KEYS) T[l].copy(a.holds[l]);
  for (const l of HANDS) { ctx.hw[l] = 1; ctx.grip[l] = 0.85; }
  ctx.fw.LF = ctx.fw.RF = 1;
  if (mv.active) {
    const l = mv.limb;
    const P = T[l].lerpVectors(mv.from, mv.to, moveEase(s));
    P.addScaledVector(W.behind, Math.sin(Math.PI * s) * mv.arc);
    if (s < 0.2) P.addScaledVector(mv.dir, -0.025 * Math.sin((Math.PI * s) / 0.2));
    ctx.soft[l] = true;
    const open = Math.sin(Math.PI * s);
    if (l[1] === 'H') {
      ctx.hw[l] = 1 - 0.8 * open;
      ctx.grip[l] = lerp(0.85, 0.2, open);
      ctx.bend = (l === 'LH' ? 1 : -1) * 0.07 * open;
    } else ctx.fw[l] = 1 - 0.6 * open;
    ctx.lookAt = mv.to;
  } else if (a.push) {
    ctx.lookAt = a.holds.LH.y > a.holds.RH.y ? a.holds.LH : a.holds.RH;
  }
  // resting actions only while still
  if (!a.climbing && !mv.active && !a.push) {
    if (!a.action && t >= a.nextIdle) pickIdle(a, t);
    if (a.action) {
      const k = (t - a.action.t0) / a.action.dur;
      if (k >= 1) {
        a.action = null;
        a.stateName = a.restW > 0.5 ? 'sitting on the rope' : 'still';
        a.nextIdle = t + idleGapFor(a);
      }
    }
  }
  H.set(a.hip.x, a.hip.y + 0.012 * Math.sin(TAU * sw.f3 * t + sw.p3), 0);
  const left = cal.side;
  ctx.shiftX += shift;
  if (a.action) a.action.def.apply((t - a.action.t0) / a.action.dur, a, t, ctx, W, H, a.action.l);
  H.x += left * ctx.shiftX;
  H.z = bodyZ(H.x, H.y) + HIP_OUT + 0.01 * Math.sin(TAU * sw.f1 * 0.7 * t + sw.p3);
  ctx.lean = a.lean + (a.push ? 0.04 : 0);
  ctx.shrug = a.shrug;
  ctx.kneeOut = a.frog ? 0.85 : 0.42;
  ctx.twist = clamp((T.LH.y - T.RH.y) * 0.3, -0.12, 0.12);
  // hand on the hold: palm on the rock, fingers up (slightly outward)
  for (const l of HANDS) {
    ctx.hf[l].copy(UP).addScaledVector(W.left, (l === 'LH' ? 1 : -1) * 0.25).normalize();
    ctx.hn[l].copy(W.fwd);
  }
  for (const l of FEET) { ctx.ff[l].copy(FACE.wall.toe); ctx.fn[l].copy(FACE.wall.sole); }
  if (a.restW > 0.001) restPose(a, t, cal, H, T, ctx, W, smooth(0, 1, a.restW));
}

// Resting in the stage (no tokens in the last 15 min): sitting in the harness, hanging from the rope, like
// someone resting between two pitches. Hip lower and away from the rock, feet flat on the wall, the
// high hand on the rope above the harness and the other left dangling at the side, torso leaning back and the head
// up, looking around. Reads as "resting" from afar, without depending on the card (climbing = on the wall,
// moving hands and feet). `w`: pose weight (blends in and out slowly); a gesture (water, forehead) goes on top.
const REST_BLEND = 1.2;
function restPose(a, t, cal, H, T, ctx, W, w) {
  const sp = a.sleepP;
  const sw = Math.sin(TAU * sp.f * t + sp.ph);
  H.x += 0.03 * sw * w;
  H.y -= 0.22 * w;
  H.z += (sp.out - HIP_OUT) * w;
  const sd = (l) => (l[0] === 'L' ? cal.side : -cal.side);
  for (const l of FEET) {
    const s = l === 'LF' ? 1 : -1;
    const fx = H.x + sd(l) * (0.15 + 0.03 * s);
    const fy = H.y - 0.45 - 0.04 * s;
    T[l].lerp(_i1.set(fx, fy, holdZ(a, l, fx, fy)), w);
    ctx.soft[l] = true;
  }
  const hi = a.hiHand;
  for (const l of HANDS) {
    if (a.action?.l === l) continue; // gesture on top of the pose
    if (l === hi) _i1.set(H.x + sd(l) * 0.05, H.y + 0.5, H.z - 0.26); // on the rope, above the harness
    else _i1.copy(H).add(cal.sh[l]).addScaledVector(W.left, (l === 'LH' ? 1 : -1) * 0.08).addScaledVector(UP, -0.95 * a.len[l]).addScaledVector(W.behind, 0.05);
    T[l].lerp(_i1, w);
    ctx.soft[l] = true;
    ctx.hw[l] = lerp(ctx.hw[l], 0.6, w);
    ctx.grip[l] = lerp(ctx.grip[l], l === hi ? 0.9 : 0.3, w);
    if (l === hi) ctx.hf[l].lerp(UP, w).normalize();
    else ctx.hf[l].lerp(DOWN, w).normalize();
  }
  ctx.lean = lerp(ctx.lean, -0.25, w);
  ctx.shrug = lerp(ctx.shrug, 0, w);
  ctx.twist *= 1 - w;
  ctx.elbowOut = lerp(ctx.elbowOut, 0.5, w);
  ctx.kneeOut = lerp(ctx.kneeOut, 0.35, w);
  ctx.kneeUp = lerp(ctx.kneeUp, 0.6, w);
  ctx.kneeFwd = lerp(ctx.kneeFwd, 0.8, w);
  ctx.lookP -= 0.12 * w;
  ctx.lookY += 0.45 * Math.sin(TAU * a.gaze.f1 * t + a.gaze.p2) * w;
}

const CELEB_DUR = { cheer: [2.4, 3.2], wave: [2.2, 3], hips: [4, 7], shade: [3.5, 5.5] };

function poseSummit(a, t, cal, H, T, ctx, W) {
  if (a.summitX === null) { // spot on the plateau by surplus (the largest next to the flag)
    a.summitX = a.slot?.x ?? SUMMIT_SLOTS[0][0];
    a.summitBack = a.slot?.back ?? 0;
  }
  const x = a.summitX;
  const zs = frontZ(x) - 1.0 - a.backOff - a.summitBack;
  const left = cal.side;
  const wx = Math.abs(cal.ft.LF.x) + a.stance;
  const gl = groundY(x + left * wx, zs);
  const gr = groundY(x - left * wx, zs);
  a.standY = (gl + gr) / 2;
  const sw = a.sway;
  const shift = 0.025 * Math.sin(TAU * sw.f2 * t + sw.p1);
  // celebrations: the first 0.5–3 s after arriving, then every so often (each with their own)
  if (!a.celeb && t >= a.celebAt) {
    const kind = a.celebFirst ? (a.rng() < 0.7 ? 'cheer' : 'wave') : pickWeighted(a.rng, a.celebW);
    a.celebFirst = false;
    const [d0, d1] = CELEB_DUR[kind];
    a.celeb = { kind, t0: t, dur: range(a.rng, d0, d1) * a.idleDurK, l: a.rng() < 0.6 ? 'RH' : 'LH' };
    a.stateName = `summit: ${kind}`;
    logMove(a, t, `comemora: ${kind}`, a.celeb.dur);
  }
  if (a.celeb && t > a.celeb.t0 + a.celeb.dur) {
    a.celeb = null;
    // the first ones come soon; then more and more spaced out (20–60 s): the rest of the time they just
    // stand looking at the view, without turning into a celebration "loop"
    a.celebN++;
    a.celebAt = t + Math.min(60, range(a.rng, 7, 15) * (1 + 0.6 * (a.celebN - 1))) * a.pauseK;
    a.stateName = 'summit';
  }
  const c = a.celeb;
  const tau = c ? t - c.t0 : 0;
  const w = c ? smooth(0, 0.35, tau) * (1 - smooth(c.dur - 0.45, c.dur, tau)) : 0;
  let bounce = 0;
  if (c?.kind === 'cheer') bounce = 0.035 * Math.abs(Math.sin(Math.PI * a.cheerF * tau)) * w;
  H.set(x + left * shift, a.standY + a.stand - 0.025 + bounce + 0.006 * Math.sin(TAU * a.breath.f * t + a.breath.ph), zs);
  T.LF.set(H.x - left * shift + cal.ft.LF.x + left * a.stance, gl + a.ankle, zs + cal.ft.LF.z);
  T.RF.set(H.x - left * shift + cal.ft.RF.x - left * a.stance, gr + a.ankle, zs + cal.ft.RF.z);
  for (const l of FEET) {
    const s = l === 'LF' ? 1 : -1;
    ctx.fw[l] = 1;
    ctx.ff[l].copy(W.fwd).addScaledVector(W.left, s * 0.15).normalize();
    ctx.fn[l].set(0, -1, 0);
  }
  // hands loose at the sides of the body (target within reach: shoulder + arm almost straight)
  for (const l of HANDS) {
    const s = l === 'LH' ? 1 : -1;
    T[l].copy(H).add(cal.sh[l]).addScaledVector(W.left, s * 0.06).addScaledVector(UP, -0.92 * a.len[l]).addScaledVector(W.fwd, 0.04 + 0.015 * Math.sin(TAU * sw.f1 * t + s));
    ctx.hw[l] = 0.7;
    ctx.grip[l] = 0.35;
    ctx.hf[l].set(0, -1, 0);
    ctx.hn[l].copy(W.left).multiplyScalar(-s);
    ctx.soft[l] = true; // gestures: never push the body
  }
  ctx.lean = 0.02;
  ctx.lookY = 0.35 * Math.sin(TAU * a.gaze.f1 * t + a.gaze.p1);
  ctx.lookP = 0.05;
  if (!c) return;
  const pump = (l) => 0.09 * a.len[l] * Math.sin(TAU * a.cheerF * tau + (l === 'LH' ? 0 : 0.4));
  for (const l of HANDS) {
    const s = l === 'LH' ? 1 : -1;
    const J = _i0.copy(H).add(cal.sh[l]);
    if (c.kind === 'cheer') {
      _i1.copy(J).addScaledVector(W.left, s * 0.13).addScaledVector(UP, 0.8 * a.len[l] + pump(l)).addScaledVector(W.fwd, 0.06);
      T[l].lerp(_i1, w);
      ctx.grip[l] = lerp(ctx.grip[l], 1.15, w);
      ctx.hf[l].lerp(UP, w).normalize();
      ctx.hn[l].lerp(W.fwd, w).normalize();
      ctx.lookP += 0.3 * w;
    } else if (c.kind === 'wave' && l === c.l) {
      _i1.copy(J).addScaledVector(W.left, s * (0.2 + 0.12 * Math.sin(TAU * 1.7 * tau))).addScaledVector(UP, 0.72 * a.len[l]).addScaledVector(W.fwd, 0.1);
      T[l].lerp(_i1, w);
      ctx.grip[l] = lerp(ctx.grip[l], 0.05, w);
      ctx.hw[l] = 0.9;
      ctx.hf[l].lerp(UP, w).normalize();
      ctx.hn[l].lerp(W.fwd, w).normalize();
      ctx.lookY *= 1 - w;
    } else if (c.kind === 'hips' || (c.kind === 'shade' && l !== c.l)) {
      const bx = a.tpl.body.belt.rx * (a.height / a.tpl.height) * a.tpl.scale;
      _i1.copy(H).addScaledVector(W.left, s * (bx + 0.05)).addScaledVector(UP, 0.08);
      T[l].lerp(_i1, w);
      ctx.elbowOut = lerp(1, 2.2, w);
      ctx.grip[l] = lerp(ctx.grip[l], 0.4, w);
      ctx.hf[l].lerp(W.fwd, w).addScaledVector(UP, -0.4 * w).normalize();
    } else if (c.kind === 'shade') {
      _i1.copy(a.headPos).addScaledVector(W.fwd, 0.13).addScaledVector(UP, 0.08).addScaledVector(W.left, s * 0.03);
      T[l].lerp(_i1, w);
      ctx.grip[l] = lerp(ctx.grip[l], 0.1, w);
      ctx.hf[l].lerp(_cv.copy(W.left).multiplyScalar(-s), w).normalize(); // fingers toward the middle of the forehead
      ctx.hn[l].lerp(DOWN, w).normalize(); // palm down, casting a shadow
      ctx.lookY = lerp(ctx.lookY, 0.7 * Math.sin(TAU * 0.12 * tau), w);
      ctx.lookP += 0.1 * w;
    }
  }
}

// Sleeping: sitting in the harness, hanging from the rope — torso leaning back a little, thighs toward the
// rock, feet braced against it, arms dangling and the head drooping.
function poseSleep(a, t, cal, H, T, ctx, W) {
  const sp = a.sleepP;
  const sw = Math.sin(TAU * sp.f * t + sp.ph);
  H.set(a.hip.x + 0.05 * sw, a.hip.y + 0.012 * Math.sin(TAU * sp.f * 1.7 * t + sp.ph + 1.3), 0);
  H.z = bodyZ(a.hip.x, a.hip.y) + sp.out;
  for (const l of HANDS) {
    const s = l === 'LH' ? 1 : -1;
    T[l].copy(H).add(cal.sh[l]).addScaledVector(W.left, s * 0.06).addScaledVector(UP, -0.97 * a.len[l]).addScaledVector(W.behind, 0.06);
    T[l].x += 0.02 * Math.sin(TAU * sp.f * t + sp.ph + s);
    ctx.grip[l] = 0.25;
  }
  for (const l of FEET) {
    const s = l === 'LF' ? 1 : -1;
    const fy = H.y - 0.42 - 0.04 * s;
    T[l].set(H.x + (l[0] === 'L' ? cal.side : -cal.side) * (0.13 + 0.03 * s), fy, holdZ(a, l, H.x, fy));
    ctx.fw[l] = 0.8;
    ctx.ff[l].copy(FACE.wall.toe);
    ctx.fn[l].copy(FACE.wall.sole);
  }
  ctx.lean = -0.3;
  ctx.elbowOut = 0.25;
  ctx.kneeOut = 0.3;
  ctx.kneeUp = 0.7;
  ctx.kneeFwd = 0.8;
  ctx.lookP = -sp.head;
  ctx.lookY = sp.yaw + 0.08 * sw;
}

// Stage with no tokens today: sleeping sitting on the base camp floor, back against the rock,
// knees bent, hands drooping over the knees and the head hanging (each with their own sway).
function poseCamp(a, t, cal, H, T, ctx, W) {
  const sp = a.sleepP;
  const x = a.hip.x;
  if (!a.campG || Math.abs(a.campG.x - x) > 1e-3) {
    const g = baseGround(x);
    a.campG = { x, y: g.y, z: Math.max(g.zWall, wallZ(x, g.y + 0.5), wallZ(x, g.y + 0.95)) + 0.3 };
  }
  const G = a.campG;
  const sw = Math.sin(TAU * sp.f * t + sp.ph);
  const left = cal.side;
  H.set(x, G.y + 0.11 + 0.005 * Math.sin(TAU * a.breath.f * t + a.breath.ph), G.z);
  for (const l of FEET) {
    const s = l === 'LF' ? left : -left;
    T[l].set(x + s * 0.13, G.y + a.ankle - 0.03, G.z + 0.5 + 0.03 * s);
    ctx.fw[l] = 1;
    ctx.ff[l].set(s * 0.15, 0, 0).add(W.fwd).normalize();
    ctx.fn[l].copy(DOWN);
    ctx.soft[l] = true;
  }
  for (const l of HANDS) {
    const s = l === 'LH' ? left : -left;
    T[l].set(x + s * 0.12, G.y + 0.38 + 0.01 * sw, G.z + 0.42);
    ctx.hw[l] = 0.7;
    ctx.grip[l] = 0.25;
    ctx.hf[l].copy(W.fwd).addScaledVector(DOWN, 0.7).normalize();
    ctx.hn[l].copy(DOWN);
    ctx.soft[l] = true;
  }
  ctx.lean = 0.18;
  ctx.elbowOut = 0.6;
  ctx.lookP = -sp.head;
  ctx.lookY = 0.6 * sp.yaw + 0.06 * sw;
}

// Rappel (day rollover): sitting in the harness, legs almost horizontal with the feet on the rock, one
// hand on the rope above and the other braking beside the hip; descends in hops (pushes off the rock, swings
// out and back) and sideways to their lane. Position only as a function of time (works off screen).
function rappelAt(a, t, out) {
  const R = a.rap;
  const k = clamp((t - R.t0) / R.dur, 0, 1);
  const u = k * R.hops;
  const i = Math.min(R.hops - 1, Math.floor(u));
  const s = clamp(u - i, 0, 1);
  out.x = lerp(R.x0, R.x1, easeInOut(k));
  out.y = R.from - ((R.from - R.to) * (i + easeInOut(s))) / R.hops;
  out.swing = Math.sin(Math.PI * s);
  return out;
}
const _rap = { x: 0, y: 0, swing: 0 };
function poseRappel(a, t, cal, H, T, ctx, W) {
  const p = rappelAt(a, t, _rap);
  const sd = (l) => (l[0] === 'L' ? cal.side : -cal.side);
  H.set(p.x, p.y, bodyZ(p.x, p.y) + 0.72 + 0.4 * p.swing);
  for (const l of FEET) {
    const fx = p.x + sd(l) * 0.2;
    const fy = p.y - 0.3;
    T[l].set(fx, fy, holdZ(a, l, fx, fy) + 0.3 * p.swing);
    ctx.fw[l] = 1;
    ctx.ff[l].copy(FACE.wall.toe);
    ctx.fn[l].copy(FACE.wall.sole);
    ctx.soft[l] = true;
  }
  const hi = a.hiHand;
  const lo = hi === 'LH' ? 'RH' : 'LH';
  T[hi].set(p.x + sd(hi) * 0.04, p.y + 0.55, H.z - 0.24); // on the rope, above the harness
  T[lo].copy(H).addScaledVector(_left, (lo === 'LH' ? 1 : -1) * 0.22).addScaledVector(W.behind, 0.1).addScaledVector(UP, -0.1); // brake
  for (const l of HANDS) {
    ctx.hw[l] = 0.6;
    ctx.grip[l] = 0.9;
    ctx.hf[l].copy(UP);
    ctx.hn[l].copy(_left).multiplyScalar(l === 'LH' ? -1 : 1);
    ctx.soft[l] = true;
  }
  ctx.lean = -0.22;
  ctx.elbowOut = 0.8;
  ctx.kneeOut = 0.45;
  ctx.kneeUp = 0.3;
  ctx.lookP = -0.35;
  ctx.lookY = (lo === 'LH' ? 0.5 : -0.5) * (0.6 + 0.4 * p.swing);
}

// Arrival at the summit, 1st part (still facing the rock): hauls the hip over the edge,
// hands flat on the plateau, one foot and then the other come up to the edge. Then a short
// transition until standing, turned toward the view (poseSummit).
function startMantle(a, t) {
  const x = a.hip.x;
  const zf = frontZ(x);
  const A = { t0: t, dur: range(a.rng, 3.2, 4), x, zf, gy: groundY(x, zf - 0.35), H0: V(x, a.hip.y, bodyZ(x, a.hip.y) + HIP_OUT), T0: {} };
  for (const l of LIMB_KEYS) A.T0[l] = a.holds[l].clone();
  A.first = a.rng() < 0.5 ? 'LF' : 'RF';
  a.arrive = A;
  a.mode = 'summit';
  a.action = null;
  a.mv.active = false;
  a.push = null;
  a.blendAt = -Infinity;
  a.summitX = x;
  a.summitBack = a.slot?.back ?? 0;
  a.celeb = null;
  a.celebFirst = true;
  a.celebN = 0;
  a.stateName = 'climbing onto the summit';
  logMove(a, t, 'summit edge', A.dur);
}

const _top = V();
function poseMantle(a, t, cal, H, T, ctx, W) {
  const A = a.arrive;
  const k = clamp((t - A.t0) / A.dur, 0, 1);
  const x = A.x;
  // goes up first and only then moves forward over the edge (the hip never cuts the corner)
  const ky = 1 - (1 - smooth(0, 0.8, k)) ** 2;
  const kz = smooth(0.25, 1, k) ** 1.5;
  H.set(x, lerp(A.H0.y, A.gy + 0.32, ky), lerp(A.H0.z, A.zf + 0.06, kz));
  if (H.y < A.gy - 0.05) H.z = Math.max(H.z, wallZ(x, H.y) + 0.22);
  const sd = (l) => (l[0] === 'L' ? cal.side : -cal.side);
  for (const l of HANDS) {
    _top.set(x + sd(l) * 0.24, A.gy + 0.07, A.zf - 0.3);
    const w = smooth(0.02, 0.32, k);
    T[l].lerpVectors(A.T0[l], _top, w).addScaledVector(W.behind, 0.12 * Math.sin(Math.PI * w));
    ctx.hw[l] = 1;
    ctx.grip[l] = lerp(0.85, 0.15, w);
    ctx.hf[l].copy(W.fwd).addScaledVector(W.left, (l === 'LH' ? 1 : -1) * 0.3).normalize();
    ctx.hn[l].copy(DOWN);
    ctx.soft[l] = true;
  }
  for (const l of FEET) {
    const t0 = l === A.first ? 0.4 : 0.68;
    const w = smooth(t0, t0 + 0.28, k);
    _top.set(x + sd(l) * 0.13, A.gy + a.ankle + 0.02, A.zf - 0.06);
    T[l].lerpVectors(A.T0[l], _top, w).addScaledVector(W.behind, 0.18 * Math.sin(Math.PI * w));
    ctx.fw[l] = 1;
    ctx.ff[l].copy(FACE.wall.toe).lerp(W.fwd, w).normalize();
    ctx.fn[l].copy(FACE.wall.sole).lerp(DOWN, w).normalize();
    ctx.soft[l] = true;
  }
  ctx.lean = a.lean + 0.35 * smooth(0.2, 0.7, k);
  ctx.kneeUp = 0.5;
  ctx.lookAt = _top.set(x, A.gy + 0.3, A.zf - 1.5);
  if (k >= 1) {
    a.arrive = null;
    startBlend(a, t, 1.3); // stands up and turns toward the view
    a.celebAt = t + 1.3 + range(a.rng, 0.5, 2.5);
    a.stateName = 'summit';
  }
}

// Pose for the frame: mode → hip and targets, spine/head, reach guard, IK, hands, feet and fingers.
function poseActor(a, t, dt) {
  const mode = a.mode;
  const mantle = mode === 'summit' && !!a.arrive;
  const facing = (mode === 'summit' && !mantle) || mode === 'camp' ? 'front' : 'wall';
  const cal = a.calib[facing];
  const F = FACE[facing];
  _left.set(cal.side, 0, 0);
  W_CTX.fwd = F.fwd;
  W_CTX.behind = F.behind;
  const W = W_CTX;
  const { H, T, ctx } = a;
  resetCtx(ctx);
  resetBones(a);
  if (mantle) poseMantle(a, t, cal, H, T, ctx, W);
  else if (mode === 'summit') poseSummit(a, t, cal, H, T, ctx, W);
  else if (mode === 'sleep') poseSleep(a, t, cal, H, T, ctx, W);
  else if (mode === 'camp') poseCamp(a, t, cal, H, T, ctx, W);
  else if (mode === 'rappel') poseRappel(a, t, cal, H, T, ctx, W);
  else poseWall(a, t, cal, H, T, ctx, W);
  if (a.arrive === null && mantle) { // the climb over the edge ended in this frame: already standing on the plateau
    poseActor(a, t, dt);
    return;
  }

  // transition between modes (wall ↔ sleeping, edge → summit)
  let yaw = facing === 'wall' ? Math.PI : 0;
  if (t < a.blendAt + a.blendDur) {
    const w = smooth(0, 1, (t - a.blendAt) / a.blendDur);
    H.lerpVectors(a.blendH, H, w);
    for (const l of LIMB_KEYS) T[l].lerpVectors(a.blendT[l], T[l], w);
    yaw = a.blendYaw + Math.atan2(Math.sin(yaw - a.blendYaw), Math.cos(yaw - a.blendYaw)) * w;
    for (const l of LIMB_KEYS) ctx.soft[l] = true;
  }
  a.body.rotation.y = yaw;
  a.lastH.copy(H);
  for (const l of LIMB_KEYS) a.lastT[l].copy(T[l]);

  // spine: lean toward the rock, twist toward the higher hand, breathing in the chest
  const br = Math.sin(TAU * a.breath.f * t + a.breath.ph) * a.breath.A;
  bendBone(a, 'Spine', ctx.lean * 0.45, ctx.twist * 0.3, ctx.bend * 0.4);
  bendBone(a, 'Spine1', ctx.lean * 0.35 - br * 0.4, ctx.twist * 0.35, ctx.bend * 0.35);
  bendBone(a, 'Spine2', ctx.lean * 0.2 - br, ctx.twist * 0.35, ctx.bend * 0.25);
  if (ctx.shrug) shrugShoulders(a, ctx.shrug);
  // head: looks at the next hold (or wanders its gaze), smoothed
  let yawD;
  let pitchD;
  if (ctx.lookAt) {
    _hd.copy(H).addScaledVector(UP, a.headUp);
    _hd.subVectors(ctx.lookAt, _hd);
    const fw = _hd.dot(F.fwd);
    const lt = _hd.dot(_left);
    yawD = Math.atan2(lt, Math.max(fw, 0.12));
    pitchD = Math.atan2(_hd.y, Math.hypot(Math.max(fw, 0.12), lt));
  } else if (mode === 'wall') {
    yawD = 0.35 * Math.sin(TAU * a.gaze.f1 * t + a.gaze.p1) + 0.15 * Math.sin(TAU * a.gaze.f2 * t + a.gaze.p2);
    pitchD = a.gaze.up + 0.12 * Math.sin(TAU * a.gaze.f2 * t + a.gaze.p1);
  } else {
    yawD = 0;
    pitchD = 0;
  }
  yawD = clamp(yawD + ctx.lookY, -1.1, 1.1);
  pitchD = clamp(pitchD + ctx.lookP, mode === 'sleep' || mode === 'camp' ? -0.9 : -0.6, 0.8);
  const kl = 1 - Math.exp(-dt * 5);
  a.look.y += (yawD - a.look.y) * kl;
  a.look.p += (pitchD - a.look.p) * kl;
  bendBone(a, 'Neck', -a.look.p * 0.5, a.look.y * 0.55, 0);
  bendBone(a, 'Head', -a.look.p * 0.5, a.look.y * 0.45, 0);

  // root in place and chain matrices; the guard relaxes slowly when it is no longer needed
  a.guard.multiplyScalar(Math.exp(-dt * 2.5));
  const hipsOff = _hd.copy(a.calib.front.hips).applyAxisAngle(UP, yaw);
  a.root.position.copy(H).add(a.guard).sub(hipsOff);
  a.root.position.z += a.clear;
  updateCore(a);
  // first pushes head/chest away from the rock (if needed); then the reach guard, which can then only
  // move the body sideways, up or outward (so the two do not fight frame by frame)
  const onWall = mode === 'wall';
  if (onWall) clearBody(a, dt);
  else if (a.clear > 0) a.clear = Math.max(0, a.clear - 0.3 * dt);
  guardReach(a, H, T, ctx, mantle ? 'wall' : mode, onWall && a.clear > 0.005);

  // IK: elbows out and back, knees forward (toward the rock) and a little outward
  for (const l of LIMB_KEYS) {
    const [u, lo, e] = a.limbBones[l];
    const sgn = l[0] === 'L' ? 1 : -1;
    _pole.setFromMatrixPosition(u.matrixWorld);
    if (l[1] === 'H') _pole.addScaledVector(_left, sgn * 0.6 * ctx.elbowOut).addScaledVector(UP, -0.5).addScaledVector(F.behind, 0.45);
    else if (mode === 'camp') _pole.addScaledVector(_left, sgn * 0.25).addScaledVector(UP, 1).addScaledVector(F.fwd, 0.25); // sitting: knees up
    else if (facing === 'front') _pole.addScaledVector(_left, sgn * 0.12).addScaledVector(F.fwd, 1);
    else _pole.addScaledVector(_left, sgn * ctx.kneeOut).addScaledVector(UP, ctx.kneeUp).addScaledVector(F.fwd, ctx.kneeFwd);
    solveLimb(u, lo, e, a.seg[l][0], a.seg[l][1], T[l], _pole);
  }
  // hands: palm on the rock/fingers up; feet: toe on the rock; fingers closed on the hold
  for (const [L, l] of HAND_SIDES) {
    const hd = a.hands[L];
    if (!hd) continue;
    if (ctx.hw[l] > 0.01) orientBone(hd.bone, hd.qInv, _hf.copy(ctx.hf[l]).normalize(), ctx.hn[l], Math.min(1, ctx.hw[l]));
    curlFingers(hd.fingers, ctx.grip[l]);
  }
  for (const [L, l] of FOOT_SIDES) {
    const ft = a.feet[L];
    if (ft && ctx.fw[l] > 0.01) orientBone(ft.bone, ft.qInv, _ff.copy(ctx.ff[l]).normalize(), ctx.fn[l], Math.min(1, ctx.fw[l]));
  }

  if (DEBUG) {
    a.dbg = { H: H.toArray().map((n) => +n.toFixed(2)), guard: +a.guard.length().toFixed(3), state: a.stateName };
    for (const l of LIMB_KEYS) {
      const e = _hd.setFromMatrixPosition(a.limbBones[l][2].matrixWorld);
      a.dbg[l] = {
        target: T[l].toArray().map((n) => +n.toFixed(2)),
        bone: e.toArray().map((n) => +n.toFixed(2)),
        errorCm: +(e.distanceTo(T[l]) * 100).toFixed(1),
        moving: a.mv.active && a.mv.limb === l,
      };
    }
  }

  updateRope(a, mode);
  a.bottle.visible = !!ctx.bottle;
  if (ctx.bottle) {
    a.bottle.position.setFromMatrixPosition(a.bones[ctx.bottle === 'LH' ? 'LeftHand' : 'RightHand'].matrixWorld).addScaledVector(UP, 0.06).addScaledVector(F.fwd, 0.04);
    a.bottle.rotation.set(-0.9, 0, 0);
  }
  // ~6 grains per chalk pass, at the clock's pace (not the frame rate)
  if (ctx.puff) {
    a.grainAcc = (a.grainAcc ?? 0) + dt * 13;
    if (a.grainAcc >= 1) _p0.setFromMatrixPosition(a.bones[ctx.puff === 'LH' ? 'LeftHand' : 'RightHand'].matrixWorld);
    for (; a.grainAcc >= 1; a.grainAcc--) emitGrain(_p0);
  }

  const head = a.headPos.setFromMatrixPosition(a.bones.Head.matrixWorld);
  a.x = H.x;
  a.y = H.y;
  a.footY = Math.min(_hd.setFromMatrixPosition(a.bones.LeftFoot.matrixWorld).y, _pv.setFromMatrixPosition(a.bones.RightFoot.matrixWorld).y) - a.ankle;
  a.labelPos.copy(head).addScaledVector(UP, a.headTop + 0.12);
  // point of the token line (the hands) on the rock; at the summit, the summit line itself (y = 0) on the edge,
  // in front of whoever is there: the plate marks exactly the summit on the ruler
  if (mode === 'summit') a.handPt.set(H.x, 0, frontZ(H.x) + 0.1);
  else {
    const hy = a.hip.y + HIP_BELOW;
    a.handPt.set(H.x, hy, wallZ(H.x, hy) + HAND_OFF);
  }
  a.zzzLabel.visible = (mode === 'sleep' || mode === 'camp') && a.bodyPx >= 26;
  a.zzzLabel.position.copy(head).add(_hd.set(0.2, 0.3, 0.2));
}

// Reach guard: if a hold ended up beyond the arm (or the leg), moves the body to it instead of
// leaving the hand floating. "Soft" targets (idle action, limb in the air) are only shortened.
const _g0 = V(), _g1 = V();
function guardReach(a, H, T, ctx, mode, noCloser = false) {
  for (let pass = 0; pass < 2; pass++) {
    let worst = 0.002;
    let wl = null;
    for (const l of LIMB_KEYS) {
      const S = _g0.setFromMatrixPosition(a.limbBones[l][0].matrixWorld);
      const max = (l[1] === 'H' ? 0.985 : 0.99) * a.len[l];
      const ex = S.distanceTo(T[l]) - max;
      if (ex <= 0) continue;
      if (ctx.soft[l] || mode === 'sleep' || mode === 'camp' || mode === 'rappel') T[l].sub(S).setLength(max).add(S);
      else if (ex > worst) { worst = ex; wl = l; }
    }
    if (!wl) return;
    const S = _g0.setFromMatrixPosition(a.limbBones[wl][0].matrixWorld);
    _g1.copy(T[wl]).sub(S).setLength(worst + 0.002);
    if (mode === 'wall') { // never pushes the hip into the rock
      const minZ = bodyZ(H.x, H.y) + 0.15;
      _g1.z = Math.max(_g1.z, minZ - (H.z + a.guard.z));
      if (noCloser) _g1.z = Math.max(_g1.z, 0); // after pushing head/chest away: only sideways or up
    }
    a.guard.add(_g1);
    a.root.position.add(_g1);
    updateCore(a);
  }
}

// Head (helmet and face) and chest never inside the rock: the hands and feet hit the holds, but
// at a bulge the torso could enter it. Measures points attached to the bones against the surface and, if
// any went in, moves the body (z) away at once; when there is room to spare, it returns slowly. Returns whether it pushed out.
const _c0 = V();
function clearBody(a, dt) {
  let need = -Infinity;
  const test = (r) => {
    if (_c0.y < crest(_c0.x) - 0.15) need = Math.max(need, wallZ(_c0.x, _c0.y) + r - _c0.z); // above the crest is the plateau
  };
  const probe = (o, bone, r) => {
    if (!o) return;
    _c0.copy(o.position).applyMatrix4(bone.matrixWorld);
    test(r);
  };
  probe(a.helmet, a.bones.Head, a.helmetR + 0.01);
  if (a.helmet) { // top of the helmet (tilted forward when looking up, touches sooner)
    _c0.set(0, a.helmetR * 0.85, 0).add(a.helmet.position).applyMatrix4(a.bones.Head.matrixWorld);
    test(a.helmetR * 0.6);
  }
  probe(a.facePt, a.bones.Head, 0.025);
  probe(a.chinPt, a.bones.Head, 0.03);
  probe(a.chestPt, a.bones.Spine2, 0.02);
  if (need > 0) {
    a.clear += need;
  } else {
    // returns slowly and only with 3 cm of clearance (the head's sway does not keep pushing the body)
    const back = Math.min(a.clear, -need - 0.03, 0.12 * dt);
    if (back <= 0) return false;
    a.clear -= back;
    a.root.position.z -= back;
    updateCore(a);
    return false;
  }
  a.root.position.z += need;
  updateCore(a);
  return true;
}

// Smooth transition from the last pose (mode change, new spot on the plateau, new scale).
function startBlend(a, t, dur) {
  if (a.lastH.lengthSq() === 0) return;
  a.blendH.copy(a.lastH);
  for (const l of LIMB_KEYS) a.blendT[l].copy(a.lastT[l]);
  a.blendYaw = a.body.rotation.y;
  a.blendAt = t;
  a.blendDur = dur;
}

// Mode switch with a smooth transition (each on their own timing: the delay comes from the caller).
function switchMode(a, mode, t) {
  startBlend(a, t, mode === 'summit' ? 1.6 : 1.4);
  a.mode = mode;
  a.arrive = null;
  a.action = null;
  a.mv.active = false;
  a.push = null;
  a.settled = {};
  if (mode === 'wall') {
    restHolds(a, a.hip.x, a.hip.y);
    a.nextAt = t + range(a.rng, 0.5, 2.5);
    a.nextIdle = t + a.idleGap * range(a.rng, 0.5, 1.5);
    a.stateName = 'still';
  } else if (mode === 'summit') {
    a.celeb = null;
    a.celebFirst = true;
    a.celebAt = t + range(a.rng, 0.5, 3);
    a.stateName = 'summit';
  } else if (mode === 'camp') {
    a.campG = null;
    a.stateName = 'sleeping at camp';
  } else a.stateName = 'sleeping';
}

// Day rollover: starts the rappel of whoever was on the wall or at the summit down to the new height (the
// base camp, for whoever has not used tokens yet today), sideways to their lane.
function beginRappel(a, t) {
  const R = a.rapPending;
  a.rapPending = null;
  const fromSummit = a.mode === 'summit';
  const x0 = fromSummit ? clamp(a.summitX ?? a.hip.x, LANE.x0, LANE.x0 + (LANE.n - 1) * LANE.w) : a.hip.x;
  const from = fromSummit ? LIP_Y : a.hip.y;
  const D = from - R.to;
  a.queued = null;
  a.creep = null;
  a.pendingSummit = false;
  a.summitX = null;
  if (D < 0.3 && !fromSummit) { // already at the bottom: just goes to the new spot
    a.goal.x = R.x;
    a.hip.x = R.x;
    reposition(a, R.to, t, true);
    return;
  }
  startBlend(a, t, fromSummit ? 1.2 : 0.7);
  const hop = clamp(D / 8, 1.1, 4);
  a.rap = { t0: t, from, to: R.to, x0, x1: R.x, hops: Math.max(1, Math.round(D / hop)), dur: clamp(D / 4, 1.4, 11) * range(a.rng, 0.9, 1.15) };
  a.mode = 'rappel';
  a.arrive = null;
  a.action = null;
  a.mv.active = false;
  a.push = null;
  a.celeb = null;
  a.settled = {};
  a.stateName = 'rappelling';
  logMove(a, t, 'rappel', a.rap.dur);
}

// End of the rappel: at base camp (sitting, sleeping) or already climbing back, if the person
// used tokens in the meantime.
function endRappel(a, t) {
  const R = a.rap;
  a.rap = null;
  a.mode = 'wall';
  a.hip.set(R.x1, R.to, 0);
  a.goal.x = R.x1;
  a.goal.y = R.to;
  a.guard.set(0, 0, 0);
  const want = a.wantMode === 'camp' ? 'camp' : 'wall';
  a.wantMode = want;
  switchMode(a, want, t);
  if (want === 'wall' && a.data && !onSummit(a.data)) a.goal.y = Math.max(R.to, targetYForClimber(a.data));
}

// Small gain: the target creeps up until the next update, in steps of 10–22 cm (each one
// on their own timing), instead of a single jump followed by a minute standing still.
function creepTo(a, t) {
  const C = a.creep;
  const k = clamp((t - C.t0) / C.dur, 0, 1);
  const y = lerp(C.y0, C.y1, k);
  if (!C.noted) {
    C.noted = true;
    noteGain(a, C.gained, t);
  }
  if (y - a.goal.y >= a.creepStep || (k >= 1 && y > a.goal.y + 1e-4)) {
    a.goal.y = y;
    a.newGain = true;
    a.nextAt = Math.min(a.nextAt, t + 0.15);
    a.creepStep = range(a.rng, 0.1, 0.22);
  }
  if (k >= 1) a.creep = null;
}

function updateActor(a, t, dt) {
  if (a.rapPending && t >= a.rapPending.t0 && !a.arrive) beginRappel(a, t);
  if (a.mode === 'rappel' && t >= a.rap.t0 + a.rap.dur) endRappel(a, t);
  if (a.creep && t >= a.creep.t0 && a.mode === 'wall' && !a.queued && !a.pendingSummit) creepTo(a, t);
  // queued gain: starts climbing with its own delay (0–10 s), not everyone together
  if (a.queued && t >= a.queued.at && !a.action) {
    const q = a.queued;
    a.queued = null;
    a.goal.y = q.y;
    a.newGain = true; // the first thing after a gain is a hand (reach or regrip)
    if (q.summit) {
      // will reach the summit: climbs diagonally right away to the height of their spot on the plateau (no long traverse at the end)
      a.pendingSummit = true;
      a.goal.x = clamp(a.slot?.x ?? SUMMIT_SLOTS[0][0], LANE.x0, LANE.x0 + (LANE.n - 1) * LANE.w);
    }
    noteGain(a, q.gained, t);
    a.nextAt = Math.min(a.nextAt, t + 0.15);
  }
  if (a.pop && t >= a.pop.at) { // gain of someone already at the summit: just the balloon, on their own timing
    noteGain(a, a.pop.gained, t);
    a.pop = null;
  }
  if (a.wantMode !== a.mode && t >= a.modeAt && !a.mv.active && !a.push && !a.pendingSummit && !a.arrive && !a.rapPending && a.mode !== 'rappel') switchMode(a, a.wantMode, t);
  // back in the frame (zoom, drag, another level): the next idle gesture comes on their own timing,
  // not together with all the others that have just appeared too
  if (a.onScreen && !a.wasOn) a.nextIdle = Math.max(a.nextIdle, t + range(a.rng, 0.6, a.idleGap));
  a.wasOn = a.onScreen;
  // LOD: off the frame only the state machine runs; small on screen, pose at ~15 Hz
  const last = a.posedAt;
  if (lodOn && last >= 0 && (!a.onScreen || (a.bodyPx < 24 && t - last < 1 / 15))) {
    liteStep(a, t);
    return;
  }
  poseActor(a, t, last < 0 ? dt : Math.min(0.2, t - last));
  a.posedAt = t;
}

// Step without a pose (off the frame): the climb continues on the right timing, without IK or matrices. Idle
// gestures do not start here (nobody sees them); the time of the next one keeps being pushed forward.
function liteStep(a, t) {
  if (a.mode === 'rappel') {
    const p = rappelAt(a, t, _rap);
    a.x = p.x;
    a.y = p.y;
    return;
  }
  if (a.mode !== 'wall') return;
  if (a.action && t >= a.action.t0 + a.action.dur) {
    a.action = null;
    a.stateName = 'still';
  }
  if (!a.action && t >= a.nextIdle) a.nextIdle = t + a.idleGap * range(a.rng, 0.3, 1.2);
  climbStep(a, t);
  a.x = a.hip.x;
  a.y = a.hip.y;
}

// ---------- Data → positions (linear token scale) ----------

let state = null;
let forceDelay = null; // debug: fixed delay for simulateGain
let ledges = null; // ledges of Camps 1–4 (rock.js)
// Season summit in tokens: the scale of the whole wall (WALL_HEIGHT from summit to base). In a
// projected season it is rounded and only changes when it passes 10% (stableSummit).
let S = null;
const HIP_BELOW = 1.0; // hip below the token line: the hands sit on the line, the feet ~2.2 below
const LIP_Y = -1.05; // hip of whoever reaches the summit edge, before climbing onto the plateau
const MIN_HIP = BASE_LEDGE_Y + FEET_DROP - HIP_BELOW; // 0 tokens: the feet on the base camp floor
const TIE = 0.5e6; // a difference smaller than this is a tie
const ruler = { from: null, t0: 0, dur: 1.5 }; // on a new scale the ruler slides to it

// S the ruler uses now (interpolated during a scale change).
function rulerS(t = simTime) {
  if (ruler.from === null || !S) return S;
  const k = (t - ruler.t0) / ruler.dur;
  if (k >= 1) {
    ruler.from = null;
    return S;
  }
  return lerp(ruler.from, S, easeInOut(clamp(k, 0, 1)));
}

const onSummit = (c) => S > 0 && c.tokens >= S;

// ---------- Stage of the day ----------
// With state.stage (new server) the wall shows today's stage: everyone starts at base
// camp at midnight (configured time zone), the height is today's tokens and the "summit" is the mark of the day. The week (the
// overall standings, with the yellow jersey) is in the "Week" tab of the list. Without state.stage
// (old server), the wall remains the accumulated season.
const stageOn = () => !!(state?.stage && state.stage.mark > 0 && Array.isArray(state.stage.climbers));
// Who shows up on the wall, by placing (in the stage: today's tokens; otherwise: the season's).
const wallList = () => (stageOn() ? state.stage.climbers : state?.climbers ?? []).slice(0, SHOWN);
// Away from the summit: in the stage, whoever has not used tokens today sleeps sitting at base camp; without the
// stage, whoever has not used tokens today sleeps hanging in the harness, at their season height.
const wantModeFor = (c) => (stageOn() ? (c.tokens > 0 ? 'wall' : 'camp') : c.today > 0 ? 'wall' : 'sleep');
const refreshS = () => clamp(Number(state?.refreshSeconds) || 60, 5, 600);
// Names of people (nickname, pretty name or the anonymized "Swift Llama 2"); short: first name or the animal.
const nameOf = (p) => displayName(p).full;
const shortOf = (p) => displayName(p).short;
// "Thursday's stage" / "Etapa de quinta"; long: "Thursday's stage · 11/05" / "Etapa de quinta · 05/11".
const stageTitle = (stg) => tr('stage.title', { weekday: fmt.weekday(stg.day) });
const stageLong = (stg) => `${stageTitle(stg)} · ${fmt.dayMonth(stg.day)}`;
const CREEP_MAX = 2.5; // a gain of up to ~1.4 body lengths creeps up gradually; above that, all at once (in a hurry)
let stageDay = null; // day (configured time zone) of the stage on the wall: when it changes, everyone rappels down
const restSince = new Map(); // id → when (ms) they stopped using tokens, if we saw the person climbing before

// State in the stage, for the tags: climbing ("7.1 M/h"), resting ("resting for 25 min", plus what
// they climbed in the last hour, if anything) or asleep.
function restText(c) {
  const since = restSince.get(c.id);
  const hour = c.pace >= 50e3 ? tr('state.lastHour', { tokens: fmt.tokens(c.pace) }) : ''; // less than that is noise
  if (since) {
    const min = Math.max(15, Math.round((Date.now() - since) / 60000));
    return tr('state.restingFor', { time: fmt.duration({ h: Math.floor(min / 60), m: min % 60 }), hour });
  }
  if (hour) return tr('state.resting', { hour });
  return tr(c.tokens > (c.hourAgo ?? 0) ? 'state.restingOver15' : 'state.restingOver1h');
}
function stateText(c) {
  if (c.state === 'sleeping' || !(c.tokens > 0)) return tr('state.noTokensToday');
  if (c.state === 'climbing') return fmt.pace(c.pace ?? 0);
  return restText(c);
}
const STATE_ICON = { climbing: '🧗', resting: '☕', sleeping: '💤' };
const stateIcon = (c) => STATE_ICON[c.tokens > 0 ? c.state : 'sleeping'] ?? '';
// Overall standings: the week (season.kind "week"); with SEASON_LENGTH=month on the server, the month.
const weekly = () => (state?.season?.kind ?? 'week') === 'week';
const inPeriod = () => tr(weekly() ? 'state.inWeek' : 'state.inMonth');
// Place in the overall standings (for whoever has not climbed today yet, or with the Week tab open).
const weekText = (c) => (c.weekRank ? `#${c.weekRank} ${inPeriod()} · ${fmt.tokens(c.weekTokens ?? 0)}` : '');
// Where the mark of the day comes from.
function markSourceText(stg) {
  if (stg.markSource === 'fixed') return tr('mark.fixed');
  if (stg.markSource === 'fallback') return tr('mark.fallback');
  return plural(stg.markWindow ?? stg.winners?.length ?? 10, 'mark.median');
}

// Trail of the last hour: from the feet of 60 min ago to the feet now (only in the stage, for whoever is
// climbing or resting and climbed at least ~1/6 of a body in that hour). On the wall, the soles sit on
// average 0.8 below the hip (TRAIL_DROP below the token line).
const TRAIL_DROP = HIP_BELOW + 0.85;
function updateTrailData(a, c) {
  a.trailOn = false;
  if (!stageOn() || !(c.tokens > 0) || (c.state !== 'climbing' && c.state !== 'resting')) return;
  const y1 = yLine(Math.min(c.tokens, S), S) - TRAIL_DROP;
  const y0 = yLine(clamp(c.hourAgo ?? 0, 0, c.tokens), S) - TRAIL_DROP;
  if (!(y1 - y0 >= 0.3)) return;
  buildTrail(a.trail, laneXFor(c.id), y0, y1);
  a.trailOn = true;
}
// Every frame: cuts the trail at the feet now. At night it turns light (chalk under the headlamp): it is what
// shows the wall moving when the bodies almost vanish in the dark.
function updateTrail(a) {
  const on = a.trailOn && a.root.visible && (a.mode === 'wall' || a.mode === 'summit');
  a.trail.visible = on;
  if (!on) return;
  a.trail.userData.top.value = a.mode === 'summit' ? 1e3 : a.hip.y + HIP_BELOW - TRAIL_DROP;
}

// "+X M" balloon: merges small gains (a minute of data becomes "+0.3 M") and only shows once the
// sum passes ~1 M (or 2% of the scale), at most one per person every 45 s.
function noteGain(a, gained, t) {
  if (!(gained > 0)) return;
  a.gainAcc += gained;
  if (a.gainAcc < Math.max(1e6, 0.02 * (S || 0)) || t - a.gainShownAt < 45) return;
  showGain(a, a.gainAcc);
  a.gainAcc = 0;
  a.gainShownAt = t;
}

// Where the target of the gradual climb is now (or the resting target).
function creepFrom(a, t) {
  const C = a.creep;
  if (!C) return a.goal.y;
  return Math.max(a.goal.y, lerp(C.y0, C.y1, clamp((t - C.t0) / C.dur, 0, 1)));
}

// Day rollover (new stage): whoever is on the wall or at the summit rappels down to the new height (the
// base camp, for whoever has not used tokens yet), each with their own delay (0–5 s); whoever was already
// sleeping there just adjusts their spot.
function startDayReset(a, c, now) {
  a.queued = null;
  a.creep = null;
  a.pop = null;
  a.gainAcc = 0;
  a.lastGainAt = null;
  a.lastTokens = c.tokens;
  a.pendingSummit = false;
  const want = wantModeFor(c);
  const x = laneXFor(c.id);
  const y = targetYForClimber(c);
  a.wantMode = want;
  if (a.mode === 'camp') {
    a.goal.y = a.hip.y = y;
    if (Math.abs(a.hip.x - x) > 1e-3) {
      startBlend(a, now, 1.4);
      a.goal.x = a.hip.x = x;
    }
    a.modeAt = now + (forceDelay ?? range(a.rng, 0, 20));
    return;
  }
  if (a.mode === 'rappel') {
    a.rap.to = Math.min(a.rap.to, y);
    a.rap.x1 = x;
    return;
  }
  a.rapPending = { t0: now + (forceDelay ?? range(a.rng, 0, 5)), to: y, x };
}

// Day rollover, for whoever was on the wall or at the summit and is not in the new list (the rest of the wall
// in the early morning comes from the top of the week): also rappels down, already without a tag, and vanishes on reaching
// the bottom (doneLeaving). Whoever was already sleeping at camp leaves right away.
function startLeaving(a, now) {
  if (a.mode !== 'wall' && a.mode !== 'summit') return false;
  a.data = null; // out of the tags, plates, mouse and measurements
  a.leaving = now + 30; // deadline: vanishes either way
  setShown(a.tagWrap, false, 'tagShown', a);
  a.trailOn = false;
  a.queued = null;
  a.creep = null;
  a.pop = null;
  a.pendingSummit = false;
  a.wantMode = 'camp';
  a.rapPending = { t0: now + (forceDelay ?? range(a.rng, 0, 5)), to: yLine(0, S) - HIP_BELOW, x: laneXFor(a.id) };
  return true;
}
function doneLeaving(a, t) {
  if (t < a.leaving && (a.rapPending || a.mode === 'rappel')) return false;
  removeActor(a);
  return true;
}

// Data → hip height of whoever is on the wall (0 = summit). Linear in tokens and with the same
// offset for everyone: the distance between two climbers is proportional to the token difference.
function targetYForClimber(c) {
  if (onSummit(c)) return 0;
  return yLine(c.tokens, S) - HIP_BELOW;
}

// Lanes (x) of the wall: each person has theirs by the hash of the id and stays in it as long as nobody gets
// close in the same lane; ties stay at the same height, side by side (never a vertical offset).
// x from −4.4 to 13.6 (1.2 between lanes; 1.0 on a portrait screen): away from the rounded edge of the cliff
// (x < −4.6) and from the camp ledges (x > 15).
// At the start of the season (everyone bunched up near the base) the lanes narrow to fit
// everyone: never two people in the same lane less than a body and a half apart.
const LANE_SPAN = innerWidth / innerHeight < 0.75 ? 15 : 18;
const LANE = { w: LANE_SPAN / 15, n: 16, x0: -4.4 };
const LANE_DY = 2.6; // in the same lane, rows at least a body and a half apart
const laneOf = new Map();
const laneX = (k) => LANE.x0 + k * LANE.w;
const laneXFor = (id) => laneX(laneOf.get(id) ?? hash(id) % LANE.n);

// How many lanes are needed: the largest group with heights less than LANE_DY apart from each other.
function lanesNeeded(ys) {
  const s = [...ys].sort((p, q) => p - q);
  let best = 0;
  for (let i = 0, j = 0; i < s.length; i++) {
    while (s[i] - s[j] >= LANE_DY) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

// `wall`: [{ id, y }] per ranking. The current lane comes first (stability), then the hash lane and the neighbors.
function assignLanes(wall) {
  const need = lanesNeeded(wall.map((c) => c.y));
  const n = need > LANE.n ? Math.min(30, need) : LANE.n > 16 && need <= 12 ? 16 : LANE.n; // grows right away, shrinks back with some margin
  if (n !== LANE.n) {
    LANE.n = n;
    LANE.w = LANE_SPAN / (n - 1);
    laneOf.clear(); // new lanes: each one traverses sideways to theirs
  }
  const used = Array.from({ length: LANE.n }, () => []);
  for (const c of wall) {
    const pref = hash(c.id) % LANE.n;
    const cand = laneOf.has(c.id) ? [laneOf.get(c.id)] : [];
    for (let o = 0; o < LANE.n; o++) for (const k of o ? [pref + o, pref - o] : [pref]) if (k >= 0 && k < LANE.n) cand.push(k);
    let best = cand[0];
    let bestGap = -1;
    for (const k of cand) {
      let gap = Infinity;
      for (const y of used[k]) gap = Math.min(gap, Math.abs(y - c.y));
      if (gap >= LANE_DY) {
        best = k;
        break;
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = k;
      }
    }
    used[best].push(c.y);
    laneOf.set(c.id, best);
  }
}

// Summit plateau, ordered by surplus: the largest next to the flag, then 1.3 toward the edge of the
// cliff; from the sixth on, one row farther back. [x, setback].
const SUMMIT_SLOTS = [[2.3, 0], [1.0, 0], [-0.3, 0], [-1.6, 0], [-2.9, 0], [1.7, 1.6], [0.4, 1.6], [-0.9, 1.6], [4.9, 1.6], [6.2, 1.6]];
function summitSlotAt(i) {
  if (i < SUMMIT_SLOTS.length) return { x: SUMMIT_SLOTS[i][0], back: SUMMIT_SLOTS[i][1] };
  const k = i - SUMMIT_SLOTS.length;
  return { x: 2.3 - (k % 6) * 1.3, back: 3.2 + Math.floor(k / 6) * 1.6 };
}
const slotOf = new Map(); // id → spot on the plateau

function spawn(a, c, now) {
  const atSummit = onSummit(c);
  const x = laneXFor(c.id);
  const y = atSummit ? LIP_Y : targetYForClimber(c);
  a.goal.x = x;
  a.goal.y = y;
  a.placed = true;
  // spawns in place: some already settled, others a little below, which settle with 1–2 moves
  // spread over the first ~8 s (without a "start" of everyone together)
  const settled = a.rng() < 0.35;
  a.hip.set(x, atSummit || settled ? y : Math.max(MIN_HIP, y - range(a.rng, 0.04, 0.18)), 0);
  restHolds(a, a.hip.x, a.hip.y);
  a.nextAt = now + range(a.rng, 0.3, 8);
  a.nextIdle = now + range(a.rng, 3, 14);
  a.mode = a.wantMode = atSummit ? 'summit' : wantModeFor(c);
  if (a.mode === 'summit') { a.celebAt = now + range(a.rng, 0.5, 3); a.stateName = 'summit'; }
  if (a.mode === 'sleep' || a.mode === 'camp') { a.hip.y = y; a.stateName = a.mode === 'camp' ? 'sleeping at camp' : 'sleeping'; }
  a.x = atSummit ? a.slot?.x ?? 0 : a.hip.x;
  a.y = atSummit ? 1 : a.hip.y;
}

// Changes height without climbing (new scale, big drop in the data), with an optional smooth transition.
function reposition(a, y, t, blend = false) {
  if (blend) startBlend(a, t, ruler.dur);
  else a.blendAt = -Infinity;
  a.goal.y = y;
  a.hip.set(a.goal.x, y, 0);
  a.mv.active = false;
  a.push = null;
  a.action = null;
  a.queued = null;
  a.creep = null;
  a.guard.set(0, 0, 0);
  a.settled = {};
  restHolds(a, a.hip.x, a.hip.y);
  a.posedAt = -1; // pose again already on the next frame, even off screen (no body left at the old spot)
}

// Update of whoever is already in the scene: gain (gradual or queued, with its own delay), lane,
// summit and new scale.
function updateClimber(a, c, now, rescaled) {
  const atSummit = onSummit(c);
  const gained = Math.max(0, c.tokens - a.lastTokens);
  a.lastTokens = c.tokens;
  const delay = forceDelay ?? range(a.rng, 0, 10);
  const want = wantModeFor(c);
  if (a.mode === 'rappel' || a.rapPending) { // descending at the day rollover: at the end of the rappel goes to the new height
    a.wantMode = want;
    return;
  }
  if (a.mode === 'summit') {
    if (!atSummit) { // left the summit (new season or correction): returns to the wall at the right height
      a.summitX = null;
      a.pendingSummit = false;
      a.goal.x = laneXFor(c.id);
      reposition(a, targetYForClimber(c), now);
      a.wantMode = want;
      switchMode(a, want, now);
      return;
    }
    if (a.slot && (a.slot.x !== a.summitX || a.slot.back !== a.summitBack)) { // another spot on the plateau
      startBlend(a, now, 1.6);
      a.summitX = a.slot.x;
      a.summitBack = a.slot.back;
    }
    if (gained > 0) a.pop = { at: a.pop?.at ?? now + delay, gained: (a.pop?.gained ?? 0) + gained };
    return;
  }
  if (!a.pendingSummit) a.goal.x = laneXFor(c.id); // new lane: traverses sideways while climbing, no teleporting
  if (rescaled) { // new scale: slides to the new height along with the ruler
    if (a.pendingSummit) a.goal.x = laneXFor(c.id);
    a.pendingSummit = false;
    if (atSummit) {
      a.hip.y = a.goal.y = LIP_Y;
      a.wantMode = 'summit';
      switchMode(a, 'summit', now);
    } else reposition(a, targetYForClimber(c), now, true);
    if (!atSummit && a.mode === 'camp' && want !== 'camp') { // was sitting at the base: already heads to the new height
      a.wantMode = want;
      switchMode(a, want, now);
    } else if (!atSummit && want !== a.wantMode) { a.wantMode = want; a.modeAt = now + (forceDelay ?? range(a.rng, 0, 20)); }
    return;
  }
  if (a.pendingSummit) return;
  const y = atSummit ? LIP_Y : targetYForClimber(c);
  const cur = a.queued?.y ?? a.creep?.y1 ?? a.goal.y;
  if (y > cur + 1e-4) {
    // interval between this person's gains (Datadog may merge a few minutes into a single gain): the
    // gradual climb is spread across it, so the climb does not stop between one update and the next
    const every = clamp(a.lastGainAt === null ? refreshS() : now - a.lastGainAt, refreshS(), 300);
    a.lastGainAt = now;
    const unseen = a.creep && !a.creep.noted ? a.creep.gained : 0;
    if (atSummit || a.queued || y - creepFrom(a, now) > CREEP_MAX) {
      // big gain (or arrival at the summit): climbs all at once, with its own delay
      a.queued = { y, at: a.queued?.at ?? now + delay, gained: (a.queued?.gained ?? 0) + gained + unseen, summit: atSummit };
      a.creep = null;
    } else {
      const y0 = creepFrom(a, now);
      a.creep = { y0, y1: y, t0: a.creep ? Math.max(now, a.creep.t0) : now + delay * 0.5, dur: 0.92 * every, gained: unseen + gained, noted: false };
    }
  } else if (y < cur - 1e-4 && !a.queued) {
    a.creep = null;
    if (y < a.goal.y - 1.5) reposition(a, y, now, true); // big drop: correction in the data
    else if (y < a.goal.y - 1e-4) a.goal.y = y;
  }
  const w = atSummit ? a.mode : want;
  if (w !== a.wantMode) { a.wantMode = w; a.modeAt = now + (forceDelay ?? range(a.rng, 0, 20)); }
}

// Text of the gap to whoever is right above in the ranking (tokens; in bodies when both are on the
// wall). In the stage the top is the mark of the day, and whoever has not climbed today yet shows
// their place in the week.
function gapText(c, above) {
  const stg = stageOn();
  // whoever has not climbed today, and everyone with the Week tab open: the place in the overall
  // standings (the #6 of the week list is the #8 of the stage on the tag; the second line says #6)
  if (stg && (!(c.tokens > 0) || ui.tab === 'week') && c.weekRank) return weekText(c);
  if (stg && !(c.tokens > 0)) return '';
  if (!above) return onSummit(c) ? '' : tr(stg ? 'gap.leftToMark' : 'gap.leftToSummit', { tokens: fmt.tokens(S - c.tokens) });
  const d = above.tokens - c.tokens;
  if (d < TIE) return tr('gap.tie', { rank: above.rank, tokens: fmt.tokens(d) });
  const s = tr('gap.behind', { rank: above.rank, tokens: fmt.tokens(d) });
  if (onSummit(c)) return s;
  if (onSummit(above)) return `${s} · ${tr(stg ? 'gap.markIn' : 'gap.summitIn', { tokens: fmt.tokens(S - c.tokens) })}`;
  return `${s} · ${bodiesText(gapY(d, S))}`;
}

// Altitude (m) by the same scale as the wall (tokens and the on-screen S): the meters on the tag match
// the drawn height and the camp signs, even when the on-screen S is the rounded one.
function altitudeOf(tokens) {
  const m = state?.mountain;
  if (!m || !S) return 0;
  return m.baseAltitude + Math.min(1, Math.max(0, tokens) / S) * (m.summitAltitude - m.baseAltitude);
}

// Full and one-line tag, and the ranking plate. In the stage: today's tokens and the state (pace in
// the last hour, how long they have been resting or "no tokens today"); the yellow jersey (🟡) goes
// next to the name.
function fillTag(a, c, above) {
  const t = a.tagParts;
  const sum = onSummit(c);
  const stg = stageOn();
  const flag = stg ? '🏅' : '🚩';
  const name = nameOf(c);
  t.rank.textContent = `#${c.rank}`;
  t.name.textContent = c.jersey ? `${name} 🟡` : name;
  let ctok = ` · ${fmt.tokens(c.tokens, true)}`;
  if (sum) ctok = ` · ${flag} +${fmt.tokens(c.tokens - S, true)}`;
  else if (stg && !(c.tokens > 0)) ctok = ' · 💤';
  else if (stg) ctok += ` · ${c.state === 'climbing' ? fmt.pace(c.pace ?? 0) : tr('tag.resting')}`;
  t.ctok.textContent = ctok;
  t.ctok.classList.toggle('gold', sum);
  if (!stg) t.tok.textContent = `${fmt.tokens(c.tokens)} · ${fmt.meters(altitudeOf(c.tokens))}`;
  else t.tok.textContent = c.tokens > 0 ? tr('tag.todayState', { tokens: fmt.tokens(c.tokens), state: stateText(c) }) : `💤 ${tr('state.noTokensToday')}`;
  const gap = gapText(c, above);
  t.gap.textContent = gap;
  t.gap.hidden = !gap;
  t.sum.textContent = sum ? tr(stg ? 'tag.pastMark' : 'tag.pastSummit', { flag, tokens: fmt.tokens(c.tokens - S) }) : '';
  t.sum.hidden = !sum;
  a.tie = !!above && c.tokens > 0 && above.tokens - c.tokens < TIE;
  a.plate.textContent = c.rank;
  a.plate.dataset.id = c.id;
  a.plate.classList.toggle('tie', a.tie);
  a.plate.title = stg && !(c.tokens > 0)
    ? `#${c.rank} ${name} · ${tr('state.noTokensToday')}${c.weekRank ? ` · ${weekText(c)}` : ''}`
    : `#${c.rank} ${name} · ${stg ? tr('tag.todayState', { tokens: fmt.tokens(c.tokens), state: stateText(c) }) : fmt.tokens(c.tokens)}${a.tie ? tr('tag.tie') : ''}`;
  a.tagW = 0;
}

function applyState(now) {
  if (!state || !models.length) return;
  const stg = stageOn() ? state.stage : null;
  // scale: in the stage, the mark of the day (the fallback one, which follows the leader, is rounded in steps of
  // 5 M and only changes above 10%); without the stage, the stable season summit. On a change everything slides together.
  const newS = stg
    ? stableSummit(stg.mark, S, stg.markSource === 'fallback' ? 'projection' : 'fixed', 5e6)
    : stableSummit(state.season.summitTokens, S, state.season.summitSource);
  // day rollover: the new stage starts at base camp (whoever was on the wall rappels down)
  const day = stg?.day ?? null;
  const newDay = !!(day && stageDay && day !== stageDay);
  if (day) stageDay = day;
  const rescaled = S !== null && newS > 0 && newS !== S;
  if (rescaled) {
    ruler.from = rulerS(now);
    ruler.t0 = now;
    const body = fmt.tokens(tokensPerBody(newS));
    if (!newDay) toast(stg ? tr('toast.newMark', { mark: fmt.tokens(newS, true), body }) : tr('toast.newScale', { body }));
  }
  if (newDay) toast(tr('toast.newStage', { stage: stageTitle(stg) }));
  S = newS;
  ledges?.update(state.mountain, S);
  buildCampSigns();
  const top = wallList();
  if (stg) trackStage(top, newDay);
  assignLanes(top.filter((c) => !onSummit(c)).map((c) => ({ id: c.id, y: yLine(c.tokens, S) })));
  slotOf.clear();
  top.filter(onSummit).sort((p, q) => q.tokens - p.tokens).forEach((c, i) => slotOf.set(c.id, summitSlotAt(i)));
  const keep = new Set();
  top.forEach((c, i) => {
    keep.add(c.id);
    let a = actors.get(c.id);
    if (!a) {
      const idx = pickModel(c, top);
      if (idx < 0) return;
      const tp = requestTemplate(idx);
      if (!tp.tpl) return; // created when the model arrives
      a = createActor(c, tp.tpl);
      actors.set(c.id, a);
      a.slot = slotOf.get(c.id) ?? null;
      spawn(a, c, now);
    } else {
      a.slot = slotOf.get(c.id) ?? null;
      a.leaving = null; // back in the list mid-rappel: reaches the bottom and stays
      if (newDay) startDayReset(a, c, now);
      else updateClimber(a, c, now, rescaled);
    }
    const color = rankColor(c.rank);
    if (a.color !== color) {
      a.color = color;
      paintActor(a, color);
      a.tagWrap.style.setProperty('--c', color);
      a.plate.style.setProperty('--c', color);
    }
    a.data = c;
    a.above = top[i - 1] ?? null;
    fillTag(a, c, a.above);
    a.vest.visible = !!c.jersey; // yellow jersey: week leader
    updateTrailData(a, c);
  });
  for (const [id, a] of actors) if (!keep.has(id) && !a.leaving && !(newDay && startLeaving(a, now))) removeActor(a);
  for (const id of [...laneOf.keys()]) if (!keep.has(id)) laneOf.delete(id);
  updateSigns(top);
  updateDuels(top);
  updatePlaques(top);
  renderBoard(top);
  updateZoomButtons();
  updateHud();
  if (!cam.hadData) {
    cam.hadData = true;
    cam.snap = true; // first framing: direct, no animation
  } else if (cam.mode === 'level') cam.k = Math.min(cam.k, 2); // update: reframes slowly
  measureUI();
  maybeHideLoading();
}

// Changes the text of a sign in the world (and measures its width again, if it changed).
function setSign(s, title, sub) {
  const b = s.el.querySelector('b');
  const small = s.el.querySelector('small');
  if (b.textContent === title && small.textContent === sub) return;
  b.textContent = title;
  small.textContent = sub;
  s.w = 0;
}

// Top sign in the stage: explains the mark of the day or says who already passed it; count of who
// climbs below the frame and the base signs.
function updateStageSigns(top) {
  const stg = state.stage;
  const sign = $('#summit-sign');
  const leader = top[0];
  const passed = top.filter(onSummit).length;
  const src = esc(markSourceText(stg));
  const name = stageTitle(stg);
  const mark = fmt.tokens(S, true);
  sign.hidden = !S;
  // short first line (fits between the HUD and the links even at 1024 px); the explanation goes below
  if (!leader || !(leader.tokens > 0)) sign.innerHTML = `${tr('sign.markOfDay', { mark })}<small>${tr('sign.noOneYet', { src, stage: esc(name) })}</small>`;
  else if (passed > 0) {
    const who = plural(passed, 'sign.passed', { name: esc(shortOf(leader)) });
    sign.innerHTML = `🏅 ${who}<small>${tr('sign.leaderPast', { tokens: fmt.tokens(leader.tokens - S), mark, src })}</small>`;
  } else sign.innerHTML = `${tr('sign.markOfDay', { mark })}<small>${tr('sign.leaderTo', { src, tokens: fmt.tokens(S - leader.tokens), pct: fmt.percent(Math.floor((leader.tokens / S) * 100) / 100) })}</small>`;
  const shown = top.filter((c) => c.tokens > 0).length;
  const below = Math.max(0, (stg.activeToday ?? shown) - shown);
  const belowText = tr('sign.below', { n: fmt.int(below), rank: top.length });
  $('#below').hidden = below <= 0;
  $('#below').innerHTML = `▼ ${tr('sign.belowToday', { n: fmt.int(below), rank: top.length })}`;
  setSign(signs.base, `🏕️ ${tr('camp.base.name')}`, `${tr('sign.baseStage', { zero: fmt.tokens(0) })}${below > 0 ? ` · ${belowText}` : ''}`);
  const inCamp = top.filter((c) => !(c.tokens > 0)).length;
  signs.base.pos.copy(shown > 0 && inCamp >= top.length / 2 ? signs.base.mid : signs.base.side);
  setSign(signs.empty, tr('sign.emptyStage', { stage: name }), tr('sign.emptyStageSub'));
  signs.empty.pos.y = signs.empty.y0 + 3; // above whoever sleeps at the camp
  signs.empty.off = shown > 0;
}

// Text from the data inside innerHTML.
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// Summit sign (HUD), count of who is below and the base signs.
function updateSigns(top) {
  if (stageOn()) {
    updateStageSigns(top);
    return;
  }
  const sign = $('#summit-sign');
  const leader = top[0];
  const n = top.filter(onSummit).length;
  setSign(signs.empty, tr('sign.emptySeason'), tr('sign.emptySeasonSub'));
  signs.empty.pos.y = signs.empty.y0;
  if (!leader || !S) sign.hidden = true;
  else if (n > 0) {
    const sur = leader.tokens - S;
    const src = state.season.summitSource;
    const ref = tr(`sign.ref.${src === 'record' ? 'record' : src === 'projection' ? 'projection' : 'summit'}`);
    sign.hidden = false;
    sign.innerHTML = `${plural(n, 'sign.summitTaken', { tokens: fmt.tokens(sur) })}<small>${tr('sign.summitAbove', { pct: fmt.percent(Math.round((sur / S) * 100) / 100), ref, tokens: fmt.tokens(S, true) })}</small>`;
  } else {
    sign.hidden = false;
    sign.innerHTML = `${tr('sign.summitIn', { tokens: fmt.tokens(S - leader.tokens) })}<small>${tr('sign.summitInSub', { meters: fmt.meters(state.mountain.summitAltitude - altitudeOf(leader.tokens)) })}</small>`;
  }
  const below = top.length ? Math.max(0, state.team.participants - top.length) : 0;
  const belowText = tr('sign.below', { n: fmt.int(below), rank: top.length });
  $('#below').hidden = below <= 0;
  $('#below').textContent = `▼ ${belowText}`;
  setSign(signs.base, `🏕️ ${tr('camp.base.name')}`, `${fmt.tokens(0)} · ${fmt.meters(state.mountain.baseAltitude)}${below > 0 ? ` · ${belowText}` : ''}`);
  signs.base.pos.copy(signs.base.side);
  signs.empty.off = !(state && top.length === 0); // only with real data saying nobody climbed
}

// "+X M" balloon when the gain starts; off the frame, with the manual camera, an arrow on the edge.
function showGain(a, gained) {
  if (!(gained > 0)) return;
  if (!a.onScreen) {
    if (cam.mode !== 'level' && gained >= 0.5e6) edgeArrow(a, gained);
    return;
  }
  const el = document.createElement('div'); // wrapper (position); the animation lives in the child
  const inner = document.createElement('div');
  inner.className = 'gain';
  inner.textContent = `+${fmt.tokens(gained)}`;
  el.append(inner);
  const obj = new CSS2DObject(el);
  obj.position.copy(a.headPos).add(V(0, 0.9, 0));
  scene.add(obj);
  setTimeout(() => { scene.remove(obj); el.remove(); }, 2600);
}

// At most one arrow up and one down: whoever climbed off the frame goes into the same arrow
// ("↓ 7 climbed · biggest: #3 +12.0 M"); clicking focuses the biggest gain. Disappears 8 s after the last one.
const edges = { up: null, down: null };
function edgeArrow(a, gained) {
  const p = toScreenInto(_tp.set(a.x, a.y + HIP_BELOW, view.look.z), { x: 0, y: 0 });
  const dir = p.y < (safe.top + safe.bottom) / 2 ? 'up' : 'down';
  let e = edges[dir];
  if (!e) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `edge ${dir}`;
    el.title = tr('hint.closeUp');
    e = edges[dir] = { el, items: new Map(), timer: 0, best: null };
    const close = () => {
      clearTimeout(e.timer);
      el.remove();
      if (edges[dir] === e) edges[dir] = null;
    };
    e.close = close;
    el.addEventListener('click', () => {
      if (e.best) setFocus(e.best);
      close();
    });
    $('#edges').append(el);
  }
  e.items.set(a.id, (e.items.get(a.id) ?? 0) + gained);
  let best = null;
  for (const [id, g] of e.items) if (!best || g > best[1]) best = [id, g];
  e.best = best[0];
  const rank = actors.get(best[0])?.data?.rank ?? '?';
  const arrow = dir === 'up' ? '↑' : '↓';
  e.el.textContent = plural(e.items.size, 'edge.climbed', { arrow, rank, tokens: fmt.tokens(best[1]) });
  e.el.style.left = `${clamp((safe.left + safe.right) / 2, 130, innerWidth - 130)}px`;
  e.el.style.top = `${dir === 'up' ? safe.top - 46 : safe.bottom - 30}px`;
  clearTimeout(e.timer);
  e.timer = setTimeout(e.close, 8000);
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

// ---------- LIVE: events of the stage ----------
// Strip at the bottom, left of the zoom bar: overtakes in the stage, who passed the mark or
// reached a camp, who started climbing, new duels and the day rollover. With no news, it cycles the
// highlights (biggest climb of the last hour, how many are climbing, leader, yellow jersey, mark).
// Clicking a message about someone takes the camera to that person.
const tickerEl = $('#ticker');
const tickerMsg = $('#ticker-msg');
const ticker = { fresh: [], status: [], cur: null, at: 0, i: -1, swap: 0 };
const TICKER_MS = 7000; // time of each message
// urgent: goes to the front and shows up right away (the day rollover)
function tickerPush(text, id = null, urgent = false) {
  if (urgent) ticker.fresh.unshift({ text, id });
  else ticker.fresh.push({ text, id });
  if (ticker.fresh.length > 6) {
    if (urgent) ticker.fresh.pop();
    else ticker.fresh.shift();
  }
  if (urgent || !ticker.cur || ticker.cur.status) tickerNext(); // a highlight yields its turn right away
}
function tickerNext() {
  let m = ticker.fresh.shift() ?? null;
  if (!m && ticker.status.length) {
    ticker.i = (ticker.i + 1) % ticker.status.length;
    m = ticker.status[ticker.i];
  }
  ticker.at = Date.now();
  if (!m) return;
  ticker.cur = m;
  const show = () => {
    tickerMsg.textContent = m.text;
    tickerMsg.classList.remove('out', 'scroll');
    tickerEl.classList.toggle('link', !!m.id);
    tickerEl.title = m.id ? tr('hint.closeUp') : m.text;
    // larger than the strip: scrolls once to the end (no ellipsis) before the next message
    const over = tickerMsg.scrollWidth - tickerMsg.clientWidth;
    if (over > 4) {
      tickerMsg.style.setProperty('--dx', `${-Math.ceil(over) - 6}px`);
      void tickerMsg.offsetWidth; // restarts the animation
      tickerMsg.classList.add('scroll');
    }
  };
  clearTimeout(ticker.swap);
  if (tickerMsg.textContent === m.text || tickerEl.hidden) show();
  else {
    tickerMsg.classList.add('out');
    ticker.swap = setTimeout(show, 300);
  }
}
setInterval(() => { if (!tickerEl.hidden && Date.now() - ticker.at >= TICKER_MS) tickerNext(); }, 1000);
tickerEl.addEventListener('click', () => { if (ticker.cur?.id) setFocus(ticker.cur.id); });

// Compares the new stage with the previous one: events for the LIVE strip and how long ago each person stopped.
const prevStage = new Map(); // id → { rank, tokens, state } from the previous update
// "day|id" of whoever already had today's personal best announced: the LIVE strip announces once per person per
// day (and does not announce whoever had already passed it when the page opened)
const pbSaid = new Set();
// "day|id" of whoever passed the best but whose notice was left out (more than 4 news items at once):
// comes back on the next update
const pbWait = new Set();
const pbKey = (c) => `${state.stage.day}|${c.id}`;
const pbBeaten = (c) => c.pb?.tokens > 0 && c.tokens > c.pb.tokens;
function trackStage(top, newDay) {
  const stg = state.stage;
  const first = !prevStage.size;
  if (newDay) {
    prevStage.clear();
    restSince.clear();
    pbWait.clear();
    ticker.fresh.length = 0;
    tickerPush(tr('ticker.newStage', { stage: stageTitle(stg) }), null, true);
  } else if (prevStage.size) {
    const camps = (ledges?.list ?? []).map((k, i) => ({ n: k.n ?? i + 1, tokens: k.tokens }));
    const ev = []; // [priority, text, id, personal best?]
    for (const c of top) {
      const p = prevStage.get(c.id);
      // personal best: whoever passed it since the last update (or entered the wall already above
      // it). Whoever was already above it when the record arrived in the data is marked without a notice, like
      // whoever had already passed it when the page opened (below)
      if (pbBeaten(c) && !pbSaid.has(pbKey(c))) {
        if (!p || p.tokens <= c.pb.tokens || pbWait.has(pbKey(c))) ev.push([0.5, tr('ticker.pb', { who: shortOf(c), tokens: fmt.tokens(c.pb.tokens) }), c.id, true]);
        else pbSaid.add(pbKey(c));
      }
      if (!p || !(c.tokens > 0)) continue;
      // the fact first and only the first name: the strip is narrow (on a phone, about 45 letters)
      const who = shortOf(c);
      if (p.tokens < S && c.tokens >= S) ev.push([0, tr('ticker.passedMark', { who, mark: fmt.tokens(S, true) }), c.id]);
      else {
        const k = camps.filter((x) => p.tokens < x.tokens && c.tokens >= x.tokens).at(-1);
        if (k) ev.push([2, tr('ticker.camp', { camp: tr('camp.camp.name', { n: k.n }), tokens: fmt.tokens(k.tokens, true), who }), c.id]);
      }
      if (!(p.tokens > 0)) ev.push([3, tr('ticker.started', { who }), c.id]);
      else if (p.rank > c.rank && c.rank <= 10) {
        // whom they passed: the first one below them now who was above before
        const passed = top.find((o) => o.rank > c.rank && o.tokens > 0 && (prevStage.get(o.id)?.rank ?? Infinity) < p.rank);
        if (passed) ev.push([c.rank === 1 ? 0 : 1, tr(c.rank === 1 ? 'ticker.leads' : 'ticker.overtook', { who, other: shortOf(passed), rank: c.rank }), c.id]);
      }
    }
    // passing the mark and new leadership go to the front (the others, at the end of the queue)
    const best = ev.sort((p, q) => p[0] - q[0]).slice(0, 4).map(([prio, text, id, pb]) => ({ prio, pb, m: { text, id } }));
    const urgent = best.filter((e) => e.prio === 0).map((e) => e.m);
    ticker.fresh.unshift(...urgent);
    for (const e of best) if (e.prio !== 0) ticker.fresh.push(e.m);
    while (ticker.fresh.length > 6) ticker.fresh.splice(urgent.length, 1); // drops the oldest one in the queue
    // the personal best only counts as announced if the message stayed in the queue (cut by too many
    // news items, it comes back on the next update)
    const queued = new Set(best.filter((e) => e.pb && ticker.fresh.includes(e.m)).map((e) => e.m.id));
    for (const [, , id, pb] of ev) {
      if (!pb) continue;
      const k = `${stg.day}|${id}`;
      if (queued.has(id)) {
        pbSaid.add(k);
        pbWait.delete(k);
      } else pbWait.add(k);
    }
    if (best.length && (urgent.length || !ticker.cur || ticker.cur.status)) tickerNext();
  }
  if (first) for (const c of stg.climbers) if (pbBeaten(c)) pbSaid.add(pbKey(c)); // page opening: no notice
  // "resting for N min": we only know when we saw the person climbing before (stopped ~15 min before turning "resting")
  for (const c of stg.climbers) {
    if (c.state !== 'resting') restSince.delete(c.id);
    else if (!restSince.has(c.id) && prevStage.get(c.id)?.state === 'climbing') restSince.set(c.id, Date.now() - 15 * 60e3);
  }
  prevStage.clear();
  for (const c of stg.climbers) prevStage.set(c.id, { rank: c.rank, tokens: c.tokens, state: c.state });
  tickerStatus(top);
}

// Highlights that rotate in the LIVE strip when there is no news.
function tickerStatus(top) {
  const stg = state.stage;
  const out = [];
  const add = (text, id = null) => out.push({ text, id, status: true });
  const active = stg.climbers.filter((c) => c.tokens > 0);
  const onWall = new Set(stg.climbers.map((c) => c.id));
  if (!active.length) add(tr('ticker.empty', { stage: stageTitle(stg) }));
  else {
    // newer server: biggest climb and how many climb among everyone with tokens today; else, only the wall
    if (stg.fastest) {
      if (stg.fastest.pace > 0) add(tr('ticker.fastest', { who: shortOf(stg.fastest), tokens: fmt.tokens(stg.fastest.pace) }), onWall.has(stg.fastest.id) ? stg.fastest.id : null);
    } else {
      const fast = active.reduce((b, c) => ((c.pace ?? 0) > (b.pace ?? 0) ? c : b), active[0]);
      if (fast.pace > 0) add(tr('ticker.fastestWall', { who: shortOf(fast), tokens: fmt.tokens(fast.pace) }), fast.id);
    }
    if (Number.isFinite(stg.climbingNow)) {
      add(plural(stg.climbingNow, 'ticker.climbingNow', { active: fmt.int(stg.activeToday ?? active.length) }));
    } else {
      const n = active.filter((c) => c.state === 'climbing').length;
      add(tr('ticker.climbingWall', { n: fmt.int(n), total: fmt.int(stg.climbers.length) }));
    }
    const L = top[0];
    if (onSummit(L)) add(tr('ticker.leaderPast', { who: shortOf(L), tokens: fmt.tokens(L.tokens - S) }), L.id);
    else add(tr('ticker.leaderAt', { who: shortOf(L), tokens: fmt.tokens(L.tokens), pct: fmt.percent(Math.floor((L.tokens / S) * 100) / 100) }), L.id);
  }
  const yj = (state.climbers ?? []).find((c) => c.jersey);
  if (yj) add(tr('ticker.jersey', { who: shortOf(yj), tokens: fmt.tokens(yj.tokens), period: inPeriod(), wins: yj.stageWins ? ` · 🏅 ${fmt.int(yj.stageWins)}` : '' }), onWall.has(yj.id) ? yj.id : null);
  add(tr('ticker.mark', { mark: fmt.tokens(S, true), src: markSourceText(stg) }));
  ticker.status = out;
  if (!ticker.cur || (ticker.cur.status && !out.some((m) => m.text === ticker.cur.text))) tickerNext();
}

// ---------- Duels ----------
// Whoever catches the one above (stage place) in under 90 min, at the pace of both's last hour.
// At most two at a time (the closest), in a balloon next to the one chasing.
let duels = [];
const duelEls = [];
// When (simTime) the LIVE strip announced each duel ("id>target"): a duel that leaves the two closest
// and comes back (or only changes the estimated time) is not announced again within 30 min.
const duelSaid = new Map();
const DUEL_REPEAT_S = 30 * 60;
const etaText = (min) => fmt.duration({ m: min < 10 ? Math.max(1, Math.round(min)) : Math.round(min / 5) * 5, approx: true }); // "~15 min"
function updateDuels(top) {
  const before = new Set(duels.map((d) => `${d.id}>${d.target}`));
  for (const [k, t] of duelSaid) if (simTime - t >= DUEL_REPEAT_S) duelSaid.delete(k);
  duels = [];
  if (stageOn()) {
    for (let i = 1; i < top.length; i++) {
      const c = top[i];
      const up = top[i - 1];
      if (c.state !== 'climbing' || !(c.tokens > 0)) continue;
      const gap = up.tokens - c.tokens;
      const close = (c.pace ?? 0) - (up.pace ?? 0);
      if (gap < TIE || !(close > 0)) continue;
      const min = (gap / close) * 60;
      if (min <= 90) duels.push({ id: c.id, target: up.id, rank: c.rank, up: up.rank, min, who: c, upWho: up });
    }
    duels.sort((p, q) => p.min - q.min || p.rank - q.rank);
    duels = duels.slice(0, 2);
    for (const d of duels) {
      const k = `${d.id}>${d.target}`;
      if (before.has(k) || duelSaid.has(k)) continue;
      duelSaid.set(k, simTime);
      // the fact first; the names only where they fit (on a phone, only the places)
      tickerPush(`${tr('duel.text', { rank: d.rank, up: d.up, eta: etaText(d.min) })}${innerWidth > 640 ? ` (${shortOf(d.who)} × ${shortOf(d.upWho)})` : ''}`, d.id);
    }
  }
  while (duelEls.length < duels.length) {
    const el = document.createElement('div');
    el.className = 'duel';
    el.style.display = 'none';
    marksEl.append(el);
    duelEls.push({ el, shown: false, w: 0, h: 22 });
  }
  duels.forEach((d, i) => {
    const e = duelEls[i];
    const text = tr('duel.text', { rank: d.rank, up: d.up, eta: etaText(d.min) });
    if (e.el.textContent !== text) {
      e.el.textContent = text;
      e.w = 0;
    }
  });
}

// HUD: the week (with the countdown to its end) and the stage of the day with the mark. The LIVE strip
// and the list tabs only exist in the stage.
function updateHud() {
  if (!state) return;
  const stg = stageOn() ? state.stage : null;
  const season = state.season;
  $('#season-pre').hidden = !!stg;
  // in the stage, "Week 45" (the year is noise there); otherwise "Week 45, 2026" / "November 2026"
  $('#season').textContent = stg && season.kind === 'week' ? tr('hud.week', { n: season.week }) : fmt.period(season);
  $('#stage-line').hidden = !stg;
  if (stg) {
    $('#stage-name').textContent = stageTitle(stg);
    $('#stage-name').title = stageLong(stg);
    $('#stage-mark').textContent = fmt.tokens(S || stg.mark, true);
  }
  document.body.classList.toggle('has-ticker', !!stg);
  if (tickerEl.hidden === !!stg) {
    tickerEl.hidden = !stg;
    measureUI();
  }
}

// Signs for the camps, the base camp and the empty-season notice (DOM, pinned to points in the world).
const signs = { camps: [], key: '', base: null, empty: null };
function makeSign(cls, title, sub, pos) {
  const el = document.createElement('div');
  el.className = `sign ${cls}`;
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('small');
  s.textContent = sub;
  el.append(b, s);
  marksEl.append(el);
  return { el, pos, at: { x: 0, y: 0, z: 0 }, off: false, vis: null };
}
function buildCampSigns() {
  if (!signs.base) {
    // right of the last lane: enters the frame of the Top N levels when everyone is at the base
    const bx = LANE.x0 + LANE_SPAN + 2.2;
    const g = baseGround(bx);
    signs.base = makeSign('base', `🏕️ ${tr('camp.base.name')}`, fmt.tokens(0), V(bx, g.y + 1.6, g.zWall + 1.4));
    signs.base.side = signs.base.pos.clone();
    // at dawn (almost everyone sleeping at the base and the frame closed on the lanes): above the row
    // of those sleeping, in the middle of the lanes, above the plates
    const mx = LANE.x0 + LANE_SPAN / 2;
    const gm = baseGround(mx);
    signs.base.mid = V(mx, gm.y + 3.1, gm.zWall + 1.2);
    const e = baseGround(4);
    signs.empty = makeSign('empty', tr('sign.emptySeason'), tr('sign.emptySeasonSub'), V(4, e.y + 2.4, e.zWall + 1.2));
    signs.empty.y0 = e.y + 2.4;
    signs.empty.off = true; // loading or no data is not "nobody climbed"
  }
  // in the stage the camps are fractions of the mark of the day (in M and in % of the mark); without
  // it, altitude and M
  const stg = stageOn();
  const list = ledges?.list ?? [];
  const key = `${stg}|${list.map((c) => `${c.kind}${c.n}:${Math.round(c.tokens)}`).join('|')}`;
  if (key === signs.key) return;
  signs.key = key;
  for (const s of signs.camps) s.el.remove();
  const sub = (c) => (stg
    ? tr('sign.campStage', { tokens: fmt.tokens(c.tokens, true), pct: fmt.percent(Math.round((c.tokens / S) * 100) / 100) })
    : `${fmt.meters(c.altitude)} · ${fmt.tokens(c.tokens, true)}`);
  signs.camps = list.map((c) => Object.assign(makeSign('camp', `⛺ ${tr(`camp.${c.kind}.name`, { n: c.n })}`, sub(c), V(c.anchor.x, c.anchor.y + 1.3, c.anchor.z)), { camp: true }));
}

// ---------- Record plaques on the rock ----------
// Three kinds, all 3D objects fixed to the rock (./plaques.js), only in the stage and with the
// "🪧 Plaques" switch on (P key, ?plaques=0|1):
// - summit mural: a bronze plaque on a stone slab on the plateau, right of the flag and of whoever
//   passed the mark, with the records of the server history (the biggest stage, the biggest week and,
//   when it is another stage, the record of today's weekday). Those records sit far above the mark,
//   so they go on the mural and not at their height.
// - latest stages: small steel plates at the height where each of the last 5 stages was won
//   ("Mon 10/26 · 63.0 M"; the winner shows on hover). The ones past the mark sit on the top edge
//   ("↑ above"). Each goes to a free gap of the wall at that height: away from the bodies (with the
//   tag above the head), the trails, the pitons, the camps and the other plates; close heights sit
//   side by side.
// - personal best: a bronze piton in each one's lane, at the height of their best stage (pb). The
//   label "best: 29.0 M" (DOM, in layoutMarks) only shows in Top 5/Top 10 or with the person in focus.
//   When today's tokens pass the pb, the piton turns gold for the rest of the day (and the LIVE strip
//   says so once, in trackStage). A pb above the mark has no piton.
// Everything follows the ruler (rulerS) on a scale change, like the climbers.
const PREF_PLAQUES = 'climb.plaques';
const timesMark = (tokens) => tr('records.timesMark', { x: fmt.dec(tokens / S, 1, 1) });
const monthOf = (day) => clamp(Number(String(day ?? '').slice(5, 7)) - 1 || 0, 0, 11);

// Mural on the summit plateau: between the boulders at x = 7.7 and 12.7, right of the flag (x = 3.4) and
// of the spots of whoever passed the mark (up to x ≈ 7), a little behind the edge.
const MURAL = { x: 10.1, back: 0.6 };
const TOP_EDGE = -0.7; // top edge of the face (just below the summit lip): stages above the mark
const PLATE_PAD = 0.22; // gap between the plate and whatever it must not cover
let rockMaterial = null; // the wall's material (start), for the mural's slab
const plaq = {
  sys: null, // the 3D pieces (created with the first record data)
  has: false, // the stage brought some record (without it: no plaques, no switch)
  mural: null, // { lines, tip } (the canonical text, one line per record)
  plates: [], // latest stages: { key, day, id, name, tokens, text, tip, tx, x, dy, px, py, rect }
  pitons: [], // pitons: { id, c, tokens, gold, x, y, z, on, px, py }
  rects: [], // plaques on screen in the last frame: { p, r, kind }
  labels: [], // DOM labels of the pitons (reused)
  pbShown: [], // labels placed in the last frame: { b, r }
  tip: null, // tip (DOM) of the plaque under the mouse
  tap: null, // plaque tapped (phone): { p, until }
  fit: {},
  dirty: true,
};

// Mural text: canonical lines (for the tip and the debug) and the lines drawn on the plaque.
function muralContent(stg) {
  const r = stg.records;
  if (!r || (!r.stage && !r.week)) return null;
  const title = r.since ? tr('records.titleSince', { month: fmt.monthName(monthOf(r.since), 'short') }) : tr('records.title');
  const rows = [{ kind: 'title', text: `🏆 ${title}` }];
  const lines = [title];
  // on the plaque, each record in three lines: the big number, the name and (small) the day and the rest
  const add = (label, rec, rest) => {
    const name = nameOf(rec);
    rows.push({ kind: 'value', label, text: fmt.tokens(rec.tokens) }, { kind: 'name', text: name }, { kind: 'sub', text: rest });
    lines.push(`${label}: ${fmt.tokens(rec.tokens)} · ${name} · ${rest}`);
  };
  if (r.stage) add(tr('records.stage'), r.stage, `${fmt.dayShort(r.stage.day)} · ${timesMark(r.stage.tokens)}`);
  if (r.week) add(tr('records.week'), r.week, tr('records.weekOf', { date: fmt.dayMonth(r.week.start) }));
  // record of today's weekday: only when it is another stage (the server already sends null then)
  const wd = r.weekday;
  if (wd && !(r.stage && wd.day === r.stage.day && wd.id === r.stage.id)) add(tr('records.weekdayRecord', { weekday: fmt.weekday(stg.day) }), wd, `${fmt.dayMonth(wd.day)} · ${timesMark(wd.tokens)}`);
  return { rows, lines };
}

// Boxes (world) that a plate must not cover: each climber on the wall (from the feet to the
// tag above the head), the last hour's trail, the pitons and the camps (ledge, tent, sign).
function plaqueBlocks(top) {
  const out = [];
  for (const c of top) {
    if (onSummit(c)) continue;
    const x = laneXFor(c.id);
    const y = yLine(c.tokens, S);
    out.push({ x0: x - 0.85, x1: x + 0.85, y0: y - FEET_DROP - 0.35, y1: y + 1.7, what: `body #${c.rank}` });
    if (c.tokens > 0 && c.hourAgo >= 0 && c.hourAgo < c.tokens) out.push({ x0: x - 0.3, x1: x + 0.3, y0: yLine(c.hourAgo, S) - TRAIL_DROP - 0.2, y1: y - TRAIL_DROP, what: `trail #${c.rank}` });
    if (c.pb?.tokens > 0 && c.pb.tokens < S) {
      const yb = yLine(c.pb.tokens, S);
      out.push({ x0: x - 0.3, x1: x + 0.3, y0: yb - 0.3, y1: yb + 0.3, what: `piton #${c.rank}` });
    }
  }
  for (const k of ledges?.list ?? []) out.push({ x0: k.x0 - 0.4, x1: k.x1 + 0.4, y0: k.ledgeY - 1.2, y1: k.y + 1.8, what: `⛺ ${k.kind}${k.n}` });
  return out;
}

// Free center (x) for a w × h plate centered on y, the closest to `pref` (or null).
// Possible intervals = the strip of the face (from the cliff edge to before the camps) minus the boxes
// that touch its height.
function freeX(y, w, h, blocks, pref) {
  let lo = -Infinity;
  for (let k = -1; k <= 1; k++) lo = Math.max(lo, edgeX(Math.min(-1, y + k * h)) + 1.7); // rounded edge
  lo += w / 2;
  const hi = LANE.x0 + LANE_SPAN + 1.6 - w / 2; // right after the last lane (the ledges start at x ≈ 15.4)
  let spans = lo < hi ? [[lo, hi]] : [];
  for (const b of blocks) {
    if (b.y1 < y - h / 2 - PLATE_PAD || b.y0 > y + h / 2 + PLATE_PAD) continue;
    const a0 = b.x0 - w / 2 - PLATE_PAD;
    const a1 = b.x1 + w / 2 + PLATE_PAD;
    spans = spans.flatMap(([s0, s1]) => (a1 <= s0 || a0 >= s1 ? [[s0, s1]] : [[s0, Math.min(s1, a0)], [Math.max(s0, a1), s1]].filter(([p, q]) => q > p)));
  }
  let best = null;
  for (const [s0, s1] of spans) {
    const x = clamp(pref, s0, s1);
    if (best === null || Math.abs(x - pref) < Math.abs(best - pref)) best = x;
  }
  return best;
}

// New data: texts and places (the frame only moves up to them, updatePlaquesFrame).
function updatePlaques(top) {
  const stg = stageOn() ? state.stage : null;
  const recent = (stg?.recentStages ?? []).filter((r) => r && r.tokens > 0 && r.day).slice(0, 5);
  plaq.has = !!stg && (!!(stg.records?.stage || stg.records?.week) || recent.length > 0 || top.some((c) => c.pb?.tokens > 0));
  $('#t-plaques').hidden = !plaq.has;
  if (!plaq.has) {
    if (plaq.sys) plaq.sys.group.visible = false;
    plaq.plates = [];
    plaq.pitons = [];
    plaq.mural = null;
    return;
  }
  plaq.sys ??= createPlaques(scene, { rockMaterial, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  const sys = plaq.sys;
  plaq.dirty = true;
  // plaque text in the page font: if it has not arrived yet, redraw when it does
  if (!plaq.fontWait && !document.fonts.check('900 20px Nunito')) {
    plaq.fontWait = true;
    Promise.all(['900 20px Nunito', '700 20px Nunito'].map((f) => document.fonts.load(f))).then(() => {
      for (const p of [sys.mural, ...sys.plates]) p.key = '';
      sys.mural.placed = false;
      if (stageOn()) updatePlaques(wallList());
    }).catch(() => {});
  }
  // mural (only moves if its size changes)
  const m = muralContent(stg);
  // the same object from one update to the next (plaq.rects and the tap on the phone point to it)
  plaq.mural = m ? Object.assign(plaq.mural ?? {}, { lines: m.lines, tip: m.lines.join('\n') }) : null;
  sys.mural.mesh.visible = !!m;
  if (m) {
    if (sys.mural.setRows(m.rows) || !sys.mural.placed) placeMural();
  } else sys.hideSlab();
  // personal best pitons (in each one's lane; gold when today's tokens passed it)
  const prev = new Map(plaq.pitons.map((b) => [b.id, b]));
  plaq.pitons = top.filter((c) => c.pb?.tokens > 0).map((c) => {
    const b = prev.get(c.id) ?? { id: c.id, x: laneXFor(c.id), px: NaN, py: NaN };
    return Object.assign(b, { c, tokens: c.pb.tokens, gold: pbBeaten(c) });
  });
  // latest stages: the most recent ones pick a place first; whoever still fits where it is stays
  const blocks = plaqueBlocks(top);
  const pref = LANE.x0 + LANE_SPAN / 2;
  const old = new Map(plaq.plates.map((p) => [p.key, p]));
  plaq.plates = recent.map((r, i) => {
    const key = `${r.day}|${r.id}`;
    const above = r.tokens >= S;
    const text = `${fmt.dayShort(r.day)} · ${fmt.tokens(r.tokens)}${above ? ` ↑ ${tr('records.above')}` : ''}`;
    const pl = sys.plate(i);
    // on the plate, in two lines (the date on top, the tokens big); above the mark, the arrow goes on the number
    pl.setRows([{ kind: 'date', text: `${fmt.dayShort(r.day)}${above ? ` · ${tr('records.above')}` : ''}` }, { kind: 'big', text: `${above ? '↑ ' : ''}${fmt.tokens(r.tokens)}` }]);
    pl.mesh.visible = true;
    const p = old.get(key) ?? { key, x: null, px: NaN, py: NaN };
    Object.assign(p, {
      day: r.day, id: r.id, name: nameOf(r), tokens: r.tokens, text,
      tip: tr('records.plateTip', {
        stage: stageLong({ day: r.day }), tokens: fmt.tokens(r.tokens), name: nameOf(r),
        above: above ? tr('records.aboveToday', { tokens: fmt.tokens(r.tokens - S) }) : '',
      }),
    });
    const w = pl.w;
    const h = pl.h;
    const y = Math.min(yLine(r.tokens, S), TOP_EDGE - h / 2);
    // stays where it is if it still fits; otherwise the gap closest to the middle of the wall; with no gap at that
    // height, a step above or below (plates of similar heights sit side by side)
    let x = null;
    let dy = 0;
    const stay = p.x !== null ? freeX(y + (p.dy ?? 0), w, h, blocks, p.tx ?? p.x) : null;
    if (stay !== null && Math.abs(stay - (p.tx ?? p.x)) < 1e-3) { x = stay; dy = p.dy ?? 0; }
    for (const off of [0, -1, 1, -2, 2]) {
      if (x !== null) break;
      const yy = y + off * (h + 0.15);
      if (yy > TOP_EDGE - h / 2 + 1e-3) continue;
      const fx = freeX(yy, w, h, blocks, pref);
      if (fx !== null) { x = fx; dy = off * (h + 0.15); }
    }
    p.blocked = x === null; // no gap: stays in the middle, on top (shows up in plaques())
    p.tx = x ?? pref;
    p.dy = dy;
    p.x ??= p.tx;
    blocks.push({ x0: p.tx - w / 2, x1: p.tx + w / 2, y0: y + dy - h / 2, y1: y + dy + h / 2, what: `plaque ${text}` });
    return p;
  });
  for (let i = plaq.plates.length; i < sys.plates.length; i++) sys.plates[i].mesh.visible = false;
}

// Mural standing on the plateau: the slab (stone) with its base buried in the ground and the bronze plaque in front.
function placeMural() {
  const sys = plaq.sys;
  const p = sys.mural;
  const x = MURAL.x;
  let zf = Infinity;
  for (let k = -1; k <= 1; k += 0.5) zf = Math.min(zf, frontZ(x + (k * p.w) / 2));
  zf -= MURAL.back;
  let g0 = Infinity;
  let g1 = -Infinity;
  for (let k = -1; k <= 1; k += 0.25) {
    for (const back of [0, 0.6]) {
      const gy = groundY(x + (k * (p.w + 0.6)) / 2, zf - back);
      g0 = Math.min(g0, gy);
      g1 = Math.max(g1, gy);
    }
  }
  const y0 = g0 - 0.4;
  const top = g1 + 0.3 + p.h + 0.2;
  sys.setSlab(x, y0, zf, p.w + 0.55, top - y0, 0.6);
  p.place(x, g1 + 0.3 + p.h / 2, zf + 0.06, UP_Z); // in front of the slab's bites
  p.placed = true;
  plaq.muralTop = top; // the level framing opens a little so it fits (fitMural)
  plaq.muralBottom = g1 + 0.3;
  plaq.dirty = true;
}
const muralShown = () => plaq.has && ui.plaques && !!plaq.mural && !!plaq.sys?.mural.placed && stageOn();
const UP_Z = V(0, 0, 1);

// On every frame: plates and pitons slide into place (new lane, new scale together with the
// ruler). Matrices are only redone when something moved.
function updatePlaquesFrame(dt) {
  const sys = plaq.sys;
  if (!sys) return;
  const on = plaq.has && ui.plaques && stageOn();
  sys.group.visible = on;
  if (!on) return;
  const Sr = rulerS();
  const k = 1 - Math.exp(-dt * 4);
  let moved = plaq.dirty;
  plaq.plates.forEach((p, i) => {
    const pl = sys.plates[i];
    p.x += (p.tx - p.x) * k;
    if (Math.abs(p.tx - p.x) < 1e-3) p.x = p.tx;
    const y = Math.min(yLine(p.tokens, Sr), TOP_EDGE - pl.h / 2) + p.dy;
    if (plaq.dirty || !(Math.abs(p.x - p.px) < 1e-4 && Math.abs(y - p.py) < 1e-4)) {
      fitToRock(wallZ, p.x, y, pl.w, pl.h, plaq.fit);
      pl.place(p.x, y, plaq.fit.z, plaq.fit.normal);
      p.px = p.x;
      p.py = y;
      p.z = plaq.fit.z;
      moved = true;
    }
  });
  const list = [];
  for (const b of plaq.pitons) {
    // follows the lane (crosses sideways); on the summit the person has no lane: the piton stays where it was
    const tx = onSummit(b.c) ? b.x : laneXFor(b.id);
    b.x += (tx - b.x) * k;
    if (Math.abs(tx - b.x) < 1e-3) b.x = tx;
    b.on = b.tokens < Sr; // pb above the mark: no piton
    if (!b.on) continue;
    const y = yLine(b.tokens, Sr);
    if (!(Math.abs(b.x - b.px) < 1e-4 && Math.abs(y - b.py) < 1e-4)) { // (px NaN: new piton)
      b.z = Math.max(wallZ(b.x, y), wallZ(b.x, y - 0.12), wallZ(b.x - 0.06, y), wallZ(b.x + 0.06, y)) + 0.004;
      b.px = b.x;
      b.py = y;
      moved = true;
    }
    b.y = y;
    list.push(b);
  }
  // piton at least ~10 px on screen (from afar, a bronze dot; up close, the real size);
  // on a phone it thickens less (3× turned into an orange pill)
  const ppu = innerHeight > 0 ? ppuAt(view.dist) : 0;
  const scale = ppu > 0 ? clamp(10 / (0.4 * ppu), 1, innerWidth <= 640 ? 2 : 3) : 1;
  if (Math.abs(scale - (plaq.pitonScale ?? 0)) > 0.02 * scale) moved = true;
  if (!moved && list.length === sys.pitons.count) return;
  plaq.dirty = false;
  plaq.pitonScale = scale;
  plaq.pitonList = list; // the card photo redraws the pitons at real size (heroShot)
  let n = 0;
  if (plaq.mural && sys.mural.placed) n = sys.mural.bolts(sys.bolts, n);
  plaq.plates.forEach((p, i) => { n = sys.plates[i].bolts(sys.bolts, n); });
  sys.bolts.count = n;
  sys.bolts.instanceMatrix.needsUpdate = true;
  sys.setPitons(list, scale);
}

// Turns the plaques on and off (panel switch, P key, ?plaques=0|1; saved in the browser).
function setPlaques(on, save = true) {
  ui.plaques = on;
  $('#t-plaques').setAttribute('aria-pressed', String(on));
  if (save) writePref(PREF_PLAQUES, on);
  plaq.tap = null;
  plaq.dirty = true;
  cam.hold = null; // the level's frame includes (or not) the summit mural: frames again
}

// On-screen rectangle of a plaque's front (four projected corners); false if it is not in view.
const _pc = V();
const _pco = { x: 0, y: 0, z: 0 };
function plaqueRect(mesh, out) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [sx, sy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    _pc.set(sx, sy, 0.5).applyMatrix4(mesh.matrixWorld);
    toScreenInto(_pc, _pco);
    if (_pco.z > 1) return false;
    x0 = Math.min(x0, _pco.x);
    x1 = Math.max(x1, _pco.x);
    y0 = Math.min(y0, _pco.y);
    y1 = Math.max(y1, _pco.y);
  }
  Object.assign(out, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  return x1 > 0 && x0 < innerWidth && y1 > 0 && y0 < innerHeight;
}

// Plaques in view in this frame (so the tags dodge them, and for the mouse).
function measurePlaques() {
  plaq.rects.length = 0;
  const sys = plaq.sys;
  if (!sys?.group.visible) return plaq.rects;
  if (plaq.mural && sys.mural.placed) {
    const r = {};
    const seen = plaqueRect(sys.mural.mesh, r);
    // phone: the mural, almost all under the HUD panel (unreadable and with no touch), is hidden until it gets out of there
    const under = seen && innerWidth <= 640 && !!safe && uiRects.some((o) => o.y < safe.rawTop && overlap(r, o) > 0.4 * r.w * r.h);
    sys.mural.mesh.visible = !under;
    sys.hideSlab(under);
    if (seen && !under) plaq.rects.push({ p: plaq.mural, r, kind: 'mural' });
  }
  plaq.plates.forEach((p, i) => {
    const r = p.rect ?? (p.rect = {});
    p.onScreen = plaqueRect(sys.plates[i].mesh, r);
    if (p.onScreen) plaq.rects.push({ p, r, kind: 'stage' });
  });
  return plaq.rects;
}
const plaqueAt = (x, y) => plaq.rects.find(({ r }) => x >= r.x - 3 && x <= r.x + r.w + 3 && y >= r.y - 3 && y <= r.y + r.h + 3) ?? null;

// Tip of the plaque under the mouse (or tapped on the phone): the whole text and, on the stages, the winner.
function showPlaqueTip(hit, px, py) {
  if (!plaq.tip) {
    plaq.tip = document.createElement('div');
    plaq.tip.className = 'plaque-tip';
    plaq.tip.style.display = 'none';
    marksEl.append(plaq.tip);
  }
  const el = plaq.tip;
  if (!hit) {
    if (el.style.display !== 'none') el.style.display = 'none';
    return;
  }
  const fresh = el.style.display === 'none' || el.textContent !== hit.p.tip;
  if (el.textContent !== hit.p.tip) el.textContent = hit.p.tip;
  el.classList.toggle('bronze', hit.kind === 'mural');
  el.style.display = '';
  if (fresh) plaq.tipSize = [el.offsetWidth, el.offsetHeight]; // measures only when it changes
  const [w, h] = plaq.tipSize;
  const x = clamp((px ?? hit.r.x + hit.r.w / 2) - w / 2, 6, innerWidth - w - 6);
  let y = (py ?? hit.r.y) - h - 14;
  if (y < 6) y = (py ?? hit.r.y + hit.r.h) + 18;
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

// Text of a piton's label: the owner's place goes in front (the lanes are shared by up to three
// climbers, so the piton next to someone may belong to someone else).
const pbLabelText = (b) => tr(b.gold ? 'records.pbNew' : 'records.pb', { tokens: fmt.tokens(b.tokens) });

// Piton labels (DOM, after the tags: the data wins). Only in Top 5/Top 10 (or with manual zoom
// at least as close as Top 10, or in focus) for whoever is in the level with their body in
// view, and always for whoever is highlighted (mouse on the body or on the list, chosen, in focus). Names
// off: only the highlighted. At these close zooms, the pitons of those with no label are
// dimmed (real size, no glow): with no owner nearby, an orange dot only confused.
function layoutPbLabels(lit, focusIds, lim, avoid) {
  plaq.pbShown.length = 0;
  let used = 0;
  let dimmed = false;
  const sys = plaq.sys;
  if (sys?.group.visible && plaq.pitons.length) {
    let close = cam.mode === 'focus';
    if (cam.mode === 'level') close = ['top5', 'top10'].includes(effectiveLevel(cam.level));
    else if (cam.mode === 'manual') close = view.dist <= 1.05 * Math.exp(frameFor('level', 'top10').ld);
    const want = [];
    for (const b of plaq.pitons) {
      const c = b.c;
      const special = c.id === lit || c.id === pick.selected || focusIds.has(c.id);
      const own = special || (ui.names && c.rank <= lim && !!actors.get(c.id)?.m.on);
      const dim = close && !own;
      if (dim !== !!b.dim) {
        b.dim = dim;
        dimmed = true;
      }
      if (!b.on || !own || !(close || special)) continue;
      const p = toScreenInto(_pc.set(b.x, b.y, b.z), { x: 0, y: 0, z: 0 });
      if (p.z > 1 || p.x < 0 || p.x > innerWidth || p.y < safe.rawTop || p.y > innerHeight) continue;
      want.push({ b, p, special });
    }
    // highlighted first; then whoever beat the record today (the gold label is the news)
    want.sort((p, q) => q.special - p.special || q.b.gold - p.b.gold || p.b.c.rank - q.b.c.rank);
    for (const { b, p, special } of want) {
      const text = pbLabelText(b);
      const rank = `#${b.c.rank}`;
      const w = 22 + (rank.length + 1 + text.length) * (innerWidth <= 640 ? 5.6 : 6.1);
      const h = 19;
      let spot = null;
      for (const [x, y] of [[p.x + 9, p.y - h / 2], [p.x - 9 - w, p.y - h / 2], [p.x + 6, p.y + 7], [p.x + 6, p.y - h - 7], [p.x - w - 6, p.y + 7], [p.x - w - 6, p.y - h - 7], [p.x + 9, p.y + h + 9], [p.x + 9, p.y - 2 * h - 9]]) {
        const r = { x, y, w, h };
        if (x < 4 || x + w > innerWidth - 4 || y < safe.rawTop || y + h > innerHeight - 4) continue;
        if (avoid.some((o) => overlap(r, o) > 0) || plaq.pbShown.some((o) => overlap(r, o.r, 3) > 0)) continue;
        spot = r;
        break;
      }
      if (!spot && special) spot = { x: clamp(p.x + 9, 4, innerWidth - w - 4), y: p.y - h / 2, w, h }; // highlighted: shows even when tight
      if (!spot) continue;
      const el = plaq.labels[used] ?? (plaq.labels[used] = Object.assign(document.createElement('div'), { className: 'pb-tag' }));
      if (!el.isConnected) marksEl.append(el);
      const key = `${rank} ${text}`;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.replaceChildren(Object.assign(document.createElement('b'), { textContent: rank }), ` ${text}`);
        el.style.setProperty('--c', rankColor(b.c.rank));
      }
      el.classList.toggle('gold', b.gold);
      el.style.display = '';
      el.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
      plaq.pbShown.push({ b, r: spot });
      used++;
    }
  }
  if (dimmed && plaq.pitonList) sys.setPitons(plaq.pitonList, plaq.pitonScale ?? 1);
  for (let i = used; i < plaq.labels.length; i++) if (plaq.labels[i].style.display !== 'none') plaq.labels[i].style.display = 'none';
}

// Debug (climb.plaques()): each plaque with its text, where it is, whether it is in view and what it covers.
function plaquesDebug() {
  const sys = plaq.sys;
  const on = !!sys?.group.visible;
  measurePlaques(); // with the current camera (with the tab hidden, the last frame may be old)
  const r2 = (n) => +(+n).toFixed(2);
  const rr = (r) => r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  // on screen: what is under (or over) the rectangle r
  const screen = (r, self) => {
    if (!r) return [];
    const out = [];
    for (const a of actors.values()) if (a.data && a.m.on && overlap(r, a.m.rect) > 0) out.push(`body #${a.data.rank}`);
    for (const t of plaq.tagBoxes ?? []) if (overlap(r, t.r) > 0) out.push(`tag #${t.rank}`);
    for (const d of plaq.duelBoxes ?? []) if (overlap(r, d.r) > 0) out.push(`duel ${d.text}`);
    for (const s of plaq.signBoxes ?? []) if (overlap(r, s.r) > 0) out.push(`sign ${s.text}`);
    for (const o of uiRects) if (overlap(r, o) > 0) out.push('panel');
    for (const q of plaq.rects) if (q.p !== self && overlap(r, q.r) > 0) out.push(`plaque ${q.kind === 'mural' ? 'mural' : q.p.text}`);
    for (const l of plaq.pbShown) if (l.b !== self && overlap(r, l.r) > 0) out.push(`piton label #${l.b.c.rank}`);
    return out;
  };
  // in the world: the same boxes the placement uses (without its own)
  const blocks = stageOn() ? plaqueBlocks(wallList()) : [];
  const world = (x, y, w, h, skip = '') => blocks.filter((b) => b.what !== skip && b.x1 > x - w / 2 && b.x0 < x + w / 2 && b.y1 > y - h / 2 && b.y0 < y + h / 2).map((b) => b.what);
  const out = [];
  if (plaq.mural && sys?.mural.placed) {
    const q = plaq.rects.find((x) => x.p === plaq.mural);
    const m = sys.mural.mesh;
    out.push({
      kind: 'mural', text: plaq.mural.lines, world: { x: r2(m.position.x), y: r2(m.position.y), z: r2(m.position.z), w: r2(sys.mural.w), h: r2(sys.mural.h) },
      visible: on && m.visible, onScreen: !!q, screen: rr(q?.r), coversOnScreen: screen(q?.r, plaq.mural),
    });
  }
  plaq.plates.forEach((p, i) => {
    const pl = sys.plates[i];
    const q = plaq.rects.find((x) => x.p === p);
    out.push({
      kind: 'stage', text: p.text, tip: p.tip, world: { x: r2(p.x), y: r2(p.py), z: r2(p.z ?? 0), w: r2(pl.w), h: r2(pl.h) }, step: r2(p.dy), noGap: p.blocked,
      visible: on && pl.mesh.visible, onScreen: !!q, screen: rr(q?.r), coversOnScreen: screen(q?.r, p), coversInWorld: world(p.tx, p.py, pl.w, pl.h, `plaque ${p.text}`),
    });
  });
  for (const b of plaq.pitons) {
    const l = plaq.pbShown.find((x) => x.b === b);
    out.push({
      kind: 'best', rank: b.c.rank, name: nameOf(b.c), text: tr('records.pb', { tokens: fmt.tokens(b.tokens) }), gold: b.gold, dimmed: !!b.dim,
      world: b.on ? { x: r2(b.x), y: r2(b.y), z: r2(b.z) } : null, visible: on && b.on, label: l ? `#${b.c.rank} ${pbLabelText(b)}` : null,
      screen: rr(l?.r), coversOnScreen: screen(l?.r, b),
    });
  }
  return { on: ui.plaques, exist: plaq.has, inScene: on, plaques: out };
}

// ---------- Camera: zoom levels, manual zoom and drag, focus ----------

// Reference plane (z): the average depth of the hands of whoever is in frame. The ruler measures on this
// plane, and the rock's relief (±1 in z) only shifts each one a few px from the ruler.
const LOOK_Z = -0.4;
// Camera with no tilt (only a slight yaw) and with the "eye" at the average height of the hands of whoever is
// in frame; the framing comes from a lens shift (off-axis projection). That way the ruler
// is exactly linear and the rock's relief barely shifts anyone off the line of their tokens.
const CAM_DIR = V(-0.06, 0, 1).normalize();
const FOV_TAN = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const DIST_MIN = 3.1 / FOV_TAN; // as close as possible: ~6 u of wall at screen height
const IDLE_S = 90; // after 90 s untouched, goes back to the default level
const LEVELS = ['top5', 'top10', 'top25', 'wall'];
const LEVEL_N = { top5: 5, top10: 10, top25: 25 };
const STORE_KEY = 'climb.zoom';
const ppuAt = (dist) => innerHeight / 2 / (dist * FOV_TAN); // px per unit on the framed plane

function storedLevel() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return LEVELS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function storeLevel(l) {
  try { localStorage.setItem(STORE_KEY, l); } catch { /* no storage: fine */ }
}

const urlZoom = LEVELS.includes(PARAMS.get('zoom')) ? PARAMS.get('zoom') : null;
const cam = {
  mode: 'level', // 'level' (follows a level) | 'manual' (zoom/drag) | 'focus' (a climber and whoever is above)
  level: urlZoom ?? storedLevel() ?? 'top5',
  home: urlZoom ?? storedLevel() ?? 'top5', // default level (goes back to it after 90 s idle)
  focusId: null,
  cur: null, // current { x, y, ld } (ld = log of the distance: symmetric zoom)
  tgt: { x: 4, y: -25, z: LOOK_Z, ey: -25, ld: Math.log(90) },
  k: 5,
  vel: 0, // drag inertia (units/s), vertical
  velX: 0, // and lateral
  fly: null,
  lastInput: 0,
  snap: true,
  hadData: false,
  hold: null, // the level's still frame (levelTarget)
};

// The level that actually applies with N climbers (levels that would frame the same group disappear).
function effectiveLevel(l) {
  const n = wallList().length;
  if (!n || !S) return 'wall';
  if (l === 'top25' && n <= 10) l = 'top10';
  if (l === 'top10' && n <= 5) l = 'top5';
  return l;
}

// Box (world) of a climber from the data (target), never from the animation: the zoom does not jump during the climb.
function climberExt(c, e) {
  if (onSummit(c)) {
    const s = slotOf.get(c.id) ?? summitSlotAt(0);
    e.y0 = Math.min(e.y0, -0.3);
    e.y1 = Math.max(e.y1, (FLAG.top ?? 2.6) + 0.4);
    e.x0 = Math.min(e.x0, s.x - 0.7);
    e.x1 = Math.max(e.x1, s.x + 0.7, FLAG.x + 1.3);
    e.zs += frontZ(s.x) - 1.2 - s.back;
    e.zn++;
    return;
  }
  const y = yLine(c.tokens, S);
  const x = laneXFor(c.id);
  e.y0 = Math.min(e.y0, y - FEET_DROP - 0.2);
  e.y1 = Math.max(e.y1, y + 0.45);
  e.x0 = Math.min(e.x0, x - 0.9);
  e.x1 = Math.max(e.x1, x + 0.9);
  e.zs += wallZ(x, y) + HAND_OFF; // hand depth (the frame's reference plane)
  e.zn++;
  e.ys += y; // average hand height: where the camera's eye is
  e.yn++;
}

// Whole wall: the face and, on wide screens, also the shoulder that descends to the right (from afar the
// mountain reads as a massif, not as a tower).
const WALL_EXT = () => (safe?.wide
  ? { x0: EDGE_MIN - 1, x1: 34, y0: BASE_LEDGE_Y - 0.6, y1: (FLAG.top ?? 2.6) + 0.4 }
  : { x0: -8.5, x1: 20, y0: BASE_LEDGE_Y - 0.6, y1: (FLAG.top ?? 2.6) + 0.4 });
// leftmost x of the cliff edge (the ruler stays to the left of it)
const EDGE_MIN = (() => {
  let m = Infinity;
  for (let y = BASE_LEDGE_Y - 2; y <= 0; y += 0.5) m = Math.min(m, edgeX(y));
  return m;
})();

// Distance that makes the box fit in the free area (outside the HUD), on both axes.
function fitDist(e) {
  if (!safe) measureUI();
  const H = innerHeight;
  const halfW = Math.max(60, (safe.right - safe.left) / 2);
  const halfH = Math.max(60, (safe.bottom - safe.top) / 2);
  const dy = (((e.y1 - e.y0) / 2 + 0.25) * (H / 2)) / (halfH * FOV_TAN);
  const dx = (((e.x1 - e.x0) / 2 + 0.4) * (H / 2)) / (halfW * FOV_TAN);
  return 1.04 * Math.max(dx, dy);
}
const distMax = () => 1.15 * fitDist(WALL_EXT());

// Camera target { x, y, ld } for a level (or for the focus on a climber). `head`: headroom (units)
// above the highest one, for where the group is going to climb (levelTarget). `raw`: the group's box
// without headroom or minimum, to check whether it still fits in the still frame.
function frameFor(mode, level, focusId = null, head = 0) {
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, zs: 0, zn: 0, ys: 0, yn: 0 };
  const list = wallList();
  let minSpan = 9;
  if (S && list.length) {
    if (mode === 'focus') {
      const i = list.findIndex((c) => c.id === focusId);
      if (i >= 0) {
        climberExt(list[i], e);
        if (i > 0) climberExt(list[i - 1], e);
        minSpan = 6;
      }
    } else {
      const lv = effectiveLevel(level);
      if (lv !== 'wall') for (const c of list.slice(0, LEVEL_N[lv])) climberExt(c, e);
    }
  }
  const raw = { x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 };
  // headroom on top, not past the flag (whoever is already on the summit does not need it)
  if (head > 0 && Number.isFinite(e.y1)) e.y1 = Math.max(e.y1, Math.min(e.y1 + head, (FLAG.top ?? 2.6) + 0.4));
  let whole = false;
  if (!Number.isFinite(e.y0)) { // whole wall (or nobody yet): fixed frame, base → flag
    whole = true;
    Object.assign(e, WALL_EXT());
    const t = { x0: 0, x1: 0, y0: 0, y1: 0, zs: 0, zn: 0, ys: 0, yn: 0 };
    if (S) for (const c of list) climberExt(c, t); // only the average depth and height of everyone
    e.zs = t.zs;
    e.zn = t.zn;
    e.ys = t.ys;
    e.yn = t.yn;
    minSpan = 0;
  }
  if (e.y1 - e.y0 < minSpan) {
    const c = (e.y0 + e.y1) / 2;
    e.y0 = Math.max(BASE_LEDGE_Y - 0.6, c - minSpan / 2); // season start: anchors to the base ground
    e.y1 = e.y0 + minSpan;
  }
  let d = clamp(fitDist(e), DIST_MIN, distMax());
  let cy = (e.y0 + e.y1) / 2;
  let x = (e.x0 + e.x1) / 2;
  if (mode === 'level' && !whole && head > 0) [d, cy] = fitMural(e, x, d, cy);
  // whole wall on a wide screen: the mountain closer to the middle of the screen (the shoulder on the right shows)
  if (whole && safe?.wide) x = 9 + ((safe.left + safe.right) / 2 - innerWidth * 0.56) / ppuAt(d);
  return { x, y: cy, z: e.zn ? e.zs / e.zn : LOOK_Z, ey: e.yn ? e.ys / e.yn : cy, ld: Math.log(d), raw, whole };
}

// In a Top N level, the summit mural showing halfway (the top cut at the screen's top edge or
// under a HUD panel): the frame opens a little so it fits whole, if it costs little (up to
// MURAL_FIT_MAX farther). Returns [distance, center y], the same ones when it is not needed or not worth it.
const MURAL_FIT_MAX = 1.15;
function fitMural(e, x, d, cy) {
  // on the phone, no: there the mural is unreadable anyway (under the HUD it disappears, measurePlaques)
  if (!muralShown() || !safe || innerWidth <= 640) return [d, cy];
  const sx = (safe.left + safe.right) / 2;
  const sy = (safe.top + safe.bottom) / 2;
  const yAt = (py, dd, c) => c + (sy - py) / ppuAt(dd); // world height at the screen line py
  const w = plaq.sys.mural.w / 2 + 0.3;
  // top limit: the screen's edge, or the bottom of the HUD panel that sits over the mural
  const limit = (dd) => {
    const mx = sx + (MURAL.x - x) * ppuAt(dd);
    const hw = w * ppuAt(dd);
    let y = 0;
    for (const r of uiRects) if (r.y < safe.rawTop && r.x < mx + hw && r.x + r.w > mx - hw) y = Math.max(y, r.y + r.h);
    return y + 6;
  };
  const top = plaq.muralTop;
  if (!(yAt(0, d, cy) > plaq.muralBottom + 0.6 && yAt(limit(d), d, cy) < top)) return [d, cy];
  // how much to raise the group's box (the minimum, by bisection: the visible top rises with it)
  const frame = (dy) => {
    const e2 = { ...e, y1: e.y1 + dy };
    const dd = clamp(fitDist(e2), DIST_MIN, distMax());
    return [dd, (e2.y0 + e2.y1) / 2];
  };
  const fits = ([dd, c]) => yAt(limit(dd), dd, c) >= top;
  let lo = 0;
  let hi = 2 * (top - yAt(limit(d), d, cy)); // with the distance held, the top rises half of that
  if (!fits(frame(hi))) return [d, cy];
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (fits(frame(mid))) hi = mid;
    else lo = mid;
  }
  const [d2, cy2] = frame(hi);
  return d2 <= MURAL_FIT_MAX * d ? [d2, cy2] : [d, cy];
}

// In a Top N level the camera does not follow the group frame by frame: it stays still, with headroom on top, and only
// reframes (all at once, with the normal damping) when someone gets near the edge, the group
// shrinks a lot or the scale/screen changes. That way whoever climbs climbs on screen too: before, the leader was
// stuck at the top edge and the wall ran beneath them (≈1 px of movement in an hour).
const HOLD_EDGE_PX = 16; // reframes when the highest one gets within ~16 px of the top of the free area (which already reserves the tag)
const HOLD_AHEAD_H = 0.5; // the headroom covers ~30 min of climbing by the fastest one in the level
function levelTarget() {
  const fresh = frameFor('level', cam.level);
  if (fresh.whole || !safe || !S) {
    cam.hold = null;
    return fresh;
  }
  const lv = effectiveLevel(cam.level);
  const h = cam.hold;
  const sameView = h && h.level === lv && h.S === S && h.W === innerWidth && h.H === innerHeight
    && Math.abs(h.top - safe.top) < 12 && Math.abs(h.bottom - safe.bottom) < 12 && Math.abs(h.left - safe.left) < 12;
  if (sameView && holdFits(h.tgt, fresh)) return h.tgt;
  // headroom on top: how much the fastest one in the level climbs in ~30 min at the last hour's pace (without the
  // stage, 20% of the group's height); at least ~60 px (the margin plus a bit, otherwise it would reframe
  // again right away) and at most 30% of the group's height (the zoom does not open too much on the phone)
  const span = Math.max(9, fresh.raw.y1 - fresh.raw.y0);
  const minHead = (HOLD_EDGE_PX + 44) / ppuAt(Math.exp(fresh.ld));
  let ahead = 0.2 * span;
  if (stageOn()) ahead = gapY(Math.max(0, ...wallList().slice(0, LEVEL_N[lv] ?? 25).map((c) => c.pace ?? 0)) * HOLD_AHEAD_H, S);
  const head = clamp(ahead, minHead, Math.max(minHead, 0.3 * span));
  const tgt = frameFor('level', cam.level, null, head);
  cam.hold = { level: lv, S, W: innerWidth, H: innerHeight, top: safe.top, bottom: safe.bottom, left: safe.left, tgt };
  return tgt;
}
// Does the current group (`fresh.raw`) still fit in the still frame `t`, with the top margin? And has it not become
// too small in it (someone left the level, the group came together)?
function holdFits(t, fresh) {
  const d = Math.exp(t.ld);
  const ppu = ppuAt(d);
  const sx = (safe.left + safe.right) / 2;
  const sy = (safe.top + safe.bottom) / 2;
  const r = fresh.raw;
  const viewTop = t.y + (sy - safe.top) / ppu;
  const bottom = t.y - (safe.bottom - sy) / ppu;
  const left = t.x - (sx - safe.left) / ppu;
  const right = t.x + (safe.right - sx) / ppu;
  // someone on the summit: the box goes up to the flag, which no longer rises (it only needs to fit); otherwise, the margin
  const atFlag = r.y1 >= (FLAG.top ?? 2.6) + 0.39;
  const top = atFlag ? viewTop + 0.3 : viewTop - HOLD_EDGE_PX / ppu;
  if (r.y1 > top || r.y0 < bottom || r.x0 < left || r.x1 > right) return false;
  return Math.exp(fresh.ld) > 0.6 * d; // the current tight framing is still similar
}

// Starts going to a new target: damped (k) or, if the distance changes by more than 2×, a 0.9 s flight.
function beginMove(k, fly = true) {
  cam.k = k;
  cam.hold = null; // level chosen now: reframes
  const f = cam.mode === 'focus' ? frameFor('focus', null, cam.focusId) : levelTarget();
  cam.fly = fly && cam.cur && Math.abs(f.ld - cam.cur.ld) > Math.LN2 ? { t0: simTime, dur: 0.9, from: { ...cam.cur } } : null;
}

// how: 'user' (button/key: becomes the default and is saved), 'idle', 'tour', 'debug', 'auto'.
function setLevel(level, how = 'user') {
  if (!LEVELS.includes(level)) return;
  cam.mode = 'level';
  cam.level = level;
  cam.focusId = null;
  cam.vel = cam.velX = 0;
  if (how === 'user') {
    cam.home = level;
    storeLevel(level);
  }
  if (how !== 'idle' && how !== 'tour') cam.lastInput = simTime;
  beginMove(how === 'idle' || how === 'tour' ? 2.5 : 5);
  updateZoomButtons();
}

function setFocus(id) {
  if (!id || !wallList().some((c) => c.id === id)) return;
  cam.mode = 'focus';
  cam.focusId = id;
  cam.vel = cam.velX = 0;
  cam.lastInput = simTime;
  pick.selected = id;
  beginMove(5);
  updateZoomButtons();
}

function cycleFocus(dir) {
  const list = wallList();
  if (!list.length) return;
  const i = cam.mode === 'focus' ? list.findIndex((c) => c.id === cam.focusId) : dir > 0 ? -1 : 0;
  setFocus(list[(i + dir + list.length) % list.length].id);
}

// Manual mode: starts from where the camera is heading; no level stays lit.
function toManual(k = 12) {
  if (cam.mode !== 'manual') {
    cam.mode = 'manual';
    cam.focusId = null;
    cam.tgt = { ...(cam.tgt ?? cam.cur) };
    updateZoomButtons();
  }
  cam.fly = null;
  cam.k = k;
  cam.lastInput = simTime;
}
// How far the view's center moves sideways: from the sky left of the cliff to the mountain's shoulder.
const PAN_X = [EDGE_MIN - 8, 40];
function clampTarget() {
  cam.tgt.x = clamp(cam.tgt.x, PAN_X[0], PAN_X[1]);
  const y = clamp(cam.tgt.y, BASE_LEDGE_Y - 2, FLAG.top ?? 2.6);
  cam.tgt.ey += y - cam.tgt.y; // the eye moves along with the center
  cam.tgt.y = y;
  cam.tgt.ld = clamp(cam.tgt.ld, Math.log(DIST_MIN), Math.log(distMax()));
}
// f > 1 zooms out. With `py` (the pointer's y on screen), the world point under the pointer stays still.
function zoomBy(f, py = null, k = 12) {
  toManual(k);
  cam.vel = cam.velX = 0; // explicit command for the drag inertia
  const d0 = Math.exp(cam.tgt.ld);
  const d1 = clamp(d0 * f, DIST_MIN, distMax());
  if (py !== null && view.sy !== null) {
    const yUnder = cam.tgt.y + (view.sy - py) / ppuAt(d0);
    const dy = (yUnder - cam.tgt.y) * (1 - d1 / d0);
    cam.tgt.y += dy;
    cam.tgt.ey += dy;
  }
  cam.tgt.ld = Math.log(d1);
  clampTarget();
}
function panBy(dy, k = 12) {
  toManual(k);
  cam.vel = cam.velX = 0;
  cam.tgt.y += dy;
  cam.tgt.ey += dy;
  clampTarget();
}
function panSideBy(dx, k = 12) {
  toManual(k);
  cam.vel = cam.velX = 0;
  cam.tgt.x += dx;
  clampTarget();
}
// View height in world units (free area).
const viewSpan = () => (safe.bottom - safe.top) / ppuAt(Math.exp(cam.tgt.ld));

function updateZoomButtons() {
  const n = wallList().length;
  const show = { top5: n > 0, top10: n > 5, top25: n > 10, wall: true };
  const text = {
    top5: tr(n <= 5 ? 'zoom.all' : 'html.zoom.top5'),
    top10: tr(n <= 10 ? 'zoom.all' : 'html.zoom.top10'),
    top25: tr(n < 25 ? 'zoom.all' : 'html.zoom.top25'),
    wall: tr('html.zoom.wall'),
  };
  const on = cam.mode === 'level' ? effectiveLevel(cam.level) : null;
  for (const b of document.querySelectorAll('#zoom [data-level]')) {
    const l = b.dataset.level;
    b.hidden = !show[l];
    b.textContent = text[l];
    b.classList.toggle('on', l === on);
    b.setAttribute('aria-pressed', String(l === on));
  }
}

const mouse = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / innerWidth - 0.5;
  mouse.y = e.clientY / innerHeight - 0.5;
});

// HUD rectangles (the tags dodge them) and the free area where the group is framed.
// On wide screens the group sits on the right (cliff) and there is sky left over on the left, where the ruler is;
// on narrow screens the HUD crosses the top and the ruler goes to the right edge.
let uiRects = [];
let safe = null;
function measureUI() {
  const W = innerWidth;
  const H = innerHeight;
  // LIVE strip at the bottom left: on a wide screen it goes up to the zoom bar (centered); narrow, the CSS handles it
  const zr = $('#zoom').getBoundingClientRect();
  if (W > 900 && zr.width > 0) tickerEl.style.setProperty('--ticker-max', `${Math.max(180, Math.round(zr.left - 28))}px`);
  else tickerEl.style.removeProperty('--ticker-max');
  // mark/summit sign (top, middle): on screens from 901 to ~1120 px it touched the HUD; it sits
  // between the HUD and the links, wrapping the line if needed
  const sign = $('#summit-sign');
  if (W > 900 && !sign.hidden) {
    sign.style.left = '';
    sign.style.maxWidth = '';
    const hr = $('.hud').getBoundingClientRect();
    const lr = $('.links').getBoundingClientRect();
    const sr = sign.getBoundingClientRect();
    const lo = hr.right + 12;
    const hi = (lr.width > 0 ? lr.left : W) - 12;
    if (sr.width > 0 && (sr.left < lo || sr.right > hi)) {
      sign.style.maxWidth = `${Math.max(200, Math.round(hi - lo))}px`;
      sign.style.left = `${Math.round((lo + hi) / 2)}px`;
    }
  } else {
    sign.style.left = '';
    sign.style.maxWidth = '';
  }
  const rects = ['.hud', '.links', '#summit-sign', '#below', '#error', '#zoom', '#ticker']
    .map((s) => $(s))
    .filter((el) => el && !el.hidden)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0);
  uiRects = rects.map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
  const wide = W / H > 1.2 && W >= 900;
  const left = wide ? W * 0.4 : 16;
  const right = W - (wide ? 16 : 50);
  let top = wide ? 62 : 16;
  let bottom = H - 16;
  for (const r of rects) {
    if (r.right < left || r.left > right) continue; // does not cross the group's strip
    if (r.bottom < H * 0.5) top = Math.max(top, r.bottom + 6);
    else bottom = Math.min(bottom, r.top - 8);
  }
  const label = wide ? 58 : 38; // room for the tag above the highest head
  const hud = $('.hud').getBoundingClientRect();
  // Ranking list: just below the HUD. The tags dodge it, but it does not change the free area
  // (it is a panel that opens and closes; the framing does not jump because of it).
  const board = $('#board');
  board.style.setProperty('--board-top', `${Math.round(hud.bottom + 10)}px`);
  // narrow screens: the list ends above whatever sits at the bottom (mark/summit sign, LIVE strip, zoom),
  // which changes height with the text
  if (W <= 900) {
    let lim = H;
    for (const s of ['#summit-sign', '#ticker', '#zoom', '.links']) {
      const el = $(s);
      const r = el && !el.hidden ? el.getBoundingClientRect() : null;
      if (r && r.height > 0 && r.top > H * 0.5) lim = Math.min(lim, r.top);
    }
    // landscape phone (little height): if less than ~120 px is left, the list goes down over the
    // bottom controls (the zoom bar sits on top of it) instead of becoming a sliver with no rows
    const top = hud.bottom + 10;
    board.style.bottom = lim - 10 - top >= 120 ? `${Math.round(H - lim + 10)}px` : `${Math.round(Math.max(10, H - top - 160))}px`;
  } else board.style.bottom = '';
  // the list and the ❔ help panel: the tags avoid them, the framing does not move for them
  for (const el of [board, $('#help')]) {
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0) uiRects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
  safe = { wide, left, right, top: top + label, bottom: Math.max(top + label + 120, bottom), rulerX: wide ? left - 18 : W - 14, rawTop: top, hudRight: hud.right };
}

const view = { look: V(4, -25, LOOK_Z), dist: 90, sx: null, sy: null, focus: null };
const _cam = V();

function updateCamera(dt) {
  const W = innerWidth;
  const H = innerHeight;
  // Window with no size (minimized tab, hidden iframe): there is nothing to frame, and the distance would give
  // log(0). The resize for when it gets a size again measures the free area anew.
  if (!W || !H) return;
  if (!safe) measureUI();
  // debug: climb.closeup(rank) brings the camera close to a climber
  const fa = view.focus && [...actors.values()].find((a) => a.data?.rank === view.focus.rank);
  if (fa) {
    view.look.copy(fa.headPos).addScaledVector(UP, view.focus.dy);
    view.dist = view.focus.dist;
    camera.clearViewOffset();
    camera.near = 0.3;
    camera.updateProjectionMatrix();
    camera.position.copy(view.look).addScaledVector(view.focus.dir, view.dist);
    camera.lookAt(view.look);
    camera.updateMatrixWorld();
    env.setViewDistance(view.dist);
    placeShadow(6);
    return;
  }
  // target: level or focus (recomputed from the data), or manual (user input + inertia)
  if (cam.mode === 'focus' && !wallList().some((c) => c.id === cam.focusId)) setLevel(cam.home, 'auto');
  if (cam.mode === 'level') cam.tgt = levelTarget();
  else if (cam.mode === 'focus') cam.tgt = frameFor('focus', null, cam.focusId);
  else if (!drag.panning && (Math.abs(cam.vel) > 1e-3 || Math.abs(cam.velX) > 1e-3)) {
    cam.tgt.y += cam.vel * dt;
    cam.tgt.x += cam.velX * dt;
    const decay = Math.exp(-dt * 5);
    cam.vel *= decay;
    cam.velX *= decay;
    clampTarget();
  }
  if (cam.mode !== 'level' && simTime - cam.lastInput > IDLE_S) setLevel(cam.home, 'idle');
  const tg = cam.tgt;
  if (!cam.cur || cam.snap || !Number.isFinite(cam.cur.ld)) {
    cam.cur = { ...tg };
    cam.snap = false;
    cam.fly = null;
  } else if (cam.fly) { // flight: zooming out, first the zoom and then the shift; zooming in, the opposite
    const s = (simTime - cam.fly.t0) / cam.fly.dur;
    const f = cam.fly.from;
    if (s >= 1) {
      cam.fly = null;
      Object.assign(cam.cur, tg);
    } else {
      const out = tg.ld > f.ld;
      const kz = easeInOut(clamp(out ? s / 0.6 : (s - 0.4) / 0.6, 0, 1));
      const kp = easeInOut(clamp(out ? (s - 0.4) / 0.6 : s / 0.6, 0, 1));
      cam.cur.ld = lerp(f.ld, tg.ld, kz);
      cam.cur.x = lerp(f.x, tg.x, kp);
      cam.cur.y = lerp(f.y, tg.y, kp);
      cam.cur.ey = lerp(f.ey, tg.ey, kp);
      cam.cur.z = lerp(f.z, tg.z, kp);
    }
  } else {
    const k = 1 - Math.exp(-dt * cam.k);
    cam.cur.x += (tg.x - cam.cur.x) * k;
    cam.cur.y += (tg.y - cam.cur.y) * k;
    cam.cur.z += (tg.z - cam.cur.z) * k;
    cam.cur.ey += (tg.ey - cam.cur.ey) * k;
    cam.cur.ld += (tg.ld - cam.cur.ld) * k;
  }
  const dist = Math.exp(cam.cur.ld);
  view.dist = dist;
  view.look.set(cam.cur.x, cam.cur.y, cam.cur.z ?? LOOK_Z);
  const ks = 1 - Math.exp(-dt * 5);
  const sx = (safe.left + safe.right) / 2;
  const sy = (safe.top + safe.bottom) / 2;
  view.sx = view.sx === null ? sx : view.sx + (sx - view.sx) * ks;
  view.sy = view.sy === null ? sy : view.sy + (sy - view.sy) * ks;
  const near = clamp(dist * 0.04, 0.3, 4);
  if (Math.abs(near - camera.near) > 0.05 * camera.near) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }
  // Eye at the hands' average height (+ mouse parallax, proportional to the distance), without rotating the camera.
  const par = drag.panning ? 0 : (dist * FOV_TAN) / 14;
  const px = mouse.x * 1.4 * par;
  const py = -mouse.y * 0.7 * par;
  camera.position.set(cam.cur.x + px, cam.cur.ey + py, view.look.z).addScaledVector(CAM_DIR, dist);
  camera.lookAt(_cam.copy(camera.position).sub(CAM_DIR));
  // Shifts the image ("shift" lens) so the frame's center falls on the center of the free area.
  const ppu = H / 2 / (dist * CAM_DIR.z * FOV_TAN);
  const ax = view.sx + px * ppu;
  const ay = view.sy + (cam.cur.y - cam.cur.ey - py) * ppu;
  camera.setViewOffset(W, H, W / 2 - ax, H / 2 - ay, W, H);
  camera.updateMatrixWorld();
  env.setViewDistance(dist);
  placeShadow(clamp(dist * FOV_TAN * 1.1, 10, 60));
}

function placeShadow(s) {
  Object.assign(sunLight.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 260 });
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.target.position.copy(view.look);
  sunLight.position.copy(view.look).addScaledVector(lightDir, 120);
}

// ---------- Controls: buttons, wheel, drag, pinch and keyboard ----------

const drag = { active: false, panning: false, id: null, x: 0, y: 0, x0: 0, y0: 0, v: 0, vx: 0, lastT: 0 };
const touches = new Map();
let pinch = null;
const pick = { hover: null, selected: null, plateHover: null, listHover: null, px: -1, py: -1, inside: false, lastTap: null };

for (const b of document.querySelectorAll('#zoom [data-level]')) b.addEventListener('click', () => setLevel(b.dataset.level));
$('#zoom [data-step="in"]').addEventListener('click', () => zoomBy(1 / 1.25, null, 5));
$('#zoom [data-step="out"]').addEventListener('click', () => zoomBy(1.25, null, 5));

// Wheel/trackpad: continuous zoom pinned to the pointer; with Shift, pans; sliding sideways on the trackpad,
// pans sideways.
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  if (e.shiftKey) panBy(-((e.deltaY || e.deltaX) * unit) / ppuAt(Math.exp(cam.tgt.ld)));
  else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) panSideBy((e.deltaX * unit) / ppuAt(Math.exp(cam.tgt.ld)));
  else zoomBy(Math.exp(e.deltaY * unit * 0.0015), e.clientY);
}, { passive: false });

stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { stage.setPointerCapture(e.pointerId); } catch { /* ok */ }
  if (touches.size === 2) { // two-finger pinch: zoom
    const [p, q] = [...touches.values()];
    pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) };
    drag.active = false;
    toManual();
    return;
  }
  Object.assign(drag, { active: true, panning: false, id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, v: 0, vx: 0, lastT: performance.now(), t0: performance.now() });
  cam.vel = cam.velX = 0;
});

stage.addEventListener('pointermove', (e) => {
  pick.px = e.clientX;
  pick.py = e.clientY;
  pick.inside = true;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size >= 2) {
    const [p, q] = [...touches.values()];
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d > 10 && pinch.d > 10) zoomBy(pinch.d / d, (p.y + q.y) / 2);
    pinch.d = d;
    return;
  }
  if (!drag.active || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.panning) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; // it can still be a tap
    drag.panning = true;
    toManual();
  }
  // drags the world along with the pointer: down, the view goes up; to the right, it goes left
  const ppu = ppuAt(Math.exp(cam.cur.ld));
  const dw = dy / ppu;
  const dwx = -dx / ppu;
  cam.tgt.y += dw;
  cam.tgt.ey += dw;
  cam.tgt.x += dwx;
  clampTarget();
  const cy = clamp(cam.cur.y + dw, BASE_LEDGE_Y - 2, FLAG.top ?? 2.6);
  cam.cur.ey += cy - cam.cur.y;
  cam.cur.y = cy;
  cam.cur.x = clamp(cam.cur.x + dwx, PAN_X[0], PAN_X[1]);
  const now = performance.now();
  const dtS = Math.max(8, now - drag.lastT) / 1000;
  drag.v = lerp(drag.v, dw / dtS, 0.5);
  drag.vx = lerp(drag.vx, dwx / dtS, 0.5);
  drag.lastT = now;
  cam.lastInput = simTime;
});

function endPointer(e) {
  touches.delete(e.pointerId);
  if (pinch) {
    if (touches.size < 2) pinch = null;
    drag.active = false;
    return;
  }
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  if (drag.panning) {
    const fling = performance.now() - drag.lastT < 90; // released while still moving: inertia
    cam.vel = fling ? clamp(drag.v, -60, 60) : 0;
    cam.velX = fling ? clamp(drag.vx, -60, 60) : 0;
    drag.panning = false;
  } else if (e.type === 'pointerup') tap(e.clientX, e.clientY);
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('pointerleave', () => { pick.inside = false; });

// Tap/click: picks a climber (shows the full tag); two taps on them: focus.
function tap(x, y) {
  const el = document.elementFromPoint(x, y);
  const pill = el?.closest?.('.pill');
  if (pill && !el.closest('[data-id]')) {
    pill.classList.toggle('open');
    return;
  }
  const id = el?.closest?.('[data-id]')?.dataset.id ?? hitActor(x, y);
  const now = performance.now();
  if (id && pick.lastTap?.id === id && now - pick.lastTap.t < 380) {
    setFocus(id);
    pick.lastTap = null;
    return;
  }
  pick.lastTap = { id, t: now };
  pick.selected = id ?? null;
  // tap outside any climber on a record plaque: its tip stays for a few seconds (phone)
  const hit = id ? null : plaqueAt(x, y);
  plaq.tap = hit ? { p: hit.p, until: now + 4000 } : null;
}

// Climber under the screen point (body rectangle measured in the last frame).
function hitActor(x, y) {
  let best = null;
  let bd = Infinity;
  for (const a of actors.values()) {
    const m = a.m;
    if (!a.data || !a.onScreen || !m.on) continue;
    const r = m.rect;
    const pad = Math.max(6, 14 - r.h * 0.1);
    if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
    const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));
    if (d < bd) { bd = d; best = a.id; }
  }
  return best;
}

marksEl.addEventListener('pointerover', (e) => { pick.plateHover = e.target.closest?.('[data-id]')?.dataset.id ?? null; });
marksEl.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('[data-id]')) pick.plateHover = null; });

// ❔ Help: a short guide next to the links (public/i18n/<locale>/help-climb.html, filled in by
// initI18n); the button or "?" opens and closes it, Esc closes it.
const helpEl = $('#help');
const helpBtn = $('#t-help');
function setHelp(open, refocus = false) {
  helpEl.hidden = !open;
  helpBtn.setAttribute('aria-expanded', String(open));
  if (open) helpEl.focus({ preventScroll: true });
  else if (refocus) helpBtn.focus();
  measureUI(); // the panel covers part of the wall: the tags move away from it
}
helpBtn.addEventListener('click', () => setHelp(helpEl.hidden));
helpEl.querySelector('.close').addEventListener('click', () => setHelp(false, true));

addEventListener('keydown', (e) => {
  if (dlg.open) return; // card open: the keys belong to the dialog
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  let used = true;
  if (k === 'Escape' && !helpEl.hidden) setHelp(false, true);
  else if (k === '?') setHelp(helpEl.hidden);
  else if (k >= '1' && k <= '4') setLevel(LEVELS[+k - 1]);
  else if (k === '0' || k === 'Escape') {
    // Esc first closes whatever is open (group, selection); then goes back to the default level of whoever
    // is watching, without changing the saved default
    const open = pills.some((p) => p.el.classList.contains('open'));
    if (k === 'Escape' && (open || pick.selected)) {
      pick.selected = null;
      for (const p of pills) p.el.classList.remove('open');
    } else setLevel(cam.home, 'auto');
  } else if (k === '+' || k === '=') zoomBy(1 / 1.25, null, 5);
  else if (k === '-' || k === '_') zoomBy(1.25, null, 5);
  else if (k === 'ArrowUp') panBy(0.15 * viewSpan(), 5);
  else if (k === 'ArrowDown') panBy(-0.15 * viewSpan(), 5);
  else if (k === 'ArrowLeft') panSideBy(-0.15 * viewSpan(), 5);
  else if (k === 'ArrowRight') panSideBy(0.15 * viewSpan(), 5);
  else if (k === 'PageUp') panBy(viewSpan(), 5);
  else if (k === 'PageDown') panBy(-viewSpan(), 5);
  else if (k === 'Home') panBy((FLAG.top ?? 2.6) + 0.6 - 0.45 * viewSpan() - cam.tgt.y, 5); // summit at the top of the view
  else if (k === 'End') panBy(BASE_LEDGE_Y - 0.6 + 0.45 * viewSpan() - cam.tgt.y, 5); // base camp at the bottom
  else if (k === 'f' || k === 'F') cycleFocus(e.shiftKey ? -1 : 1);
  else if (k === 'n' || k === 'N') setNames(!ui.names);
  else if (k === 'r' || k === 'R') setBoard(!ui.board);
  else if ((k === 't' || k === 'T') && stageOn()) setTab(ui.tab === 'today' ? 'week' : 'today');
  else if ((k === 'p' || k === 'P') && plaq.has) setPlaques(!ui.plaques);
  else if ((k === 'c' || k === 'C') && stageOn()) {
    const id = pick.selected ?? (cam.mode === 'focus' ? cam.focusId : null);
    if (id) openCard(id);
    else toast(tr('toast.cardHint'));
  } else used = false;
  if (used) e.preventDefault();
});

// ?tour: switches level every 15 s (TV walls), unless someone is interacting.
if (PARAMS.has('tour')) {
  setInterval(() => {
    if (cam.lastInput > 0 && simTime - cam.lastInput < 30) return;
    const shown = LEVELS.filter((l) => !document.querySelector(`#zoom [data-level="${l}"]`)?.hidden);
    const i = shown.indexOf(cam.mode === 'level' ? effectiveLevel(cam.level) : '');
    setLevel(shown[(i + 1) % shown.length], 'tour');
  }, 15000);
}

// ---------- Tags, plates and groups (by the body's size on screen) ----------

const _ts = V();
const _tp = V();
const _fwd = V();
function toScreenInto(p, out) {
  _ts.copy(p).project(camera);
  out.x = ((_ts.x + 1) / 2) * innerWidth;
  out.y = ((1 - _ts.y) / 2) * innerHeight;
  out.z = _ts.z;
  return out;
}
const overlap = (r, o, pad = 0) => {
  const w = Math.min(r.x + r.w + pad, o.x + o.w) - Math.max(r.x - pad, o.x);
  const h = Math.min(r.y + r.h + pad, o.y + o.h) - Math.max(r.y - pad, o.y);
  return w > 0 && h > 0 ? w * h : 0;
};
// Fraction of the area of two plates (D×D squares) that overlap.
const plateOverlap = (p, q, D) => (Math.max(0, D - Math.abs(p.x - q.x)) * Math.max(0, D - Math.abs(p.y - q.y))) / (D * D);

const FULL_MAX = 8; // at most 8 full tags at any level
const COMPACT_MAX = 14;
const pills = [];
function makePill() {
  const el = document.createElement('div');
  el.className = 'pill';
  const txt = document.createElement('span');
  const list = document.createElement('div');
  list.className = 'pill-list';
  el.append(txt, list);
  el.style.display = 'none';
  marksEl.append(el);
  return { el, txt, list, key: '', shown: false };
}
// "#16–#21 · 6" when the rankings are consecutive; a few non-consecutive ones: "#23, #25".
function pillLabel(ranks) {
  const lo = Math.min(...ranks);
  const hi = Math.max(...ranks);
  if (hi - lo + 1 === ranks.length || ranks.length > 3) return `#${lo}–#${hi} · ${ranks.length}`;
  return [...ranks].sort((p, q) => p - q).map((r) => `#${r}`).join(', ');
}
const pillW = (text) => 22 + text.length * 6.4; // estimated width (without reading the DOM every frame)

function fillPill(p, group) {
  const key = group.map((a) => `${a.id}:${a.data.rank}:${a.data.tokens}`).join('|');
  if (key === p.key) return;
  p.key = key;
  const ranks = group.map((a) => a.data.rank);
  p.txt.textContent = pillLabel(ranks);
  p.el.style.setProperty('--c', rankColor(Math.min(...ranks)));
  p.list.replaceChildren(...group.map((a) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = a.id;
    const b = document.createElement('b');
    b.textContent = `#${a.data.rank}`;
    b.style.color = rankColor(a.data.rank);
    const n = document.createElement('em');
    n.textContent = nameOf(a.data);
    const s = document.createElement('span');
    s.textContent = `${fmt.tokens(a.data.tokens)}${a.tie ? ' =' : ''}`;
    row.append(b, n, s);
    return row;
  }));
}

function measureActor(a, H) {
  const m = a.m;
  const depth = _tp.copy(a.headPos).sub(camera.position).dot(_fwd);
  m.body = depth > 0.1 ? (a.height * H) / 2 / (depth * FOV_TAN) : 0;
  toScreenInto(_tp.copy(a.headPos).addScaledVector(UP, a.headTop), m.top);
  toScreenInto(_tp.set(a.headPos.x, a.footY, a.headPos.z), m.foot);
  toScreenInto(a.handPt, m.hand);
  toScreenInto(a.labelPos, m.anchor);
  const h = Math.max(10, m.foot.y - m.top.y);
  const w = Math.max(12, h * 0.45);
  m.rect.x = m.top.x - w / 2;
  m.rect.y = m.top.y - 4;
  m.rect.w = w;
  m.rect.h = h + 4;
  m.on = a.onScreen && a.posedAt >= 0 && depth > 0.1 && m.foot.y > -10 && m.top.y < innerHeight + 10 && m.top.x > -30 && m.top.x < innerWidth + 30;
}

function setShown(el, on, flag, owner) {
  if (owner[flag] === on) return;
  owner[flag] = on;
  el.style.display = on ? '' : 'none';
}

// Every frame: measures the bodies on screen and picks for each one a full tag (≥ 45 px), a one-line tag
// (28–45 px) or a plate (< 28 px). Plates that overlap become a group pill.
// Mouse over (or tap) shows the full tag of anyone.
function layoutMarks(dt) {
  const W = innerWidth;
  const H = innerHeight;
  camera.getWorldDirection(_fwd);
  const list = [...actors.values()].filter((a) => a.data).sort((p, q) => p.data.rank - q.data.rank);
  for (const a of list) measureActor(a, H);
  // mouse over someone (plate, pill row or the body itself)
  let hover = null;
  if (pick.inside && !drag.panning) hover = pick.plateHover ?? hitActor(pick.px, pick.py);
  pick.hover = hover;
  if (pick.selected && !actors.has(pick.selected)) pick.selected = null;
  stage.style.cursor = drag.panning ? 'grabbing' : hover ? 'pointer' : '';
  const lit = hover ?? pick.listHover; // highlighted: mouse on the body or on the ranking row
  const focusIds = new Set();
  if (cam.mode === 'focus') {
    const wl = wallList();
    const i = wl.findIndex((c) => c.id === cam.focusId);
    if (i >= 0) {
      focusIds.add(cam.focusId);
      if (i > 0) focusIds.add(wl[i - 1].id);
    }
  }
  let nFull = 0;
  let nComp = 0;
  const D = W <= 640 ? 20 : 22;
  // in a level, whoever is outside it (e.g. #11 in Top 10, at the bottom edge) gets only the plate — and
  // only if it fits entirely in the free area (no plate peeking out between HUD panels)
  const lim = cam.mode === 'level' ? LEVEL_N[effectiveLevel(cam.level)] ?? Infinity : Infinity;
  const pr = { x: 0, y: 0, w: D + 4, h: D + 4 };
  for (const a of list) {
    const m = a.m;
    const r = a.data.rank;
    let kind = 'none';
    let extra = false;
    pr.x = m.hand.x - pr.w / 2;
    pr.y = m.hand.y - pr.h / 2;
    const free = !uiRects.some((o) => overlap(pr, o) > 0) && m.hand.x > D / 2 && m.hand.x < W - D / 2 && m.hand.y > D / 2 && m.hand.y < H - D / 2;
    const inside = m.hand.y > safe.rawTop + D && m.hand.y < safe.bottom + 2 * D;
    if (m.on && free && (r <= lim || inside)) {
      if (r > lim) kind = 'plate';
      else if (m.body >= 45 || (m.body >= 28 && r <= 3)) kind = 'full';
      else if (m.body >= 28 || r === 1) kind = 'compact';
      else kind = 'plate';
      if (kind !== 'plate' && stageOn() && !(a.data.tokens > 0)) kind = 'plate'; // whoever sleeps at the camp: only the plate
      // a tag that sat on top of another (phone in Top 5, full Top 25) steps down a level for
      // a while: full → one line → plate (the latter only from #4 down); comes back when it would fit
      // without overlapping (checked in the tag loop, without showing first)
      m.natural = kind;
      if (a.demote > 0 && r > 1) {
        if (kind === 'full') kind = 'compact';
        if (a.demote >= 2 && kind === 'compact' && r > 3) kind = 'plate';
      }
      if (kind === 'full' && nFull >= FULL_MAX) kind = m.body >= 28 ? 'compact' : 'plate';
      if (kind === 'compact' && nComp >= COMPACT_MAX && r !== 1) kind = 'plate';
      if (kind === 'full') nFull++;
      if (kind === 'compact') nComp++;
      const special = a.id === lit || a.id === pick.selected || focusIds.has(a.id);
      if (special) {
        if (kind === 'plate') extra = true;
        else kind = 'full';
      }
      // names off: only whoever is under the mouse, chosen or in focus gets a tag (full, at the hand
      // when the body is small); no plates or groups
      if (!ui.names) {
        if (kind === 'plate' && special) extra = true;
        if (!special || kind === 'plate') kind = 'none';
      }
    }
    m.kind = kind;
    m.extra = extra;
  }

  // plates: overlapping by more than ~20% (they would already hide digits) become a group; then groups
  // whose boxes overlap (a wide pill over a plate) also merge
  let groups = [];
  for (const a of list) {
    if (a.m.kind !== 'plate') continue;
    const g = groups.find((gr) => gr.some((b) => plateOverlap(a.m.hand, b.m.hand, D) > 0.2));
    if (g) g.push(a);
    else groups.push([a]);
  }
  const boxOf = (g) => {
    let x = 0;
    let y = 0;
    for (const a of g) { x += a.m.hand.x; y += a.m.hand.y; }
    x /= g.length;
    y /= g.length;
    const w = g.length === 1 ? D : pillW(pillLabel(g.map((a) => a.data.rank)));
    return { x: x - w / 2, y: y - D / 2, w, h: D };
  };
  for (let again = true; again;) {
    again = false;
    const boxes = groups.map(boxOf);
    search: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const lim2 = 0.2 * Math.min(boxes[i].w * boxes[i].h, boxes[j].w * boxes[j].h);
        if (overlap(boxes[i], boxes[j]) > lim2) {
          groups[i] = groups[i].concat(groups[j]).sort((p, q) => p.data.rank - q.data.rank);
          groups.splice(j, 1);
          again = true;
          break search;
        }
      }
    }
  }
  const obst = [];
  if (rulerBox) obst.push(rulerBox);
  const plated = new Set();
  let pi = 0;
  for (const g of groups) {
    if (g.length === 1) {
      const a = g[0];
      plated.add(a);
      a.plate.style.transform = `translate(${Math.round(a.m.hand.x)}px, ${Math.round(a.m.hand.y)}px)`;
      obst.push({ x: a.m.hand.x - D / 2, y: a.m.hand.y - D / 2, w: D, h: D });
      continue;
    }
    const p = pills[pi] ?? (pills[pi] = makePill());
    pi++;
    fillPill(p, g);
    let x = 0;
    let y = 0;
    for (const a of g) { x += a.m.hand.x; y += a.m.hand.y; }
    x /= g.length;
    y /= g.length;
    setShown(p.el, true, 'shown', p);
    p.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    const pw = p.el.offsetWidth || 80;
    obst.push({ x: x - pw / 2, y: y - 11, w: pw, h: 22 });
  }
  for (; pi < pills.length; pi++) {
    setShown(pills[pi].el, false, 'shown', pills[pi]);
    pills[pi].el.classList.remove('open');
    pills[pi].key = '';
  }
  for (const a of list) setShown(a.plate, plated.has(a), 'plateShown', a);
  for (const a of actors.values()) if (!a.data) setShown(a.plate, false, 'plateShown', a);

  // camp and base signs (they become obstacles for the tags). The whole sign must fit
  // outside the HUD and must not cover plates or groups (the data wins). On a narrow screen the
  // camps become marks on the ruler (drawRuler) instead of signs in the middle of the lanes.
  const plateBoxes = obst.slice(rulerBox ? 1 : 0);
  plaq.signBoxes = [];
  for (const s of [...signs.camps, signs.base, signs.empty]) {
    if (!s) continue;
    const p = toScreenInto(s.pos, s.at);
    const sw = s.w || 120;
    const sh = s.h || 34;
    // narrow screens: the sign does not invade the ruler column (right edge)
    const x = rulerBox && !safe.wide ? Math.min(p.x, rulerBox.x - 4 - sw / 2) : p.x;
    const r = { x: x - sw / 2, y: p.y - sh, w: sw, h: sh };
    const campOnRuler = s.camp && !safe.wide;
    const on = !s.off && !campOnRuler && p.z < 1 && r.x > -40 && r.x + r.w < W + 40 && r.y > safe.rawTop && p.y < H + 20
      && !uiRects.some((o) => overlap(r, o, 4) > 0) && !plateBoxes.some((o) => overlap(r, o) > 0);
    if (on !== s.vis) {
      s.vis = on;
      s.el.style.visibility = on ? 'visible' : 'hidden';
      if (on && !s.w) {
        s.w = s.el.offsetWidth;
        s.h = s.el.offsetHeight + 2;
      }
    }
    if (!on) continue;
    s.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    obst.push(r);
    plaq.signBoxes.push({ text: s.el.firstChild.textContent, r });
  }

  // record plaques (3D) in view: the tags avoid covering them (lower cost than the HUD) and the
  // duels too, when there is another place
  const plaqueRects = measurePlaques().map((q) => q.r);

  // duels: balloon next to whoever is chasing (right, left or below), without covering the HUD,
  // ruler, plates or plaques; becomes an obstacle for the tags
  plaq.duelBoxes = [];
  for (let i = 0; i < duelEls.length; i++) {
    const e = duelEls[i];
    const d = duels[i];
    const a = d && actors.get(d.id);
    let on = false;
    if (a?.m.on && a.mode === 'wall' && safe) {
      if (!e.w) e.w = 26 + e.el.textContent.length * (W <= 640 ? 5.9 : 6.5); // estimated (without reading the DOM)
      const r = a.m.rect;
      const yMid = r.y + Math.min(r.h * 0.3, 40);
      const spots = [[r.x + r.w + 12, yMid], [r.x - 12 - e.w, yMid], [r.x + r.w / 2 - e.w / 2, r.y + r.h + 6]];
      for (const spot of [...spots.map((s) => [...s, true]), ...spots.map((s) => [...s, false])]) { // first away from the record plaques
        const [x, y, avoidPlaques] = spot;
        const box = { x, y: y - e.h / 2, w: e.w, h: e.h };
        if (x < 4 || x + e.w > W - 4 || box.y < safe.rawTop || box.y + e.h > H - 4) continue;
        if (uiRects.some((o) => overlap(box, o, 4) > 0) || obst.some((o) => overlap(box, o) > 0)) continue;
        if (avoidPlaques && plaqueRects.some((o) => overlap(box, o) > 0)) continue;
        e.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(box.y)}px)`;
        obst.push(box);
        plaq.duelBoxes.push({ text: e.el.textContent, r: box });
        on = true;
        break;
      }
    }
    setShown(e.el, on, 'shown', e);
  }

  // tags: cheapest position among candidates (overlap with the HUD, bodies, plates and
  // other tags costs a lot; moving away costs little and gains a line to the climber)
  const bodies = [];
  for (const a of list) if (a.m.on && a.m.body >= 10) bodies.push({ a, r: a.m.rect });
  const placed = [];
  // best place for a w×h tag anchored at p; ov = how much of the tags already placed it covers
  const spotFor = (a, p, w, h, bodyH) => {
    const up = -h / 2 - 8;
    const cands = [
      [0, up],
      [w / 2 + 10, up + 2], [-w / 2 - 10, up + 2],
      [w / 2 + 22, bodyH * 0.35], [-w / 2 - 22, bodyH * 0.35],
      [0, up - h - 8], [w * 0.55, up - h - 8], [-w * 0.55, up - h - 8],
      [0, bodyH + h / 2 + 12],
      [w / 2 + 22, bodyH * 0.9], [-w / 2 - 22, bodyH * 0.9],
      [w + 30, up], [-w - 30, up],
    ];
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const [dx, dy] = cands[i];
      const cx = clamp(p.x + dx, w / 2 + 6, W - w / 2 - 6);
      const cy = clamp(p.y + dy, h / 2 + 6, H - h / 2 - 6);
      const r = { x: cx - w / 2, y: cy - h / 2, w, h };
      let cost = Math.hypot(cx - p.x, cy - (p.y + up)) * 0.5 + i * 3;
      let ov = 0;
      for (const o of placed) ov += overlap(r, o);
      for (const o of placed) cost += overlap(r, o, 4) * 5;
      for (const o of uiRects) cost += overlap(r, o, 6) * 6;
      for (const o of obst) cost += overlap(r, o) * 5; // plates, groups and plaques: as costly as the HUD
      for (const o of plaqueRects) cost += overlap(r, o) * 4; // record plaques: better not to cover
      for (const b of bodies) cost += overlap(r, b.r) * (b.a === a ? 2.5 : 4);
      if (i === a.tagChoice) cost -= 30; // avoids jumping between similar positions
      if (!best || cost < best.cost) best = { cost, r, i, ov, up, dx: cx - p.x, dy: cy - p.y };
    }
    return best;
  };
  const DEMOTE_S = 15; // minimum time demoted before trying to come back
  for (const a of list) {
    const want = a.m.extra ? 'full' : a.m.kind;
    const special = a.id === lit || a.id === pick.selected || focusIds.has(a.id);
    if (want !== 'full' && want !== 'compact') {
      if (a.tagShown) a.tagOff = null;
      setShown(a.tagWrap, false, 'tagShown', a);
      // demoted to the plate: gets a one-line tag again if it fits without overlapping
      const cs = a.tagSize.compact;
      if (want === 'plate' && a.demote >= 2 && simTime >= a.demoteUntil && a.m.on && cs) {
        if (spotFor(a, a.m.anchor, cs[0], cs[1], a.m.rect.h).ov <= 0) a.demote = 1;
        else a.demoteUntil = simTime + 4;
      }
      continue;
    }
    setShown(a.tagWrap, true, 'tagShown', a);
    // whoever was clicked: the full tag gets the "📸 Card" button (only in the stage)
    const sel = want === 'full' && a.id === pick.selected && stageOn();
    if (a.tagKind !== want || a.tagSel !== sel) {
      a.tagKind = want;
      a.tagSel = sel;
      a.tag.className = `tag ${want}${sel ? ' sel' : ''}`;
      a.tagW = 0;
    }
    if (!a.tagW) {
      a.tagW = a.tag.offsetWidth || 150;
      a.tagH = a.tag.offsetHeight || 38;
      a.tagSize[want] = [a.tagW, a.tagH];
    }
    const w = a.tagW;
    const p = a.m.extra ? a.m.hand : a.m.anchor;
    const bodyH = a.m.extra ? 12 : a.m.rect.h;
    const best = spotFor(a, p, w, a.tagH, bodyH);
    const up = best.up;
    // still on top of the tag of someone above: steps down a level (next frame); demoted
    // a while ago and fitting full (size measured before): comes back
    const r = a.data.rank;
    if (!special && r > 1 && best.ov > 40 && (want === 'full' || r > 3) && a.demote < 2) {
      a.demote++;
      a.demoteUntil = simTime + DEMOTE_S;
    } else if (a.demote > 0 && want === 'compact' && simTime >= a.demoteUntil) {
      const fs = a.m.natural === 'full' ? a.tagSize.full : null;
      if (!fs || spotFor(a, p, fs[0], fs[1], bodyH).ov <= 0) a.demote = 0;
      else a.demoteUntil = simTime + 4;
    }
    placed.push(best.r);
    a.tagChoice = best.i;
    const k = a.tagOff ? 1 - Math.exp(-dt * 12) : 1;
    a.tagOff ??= { x: best.dx, y: best.dy };
    a.tagOff.x += (best.dx - a.tagOff.x) * k;
    a.tagOff.y += (best.dy - a.tagOff.y) * k;
    a.tagWrap.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    a.tag.style.transform = `translate(${Math.round(a.tagOff.x)}px, ${Math.round(a.tagOff.y)}px)`;
    // line to the climber when the tag moved off from above the head
    const len = Math.hypot(a.tagOff.x, a.tagOff.y);
    const far = Math.abs(a.tagOff.x) > w * 0.3 || a.tagOff.y > 0 || a.tagOff.y < up - 12;
    a.line.style.display = far ? 'block' : 'none';
    if (far) {
      a.line.style.width = `${Math.round(len)}px`;
      a.line.style.transform = `rotate(${Math.atan2(a.tagOff.y, a.tagOff.x)}rad)`;
    }
  }
  plaq.tagBoxes = list.filter((a) => a.tagShown && a.tagOff).map((a) => ({ rank: a.data.rank, r: tagRectOf(a) }));
  // piton labels for personal bests, after everything (they dodge tags, bodies and plaques)
  layoutPbLabels(lit, focusIds, lim, [...placed, ...obst, ...bodies.map((b) => b.r), ...uiRects, ...plaqueRects]);
  // tip of the plaque under the mouse (only with no one under it) or tapped on the phone
  let tipHit = null;
  if (pick.inside && !drag.panning && !hover) tipHit = plaqueAt(pick.px, pick.py);
  if (tipHit) showPlaqueTip(tipHit, pick.px, pick.py);
  else if (plaq.tap && performance.now() < plaq.tap.until && plaq.rects.some((q) => q.p === plaq.tap.p)) showPlaqueTip(plaq.rects.find((q) => q.p === plaq.tap.p));
  else showPlaqueTip(null);
  if (tipHit && !hover) stage.style.cursor = 'help';
  updateHighlight(lit);
}

// Rectangle of a tag on screen (from the last placement; for the plaque debug).
function tagRectOf(a) {
  const w = a.tagW || 150;
  const h = a.tagH || 38;
  const p = a.m.extra ? a.m.hand : a.m.anchor;
  return { x: p.x + a.tagOff.x - w / 2, y: p.y + a.tagOff.y - h / 2, w, h };
}

// ---------- Ranking list and highlight ----------
// Display switches: ?names=0|1 and ?board=0|1 in the URL; else the last choice in this browser;
// else names on and the list open on wide screens.
const PREF_NAMES = 'climb.names';
const PREF_BOARD = 'climb.board';
function readPref(key, param) {
  const p = PARAMS.get(param);
  if (p === '0' || p === '1') return p === '1';
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}
function writePref(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* no storage: fine */ }
}
const ui = {
  names: readPref(PREF_NAMES, 'names') ?? true,
  board: readPref(PREF_BOARD, 'board') ?? innerWidth >= 900,
  plaques: readPref(PREF_PLAQUES, 'plaques') ?? true, // record plaques on the rock
};
// Tab of the list in the stage: "today" (the stage) or "week" (overall standings); ?tab=week pins it.
const PREF_TAB = 'climb.tab';
const TABS = ['today', 'week'];
ui.tab = (() => {
  const p = PARAMS.get('tab');
  if (TABS.includes(p)) return p;
  try {
    const v = localStorage.getItem(PREF_TAB);
    return TABS.includes(v) ? v : 'today';
  } catch {
    return 'today';
  }
})();
const boardEl = $('#board');
const boardList = $('#board-list');
const offhint = $('#offhint');
const board = { key: '', rows: new Map(), lit: null, sel: null };
const spotEl = document.createElement('div');
spotEl.className = 'spot';
spotEl.style.cssText = 'display:none;position:absolute;left:0;top:0';
marksEl.prepend(spotEl); // under the tags and plates

function setNames(on, save = true) {
  ui.names = on;
  $('#t-names').setAttribute('aria-pressed', String(on));
  if (save) writePref(PREF_NAMES, on);
}
function setBoard(on, save = true) {
  ui.board = on;
  boardEl.hidden = !on;
  $('#t-board').setAttribute('aria-pressed', String(on));
  if (save) writePref(PREF_BOARD, on);
  if (!on) pick.listHover = null;
  measureUI();
}
$('#t-names').addEventListener('click', () => setNames(!ui.names));
$('#t-board').addEventListener('click', () => setBoard(!ui.board));
$('#t-plaques').addEventListener('click', () => setPlaques(!ui.plaques));
boardEl.querySelector('.close').addEventListener('click', () => setBoard(false));
function setTab(tab, save = true) {
  if (!TABS.includes(tab)) return;
  ui.tab = tab;
  if (save) {
    try { localStorage.setItem(PREF_TAB, tab); } catch { /* no storage: fine */ }
  }
  for (const b of document.querySelectorAll('#board-tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  pick.listHover = null;
  if (state) renderBoard(wallList());
  // the wall tags switch their second line (gap to the one above ↔ place in the week)
  for (const a of actors.values()) if (a.data) fillTag(a, a.data, a.above ?? null);
}
for (const b of document.querySelectorAll('#board-tabs [data-tab]')) b.addEventListener('click', () => setTab(b.dataset.tab));

// Ranking rows (rebuilt only when ranking, tokens or state change). In the stage, two tabs: "Today"
// (place in the stage, state and today's tokens) and "Week" (overall standings: yellow jersey,
// stages won and the week's tokens). Whoever is in the Week but not on the wall today is dimmed (no
// focus; the mouse shows the "not on the wall today" hint).
function renderBoard(top) {
  const stg = stageOn();
  $('#board-tabs').hidden = !stg;
  $('#board-title').hidden = stg;
  const week = stg && ui.tab === 'week';
  if (boardEl.classList.contains('week') !== week) {
    boardEl.classList.toggle('week', week);
    if (!boardEl.hidden) measureUI(); // the list changed width: the tags move away from it
  }
  const list = week ? (state.climbers ?? []).slice(0, SHOWN) : top;
  const onWall = new Set(top.map((c) => c.id));
  const stageRank = new Map(top.map((c) => [c.id, c.rank]));
  // the overall standings tab says the period (Week; with the server on SEASON_LENGTH=month, Month)
  const tabB = $('#board-tabs [data-tab="week"]');
  const tabText = tr(weekly() ? 'html.board.week' : 'board.month');
  if (tabB.textContent !== tabText) {
    tabB.textContent = tabText;
    tabB.title = tr(weekly() ? 'html.board.weekTitle' : 'board.monthTitle');
  }
  // (on the Today tab, the card camera only exists for whoever already has a body on the wall)
  const key = `${week ? 's' : stg ? 'h' : '-'}|${weekly()}|${list.map((c) => `${c.id}:${c.rank}:${c.tokens}:${c.name}:${c.state ?? ''}:${c.stageWins ?? ''}:${c.jersey ? 1 : 0}:${stageRank.get(c.id) ?? 0}:${stg && !week && actors.has(c.id) ? 1 : 0}`).join('|')}`;
  if (key !== board.key) {
    board.key = key;
    // keyboard focus on a row's camera: goes back to the camera of the same person's new row
    const act = document.activeElement;
    const camFocus = act?.classList?.contains('cam') && boardList.contains(act) ? act.closest('li')?.dataset.id : null;
    board.rows.clear();
    board.lit = board.sel = null;
    if (week && !list.length) {
      // Monday right after midnight: the standings were reset and nobody has scored yet
      const li = document.createElement('li');
      li.className = 'empty';
      const champ = state.hallOfFame?.[0];
      li.textContent = `${tr(weekly() ? 'board.emptyWeek' : 'board.emptyMonth')}${champ ? tr(weekly() ? 'board.champWeek' : 'board.champMonth', { name: nameOf(champ) }) : ''}`;
      boardList.replaceChildren(li);
    } else boardList.replaceChildren(...list.map((c) => {
      const li = document.createElement('li');
      const name = nameOf(c);
      li.dataset.id = c.id;
      li.style.setProperty('--c', rankColor(c.rank));
      const cell = (cls, text) => {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text;
        return s;
      };
      if (week) {
        const wins = c.stageWins ? ` · ${plural(c.stageWins, 'board.stagesWon')}` : '';
        const today = stageRank.get(c.id);
        li.title = `${c.jersey ? `${tr('board.jersey')} · ` : ''}#${c.rank} ${name} · ${fmt.tokens(c.tokens)} ${inPeriod()}${wins} · ${today ? tr('board.todayRank', { rank: today }) : tr('board.notOnWall')}`;
        li.classList.toggle('off', !today);
        // on the wall: today's place too (it is the # the wall tag shows)
        li.append(cell('r', `#${c.rank}`), cell('n', name));
        if (today) li.append(cell('h', tr('board.todayShort', { rank: today })));
        li.append(cell('s', `${c.jersey ? '🟡' : ''}${c.stageWins ? `🏅${c.stageWins}` : ''}`), cell('t', fmt.tokens(c.tokens, true)));
      } else if (stg) {
        li.title = `${name} · ${c.tokens > 0 ? tr('tag.todayState', { tokens: fmt.tokens(c.tokens), state: stateText(c) }) : tr('state.noTokensToday')}${c.jersey ? ` · ${tr('board.jersey')}` : ''}${tr('board.clickHint')}`;
        li.append(cell('r', `#${c.rank}`), cell('n', name), cell('s', stateIcon(c)), cell('t', c.tokens > 0 ? `${onSummit(c) ? '🏅 ' : ''}${fmt.tokens(c.tokens, true)}` : '—'));
        // card camera (shows with the mouse or the focus on the row; on touch, on the chosen row)
        if (actors.has(c.id)) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cam';
          b.textContent = '📸';
          b.title = tr('board.cardTitle');
          b.setAttribute('aria-label', tr('card.of', { name }));
          b.addEventListener('click', (e) => {
            e.stopPropagation(); // does not take the camera to the person
            openCard(c.id);
          });
          li.append(b);
        }
      } else {
        li.title = `${name} · ${fmt.tokens(c.tokens)}${tr('board.clickHint')}`;
        li.append(cell('r', `#${c.rank}`), cell('n', name), cell('t', `${onSummit(c) ? '🚩 ' : ''}${fmt.tokens(c.tokens, true)}`));
      }
      board.rows.set(c.id, li);
      return li;
    }));
    if (camFocus) board.rows.get(camFocus)?.querySelector('.cam')?.focus({ preventScroll: true });
  }
  let more = '';
  let moreTitle = '';
  if (week) {
    // the overall standings have a cut (MIN_TOKENS) and the stage does not: said here, "465 with
    // tokens today" on the Today tab does not look like more people than the whole week
    const t = state.team ?? {};
    const below = Math.max(0, (t.participants ?? list.length) - list.length);
    const parts = [];
    if (below > 0) parts.push(tr('sign.below', { n: fmt.int(below), rank: list.length }));
    if (t.belowCut > 0) parts.push(tr('board.belowCut', { n: fmt.int(t.belowCut), tokens: fmt.tokens(t.cutTokens), period: inPeriod() }));
    more = parts.join(' · ');
    if (t.belowCut > 0) moreTitle = tr(weekly() ? 'board.cutTitleWeek' : 'board.cutTitleMonth');
  } else if (stg) {
    const shown = top.filter((c) => c.tokens > 0).length;
    const all = state.stage.activeToday ?? shown;
    more = `${tr('board.withTokensToday', { n: fmt.int(all) })}${all > shown ? ` · ${tr('sign.below', { n: fmt.int(all - shown), rank: top.length })}` : ''}`;
  } else {
    const below = top.length ? Math.max(0, state.team.participants - top.length) : 0;
    more = below > 0 ? tr('sign.below', { n: fmt.int(below), rank: top.length }) : '';
  }
  $('#board-more').textContent = more;
  $('#board-more').title = moreTitle;
}
boardList.addEventListener('pointerover', (e) => { pick.listHover = e.target.closest?.('li')?.dataset.id ?? null; });
boardList.addEventListener('pointerleave', () => { pick.listHover = null; });
boardList.addEventListener('click', (e) => {
  const id = e.target.closest?.('li')?.dataset.id;
  if (id) setFocus(id);
});

// Halo on the body of whoever is highlighted; off screen, a notice on the edge pointing to them.
function updateHighlight(lit) {
  const sel = cam.mode === 'focus' ? cam.focusId : pick.selected;
  if (board.lit !== lit) {
    board.rows.get(board.lit)?.classList.remove('hi');
    board.rows.get(lit)?.classList.add('hi');
    board.lit = lit;
  }
  if (board.sel !== sel) {
    board.rows.get(board.sel)?.classList.remove('sel');
    board.rows.get(sel)?.classList.add('sel');
    board.sel = sel;
  }
  const a = lit ? actors.get(lit) : null;
  const m = a?.m;
  if (m?.on) {
    const size = clamp(m.rect.h * 1.5, 46, 320);
    spotEl.style.display = '';
    spotEl.style.width = spotEl.style.height = `${Math.round(size)}px`;
    spotEl.style.setProperty('--c', a.color ?? '#fff');
    spotEl.style.transform = `translate(${Math.round(m.rect.x + m.rect.w / 2 - size / 2)}px, ${Math.round(m.rect.y + m.rect.h / 2 - size / 2)}px)`;
  } else spotEl.style.display = 'none';
  // notice only for whoever came from the list (on the body, the mouse is already over them)
  const fromList = !m?.on && lit && lit === pick.listHover;
  const c = fromList ? a?.data ?? wallList().find((x) => x.id === lit) : null;
  if (fromList && !c && board.rows.has(lit) && state) {
    // Week tab: whoever is not on the wall today (no tokens today or out of the stage's top)
    const w = state.climbers?.find((x) => x.id === lit);
    const row = board.rows.get(lit).getBoundingClientRect();
    offhint.hidden = false;
    offhint.textContent = `#${w?.rank ?? '?'} ${w ? nameOf(w) : ''} · ${tr('board.notOnWall')}`;
    offhint.style.setProperty('--c', rankColor(w?.rank ?? 99));
    offhint.style.left = `${Math.round(Math.min(row.right + 12 + offhint.offsetWidth / 2, innerWidth - offhint.offsetWidth / 2 - 6))}px`;
    offhint.style.top = `${Math.round(row.top + row.height / 2)}px`;
    return;
  }
  if (!c || !S || !safe) {
    offhint.hidden = true;
    return;
  }
  const s = slotOf.get(c.id);
  const p = toScreenInto(onSummit(c) && s ? _tp.set(s.x, 0.5, LOOK_Z) : _tp.set(laneXFor(c.id), yLine(c.tokens, S), LOOK_Z), { x: 0, y: 0, z: 0 });
  const W = innerWidth;
  const H = innerHeight;
  const top = safe.rawTop + 18;
  const bot = Math.min(H - 80, safe.bottom);
  let arrow = '';
  if (p.y < top) arrow = '↑';
  else if (p.y > bot) arrow = '↓';
  else arrow = p.x < W / 2 ? '←' : '→';
  offhint.hidden = false;
  offhint.textContent = `${arrow} #${c.rank} ${nameOf(c)} · ${tr('board.offFrame')}`;
  offhint.style.setProperty('--c', rankColor(c.rank));
  const x = arrow === '←' ? 120 : arrow === '→' ? W - 120 : clamp(p.x, Math.max(safe.left, 160), W - 160);
  const y = arrow === '↑' ? top + 6 : arrow === '↓' ? bot - 6 : clamp(p.y, top, bot);
  offhint.style.left = `${Math.round(x)}px`;
  offhint.style.top = `${Math.round(y)}px`;
}

setNames(ui.names, false);
setBoard(ui.board, false);
setTab(ui.tab, false);
setPlaques(ui.plaques, false);

// ---------- Token ruler (on the side, in screen pixels) ----------

const RULER_STEPS = [0.2, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 500];
let rulerBox = null; // ruler column on screen (the tags and plaques dodge it)
const _rp = V();
function sizeRuler() {
  const dpr = Math.min(2, devicePixelRatio);
  rulerCv.width = Math.round(innerWidth * dpr);
  rulerCv.height = Math.round(innerHeight * dpr);
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// screen y of a world height, measured on the reference plane (it is the ruler's scale)
const rulerY = (y) => toScreenInto(_rp.set(view.look.x, y, view.look.z), _rpo).y;
const _rpo = { x: 0, y: 0 };

function rulerText(text, x, y, color, align = 'right') {
  rctx.textAlign = align;
  rctx.strokeText(text, x, y);
  rctx.fillStyle = color;
  rctx.fillText(text, x, y);
}

function drawRuler() {
  rctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!S || !safe || view.focus) return;
  // up close (focus, manual zoom) the ruler crosses the wall: it passes behind the record
  // plaques in view (cut out of the drawing), instead of striking through their text
  const holes = plaq.rects;
  if (holes.length) {
    rctx.save();
    rctx.beginPath();
    rctx.rect(0, 0, innerWidth, innerHeight);
    for (const { r } of holes) rctx.rect(r.x, r.y, r.w, r.h);
    rctx.clip('evenodd');
  }
  try {
    paintRuler();
  } finally {
    if (holes.length) rctx.restore();
  }
}
function paintRuler() {
  const W = innerWidth;
  const H = innerHeight;
  const Sr = rulerS();
  const narrow = W <= 640;
  // wide screens: the ruler hugs the cliff edge (left of the lanes), away from the HUD
  let rx = safe.rulerX;
  if (safe.wide) {
    // left of the part of the edge that is on screen (the edge opens downward, with shoulders)
    const half = (view.sy - safe.rawTop) / ppuAt(view.dist);
    let ex = Infinity;
    for (let k = 0; k <= 12; k++) ex = Math.min(ex, edgeX(clamp(view.look.y + half * (1 - k / 6), BASE_LEDGE_Y - 2, 0)));
    rx = clamp(toScreenInto(_rp.set(ex - 1.5, view.look.y, view.look.z), _rpo).x, safe.hudRight + 84, safe.left + 0.3 * (safe.right - safe.left));
  }
  rx = Math.round(rx) + 0.5;
  rulerBox = narrow || !safe.wide ? { x: rx - 54, y: safe.rawTop, w: 62, h: H } : { x: rx - 92, y: safe.rawTop, w: 98, h: H };
  const top = Math.max(8, safe.rawTop + 8);
  const bot = safe.bottom + 6;
  const yOf = (tokens) => rulerY(yLineFree(tokens, Sr));
  const ySum = yOf(Sr);
  const yBase = yOf(0);
  const pxPerMi = (yBase - ySum) / (Sr / 1e6);
  if (!(pxPerMi > 0)) return;
  rctx.font = `700 ${narrow ? 10 : 11}px Nunito, system-ui, sans-serif`;
  rctx.textBaseline = 'middle';
  rctx.lineJoin = 'round';
  rctx.lineWidth = 3;
  rctx.strokeStyle = 'rgba(12, 9, 7, 0.75)';
  const ink = 'rgba(246, 241, 234, 0.9)';
  // axis
  const a0 = clamp(ySum, top, bot);
  const a1 = clamp(yBase, top, bot);
  if (a1 > a0) {
    rctx.fillStyle = 'rgba(12, 9, 7, 0.45)';
    rctx.fillRect(rx - 2, a0, 4, a1 - a0);
    rctx.fillStyle = 'rgba(246, 241, 234, 0.75)';
    rctx.fillRect(rx - 0.5, a0, 1.5, a1 - a0);
  }
  // marks: the smallest step with at least ~40 px between them
  const minPx = narrow ? 30 : 40;
  const step = RULER_STEPS.find((s) => s * pxPerMi >= minPx) ?? 1000;
  const special = [ySum, yBase];
  const stg = stageOn();
  // sherpa pace: only in the season (the day's stage has no sherpa)
  const pace = !stg && state?.pace?.tokens > 0 && state.pace.tokens < Sr ? yOf(state.pace.tokens) : null;
  if (pace !== null) special.push(pace);
  // camps: orange mark on the ruler (on a narrow screen it is the only place they show up)
  const camps = (ledges?.list ?? []).map((c, i) => ({ y: yOf((c.tokens / S) * Sr), n: c.n ?? i + 1, c }));
  if (narrow || !safe.wide) for (const c of camps) special.push(c.y);
  const tHi = Math.min(Sr, (tokensAtY(view.look.y + (view.sy - top) / ppuAt(view.dist), Sr) || 0) + step * 1e6);
  const tLo = Math.max(0, tokensAtY(view.look.y + (view.sy - bot) / ppuAt(view.dist), Sr) - step * 1e6);
  for (let k = Math.ceil(tLo / 1e6 / step) * step; k * 1e6 < tHi; k += step) {
    if (k <= 0 || k * 1e6 >= Sr) continue;
    const y = Math.round(yOf(k * 1e6)) + 0.5;
    if (y < top || y > bot) continue;
    rctx.fillStyle = ink;
    rctx.fillRect(rx - 5, y - 0.5, 10, 1);
    if (special.some((s) => Math.abs(s - y) < 13)) continue;
    rulerText(tr('ruler.tick', { n: fmt.dec(k, 2) }), rx - 9, y, ink);
  }
  for (const { y, n, c } of camps) {
    if (y < top || y > bot || Math.abs(y - (pace ?? -1e9)) < 12) continue;
    rctx.fillStyle = '#ffb547';
    rctx.fillRect(rx - 6, Math.round(y), 12, 2);
    if (narrow || !safe.wide) rulerText(`⛺${n} · ${fmt.tokens(c.tokens, true)}`, rx - 10, y, '#ffcf8a'); // wide screen: the sign on the ledge already says it
  }
  // base, sherpa pace and summit
  if (yBase >= top && yBase <= bot) {
    rctx.fillStyle = ink;
    rctx.fillRect(rx - 7, Math.round(yBase), 14, 2);
    rulerText(narrow ? '0' : tr('ruler.base'), rx - 10, yBase, ink);
  }
  if (pace !== null && pace >= top && pace <= bot) {
    rctx.fillStyle = '#57e0c2';
    rctx.fillRect(rx - 7, Math.round(pace), 14, 2);
    rctx.setLineDash([4, 4]);
    rctx.strokeStyle = 'rgba(87, 224, 194, 0.55)';
    rctx.lineWidth = 1.5;
    rctx.beginPath();
    rctx.moveTo(narrow ? rx - 50 : rx + 8, Math.round(pace) + 1);
    rctx.lineTo(narrow ? rx - 8 : rx + 60, Math.round(pace) + 1);
    rctx.stroke();
    rctx.setLineDash([]);
    rctx.lineWidth = 3;
    rctx.strokeStyle = 'rgba(12, 9, 7, 0.75)';
    rulerText(narrow ? `🧭 ${fmt.tokens(state.pace.tokens, true)}` : tr('ruler.sherpa', { tokens: fmt.tokens(state.pace.tokens, true) }), rx - 10, pace, '#57e0c2');
  }
  const gold = '#ffcf3a';
  if (ySum >= top && ySum <= bot) {
    rctx.fillStyle = gold;
    rctx.fillRect(rx - 8, Math.round(ySum) - 1, 16, 3);
    if (stg) rulerText(narrow ? `🏁 ${fmt.tokens(Sr, true)}` : tr('ruler.mark', { tokens: fmt.tokens(Sr, true) }), rx - 11, ySum, gold);
    else rulerText(narrow ? `🚩 ${fmt.tokens(Sr, true)}` : tr('ruler.summit', { tokens: fmt.tokens(Sr, true) }), rx - 11, ySum, gold);
  }
  // excess of whoever passed the summit: dashed ruler above the summit (cut with an arrow if it goes off screen)
  const over = wallList().filter((c) => c.tokens > Sr).sort((p, q) => q.tokens - p.tokens);
  const dir = narrow ? -1 : 1;
  over.forEach((c, i) => {
    const x = Math.round(rx + dir * (6 + i * 6)) + 0.5;
    const yEnd = yOf(c.tokens);
    const from = Math.min(ySum, bot);
    const clip = yEnd < top;
    const to = clip ? top : yEnd;
    if (from <= to) return;
    rctx.setLineDash([5, 4]);
    rctx.strokeStyle = gold;
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.moveTo(x, from);
    rctx.lineTo(x, to);
    rctx.stroke();
    rctx.setLineDash([]);
    rctx.fillStyle = gold;
    if (clip) { // arrow
      rctx.beginPath();
      rctx.moveTo(x, to - 6);
      rctx.lineTo(x - 5, to + 2);
      rctx.lineTo(x + 5, to + 2);
      rctx.fill();
    } else rctx.fillRect(x - 4, Math.round(to) - 1, 8, 2);
    rctx.lineWidth = 3;
    rctx.strokeStyle = 'rgba(12, 9, 7, 0.75)';
    const txt = `${clip ? '↑ ' : ''}#${c.rank} +${fmt.tokens(c.tokens - Sr)}`;
    rulerText(txt, narrow ? x - 8 : x + 8, clip ? to + 12 + i * 14 : to, gold, narrow ? 'right' : 'left');
  });
  // focus: bracket measuring the distance to whoever is right above
  if (cam.mode === 'focus') {
    const wl = wallList();
    const i = wl.findIndex((c) => c.id === cam.focusId);
    const a = actors.get(cam.focusId);
    const b = i > 0 ? actors.get(wl[i - 1].id) : null;
    if (a?.m.on && b?.m.on && !onSummit(a.data)) {
      const c = a.data;
      const above = b.data;
      const d = Math.min(above.tokens, S) - c.tokens;
      const y0 = a.m.hand.y;
      const y1 = b.m.hand.y;
      const x = Math.round(Math.max(a.m.rect.x + a.m.rect.w, b.m.rect.x + b.m.rect.w) + 24) + 0.5;
      rctx.strokeStyle = gold;
      rctx.lineWidth = 2;
      rctx.beginPath();
      rctx.moveTo(x - 6, y0);
      rctx.lineTo(x, y0);
      rctx.lineTo(x, y1);
      rctx.lineTo(x - 6, y1);
      rctx.stroke();
      rctx.lineWidth = 3;
      rctx.strokeStyle = 'rgba(12, 9, 7, 0.75)';
      const full = above.tokens - c.tokens;
      const txt = onSummit(above)
        ? tr(stg ? 'ruler.toMark' : 'ruler.toSummit', { tokens: fmt.tokens(d), full: fmt.tokens(full), rank: above.rank })
        : `${fmt.tokens(full)} ${bodiesText(gapY(full, S))}`;
      rulerText(txt, x + 8, (y0 + y1) / 2, gold, 'left');
    }
  }
}

// ---------- "My climb" card ----------
// 1080×1920 PNG to share inside the company (Teams/Slack): the person's 3D photo on the wall and
// the stage summary (./card.js). Only for whoever is on the wall (the stage's 25).
// Entry points: "📸 Card" on the tag of whoever was clicked, the camera on the Today tab rows and the C key.
//
// The photo is made off screen, on the WebGL canvas itself, in a synchronous sequence (no await in
// between): it draws the photo in a corner of the canvas (in tiles, if the canvas is smaller than it), copies
// it to a 2D canvas and draws the normal frame again before the browser shows anything.
// That way it has the same tone as the screen (exposure, ACES, sRGB) and the same antialiasing, with no new render
// target, no flicker and without touching the camera, the zoom or the framing.
const heroCam = new THREE.PerspectiveCamera(30, HERO.w / HERO.h, 0.2, 20000);
const heroCv = Object.assign(document.createElement('canvas'), { width: HERO.w, height: HERO.h });
const heroCtx = heroCv.getContext('2d');
const cardCv = Object.assign(document.createElement('canvas'), { width: CARD_W, height: CARD_H });
const _dbs = new THREE.Vector2();
const _vp = new THREE.Vector4();
const _aim = V(), _cdir = V(), _occ = V();

// Which side to shoot from (sign of the turn): the one with fewer people between the camera and the person. Tie:
// from the right, looking at the cliff edge (near it, the sky shows).
function heroSide(a, dist, yaw) {
  let best = 1;
  let bestN = Infinity;
  for (const side of [1, -1]) {
    _cdir.set(Math.sin(yaw * side), 0.1, Math.cos(yaw * side)).normalize();
    let n = 0;
    for (const b of actors.values()) {
      if (b === a || !b.root.visible) continue;
      _occ.set(b.x, b.y + 0.3, b.H.z || _aim.z).sub(_aim);
      const t = clamp(_occ.dot(_cdir), 0, dist);
      if (t > 0.6 && _occ.addScaledVector(_cdir, -t).length() < 0.95) n++;
    }
    if (n < bestN) { bestN = n; best = side; }
  }
  return best;
}

// Photo of the person (HERO.w × HERO.h): a bit from the side, the body in the upper middle, with the time-of-day light, the
// magnesium trail and the plaques that happen to be there. No tags or balloons (CSS2D).
function heroShot(a) {
  const W = HERO.w;
  const H = HERO.h;
  // WebGL context lost (GPU reset, laptop waking up): render draws nothing, and the photo
  // would come out with the previous card's image (another person). Canvas with no size: the tiles would never end.
  if (renderer.getContext().isContextLost()) throw new Error(tr('card.recovering'));
  renderer.getDrawingBufferSize(_dbs);
  if (_dbs.x < 64 || _dbs.y < 64) throw new Error(tr('card.tooSmall'));
  heroCtx.clearRect(0, 0, W, H);
  // the person visible, posed right now and in full detail (no LOD or frame culling)
  const was = { vis: a.root.visible, small: a.smallOn, casting: a.casting };
  a.root.visible = true;
  for (const m of a.small) m.visible = true;
  for (const m of a.casters) m.castShadow = true;
  poseActor(a, simTime, 0);
  updateTrail(a);
  ropeMesh.instanceMatrix.needsUpdate = true;
  // framing: the body at ~half the height, above center; face-on at the summit and at the camp
  const top = a.headPos.y + a.headTop;
  const bot = Math.min(a.footY, top - 1.1);
  const span = (top - bot) / 0.5;
  const tanH = Math.tan(THREE.MathUtils.degToRad(heroCam.fov / 2));
  const dist = span / 2 / tanH;
  // at the summit, the camera lower: behind the person is the sky, not the plateau floor
  const front = a.mode === 'summit' || a.mode === 'camp';
  const summit = a.mode === 'summit';
  _aim.set(a.headPos.x, (top + bot) / 2 - (summit ? 0.1 : 0.14) * span, a.headPos.z);
  const yaw = front ? 0.4 : 0.56;
  const side = heroSide(a, dist, yaw);
  _cdir.set(Math.sin(yaw * side), summit ? 0.02 : front ? 0.16 : 0.1, Math.cos(yaw * side)).normalize();
  heroCam.position.copy(_aim).addScaledVector(_cdir, dist);
  heroCam.lookAt(_aim);
  heroCam.aspect = W / H;
  heroCam.updateMatrixWorld();
  // what the photo changes and the normal frame needs back
  const sc = sunLight.shadow.camera;
  const saved = {
    near: scene.fog.near, far: scene.fog.far, sun: sunLight.position.clone(), tgt: sunLight.target.position.clone(),
    box: [sc.left, sc.right, sc.top, sc.bottom], trail: [trailW.value, trailDash.value, grainR.value],
  };
  renderer.getViewport(_vp);
  env.update(0, simTime, heroCam); // sky, sea of clouds and clouds turned toward the photo's camera
  env.setViewDistance(dist);
  Object.assign(sc, { left: -4, right: 4, top: 4, bottom: -4 });
  sc.updateProjectionMatrix();
  sunLight.target.position.copy(_aim);
  sunLight.position.copy(_aim).addScaledVector(lightDir, 120);
  renderer.shadowMap.needsUpdate = true;
  const ppu = H / 2 / (dist * tanH); // photo px per unit: trail and grains with the same stroke as on screen
  trailW.value = 4 / ppu;
  trailDash.value = 26 / ppu;
  grainR.value = 1.4 / ppu;
  // record pitons: only the person's, lit and at real size (on screen they thicken from afar;
  // a lane neighbor's just below them passed for their record, against the card's frame)
  const pins = !!(plaq.sys?.group.visible && plaq.pitonList);
  if (pins) plaq.sys.setPitons(plaq.pitonList.filter((b) => b.id === a.id).map((b) => ({ ...b, dim: false })), 1);
  const pr = renderer.getPixelRatio();
  const TW = Math.min(W, _dbs.x);
  const TH = Math.min(H, _dbs.y);
  try {
    for (let ty = 0; ty < H; ty += TH) {
      for (let tx = 0; tx < W; tx += TW) {
        const tw = Math.min(TW, W - tx);
        const th = Math.min(TH, H - ty);
        heroCam.setViewOffset(W, H, tx, ty, tw, th);
        renderer.setViewport(0, 0, (tw + 0.5) / pr, (th + 0.5) / pr); // bottom left corner, in real px
        renderer.render(scene, heroCam);
        heroCtx.drawImage(renderer.domElement, 0, _dbs.y - th, tw, th, tx, ty, tw, th);
      }
    }
  } finally {
    // everything back and the normal frame redrawn (the browser never sees the photo on the canvas)
    heroCam.clearViewOffset();
    renderer.setViewport(_vp);
    scene.fog.near = saved.near;
    scene.fog.far = saved.far;
    env.update(0, simTime, camera);
    [sc.left, sc.right, sc.top, sc.bottom] = saved.box;
    sc.updateProjectionMatrix();
    sunLight.position.copy(saved.sun);
    sunLight.target.position.copy(saved.tgt);
    [trailW.value, trailDash.value, grainR.value] = saved.trail;
    if (pins) plaq.sys.setPitons(plaq.pitonList, plaq.pitonScale ?? 1);
    a.root.visible = was.vis;
    for (const m of a.small) m.visible = was.small;
    for (const m of a.casters) m.castShadow = was.casting;
    if (!was.vis) {
      hideRope(a);
      a.bottle.visible = false;
      a.zzzLabel.visible = false;
    }
    updateTrail(a);
    ropeMesh.instanceMatrix.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }
  return heroCv;
}

// Card texts (the same formats as the rest of the page). card.js wraps the tiles on plain spaces only,
// so the strings carry non-breaking spaces where a number and its unit or a "· " must stay together.
function cardData(c) {
  const stg = state.stage;
  const top = wallList();
  const i = top.findIndex((x) => x.id === c.id);
  const above = i > 0 ? top[i - 1] : null;
  const below = top[i + 1] ?? null;
  const h = forcedHour ?? zoneHour();
  const active = c.tokens > 0;
  const passed = active && onSummit(c);
  const keep = (s) => s.replace(/ /g, ' '); // a short fragment that never breaks ("this week")
  const period = keep(inPeriod());
  const who = (o) => tr('card.who', { rank: o.rank, name: keep(shortOf(o)) });
  let gap;
  if (!above) gap = !below ? tr('card.alone') : c.tokens - below.tokens < TIE ? tr('card.tieWith', { who: who(below) }) : tr('card.ahead', { tokens: fmt.tokens(c.tokens - below.tokens), rank: below.rank });
  else gap = above.tokens - c.tokens < TIE ? tr('card.tieWith', { who: who(above) }) : tr('card.behind', { tokens: fmt.tokens(above.tokens - c.tokens), who: who(above) });
  const n = c.stageWins ?? 0;
  const pb = c.pb?.tokens > 0 ? c.pb : null;
  const beat = pb && c.tokens > pb.tokens;
  const season = state.season;
  return {
    header: tr('card.header'),
    sub: `${stageLong(stg)} · ${fmt.clock(h)}`,
    rank: c.rank,
    color: rankColor(c.rank),
    jersey: c.jersey ? tr('board.jersey') : '',
    name: nameOf(c),
    stateKind: !active ? 'sleeping' : c.state === 'climbing' ? 'climbing' : 'resting',
    state: !active ? tr('card.notStarted') : tr(c.state === 'climbing' ? 'card.climbing' : 'card.resting', { tokens: fmt.tokens(c.tokens), pace: fmt.pace(c.pace ?? 0) }),
    progress: S ? c.tokens / S : 0,
    passed,
    progressText: passed
      ? tr('card.passed', { tokens: fmt.tokens(c.tokens - S) })
      : tr('card.progress', { pct: fmt.percent(Math.floor((c.tokens / S) * 100) / 100), mark: fmt.tokens(S) }),
    tiles: [
      { icon: '📍', label: tr('card.tile.stage'), text: gap, accent: !above && active },
      {
        icon: '📅',
        label: tr(weekly() ? 'card.tile.week' : 'card.tile.month'),
        text: c.weekRank ? tr('card.weekRank', { rank: c.weekRank, tokens: fmt.tokens(c.weekTokens ?? 0), period }) : tr(weekly() ? 'card.outOfTopWeek' : 'card.outOfTopMonth'),
      },
      { icon: '🏅', label: tr('card.tile.wins'), text: plural(n, 'card.wins', { period }), accent: n > 0 },
      {
        icon: '🔩',
        label: tr('card.tile.best'),
        text: !pb ? tr('card.firstDay') : beat ? tr('card.newBest', { tokens: fmt.tokens(pb.tokens) }) : tr('card.best', { tokens: fmt.tokens(pb.tokens), date: fmt.dayMonth(pb.day) }),
        accent: !!beat,
      },
    ],
    footer: tr('card.footer', { period: season.kind === 'week' ? tr('hud.week', { n: season.week }) : fmt.period(season) }),
  };
}

// Page fonts loaded before drawing (at most 1.5 s; without them the system font is used).
const cardFonts = () => Promise.race([
  Promise.all(['900 40px Nunito', '700 30px Nunito'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {});

// The card of whoever is on the wall, as a PNG (Blob). `onDrawn(canvas)`: the card already drawn, before the
// PNG compression (almost all of the card's ~1 s): the preview shows up already with it.
async function makeCard(id, onDrawn = null) {
  await cardFonts();
  const a = actors.get(id);
  const c = a?.data;
  if (!stageOn() || !c || !wallList().some((x) => x.id === id)) throw new Error(tr('card.notOnWall'));
  const hero = heroShot(a);
  drawCard(cardCv.getContext('2d'), hero, cardData(c));
  onDrawn?.(cardCv);
  return new Promise((res, rej) => cardCv.toBlob((b) => (b ? res(b) : rej(new Error(tr('card.emptyPng')))), 'image/png'));
}

// Preview (dialog): the whole image on screen, "Download PNG", "Copy image" and "Close". Focus
// goes into the dialog and returns to where it was; Esc and the backdrop close it.
const dlg = {
  el: $('#card-dlg'), box: $('#card-box'), title: $('#card-title'), img: $('#card-img'), wait: $('#card-wait'), msg: $('#card-msg'),
  dl: $('#card-dl'), copy: $('#card-copy'), close: $('#card-close'), open: false, back: null, url: null, blob: null, file: '', job: 0,
};
// the card canvas stays in the dialog (hidden): it is the preview while the PNG is compressed
Object.assign(cardCv, { className: 'card-img', hidden: true });
cardCv.setAttribute('role', 'img');
dlg.img.before(cardCv);
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'climber';

async function openCard(id) {
  const c = wallList().find((x) => x.id === id);
  if (!stageOn() || !c || !actors.get(id)?.data) {
    toast(tr('toast.cardOnlyWall'));
    return null;
  }
  const job = ++dlg.job;
  if (!dlg.open) {
    dlg.back = document.activeElement;
    dlg.backId = id; // the list and the tags are redone: on return, the new button of the same person
  }
  dlg.open = true;
  dropCardImage();
  dlg.title.textContent = tr('card.of', { name: nameOf(c) });
  dlg.file = `${slug(config.appName)}-climb-${slug(shortOf(c))}-${state.stage.day}.png`;
  dlg.dl.title = tr('card.saveAs', { file: dlg.file });
  dlg.img.hidden = true;
  cardCv.hidden = true;
  dlg.wait.hidden = false;
  dlg.msg.textContent = '';
  dlg.dl.disabled = dlg.copy.disabled = true;
  dlg.el.hidden = false;
  dlg.box.focus();
  const alt = tr('card.alt', { name: nameOf(c), rank: c.rank });
  const t0 = performance.now();
  try {
    const blob = await makeCard(id, (cv) => {
      if (job !== dlg.job || !dlg.open) return;
      // preview already with the card canvas; the buttons wait for the PNG (the image is the same, the swap does not show)
      cv.setAttribute('aria-label', alt);
      cv.hidden = false;
      dlg.wait.hidden = true;
    });
    const ms = Math.round(performance.now() - t0);
    if (job !== dlg.job || !dlg.open) return null; // closed (or asked for another) in the middle
    dlg.blob = blob;
    dlg.url = URL.createObjectURL(blob);
    dlg.img.src = dlg.url;
    dlg.img.alt = alt;
    // decode() waits for a page frame: with the page not drawing (hidden panel), it goes on without it
    await Promise.race([dlg.img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 500))]);
    if (job !== dlg.job || !dlg.open) return null;
    dlg.img.hidden = false;
    cardCv.hidden = true;
    dlg.wait.hidden = true;
    dlg.dl.disabled = dlg.copy.disabled = false;
    if (document.activeElement === dlg.box) dlg.dl.focus();
    return { ms, w: dlg.img.naturalWidth, h: dlg.img.naturalHeight };
  } catch (err) {
    if (job === dlg.job) {
      cardCv.hidden = true;
      dlg.wait.hidden = true;
      dlg.msg.textContent = tr('card.failed', { msg: err.message });
    }
    return null;
  }
}
function dropCardImage() {
  if (dlg.url) URL.revokeObjectURL(dlg.url);
  dlg.url = null;
  dlg.blob = null;
  dlg.img.removeAttribute('src');
}
function closeCard() {
  if (!dlg.open) return;
  dlg.open = false;
  dlg.job++;
  dlg.el.hidden = true;
  dropCardImage();
  let back = dlg.back;
  dlg.back = null;
  if (back && !back.isConnected) { // the row (or the tag) was redone while the card was open
    if (back.classList.contains('cam')) back = board.rows.get(dlg.backId)?.querySelector('.cam');
    else if (back.classList.contains('tag-card')) back = actors.get(dlg.backId)?.tag.querySelector('.tag-card');
  }
  if (back?.isConnected && back !== document.body) back.focus?.();
}
dlg.close.addEventListener('click', closeCard);
dlg.el.addEventListener('click', (e) => { if (e.target === dlg.el) closeCard(); }); // background
dlg.el.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeCard();
  } else if (e.key === 'Tab') { // focus does not leave the dialog
    const els = [...dlg.box.querySelectorAll('button:not([disabled])')];
    if (!els.length) { e.preventDefault(); return; }
    const i = els.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); els.at(-1).focus(); }
    else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
  }
});
dlg.dl.addEventListener('click', () => {
  if (!dlg.url) return;
  const link = Object.assign(document.createElement('a'), { href: dlg.url, download: dlg.file });
  document.body.append(link);
  link.click();
  link.remove();
});
dlg.copy.addEventListener('click', async () => {
  if (!dlg.blob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': dlg.blob })]);
    dlg.msg.textContent = tr('card.copied');
  } catch {
    dlg.msg.textContent = tr('card.copyFailed');
  }
});

// ---------- Loop ----------

const clock = new THREE.Clock();
let simTime = 0; // simulation time (s); advances per frame, so it pauses along with the tab
let lodOn = true; // debug: climb.lod(false) turns the LOD off

// Who is in frame (with the previous frame's camera) and the body size in px: decides pose,
// shadow and tiny parts of each one.
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sph = new THREE.Sphere();
function cullActors() {
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
  camera.getWorldDirection(_fwd);
  const H = innerHeight;
  for (const a of actors.values()) {
    _sph.center.set(a.x, a.y, a.H.z || view.look.z);
    _sph.radius = 1.8;
    a.onScreen = _frustum.intersectsSphere(_sph);
    // off screen and with no updated pose: the body disappears (it is not left drawn in an old place)
    const vis = !lodOn || a.onScreen;
    if (vis !== a.root.visible) {
      a.root.visible = vis;
      if (!vis) {
        hideRope(a);
        a.bottle.visible = false;
        a.zzzLabel.visible = false;
      }
    }
    const depth = _tp.copy(_sph.center).sub(camera.position).dot(_fwd);
    a.bodyPx = depth > 0.1 ? (a.height * H) / 2 / (depth * FOV_TAN) : 0;
    const cast = !lodOn || a.bodyPx >= 25;
    if (cast !== a.casting) {
      a.casting = cast;
      for (const m of a.casters) m.castShadow = cast;
    }
    const small = !lodOn || a.bodyPx >= 36;
    if (small !== a.smallOn) {
      a.smallOn = small;
      for (const m of a.small) m.visible = small;
    }
    a.glow.visible = glowMat.opacity > 0.01;
  }
}

function frame(dt, draw = true) {
  if (!env) return;
  simTime += dt;
  const t = simTime;
  cullActors();
  for (const a of actors.values()) {
    if (a.leaving && doneLeaving(a, t)) continue;
    updateActor(a, t, dt);
    updateTrail(a);
  }
  ropeMesh.instanceMatrix.needsUpdate = true;
  updateParticles(dt);
  grassTime.value = t;
  if (flagCloth) waveFlag(t);
  updateCamera(dt);
  updatePlaquesFrame(dt);
  // magnesium trail ~2.3 px wide and ~18 px strokes on screen, at any zoom
  const ppu = innerHeight > 0 ? ppuAt(view.dist) : 0;
  if (ppu > 0) {
    trailW.value = clamp(2.3 / ppu, 0.03, 0.8);
    trailDash.value = clamp(18 / ppu, 0.2, 6);
    grainR.value = clamp(0.8 / ppu, 0.008, 0.03);
  }
  env.update(dt, t, camera);
  if (!draw) return;
  layoutMarks(dt);
  drawRuler();
  updateShadow(t);
  renderer.render(scene, camera);
  labels.render(scene, camera);
}

// Shadow: the map is only redrawn when there is a large climber on screen (they move) or when the shadow
// box/the light changed; from afar (Whole wall, all small) almost never.
const shadowKey = { x: NaN, y: NaN, s: NaN, t: -Infinity };
function updateShadow(t) {
  if (!renderer.shadowMap.enabled) return;
  const sc = sunLight.shadow.camera;
  let casting = false;
  for (const a of actors.values()) {
    if (a.onScreen && a.casting && a.root.visible) {
      casting = true;
      break;
    }
  }
  const moved = Math.abs(sunLight.target.position.x - shadowKey.x) + Math.abs(sunLight.target.position.y - shadowKey.y) > 0.002 * sc.right || Math.abs(sc.right - shadowKey.s) > 0.002 * sc.right;
  if (!casting && !moved && t - shadowKey.t < 3) return;
  renderer.shadowMap.needsUpdate = true;
  shadowKey.x = sunLight.target.position.x;
  shadowKey.y = sunLight.target.position.y;
  shadowKey.s = sc.right;
  shadowKey.t = t;
}

// Back after a while with no frames (hidden tab, sleeping laptop): without requestAnimationFrame
// nothing moved, but the data kept arriving, and what stayed in the queue (the midnight rappel, delayed
// climbs) would play now, late, with the camera already on the new data (empty frame, everyone
// climbing from the base for minutes). Instead, each one goes straight to where the data says; the rappel
// only plays at a midnight with the page in view.
function catchUp() {
  const t = simTime;
  for (const a of [...actors.values()]) {
    if (a.leaving) {
      removeActor(a);
      continue;
    }
    const c = a.data;
    if (!c) continue;
    Object.assign(a, { rapPending: null, rap: null, queued: null, creep: null, pop: null, pendingSummit: false, arrive: null });
    a.lastTokens = c.tokens;
    a.lastGainAt = null;
    a.gainAcc = 0;
    a.goal.x = laneXFor(c.id);
    if (onSummit(c)) {
      a.summitX = null;
      a.hip.set(a.goal.x, LIP_Y, 0);
      a.goal.y = LIP_Y;
      a.wantMode = 'summit';
      switchMode(a, 'summit', t);
    } else {
      const want = wantModeFor(c);
      reposition(a, targetYForClimber(c), t);
      a.wantMode = want;
      switchMode(a, want, t);
    }
    a.blendAt = -Infinity; // straight there, without sliding from the old place
    a.restW = a.mode === 'wall' && stageOn() && c.state === 'resting' ? 1 : 0;
  }
  // the ruler and the plaques also go straight to the current scale and lanes (without the 1.5 s slide
  // with the climbers already in place)
  ruler.from = null;
  for (const p of plaq.plates) p.x = p.tx;
  for (const b of plaq.pitons) if (!onSummit(b.c)) b.x = laneXFor(b.id);
  plaq.dirty = true;
  cam.snap = true;
  cam.hold = null;
}

// Dynamic resolution: average of the real frames (rAF) every 2 s; slow → fewer pixels, room to spare
// → goes back up gradually to the maximum.
const perf = { acc: 0, n: 0, since: 0 };
function adaptResolution(realDt) {
  if (!loadingGone || LOW_Q || (DEBUG && !PARAMS.has('dpr'))) return; // debug: fixed resolution (comparable captures); &dpr turns it on
  perf.since += realDt;
  if (perf.since < 4) return; // waits for the loading to settle
  perf.acc += realDt;
  perf.n++;
  if (perf.acc < 2) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0;
  perf.n = 0;
  let next = dpr;
  if (avg > 0.028) next = Math.max(0.6, dpr - 0.15);
  else if (avg < 0.019) next = Math.min(DPR_MAX, dpr + 0.1);
  if (Math.abs(next - dpr) > 0.01) {
    dpr = Math.round(next * 100) / 100;
    renderer.setPixelRatio(dpr);
  }
}

// An error in a frame must not freeze the screen for good (it is a panel that stays on all day):
// the next frame is already scheduled and the error shows up once.
let frameErr = false;
const CATCHUP_S = 20; // more than this without a frame: the tab was hidden or the computer slept
function tick() {
  requestAnimationFrame(tick);
  const real = clock.getDelta();
  try {
    if (real > CATCHUP_S) catchUp();
    frame(Math.min(0.05, real));
    adaptResolution(real);
  } catch (err) {
    if (!frameErr) {
      frameErr = true;
      console.error('Climb 3D: frame error', err);
      showError(tr('error.frame', { msg: err.message }));
    }
  }
}

// Time left in the season: "4d 07h"; on the last day, "7h12" (then "12 min").
function tickCountdown() {
  if (!state) return;
  $('#countdown').textContent = fmt.duration(Math.max(0, state.season.end - Date.now()));
}

function showError(msg) {
  $('#error').hidden = false;
  $('#error').textContent = `⚠️ ${msg}`;
}
// An API error object ({ code, status, retryAfter }, docs/contract.md) in the page's language.
const ERROR_CODES = ['upstream', 'timeout', 'rate_limited', 'auth', 'config', 'unknown', 'offline'];
const errorText = (e) => tr(`error.${ERROR_CODES.includes(e?.code) ? e.code : 'unknown'}`, e ?? {});

let loadingGone = false;
function maybeHideLoading(force = false) {
  if (loadingGone) return;
  const settled = templates.length > 0 && templates.every((t) => t && (t.tpl || t.failed));
  const ready = state && wallList().every((c) => actors.has(c.id));
  if (!force && !settled && !ready) return;
  if (!force && !state && !loadErr) return; // models ready, but the data has not come yet (nor failed)
  loadingGone = true;
  const loading = $('#loading');
  const hide = () => {
    loading.style.opacity = 0;
    setTimeout(() => loading.remove(), 700);
  };
  // compiles the shaders before showing (no ~0.5 s hitch on the first frame), capped at 4 s
  if (env && renderer.compileAsync) Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]).catch(() => {}).finally(hide);
  else hide();
}

let loadErr = false;
let dataLock = false; // debug: with fakeStage the fake data stays (the server is still read, but not applied)
const FAKE_STAGE = DEBUG && PARAMS.get('stage') === 'fake';

// New state on screen: HUD, scene, list and the server's error notice (the data shown is the last
// good reading).
function setState(data) {
  state = data;
  loadErr = false;
  tickCountdown();
  applyState(simTime);
  updateHud();
  $('#error').hidden = !state.error;
  $('#error').textContent = state.error ? `⚠️ ${errorText(state.error)} · ${tr('error.stale')}` : '';
}

async function load() {
  let ok = false;
  try {
    const data = await fetchJSON(PARAMS.has('demo') ? 'api/state?demo' : 'api/state', 15000); // ?demo: the demo region
    if (FAKE_STAGE && !data.stage) data.stage = synthStage(data); // ?debug&stage=fake: synthetic stage
    ok = true;
    if (!dataLock) setState(data);
  } catch (err) {
    loadErr = true;
    showError(tr('error.load', { msg: errorText(err.info) }));
    maybeHideLoading();
  } finally {
    measureUI();
    // after a failure tries again soon (at most 30 s), without waiting for the normal interval
    const every = state ? refreshS() : 30; // 5–600 s: an odd value on the server does not become a tight loop
    setTimeout(load, (ok ? every : Math.min(30, every)) * 1000);
  }
}

async function start() {
  // Network first: data and models leave before the heavy synchronous work (rock, sky).
  load();
  models = await loadManifest();
  models.forEach((_, i) => requestTemplate(i));
  const rock = buildRock(scene, renderer);
  rockMaterial = rock.material; // the mural's slab is the same stone
  env = createEnvironment(scene, rock.detail);
  ledges = createCampLedges(scene);
  buildFlag();
  updateTimeOfDay();
  setInterval(updateTimeOfDay, 60_000);
  setInterval(tickCountdown, 1000);
  setTimeout(() => maybeHideLoading(true), 30_000); // never stuck on the loading screen
  measureUI();
  sizeRuler();
  buildCampSigns();
  updateZoomButtons();
  if (state) applyState(simTime);
  tick();
}

// ---------- Synthetic stage (tests only, ?debug) ----------
// ?debug&stage=fake builds, at every reading, a stage that follows the /api/state contract from the
// week the server sent: it tests the stage wall with a server without state.stage. Each person has
// their own day (seed: id + day): starts between 7:00 and 10:00, has lunch, stops between 17:30 and
// 20:00 and climbs 1 to 9 M/h; ~20% use no tokens that day. The clock is the configured zone's
// (config.utcOffset), or the one of climb.stageHour(h, speed) (which may pass midnight: tests the
// day change).
const HOUR_MS = 3600e3;
const fakeClock = { h: null, at: 0, speed: 1 };
const zoneOffsetMs = () => (Number(config.utcOffset) || 0) * HOUR_MS;
// Local midnight (configured zone) of the day that contains ms.
const zoneDayStart = (ms) => Math.floor((ms + zoneOffsetMs()) / (24 * HOUR_MS)) * 24 * HOUR_MS - zoneOffsetMs();
// The ISO day ("2026-11-05") and weekday (0 = Sunday) of a local midnight.
function dayOfStart(dayStart) {
  const d = new Date(dayStart + zoneOffsetMs()); // UTC fields = local time
  return { day: d.toISOString().slice(0, 10), dow: d.getUTCDay() };
}
// Person identity fields of the contract (docs/contract.md), copied from a climber.
const identity = (c) => ({ id: c?.id ?? null, name: c?.name ?? null, anon: c?.anon ?? null });
// Stage ranking: whoever has tokens today, biggest first; then the sleepers, by the week.
function rankStage(st) {
  st.climbers.sort((p, q) => q.tokens - p.tokens || (q.weekTokens ?? 0) - (p.weekTokens ?? 0)).forEach((c, i) => { c.rank = i + 1; });
  st.activeToday = Math.max(st.activeToday ?? 0, st.climbers.filter((c) => c.tokens > 0).length);
  return st;
}
function synthStage(data, real = Date.now()) {
  const now = fakeClock.h === null ? real : zoneDayStart(fakeClock.at) + fakeClock.h * HOUR_MS + (real - fakeClock.at) * fakeClock.speed;
  const dayStart = zoneDayStart(now);
  const people = data.climbers ?? [];
  const profile = (c) => {
    const r = mulberry32(hash(`${c.id}|${dayStart}`));
    return { on: r() < 0.8, start: 7 + 3 * r(), lunch: 12 + 1.2 * r(), end: 17.5 + 2.5 * r(), rate: (1 + 8 * r() ** 1.6) * 1e6 };
  };
  const tokensAt = (p, ms) => {
    if (!p.on) return 0;
    const h = (ms - dayStart) / HOUR_MS;
    const seg = (a, b) => clamp(Math.min(h, b) - a, 0, b - a);
    return Math.round(p.rate * (seg(p.start, p.lunch) + seg(p.lunch + 1, p.end)));
  };
  const rows = people.map((c) => {
    const p = profile(c);
    const tokens = tokensAt(p, now);
    const hourAgo = tokensAt(p, now - HOUR_MS);
    const last15 = tokens - tokensAt(p, now - HOUR_MS / 4);
    const r = mulberry32(hash(`${c.id}|stages`));
    const row = {
      ...identity(c), avatar: c.avatar, photo: c.photo, body: c.body, rank: 0,
      tokens, hourAgo, last15, pace: tokens - hourAgo, state: last15 >= 20e3 ? 'climbing' : tokens > 0 ? 'resting' : 'sleeping',
      weekRank: c.rank, weekTokens: c.tokens, stageWins: r() < 0.3 ? 1 + Math.floor(2 * r()) : 0, jersey: c.rank === 1,
    };
    Object.assign(c, { stageWins: row.stageWins, jersey: row.jersey, state: row.state, pace: row.pace, last15 });
    return row;
  });
  const winners = [];
  for (let k = 1; winners.length < 10 && k < 30; k++) {
    const L = dayOfStart(dayStart - k * 24 * HOUR_MS);
    if (L.dow === 0 || L.dow === 6) continue;
    const w = people[hash(`${L.day}|winner`) % Math.max(1, people.length)];
    winners.push({ day: L.day, ...identity(w), tokens: Math.round((48 + (hash(L.day) % 25)) * 1e6) });
  }
  const { day } = dayOfStart(dayStart);
  const st = {
    day, startsAt: dayStart, endsAt: dayStart + 24 * HOUR_MS, mark: 60e6, markSource: 'median', markWindow: winners.length, winners,
    activeToday: rows.filter((c) => c.tokens > 0).length, climbers: rows,
  };
  rankStage(st);
  st.climbers = st.climbers.slice(0, SHOWN);
  return st;
}

// `?debug` exposes the state in the console as `window.climb`.
// Stage: fakeStage(stage, lock) sets a stage (a contract object; without it, the synthetic one) and
//   locks the fake data (unlock() releases it); stageHour(h, speed) changes the synthetic stage's clock
//   (with ?stage=fake it moves on its own at every reading); nextDay() simulates midnight (new stage
//   at zero, everyone rappels down); duels() and live() show what is on screen.
// advance(s, draw) simulates s seconds without depending on requestAnimationFrame (useful with the
//   tab hidden); by default it only draws the last frames.
// hour(h) changes the time of day right away (e.g. 11, 18.2, 22); hour(null) goes back to the clock.
// simulateGain(rank, tokens, delay) fakes a refresh where that climber gained tokens (delay in s;
//   without it, the normal random 0–10 s delay). fakeRefresh(fn, delay) is the general one.
// states() sums up each climber; moves(n) lists each one's last limb moves;
// closeup(rank, dist) brings the camera close to a climber (closeup(null) goes back to normal).
// setZoom(level, now) changes the level (top5, top10, top25, wall; 'focus:<rank>' focuses someone);
//   now = without animation.
// measure() returns, per climber, tokens, target (token line and hip) and the y on screen, and the px
//   per M of each gap (on the ruler plane and on each body). lod(false) turns the LOD off.
// Record plaques: fakeRecords(lock) sets the contract's record fields with test values; plaques()
//   lists each plaque (text, position, whether it is in view and what it covers).
// Card: card(rank) opens the preview and resolves { ms, w, h }; cardBlob(rank) returns only the PNG
//   (Blob); closeCard() closes the preview.
if (DEBUG) {
  const byRank = () => [...actors.values()].filter((a) => a.data).sort((p, q) => p.data.rank - q.data.rank);
  const r2 = (n) => (Number.isFinite(n) ? +n.toFixed(2) : n);
  window.climb = {
    actors, scene, camera, renderer, cam, view, LANE, sexOf,
    get dpr() { return dpr; },
    get state() { return state; },
    get S() { return S; },
    advance: (s, draw = 'last') => {
      const n = Math.max(1, Math.round(s * 30));
      for (let i = 0; i < n; i++) frame(1 / 30, draw === true || (draw !== false && i >= n - 12)); // false: draws nothing
    },
    hour: (h) => { forcedHour = h; updateTimeOfDay(); },
    // fakeRefresh(fn, delay): applies a fake refresh; fn(copiedState) changes whatever it wants
    // (the week ranking and the stage ranking are redone from the tokens).
    fakeRefresh: (fn, delay = null) => {
      const s = structuredClone(state);
      fn(s);
      s.climbers.sort((p, q) => q.tokens - p.tokens).forEach((c, i) => { c.rank = i + 1; });
      if (s.stage?.climbers) rankStage(s.stage);
      forceDelay = delay;
      try {
        setState(s);
      } finally {
        forceDelay = null;
      }
    },
    // simulateGain(rank, tokens, delay): in the stage, rank is the stage ranking (the gain goes into
    // today, the last 15 min, the last hour and the week); without it, the season's.
    simulateGain: (rank, tokens, delay = null) => {
      let id = null;
      window.climb.fakeRefresh((s) => {
        if (s.stage?.climbers) {
          const c = s.stage.climbers.find((x) => x.rank === rank);
          if (!c) return;
          Object.assign(c, { tokens: c.tokens + tokens, last15: (c.last15 ?? 0) + tokens, pace: (c.pace ?? 0) + tokens, state: 'climbing', weekTokens: (c.weekTokens ?? 0) + tokens });
          const w = s.climbers.find((x) => x.id === c.id);
          if (w) w.tokens += tokens;
          id = c.id;
          return;
        }
        const c = s.climbers.find((x) => x.rank === rank);
        if (!c) return;
        const Sv = s.season.summitTokens;
        const m = s.mountain;
        c.tokens += tokens;
        c.today += tokens;
        c.progress = c.tokens / Sv;
        c.altitude = Math.round(m.baseAltitude + Math.min(1, c.progress) * (m.summitAltitude - m.baseAltitude));
        id = c.id;
      }, delay);
      const c = wallList().find((x) => x.id === id);
      if (!c) return null;
      const a = actors.get(id);
      return { id, targetY: +targetYForClimber(c).toFixed(3), y: a ? +a.hip.y.toFixed(3) : null, startsIn: a?.queued ? +(a.queued.at - simTime).toFixed(2) : a?.creep ? +(a.creep.t0 - simTime).toFixed(2) : null };
    },
    fakeStage: (stage = null, lock = true) => {
      const s = structuredClone(state);
      s.stage = stage ? structuredClone(stage) : synthStage(s);
      dataLock = lock;
      setState(s);
      return { day: s.stage.day, mark: s.stage.mark, onWall: s.stage.climbers.length, active: s.stage.activeToday };
    },
    unlock: () => { dataLock = false; },
    stageHour: (h, speed = 1) => {
      Object.assign(fakeClock, { h, at: Date.now(), speed });
      if (state && (FAKE_STAGE || dataLock)) {
        const s = structuredClone(state);
        s.stage = synthStage(s);
        setState(s);
      }
      return state?.stage ? { day: state.stage.day, active: state.stage.activeToday } : null;
    },
    // nextDay(delay): local midnight: a new stage at zero (today's winner wins the stage).
    nextDay: (delay = null) => {
      window.climb.fakeRefresh((s) => {
        const st = s.stage;
        if (!st) return;
        const win = [...st.climbers].sort((p, q) => q.tokens - p.tokens)[0];
        if (win?.tokens > 0) {
          st.winners = [{ day: st.day, ...identity(win), tokens: win.tokens }, ...(st.winners ?? [])].slice(0, st.markWindow ?? 10);
          for (const c of [...st.climbers, ...s.climbers]) if (c.id === win.id) c.stageWins = (c.stageWins ?? 0) + 1;
        }
        const L = dayOfStart(st.endsAt);
        Object.assign(st, { day: L.day, startsAt: st.endsAt, endsAt: st.endsAt + 24 * HOUR_MS, activeToday: 0 });
        for (const c of st.climbers) Object.assign(c, { tokens: 0, hourAgo: 0, last15: 0, pace: 0, state: 'sleeping' });
        for (const c of s.climbers) Object.assign(c, { pace: 0, last15: 0, state: 'sleeping' });
      }, delay);
      return state.stage?.day ?? null;
    },
    duels: () => duels.map((d) => ({ id: d.id, target: d.target, rank: d.rank, up: d.up, min: Math.round(d.min), onScreen: duelEls[duels.indexOf(d)]?.shown ?? false })),
    // plaques(): each record plaque (mural, stages, pitons): text, position in the world, whether it
    // is in view and what it covers on screen (bodies, tags, duels, signs, panels) and in the world
    // (the climbers' boxes from the data, camps, other plaques)
    plaques: () => plaquesDebug(),
    // fakeRecords(lock): the contract's record fields with test values (mark 64.5 M, stage 192.8 M,
    // week 367.9 M, latest stages 66.9/63.0/38.8/16.2/37.8 M, pb from 10 to 60 M)
    fakeRecords: (lock = true) => {
      const st = structuredClone(state.stage);
      const w = st.climbers;
      const who = (i) => identity(w[i % w.length]);
      const back = (k) => new Date(Date.parse(`${st.day}T12:00:00Z`) - k * 864e5).toISOString().slice(0, 10);
      const season = state.season;
      st.mark = 64.5e6;
      st.markSource = 'median';
      st.records = {
        since: back(91),
        stage: { ...who(2), tokens: 192.8e6, day: back(7) },
        week: { ...who(0), tokens: 367.9e6, start: back(9), year: season.year, week: Math.max(1, (season.week ?? 2) - 2) },
        weekday: { ...who(5), tokens: 150.2e6, day: back(14) },
      };
      st.recentStages = [66.9, 63.0, 38.8, 16.2, 37.8].map((m, k) => ({ day: back(k + 1), ...who(3 * k + 1), tokens: m * 1e6 }));
      w.forEach((c, i) => { c.pb = i % 7 === 6 ? null : { tokens: Math.round((10 + (hash(c.id) % 5000) / 100) * 1e6), day: back(2 + (hash(c.id) % 20)) }; });
      return window.climb.fakeStage(st, lock);
    },
    // card(rank): opens the card preview of whoever holds that stage place; resolves { ms, w, h }
    // (time to make it and the PNG size). cardBlob(rank): only the PNG (Blob).
    card: async (rank) => {
      const id = wallList().find((c) => c.rank === rank)?.id;
      return id ? openCard(id) : null;
    },
    cardBlob: async (rank) => {
      const id = wallList().find((c) => c.rank === rank)?.id;
      return id ? makeCard(id) : null;
    },
    closeCard: () => closeCard(),
    // resume(): what happens when the tab shows up again after a while hidden
    resume: () => catchUp(),
    // framing(): distance and center of the level's tight frame and of the held frame (levelTarget)
    framing: () => {
      const j = frameFor('level', cam.level);
      const p = cam.hold?.tgt;
      return { tight: { dist: +Math.exp(j.ld).toFixed(1), y: +j.y.toFixed(2) }, held: p ? { dist: +Math.exp(p.ld).toFixed(1), y: +p.y.toFixed(2) } : null };
    },
    // live(true) moves to the next message before answering
    live: (next = false) => {
      if (next) tickerNext();
      return { now: ticker.cur?.text ?? null, queue: ticker.fresh.map((m) => m.text), highlights: ticker.status.map((m) => m.text) };
    },
    states: () => byRank().map((a) => ({
      rank: a.data.rank,
      model: a.tpl.entry.id,
      height: +a.height.toFixed(2),
      mode: a.mode,
      stage: a.data.state ?? null,
      trail: a.trailOn,
      jersey: a.vest.visible,
      sitting: +a.restW.toFixed(2),
      creeping: a.creep ? +(a.creep.y1 - a.goal.y).toFixed(3) : null,
      state: a.stateName,
      y: +a.hip.y.toFixed(3),
      targetY: +a.goal.y.toFixed(3),
      x: +a.goal.x.toFixed(2),
      tempo: +a.tempo.toFixed(2),
      moving: a.mv.active ? a.mv.limb : a.push ? 'hip' : null,
      queued: a.queued ? +(a.queued.at - simTime).toFixed(1) : null,
      onScreen: a.onScreen,
      bodyPx: +a.bodyPx.toFixed(1),
      label: a.m.kind + (a.m.extra ? '+full' : ''),
      maxErrorCm: a.dbg ? Math.max(...LIMB_KEYS.filter((l) => !a.dbg[l].moving).map((l) => a.dbg[l].errorCm)) : null,
    })),
    moves: (n = 8) => Object.fromEntries(byRank().map((a) => [`#${a.data.rank}`, a.log.slice(-n).map((m) => `${m.t.toFixed(2)}s ${m.what} (${m.dur.toFixed(2)}s)`)])),
    // closeup(rank, dist, dir, dy): dy = height of the target relative to the head (-0.55 = middle of the body; 0 = head)
    closeup: (rank, dist = 6, dir = [0.35, 0.15, 1], dy = -0.55) => { view.focus = rank === null ? null : { rank, dist, dy, dir: V(...dir).normalize() }; },
    setZoom: (level, now = false) => {
      const m = /^focus:(\d+)$/.exec(level);
      if (m) setFocus(wallList().find((c) => c.rank === +m[1])?.id);
      else setLevel(level, 'debug');
      if (now) cam.snap = true;
      return { mode: cam.mode, level: cam.level };
    },
    lod: (on) => { lodOn = on; },
    // adapt(ms, n): fakes n frames of ms each in the dynamic resolution (only with &dpr in the URL)
    adapt: (ms, n = 90) => { for (let i = 0; i < n; i++) adaptResolution(ms / 1000); return dpr; },
    measure: () => {
      const ppu = ppuAt(view.dist);
      const rows = byRank().map((a) => {
        const c = a.data;
        const yl = yLine(c.tokens, S);
        const x = onSummit(c) ? a.summitX ?? 0 : a.goal.x;
        const zr = onSummit(c) ? a.H.z : wallZ(x, yl) + HAND_OFF;
        return {
          rank: c.rank,
          name: nameOf(c),
          tokensM: +(c.tokens / 1e6).toFixed(3),
          lineY: +yl.toFixed(3), // token line (hands), the data's target
          hipTarget: +a.goal.y.toFixed(3),
          hip: +a.hip.y.toFixed(3),
          x: +x.toFixed(2),
          screenY: r2(toScreenInto(_tp.set(x, yl, zr), { x: 0, y: 0 }).y), // hands on the rock, in the lane (target)
          rulerY: r2(rulerY(yl)), // the same height on the ruler plane
          // the body really drawn: hip bone projected and where it should land on the ruler
          boneY: r2(toScreenInto(_tp.setFromMatrixPosition(a.bones.Hips.matrixWorld), { x: 0, y: 0 }).y),
          boneRulerY: r2(rulerY(yl - HIP_BELOW)),
          bodyPx: +a.bodyPx.toFixed(1),
          label: a.m.kind + (a.m.extra ? '+full' : ''),
          mode: a.mode,
        };
      });
      const gaps = rows.slice(1).map((r, i) => {
        const p = rows[i];
        const dM = p.tokensM - r.tokensM;
        const pxR = r.rulerY - p.rulerY;
        const pxT = r.screenY - p.screenY;
        const pxO = r.boneY - p.boneY;
        return { from: p.rank, to: r.rank, dM: +dM.toFixed(3), pxRuler: r2(pxR), pxPerMRuler: r2(pxR / dM), pxScreen: r2(pxT), pxPerMScreen: r2(pxT / dM), pxBone: r2(pxO), pxPerMBone: r2(pxO / dM), atSummit: p.mode === 'summit' || r.mode === 'summit' };
      });
      return {
        S, level: cam.level, mode: cam.mode, dist: r2(view.dist), lookY: r2(view.look.y),
        pxPerUnit: r2(ppu), pxPerM: +((ppu * WALL_HEIGHT) / (S / 1e6)).toFixed(4),
        climbers: rows, gaps,
      };
    },
  };
}

start();
