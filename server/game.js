// Game rules: turns token usage into altitude, ranking, badges and the hall of fame
// (the week's general classification) and into the day's stage (the 3D wall, which resets at midnight in the configured time zone).
import { seasonAt, previousSeasons, dayAt, localDayIndex } from './season.js';
import { personKey } from './config.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// The day's stage
const STAGE_SIZE = 25; // people on the stage wall (independent of the general classification's TOP_N)
const CLIMBING_WINDOW = 15 * MIN; // "climbing" = used tokens in the last 15 min...
const CLIMBING_MIN_TOKENS = 20_000; // ...and it was not just noise
const PACE_WINDOW = HOUR; // pace = tokens of the last hour
const RECENT_WINDOW = 2 * HOUR; // window queried in 1-min buckets
const HISTORY_TTL = 30 * MIN; // daily history: at most every 30 min (or at the day's turnover)
// The history queried in the first 10 min of the day is provisional (yesterday's last minute is still
// arriving at Datadog): it is queried again every PAST_RETRY until one comes out after that.
const HISTORY_SETTLE = 10 * MIN;
// The daily history covers ~13 weeks: the 🔥 streak is not tied to the day's mark window
// (one query of ~800 series × 91 points, at most every 30 min).
const STREAK_DAYS = 91;
const MARK_MIN_STAGES = 3; // fewer than this and the day's mark is estimated
const MARK_FALLBACK_FLOOR = 5e6;
const MARK_FALLBACK_FACTOR = 1.2;
// Holidays and bridge days: a workday stage with fewer than half the usual people stays out of the
// median (a holiday's winner would pull the mark down for two weeks).
const HOLIDAY_FACTOR = 0.5;
const RECENT_STAGES = 5; // last closed stages (any day of the week) with a plaque on the wall
// Closed season: Datadog still receives Sunday's last minute for ~1–2 min. It is only cached
// for good 30 min after the end; before that, it is queried again every 5 min.
const PAST_SETTLE = 30 * MIN;
const PAST_RETRY = 5 * MIN;
// An automated account (many sessions with few tokens) does not compete for Marathon or Surgical.
const AUTOMATED_MIN_SESSIONS = 50;
const AUTOMATED_TOKENS_PER_SESSION = 50_000;

// The mountain. Camps are identified by kind and index; the browser names them (docs/contract.md).
export const MOUNTAIN = {
  baseAltitude: 5364,
  summitAltitude: 8848,
  camps: [
    { kind: 'base', n: 0, altitude: 5364 },
    { kind: 'camp', n: 1, altitude: 6065 },
    { kind: 'camp', n: 2, altitude: 6400 },
    { kind: 'camp', n: 3, altitude: 7160 },
    { kind: 'camp', n: 4, altitude: 7950 },
    { kind: 'summit', n: 5, altitude: 8848 },
  ],
};

// Badge ids, in display order. Names, descriptions and icons live in the browser dictionaries.
export const BADGE_IDS = ['champion', 'summit', 'sherpa', 'streak', 'rocket', 'cache', 'marathon', 'surgical', 'chatty', 'rookie', 'stage'];

// Avatar emoji; the index doubles as the animal of the anonymized name (the browser holds the
// 35 animal names and the 15 adjectives, in the same order, in both languages).
const AVATARS = ['🐐', '🦙', '🐻‍❄️', '🦅', '🐧', '🦊', '🐺', '🐼', '🐨', '🦉', '🐯', '🦁', '🐸', '🐵', '🦝',
  '🦫', '🦬', '🦔', '🐢', '🦦', '🐙', '🦄', '🐲', '🦖', '🐳', '🦩', '🐝', '🦀', '🐞', '🦭',
  '🐿️', '🦥', '🐆', '🦘', '🐊'];
