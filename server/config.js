// Configuration: reads .env (and the environment) once at startup and exposes a frozen `config`.
// Every value goes through env(key, fallback); an empty string counts as "not set".
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

const HOUR = 3600_000;

// ───────── data source ─────────
// A Personal/Service Access Token (ddpat_/ddsat_) is also accepted when pasted into DD_APP_KEY.
const isAccessToken = (v) => /^dd[ps]at_/.test(v ?? '');
const accessToken = env('DD_ACCESS_TOKEN') ?? (isAccessToken(env('DD_APP_KEY')) ? env('DD_APP_KEY') : undefined);
const hasKeys = Boolean(accessToken || (env('DD_API_KEY') && env('DD_APP_KEY')));
const forceMock = process.argv.includes('--mock') || env('MOCK', 'false') === 'true';
// DATA_SOURCE: datadog | mock | demo | file | path to a module exporting createSource(config).
// Unset: datadog when credentials exist, otherwise mock. --mock / MOCK=true always win.
const dataSource = forceMock ? 'mock' : env('DATA_SOURCE', hasKeys ? 'datadog' : 'mock');
const isMock = dataSource === 'mock';
const scoreTypes = env('SCORE_TYPES', 'input,output,cachecreation').toLowerCase();

// ───────── time zone ─────────
// TIMEZONE is an IANA name. Day, week and month boundaries use the zone's UTC offset, which is
// recomputed at every refresh (so zones with daylight saving time self-correct after a switch;
// the boundaries right around the switch hour may be off by one hour).
function validZone(name) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    console.warn(`[config] TIMEZONE "${name}" is not a valid IANA zone; using UTC`);
    return 'UTC';
  }
}
const timeZone = validZone(env('TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));

export function zoneOffsetHours(zone, at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(at);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] ?? 0) / 60);
}

let offsetCache = { at: 0, value: zoneOffsetHours(timeZone) };
function currentOffset() {
  const now = Date.now();
  if (now - offsetCache.at > 60_000) offsetCache = { at: now, value: zoneOffsetHours(timeZone) };
  return offsetCache.value;
}

// Local calendar date (YYYY-MM-DD) → midnight of that day in the configured zone, in ms.
export function localMidnight(date, offsetHours) {
  const [y, m, d] = String(date).split('-').map(Number);
  const ms = Date.UTC(y, (m || 1) - 1, d || 1) - offsetHours * HOUR;
  return Number.isFinite(ms) ? ms : null;
}

// ───────── local files ─────────
function loadJson(name, fallback) {
  const file = resolve(root, name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`[config] could not read ${file}: ${err.message}`);
    return fallback;
  }
}

// A person in the Datadog tag form: lower case, with "@" (like any character outside letters,
// digits, _ - : . /) replaced by "_". E-mails in team.json and nicknames.json may carry the "@";
// the tag arrives as "ana.souza_example.com". Both sides go through here.
export const personKey = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9_\-:./]/g, '_');

// team.json: the e-mails that take part. Without the file, everyone in the filter takes part.
function loadTeam() {
  const list = loadJson(env('TEAM_FILE', 'team.json'), null);
  if (!Array.isArray(list)) return null;
  return new Set(list.map((e) => String(e).trim()).filter(Boolean).map(personKey));
}

// nicknames.json keyed by e-mail (with "@" or already in the tag form).
function loadNicknames() {
  const raw = loadJson(env('NICKNAMES_FILE', 'nicknames.json'), {});
  const out = {};
  if (raw && typeof raw === 'object') for (const [email, nick] of Object.entries(raw)) out[personKey(email)] = nick;
  return out;
}

// CITY_NAMES="a1b2c3d4=Platform,e5f6a7b8=Data": a display name per organization id (whole id or
// just its beginning). Without a name a city shows up by its code ("Team A1B2").
function parseCityNames(raw) {
  const out = {};
  for (const pair of String(raw ?? '').split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
  }
  return out;
}

// ───────── refresh rhythm ─────────
// Never below 15 s with real data (each refresh runs 3 queries) nor 5 s with generated data; an
// invalid value falls back to the default.
const live = dataSource === 'datadog';
const refreshDefault = live ? 60 : 15;
const refreshRaw = Number(env('REFRESH_SECONDS', refreshDefault));
const refreshSeconds = Math.min(3600, Math.max(live ? 15 : 5, Number.isFinite(refreshRaw) && refreshRaw > 0 ? refreshRaw : refreshDefault));

// Cities accumulate floors since CITIES_START. Default: 90 days ago, at local midnight.
function citiesStart() {
  const raw = env('CITIES_START');
  const off = zoneOffsetHours(timeZone);
  if (raw) {
    const ms = localMidnight(raw, off);
    if (ms !== null) return ms;
    console.warn(`[config] CITIES_START "${raw}" is not a YYYY-MM-DD date; using 90 days ago`);
  }
  const d = new Date(Date.now() + off * HOUR - 90 * 24 * HOUR);
  return localMidnight(d.toISOString().slice(0, 10), off);
}

