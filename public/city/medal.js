// The token medals (TOKEN_MARKS in rules.js): a hexagon with the mark, a skyline and a ribbon, drawn
// in canvas 2D at any size: small on the cards and 3072 px on a transparent background to download
// and print (a sticker, a pin, a badge). It receives the texts already localized.

const FONT = "'Nunito', system-ui, sans-serif";
// one look per mark, from the first to the last: metals for the millions, stones for the billions.
// rim: light, middle, dark; face: center, edge; ink: the number's top and bottom; ribbon: the band.
export const MEDAL_LOOKS = [
  { key: 'bronze', rim: ['#ffd7b0', '#c27c46', '#5a2c10'], face: ['#8c522c', '#391b0a'], ink: ['#fff3e6', '#f4b47e'], ribbon: '#7b3a14' }, // 100 million
  { key: 'silver', rim: ['#ffffff', '#b8c3ce', '#56626e'], face: ['#71808e', '#29313a'], ink: ['#ffffff', '#d3dce5'], ribbon: '#47535f' }, // 250 million
  { key: 'gold', rim: ['#fff3b8', '#e2ae2c', '#775006'], face: ['#a97614', '#472e03'], ink: ['#fffbe8', '#ffd860'], ribbon: '#8c5e07' }, // 500 million
  { key: 'platinum', rim: ['#ffffff', '#cde6f4', '#6b8ca3'], face: ['#5f92b6', '#1b3850'], ink: ['#ffffff', '#d8f1ff'], ribbon: '#2e5877' }, // 1 billion
  { key: 'sapphire', rim: ['#d6e5ff', '#3d77e8', '#122a69'], face: ['#2656bc', '#0a1943'], ink: ['#ffffff', '#adcbff'], ribbon: '#163a90' }, // 2 billion
  { key: 'emerald', rim: ['#cfffe9', '#23b97c', '#0a4d32'], face: ['#148c5b', '#052e1d'], ink: ['#ffffff', '#a3f6d1'], ribbon: '#0c6141' }, // 5 billion
  { key: 'cosmic', rim: ['#ffe0f7', '#a074ff', '#28106c'], face: ['#4b24ba', '#110538'], ink: ['#ffffff', '#ffd8f6'], ribbon: '#3a1590', cosmic: true }, // 10 billion
];

// a hexagon standing on a point, with rounded corners
function hex(x, cx, cy, r, round = 0.13) {
  const pts = Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  x.beginPath();
  x.moveTo(...mid(pts[5], pts[0]));
  for (let i = 0; i < 6; i++) x.arcTo(...pts[i], ...mid(pts[i], pts[(i + 1) % 6]), r * round);
  x.closePath();
}
function sparkle(x, px, py, s) {
  x.beginPath(); x.moveTo(px, py - s);
  x.quadraticCurveTo(px, py, px + s, py); x.quadraticCurveTo(px, py, px, py + s);
  x.quadraticCurveTo(px, py, px - s, py); x.quadraticCurveTo(px, py, px, py - s); x.fill();
}
const spaced = (x, px) => { if ('letterSpacing' in x) x.letterSpacing = `${px}px`; };
// the biggest font (weight 900) at which the text fits in w, between max and min
function sized(x, text, w, max, min, weight = 900) {
  let s = max;
  for (; s > min; s -= Math.max(1, max * 0.03)) { x.font = `${weight} ${s}px ${FONT}`; if (x.measureText(text).width <= w) break; }
  return s;
}

