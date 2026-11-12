// Rules of the city "game" that do not depend on the drawing, all derived from /api/cities: each
// city's milestone (Village, Town, Capital...) and the style it unlocks, each building's type (from
// the house to the space elevator), the monuments a city earns with its achievements, the mayor of
// the month, the derby of the week, the milestone countdown, the advisors and the region's newspaper.
// Every word comes from the dictionaries (i18n/<locale>/city.js and common.js).

import { t, plural, fmt, cityLabel, displayName, config } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DAY = 86_400_000;
export const TEN_BI = 10000; // floors: 10 billion tokens
// "1,234 floors" in the page's language, with the number as displayed
export const floorsText = (n) => plural(Math.round(n), 'count.floor');

// ───────── token medals ─────────
// A person's tokens added up across every city (b.total, set by megaOf; 1 floor = 1 million tokens)
// earn a medal at each mark (floors): 100 million, 250 million, 500 million, 1 billion... The medal
// is the person's, not the building's: the same one on every building, the card and the campus.
export const TOKEN_MARKS = [100, 250, 500, 1000, 2000, 5000, 10000];
// the highest mark reached ({ i, floors, next }) or null
export function markOf(floors) {
  let i = -1;
  for (let k = 0; k < TOKEN_MARKS.length; k++) if (floors >= TOKEN_MARKS[k]) i = k;
  return i < 0 ? null : { i, floors: TOKEN_MARKS[i], next: TOKEN_MARKS[i + 1] ?? null };
}
// "2 bi" / "250 mi" ("2B" / "250M"), for chips and texts
// Everyone in the region, one entry per person: a person in 2+ cities adds them up, as the medal does.
// { id, total, week, month, today, parts: [{ b, c }] (the tallest first), top: the tallest building, c: its city }
export function peopleOf(data) {
  const by = new Map();
  for (const c of data.cities) for (const b of c.buildings) {
    let p = by.get(b.id);
    if (!p) by.set(b.id, (p = { id: b.id, total: 0, week: 0, month: 0, today: 0, parts: [] }));
    p.total += b.floors; p.week += b.week ?? 0; p.month += b.month ?? 0; p.today += b.today ?? 0;
    p.parts.push({ b, c });
  }
  return [...by.values()].map((p) => { p.parts.sort((x, y) => y.b.floors - x.b.floors); return Object.assign(p, { top: p.parts[0].b, c: p.parts[0].c }); });
}

// The week's medals, from the reading alone: whoever's tokens, every city added up, passed a mark since
// Monday (the total without the week was below it), the highest mark first; and who is closest to the
// next billion (or, below that, to any next mark). Each person: { id, total, week, top, c, mark }.
export function weekMedals(data) {
  const by = new Map();
  for (const c of data.cities) for (const b of c.buildings) {
    const p = by.get(b.id);
    if (!p) { by.set(b.id, { id: b.id, total: b.floors, week: b.week ?? 0, top: b, c }); continue; }
    p.total += b.floors; p.week += b.week ?? 0;
    if (b.floors > p.top.floors) Object.assign(p, { top: b, c });
  }
  const all = [...by.values()], won = [];
  for (const p of all) {
    const m = markOf(p.total), m0 = markOf(p.total - p.week);
    if (m && (!m0 || m0.floors < m.floors)) won.push({ ...p, mark: m.floors });
  }
  won.sort((a, b) => b.mark - a.mark || b.total - a.total);
  const ahead = all.map((p) => { const m = markOf(p.total), goal = m ? m.next : TOKEN_MARKS[0]; return goal ? { ...p, mark: goal, missing: goal - p.total } : null; }).filter(Boolean);
  const closest = (list) => list.sort((a, b) => a.missing - b.missing)[0] ?? null;
  return { won, next: closest(ahead.filter((p) => p.mark >= 1000)) ?? closest(ahead) };
}
export const markText = (floors) => (floors >= 1000 ? t('medal.bi', { n: fmt.dec(floors / 1000, floors % 1000 ? 1 : 0) }) : t('medal.mi', { n: fmt.int(floors) }));