// The auth realm goes into an HTTP header: printable ASCII only, no double quotes.
const appName = env('APP_NAME', 'Tokenopolis').trim() || 'Tokenopolis';
const realm = appName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'").trim() || 'Tokenopolis';

export const config = {
  root,
  port: Number(env('PORT', 3000)),
  appName,
  realm,
  locale: /^pt/i.test(env('LOCALE', 'en')) ? 'pt-BR' : 'en',
  timeZone,
  dataSource,
  dataFile: env('DATA_FILE', 'data.json'),
  mock: isMock, // generated data: random belts, fast refresh
  demo: false, // the demo stack sets this to true on its own copy of the config
  idSalt: env('ID_SALT', ''),

  datadog: {
    // A Personal Access Token (ddpat_...) works alone; otherwise API key + Application key.
    accessToken,
    apiKey: env('DD_API_KEY'),
    appKey: env('DD_APP_KEY'),
    site: env('DD_SITE', 'datadoghq.com'),
    // Scope of the metrics, e.g. "team:platform" or "service:claude-code". "*" = everything.
    filter: env('DD_FILTER', '*'),
    userTag: env('DD_USER_TAG', 'user.email'),
    typeTag: env('DD_TYPE_TAG', 'type'),
    // The team of each use (the Claude organization): a city.
    orgTag: env('DD_ORG_TAG', 'organization.id'),
    // The model of each use (claude-opus-5-5, claude-sonnet-5-5...): the "Model" map of the city.
    modelTag: env('DD_MODEL_TAG', 'model'),
    metrics: {
      tokens: env('METRIC_TOKENS', 'claude_code.token.usage'),
      sessions: env('METRIC_SESSIONS', 'claude_code.session.count'),
    },
  },

  season: {
    // Overall ranking: weekly (Monday 00:00 to Sunday 23:59, local time) by default; "month" also works.
    length: env('SEASON_LENGTH', 'week'), // "week" | "month"
    // Current UTC offset of the configured zone, in hours (may be fractional). Read it at every
    // build rather than caching it, so daylight saving time changes are picked up.
    get utcOffsetHours() { return currentOffset(); },
    summitTokens: Number(env('SUMMIT_TOKENS', 0)) || null, // fixed; empty = the previous champion's record
    hallOfFameSize: Number(env('HALL_OF_FAME_SIZE', 3)),
  },

  // The daily stage (the 3D wall): everyone leaves base camp at local midnight.
  stage: {
    markTokens: Number(env('STAGE_MARK_TOKENS', 0)) || null, // fixed; empty = median of recent winners
    markDays: Math.max(1, Math.round(Number(env('STAGE_MARK_DAYS', 10))) || 10), // workday stages in the median
  },

  // The city: each team is a city and each person a building, with the tokens accumulated since
  // CITIES_START (1 floor = CITY_FLOOR_TOKENS). Teams with fewer than CITY_MIN_PEOPLE people
  // (personal accounts, with a single person) are left out.
  cities: {
    start: citiesStart(),
    floorTokens: Math.max(1, Number(env('CITY_FLOOR_TOKENS', 1e6)) || 1e6),
    minPeople: Math.max(1, Number(env('CITY_MIN_PEOPLE', 5)) || 5),
    names: parseCityNames(env('CITY_NAMES', '')),
    // Abandoned buildings: after IDLE_FIRE_DAYS days without Claude the building catches fire, after
    // IDLE_RUBBLE_DAYS it is a pile of rubble (0 turns each one off). Calendar days, weekends included.
    idleFireDays: Math.max(0, Math.round(Number(env('IDLE_FIRE_DAYS', 15)))) || 0,
    idleRubbleDays: Math.max(0, Math.round(Number(env('IDLE_RUBBLE_DAYS', 30)))) || 0,
    // Mega Builders: whoever builds in 2+ cities and adds up MEGA_FLOORS floors across them gets a
    // headquarters in the Corporate District (0 turns it off).
    megaFloors: Math.max(0, Math.round(Number(env('MEGA_FLOORS', 1000)))) || 0,
  },

  // Belt program (an optional recognition program): a JSON file with names or e-mails and belts.
  beltsFile: env('BELTS_FILE', 'belts.json'),

  topN: Number(env('TOP_N', 25)),
  // Token types (the `type` tag) that count towards altitude. Cache reads are left out by default
  // (~97% of the volume, and they measure context re-reading rather than new work). "all" = every type.
  scoreTypes: scoreTypes === 'all' ? [] : scoreTypes.split(',').map((t) => t.trim()).filter(Boolean),
  team: loadTeam(),
  // Minimum volume (scoring tokens) to take part, scaled by how far the season has run.
  minTokens: Number(env('MIN_TOKENS', 0)),
  refreshSeconds,
  anonymize: env('ANONYMIZE', 'false') === 'true',
  nicknames: loadNicknames(),
  // Panel published on a server: the browser asks for a password (the user name is ignored). Empty = open.
  panelPassword: env('PANEL_PASSWORD', ''),
};
