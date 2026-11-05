import { t, plural, fmt } from '../i18n/index.js';

// Single scale of the 3D wall: tokens → world height, linear. The summit sits at y = 0 and the base
// (0 tokens) at y = -WALL_HEIGHT. The scale only changes when the top changes (in the daily stage,
// the mark of the day; without it, the season summit), so the same token difference is worth the
// same height anywhere on the wall.

// Height from base to summit, in world units (fixed for the season).
export const WALL_HEIGHT = 50;

// Height of a climber (the "bodies" unit in the labels).
export const BODY_HEIGHT = 1.75;

// From the token line (the hands) down to the soles of whoever is on the wall: a ledge's floor sits
// FEET_DROP below the camp line, so whoever has exactly those tokens stands on it.
export const FEET_DROP = 2.2;

// Summit line and 0-token line.
export const SUMMIT_Y = 0;
export const BASE_Y = -WALL_HEIGHT;

// Base camp floor: whoever has 0 tokens stands on it (≈ -52.2).
export const BASE_LEDGE_Y = BASE_Y - FEET_DROP;

const valid = (S) => Number.isFinite(S) && S > 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Fraction of the way to the summit: 0 at the base, 1 at the summit (capped at 1).
export function progressOf(tokens, S) {
  return valid(S) ? clamp(tokens / S, 0, 1) : 0;
}

// Token line (where the hands are): -WALL_HEIGHT · (1 - min(tokens/S, 1)).
export function yLine(tokens, S) {
  return -WALL_HEIGHT * (1 - progressOf(tokens, S));
}

// Same as yLine, but uncapped: above the summit gives y > 0 (dashed ruler for the leader's excess).
export function yLineFree(tokens, S) {
  return valid(S) ? -WALL_HEIGHT * (1 - Math.max(0, tokens) / S) : BASE_Y;
}

// Inverse of yLine, for the ruler: how many tokens height y is worth (y > 0 gives more than the summit).
export function tokensAtY(y, S) {
  return valid(S) ? (1 + y / WALL_HEIGHT) * S : 0;
}

// World units per token and tokens per "body" this season.
export const unitsPerToken = (S) => (valid(S) ? WALL_HEIGHT / S : 0);
export const tokensPerBody = (S) => (valid(S) ? (BODY_HEIGHT * S) / WALL_HEIGHT : 0);

// Height (world units) of a token difference.
export const gapY = (dTokens, S) => dTokens * unitsPerToken(S);

// Altitude in meters → tokens, by the same rule as the server (base → 0, summit → S).
export function altitudeToTokens(altitude, mountain, S) {
  const span = mountain.summitAltitude - mountain.baseAltitude;
  return span > 0 && valid(S) ? ((altitude - mountain.baseAltitude) / span) * S : 0;
}

// Camps of state.mountain.camps on the scale: [{ kind, n, altitude, tokens, y }].
// kind: 'base' (base camp), 'camp' (Camp 1–4) or 'summit'; n is the index (base = 0). The name is
// t('camp.' + kind, { n }). y is the camp's token line. Since the altitude is already proportional
// to the tokens, y does not depend on S (S only enters the tokens).
export function campYs(mountain, S) {
  const base = mountain?.baseAltitude;
  const span = mountain?.summitAltitude - base;
  if (!(span > 0)) return [];
  return (mountain.camps ?? []).map((c, i) => {
    const f = clamp((c.altitude - base) / span, 0, 1);
    return {
      kind: c.kind ?? (f <= 0 ? 'base' : f >= 1 ? 'summit' : 'camp'),
      n: c.n ?? i,
      altitude: c.altitude,
      tokens: valid(S) ? f * S : 0,
      y: -WALL_HEIGHT * (1 - f),
    };
  });
}

// A summit by "projection" (no record) changes on every update: rounds up in steps of
// 50 M (the fallback mark of the day, in steps of 5 M) and only switches when the difference exceeds 10%,
// so the scale does not jump on screen.
export function stableSummit(S, prevS, source, step = 50e6) {
  if (source !== 'projection' || !valid(S)) return S;
  const q = Math.max(step, Math.ceil(S / step) * step);
  return valid(prevS) && Math.abs(q - prevS) / prevS <= 0.1 ? prevS : q;
}

// Vertical distance in the world in climber bodies: "≈ 1.7 bodies", "≈ 4 bodies", "< 0.1 body"
// ("≈ 1,7 corpo", "≈ 4 corpos" in pt-BR, where the plural rule keeps 1.7 singular).
export function bodiesText(dy) {
  const n = Math.abs(dy) / BODY_HEIGHT;
  if (n < 0.05) return t('scale.bodiesTiny', { n: fmt.dec(0.1, 1) });
  const r = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return plural(r, 'scale.bodies', { n: fmt.dec(r, 1) });
}
