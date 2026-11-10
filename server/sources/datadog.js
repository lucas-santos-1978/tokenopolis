// Real data source: the Datadog metrics API (v1 /query).
// The keys stay here on the server only — the browser never sees them.
//
// Days always aligned to midnight in the game's time zone: rollup(sum, 86400) alone groups by UTC
// day (in the configured time zone "today" would turn over hours early) and a rollup the size of the whole season falls into buckets
// aligned to the Unix epoch, losing a good part of the week. The rollup's third argument (the zone offset, e.g. '-3h')
// shifts the buckets to the zone; summed, it matches the hours from the configured time zone's midnight on.
//
// The person tag's value comes normalized by Datadog: the e-mail's "@" becomes "_"
// ("ana.souza_empresa.com.br"). The game compares team.json and nicknames.json already in that format (config.js).

const DAY_S = 86400;
// 1 min: pace, last 15 min and "one hour ago" without prorating buckets (with 5 min, the bucket that crossed
// the start of the window counted proportionally and could flip "climbing" to "resting" at the edge)
const RECENT_BUCKET_S = 60;
// Datadog itself gives up on a query at ~60 s ("Query timed out"); with the service slow, a
// 50 s query still comes back fine, so the cutoff here stays above that.
const TIMEOUT_MS = 90_000;
// Usage without a person (no user.email) arrives in a bucket with a fixed value, such as "N/A": it is nobody.
const NO_PERSON = new Set(['n/a', 'na', 'none', 'null', 'undefined', 'unknown', '-']);

// Splits "a:1,b IN (x,y)" only at the commas outside parentheses (an outer comma counts as AND).
export function splitScope(filter) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of filter) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p && p !== '*');
}