// ───────── abandoned buildings ─────────
// Days without Claude (b.idle, calendar days): more than idle.fire and the building is on fire, more
// than idle.rubble and it is a pile of rubble. The server sets both (IDLE_FIRE_DAYS, IDLE_RUBBLE_DAYS;
// 0 turns one off); ?ruins=0 turns both off. Using Claude again puts the building back the same day.
const RUINS_OFF = new URLSearchParams(location.search).get('ruins') === '0';
export function ruinOf(b) {
  const idle = b?.idle, { fire = 15, rubble = 30 } = config.idle ?? {};
  if (RUINS_OFF || !(idle > 0)) return null;
  if (rubble > 0 && idle > rubble) return 'rubble';
  if (fire > 0 && idle > fire) return 'fire';
  return null;
}

// ───────── Mega Builders ─────────
// Whoever builds in 2+ cities and adds up config.mega.floors floors across them (1,000 by default:
// 1 billion tokens) is a Mega Builder, with a headquarters in the Corporate District as tall as the
// floors added up. The next in line (2+ cities, half the line or more) get a foundation with their
// progress. The server sets the line (MEGA_FLOORS, 0 = off); ?mega=<floors> changes it, ?mega=0 hides it.
const MEGA_Q = new URLSearchParams(location.search).get('mega');
export const MEGA_QUEUE = 6;
export function megaLine() {
  const q = MEGA_Q == null || MEGA_Q.trim() === '' ? NaN : Number(MEGA_Q);
  return Number.isFinite(q) && q >= 0 ? Math.round(q) : Math.max(0, config.mega?.floors ?? 1000);
}
// { line, members, queue }; each one: the person's numbers added up across the cities (floors,
// week, month, today, the freshest idle, the hours of use, building now) and `parts`, their
// buildings ({ b, c }, the tallest first). Marks b.mega on the members' buildings.
export function megaOf(data) {
  const line = megaLine(), byId = new Map();
  for (const c of data.cities) for (const b of c.buildings) {
    delete b.mega;
    let p = byId.get(b.id);
    if (!p) byId.set(b.id, (p = { id: b.id, parts: [], floors: 0, week: 0, month: 0, today: 0, idle: Infinity, hours: 0, now: false }));
    p.parts.push({ b, c });
    p.floors += b.floors; p.week += b.week; p.month += b.month; p.today += b.today;
    p.idle = Math.min(p.idle, b.idle ?? Infinity); p.hours |= b.hours || 0; p.now ||= !!b.now;
  }
  for (const p of byId.values()) for (const { b } of p.parts) b.total = p.floors; // the medal's tokens: every city added up
  if (!line) return { line: 0, members: [], queue: [] };
  const multi = [...byId.values()].filter((p) => p.parts.length >= 2).sort((a, b) => b.floors - a.floors || a.id.localeCompare(b.id));
  for (const p of multi) {
    p.parts.sort((a, b) => b.b.floors - a.b.floors);
    const top = p.parts[0].b; // the identity (name, nickname, belt) comes from the tallest building
    Object.assign(p, { name: top.name, anon: top.anon, belt: top.belt, cities: p.parts.length, idle: Number.isFinite(p.idle) ? p.idle : null });
  }
  const members = multi.filter((p) => p.floors >= line);
  const queue = multi.filter((p) => p.floors < line && p.floors >= line / 2).slice(0, MEGA_QUEUE);
  for (const p of members) { p.mega = true; for (const { b } of p.parts) b.mega = true; }
  return { line, members, queue };
}

