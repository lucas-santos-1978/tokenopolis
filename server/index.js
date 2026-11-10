// HTTP server: static files from public/, the JSON API and the refresh loops. See docs/contract.md.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { config } from './config.js';
import { createSource } from './sources/index.js';
import { createDemoSource } from './sources/demo.js';
import { createGame } from './game.js';
import { createCities } from './cities.js';

const publicDir = resolve(config.root, 'public');

const MAX_BACKOFF_MS = 15 * 60_000;
const EMPTY_BACKOFF_MS = 2 * 60_000; // no state yet: the page is empty, try again soon

// Maps a failure to the `error` object the API exposes. Messages (with query text and upstream
// bodies) stay in the server log.
function errorOf(err) {
  const status = err.status ?? err.cause?.status ?? null;
  const text = `${err.name ?? ''} ${err.message ?? ''} ${err.cause?.code ?? ''} ${err.cause?.name ?? ''}`;
  const code = status === 429 ? 'rate_limited'
    : status === 401 || status === 403 ? 'auth'
    : status ? 'upstream'
    : /timeout|timed out|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|AbortError/i.test(text) ? 'timeout'
    : /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed/i.test(text) ? 'upstream'
    : err.config ? 'config' : 'unknown';
  return { code, status, retryAfter: err.retryAfter ?? null, at: Date.now() };
}

// A self-refreshing state (the game, the cities), each with its own rhythm and its own errors: a
// failure in the cities does not take the game down and vice versa. On an error or a 429 the last
// good state stays up and the next attempt waits twice as long after each failure (up to 15 min;
// up to 2 min while there is no state), honouring whatever Retry-After the upstream asks for.
function createLoop(label, build, refreshSeconds = config.refreshSeconds) {
  const loop = { state: null, error: null, refreshSeconds };
  let inFlight = null;
  let failures = 0;
  let retryAt = 0; // while backing off, not even the API triggers a query before this
  let timer = null;

  function backoffMs(err) {
    const cap = loop.state ? MAX_BACKOFF_MS : EMPTY_BACKOFF_MS;
    const base = Math.min(cap, refreshSeconds * 1000 * 2 ** Math.min(failures - 1, 6));
    const asked = (err.retryAfter ?? 0) * 1000;
    return Math.min(MAX_BACKOFF_MS, Math.max(base, asked, err.status === 429 ? 60_000 : 0));
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(refresh, ms);
    timer.unref();
  }

  function refresh() {
    const started = Date.now();
    inFlight ??= build(started)
      .then((s) => {
        loop.state = s;
        loop.error = null;
        failures = 0;
        retryAt = 0;
        // fixed rhythm: the queries take a few seconds and must not push the next refresh
        schedule(Math.max(1000, refreshSeconds * 1000 - (Date.now() - started)));
      })
      .catch((err) => {
        failures++;
        loop.error = errorOf(err);
        const wait = backoffMs(err);
        retryAt = Date.now() + wait;
        schedule(wait);
        const cause = err.cause ? ` (${err.cause.code ?? ''} ${err.cause.message ?? err.cause})`.replace('( ', '(') : '';
        console.error(`[${label}] ${err.message}${cause} — retrying in ${Math.round(wait / 1000)} s`);
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  // For the API: with no state yet, wait for the refresh in flight (or start one, outside the back-off).
  async function current() {
    if (!loop.state) await (inFlight ?? (Date.now() >= retryAt ? refresh() : null));
    return loop.state;
  }

  return Object.assign(loop, { refresh, current });
}

// ───────── the stacks: real data and the demo ─────────
function createStack(cfg, source, refreshSeconds) {
  const game = createGame(cfg, source);
  const cities = createCities(cfg, source);
  return {
    source,
    cities,
    game: createLoop(`${cfg.demo ? 'demo-' : ''}climb`, (now) => game.build(now), refreshSeconds),
    city: createLoop(`${cfg.demo ? 'demo-' : ''}city`, (now) => cities.build(now), refreshSeconds),
  };
}

const source = await createSource(config);
const main = createStack(config, source);

// Demo mode (?demo in the URL): the region drawn in sources/demo.js, served next to the real data
// on the same paths. No team.json, no anonymization: everything is fictional. Built on first use.
let demoStack = null;
function demo() {
  if (!demoStack) {
    const demoConfig = { ...config, dataSource: 'demo', mock: false, demo: true, team: null, anonymize: false, nicknames: {} };
    const demoSource = createDemoSource(demoConfig);
    demoConfig.nicknames = demoSource.nicknames?.() ?? {};
    // in-memory data only: 15 s so cranes and the "+1 floor" floats keep moving
    demoStack = createStack(demoConfig, demoSource, 15);
  }
  return demoStack;
}

function configJson(stack) {
  return {
    appName: config.appName,
    locale: config.locale,
    timeZone: config.timeZone,
    utcOffset: config.season.utcOffsetHours,
    mode: stack.source.mode,
    floorTokens: config.cities.floorTokens,
    start: config.cities.start,
    refreshSeconds: stack.game.refreshSeconds,
    features: { belts: stack.cities.beltsEnabled() },
    idle: { fire: config.cities.idleFireDays, rubble: config.cities.idleRubbleDays }, // days without Claude: on fire, then rubble (0 = off)
    mega: { floors: config.cities.megaFloors }, // Mega Builders: floors added up across 2+ cities (0 = off)
  };
}

// ───────── static files ─────────
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
};

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === '/' ? '/city.html' : pathname).replace(/^([/\\])+/, '');
  const file = join(publicDir, rel);
  if (!file.startsWith(publicDir)) return send(res, 403, 'text/plain', 'forbidden');
  try {
    const body = await readFile(file);
    send(res, 200, TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', body);
  } catch {
    send(res, 404, 'text/plain', 'not found');
  }
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const json = (res, status, value) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));

