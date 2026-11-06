// The city: each team (the Claude organization, tag organization.id) is a city and each
// person a building, whose height is the scoring tokens accumulated since CITIES_START
// (1 floor = CITY_FLOOR_TOKENS). Whoever uses Claude in more than one team has a building in each city.
//
// The contest is weekly (floors climbed from Monday to Sunday, in the game's time zone); the accumulated total never
// resets. Closed days change little and are cached; today and "building now" come with every
// refresh. The hours of the last days (lit windows, who works at night) and the open
// sessions (people on the sidewalks) are extras: on error, the dashboard keeps the previous reading.
//
// The day-by-day history of each building (time-lapse, the card's timeline and the cities' race)
// comes out of the same queries and lives in /api/history, separately, because it is big and changes little.
import { personKey } from './config.js';
import { createBelts } from './belts.js';
import { assignIdentities } from './game.js';
import { dayAt, localDayIndex, seasonAt } from './season.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW_WINDOW = 15 * MIN; // "building now": used in the last 15 min
const HISTORY_TTL = 30 * MIN;
const HISTORY_SETTLE = 15 * MIN; // right after midnight the end of yesterday is still arriving at Datadog
const HISTORY_RETRY = 2 * MIN;
const HOURLY_DAYS = 7; // usage hours: today and the 6 days before (who works at night)
const HOURLY_TTL = 15 * MIN;
const SESSIONS_WINDOW = HOUR; // "open session": started or was open in the last hour
const SESSIONS_TTL = 5 * MIN;
const NIGHT_HOUR = (h) => h >= 22 || h < 5; // night owl: from 22h to 5h
const MODELS_DAYS = 7; // "Model" map: the most used model in the last 7 days
const MODELS_TTL = 30 * MIN;
// model family from the tag name (claude-opus-5-5_1m -> opus); the rest becomes "other"
const family = (m) => ['opus', 'sonnet', 'haiku', 'fable'].find((f) => m.toLowerCase().includes(f)) ?? 'other';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

const round1 = (v) => Math.round(v * 10) / 10;