// step: the mark's index (0 = the first); value: "2" / "250"; unit: "BI" / "MI"; ribbon: "BILLION
// TOKENS"; brand: the panel's name (on top, small); shadow: false for print (a soft shadow on a
// transparent background prints as a grey halo). The ribbon is wider than the hexagon: about 2.45 r.
export function drawMedal(x, { cx, cy, r, step, value, unit, ribbon, brand, shadow = true }) {
  const L = MEDAL_LOOKS[Math.max(0, Math.min(MEDAL_LOOKS.length - 1, step))];
  x.save();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  // the rim, with a soft shadow under the whole medal
  if (shadow) { x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = r * 0.12; x.shadowOffsetY = r * 0.05; }
  const rim = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, L.rim[0]); rim.addColorStop(0.42, L.rim[1]); rim.addColorStop(1, L.rim[2]);
  hex(x, cx, cy, r); x.fillStyle = rim; x.fill();
  x.shadowColor = 'transparent';
  if (L.cosmic && x.createConicGradient) { // the last one shines in every color
    const iri = x.createConicGradient(0.6, cx, cy);
    ['#ff7ad9', '#7ad7ff', '#fff07a', '#9b7bff', '#ff7ad9'].forEach((c, i, a) => iri.addColorStop(i / (a.length - 1), c));
    x.globalAlpha = 0.55; hex(x, cx, cy, r); x.fillStyle = iri; x.fill(); x.globalAlpha = 1;
  }
  x.lineWidth = r * 0.02; x.strokeStyle = 'rgba(255,255,255,.6)'; hex(x, cx, cy, r * 0.985); x.stroke();
  // the bevel and the face
  hex(x, cx, cy, r * 0.845); x.fillStyle = L.rim[2]; x.fill();
  const face = x.createRadialGradient(cx - r * 0.2, cy - r * 0.38, r * 0.05, cx, cy, r * 0.9);
  face.addColorStop(0, L.face[0]); face.addColorStop(1, L.face[1]);
  hex(x, cx, cy, r * 0.8); x.fillStyle = face; x.fill();
  // in the face: a skyline at the bottom and a few sparkles in the sky
  x.save(); hex(x, cx, cy, r * 0.8); x.clip();
  const SKY = [0.3, 0.48, 0.36, 0.7, 0.44, 0.92, 0.58, 0.4, 0.66, 0.34, 0.5], bw = (r * 1.62) / SKY.length, base = cy + r * 0.8;
  x.fillStyle = 'rgba(255,255,255,.11)';
  SKY.forEach((h, i) => {
    const bx = cx - r * 0.81 + i * bw, top = base - h * r * 0.66;
    x.fillRect(bx + bw * 0.1, top, bw * 0.8, base - top);
    if (h > 0.9) x.fillRect(bx + bw * 0.44, top - r * 0.12, bw * 0.12, r * 0.12); // the tallest has a spire
  });
  x.fillStyle = L.ink[0];
  for (const [sx, sy, ss, a] of [[-0.46, -0.3, 0.06, 0.7], [0.5, -0.36, 0.045, 0.55], [0.36, 0.06, 0.03, 0.4], [-0.56, 0.08, 0.03, 0.35]]) { x.globalAlpha = a; sparkle(x, cx + sx * r, cy + sy * r, ss * r); }
  x.globalAlpha = 1;
  x.restore();
  x.lineWidth = r * 0.012; x.strokeStyle = 'rgba(255,255,255,.28)'; hex(x, cx, cy, r * 0.8); x.stroke();
  // the panel's name on top
  if (brand) {
    spaced(x, r * 0.025); x.fillStyle = L.ink[1]; x.globalAlpha = 0.9;
    sized(x, brand.toUpperCase(), r * 0.8, r * 0.085, r * 0.05, 800); x.fillText(brand.toUpperCase(), cx, cy - r * 0.56);
    x.globalAlpha = 1;
  }
  // the number and the unit
  spaced(x, 0);
  const s = sized(x, value, r * 1.16, r * 0.74, r * 0.3), ny = cy - r * 0.1;
  const ink = x.createLinearGradient(0, ny - s * 0.45, 0, ny + s * 0.4);
  ink.addColorStop(0, L.ink[0]); ink.addColorStop(1, L.ink[1]);
  x.lineJoin = 'round'; x.lineWidth = r * 0.04; x.strokeStyle = 'rgba(0,0,0,.32)'; x.strokeText(value, cx, ny);
  x.fillStyle = ink; x.fillText(value, cx, ny);
  spaced(x, r * 0.05); x.font = `900 ${r * 0.2}px ${FONT}`; x.fillStyle = L.ink[1]; x.fillText(unit, cx + r * 0.025, cy + r * 0.3);
  // the ribbon across the bottom, its tails folded behind
  const ry = cy + r * 0.62, rh = r * 0.26, rw = r * 1.0, drop = rh * 0.26, tail = r * 0.24;
  for (const d of [-1, 1]) {
    const e = cx + d * rw; // the band's end
    x.fillStyle = shade(L.ribbon, -0.28);
    x.beginPath();
    x.moveTo(e - d * r * 0.12, ry - rh / 2 + drop); x.lineTo(e + d * tail, ry - rh / 2 + drop);
    x.lineTo(e + d * (tail - r * 0.1), ry + drop); x.lineTo(e + d * tail, ry + rh / 2 + drop);
    x.lineTo(e - d * r * 0.12, ry + rh / 2 + drop); x.closePath(); x.fill();
    x.fillStyle = shade(L.ribbon, -0.5); // the fold
    x.beginPath(); x.moveTo(e, ry + rh / 2); x.lineTo(e - d * r * 0.12, ry + rh / 2); x.lineTo(e - d * r * 0.12, ry + rh / 2 + drop); x.closePath(); x.fill();
  }
  const band = x.createLinearGradient(0, ry - rh / 2, 0, ry + rh / 2);
  band.addColorStop(0, shade(L.ribbon, 0.18)); band.addColorStop(1, shade(L.ribbon, -0.12));
  x.fillStyle = band; x.fillRect(cx - rw, ry - rh / 2, rw * 2, rh);
  x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(cx - rw, ry - rh / 2, rw * 2, Math.max(1, r * 0.012));
  spaced(x, r * 0.014); x.fillStyle = '#ffffff';
  sized(x, ribbon, rw * 1.8, r * 0.105, r * 0.05); x.fillText(ribbon, cx, ry + r * 0.008);
  x.restore();
}