// ───────── milestones ─────────
// Like the population in SimCity: the city changes its title with the accumulated floors, and each
// title changes the look of all its buildings (style) and unlocks an extra on the map (perk).
export const CITY_TIERS = [
  { min: 0, key: 'village', icon: '🏡', style: 'brick' },
  { min: 250, key: 'town', icon: '🏘️', style: 'concrete' },
  { min: 1000, key: 'capital', icon: '🏙️', style: 'glass' },
  { min: 3000, key: 'metropolis', icon: '🌆', style: 'deco' },
  { min: 8000, key: 'megalopolis', icon: '🌃', style: 'neon' },
  { min: 15000, key: 'globalCity', icon: '🌐', style: 'global' },
  { min: 30000, key: 'futureCity', icon: '🛸', style: 'future' },
  { min: 60000, key: 'marsColony', icon: '🪐', style: 'mars' },
];
// From the ground floor to space: houses evolve too, so whoever is starting sees progress, and above
// the skyscraper there are four more types (the last one at 10 billion tokens). The key is also the drawing.
export const BUILDING_TIERS = [
  { min: 0, key: 'house', icon: '🏠' },
  { min: 3, key: 'townhouse', icon: '🏡' },
  { min: 7, key: 'poolHouse', icon: '🏊' },
  { min: 11, key: 'condo', icon: '🏘️' },
  { min: 15, key: 'building', icon: '🏢' },
  { min: 150, key: 'tower', icon: '🏬' },
  { min: 450, key: 'skyscraper', icon: '🌇' },
  { min: 1000, key: 'supertower', icon: '🏙️' },
  { min: 2500, key: 'cloudTower', icon: '☁️' },
  { min: 5000, key: 'orbitalTower', icon: '🛰️' },
  { min: 10000, key: 'spaceElevator', icon: '🚀' },
];
// The words of a tier or monument: { name, a, lower, plural, perk | req } (and fem in pt-BR)
export const cityTier = (key) => t(`tier.city.${key}`);
export const buildingTier = (key) => t(`tier.building.${key}`);
export const monumentText = (key) => t(`monument.${key}`);
// Which milestone, how much is missing for the next one and the progress (0 to 1) inside the current one.
export function tierOf(floors, tiers = CITY_TIERS) {
  let i = 0;
  while (i + 1 < tiers.length && floors >= tiers[i + 1].min) i++;
  const tr = tiers[i], next = tiers[i + 1] ?? null;
  return { ...tr, index: i, next, missing: next ? next.min - floors : 0, progress: next ? (floors - tr.min) / (next.min - tr.min) : 1 };
}

// ───────── monuments ─────────
export function context(data) {
  const rank = [...data.cities].sort((a, b) => b.week - a.week || b.floors - a.floors);
  return { rank, leader: rank[0]?.week > 0 ? rank[0] : null };
}
const newcomers = (c) => c.buildings.filter((b) => b.isNew).length;
// Rewards like the mayor's in SimCity. score >= 1 unlocks; the weekly ones go back to zero on
// Monday, so the monuments show up along the week. The order is the priority on the terrain.
export const MONUMENTS = [
  { key: 'obelisk', icon: '🔟', size: 1, score: (c) => c.floors / TEN_BI },
  { key: 'airport', icon: '🛫', size: 2, score: (c) => c.floors / 8000 },
  { key: 'stadium', icon: '🏟️', size: 4, min: 2, score: (c) => c.builders / Math.max(1, c.people) / 0.6 }, // 3×3 or 2×2 where 4×4 does not fit
  { key: 'ferrisWheel', icon: '🎡', size: 2, score: (c) => c.growth / 0.1 },
  { key: 'centralPark', icon: '🌳', size: 2, score: (c) => c.people / 50 },
  { key: 'tvTower', icon: '🗼', size: 1, score: (c) => (c.buildings[0]?.floors ?? 0) / 450 },
  { key: 'leadershipStatue', icon: '🗽', size: 1, score: (c, x) => (x.leader === c ? 1 : x.leader ? Math.min(0.99, c.week / x.leader.week) : 0) },
  { key: 'fountainSquare', icon: '⛲', size: 1, score: (c) => newcomers(c) / 3 },
];
export function monumentsOf(c, x) {
  return MONUMENTS.map((m) => {
    const s = Math.max(0, m.score(c, x) || 0);
    return { key: m.key, icon: m.icon, size: m.size, ...(m.min ? { min: m.min } : {}), ok: s >= 1, progress: Math.min(1, s) };
  });
}

