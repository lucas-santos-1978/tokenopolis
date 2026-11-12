// The cards (1080×1080 PNG, to share inside the company and on a profile): on top, the 3D photo as it
// is on screen (main.js renders a frame and hands over the canvas); below, the person and the numbers.
// The same card serves the building and the campus (the Mega Builder's corporate profile, every city
// added up), with the person's token medal (medal.js) where the photo ends, when there is one.
// Canvas 2D only: they receive the texts already formatted and localized.

import { drawMedal } from './medal.js';

export const CARD = 1080;
const PHOTO_H = 600, FONT = "'Nunito', system-ui, sans-serif", BG = '#1b242d';

// text that fits: shrinks the font down to `min`, then cuts with an ellipsis
function fit(x, text, maxW, size, min, weight = 900) {
  let s = size;
  for (; s > min; s -= 2) { x.font = `${weight} ${s}px ${FONT}`; if (x.measureText(text).width <= maxW) return text; }
  x.font = `${weight} ${min}px ${FONT}`;
  let out = text;
  while (out.length > 4 && x.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
  return out === text ? text : `${out}…`;
}
function pill(x, text, px, py, { bg = 'rgba(255,255,255,.12)', fg = '#f4f6f8' } = {}) {
  x.font = `800 28px ${FONT}`;
  const w = x.measureText(text).width + 36;
  x.fillStyle = bg; x.beginPath(); x.roundRect(px, py, w, 52, 26); x.fill();
  x.fillStyle = fg; x.textBaseline = 'middle'; x.fillText(text, px + 18, py + 27);
  return w;
}

// the parts both cards share
function canvasOf(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  x.fillStyle = BG; x.fillRect(0, 0, w, h);
  return [cv, x];
}
// the photo: the middle of the frame, cut to the card's proportion (the subject is at the center),
// fading into the card at the bottom; the panel's name on it
function photo(x, shot, w, ph, brand) {
  const k = Math.max(w / shot.width, ph / shot.height), sw = w / k, sh = ph / k;
  x.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, 0, 0, w, ph);
  const fade = x.createLinearGradient(0, ph - 200, 0, ph);
  fade.addColorStop(0, 'rgba(27,36,45,0)'); fade.addColorStop(1, 'rgba(27,36,45,1)');
  x.fillStyle = fade; x.fillRect(0, ph - 200, w, 200);
  x.textBaseline = 'middle'; x.textAlign = 'left';
  pill(x, brand, 40, 36, { bg: 'rgba(27,36,45,.82)' });
}
// the person (title) and the line under it, narrower when the medal stands at the right
function heading(x, title, sub, y, maxW, big) {
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#ffffff'; x.fillText(fit(x, title, maxW, big, 44), 48, y);
  x.fillStyle = '#b9c6d2'; x.fillText(fit(x, sub, maxW, Math.round(big * 0.45), 24, 700), 48, y + Math.round(big * 0.7));
}
// three numbers in boxes
function numbers(x, stats, w, y, h) {
  const bw = (w - 96 - 2 * 20) / 3;
  stats.slice(0, 3).forEach((s, i) => {
    const bx = 48 + i * (bw + 20);
    x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.roundRect(bx, y, bw, h, 22); x.fill();
    x.textAlign = 'left'; x.fillStyle = s.up ? '#8fd14f' : '#ffffff'; x.textBaseline = 'alphabetic';
    x.fillText(fit(x, s.value, bw - 44, Math.round(h * 0.43), 36), bx + 22, y + h * 0.5);
    x.fillStyle = '#9fb0bf';
    x.fillText(fit(x, s.label, bw - 44, 28, 20, 700), bx + 22, y + h * 0.8);
  });
}
// chips on one line (whatever does not fit stays out) and the day at the bottom right
function footer(x, chips, w, h, y, date) {
  let cx = 48;
  for (const c of chips) {
    x.font = `800 28px ${FONT}`;
    if (cx + x.measureText(c).width + 36 > w - 48) break;
    cx += pill(x, c, cx, y, { bg: 'rgba(242,183,5,.18)', fg: '#ffd36b' }) + 12;
  }
  x.font = `700 26px ${FONT}`; x.fillStyle = '#7f8f9d'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  x.fillText(date, w - 48, h - 30);
}

// The card, square: shot: the canvas with the frame; title: the person; sub: the line under it
// (city and place, or the campus); stats: [{ value, label, up? }] (three); chips: short strings; brand:
// the panel's name; date: the day, formatted; medal: drawMedal's texts and step, or null.
export function drawCard({ shot, title, sub, stats, chips, brand, date, medal }) {
  const [cv, x] = canvasOf(CARD, CARD), mx = CARD - 185, r = 136;
  photo(x, shot, CARD, PHOTO_H, brand);
  heading(x, title, sub, PHOTO_H + 92, medal ? mx - r * 1.25 - 48 - 24 : CARD - 96, 72);
  numbers(x, stats, CARD, PHOTO_H + 180, 140);
  footer(x, chips, CARD, CARD, PHOTO_H + 346, date);
  if (medal) drawMedal(x, { ...medal, cx: mx, cy: PHOTO_H - 10, r });
  return cv;
}