// ───────── basic auth ─────────
// With PANEL_PASSWORD every request asks for a password (the user name is ignored). Without HTTPS
// it crosses the network in the clear: it stops whoever lands on the address, not whoever listens.
const digest = (s) => createHash('sha256').update(s).digest();
const panelDigest = config.panelPassword ? digest(config.panelPassword) : null;

function authorized(req) {
  if (!panelDigest) return true;
  const [scheme, value = ''] = (req.headers.authorization ?? '').split(' ');
  if (scheme.toLowerCase() !== 'basic') return false;
  const userPass = Buffer.from(value, 'base64').toString('utf8');
  return timingSafeEqual(digest(userPass.slice(userPass.indexOf(':') + 1)), panelDigest);
}

// ───────── routes ─────────
const server = createServer(async (req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': `Basic realm="${config.realm}", charset="UTF-8"`, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('password required');
  }
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  const stack = searchParams.has('demo') ? demo() : main; // ?demo: the demo region instead of the real data
  if (pathname === '/api/config') return json(res, 200, configJson(stack));
  // day-by-day history of the cities (time-lapse, sheet and race): from the last build of the cities
  if (pathname === '/api/history') {
    const body = (await stack.city.current()) && stack.cities.historyJson();
    return body ? send(res, 200, 'application/json; charset=utf-8', body) : json(res, 502, { error: stack.city.error });
  }
  const loop = pathname === '/api/state' ? stack.game : pathname === '/api/cities' ? stack.city : null;
  if (loop) {
    const state = await loop.current();
    if (!state) return json(res, 502, { error: loop.error });
    const body = { ...state, error: loop.error };
    return json(res, 200, body);
  }
  return serveStatic(pathname, res);
});

server.listen(config.port, () => {
  const where = source.mode === 'datadog' ? `Datadog (${config.datadog.site})` : source.mode === 'file' ? `file (${config.dataFile})` : source.mode;
  console.log(`🏙️  ${config.appName} at http://localhost:${config.port} — data source: ${where}${panelDigest ? ' — password protected' : ''} — time zone: ${config.timeZone}`);
  main.game.refresh(); // and every refresh schedules the next one
  main.city.refresh();
});