// ───────── mayor of the month ─────────
// Whoever built the most last month governs the city this month (a statue and, in front of it, a
// rally where the mayor speaks); the current month's race decides the next one.
const topBy = (list, key) => list.reduce((best, b) => (b[key] > 0 && (!best || b[key] > best[key]) ? b : best), null);
export const mayorOf = (c) => topBy(c.buildings, 'lastMonth');
export const raceOf = (c) => topBy(c.buildings, 'month');
// "November" / "novembro": the name of a month Period from the API
export const monthOf = (p, fallback) => (p?.month != null ? fmt.monthName(p.month) : t(fallback));

// ───────── derby of the week ─────────
// The two cities closest in accumulated floors (the smallest gap in proportion), and who climbs
// more this week.
export function derby(data) {
  const byF = [...data.cities].filter((c) => c.floors >= 100).sort((a, b) => b.floors - a.floors);
  let best = null;
  for (let i = 1; i < byF.length; i++) {
    const a = byF[i - 1], b = byF[i], rel = (a.floors - b.floors) / a.floors;
    if (!best || rel < best.rel) best = { a, b, rel, gap: a.floors - b.floors };
  }
  return best;
}

// ───────── countdown ─────────
// Milestones expected to fall within a week at each one's pace: building types from the skyscraper
// up (highlighting "the region's first"), city titles and the 10 Billion Club.
export function countdowns(data, now = data.generatedAt) {
  const weekDays = Math.max(1, (now - data.week.start) / DAY), allDays = Math.max(1, (now - data.start) / DAY);
  const pace = (x) => Math.max(x.week / weekDays, x.floors / allDays); // floors per day
  const out = [];
  const all = data.cities.flatMap((c) => c.buildings.map((b) => ({ b, c })));
  for (const { b, c } of all) {
    const tr = tierOf(b.floors, BUILDING_TIERS);
    if (!tr.next || tr.next.min < 450) continue;
    const eta = tr.missing / Math.max(0.01, pace(b));
    if (eta > 7 && tr.missing > 10) continue;
    const firstRegion = !all.some((x) => x.b.floors >= tr.next.min), firstCity = !c.buildings.some((x) => x.floors >= tr.next.min);
    const tier = buildingTier(tr.next.key), who = displayName(b);
    const text = firstRegion ? t('countdown.firstRegion', { tier }) : firstCity ? t('countdown.firstCity', { tier, c }) : t('countdown.building', { tier, name: who.short });
    out.push({ icon: tr.next.icon, missing: tr.missing, eta, text, who: `${who.full} · ${cityLabel(c)}`, city: c.id, person: b.id, weight: firstRegion ? 0 : firstCity ? 1 : 2 });
  }
  for (const c of data.cities) {
    const tr = tierOf(c.floors);
    const club = c.floors < TEN_BI && TEN_BI - c.floors < (tr.next ? tr.missing : Infinity);
    const goal = club ? { icon: '🔟', min: TEN_BI, text: t('countdown.club', { c }) }
      : tr.next && { icon: tr.next.icon, min: tr.next.min, text: t('countdown.cityTier', { c, tier: cityTier(tr.next.key) }) };
    if (!goal) continue;
    const missing = goal.min - c.floors, eta = missing / Math.max(0.01, pace(c));
    if (eta <= 7) out.push({ icon: goal.icon, missing, eta, text: goal.text, who: cityLabel(c), city: c.id, weight: club ? 0 : 1 });
  }
  return out.sort((p, q) => p.weight - q.weight || p.eta - q.eta).slice(0, 5);
}