const ADJECTIVE_COUNT = 15;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function prettyName(email) {
  // Datadog replaces the "@" with "_": "ana.souza_empresa.com.br" (the domain does not become a surname).
  const local = email.includes('@') ? email.split('@')[0] : email.replace(/_[a-z0-9-]+(\.[a-z0-9-]+)+$/i, '');
  const parts = local.split(/[._-]+/).filter((p) => p && !/^\d+$/.test(p));
  // Loose initials ("t.davi") become noise in the label; only what is a name stays.
  const words = parts.filter((p) => p.length > 1);
  return (words.length ? words : parts).slice(0, 2)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

// Optional photo from nicknames.json: an https URL or a file in public/avatars/.
function safePhoto(photo) {
  if (typeof photo !== 'string') return null;
  if (/^https:\/\/\S+$/i.test(photo)) return photo;
  const rel = photo.replace(/^\/+/, '');
  return /^avatars\/[\w.-]+\.(png|jpe?g|webp|gif|svg)$/i.test(rel) ? rel : null;
}

// The climber's body in the 3D: "f", "m" or the id of a model from public/models/climbers.json.
// Comes from the "body" (or "corpo") field of nicknames.json; without it, from the real first name (the e-mail's, even with
// a nickname or ANONYMIZE): in pt-BR, ending in "a" is female, with the most common exceptions.
const MALE_A = new Set(['luca', 'gianluca', 'joshua', 'josua', 'jonatha', 'nikita', 'sasha', 'ilya', 'akira', 'mustafa', 'elia', 'isaia', 'jeremia', 'noah', 'juba']);
const FEMALE_NAMES = new Set([
  'raquel', 'isabel', 'mabel', 'rachel', 'beatriz', 'liz', 'ines', 'carmen', 'karen', 'ellen', 'helen', 'evelyn', 'yasmin', 'iasmin', 'jasmin',
  'miriam', 'mirian', 'lilian', 'ingrid', 'ruth', 'rute', 'ester', 'esther', 'lourdes', 'mercedes', 'agnes', 'dolores', 'iris', 'suelen',
  'nicole', 'joyce', 'marli', 'marly', 'sueli', 'suely', 'neli', 'rosemeire', 'rosimeire', 'edith', 'judite', 'elizabeth', 'elisabeth',
  'thais', 'tais', 'lais', 'anais', 'kathleen', 'sharon', 'allison', 'alison', 'madalen', 'gleice', 'kelly', 'emily', 'shirley',
]);
const FEMALE_END = /(iane|ane|ene|ine|ele|elle|ete|ette|ice|ise|yne|lyn|ah)$/;

function bodyOf(email, corpo) {
  if (typeof corpo === 'string') {
    if (/^(f|fem|feminino|female|mulher)$/i.test(corpo)) return 'f';
    if (/^(m|masc|masculino|male|homem)$/i.test(corpo)) return 'm';
    if (/^[\w-]{1,40}$/.test(corpo)) return corpo;
  }
  const first = prettyName(email).split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!/^[a-z]{2,}$/.test(first)) return null;
  if (MALE_A.has(first)) return 'm';
  return FEMALE_NAMES.has(first) || first.endsWith('a') || FEMALE_END.test(first) ? 'f' : 'm';
}

// A stable, unique avatar per person (collisions resolved in e-mail order). With ANONYMIZE the
// identity is { animal, adjective, n } (indices into the browser's word lists) and `name` is null;
// a collision moves to the next adjective and, when those run out, gets a number.
export function assignIdentities(emails, { nicknames, anonymize, idSalt = '' }) {
  const used = new Set();
  const usedNames = new Set();
  const out = new Map();
  for (const email of [...emails].sort()) {
    const nick = nicknames[personKey(email)] ?? {};
    let idx = hash(email) % AVATARS.length;
    for (let i = 0; used.has(idx) && i < AVATARS.length; i++) idx = (idx + 1) % AVATARS.length;
    used.add(idx);
    let anon = null;
    if (anonymize && !nick.name) {
      const a0 = hash(`${email}#adj`) % ADJECTIVE_COUNT;
      let adjective = a0, n = null, key = `${idx}-${a0}`;
      for (let i = 1; i < ADJECTIVE_COUNT && usedNames.has(key); i++) {
        adjective = (a0 + i) % ADJECTIVE_COUNT;
        key = `${idx}-${adjective}`;
      }
      if (usedNames.has(key)) {
        adjective = a0;
        for (n = 2; usedNames.has(`${idx}-${a0}-${n}`); n++);
        key = `${idx}-${a0}-${n}`;
      }
      usedNames.add(key);
      anon = { animal: idx, adjective, n };
    }
    out.set(email, {
      id: hash(`${idSalt}${email}#id`).toString(36),
      avatar: nick.avatar ?? AVATARS[idx],
      name: nick.name ?? (anon ? null : prettyName(email)),
      anon,
      photo: anonymize ? null : safePhoto(nick.photo),
      body: bodyOf(email, nick.body ?? nick.corpo),
    });
  }
  return out;
}

