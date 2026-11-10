// The building's card (1080×1350 PNG, to share inside the company): on top, the 3D photo of the
// building as it is on screen (main.js renders a frame and hands over the canvas); below, the person,
// the city and the numbers. Canvas 2D only: it receives the texts already formatted and localized.

export const CARD_W = 1080, CARD_H = 1350;
const PHOTO_H = 860, FONT = "'Nunito', system-ui, sans-serif";

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

// shot: the canvas with the frame; title: the person; sub: city and place; stats: [{ value, label, up? }]
// (three); chips: short strings; brand: the panel's name; date: the day, formatted.
export function drawBuildingCard({ shot, title, sub, stats, chips, brand, date }) {
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const x = cv.getContext('2d');
  x.fillStyle = '#1b242d'; x.fillRect(0, 0, CARD_W, CARD_H);
  // the photo: the middle of the frame, cut to the card's proportion (the building is at the center)
  const k = Math.max(CARD_W / shot.width, PHOTO_H / shot.height), sw = CARD_W / k, sh = PHOTO_H / k;
  x.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, 0, 0, CARD_W, PHOTO_H);
  const fade = x.createLinearGradient(0, PHOTO_H - 200, 0, PHOTO_H);
  fade.addColorStop(0, 'rgba(27,36,45,0)'); fade.addColorStop(1, 'rgba(27,36,45,1)');
  x.fillStyle = fade; x.fillRect(0, PHOTO_H - 200, CARD_W, 200);
  // brand, on the photo
  x.textBaseline = 'middle'; x.textAlign = 'left';
  pill(x, brand, 40, 36, { bg: 'rgba(27,36,45,.82)' });
  // the person and the city
  x.fillStyle = '#ffffff'; x.textBaseline = 'alphabetic';
  x.fillText(fit(x, title, CARD_W - 96, 76, 44), 48, PHOTO_H + 46);
  x.fillStyle = '#b9c6d2';
  x.fillText(fit(x, sub, CARD_W - 96, 34, 24, 700), 48, PHOTO_H + 98);
  // three numbers
  const bw = (CARD_W - 96 - 2 * 20) / 3, by = PHOTO_H + 132;
  stats.slice(0, 3).forEach((s, i) => {
    const bx = 48 + i * (bw + 20);
    x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.roundRect(bx, by, bw, 150, 22); x.fill();
    x.fillStyle = s.up ? '#8fd14f' : '#ffffff'; x.textBaseline = 'alphabetic';
    x.fillText(fit(x, s.value, bw - 44, 64, 36), bx + 22, by + 76);
    x.fillStyle = '#9fb0bf';
    x.fillText(fit(x, s.label, bw - 44, 28, 20, 700), bx + 22, by + 120);
  });
  // chips, on one line (whatever does not fit stays out)
  let cx = 48; const cy = by + 174;
  for (const c of chips) {
    x.font = `800 28px ${FONT}`;
    const w = x.measureText(c).width + 36;
    if (cx + w > CARD_W - 48) break;
    cx += pill(x, c, cx, cy, { bg: 'rgba(242,183,5,.18)', fg: '#ffd36b' }) + 12;
  }
  // the day, at the bottom right
  x.font = `700 26px ${FONT}`; x.fillStyle = '#7f8f9d'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  x.fillText(date, CARD_W - 48, CARD_H - 30);
  return cv;
}