export function createCities(config, source) {
  const belts = createBelts(config, source); // the optional belt program (BELTS_FILE or the source)
  const opts = config.season;
  let off = opts.utcOffsetHours; // refreshed at every build (daylight saving time)
  const { start, floorTokens, minPeople, names } = config.cities;
  const history = { day: null, at: 0, data: null };
  const hourly = { at: 0, data: new Map() };
  const sessions = { at: 0, data: new Map() };
  const models = { at: 0, data: new Map() };
  let timeline = null, timelineJson = null; // the last build's history and its JSON, made on demand

  // Display name from CITY_NAMES (whole id or a prefix); a bare organization UUID has no name and
  // the browser shows its code ("Team 43FA").
  const cityOf = (org) => {
    const id = org.toLowerCase();
    const hit = names[id] ?? Object.entries(names).find(([k]) => k.length >= 4 && id.startsWith(k))?.[1];
    return { name: hit ?? (UUID.test(org) ? null : org), code: org.slice(0, 4).toUpperCase() };
  };

  // Closed days, from the start to yesterday: Map(org -> Map(email -> Map(day -> tokens))).
  async function closedDays(today, now) {
    const ttl = history.at - today.start < HISTORY_SETTLE ? HISTORY_RETRY : HISTORY_TTL;
    if (history.data && history.day === today.day && now - history.at < ttl) return history.data;
    try {
      history.data = today.start > start ? await source.orgDaily(start, today.start) : new Map();
      history.day = today.day;
      history.at = now;
    } catch (err) {
      if (!history.data || err.status === 429) throw err;
      console.warn(`[cities] history did not refresh, keeping the previous one: ${err.message}`);
    }
    return history.data;
  }

  // Extras with their own cache: an error (or a source without the query) leaves the previous reading up.
  async function cached(box, ttl, now, label, load) {
    if (now - box.at < ttl) return box.data;
    try {
      box.data = await load();
    } catch (err) {
      console.warn(`[cities] ${label} did not refresh, keeping the previous reading: ${err.message}`);
    }
    box.at = now; // on error too: tries again only in the next cache cycle
    return box.data;
  }

  async function build(now = Date.now()) {
    off = opts.utcOffsetHours;
    const today = dayAt(now, opts);
    const week = seasonAt(now, { ...opts, length: 'week' });
    const month = seasonAt(now, { ...opts, length: 'month' });
    const lastMonth = seasonAt(month.start - 1, { ...opts, length: 'month' });
    const [past, current, recent, hours, open, used] = await Promise.all([
      closedDays(today, now),
      source.orgDaily(Math.max(start, today.start), now),
      source.orgRecent(now - NOW_WINDOW, now),
      cached(hourly, HOURLY_TTL, now, 'usage hours', () => source.orgHourly?.(today.start - (HOURLY_DAYS - 1) * DAY, now) ?? new Map()),
      cached(sessions, SESSIONS_TTL, now, 'sessions', () => source.orgSessions?.(now - SESSIONS_WINDOW, now) ?? new Map()),
      cached(models, MODELS_TTL, now, 'models', () => source.orgModels?.(today.start - (MODELS_DAYS - 1) * DAY, now) ?? new Map()),
    ]);

    // Per team and person: total, week, today, month, last month, the first day with usage and the days
    // (local day index -> tokens), for the streak, the history and the records.
    const inTeam = (email) => !config.team || config.team.has(personKey(email));
    const startDay = localDayIndex(start, off), todayIdx = localDayIndex(today.start, off);
    const orgs = new Map();
    for (const data of [past, current]) {
      for (const [org, people] of data) {
        for (const [email, days] of people) {
          if (!inTeam(email)) continue;
          const byPerson = orgs.get(org) ?? orgs.set(org, new Map()).get(org);
          const r = byPerson.get(email) ?? { total: 0, week: 0, today: 0, month: 0, lastMonth: 0, first: Infinity, days: new Map() };
          for (const [ts, v] of days) {
            if (ts < start) continue;
            r.total += v;
            if (ts >= week.start) r.week += v;
            if (ts >= today.start) r.today += v;
            if (ts >= month.start) r.month += v;
            else if (ts >= lastMonth.start) r.lastMonth += v;
            r.first = Math.min(r.first, ts);
            const d = localDayIndex(ts + HOUR, off); // the extra hour protects against a bucket that arrives a little before midnight
            r.days.set(d, (r.days.get(d) ?? 0) + v);
          }
          if (r.total > 0) byPerson.set(email, r);
        }
      }
    }
    const kept = [...orgs].filter(([, people]) => people.size >= minPeople);

    const orgsOf = new Map(); // email -> teams where the person builds
    for (const [org, people] of kept) for (const email of people.keys()) (orgsOf.get(email) ?? orgsOf.set(email, []).get(email)).push(org);
    const ids = assignIdentities(orgsOf.keys(), config);

    // Consecutive workdays with usage, up to today (today still without usage does not break the streak). Weekends
    // neither count nor break it.
    const weekday = (d) => { const dow = (d + 4) % 7; return dow !== 0 && dow !== 6; }; // day 0 of the epoch was a Thursday
    function streakOf(days) {
      let n = 0, d = todayIdx;
      if (!(days.get(d) > 0)) d--;
      for (; d >= startDay; d--) {
        if (!weekday(d)) continue;
        if (!(days.get(d) > 0)) break;
        n++;
      }
      return n;
    }
    // Today's hours with usage (bit = hour in the configured time zone) and how many of the last 7 days had night usage (22h to 5h).
    function hoursOf(org, email) {
      let mask = 0;
      const nights = new Set();
      for (const [ts, v] of hours.get(org)?.get(email) ?? []) {
        if (!(v > 0)) continue;
        const local = ts + off * HOUR, h = new Date(local).getUTCHours();
        if (ts >= today.start) mask |= 1 << h;
        if (NIGHT_HOUR(h)) nights.add(Math.floor((local - (h < 6 ? DAY : 0)) / DAY)); // the small hours belong to the previous night
      }
      return { mask, nights: nights.size };
    }

    // The model family the person uses most in this city and its share (null without data).
    function modelOf(org, email) {
      const byFamily = new Map();
      for (const [m, v] of used.get(org)?.get(email) ?? []) byFamily.set(family(m), (byFamily.get(family(m)) ?? 0) + v);
      const total = [...byFamily.values()].reduce((a, v) => a + v, 0);
      if (!(total > 0)) return { model: null, modelShare: 0 };
      const [top, v] = [...byFamily].sort((a, b) => b[1] - a[1])[0];
      return { model: top, modelShare: Math.round((v / total) * 100) / 100 };
    }

    const cities = kept.map(([org, people]) => {
      const buildings = [...people].map(([email, r]) => {
        const id = ids.get(email), h = hoursOf(org, email), isNow = recent.get(org)?.has(email) ?? false;
        const belt = belts.beltOf(email, id.name);
        return {
          id: id.id,
          name: id.name,
          anon: id.anon,
          ...(belt ? { belt: belt.belt, ...(belt.since ? { beltSince: belt.since } : {}) } : {}), // white, blue, purple, brown or black; only black changes the building
          floors: round1(r.total / floorTokens),
          week: round1(r.week / floorTokens),
          today: round1(r.today / floorTokens),
          month: round1(r.month / floorTokens),
          lastMonth: round1(r.lastMonth / floorTokens),
          streak: streakOf(r.days),
          hours: isNow ? h.mask | (1 << new Date(now + off * HOUR).getUTCHours()) : h.mask,
          night: h.nights,
          ...modelOf(org, email),
          now: isNow,
          isNew: r.first >= week.start,
          cities: orgsOf.get(email).length,
          others: orgsOf.get(email).filter((o) => o !== org),
          days: r.days, // only for the history (removed from the JSON below)
        };
      }).sort((a, b) => b.floors - a.floors || (a.name ?? '').localeCompare(b.name ?? ''));
      const floors = buildings.reduce((a, b) => a + b.floors, 0);
      const weekFloors = buildings.reduce((a, b) => a + b.week, 0);
      return {
        id: org,
        ...cityOf(org),
        floors: round1(floors),
        week: round1(weekFloors),
        people: buildings.length,
        builders: buildings.filter((b) => b.week > 0).length, // built during the week
        building: buildings.filter((b) => b.now).length, // building now
        sessions: Math.round(open.get(org) ?? 0), // open sessions in the last hour
        growth: weekFloors / Math.max(1, floors - weekFloors),
        buildings,
      };
    }).sort((a, b) => b.floors - a.floors);

    // History: floors per day (in tenths of a floor), from the first day to today, in the buildings' order.
    const nDays = todayIdx - startDay + 1;
    timeline = {
      generatedAt: now,
      start,
      days: nDays,
      floorTokens,
      cities: cities.map((c) => ({
        id: c.id,
        people: c.buildings.map((b) => {
          const d = new Array(nDays).fill(0);
          for (const [i, v] of b.days) if (i >= startDay && i <= todayIdx) d[i - startDay] = Math.round((v / floorTokens) * 10);
          return { id: b.id, d };
        }),
      })),
    };
    timelineJson = null;
    for (const c of cities) for (const b of c.buildings) delete b.days;

    // People shared by two cities (the map's golden routes).
    const pairs = new Map();
    for (const list of orgsOf.values()) {
      const sorted = [...list].sort();
      for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    const links = [...pairs].map(([key, n]) => { const [a, b] = key.split('|'); return { a, b, n }; }).sort((x, y) => y.n - x.n);

    return {
      mode: source.mode,
      generatedAt: now,
      start,
      floorTokens,
      week,
      month,
      lastMonth,
      today: { day: today.day, start: today.start },
      cities,
      links,
      belts: belts.summary(), // counts only: how many belts and how many matched nobody
    };
  }

  // JSON of the last build's history (made once per build, the first time someone asks for it).
  function historyJson() {
    if (!timeline) return null;
    timelineJson ??= JSON.stringify(timeline);
    return timelineJson;
  }

  return { build, historyJson, beltsEnabled: () => belts.enabled() };
}