// ───────── advisors ─────────
// Tips taken from the data, always about who is close to something (never about who is behind).
export function advisors(data, now = Date.now()) {
  const x = context(data), tips = [];
  const days = Math.max(0.25, (now - data.week.start) / DAY);
  // race: at this week's pace, the city behind passes the one ahead in a few days
  const byF = [...data.cities].sort((a, b) => b.floors - a.floors);
  for (let i = 1; i < byF.length; i++) {
    const a = byF[i - 1], b = byF[i], gap = a.floors - b.floors, gain = (b.week - a.week) / days;
    if (gain > 0 && gap / gain <= 14) {
      const d = Math.max(1, Math.round(gap / gain));
      tips.push({ icon: '🏁', who: t('advisor.works'), text: t('advisor.race', { c: b, other: a, floors: floorsText(gap), days: plural(d, 'count.day') }), city: b.id });
    }
  }
  // monument almost unlocked
  for (const c of data.cities) for (const m of monumentsOf(c, x)) {
    if (!m.ok && m.progress >= 0.75) tips.push({ icon: m.icon, who: t('advisor.urbanism'), text: t('advisor.monument', { c, pct: fmt.percent(m.progress), mon: monumentText(m.key) }), city: c.id });
  }
  // milestone almost reached
  for (const c of data.cities) {
    const tr = tierOf(c.floors);
    if (tr.next && tr.progress >= 0.8) tips.push({ icon: tr.next.icon, who: t('advisor.planning'), text: t('advisor.cityTier', { c, floors: floorsText(tr.missing), tier: cityTier(tr.next.key) }), city: c.id });
  }
  // building about to change type
  const near = data.cities.flatMap((c) => c.buildings.map((b) => ({ b, c, tr: tierOf(b.floors, BUILDING_TIERS) })))
    .filter(({ b, tr }) => tr.next && tr.next.min > 15 && tr.missing <= Math.max(5, b.week)).sort((p, q) => p.tr.missing - q.tr.missing).slice(0, 3);
  for (const { b, c, tr } of near) {
    tips.push({ icon: tr.next.icon, who: t('advisor.realtor'), text: t('advisor.building', { name: displayName(b).full, c, floors: floorsText(Math.max(1, tr.missing)), tier: buildingTier(tr.next.key) }), city: c.id, person: b.id });
  }
  return tips;
}

// ───────── newspaper ─────────
const seeded = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h ^= h >>> 13, (h >>> 0) / 4294967296)); };
const B = (s) => `<b>${esc(s)}</b>`;
// A City safe to put in HTML (the dictionaries build its label and pt-BR's article from it), its name in bold or not.
export const htmlCity = (c, bold = false) => ({ name: c.name == null ? null : bold ? B(c.name) : esc(c.name), code: esc(c.code) });
const hc = htmlCity;

