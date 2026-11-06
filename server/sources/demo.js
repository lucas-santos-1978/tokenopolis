// Demo mode (?demo in the URL): a hand-drawn region, with fictional data, to show in a single
// view everything the dashboard offers. Nine cities, one at each milestone (from the 5-person Village to
// the Mars Colony with 58), large and small teams, very high consumption (a Space Elevator) and
// very low (single-storey houses), every building type, every monument scattered around, the Dojo building at
// all three levels, mayors, debuts, owls, people in two and three cities, an overtake this
// week, a neck-and-neck derby and milestones for the countdown.
//
// Each person has a floor total (since CITIES_START) and a slice in this week, decided
// here; the day-to-day comes from deterministic weights (active days, shape: flat, rising, with
// marathons, stopped in September or debuting this week), normalized to match the totals. The
// hours of the day come from work blocks per profile (morning, early, afternoon, night, dawn, shift),
// so "building now", the lit windows, the sessions and the climb's stage agree with each other.
import { seasonAt, localDayIndex } from '../season.js';
import { personKey } from '../config.js';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, BUCKET = MIN;
const M = 1e6; // 1 floor

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z ]/g, '');
const emailOf = (name) => `${strip(name).trim().toLowerCase().replace(/\s+/g, '.')}@demo.example.com`;