// a color lighter (k > 0) or darker (k < 0)
function shade(hex6, k) {
  const n = parseInt(hex6.slice(1), 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${ch.map((c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))).join(',')})`;
}

// The medal to download and print: MEDAL_PX square (26 cm at 300 dpi), transparent background, no
// shadow, a margin all round. With a name, a dark plate under it carries the name and the day the mark
// was reached (`since`, already formatted); without one, it is the mark's medal for anyone.
export const MEDAL_PX = 3072;
export function drawMedalSheet(medal, { name, since } = {}) {
  const P = MEDAL_PX, k = P / 2048, cv = document.createElement('canvas'); cv.width = cv.height = P;
  const x = cv.getContext('2d');
  drawMedal(x, { ...medal, cx: P / 2, cy: (name ? 860 : 1000) * k, r: (name ? 700 : 800) * k, shadow: false });
  if (name) {
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const ns = sized(x, name, 1500 * k, 120 * k, 64 * k), nw = Math.min(1820 * k, x.measureText(name).width + 200 * k);
    const py = 1660 * k, ph = (since ? 300 : 210) * k;
    x.fillStyle = '#1b242d'; x.beginPath(); x.roundRect((P - nw) / 2, py, nw, ph, 60 * k); x.fill();
    x.fillStyle = '#ffffff'; x.font = `900 ${ns}px ${FONT}`; x.fillText(name, P / 2, py + (since ? 110 : ph / k / 2) * k);
    if (since) { x.font = `800 ${64 * k}px ${FONT}`; x.fillStyle = '#b9c6d2'; x.fillText(since, P / 2, py + 215 * k); }
  }
  return cv;
}
