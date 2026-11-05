// Fictional data source to test the game without Datadog.
// ~90 people with a simulated working day: 32 strong climbers, who start at a given time
// (some early, some only in the afternoon, one or two at dawn or at night), alternate work
// blocks with breaks and lunch and have good and bad days (the strongest, now and then, a
// marathon day, which becomes the stage record); and a long tail of ~60 light users
// (0.1 to 3 M per day), who fill the wall in the morning like in Datadog. Everything comes from
// deterministic functions of the clock, so the day's total, the 1-min buckets and the history agree
// with each other, and the stage moves on its own: you can see overtakes every few minutes.
import { seasonAt } from '../season.js';
import { personKey } from '../config.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BUCKET = MIN; // like Datadog (60 s rollup)
const RATE_SCALE = 0.5; // fine-tunes the volume (the day's mark stays near 60 M)
// Marathon day (delivery, migration, release cutover): only for those who climb very hard (~10
// people), on a weekday and rare (1 to 5 in the ~13 weeks of history, 2 on average). Yields about 3.5
// normal days: that is where the stage record comes from, near 3× the mark. The median barely feels it.
const MARATHON_RATE = 7e6; // points/hour (RATE_SCALE already applied) from which the person runs marathons
const MARATHON_CHANCE = 0.008; // per weekday on which they climb

const PEOPLE = [
  'ana.souza', 'bruno.lima', 'carla.mendes', 'diego.alves', 'elisa.rocha', 'fabio.costa',
  'gabriela.nunes', 'henrique.dias', 'isabela.freitas', 'joao.pereira', 'karen.martins',
  'leonardo.ramos', 'mariana.teixeira', 'nicolas.barros', 'olivia.cardoso', 'pedro.moura',
  'quezia.araujo', 'rafael.gomes', 'sabrina.pinto', 'thiago.ribeiro', 'ursula.campos',
  'vinicius.melo', 'wesley.duarte', 'xenia.farias', 'yago.monteiro', 'zilda.correia',
  'arthur.batista', 'beatriz.lopes', 'caio.vieira', 'debora.santana', 'enzo.machado', 'flavia.reis',
];
// Long tail: light users (a few questions per day). Names assembled from two lists.
const FIRST = ['adriana', 'alexandre', 'aline', 'amanda', 'andre', 'bianca', 'camila', 'carlos', 'daniela', 'eduardo',
  'fernanda', 'gustavo', 'helena', 'igor', 'juliana', 'kleber', 'larissa', 'marcos', 'natalia', 'otavio'];
const LAST = ['silva', 'santos', 'oliveira', 'pereira', 'ferreira', 'rodrigues', 'almeida', 'nascimento', 'lima', 'araujo',
  'barbosa', 'ribeiro', 'carvalho', 'gomes', 'martins'];
const LIGHT = Array.from({ length: 60 }, (_, i) => `${FIRST[i % FIRST.length]}.${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`);
const LIGHT_SET = new Set(LIGHT);
const EVERYONE = [...PEOPLE, ...LIGHT];
// Newcomers: only show up from the week the server came up.
const NEWCOMERS = new Set(['xenia.farias', 'enzo.machado', 'flavia.reis', 'yago.monteiro']);

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

// Each person's schedule (in the configured time zone): dawn (0–2h), early (6–7h), normal (7:30–10:30), afternoon
// (12:30–15:30, the "owl") or night (19:30–22:30, until midnight).
function profile(name) {
  const r = rng(hash(name));
  const light = LIGHT_SET.has(name);
  const k = r();
  const kind = k < 0.05 ? 'dawn' : k < 0.1 ? 'night' : k < 0.25 ? 'early' : k < 0.38 ? 'owl' : 'day';
  const start = { dawn: r() * 1.5, night: 19.5 + r() * 3, early: 6 + r() * 1.2, owl: 12.5 + r() * 3, day: 7.5 + r() * 3 }[kind];
  const hours = light ? 1 + r() * 4 : kind === 'dawn' ? 2 + r() * 2 : kind === 'night' ? 2.5 + r() * 2 : 6.5 + r() * 3.5;
  // strong: points/hour in the work blocks (a few far above the rest, as in the real data);
  // light: 0.1 to 3 M over the whole day
  const rate = light ? ((0.1 + r() ** 2 * 2.9) * 1e6) / (hours * 0.55) : (1.5e6 + r() ** 3 * 22e6) * RATE_SCALE;
  return {
    rate,
    cacheRatio: 0.88 + r() * 0.1, // fraction of cache read in the total (the real data is above 90%)
    activeChance: light ? 0.35 + r() * 0.45 : 0.6 + r() * 0.37,
    start,
    hours,
    kind,
    light,
  };
}