// The newspaper's text is built by the dictionaries (paper.*); names arrive escaped (and in bold
// when they are the subject), numbers formatted.
export function paperHtml(data, { night = false } = {}) {
  const x = context(data), r = seeded(new Date(data.generatedAt).toISOString().slice(0, 10));
  const all = data.cities.flatMap((c) => c.buildings.map((b) => ({ b, c })));
  const tallest = [...all].sort((p, q) => q.b.floors - p.b.floors)[0];
  const work = [...all].sort((p, q) => q.b.week - p.b.week)[0];
  const second = x.rank[1];
  let head, sub;
  if (x.leader) {
    head = t('paper.lead.head', { c: hc(x.leader) });
    sub = second?.week > 0
      ? t('paper.lead.sub', { floors: floorsText(x.leader.week), other: hc(second), otherWeek: fmt.int(second.week), gap: floorsText(x.leader.week - second.week) })
      : t('paper.lead.alone', { floors: floorsText(x.leader.week) });
  } else {
    head = t('paper.lead.newHead');
    sub = t('paper.lead.newSub', { week: fmt.period(data.week, 'long') });
  }
  const overtakes = [];
  for (const a of data.cities) for (const b of data.cities) {
    if (a !== b && a.floors > b.floors && a.floors - a.week < b.floors - b.week) overtakes.push(t('paper.overtake', { c: hc(a, true), other: hc(b) }));
  }
  const tiers = {};
  for (const c of data.cities) { const k = tierOf(c.floors).key; tiers[k] = (tiers[k] ?? 0) + 1; }
  const tierLine = [...CITY_TIERS].reverse().filter((tr) => tiers[tr.key]).map((tr) => `${tr.icon} ${t('paper.tierCount', { n: tiers[tr.key], count: fmt.int(tiers[tr.key]), tier: cityTier(tr.key) })}`).join(' · ');
  const cranes = data.cities.reduce((s, c) => s + c.building, 0);
  const sky = cranes === 0 ? ['☁️', 'calm'] : night ? ['🌙', 'night'] : cranes >= 20 ? ['☀️', 'sunny'] : ['⛅', 'cloudy'];
  const weather = [sky[0], t(`paper.weather.${sky[1]}.title`), cranes === 0 ? t('paper.weather.calm.text') : plural(cranes, `paper.weather.${sky[1]}.text`)];
  const fresh = all.filter(({ b }) => b.isNew);
  const back = all.filter(({ b }) => b.back); // back today after the building had caught fire
  const unlocked = data.cities.flatMap((c) => monumentsOf(c, x).filter((m) => m.ok).map((m) => ({ c, m })));
  const tips = advisors(data).slice(0, 3);
  const ads = [...t('paper.ads')].sort(() => r() - 0.5).slice(0, 3);
  const people = data.cities.reduce((s, c) => s + c.people, 0);
  const tt = tallest ? tierOf(tallest.b.floors, BUILDING_TIERS) : null;
  const club = data.cities.filter((c) => c.floors >= TEN_BI).sort((p, q) => q.floors - p.floors);
  const nextClub = data.cities.filter((c) => c.floors < TEN_BI).sort((p, q) => q.floors - p.floors)[0];
  const mayors = data.cities.map((c) => ({ c, m: mayorOf(c) })).filter((y) => y.m).sort((p, q) => q.m.lastMonth - p.m.lastMonth);
  const duel = derby(data), soon = countdowns(data).slice(0, 2), medals = weekMedals(data);
  const lastMonth = monthOf(data.lastMonth, 'period.lastMonth'), month = monthOf(data.month, 'period.thisMonth');
  const more = (list, n) => (list.length > n ? [...list.slice(0, n), t('paper.more', { n: fmt.int(list.length - n) })] : list);
  const name = (b) => B(displayName(b).full);
  return `
    <header class="masthead">
      <div class="mast-top"><span>${esc(fmt.date(data.generatedAt, 'long'))}</span><span>${esc(fmt.period(data.week, 'long'))}</span><span>${esc(t('paper.price'))}</span></div>
      <h1>${esc(t('paper.name'))}</h1>
    </header>
    <section class="lead">
      <h2>${head}</h2>
      <p class="deck">${sub}</p>
    </section>
    <div class="cols">
      <article>
        <h3>${t('paper.h.tallest')}</h3>
        <p>${tallest ? t('paper.tallest', { name: name(tallest.b), c: hc(tallest.c), floors: floorsText(tallest.b.floors), tier: buildingTier(tt.key), next: tt.next ? buildingTier(tt.next.key) : null, missing: tt.next ? floorsText(tt.missing) : '' }) : t('paper.noBuildings')}</p>
        <h3>${t('paper.h.work')}</h3>
        <p>${work?.b.week > 0 ? t('paper.work', { name: name(work.b), floors: floorsText(work.b.week), c: hc(work.c) }) : t('paper.noWork')}</p>
        <h3>${t('paper.h.overtakes')}</h3>
        <p>${overtakes.slice(0, 3).join(' ') || t('paper.noOvertakes')}</p>
        ${duel ? `<h3>${t('paper.h.derby')}</h3>
        <p>${t('paper.derby', {
          c: hc(duel.a, true), other: hc(duel.b, true), n: Math.round(duel.gap), floors: floorsText(duel.gap), tie: duel.a.week === duel.b.week,
          lead: hc(duel.a.week > duel.b.week ? duel.a : duel.b), max: fmt.int(Math.max(duel.a.week, duel.b.week)), min: fmt.int(Math.min(duel.a.week, duel.b.week)),
        })}</p>` : ''}
      </article>
      <article>
        <h3>${t('paper.h.club')}</h3>
        <p>${club.length ? plural(club.length, 'paper.club', { list: fmt.list(club.map((c) => `${B(cityLabel(c))} (${floorsText(c.floors)})`)) }) : t('paper.noClub')}${nextClub ? ` ${t('paper.nextClub', { c: hc(nextClub), floors: floorsText(TEN_BI - nextClub.floors) })}` : ''}</p>
        <h3>${t('paper.h.tiers')}</h3>
        <p>${tierLine}</p>
        ${soon.length ? `<h3>${t('paper.h.countdown')}</h3>${soon.map((y) => `<p>${t('paper.countdown', { icon: y.icon, n: Math.round(y.missing), floors: floorsText(y.missing), text: esc(y.text) })}</p>`).join('')}` : ''}
        <h3>${t('paper.h.monuments')}</h3>
        <p>${unlocked.length ? `${unlocked.slice(0, 6).map(({ c, m }) => t('paper.monument', { icon: m.icon, mon: monumentText(m.key), c: hc(c) })).join('; ')}.` : t('paper.noMonuments')}</p>
        <h3>${t('paper.h.medals')}</h3>
        <p>${medals.won.length ? t('paper.medals', { list: fmt.list(more(medals.won.map((p) => `${name(p.top)} (${esc(markText(p.mark))})`), 4)) }) : t('paper.noMedals')}${medals.next ? ` ${t('paper.nextMedal', { name: name(medals.next.top), floors: floorsText(Math.max(1, Math.ceil(medals.next.missing))), mark: esc(markText(medals.next.mark)) })}` : ''}</p>
        <h3>${t('paper.h.mayors', { month: esc(month) })}</h3>
        <p>${mayors.length ? t('paper.mayors', { lastMonth: esc(lastMonth), list: fmt.list(more(mayors.map(({ c, m }) => t('paper.mayor', { name: name(m), c: hc(c), floors: fmt.int(m.lastMonth) })), 4)) }) : t('paper.noMayors', { lastMonth: esc(lastMonth) })}</p>
        <h3>${t('paper.h.fresh')}</h3>
        <p>${fresh.length ? t('paper.fresh', { list: fmt.list(more(fresh.map(({ b, c }) => `${name(b)} (${esc(cityLabel(c))})`), 4)) }) : t('paper.noFresh')}</p>
        ${back.length ? `<p>${t('paper.back', { list: fmt.list(more(back.map(({ b, c }) => `${name(b)} (${esc(cityLabel(c))})`), 4)) })}</p>` : ''}
      </article>
      <article>
        <div class="weather"><span class="wx">${weather[0]}</span><div><h3>${t('paper.h.weather')}</h3><b>${esc(weather[1])}</b><p>${esc(weather[2])}</p></div></div>
        <h3>${t('paper.h.advisors')}</h3>
        ${tips.length ? tips.map((tip) => `<p class="tip">${tip.icon} <i>${esc(tip.who)}:</i> ${esc(tip.text)}</p>`).join('') : `<p class="tip">${t('paper.noTips')}</p>`}
        <h3>${t('paper.h.ads')}</h3>
        ${ads.map((a) => `<p class="ad">${esc(a)}</p>`).join('')}
      </article>
    </div>
    <footer class="paper-foot">${t('paper.footer', { time: fmt.time(data.generatedAt), copies: plural(people, 'count.building') })}</footer>`;
}
