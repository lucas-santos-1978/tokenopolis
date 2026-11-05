// Effects: fireworks (milestone, lead, new mayor), confetti (newcomer), sparkles (whoever is
// building now), the pulsing ring (countdown) and the Space Elevator's rocket. Particles in
// THREE.Points, one cloud per effect, that fade away on their own.

import * as THREE from 'three';

const PARTY = ['#ffd36b', '#ff6b6b', '#6bd3ff', '#9cff6b', '#ffffff', '#ff9cf3'];
const disc = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d');
  const g = x.createRadialGradient(16, 16, 2, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

export function makeEffects(scene) {
  let effects = [];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b705', transparent: true, opacity: 0, depthWrite: false }));
  ring.visible = false; scene.add(ring);
  let ringAt = null;

  // kind: firework | confetti | sparkle; at: { x, y, z }
  function spawn(kind, at, { hue = 0, dur = 2400, delay = 0 } = {}) {
    const n = { firework: 70, confetti: 80, sparkle: 14 }[kind] ?? 0;
    if (!n) return;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [], c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.set(PARTY[(i + hue) % 6]); col.set([c.r, c.g, c.b], i * 3);
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), sp = kind === 'firework' ? 16 + Math.random() * 18 : kind === 'sparkle' ? 4 + Math.random() * 6 : 3 + Math.random() * 6;
      vel.push(kind === 'confetti' ? [Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp] : [Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp]);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: kind === 'sparkle' ? 1.4 : 2.2, map: disc, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.visible = false; scene.add(pts);
    effects.push({ kind, pts, vel, at: { ...at, y: at.y + (kind === 'firework' ? 34 : kind === 'confetti' ? 14 : 2) }, t0: performance.now() + delay, dur, g: kind === 'confetti' ? 4 : kind === 'firework' ? 9 : 2 });
    if (effects.length > 60) { const old = effects.shift(); scene.remove(old.pts); old.pts.geometry.dispose(); old.pts.material.dispose(); }
  }
  function step(now) {
    effects = effects.filter((e) => {
      const el = now - e.t0;
      if (el > e.dur) { scene.remove(e.pts); e.pts.geometry.dispose(); e.pts.material.dispose(); return false; }
      if (el < 0) return true;
      const t = el / 1000, u = el / e.dur, pos = e.pts.geometry.attributes.position;
      for (let i = 0; i < e.vel.length; i++) {
        const [vx, vy, vz] = e.vel[i];
        const drag = e.kind === 'firework' ? 1 - u * 0.55 : 1;
        pos.setXYZ(i, e.at.x + vx * t * drag + (e.kind === 'confetti' ? Math.sin(t * 6 + i) * 1.2 : 0), e.at.y + vy * t * drag - e.g * t * t, e.at.z + vz * t * drag);
      }
      pos.needsUpdate = true; e.pts.visible = true;
      e.pts.material.opacity = u < 0.1 ? u / 0.1 : 1 - Math.max(0, (u - 0.6) / 0.4);
      return true;
    });
    // pulsing ring on the countdown's building
    if (ringAt) {
      const u = (now % 1600) / 1600, rr = 6 + u * 26;
      ring.visible = true; ring.position.set(ringAt.x, 0.6, ringAt.z); ring.scale.set(rr, 1, rr); ring.material.opacity = (1 - u) * 0.9;
    } else ring.visible = false;
  }
  const setRing = (at) => { ringAt = at; };
  return { spawn, step, setRing };
}

// The space elevator's launch: the rocket rises from the top and vanishes in the sky, with smoke.
export function launchRocket(scene, at, matte) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 7, 10), matte('#f4f6f8')); body.position.y = 3.5; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 10), matte('#d9473f')); nose.position.y = 8.5; g.add(nose);
  for (const s of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.5, 2), matte('#d9473f')); fin.position.set(s * 1.5, 1.2, 0); g.add(fin); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 8).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 })); flame.position.y = -2; g.add(flame);
  g.position.set(at.x, at.y, at.z); scene.add(g);
  const smoke = new THREE.Group(); scene.add(smoke);
  const puffMat = new THREE.SpriteMaterial({ color: '#e8e8ec', transparent: true, opacity: 0.6, depthWrite: false });
  const t0 = performance.now(), dur = 6500;
  let lastPuff = 0;
  return function step(now) {
    const u = (now - t0) / dur;
    if (u >= 1) { scene.remove(g); scene.remove(smoke); return false; }
    const k = u < 0.12 ? 0 : ((u - 0.12) / 0.88) ** 2;
    g.position.y = at.y + k * 900; g.position.x = at.x + (u < 0.12 ? Math.sin(now / 30) * 0.4 : 0);
    flame.scale.y = 0.8 + Math.random() * 0.6;
    if (now - lastPuff > 60) { lastPuff = now; const s = new THREE.Sprite(puffMat.clone()); const sz = 3 + Math.random() * 3; s.scale.set(sz, sz, 1); s.position.set(g.position.x + (Math.random() - 0.5) * 2, g.position.y - 3, at.z + (Math.random() - 0.5) * 2); s.userData.t0 = now; smoke.add(s); }
    for (const s of [...smoke.children]) { const a = (now - s.userData.t0) / 2500; if (a >= 1) smoke.remove(s); else { s.material.opacity = 0.6 * (1 - a); s.scale.multiplyScalar(1.01); } }
    return true;
  };
}
