// Record plaques on the rock (3D wall): the records mural at the summit, the small steel plaques of
// the latest stages and each climber's personal-record piton. They are real 3D objects: a thin plate
// with the text on a canvas texture (sharp up close), bolts in the corners and a little light
// of their own at night, like the climbers. Only the pieces live here; where each one goes (lanes,
// collisions, scale) is decided by main.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FONT = "'Nunito', system-ui, sans-serif";
const DEPTH = 0.05; // plate thickness
const BOLT_MAX = 64; // corner bolts (mural + small plaques)
const PITON_MAX = 32; // personal-record pitons (one per climber on the wall)

// Own light (shared uniform): by day almost nothing, at night enough to read. The environment
// updates it by the time of day (main.js, updateTimeOfDay).
export const plaqueGlow = { value: 0.04 };
// `extra`: additional fixed own light (the piton is small and needs to show up on the rock)
const glowShader = (extra) => (sh) => {
  sh.uniforms.uPlaqueGlow = plaqueGlow;
  sh.fragmentShader = `uniform float uPlaqueGlow;\n${sh.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * (uPlaqueGlow + ${extra.toFixed(3)});`,
  )}`;
};
const glowMaterial = (opts, extra = 0) => {
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = glowShader(extra);
  m.customProgramCacheKey = () => `plaque${extra}`;
  return m;
};

// Styles: bronze (summit mural) and brushed steel (stages). Colors on the canvas; the plate only gives the relief.
const STYLE = {
  bronze: {
    edge: '#5e3b1c', bg: ['#8a5a2c', '#6a4220', '#55341a'], rim: '#c08a4c', inner: 'rgba(40, 22, 8, 0.55)',
    title: '#ffd77a', label: '#f2bf72', value: '#fff0cf', sub: '#e9cba2', shadow: 'rgba(30, 15, 4, 0.85)', hi: null, hole: '#2c1a0b',
  },
  steel: {
    edge: '#7d848e', bg: ['#d3d8df', '#aeb5bf', '#959ca7'], rim: '#eef1f5', inner: 'rgba(40, 46, 56, 0.45)',
    title: '#1b2026', label: '#3b434e', value: '#161b21', sub: '#3b434e', shadow: null, hi: 'rgba(255, 255, 255, 0.75)', hole: '#5b616b',
  },
};
const edgeMats = {};
const edgeMat = (style) => (edgeMats[style] ??= glowMaterial({ color: STYLE[style].edge, roughness: 0.45, metalness: 0.35 }));

// Plaque rows, in world units: { kind: 'title' | 'value' | 'name' | 'sub' | 'date' | 'big',
// text, label? }. 'value' is "Label: value" (the label smaller and in another color; the big number is what
// you read from afar). The width comes from the longest row (between minW and maxW); a row that doesn't fit
// shrinks (down to 70%) and, if it still doesn't fit, is cut.
const SIZE = { title: 0.28, value: 0.5, name: 0.3, sub: 0.2, date: 0.25, big: 0.46 };
const WEIGHT = { title: 900, value: 900, name: 800, sub: 700, date: 800, big: 900 };
const GAP = { title: 0.14, value: 0.03, name: 0.02, sub: 0.16, date: 0.03, big: 0 };
const LABEL_K = 0.64; // the 'value' label relative to the number

const measure = document.createElement('canvas').getContext('2d');
function lineWidth(ctx, row, px) {
  ctx.font = `${WEIGHT[row.kind]} ${px}px ${FONT}`;
  if (row.kind !== 'value') return ctx.measureText(row.text).width;
  const w = ctx.measureText(row.text).width;
  ctx.font = `${WEIGHT[row.kind]} ${px * LABEL_K}px ${FONT}`;
  return ctx.measureText(`${row.label}: `).width + w;
}

// Draws the plaque on a new canvas; returns { canvas, w, h } (w, h in world units).
function drawPlaque(rows, { style, ppu, pad, minW, maxW }) {
  const S = STYLE[style];
  const natural = Math.max(...rows.map((r) => lineWidth(measure, r, SIZE[r.kind] * 100) / 100));
  const w = Math.min(maxW, Math.max(minW, natural + 2 * pad));
  let h = 2 * pad;
  rows.forEach((r, i) => { h += SIZE[r.kind] + (i < rows.length - 1 ? GAP[r.kind] : 0); });
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * ppu);
  cv.height = Math.ceil(h * ppu);
  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  // background: metal gradient, fine brushed scratches, beveled border and bolt holes
  const grad = g.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0, S.bg[0]);
  grad.addColorStop(0.55, S.bg[1]);
  grad.addColorStop(1, S.bg[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = style === 'steel' ? 0.07 : 0.05;
  for (let y = 0; y < H; y += 3) {
    g.fillStyle = (y * 7919) % 5 < 2 ? '#ffffff' : '#000000';
    g.fillRect(0, y, W, 1);
  }
  g.globalAlpha = 1;
  const bw = Math.max(3, Math.round(0.035 * ppu));
  g.lineWidth = bw;
  g.strokeStyle = S.rim;
  g.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
  g.lineWidth = Math.max(1, bw / 2);
  g.strokeStyle = S.inner;
  g.strokeRect(bw * 1.8, bw * 1.8, W - bw * 3.6, H - bw * 3.6);
  const hole = Math.max(4, 0.06 * ppu);
  const hm = 0.075 * ppu;
  g.fillStyle = S.hole;
  for (const [x, y] of [[hm, hm], [W - hm, hm], [hm, H - hm], [W - hm, H - hm]]) {
    g.beginPath();
    g.arc(x, y, hole, 0, Math.PI * 2);
    g.fill();
  }
  // text: embossed on the bronze (dark shadow below), engraved on the steel (highlight below)
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let y = pad * ppu;
  const room = W - 2 * pad * ppu;
  const ink = (text, x, yy, color) => {
    const off = Math.max(1, Math.round(0.012 * ppu));
    if (S.shadow) { g.fillStyle = S.shadow; g.fillText(text, x + off * 0.5, yy + off); }
    if (S.hi) { g.fillStyle = S.hi; g.fillText(text, x, yy + off); }
    g.fillStyle = color;
    g.fillText(text, x, yy);
  };
  rows.forEach((r, i) => {
    let px = SIZE[r.kind] * ppu;
    const full = lineWidth(g, r, px);
    if (full > room) px *= Math.max(0.7, room / full);
    let text = r.text;
    while (lineWidth(g, { ...r, text }, px) > room && text.length > 4) text = `${text.slice(0, -2)}…`; // still too big: cut
    const lw = lineWidth(g, { ...r, text }, px);
    const x0 = (W - lw) / 2;
    y += SIZE[r.kind] * ppu * 0.82; // baseline (Nunito: ~82% of the height above it)
    if (r.kind === 'value') {
      const lab = `${r.label}: `;
      g.font = `${WEIGHT[r.kind]} ${px * LABEL_K}px ${FONT}`;
      ink(lab, x0, y, S.label);
      const lw = g.measureText(lab).width;
      g.font = `${WEIGHT[r.kind]} ${px}px ${FONT}`;
      ink(text, x0 + lw, y, S.value);
    } else {
      g.font = `${WEIGHT[r.kind]} ${px}px ${FONT}`;
      ink(text, x0, y, r.kind === 'title' ? S.title : r.kind === 'sub' || r.kind === 'date' ? S.sub : S.value);
    }
    y += SIZE[r.kind] * ppu * 0.18 + (i < rows.length - 1 ? GAP[r.kind] * ppu : 0);
  });
  return { canvas: cv, w, h };
}

// Unit box with only two groups: the front (+z, with the texture) and the rest (the plate's edge).
// With the six groups of BoxGeometry it would be six draw calls per plaque.
const boxGeo = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const idx = Array.from(g.index.array);
  const front = idx.slice(24, 30); // faces in the order +x, −x, +y, −y, +z, −z; 6 indices each
  const rest = [...idx.slice(0, 24), ...idx.slice(30)];
  g.setIndex([...front, ...rest]);
  g.clearGroups();
  g.addGroup(0, front.length, 0);
  g.addGroup(front.length, rest.length, 1);
  return g;
})();
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _s = new THREE.Vector3(1, 1, 1);
const Z = new THREE.Vector3(0, 0, 1);

// One plaque: a plate (thin box; the front face takes the texture) that can swap its text and
// attach to a point on the rock. The texture is only redone when the text changes (the old one is freed).
function makePlaque(group, style, opts) {
  const face = glowMaterial({ roughness: 0.5, metalness: 0.25 });
  const edge = edgeMat(style);
  const mesh = new THREE.Mesh(boxGeo, [face, edge]);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  const p = {
    mesh, style, key: '', w: 1, h: 1, tex: null,
    setRows(rows) {
      const key = JSON.stringify(rows);
      if (key === p.key) return false;
      p.key = key;
      const d = drawPlaque(rows, opts);
      const tex = new THREE.CanvasTexture(d.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = opts.anisotropy;
      p.tex?.dispose();
      p.tex = tex;
      face.map = tex;
      face.needsUpdate = true;
      p.w = d.w;
      p.h = d.h;
      return true;
    },
    // center (x, y, z) in front of the rock and the surface normal (already normalized)
    place(x, y, z, normal) {
      mesh.position.set(x, y, z);
      mesh.quaternion.setFromUnitVectors(Z, normal);
      mesh.scale.set(p.w, p.h, DEPTH);
      mesh.updateMatrix();
      mesh.updateMatrixWorld();
    },
    // corner bolts (4 matrices, in world space), written into `bolts` starting at `i`
    bolts(bolts, i) {
      const mx = 0.5 - 0.075 / p.w;
      const my = 0.5 - 0.075 / p.h;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        _p.set(sx * mx, sy * my, 0.5).applyMatrix4(mesh.matrixWorld);
        bolts.setMatrixAt(i++, _m.compose(_p, mesh.quaternion, _one));
      }
      return i;
    },
  };
  return p;
}

// Stone slab (the mural is fixed to it, standing on the plateau): a box with chipped corners, in the
// same material as the rock.
function slabGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d, 10, 8, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.sin(x * 5.1 + y * 2.3) * 0.5 + Math.sin(x * 1.7 - y * 6.2 + z * 3) * 0.5;
    const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(y) / (h / 2));
    const s = 1 - 0.035 * Math.max(0, edge - 0.75) * 4 * (1 + k);
    pos.setXYZ(i, x * s, y * (y > 0 ? s : 1), z * (z < 0 ? 1 : s) + (z > 0 ? 0.02 * k : 0));
  }
  geo.computeVertexNormals();
  return geo;
}

// Personal-record piton (hanger plate with a ring and the bolt head), on the +z axis; ~0.4 tall,
// with the head at the height of the record.
function pitonGeometry() {
  const plate = new THREE.BoxGeometry(0.15, 0.24, 0.02);
  plate.translate(0, -0.04, 0.01);
  const head = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, 0.04);
  const ring = new THREE.TorusGeometry(0.075, 0.019, 6, 18);
  ring.translate(0, -0.19, 0.045);
  const parts = [plate, head, ring].map((g) => g.toNonIndexed());
  for (const g of parts) g.deleteAttribute('uv');
  return mergeGeometries(parts);
}

// Builds the set (empty until there is data). `rockMaterial`: the wall material, for the mural slab.
export function createPlaques(scene, { rockMaterial, anisotropy = 4 } = {}) {
  const group = new THREE.Group();
  group.name = 'plaques';
  group.visible = false;
  scene.add(group);

  const boltMat = glowMaterial({ color: '#c6c9cf', metalness: 0.6, roughness: 0.35 });
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.045, 0.035, 6).rotateX(Math.PI / 2), boltMat, BOLT_MAX);
  bolts.frustumCulled = false;
  bolts.count = 0;
  group.add(bolts);

  // pitons: color per instance (bronze; gold when the record was broken today)
  const pitonMat = glowMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.4 }, 0.22);
  const pitons = new THREE.InstancedMesh(pitonGeometry(), pitonMat, PITON_MAX);
  pitons.frustumCulled = false;
  pitons.count = 0;
  pitons.setColorAt(0, new THREE.Color('#b8733a')); // creates the color attribute
  group.add(pitons);

  const mural = makePlaque(group, 'bronze', { style: 'bronze', ppu: 230, pad: 0.22, minW: 3.6, maxW: 4.6, anisotropy });
  let slab = null;
  const plates = [];
  const plateOpts = { style: 'steel', ppu: 256, pad: 0.12, minW: 1.3, maxW: 2.8, anisotropy };

  return {
    group, mural, plates, bolts, pitons,
    // n stage plaques (creates the missing ones; the extra ones stay hidden)
    plate(i) {
      while (plates.length <= i) plates.push(makePlaque(group, 'steel', plateOpts));
      return plates[i];
    },
    // stone slab behind the mural (w × h, base at y0), with the front at z; rebuilt only if the size changes
    setSlab(x, y0, z, w, h, d) {
      const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d}`;
      if (!slab) {
        slab = new THREE.Mesh(slabGeometry(w, h, d), rockMaterial ?? glowMaterial({ color: '#6d6259', roughness: 0.95 }));
        slab.castShadow = true;
        slab.receiveShadow = true;
        slab.userData.key = key;
        group.add(slab);
      } else if (slab.userData.key !== key) {
        slab.geometry.dispose();
        slab.geometry = slabGeometry(w, h, d);
        slab.userData.key = key;
      }
      slab.position.set(x, y0 + h / 2, z - d / 2);
      slab.visible = true;
      return slab;
    },
    hideSlab(hide = true) { if (slab) slab.visible = !hide; },
    // one piton per item: { x, y, z, gold, dim }; `scale` thickens the lit ones (from afar they remain a
    // visible dot); `dim`: unlit (darker, less light at night) and at true size
    setPitons(list, scale = 1) {
      const n = Math.min(PITON_MAX, list.length);
      for (let i = 0; i < n; i++) {
        const b = list[i];
        _n.copy(b.normal ?? Z);
        _q.setFromUnitVectors(Z, _n);
        _s.setScalar(b.dim ? 1 : scale);
        pitons.setMatrixAt(i, _m.compose(_p.set(b.x, b.y, b.z), _q, _s));
        pitons.setColorAt(i, b.dim ? (b.gold ? GOLD_DIM : BRONZE_DIM) : b.gold ? GOLD : BRONZE);
      }
      pitons.count = n;
      pitons.instanceMatrix.needsUpdate = true;
      if (pitons.instanceColor) pitons.instanceColor.needsUpdate = true;
    },
  };
}
const GOLD = new THREE.Color('#ffcf3a');
const BRONZE = new THREE.Color('#b8733a');
// unlit: up close, the piton of whoever is not in the frame (its own light comes from the color, so it drops too)
const GOLD_DIM = new THREE.Color('#7d6a2e');
const BRONZE_DIM = new THREE.Color('#5f4129');