// ───────── the cast ─────────
// [name, floors, options]: p = schedule profile (day, early, owl, night, dawn, turno); a = chance
// of an active day; s = shape (flat, ramp, burst, stopped, new); w = extra weight this week;
// m = model family; belt/since = belt program belt and the date it was earned.
const FIRST = ['Adriana', 'Alexandre', 'Aline', 'André', 'Bárbara', 'Bruna', 'Caio', 'Cíntia', 'Cláudio', 'Cristina', 'Danilo', 'Débora', 'Diego', 'Douglas', 'Elaine', 'Elias', 'Érica', 'Fabiana', 'Fábio', 'Fernanda', 'Gabriel', 'Gustavo', 'Heitor', 'Ingrid', 'Ivan', 'Jéssica', 'João', 'Kátia', 'Leandro', 'Lívia', 'Luana', 'Luiz', 'Maurício', 'Michele', 'Murilo', 'Natália', 'Patrícia', 'Priscila', 'Renan', 'Renata', 'Ricardo', 'Sérgio', 'Simone', 'Tatiane', 'Vanessa', 'Vítor', 'Wagner', 'Yasmin'];
const LAST = ['Almeida', 'Araújo', 'Barbosa', 'Barros', 'Batista', 'Cardoso', 'Carvalho', 'Castro', 'Correia', 'Costa', 'Cunha', 'Dias', 'Duarte', 'Fernandes', 'Ferreira', 'Fonseca', 'Freitas', 'Gomes', 'Lima', 'Lopes', 'Machado', 'Martins', 'Medeiros', 'Melo', 'Mendes', 'Miranda', 'Nascimento', 'Oliveira', 'Pereira', 'Pinto', 'Ramos', 'Ribeiro', 'Rocha', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira'];
let filler = 0;
const fillerName = () => { const i = filler++; return `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`; };
// n people without a fixed name, with floors spaced from `from` to `to`; the options vary by position.
function run(n, from, to, vary = () => ({})) {
  return Array.from({ length: n }, (_, i) => [fillerName(), Math.round(from * (to / from) ** (n === 1 ? 0 : i / (n - 1)) * 10) / 10, vary(i)]);
}
const MODELS = ['opus', 'opus', 'opus', 'sonnet', 'sonnet', 'haiku', 'fable'];
const PROFILES = ['day', 'day', 'day', 'early', 'owl', 'day', 'night', 'day', 'early', 'dawn'];
const mix = (i, extra = {}) => ({ p: PROFILES[i % PROFILES.length], m: MODELS[(i * 3) % MODELS.length], a: 0.6 + ((i * 37) % 10) / 25, ...extra });

const CITIES = {
  // Mars Colony: the big team, 58 people, the Space Elevator and the Great Temple (8 black belts)
  Platform: { week: 1700, people: [
    ['Marina Albuquerque', 14500, { p: 'day', a: 1, m: 'opus', belt: 'black', since: '2026-08-15' }],
    ['Otávio Brandão', 7800, { p: 'early', a: 1, m: 'opus', belt: 'black', since: '2026-09-01' }],
    ['Letícia Quaresma', 6100, { p: 'owl', a: 0.95, m: 'fable', belt: 'black' }],
    ['Rodrigo Cavalcanti', 4900, { s: 'burst', m: 'opus', belt: 'brown' }],
    ['Bianca Figueiredo', 4000, { s: 'ramp', m: 'sonnet', belt: 'black' }],
    ["Guilherme Sant'Ana", 3000, { p: 'night', m: 'opus', belt: 'black', since: '2026-10-20' }],
    ['Paula Rezende', 2400, { a: 1, belt: 'black', since: '2026-10-28' }],
    ['Vinícius Dantas', 2100, { p: 'early', belt: 'black' }],
    ['Carolina Peixoto', 1800, { s: 'stopped' }],
    ['Felipe Moreira', 1500, { p: 'dawn', m: 'fable' }],
    ['Amanda Villela', 1250, { belt: 'brown', m: 'sonnet' }],
    ['Lucas Benevides', 1050, { s: 'ramp', m: 'haiku' }],
    ...run(8, 980, 470, (i) => mix(i, i === 1 ? { p: 'turno', belt: 'purple' } : i === 4 ? { belt: 'blue', s: 'burst' } : i === 6 ? { p: 'turno' } : {})),
    ...run(14, 430, 160, (i) => mix(i + 3, i === 2 ? { belt: 'brown' } : i === 5 ? { belt: 'purple', s: 'ramp' } : i === 9 ? { belt: 'blue' } : i === 11 ? { s: 'stopped' } : {})),
    ...run(12, 140, 16, (i) => mix(i + 7, i === 3 ? { belt: 'blue' } : i === 5 ? { belt: 'white' } : i === 8 ? { belt: 'blue', p: 'night' } : {})),
    ['Nina Kobayashi', 2.2, { a: 0.5, belt: 'black', since: '2026-08-10' }],
    ...run(8, 13.5, 1.4, (i) => mix(i + 11)),
    ...run(4, 6.5, 0.6, (i) => mix(i + 2, { s: 'new' })),
  ] },
  // City of the Future: leads this week's construction (Juliana's marathon) and has the Temple (3 black)
  Data: { week: 1900, people: [
    ['Henrique Salgado', 6200, { p: 'day', a: 1, m: 'opus', belt: 'black', since: '2026-08-20' }],
    ['Juliana Prado', 4300, { s: 'burst', w: 3, belt: 'black' }],
    ['Tomás Linhares', 3400, { m: 'fable', belt: 'black', since: '2026-10-02' }],
    ['Isadora Campos', 2700, { p: 'owl', m: 'sonnet' }],
    ...run(5, 2300, 1100, (i) => mix(i + 5, i === 0 ? { belt: 'brown' } : i === 2 ? { belt: 'purple', p: 'night' } : i === 4 ? { belt: 'blue' } : {})),
    ...run(6, 900, 480, (i) => mix(i + 1, i === 3 ? { belt: 'blue' } : {})),
    ...run(8, 400, 170, (i) => mix(i + 9, i === 6 ? { s: 'stopped' } : {})),
    ...run(6, 110, 16, (i) => mix(i + 4)),
    ...run(4, 12, 1.8, (i) => mix(i + 8)),
    [fillerName(), 0.7, { s: 'new' }],
  ] },
  // Global City that overtook Product this week; the Dojo building (1 black)
  Mobile: { week: 950, people: [
    ['Beatriz Nogueira', 4900, { a: 1, m: 'opus', belt: 'black', since: '2026-10-05' }],
    ['Caio Esteves', 3300, { s: 'ramp', m: 'sonnet' }],
    ...run(4, 2200, 1150, (i) => mix(i + 2, i === 1 ? { belt: 'blue' } : {})),
    ...run(5, 980, 520, (i) => mix(i + 6, i === 2 ? { belt: 'blue', p: 'night' } : i === 4 ? { belt: 'white' } : {})),
    ...run(6, 410, 165, (i) => mix(i + 1)),
    ...run(5, 120, 18, (i) => mix(i + 5, i === 4 ? { s: 'new' } : {})),
    ...run(4, 11, 1.2, (i) => mix(i + 3)),
  ] },
  // Overtaken Global City: weak week, several stopped
  Product: { week: 160, people: [
    ['Fernando Sampaio', 4750, { m: 'opus', a: 0.7 }],
    ['Luciana Barreto', 2900, { s: 'stopped' }],
    ...run(4, 2300, 1200, (i) => mix(i + 4, i === 1 || i === 3 ? { s: 'stopped' } : {})),
    ...run(5, 950, 510, (i) => mix(i + 8, i === 0 || i === 2 ? { s: 'stopped' } : {})),
    ...run(5, 400, 170, (i) => mix(i + 2, i === 3 ? { s: 'stopped' } : {})),
    ...run(5, 130, 17, (i) => mix(i + 6, i === 1 || i === 4 ? { s: 'stopped' } : {})),
    ...run(3, 9, 2, (i) => mix(i)),
  ] },
  // Megalopolis one step from the 10 Billion Club; Dojo building (2 black)
  Infra: { week: 300, people: [
    ['Ricardo Toledo', 2700, { p: 'turno', m: 'opus', belt: 'black', since: '2026-09-12' }],
    ...run(3, 1250, 900, (i) => mix(i + 3, i === 2 ? { belt: 'brown' } : {})),
    ...run(4, 780, 480, (i) => mix(i + 7, i === 1 ? { belt: 'black' } : {})),
    ...run(3, 300, 170, (i) => mix(i + 1)),
    ...run(3, 80, 20, (i) => mix(i + 5, i === 1 ? { s: 'new' } : {})),
    ...run(2, 6, 2, (i) => mix(i)),
  ] },
  // Metropolis
  QA: { week: 220, people: [
    ['Sandra Figueira', 1250, { m: 'sonnet', a: 0.95 }],
    ...run(2, 800, 560, (i) => mix(i + 2)),
    ...run(4, 400, 190, (i) => mix(i + 6, i === 2 ? { p: 'night' } : {})),
    ...run(4, 120, 20, (i) => mix(i + 1)),
    ...run(3, 9, 2, (i) => mix(i + 4)),
  ] },
  // Capital a few floors from becoming a Metropolis (countdown), with a building that is almost a skyscraper
  Labs: { week: 150, people: [
    ['Mateus Carvalho', 920, { m: 'opus', a: 0.9 }],
    ['Aline Furtado', 440, { s: 'ramp', w: 1.5 }],
    ...run(8, 400, 50, (i) => mix(i + 3)),
  ] },
  // Small city growing fast: Ferris Wheel, Stadium and Fountain Square (3 debuts)
  Design: { week: 90, people: [
    ['Clara Montenegro', 190, { a: 1, m: 'fable' }],
    ...run(4, 120, 35, (i) => mix(i + 2, { a: 0.95 })),
    ...run(3, 9, 4, (i) => mix(i, { s: 'new' })),
  ] },
  // Village: 5 people, very low usage, only houses (from the condo to the single-storey house)
  Support: { week: 6, people: [
    ['Rosa Valentim', 14, { a: 0.9 }],
    ['Jorge Tenório', 9, { a: 0.9, p: 'early' }],
    ['Ana Beatriz Matos', 5, { a: 0.9 }],
    ['Paulo Sérgio Neves', 2, { a: 0.9, p: 'owl' }],
    ['Lídia Franco', 1.2, { a: 0.9 }],
  ] },
};
// Who builds in more than one city (flag for 2, crown for 3): [name, [[city, share]...], floors, options]
const CROSS = [
  ['Helena Vasconcelos', [['Platform', 0.5], ['Data', 0.3], ['Mobile', 0.2]], 1200, { a: 1, m: 'opus', belt: 'brown' }],
  ['Igor Tavares', [['Data', 0.4], ['Infra', 0.4], ['QA', 0.2]], 600, { p: 'early' }],
  ['Camila Esteves', [['Mobile', 0.4], ['Product', 0.4], ['Labs', 0.2]], 300, { m: 'sonnet' }],
  ['Daniel Ferraz', [['Platform', 0.6], ['Infra', 0.4]], 700, { p: 'owl' }],
  ['Larissa Monteiro', [['Data', 0.5], ['Product', 0.5]], 500, {}],
  ['Rafael Guimarães', [['Mobile', 0.5], ['Product', 0.5]], 400, { p: 'night' }],
  ['Sofia Lacerda', [['Platform', 0.7], ['QA', 0.3]], 350, { m: 'haiku' }],
  ['Bruno Carneiro', [['Infra', 0.5], ['Labs', 0.5]], 160, {}],
  ['Marcela Antunes', [['Data', 0.6], ['Mobile', 0.4]], 260, { s: 'ramp' }],
  ['Pedro Henrique Lemos', [['QA', 0.5], ['Design', 0.5]], 90, { a: 0.95 }],
  ['Thaís Bittencourt', [['Platform', 0.5], ['Data', 0.5]], 800, { a: 1, m: 'fable' }],
  ['Eduardo Pacheco', [['Product', 0.6], ['Labs', 0.4]], 150, {}],
];

// ───────── the dense region: ~90 more generated cities around the 9 hand-drawn ones ─────────
// Each milestone tier gets a handful of cities, with randomly drawn (stable) people and floors, so
// the region looks full: a hundred cities and some 3 thousand buildings. The names below are team names.
const EXTRA_NAMES = ['Scheduling', 'Billing', 'Payments', 'Checkout', 'Catalog', 'Search', 'Recommendations', 'Notifications', 'Messaging', 'Identity', 'Auth', 'Permissions', 'Onboarding', 'Growth', 'Marketing', 'Sales', 'CRM', 'Partners', 'Marketplace', 'Logistics', 'Fulfillment', 'Inventory', 'Pricing', 'Promotions', 'Loyalty', 'Help Desk', 'Service Desk', 'Chatbot', 'Voice', 'Web', 'iOS', 'Android', 'Design System', 'Accessibility', 'Localization', 'Content', 'Docs', 'Developer Portal', 'APIs', 'Integrations', 'Webhooks', 'Events', 'Streaming', 'Data Lake', 'Warehouse', 'BI', 'Analytics', 'Experimentation', 'ML Platform', 'MLOps', 'Recsys', 'Fraud', 'Risk', 'Compliance', 'Audit', 'Legal', 'Finance', 'Accounting', 'Tax', 'Treasury', 'Procurement', 'People', 'Recruiting', 'Learning', 'IT', 'Workplace', 'Facilities', 'Security', 'AppSec', 'SRE', 'Observability', 'Cloud', 'Networking', 'Storage', 'Compute', 'Kubernetes', 'CI/CD', 'Release', 'Test Automation', 'Performance', 'Reliability', 'Architecture', 'Core', 'Edge', 'Gateway', 'Maps', 'Media', 'Video', 'Imaging', 'Research', 'Innovation', 'Ventures', 'Strategy', 'Operations', 'Field Ops', 'Customer Success', 'Community', 'Education', 'Hardware', 'Firmware'];
// [how many cities, people (min, max), city floors (min, max)], per milestone. None exceeds
// 58 people (64 counting those who come from another city): every city's lot is the size of the largest, and with
// four blocks (64 buildings) the cities look full and the region compact, instead of grass all around.
const TIER_PLAN = [[10, 5, 9, 20, 240], [20, 10, 20, 260, 980], [25, 18, 36, 1050, 2900], [24, 30, 50, 3100, 7800], [9, 40, 58, 8200, 14500], [3, 48, 58, 15500, 28000], [1, 54, 58, 31000, 45000]];
const SHAPES = ['flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'ramp', 'ramp', 'burst', 'stopped', 'stopped', 'stopped', 'new'];
const BELTS = [['black', 0.012], ['brown', 0.015], ['purple', 0.015], ['blue', 0.02], ['white', 0.03]];
const usedNames = new Set();
// Unique name drawn from the two lists (with a second surname when the pair has already come up).
function uniqueName(r) {
  for (;;) {
    let name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    if (usedNames.has(name)) name += ` ${LAST[Math.floor(r() * LAST.length)]}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    return name;
  }
}
const GEN_CROSS = [];
let generated = false;
function generateCities() {
  if (generated) return;
  generated = true;
  for (const [, { people }] of Object.entries(CITIES)) for (const [name] of people) usedNames.add(name);
  for (const [name] of CROSS) usedNames.add(name);
  const r = rng(hash('região densa'));
  let next = 0;
  const made = [];
  for (const [count, pMin, pMax, fMin, fMax] of TIER_PLAN) {
    for (let i = 0; i < count; i++) {
      const city = EXTRA_NAMES[next++];
      const n = pMin + Math.floor(r() * (pMax - pMin + 1)), total = fMin + r() * (fMax - fMin);
      const w = Array.from({ length: n }, (_, k) => (1 / (k + 1) ** 0.95) * (0.7 + r() * 0.6)), sum = w.reduce((a, v) => a + v, 0);
      const people = w.map((v) => {
        const floors = Math.round((total * v) / sum * 10) / 10;
        const belt = r() < 0.06 ? BELTS[Math.floor(r() * BELTS.length)][0] : null;
        const o = { p: PROFILES[Math.floor(r() * PROFILES.length)], m: MODELS[Math.floor(r() * MODELS.length)], a: 0.2 + r() * 0.8, s: SHAPES[Math.floor(r() * SHAPES.length)] };
        if (belt) o.belt = belt;
        if (r() < 0.3) o.quiet = true; // did not build this week (otherwise every city gets the Stadium)
        if (o.s === 'new') return [uniqueName(r), Math.max(0.3, Math.min(floors, 1 + r() * 9)), o];
        return [uniqueName(r), Math.max(0.3, floors), o];
      });
      // week: 1% to 5% of the total; a few small cities surging (Ferris Wheel)
      const week = Math.round(total * (total < 3000 && r() < 0.25 ? 0.1 + r() * 0.12 : 0.01 + r() * 0.04));
      CITIES[city] = { week, people };
      made.push(city);
    }
  }
  // people in two or three generated cities (flags, crowns and golden roads scattered around);
  // nobody joins a city that already has 60, so none exceeds the four blocks
  const count = Object.fromEntries(made.map((c) => [c, CITIES[c].people.length]));
  const pick = (not) => { for (let k = 0; k < 20; k++) { const c = made[Math.floor(r() * made.length)]; if (!not.includes(c) && count[c] < 60) return c; } return null; };
  for (const city of made) {
    const list = CITIES[city].people;
    for (let i = list.length - 1; i >= 0; i--) {
      if (r() >= 0.045) continue;
      const others = [pick([city])];
      if (r() < 0.12) others.push(pick([city, ...others]));
      const extra = others.filter(Boolean);
      if (!extra.length) continue;
      const [name, floors, o] = list.splice(i, 1)[0];
      for (const c of extra) count[c]++;
      GEN_CROSS.push([name, [[city, 0.6], ...extra.map((c) => [c, 0.4 / extra.length])], floors / 0.6, o]);
    }
  }
}

// People: name, e-mail, cities with the floors in each one and the options.
const PEOPLE = [];
// The region is only generated when the demo is first requested (it costs a couple of seconds).
function buildPeople() {
  if (PEOPLE.length) return PEOPLE;
  generateCities();
  for (const [city, { people }] of Object.entries(CITIES)) for (const [name, floors, o = {}] of people) PEOPLE.push({ name, email: emailOf(name), o, cities: [[city, floors]] });
  for (const [name, cities, floors, o] of [...CROSS, ...GEN_CROSS]) PEOPLE.push({ name, email: emailOf(name), o, cities: cities.map(([c, s]) => [c, floors * s]) });
  return PEOPLE;
}
const nicknamesOf = () => Object.fromEntries(buildPeople().map((p) => [personKey(p.email), { name: p.name }]));
// The demo's belts (the belts module asks the source for them).
const beltsOf = () => new Map(buildPeople().filter((p) => p.o.belt).map((p) => [personKey(p.email), { belt: p.o.belt, since: p.o.since ?? null }]));

// Same values as Claude Code's `type` tag; `score` = input + output + cachecreation.
function splitByType(score) {
  const cacheRatio = 0.9;
  return { cacheread: Math.round((score * cacheRatio) / (1 - cacheRatio)), cachecreation: Math.round(score * 0.8), input: Math.round(score * 0.05), output: Math.round(score * 0.15) };
}

export function createDemoSource(config) {
  buildPeople();
  const opts = config.season, off = opts.utcOffsetHours;
  const start = config.cities.start;
  const types = config.scoreTypes ?? [];
  const parts = Object.entries(splitByType(M)).filter(([t]) => !types.length || types.includes(t));
  const factor = parts.reduce((a, [, v]) => a + v, 0) / M; // fraction of the score that counts as points (1 with the default types)
  const dayStartOf = (ms) => ms - ((((ms + off * HOUR) % DAY) + DAY) % DAY);
  const dowOf = (idx) => (idx + 4) % 7; // epoch day index 0 was a Thursday
  const weekend = (idx) => dowOf(idx) === 0 || dowOf(idx) === 6;

  // ───────── each person's day-to-day, normalized to the agreed floors ─────────
  // Recomputed when the day turns over: { days: Map(index -> tokens of the whole day), split(dayIdx) -> [[city, fraction]] }
  let series = null, seriesDay = -1;
  function buildSeries(now) {
    const todayIdx = localDayIndex(now, off), startIdx = localDayIndex(start, off);
    const weekIdx = localDayIndex(seasonAt(now, { ...opts, length: 'week' }).start, off);
    // each person's week in each city: weights by size (and shape), scaled to the city's target
    const weekOf = new Map(); // email|city -> floors this week
    for (const [city, { week }] of Object.entries(CITIES)) {
      const members = PEOPLE.flatMap((p) => p.cities.filter(([c]) => c === city).map(([, floors]) => ({ p, floors })));
      const fixed = members.filter(({ p }) => p.o.s === 'new');
      const open = members.filter(({ p }) => p.o.s !== 'new');
      const wt = ({ p, floors }) => (p.o.s === 'stopped' || p.o.quiet ? 0 : floors ** 0.9 * (p.o.w ?? 1) * (p.o.s === 'ramp' ? 1.6 : 1));
      const target = Math.max(0, week - fixed.reduce((a, m) => a + m.floors, 0)), sum = open.reduce((a, m) => a + wt(m), 0);
      for (const m of fixed) weekOf.set(`${m.p.email}|${city}`, m.floors);
      for (const m of open) weekOf.set(`${m.p.email}|${city}`, Math.min(m.floors * 0.9, sum ? (target * wt(m)) / sum : 0));
    }
    const out = new Map();
    for (const p of PEOPLE) {
      const r = rng(hash(`${p.email}#dias`));
      const total = p.cities.reduce((a, [, f]) => a + f, 0), week = p.cities.reduce((a, [c]) => a + weekOf.get(`${p.email}|${c}`), 0);
      const shape = p.o.s ?? 'flat', active = p.o.a ?? 0.8;
      const first = shape === 'new' ? weekIdx + Math.floor(r() * Math.max(1, todayIdx - weekIdx + 1)) : shape === 'ramp' ? startIdx + 25 + Math.floor(r() * 40) : startIdx;
      const cutoff = shape === 'stopped' ? startIdx + 45 + Math.floor(r() * 25) : Infinity; // stopped between mid-September and October
      const marathons = new Set(shape === 'burst' ? Array.from({ length: 4 }, () => startIdx + Math.floor(r() * (todayIdx - startIdx))) : []);
      const weights = new Map();
      for (let d = first; d <= todayIdx; d++) {
        if (d > cutoff) break;
        const on = r() < active * (weekend(d) ? 0.3 : 1) || d === first || d === todayIdx && shape !== 'stopped' && r() < 0.5;
        if (!on) continue;
        let w = (0.5 + r()) * (weekend(d) ? 0.35 : 1);
        if (shape === 'ramp') w *= 0.2 + (d - first) / Math.max(1, todayIdx - first);
        if (marathons.has(d)) w *= 4;
        weights.set(d, w);
      }
      if (!weights.size) weights.set(Math.min(todayIdx, Math.max(first, startIdx)), 1);
      // scale: the days before the week add up to total − week; the week's days add up to the week (today's in full)
      const days = new Map();
      const past = [...weights].filter(([d]) => d < weekIdx), cur = [...weights].filter(([d]) => d >= weekIdx);
      if (!past.length && total - week > 0) past.push([Math.min(first, weekIdx - 1), 1]);
      const pastSum = past.reduce((a, [, w]) => a + w, 0), curSum = cur.reduce((a, [, w]) => a + w, 0);
      for (const [d, w] of past) days.set(d, ((total - week) * w / pastSum) * M);
      if (curSum) for (const [d, w] of cur) days.set(d, (week * w / curSum) * M);
      else if (week > 0) days.set(todayIdx, week * M);
      // split between the cities: by the agreed week within this week, by the remainder before it
      const weekSplit = p.cities.map(([c]) => [c, week ? weekOf.get(`${p.email}|${c}`) / week : 0]);
      const pastSplit = p.cities.map(([c, f]) => [c, total - week ? (f - weekOf.get(`${p.email}|${c}`)) / (total - week) : 0]);
      out.set(p.email, { days, split: (d) => (d >= weekIdx ? weekSplit : pastSplit) });
    }
    return out;
  }
  function seriesAt(now) {
    const todayIdx = localDayIndex(now, off);
    if (!series || seriesDay !== todayIdx) { series = buildSeries(now); seriesDay = todayIdx; }
    return series;
  }
  const dayTokens = (p, dayStart, now) => seriesAt(now).get(p.email).days.get(localDayIndex(dayStart, off)) ?? 0;

  // ───────── the hours of the day: work blocks per profile ─────────
  const plans = new Map();
  function plan(p, dayStart) {
    const key = `${p.email}:${dayStart}`;
    if (plans.has(key)) return plans.get(key);
    if (plans.size > 400000) plans.clear();
    const r = rng(hash(key)), prof = p.o.p ?? 'day', j = () => (r() - 0.5) * HOUR;
    const spans = { day: [[8.5, 12], [13, 18]], early: [[6.5, 11.5], [12.5, 15.5]], owl: [[13, 17.5], [18.5, 21.5]], night: [[19.5, 24]], dawn: [[0, 3.5], [21, 24]], turno: [[0, 6], [9, 14], [17, 23]] }[prof];
    const blocks = [];
    for (const [a, b] of spans) {
      let t = Math.max(0, a * HOUR + j());
      const end = Math.min(DAY, b * HOUR + j());
      while (t < end) { // blocks of 15 to 50 min with breaks of 10 to 40 (or 45 to 90): about 45% of the working hours
        const e = Math.min(end, t + (15 + r() * 35) * MIN);
        if (e > t) blocks.push({ a: t, b: e });
        t = e + (r() < 0.35 ? 45 + r() * 45 : 10 + r() * 30) * MIN;
      }
    }
    plans.set(key, blocks);
    return blocks;
  }
  // Points accumulated in the day up to t ms after midnight (the whole day falls within the blocks).
  function scoreAt(p, dayStart, t, now) {
    const tokens = dayTokens(p, dayStart, now);
    if (!(tokens > 0)) return 0;
    const blocks = plan(p, dayStart), len = blocks.reduce((a, b) => a + (b.b - b.a), 0);
    let covered = 0;
    for (const { a, b } of blocks) { if (t <= a) break; covered += Math.min(t, b) - a; }
    return (tokens * covered) / len;
  }
  const dayScore = (p, dayStart, now) => (now <= dayStart ? 0 : scoreAt(p, dayStart, Math.min(DAY, now - dayStart), now));
  const openSessions = (p, dayStart, from, now) => plan(p, dayStart).filter((s) => dayStart + s.a < now && dayStart + s.b > from && dayTokens(p, dayStart, now) > 0).length;
  const MODEL_NAMES = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-1' };
  const modelsOf = (p) => {
    const main = MODEL_NAMES[p.o.m ?? 'opus'], r = rng(hash(`${p.email}#modelo`)), share = 0.6 + r() * 0.35;
    return Object.values(MODEL_NAMES).map((m) => [m, m === main ? share : (1 - share) / 3]);
  };
  const cityMap = (out, city) => out.get(city) ?? out.set(city, new Map()).get(city);
  const personMap = (people, email) => people.get(email) ?? people.set(email, new Map()).get(email);

  return {
    mode: 'demo',
    nicknames: nicknamesOf,
    belts: beltsOf,

    // ───────── Cities view ─────────
    async orgDaily(fromMs, toMs) {
      const out = new Map(), s = seriesAt(toMs);
      for (const p of PEOPLE) {
        for (let day = dayStartOf(fromMs); day < toMs; day += DAY) {
          const tokens = dayScore(p, day, toMs) * factor;
          if (!(tokens > 0)) continue;
          for (const [city, share] of s.get(p.email).split(localDayIndex(day, off))) if (share > 0) personMap(cityMap(out, city), p.email).set(day, tokens * share);
        }
      }
      return out;
    },
    async orgHourly(fromMs, toMs) {
      const out = new Map(), s = seriesAt(toMs);
      for (const p of PEOPLE) {
        for (let ts = Math.floor(fromMs / HOUR) * HOUR; ts < toMs; ts += HOUR) {
          const day = dayStartOf(ts), end = Math.min(ts + HOUR, toMs);
          const tokens = (scoreAt(p, day, end - day, toMs) - scoreAt(p, day, Math.max(0, ts - day), toMs)) * factor;
          if (!(tokens > 0)) continue;
          for (const [city, share] of s.get(p.email).split(localDayIndex(day, off))) if (share > 0) personMap(cityMap(out, city), p.email).set(ts, tokens * share);
        }
      }
      return out;
    },
    async orgModels(fromMs, toMs) {
      const out = new Map(), s = seriesAt(toMs);
      for (const p of PEOPLE) {
        let total = 0;
        for (let day = dayStartOf(fromMs); day < toMs; day += DAY) total += dayScore(p, day, toMs) * factor;
        if (!(total > 0)) continue;
        for (const [city, share] of s.get(p.email).split(localDayIndex(toMs, off))) {
          if (!(share > 0)) continue;
          personMap(cityMap(out, city), p.email); // ensures the city exists
          out.get(city).set(p.email, new Map(modelsOf(p).map(([m, f]) => [m, total * share * f])));
        }
      }
      return out;
    },
    async orgSessions(fromMs, now) {
      const out = new Map(), day = dayStartOf(now);
      for (const p of PEOPLE) {
        const n = openSessions(p, day, fromMs, now);
        if (n) for (const [city] of p.cities) out.set(city, (out.get(city) ?? 0) + n);
      }
      return out;
    },
    async orgRecent(fromMs, now) {
      const out = new Map(), day = dayStartOf(now);
      for (const p of PEOPLE) {
        if (scoreAt(p, day, now - day, now) - scoreAt(p, day, Math.max(0, fromMs - day), now) <= 0) continue;
        for (const [city] of p.cities) (out.get(city) ?? out.set(city, new Set()).get(city)).add(p.email);
      }
      return out;
    },

    // ───────── the climb (the home page with ?demo) ─────────
    async seasonUsage(season, now) {
      const to = Math.min(now, season.end);
      return PEOPLE.map((p) => {
        const daily = [];
        let sessions = 0, total = 0;
        for (let day = season.start; day < to; day += DAY) {
          const tokens = dayScore(p, day, to);
          if (!(tokens > 0)) continue;
          sessions += plan(p, day).filter((s) => day + s.a < to).length;
          total += tokens;
          daily.push({ day, byType: splitByType(tokens) });
        }
        return { email: p.email, byType: splitByType(total), daily, sessions };
      }).filter((u) => u.daily.length);
    },
    async seasonTotals(season) {
      const out = new Map();
      for (const p of PEOPLE) {
        let total = 0;
        for (let day = season.start; day < season.end; day += DAY) total += dayScore(p, day, season.end);
        if (total > 0) out.set(p.email, splitByType(total));
      }
      return out;
    },
    async dailyScores(fromMs, toMs) {
      const out = new Map();
      for (const p of PEOPLE) {
        const days = new Map();
        for (let day = dayStartOf(fromMs); day < toMs; day += DAY) {
          const tokens = dayScore(p, day, toMs) * factor;
          if (tokens > 0) days.set(day, tokens);
        }
        if (days.size) out.set(p.email, days);
      }
      return out;
    },
    async recentUsage(fromMs, now) {
      const byUser = new Map();
      for (const p of PEOPLE) {
        const buckets = new Map();
        for (let ts = Math.floor(fromMs / BUCKET) * BUCKET; ts < now; ts += BUCKET) {
          const day = dayStartOf(ts);
          const v = (scoreAt(p, day, Math.min(ts + BUCKET, now) - day, now) - scoreAt(p, day, Math.max(0, ts - day), now)) * factor;
          if (v > 0) buckets.set(ts, v);
        }
        if (buckets.size) byUser.set(p.email, buckets);
      }
      return { bucketMs: BUCKET, byUser };
    },
  };
}