export function createDatadogSource({ datadog, season, scoreTypes }) {
  const base = `https://api.${datadog.site}`;
  const { filter, userTag, typeTag, orgTag, modelTag, metrics } = datadog;
  const headers = datadog.accessToken
    ? { Authorization: `Bearer ${datadog.accessToken}` }
    : { 'DD-API-KEY': datadog.apiKey, 'DD-APPLICATION-KEY': datadog.appKey };

  // Daily buckets aligned to local midnight: the zone's current offset is read at every query, so
  // zones with daylight saving time keep the right boundary after a switch.
  const dailyRollup = () => {
    const off = season.utcOffsetHours;
    if (!off) return `rollup(sum, ${DAY_S})`;
    const sign = off > 0 ? '+' : '-', abs = Math.abs(off);
    const tz = Number.isInteger(abs) ? `${sign}${abs}h` : `${sign}${Math.round(abs * 60)}m`;
    return `rollup(sum, ${DAY_S}, '${tz}')`;
  };

  // Only the types that score points (queries that do not need byType). Empty = all. The team
  // filter goes in whole (commas inside "IN (...)" split nothing): the same population as the
  // week's and the sessions' queries, which use the filter as it came.
  const scoreScope = scoreTypes.length
    ? [...splitScope(filter), `${typeTag} IN (${scoreTypes.join(',')})`].map((p) => `(${p})`).join(' AND ')
    : filter;

  async function query(q, fromMs, toMs) {
    const url = new URL('/api/v1/query', base);
    url.searchParams.set('from', Math.floor(fromMs / 1000));
    url.searchParams.set('to', Math.floor(toMs / 1000));
    url.searchParams.set('query', q);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Datadog ${res.status} for "${q}": ${body.slice(0, 300)}`);
      err.status = res.status;
      // 429: Datadog says in how many seconds the rate-limit window reopens.
      const wait = Number(res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset'));
      if (Number.isFinite(wait) && wait > 0) err.retryAfter = wait;
      throw err;
    }
    const json = await res.json();
    if (json.status === 'error') throw new Error(`Datadog: ${json.error}`);
    return json.series ?? [];
  }

  const tagValue = (series, key) => {
    const prefix = `${key}:`;
    const tag = (series.tag_set ?? []).find((t) => t.startsWith(prefix));
    return tag ? tag.slice(prefix.length) : null;
  };
  // The series' person; null without the tag or in the bucket without a person ("N/A"), which stays out of everything.
  const personOf = (series) => {
    const v = tagValue(series, userTag)?.trim();
    return v && !NO_PERSON.has(v.toLowerCase()) ? v : null;
  };

  const sumPoints = (series) =>
    (series.pointlist ?? []).reduce((acc, [, v]) => acc + (v ?? 0), 0);

  // "by {org,user}" series into Map(org -> Map(email -> Map(bucket ts -> tokens))).
  function byOrgPerson(series) {
    const out = new Map();
    for (const s of series) {
      const org = tagValue(s, orgTag)?.trim(), email = personOf(s);
      if (!org || NO_PERSON.has(org.toLowerCase()) || !email) continue;
      const people = out.get(org) ?? out.set(org, new Map()).get(org);
      const buckets = people.get(email) ?? new Map();
      for (const [ts, v] of s.pointlist ?? []) if (v) buckets.set(ts, (buckets.get(ts) ?? 0) + v);
      if (buckets.size) people.set(email, buckets);
    }
    return out;
  }

  // An optional query (sessions) never stops the game. When it fails (a timeout, a 5xx), it answers
  // with its last good result for a while instead of an empty one, which would pass for "nobody": the
  // sidewalks would empty and the session badges vanish until the next good reading. Empty only when
  // there is nothing recent to keep. `key` is what the result depends on (the season's start): a
  // result kept for another key is not reused.
  const lastGood = new Map(); // name → { key, at, value }
  const KEEP_MS = 30 * 60_000;
  async function optional(name, key, run) {
    try {
      const value = await run();
      lastGood.set(name, { key, at: Date.now(), value });
      return value;
    } catch (err) {
      if (err.status === 429) throw err; // rate limit exceeded: better to keep the last good state
      const kept = lastGood.get(name), keep = !!kept && kept.key === key && Date.now() - kept.at < KEEP_MS;
      console.warn(`[datadog] optional metric ${name} unavailable (${keep ? 'keeping the last reading' : 'nothing to keep'}): ${err.message}`);
      return keep ? kept.value : new Map();
    }
  }

  // Optional metric (sessions): if it does not exist, the game goes on without its badges.
  function totalsByUser(metric, fromMs, toMs) {
    return optional(`${metric} by person`, fromMs, async () => {
      const series = await query(
        `sum:${metric}{${filter}} by {${userTag}}.as_count().${dailyRollup()}`, fromMs, toMs);
      const out = new Map();
      for (const s of series) {
        const user = personOf(s);
        if (user) out.set(user, (out.get(user) ?? 0) + sumPoints(s));
      }
      return out;
    });
  }

  // Scoring tokens per person and per bucket: Map(email -> Map(bucket ts -> tokens)).
  async function scoreBuckets(rollup, fromMs, toMs) {
    const series = await query(
      `sum:${metrics.tokens}{${scoreScope}} by {${userTag}}.as_count().${rollup}`, fromMs, toMs);
    const out = new Map();
    for (const s of series) {
      const email = personOf(s);
      if (!email) continue;
      const buckets = out.get(email) ?? new Map();
      for (const [ts, v] of s.pointlist ?? []) if (v) buckets.set(ts, (buckets.get(ts) ?? 0) + v);
      if (buckets.size) out.set(email, buckets);
    }
    return out;
  }

  return {
    mode: 'datadog',

    // Detailed usage of the current season: tokens by type + daily series (streak, rocket, today's stage).
    async seasonUsage(season, now) {
      const to = Math.min(now, season.end);
      const series = await query(
        `sum:${metrics.tokens}{${filter}} by {${userTag},${typeTag}}.as_count().${dailyRollup()}`,
        season.start, to);

      const users = new Map();
      for (const s of series) {
        const email = personOf(s);
        if (!email) continue;
        const type = tagValue(s, typeTag) ?? 'other';
        const u = users.get(email) ?? { email, byType: {}, daily: new Map() };
        for (const [ts, v] of s.pointlist ?? []) {
          if (!v) continue;
          u.byType[type] = (u.byType[type] ?? 0) + v;
          // The bucket already starts at local midnight: the timestamp is the start of the day.
          const bucket = u.daily.get(ts) ?? {};
          bucket[type] = (bucket[type] ?? 0) + v;
          u.daily.set(ts, bucket);
        }
        users.set(email, u);
      }

      const sessions = await totalsByUser(metrics.sessions, season.start, to);

      return [...users.values()].map((u) => ({
        email: u.email,
        byType: u.byType,
        daily: [...u.daily.entries()].sort((a, b) => a[0] - b[0]).map(([day, byType]) => ({ day, byType })),
        sessions: sessions.get(u.email) ?? null,
      }));
    },

    // Tokens by type and by person in a closed season (hall of fame, rookies, summit).
    async seasonTotals(season) {
      const series = await query(
        `sum:${metrics.tokens}{${filter}} by {${userTag},${typeTag}}.as_count().${dailyRollup()}`,
        season.start, season.end - 1000);
      const out = new Map();
      for (const s of series) {
        const email = personOf(s);
        if (!email) continue;
        const type = tagValue(s, typeTag) ?? 'other';
        const byType = out.get(email) ?? {};
        byType[type] = (byType[type] ?? 0) + sumPoints(s);
        out.set(email, byType);
      }
      return out;
    },

    // Closed stages (the day's mark, wins and the 🔥 streak): points per person and per local day.
    async dailyScores(fromMs, toMs) {
      return scoreBuckets(dailyRollup(), fromMs, toMs - 1000);
    },

    // Last ~2 h in 1-min buckets: pace, last 15 min and where each one was 1 h ago.
    async recentUsage(fromMs, now) {
      const step = RECENT_BUCKET_S * 1000;
      const from = Math.floor(fromMs / step) * step;
      const buckets = await scoreBuckets(`rollup(sum, ${RECENT_BUCKET_S})`, from, now);
      return { bucketMs: step, byUser: buckets };
    },

    // Cities: points per team, person and local day: Map(org -> Map(email -> Map(day -> tokens))).
    async orgDaily(fromMs, toMs) {
      return byOrgPerson(await query(
        `sum:${metrics.tokens}{${scoreScope}} by {${orgTag},${userTag}}.as_count().${dailyRollup()}`, fromMs, toMs - 1000));
    },

    // Cities: the same per hour (the configured time zone's hours are whole UTC hours, so there is no need to shift):
    // each one's lit windows and who works at night.
    async orgHourly(fromMs, toMs) {
      const step = 3600_000;
      return byOrgPerson(await query(
        `sum:${metrics.tokens}{${scoreScope}} by {${orgTag},${userTag}}.as_count().rollup(sum, 3600)`, Math.floor(fromMs / step) * step, toMs));
    },

    // Cities: points per team, person and model between fromMs and toMs (the "Model" map):
    // Map(org -> Map(email -> Map(model -> tokens))).
    async orgModels(fromMs, toMs) {
      const series = await query(
        `sum:${metrics.tokens}{${scoreScope}} by {${orgTag},${userTag},${modelTag}}.as_count().${dailyRollup()}`, fromMs, toMs);
      const out = new Map();
      for (const s of series) {
        const org = tagValue(s, orgTag)?.trim(), email = personOf(s), model = tagValue(s, modelTag)?.trim();
        if (!org || NO_PERSON.has(org.toLowerCase()) || !email || !model || NO_PERSON.has(model.toLowerCase())) continue;
        const people = out.get(org) ?? out.set(org, new Map()).get(org);
        const models = people.get(email) ?? people.set(email, new Map()).get(email);
        models.set(model, (models.get(model) ?? 0) + sumPoints(s));
      }
      return out;
    },

    // Cities: open sessions per team between fromMs and now (the people on the sidewalks). Optional metric.
    orgSessions(fromMs, now) {
      return optional(`${metrics.sessions} by team`, 'window', async () => { // a sliding window: any recent result is still about now
        const series = await query(`sum:${metrics.sessions}{${filter}} by {${orgTag}}.as_count().rollup(sum, 600)`, fromMs, now);
        const out = new Map();
        for (const s of series) {
          const org = tagValue(s, orgTag)?.trim();
          if (org && !NO_PERSON.has(org.toLowerCase())) out.set(org, (out.get(org) ?? 0) + sumPoints(s));
        }
        return out;
      });
    },

    // Cities: who used in each team between fromMs and now (the "building now" crane).
    async orgRecent(fromMs, now) {
      const series = await query(
        `sum:${metrics.tokens}{${scoreScope}} by {${orgTag},${userTag}}.as_count().rollup(sum, ${RECENT_BUCKET_S})`, fromMs, now);
      const out = new Map();
      for (const s of series) {
        const org = tagValue(s, orgTag)?.trim(), email = personOf(s);
        if (!org || !email || !(s.pointlist ?? []).some(([, v]) => v)) continue;
        (out.get(org) ?? out.set(org, new Set()).get(org)).add(email);
      }
      return out;
    },
  };
}