const sumValues = (obj) => Object.values(obj).reduce((a, v) => a + v, 0);

// `active`: local day indices (configured time zone) with usage. Joins the season and the daily history (~13
// weeks), so the streak does not reset every Monday in the weekly season. `firstIdx`: the first day
// the data covers; if the streak reaches it, it may be longer (open: show "N+").
function streakOf(active, now, off, firstIdx) {
  let day = localDayIndex(now, off);
  if (!active.has(day)) day -= 1; // today may still be starting
  // An idle weekend does not break the streak (but weekend usage counts).
  const isWeekend = (idx) => [0, 6].includes(new Date(idx * DAY).getUTCDay());
  let n = 0;
  for (; day >= firstIdx; day--) {
    if (active.has(day)) n++;
    else if (!isWeekend(day)) return { n, open: false };
  }
  return { n, open: n > 0 };
}

function cacheRatioOf(byType, total) {
  if (!total) return 0;
  const read = Object.entries(byType)
    .filter(([k]) => /cache/i.test(k) && /read/i.test(k))
    .reduce((a, [, v]) => a + v, 0);
  return read / total;
}

const outputOf = (byType) => Object.entries(byType)
  .filter(([k]) => k.toLowerCase() === 'output')
  .reduce((a, [, v]) => a + v, 0);

