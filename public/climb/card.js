// "My climb" card (1080×1920 PNG, to share inside the company: Teams/Slack). On top, the 3D
// photo of the person on the wall (rendered off-screen by main.js); below, the summary of the
// stage. Canvas 2D only: it receives the already formatted texts (localized, "M") and draws.
export const CARD_W = 1080;
export const CARD_H = 1920;
// Photo area on the card (the photo is rendered at exactly this size).
export const HERO = { x: 60, y: 172, w: 960, h: 980 };

const FONT = "'Nunito', system-ui, sans-serif";
const INK = '#f6f1ea';
const MUTED = '#c9bfb3';
const GOLD = '#ffcf3a';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Font that makes the text fit in maxW (from the requested size down to `min`).
function fit(g, text, weight, size, maxW, min = size * 0.6) {
  let s = size;
  for (; s > min; s -= 2) {
    g.font = `${weight} ${s}px ${FONT}`;
    if (g.measureText(text).width <= maxW) break;
  }
  g.font = `${weight} ${s}px ${FONT}`;
  return s;
}

// Text that still does not fit in maxW (in the current font): cut with an ellipsis.
function ellipsize(g, text, maxW) {
  let t = String(text);
  if (g.measureText(t).width <= maxW) return t;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Wraps into lines of up to maxW (word by word).
function wrap(g, text, maxW) {
  const lines = [];
  let cur = '';
  for (const word of String(text).split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && g.measureText(next).width > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// d: { header, sub, rank, color, jersey, name, state, stateKind, progress (0–1), passed,
//      progressText, tiles: [{ icon, label, text, accent }] (4), footer }
export function drawCard(g, hero, d) {
  g.save();
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  // dark background with a faint warm glow on top (the rank color)
  const bg = g.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#1a1510');
  bg.addColorStop(0.45, '#11121b');
  bg.addColorStop(1, '#0b0f1e');
  g.fillStyle = bg;
  g.fillRect(0, 0, CARD_W, CARD_H);
  const glow = g.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, 900);
  glow.addColorStop(0, `${d.color}33`);
  glow.addColorStop(1, `${d.color}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, CARD_W, 900);

  // header
  g.fillStyle = GOLD;
  if ('letterSpacing' in g) g.letterSpacing = '6px';
  fit(g, d.header, 900, 46, CARD_W - 120, 28); // a long APP_NAME shrinks, then gets an ellipsis
  g.fillText(ellipsize(g, d.header, CARD_W - 120), 60, 94);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.fillStyle = MUTED;
  fit(g, d.sub, 700, 32, CARD_W - 120);
  g.fillText(d.sub, 60, 142);

  // photo (rounded corners), with a gradient at the bottom and the rank medal
  const H = HERO;
  g.save();
  roundRect(g, H.x, H.y, H.w, H.h, 36);
  g.clip();
  g.fillStyle = '#20242f';
  g.fillRect(H.x, H.y, H.w, H.h);
  if (hero) g.drawImage(hero, H.x, H.y, H.w, H.h);
  const shade = g.createLinearGradient(0, H.y + H.h - 220, 0, H.y + H.h);
  shade.addColorStop(0, 'rgba(11, 15, 30, 0)');
  shade.addColorStop(1, 'rgba(11, 15, 30, 0.55)');
  g.fillStyle = shade;
  g.fillRect(H.x, H.y + H.h - 220, H.w, 220);
  g.restore();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  roundRect(g, H.x + 1.5, H.y + 1.5, H.w - 3, H.h - 3, 35);
  g.stroke();
  // "#3" medal
  const mx = H.x + 92;
  const my = H.y + 92;
  g.beginPath();
  g.arc(mx, my, 60, 0, Math.PI * 2);
  g.fillStyle = 'rgba(18, 14, 12, 0.85)';
  g.fill();
  g.beginPath();
  g.arc(mx, my, 52, 0, Math.PI * 2);
  g.fillStyle = d.color;
  g.fill();
  g.fillStyle = '#15110d';
  g.textAlign = 'center';
  const rank = `#${d.rank}`;
  fit(g, rank, 900, rank.length > 2 ? 40 : 48, 88);
  g.fillText(rank, mx, my + 16);
  // yellow jersey (leader of the week)
  if (d.jersey) {
    g.font = `900 32px ${FONT}`;
    const t = d.jersey;
    const w = g.measureText(t).width + 48;
    const x = H.x + H.w - 32 - w;
    const y = H.y + 52;
    roundRect(g, x, y, w, 64, 32);
    g.fillStyle = '#ffd21a';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(18, 14, 12, 0.6)';
    g.stroke();
    g.fillStyle = '#1a1408';
    g.fillText(t, x + w / 2, y + 43);
  }
  g.textAlign = 'left';

  // name, state and the bar up to the mark of the day
  let y = H.y + H.h + 92;
  g.fillStyle = INK;
  fit(g, d.name, 900, 78, CARD_W - 120, 44);
  g.fillText(ellipsize(g, d.name, CARD_W - 120), 60, y); // huge name (long nickname): ellipsis
  y += 58;
  g.fillStyle = d.stateKind === 'climbing' ? '#3ef0b5' : MUTED;
  fit(g, d.state, 800, 38, CARD_W - 120, 26);
  g.fillText(ellipsize(g, d.state, CARD_W - 120), 60, y);
  y += 34;
  roundRect(g, 60, y, CARD_W - 120, 26, 13);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)';
  g.fill();
  const p = Math.max(0, Math.min(1, d.progress));
  if (p > 0) {
    const bw = Math.max(26, (CARD_W - 120) * p);
    const bar = g.createLinearGradient(60, 0, 60 + bw, 0);
    bar.addColorStop(0, d.passed ? GOLD : d.color);
    bar.addColorStop(1, GOLD);
    roundRect(g, 60, y, bw, 26, 13);
    g.fillStyle = bar;
    g.fill();
  }
  y += 26 + 46;
  g.fillStyle = d.passed ? GOLD : MUTED;
  fit(g, d.progressText, 800, 32, CARD_W - 120, 22);
  g.fillText(d.progressText, 60, y);

  // 2×2 tiles: distance in the stage, week, stages won and personal record (with room for the footer)
  const tw = (CARD_W - 120 - 24) / 2;
  const th = 184;
  const ty0 = y + 34;
  d.tiles.slice(0, 4).forEach((t, i) => {
    const x = 60 + (i % 2) * (tw + 24);
    const ty = ty0 + Math.floor(i / 2) * (th + 22);
    roundRect(g, x, ty, tw, th, 26);
    g.fillStyle = t.accent ? 'rgba(255, 207, 58, 0.11)' : 'rgba(255, 255, 255, 0.06)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = t.accent ? 'rgba(255, 207, 58, 0.45)' : 'rgba(255, 255, 255, 0.10)';
    g.stroke();
    g.fillStyle = MUTED;
    g.font = `800 25px ${FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(`${t.icon} ${t.label.toUpperCase()}`, x + 28, ty + 48);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    // main text: up to 3 lines (shrinks if needed)
    let size = 36;
    let lines;
    for (; size >= 26; size -= 2) {
      g.font = `900 ${size}px ${FONT}`;
      lines = wrap(g, t.text, tw - 56);
      if (lines.length <= 3 && lines.every((l) => g.measureText(l).width <= tw - 56)) break;
    }
    g.fillStyle = t.accent ? GOLD : INK;
    const lh = size * 1.18;
    const top = ty + 48 + Math.max(16, (th - 48 - lines.length * lh) / 2) + size * 0.8;
    lines.slice(0, 3).forEach((l, k) => g.fillText(l, x + 28, top + k * lh));
  });

  // footer
  g.textAlign = 'center';
  g.fillStyle = 'rgba(201, 191, 179, 0.8)';
  g.font = `700 28px ${FONT}`;
  g.fillText(d.footer, CARD_W / 2, CARD_H - 30);
  g.restore();
}