// Average rock normal over a rectangle (w × h) centered at (x, y) and the z that leaves the whole plate in
// front of it: a plane through the corners (limited tilt) and pushed out as far as the relief requires.
export function fitToRock(wallZ, x, y, w, h, out = {}) {
  const hw = w / 2;
  const hh = h / 2;
  const zl = (wallZ(x - hw, y - hh) + wallZ(x - hw, y + hh)) / 2;
  const zr = (wallZ(x + hw, y - hh) + wallZ(x + hw, y + hh)) / 2;
  const zb = (wallZ(x - hw, y - hh) + wallZ(x + hw, y - hh)) / 2;
  const zt = (wallZ(x - hw, y + hh) + wallZ(x + hw, y + hh)) / 2;
  const clampS = (s) => Math.max(-0.45, Math.min(0.45, s));
  const sx = clampS((zr - zl) / w);
  const sy = clampS((zt - zb) / h);
  const z0 = (zl + zr) / 2;
  // the rock point that sticks out the most relative to the plane pushes the plaque forward
  let push = 0;
  for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const px = x + u * hw * 0.95;
    const py = y + v * hh * 0.95;
    push = Math.max(push, wallZ(px, py) - (z0 + sx * (px - x) + sy * (py - y)));
  }
  out.z = z0 + push + DEPTH / 2 + 0.015;
  out.normal = (out.normal ?? new THREE.Vector3()).set(-sx, -sy, 1).normalize();
  return out;
}