// Gives the "unique" badge to whoever has the best value (on a tie, everyone wins it).
function awardBest(list, badge, valueOf, { lowerIsBetter = false } = {}) {
  const eligible = list.filter((c) => Number.isFinite(valueOf(c)));
  if (!eligible.length) return;
  const values = eligible.map(valueOf);
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  for (const c of eligible) if (valueOf(c) === best) c.badges.push(badge);
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Sum of the buckets (Map ts -> tokens) from `from` on; the bucket that crosses the start counts proportionally.
function windowSum(buckets, bucketMs, from) {
  let total = 0;
  for (const [ts, v] of buckets ?? []) {
    const end = ts + bucketMs;
    if (end > from) total += v * Math.min(1, (end - Math.max(ts, from)) / bucketMs);
  }
  return total;
}

const isoDay = (idx) => new Date(idx * DAY).toISOString().slice(0, 10);
const dowOf = (idx) => new Date(idx * DAY).getUTCDay(); // 0 = Sunday
const isWorkday = (idx) => { const dow = dowOf(idx); return dow >= 1 && dow <= 5; };

// Records of the history window, with the same population as the mark (team.json and SCORE_TYPES): the
// biggest closed stage, the biggest closed week (a whole Mon-Sun inside the window: the first one, if it
// starts midway, and the current one stay out), the biggest stage on today's day of the week, the last stages and
// everyone's personal best. Today only counts after it closes. Everything by e-mail: the names come
// later, together with everyone else's. A tie goes to whoever got there first (the oldest day).
function recordsOf(historyScores, winnerByDay, todayIdx, fromIdx) {
  const closed = (idx) => idx >= fromIdx && idx < todayIdx;
  const stages = [...winnerByDay].filter(([idx]) => closed(idx)).sort((a, b) => a[0] - b[0]);
  let stage = null;
  let weekday = null;
  for (const [idx, w] of stages) {
    if (!stage || w.tokens > stage.tokens) stage = { ...w, idx };
    if (dowOf(idx) === dowOf(todayIdx) && (!weekday || w.tokens > weekday.tokens)) weekday = { ...w, idx };
  }
  // Is the biggest stage on this day of the week the biggest stage itself? Then it is already in the stage record.
  if (weekday?.idx === stage?.idx) weekday = null;

  const firstMonday = fromIdx + ((8 - dowOf(fromIdx)) % 7);
  const weeks = Math.max(0, Math.floor((todayIdx - firstMonday) / 7)); // whole, closed weeks
  let week = null;
  const pb = new Map(); // e-mail -> { tokens, idx }
  for (const [email, days] of historyScores) {
    const totals = new Array(weeks).fill(0);
    let best = null;
    for (const [idx, tokens] of days) {
      if (!closed(idx) || !(tokens > 0)) continue;
      if (!best || tokens > best.tokens || (tokens === best.tokens && idx < best.idx)) best = { tokens, idx };
      const w = Math.floor((idx - firstMonday) / 7);
      if (w >= 0 && w < weeks) totals[w] += tokens;
    }
    if (best) pb.set(email, best);
    totals.forEach((tokens, w) => {
      const idx = firstMonday + 7 * w;
      if (tokens > 0 && (!week || tokens > week.tokens || (tokens === week.tokens && idx < week.idx))) week = { email, tokens, idx };
    });
  }

  const recent = stages.slice(-RECENT_STAGES).reverse().map(([idx, w]) => ({ ...w, idx }));
  return { stage, week, weekday, recent, pb };
}

export function createGame(config, source) {
  const pastCache = new Map(); // season id -> { totals, at, final }
  let off = config.season.utcOffsetHours; // refreshed at every build (daylight saving time)
  // The 🔥 streak (~13 weeks) and, with slack, the day's mark window: twice the median's stages
  // (holidays stay out) with the weekends in between. Always covers the current season.
  const historyDays = Math.max(STREAK_DAYS, Math.ceil((2 * config.stage.markDays) / 5) * 7 + 2);
  // `firstIdx`: the first local day of the queried window (the records' "since")
  const history = { day: null, at: 0, scores: null, firstIdx: null };

  // Closed season: cached for good only PAST_SETTLE after the end (the end of Sunday is still arriving
  // at Datadog in the first minutes of Monday); before that, queried again every PAST_RETRY.
  async function pastTotals(season, now) {
    const hit = pastCache.get(season.id);
    if (hit && (hit.final || now - hit.at < PAST_RETRY)) return hit.totals;
    try {
      const totals = await source.seasonTotals(season);
      pastCache.set(season.id, { totals, at: now, final: now - season.end >= PAST_SETTLE });
      return totals;
    } catch (err) {
      if (!hit || err.status === 429) throw err;
      console.warn(`[seasons] ${season.id} did not refresh, keeping the previous totals: ${err.message}`);
      return hit.totals;
    }
  }

  // Points per person and per day up to yesterday (closed stages and the streak). Changes little: a
  // 30-min cache, renewed right at the day's turnover to close yesterday's stage (and again in the first
  // minutes, while the end of yesterday is still arriving: records and yesterday's plaque do not stay low).
  async function stageHistory(stage, now) {
    const ttl = history.at - stage.start < HISTORY_SETTLE ? PAST_RETRY : HISTORY_TTL;
    if (history.scores && history.day === stage.day && now - history.at < ttl) return history.scores;
    try {
      history.scores = await source.dailyScores(stage.start - historyDays * DAY, stage.start);
      history.day = stage.day;
      history.at = now;
      history.firstIdx = localDayIndex(stage.start - historyDays * DAY, off);
    } catch (err) {
      // With no history at all, or with Datadog's rate limit exceeded, the whole refresh waits.
      if (!history.scores || err.status === 429) throw err;
      console.warn(`[stages] history did not refresh, keeping the previous one: ${err.message}`);
    }
    return history.scores;
  }

  async function build(now = Date.now()) {
    const seasonOpts = config.season;
    off = seasonOpts.utcOffsetHours;
    const season = seasonAt(now, seasonOpts);
    const stageDay = dayAt(now, seasonOpts);
    const past = previousSeasons(season, Math.max(1, seasonOpts.hallOfFameSize), seasonOpts);
    const [rawUsage, recent, rawHistory, ...rawPast] = await Promise.all([
      source.seasonUsage(season, now),
      source.recentUsage(now - RECENT_WINDOW, now),
      stageHistory(stageDay, now),
      ...past.map((s) => pastTotals(s, now)),
    ]);

    // Only those in team.json (if it exists) and only the token types that score points.
    const inTeam = (email) => !config.team || config.team.has(personKey(email));
    const scoreOf = (byType) => Object.entries(byType)
      .filter(([type]) => !config.scoreTypes.length || config.scoreTypes.includes(type.toLowerCase()))
      .reduce((a, [, v]) => a + v, 0);
    const usage = rawUsage.filter((u) => inTeam(u.email));
    const pastResults = rawPast.map((totals) => new Map(
      [...totals].filter(([email]) => inTeam(email)).map(([email, byType]) => [email, scoreOf(byType)])));
    // Stage history by local day index: Map(email -> Map(day -> points)).
    const historyScores = new Map();
    for (const [email, days] of rawHistory) {
      if (!inTeam(email)) continue;
      historyScores.set(email, new Map([...days].map(([ts, tokens]) => [localDayIndex(ts, off), tokens])));
    }

    const championOf = (totals) => {
      let best = null;
      for (const [email, tokens] of totals) if (tokens > 0 && (!best || tokens > best.tokens)) best = { email, tokens };
      return best;
    };

    const prevTotals = pastResults[0];
    const prevChampion = championOf(prevTotals);
    const elapsed = Math.min(1, Math.max(0, (now - season.start) / (season.end - season.start)));
    const todayIdx = localDayIndex(now, off);
    // first day covered by the data (the history starts historyDays before today)
    const firstIdx = Math.min(todayIdx - historyDays, localDayIndex(season.start, off));

    const scored = usage
      .map((u) => {
        const tokens = scoreOf(u.byType);
        const daily = u.daily.map((d) => ({ idx: localDayIndex(d.day, off), tokens: scoreOf(d.byType) }));
        const today = daily.filter((d) => d.idx === todayIdx).reduce((a, d) => a + d.tokens, 0);
        const activeDays = new Set(daily.filter((d) => d.tokens > 0).map((d) => d.idx));
        for (const [idx, t] of historyScores.get(u.email) ?? []) if (t > 0) activeDays.add(idx);
        const streak = streakOf(activeDays, now, off, firstIdx);
        return { ...u, tokens, today, streak: streak.n, streakOpen: streak.open, cacheRatio: cacheRatioOf(u.byType, sumValues(u.byType)) };
      })
      .filter((c) => c.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);
    // Participation cut: grows along with the season so the mountain is not emptied on day 1.
    // Applies only to the general classification: the day's stage cuts nobody.
    const cutTokens = config.minTokens * elapsed;
    const everyone = scored.filter((c) => c.tokens >= cutTokens);
    const belowCut = scored.length - everyone.length;

    // --- The day's stage ---------------------------------------------------
    // Winner of each closed stage: whoever scored the most that day among the participants.
    const winnerByDay = new Map(); // day index -> { email, tokens }
    for (const [email, days] of historyScores) {
      for (const [idx, tokens] of days) {
        if (idx >= todayIdx || !(tokens > 0)) continue;
        const best = winnerByDay.get(idx);
        if (!best || tokens > best.tokens) winnerByDay.set(idx, { email, tokens });
      }
    }
    // Stages won in the ongoing general classification (the week; with SEASON_LENGTH=month, the month).
    const seasonStartIdx = localDayIndex(season.start, off);
    const stageWins = new Map();
    for (const [idx, w] of winnerByDay) {
      if (idx >= seasonStartIdx) stageWins.set(w.email, (stageWins.get(w.email) ?? 0) + 1);
    }

    // Pace, last 15 min and "1 h ago" count only this stage's tokens (since midnight).
    const paceFrom = Math.max(now - PACE_WINDOW, stageDay.start);
    const last15From = Math.max(now - CLIMBING_WINDOW, stageDay.start);
    const liveOf = (email, today) => {
      const buckets = recent.byUser.get(email);
      const inHour = Math.min(today, windowSum(buckets, recent.bucketMs, paceFrom));
      const last15 = Math.min(inHour, windowSum(buckets, recent.bucketMs, last15From));
      const state = !(today > 0) ? 'sleeping' : last15 >= CLIMBING_MIN_TOKENS ? 'climbing' : 'resting';
      return { hourAgo: Math.max(0, Math.round(today - inHour)), pace: Math.round(inHour), last15: Math.round(last15), state };
    };

    // Whoever scored today climbs; the rest of the wall is filled with those sleeping at base camp:
    // the top of the general classification and, if people are still missing (early Monday), the top of the past season.
    const stageSize = STAGE_SIZE;
    const active = scored.filter((c) => c.today > 0).sort((a, b) => b.today - a.today || b.tokens - a.tokens);
    const onWall = active.slice(0, stageSize).map((c) => ({ email: c.email, today: c.today, weekTokens: c.tokens }));
    // Who is climbing right now and the biggest climb of the last hour among everyone with tokens today (not just
    // the 25 on the wall): the LIVE panel speaks for the whole company.
    let climbingNow = 0;
    let fastest = null;
    for (const c of active) {
      const live = liveOf(c.email, c.today);
      if (live.state === 'climbing') climbingNow++;
      if (live.pace > 0 && (!fastest || live.pace > fastest.pace)) fastest = { email: c.email, pace: live.pace };
    }
    const seen = new Set(onWall.map((c) => c.email));
    const weekTokensOf = new Map(scored.map((c) => [c.email, c.tokens]));
    const sleepers = [];
    const prevRanking = [...(prevTotals ?? [])].filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]).map(([email]) => email);
    for (const email of [...everyone.map((c) => c.email), ...prevRanking]) {
      if (onWall.length + sleepers.length >= stageSize) break;
      if (seen.has(email)) continue;
      seen.add(email);
      sleepers.push({ email, today: 0, weekTokens: weekTokensOf.get(email) ?? 0 });
    }
    onWall.push(...sleepers); // already in order of the week's tokens

    // The day's mark: fixed, otherwise the median of the winners of the last workday stages. A stage with
    // fewer than half the usual people (holiday, bridge day) stays out and the previous one takes its place.
    const leaderToday = active[0]?.today ?? 0;
    let mark = config.stage.markTokens;
    let markSource = 'fixed';
    let markStages = [];
    if (!mark) {
      const peopleOn = new Map(); // day index -> how many scored
      for (const days of historyScores.values()) for (const [idx, t] of days) if (t > 0) peopleOn.set(idx, (peopleOn.get(idx) ?? 0) + 1);
      const workStages = [...winnerByDay].filter(([idx]) => isWorkday(idx)).sort((a, b) => b[0] - a[0]);
      const usual = median(workStages.slice(0, 2 * config.stage.markDays).map(([idx]) => peopleOn.get(idx) ?? 0)) || 0;
      markStages = workStages
        .filter(([idx]) => (peopleOn.get(idx) ?? 0) >= HOLIDAY_FACTOR * usual)
        .slice(0, config.stage.markDays)
        .map(([idx, w]) => ({ day: isoDay(idx), email: w.email, tokens: w.tokens }));
      // STAGE_MARK_DAYS=1 or 2 also works: the median needs at most as many stages as the window
      if (markStages.length >= Math.min(MARK_MIN_STAGES, config.stage.markDays)) {
        mark = median(markStages.map((w) => w.tokens));
        markSource = 'median';
      } else {
        mark = Math.max(MARK_FALLBACK_FLOOR, MARK_FALLBACK_FACTOR * leaderToday);
        markSource = 'fallback';
      }
    }

    // Records, last stages and personal best: from the same history, with no new query.
    const historyFrom = history.firstIdx ?? todayIdx - historyDays;
    const records = recordsOf(historyScores, winnerByDay, todayIdx, historyFrom);

    // A record holder may not have used anything this week (nor last week): they get a name too.
    const allEmails = new Set(usage.map((u) => u.email));
    for (const totals of pastResults) for (const email of totals.keys()) allEmails.add(email);
    for (const w of markStages) allEmails.add(w.email);
    for (const r of [records.stage, records.week, records.weekday, ...records.recent]) if (r) allEmails.add(r.email);
    const who = assignIdentities(allEmails, config);
    const ident = (email) => { const w = who.get(email); return { id: w.id, name: w.name, anon: w.anon }; };
    const holder = (r) => ({ ...ident(r.email), tokens: Math.round(r.tokens) });
    // The ISO week that contains a local day index (the browser labels it)
    const weekOf = (idx) => { const w = seasonAt(idx * DAY - off * HOUR, { ...seasonOpts, length: 'week' }); return { year: w.year, week: w.week }; };
    const pbOf = (email) => {
      const best = records.pb.get(email);
      return best ? { tokens: Math.round(best.tokens), day: isoDay(best.idx) } : null;
    };

    // Summit: fixed value > previous champion's record > current leader's projection.
    let summitTokens = config.season.summitTokens;
    let summitSource = 'config';
    if (!summitTokens && prevChampion) {
      summitTokens = prevChampion.tokens;
      summitSource = 'record';
    }
    if (!summitTokens) {
      summitTokens = Math.max(1, (everyone[0]?.tokens ?? 1) / Math.max(elapsed, 0.05));
      summitSource = 'projection';
    }

    const span = MOUNTAIN.summitAltitude - MOUNTAIN.baseAltitude;
    const altitudeOf = (tokens) => MOUNTAIN.baseAltitude + Math.min(1, tokens / summitTokens) * span;
    const campOf = (alt) => MOUNTAIN.camps.filter((c) => alt >= c.altitude).at(-1).n;
    const paceTokens = summitTokens * elapsed;

    // Yellow jersey: the leader of the general classification (the week).
    const jerseyEmail = everyone[0]?.email ?? null;
    const weekRankOf = new Map(everyone.map((c, i) => [c.email, i + 1]));

    const top = everyone.slice(0, config.topN).map((c, i) => {
      const id = who.get(c.email);
      const altitude = altitudeOf(c.tokens);
      return {
        ...c,
        ...id,
        ...liveOf(c.email, c.today),
        rank: i + 1,
        progress: c.tokens / summitTokens,
        altitude: Math.round(altitude),
        camp: campOf(altitude),
        stageWins: stageWins.get(c.email) ?? 0,
        jersey: c.email === jerseyEmail,
        badges: [],
      };
    });

    // Threshold badges
    for (const c of top) {
      if (prevChampion && c.email === prevChampion.email) c.badges.push('champion');
      if (c.progress >= 1) c.badges.push('summit');
      if (elapsed > 0.05 && c.tokens >= paceTokens && c.progress < 1) c.badges.push('sherpa');
      if (c.streak >= 5) c.badges.push('streak');
      if (prevTotals.size && !(prevTotals.get(c.email) > 0)) c.badges.push('rookie');
      if (c.stageWins > 0) c.badges.push('stage');
    }
    // Unique badges (the best mark in the top)
    const minTokensForRatio = (top[0]?.tokens ?? 0) * 0.05;
    awardBest(top, 'rocket', (c) => (c.today > 0 ? c.today : NaN));
    awardBest(top, 'cache', (c) => (c.tokens >= minTokensForRatio ? c.cacheRatio : NaN));
    // sessions of an automated account (dozens per hour, few tokens each) do not count
    const automated = (c) => c.sessions >= AUTOMATED_MIN_SESSIONS && c.tokens / c.sessions < AUTOMATED_TOKENS_PER_SESSION;
    awardBest(top, 'marathon', (c) => (c.sessions > 0 && !automated(c) ? c.sessions : NaN));
    awardBest(top, 'surgical', (c) => (c.sessions >= 10 && !automated(c) ? c.tokens / c.sessions : NaN), { lowerIsBetter: true });
    awardBest(top, 'chatty', (c) => outputOf(c.byType) || NaN);

    const order = BADGE_IDS;
    const climbers = top.map((c) => ({
      id: c.id,
      name: c.name,
      anon: c.anon,
      avatar: c.avatar,
      photo: c.photo,
      body: c.body,
      rank: c.rank,
      tokens: Math.round(c.tokens),
      today: Math.round(c.today),
      progress: c.progress,
      altitude: c.altitude,
      camp: c.camp,
      byType: c.byType,
      cacheRatio: c.cacheRatio,
      streak: c.streak,
      streakOpen: c.streakOpen, // the streak reaches the start of the history: it may be longer ("N+")
      sessions: c.sessions,
      badges: c.badges.sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      stageWins: c.stageWins,
      jersey: c.jersey,
      state: c.state,
      pace: c.pace,
      last15: c.last15,
    }));

    // Stage: whoever scored today by the day's tokens; the sleepers after them, in the week's order.
    const stageClimbers = onWall.map((c, i) => {
      const id = who.get(c.email);
      const live = liveOf(c.email, c.today);
      return {
        id: id.id,
        name: id.name,
        anon: id.anon,
        avatar: id.avatar,
        photo: id.photo,
        body: id.body,
        rank: i + 1,
        tokens: Math.round(c.today),
        hourAgo: live.hourAgo,
        last15: live.last15,
        pace: live.pace,
        state: live.state,
        weekRank: weekRankOf.get(c.email) ?? null,
        weekTokens: Math.round(c.weekTokens),
        stageWins: stageWins.get(c.email) ?? 0,
        jersey: c.email === jerseyEmail,
        pb: pbOf(c.email), // the person's best closed stage in the window (today excluded)
      };
    });

    const hallOfFame = past
      .map((s, i) => {
        const champ = championOf(pastResults[i]);
        if (!champ) return null;
        const id = who.get(champ.email);
        return { season: s, ...ident(champ.email), avatar: id.avatar, photo: id.photo, tokens: Math.round(champ.tokens) };
      })
      .filter(Boolean);

    return {
      mode: source.mode,
      generatedAt: now,
      refreshSeconds: config.refreshSeconds,
      season: {
        ...season,
        elapsed,
        summitTokens: Math.round(summitTokens),
        summitSource,
      },
      mountain: MOUNTAIN,
      pace: { tokens: Math.round(paceTokens), altitude: Math.round(altitudeOf(paceTokens)) },
      team: {
        tokens: Math.round(everyone.reduce((a, c) => a + c.tokens, 0)),
        participants: everyone.length,
        activeToday: everyone.filter((c) => c.today > 0).length,
        cutTokens: Math.round(cutTokens),
        belowCut,
      },
      climbers,
      stage: {
        day: stageDay.day,
        startsAt: stageDay.start,
        endsAt: stageDay.end,
        mark: Math.round(mark),
        markSource,
        markWindow: markStages.length,
        winners: markStages.map((w) => ({ day: w.day, ...ident(w.email), tokens: Math.round(w.tokens) })),
        records: {
          since: isoDay(historyFrom),
          stage: records.stage && { ...holder(records.stage), day: isoDay(records.stage.idx) },
          week: records.week && { ...holder(records.week), start: isoDay(records.week.idx), ...weekOf(records.week.idx) },
          weekday: records.weekday && { ...holder(records.weekday), day: isoDay(records.weekday.idx) },
        },
        recentStages: records.recent.map((w) => ({ day: isoDay(w.idx), ...holder(w) })), // most recent first
        activeToday: active.length,
        climbingNow, // of everyone with tokens today, how many are climbing right now
        fastest: fastest ? { ...ident(fastest.email), pace: Math.round(fastest.pace) } : null,
        climbers: stageClimbers,
      },
      hallOfFame,
    };
  }

  return { build };
}