// Teams (Claude organizations) of the cities view: each person has a main team and some split their
// usage with a second (15%) or a third (3%) team, as in the real data.
const ORGS = ['Platform', 'Data', 'Mobile', 'Product', 'Infra', 'QA'];

function orgsOf(name) {
  const r = rng(hash(`${name}#org`));
  const main = ORGS[hash(name) % ORGS.length];
  const list = [[main, 1]];
  const pick = () => ORGS.filter((o) => !list.some(([x]) => x === o))[Math.floor(r() * (ORGS.length - list.length))];
  if (r() < 0.15) list.push([pick(), 0.4]);
  if (list.length > 1 && r() < 0.2) list.push([pick(), 0.25]);
  const total = list.reduce((a, [, s]) => a + s, 0);
  return list.map(([o, s]) => [o, s / total]);
}

// Same values as Claude Code's `type` tag in Datadog. `score` = input + output + cachecreation.
function splitByType(name, score) {
  const { cacheRatio } = profile(name);
  return {
    cacheread: Math.round((score * cacheRatio) / (1 - cacheRatio)),
    cachecreation: Math.round(score * 0.8),
    input: Math.round(score * 0.05),
    output: Math.round(score * 0.15),
  };
}

export function createMockSource(config) {
  const off = config.season.utcOffsetHours;
  const newcomersSince = seasonAt(Date.now(), { ...config.season, length: 'week' }).start;
  const plans = new Map();
  // A person's points in the SCORE_TYPES types (like Datadog's "type IN (...)" query;
  // empty = all): factor over the base score (input + output + cachecreation = 1).
  const types = config.scoreTypes ?? [];
  const typeFactor = new Map();
  const factorOf = (name) => {
    if (!typeFactor.has(name)) {
      const parts = Object.entries(splitByType(name, 1e6)).filter(([t]) => !types.length || types.includes(t));
      typeFactor.set(name, parts.reduce((a, [, v]) => a + v, 0) / 1e6);
    }
    return typeFactor.get(name);
  };

  // Local midnight of the day that contains `ms`.
  const dayStartOf = (ms) => ms - ((((ms + off * HOUR) % DAY) + DAY) % DAY);

  // The day's work blocks: [{ a, b, rate }] with a/b in ms since local midnight.
  function plan(name, dayStart) {
    const key = `${name}:${dayStart}`;
    if (plans.has(key)) return plans.get(key);
    if (plans.size > 20000) plans.clear(); // fits the cities view's history (~90 people × months)

    const p = profile(name);
    const r = rng(hash(key));
    const dow = new Date(dayStart + off * HOUR).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const blocks = [];
    const joined = !NEWCOMERS.has(name) || dayStart >= newcomersSince;
    if (joined && r() <= p.activeChance * (weekend ? 0.3 : 1)) {
      // the marathon comes from a separate draw: the other days stay the same
      const marathon = !weekend && p.rate >= MARATHON_RATE && rng(hash(`${key}#maratona`))() < MARATHON_CHANCE;
      const mood = 0.55 + r() * 0.9; // good or bad day
      const intensity = (weekend ? 0.35 : 1) * (marathon ? 2.6 : mood);
      let t = Math.max(0, (p.start + (r() - 0.5) * (p.kind === 'dawn' ? 0.5 : 1.5)) * HOUR);
      const end = Math.min(DAY, t + p.hours * (weekend ? 0.4 : marathon ? 1.4 : 1) * (0.8 + r() * 0.4) * HOUR);
      const lunch = p.kind === 'day' || p.kind === 'early' ? (11.75 + r() * 1.5) * HOUR : -1;
      while (t < end) {
        if (lunch > 0 && t >= lunch && t < lunch + HOUR) t = lunch + HOUR;
        let b = Math.min(end, t + (p.light ? 5 + r() * 20 : 15 + r() * 45) * MIN);
        if (lunch > 0 && t < lunch && b > lunch) b = lunch;
        if (b > t) blocks.push({ a: t, b, rate: p.rate * intensity * (0.3 + r() * 1.4) });
        t = b + (r() < 0.3 ? 30 + r() * 60 : 4 + r() * 20) * MIN; // short break or meeting
      }
    }
    plans.set(key, blocks);
    return blocks;
  }

  // Points accumulated in the day up to `t` ms after midnight.
  function scoreAt(name, dayStart, t) {
    let total = 0;
    for (const { a, b, rate } of plan(name, dayStart)) {
      if (t <= a) break;
      total += (rate * (Math.min(t, b) - a)) / HOUR;
    }
    return total;
  }

  const dayScore = (name, dayStart, now) =>
    now <= dayStart ? 0 : scoreAt(name, dayStart, Math.min(DAY, now - dayStart));
  const sessionsOf = (name, dayStart, now) =>
    plan(name, dayStart).filter((s) => dayStart + s.a < now).length;

  return {
    mode: 'mock',
    // Random but stable belts per person, so the belt map and the Dojo can be tried without a file.
    belts() {
      const out = new Map();
      for (const name of EVERYONE) {
        const email = `${name}@example.com`;
        let h = 7; for (const ch of email) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761);
        const r = (h >>> 0) / 4294967296;
        const belt = r < 0.07 ? 'black' : r < 0.11 ? 'brown' : r < 0.15 ? 'purple' : r < 0.2 ? 'blue' : null;
        if (belt) out.set(personKey(email), { belt, since: null });
      }
      return out;
    },

    async seasonUsage(season, now) {
      const to = Math.min(now, season.end);
      return EVERYONE.map((name) => {
        const daily = [];
        let sessions = 0;
        for (let day = season.start; day < to; day += DAY) {
          const tokens = dayScore(name, day, to);
          sessions += sessionsOf(name, day, to);
          if (tokens > 0) daily.push({ day, tokens });
        }
        const total = daily.reduce((a, d) => a + d.tokens, 0);
        return {
          email: `${name}@example.com`,
          byType: splitByType(name, total),
          daily: daily.map((d) => ({ day: d.day, byType: splitByType(name, d.tokens) })),
          sessions,
        };
      }).filter((u) => u.daily.length);
    },

    async seasonTotals(season) {
      const out = new Map();
      for (const name of EVERYONE) {
        let total = 0;
        for (let day = season.start; day < season.end; day += DAY) total += dayScore(name, day, season.end);
        if (total > 0) out.set(`${name}@example.com`, splitByType(name, total));
      }
      return out;
    },

    // Only the SCORE_TYPES types, as in Datadog (the query already filters by type). Without the real
    // clock: toMs is the start of the build's day, so a build with a future date sees the whole days.
    async dailyScores(fromMs, toMs) {
      const now = toMs;
      const out = new Map();
      for (const name of EVERYONE) {
        const f = factorOf(name);
        const days = new Map();
        for (let day = dayStartOf(fromMs); day < toMs; day += DAY) {
          const tokens = dayScore(name, day, now) * f;
          if (tokens > 0) days.set(day, tokens);
        }
        if (days.size) out.set(`${name}@example.com`, days);
      }
      return out;
    },

    async recentUsage(fromMs, now) {
      const byUser = new Map();
      for (const name of EVERYONE) {
        const f = factorOf(name);
        const buckets = new Map();
        for (let ts = Math.floor(fromMs / BUCKET) * BUCKET; ts < now; ts += BUCKET) {
          const day = dayStartOf(ts);
          const v = (scoreAt(name, day, Math.min(ts + BUCKET, now) - day) - scoreAt(name, day, ts - day)) * f;
          if (v > 0) buckets.set(ts, v);
        }
        if (buckets.size) byUser.set(`${name}@example.com`, buckets);
      }
      return { bucketMs: BUCKET, byUser };
    },

    // Cities view: points per team, person and day (the usage of those in more than one team is split).
    async orgDaily(fromMs, toMs) {
      const out = new Map();
      for (const name of EVERYONE) {
        const f = factorOf(name);
        for (let day = dayStartOf(fromMs); day < toMs; day += DAY) {
          const tokens = dayScore(name, day, toMs) * f;
          if (!(tokens > 0)) continue;
          for (const [org, share] of orgsOf(name)) {
            const people = out.get(org) ?? out.set(org, new Map()).get(org);
            const days = people.get(`${name}@example.com`) ?? people.set(`${name}@example.com`, new Map()).get(`${name}@example.com`);
            days.set(day, tokens * share);
          }
        }
      }
      return out;
    },

    // Cities view: the same per hour (lit windows and who works at night).
    async orgHourly(fromMs, toMs) {
      const out = new Map();
      for (const name of EVERYONE) {
        const f = factorOf(name);
        for (let ts = Math.floor(fromMs / HOUR) * HOUR; ts < toMs; ts += HOUR) {
          const day = dayStartOf(ts), end = Math.min(ts + HOUR, toMs);
          const tokens = (scoreAt(name, day, end - day) - scoreAt(name, day, ts - day)) * f;
          if (!(tokens > 0)) continue;
          for (const [org, share] of orgsOf(name)) {
            const people = out.get(org) ?? out.set(org, new Map()).get(org);
            const hours = people.get(`${name}@example.com`) ?? people.set(`${name}@example.com`, new Map()).get(`${name}@example.com`);
            hours.set(ts, tokens * share);
          }
        }
      }
      return out;
    },

    // Cities view: tokens per model (each with their own fixed mix; most use Opus the most).
    async orgModels(fromMs, toMs) {
      const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];
      const out = new Map();
      for (const name of EVERYONE) {
        let total = 0;
        for (let day = dayStartOf(fromMs); day < toMs; day += DAY) total += dayScore(name, day, toMs) * factorOf(name);
        if (!(total > 0)) continue;
        const r = rng(hash(`${name}#modelo`)), main = r() < 0.75 ? 0 : r() < 0.7 ? 1 : r() < 0.5 ? 2 : 3, mainShare = 0.55 + r() * 0.4;
        for (const [org, share] of orgsOf(name)) {
          const people = out.get(org) ?? out.set(org, new Map()).get(org);
          const models = new Map(MODELS.map((m, i) => [m, total * share * (i === main ? mainShare : (1 - mainShare) / 3)]));
          people.set(`${name}@example.com`, models);
        }
      }
      return out;
    },

    // Cities view: sessions open between fromMs and now, in the main team (each work block is one).
    async orgSessions(fromMs, now) {
      const out = new Map();
      for (const name of EVERYONE) {
        const day = dayStartOf(now), [org] = orgsOf(name)[0];
        const n = plan(name, day).filter((s) => day + s.a < now && day + s.b > fromMs).length;
        if (n) out.set(org, (out.get(org) ?? 0) + n);
      }
      return out;
    },

    // Cities view: who had usage between fromMs and now, in the main team.
    async orgRecent(fromMs, now) {
      const out = new Map();
      for (const name of EVERYONE) {
        const day = dayStartOf(now);
        if (scoreAt(name, day, now - day) - scoreAt(name, day, Math.max(0, fromMs - day)) <= 0) continue;
        const [org] = orgsOf(name)[0];
        (out.get(org) ?? out.set(org, new Set()).get(org)).add(`${name}@example.com`);
      }
      return out;
    },
  };
}
