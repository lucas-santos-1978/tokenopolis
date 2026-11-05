// Time of day in the configured zone and the sky colors, shared by the mountain and the wall.

import { config } from '../i18n/index.js';

// Sky colors (top → horizon) at key hours; in between, interpolated.
const NIGHT = ['#070a24', '#111644', '#1b2154', '#262a5e'];
const SKY = [
  [0, NIGHT],
  [4.75, NIGHT],
  [6, ['#2b2f6e', '#6b5aa0', '#e58e8a', '#ffc28a']], // dawn
  [8, ['#2f66c4', '#5d95e0', '#a3cbf0', '#d9ecff']],
  [12, ['#2a63c9', '#5591e3', '#9cc6f0', '#cfe6ff']],
  [16, ['#3566c0', '#6694dc', '#b2cbe6', '#f0d9bd']],
  [18, ['#141a46', '#3d3f86', '#b56f8f', '#f3a77b']], // sunset
  [19.5, ['#0b1032', '#1f2460', '#3e3672', '#5e4373']],
  [21, NIGHT],
  [24, NIGHT],
];
export const SUNRISE = 6;
export const SUNSET = 18;

// Decimal hour in `timeZone` (the configured one by default). `?hour=14.5` in the URL simulates a time.
export function zoneHour(timeZone = config.timeZone) {
  const forced = new URLSearchParams(location.search).get('hour');
  if (forced !== null && forced !== '' && !Number.isNaN(Number(forced))) return ((Number(forced) % 24) + 24) % 24;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get('hour') + get('minute') / 60;
}

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const mixColor = (a, b, t) => `rgb(${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t)).join(',')})`;

// The 4 sky colors (top → horizon) at hour `h`.
export function skyColorsAt(h) {
  const next = SKY.findIndex(([at]) => at > h);
  const [h0, c0] = SKY[next - 1];
  const [h1, c1] = SKY[next];
  const t = (h - h0) / (h1 - h0);
  return c0.map((c, k) => mixColor(c, c1[k], t));
}

// Sun by day, moon by night; `t` goes from 0 (rising) to 1 (setting).
export function celestialAt(h) {
  const isDay = h >= SUNRISE && h < SUNSET;
  const dayT = (h - SUNRISE) / (SUNSET - SUNRISE);
  const nightT = ((h - SUNSET + 24) % 24) / (24 - (SUNSET - SUNRISE));
  return { isDay, t: isDay ? dayT : nightT };
}

// Orange sun near the horizon, almost white up high.
export const sunColorAt = (t) => mixColor('#ffa95e', '#fff8dc', Math.sin(Math.PI * Math.min(1, Math.max(0, t))));

// Stars only at night: they fade at dawn and come back at dusk.
export function starsOpacityAt(h) {
  const v = h < 5 || h > 20 ? 1 : h < 6.5 ? (6.5 - h) / 1.5 : h > 18.5 ? (h - 18.5) / 1.5 : 0;
  return Math.min(1, Math.max(0, v));
}
