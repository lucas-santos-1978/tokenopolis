# API contract and data-source interface

This is the frozen contract between the server and the two pages (`city.html`, `climb.html`).
The server never sends display text: everything the user reads is formatted in the browser
from ids, indices, numbers and ISO dates (see `docs/i18n.md`).

## Conventions

- Timestamps are milliseconds since the epoch (`start`, `end`, `generatedAt`, `startsAt`).
- Calendar days are ISO strings `YYYY-MM-DD` in the configured time zone (`stage.day`, `today.day`,
  `beltSince`, `records.since`).
- A **Period** describes a season, week or month:

```json
{ "id": "2026-W45", "kind": "week", "year": 2026, "week": 45, "month": null, "start": 1762128000000, "end": 1762732800000 }
{ "id": "2026-11",  "kind": "month", "year": 2026, "week": null, "month": 10, "start": 1761966000000, "end": 1764558000000 }
```
  `month` is 0-based (0 = January). `id` is stable and safe to use as a key.
- A **Person identity** is `{ id, name, anon, avatar, photo, body }`:
  - `id`: short hash of the e-mail (salted with `ID_SALT` when set). E-mails never leave the server.
  - `name`: display name (nickname or prettified e-mail), or `null` when the person is anonymized.
  - `anon`: `null`, or `{ animal: 0..34, adjective: 0..14, n: null | 2.. }` when `name` is null.
    The browser renders it with its own word lists (`displayName()` in `i18n/index.js`).
  - `body`: `"m" | "f" | null` (3D model choice; was `corpo` in `nicknames.json`).
- A **City** is `{ id, name, code }`: `name` is the configured display name or `null`; `code` is
  the short org code (first 4 chars of the org id, upper-cased). The browser renders
  `name ?? t('city.unnamed', { code })` via `cityLabel()`.
- `mode` is one of `"datadog" | "mock" | "demo" | "file" | "custom"`.
- `error` is `null` or `{ code, status, retryAfter, at }` with
  `code ∈ "upstream" | "timeout" | "rate_limited" | "auth" | "config" | "unknown"`,
  `status` the upstream HTTP status (or null), `retryAfter` in seconds (or null), `at` a timestamp.
  Query text and upstream bodies stay in the server log.

## `GET /api/config`

```json
{
  "appName": "Tokenopolis",
  "locale": "en",
  "timeZone": "America/Sao_Paulo",
  "utcOffset": -3,
  "mode": "mock",
  "floorTokens": 1000000,
  "scoreTypes": ["input", "output", "cachecreation"],
  "start": 1754017200000,
  "refreshSeconds": 15,
  "features": { "belts": true },
  "idle": { "fire": 15, "rubble": 30 },
  "mega": { "floors": 1000 }
}
```
`locale` is only the default for first-time visitors. `scoreTypes` is `SCORE_TYPES` (lowercase; an empty list = every type): the pages say what counts with it. `features.belts` is true when a belts file
exists or the source provides belts (mock/demo). `idle` holds `IDLE_FIRE_DAYS` and `IDLE_RUBBLE_DAYS`: a
building with more than `idle.fire` days without Claude is on fire, more than `idle.rubble` is rubble
(`0` = that stage is off). `mega.floors` is `MEGA_FLOORS`: the floors a person must add up across 2 or
more cities to be a Mega Builder (`0` = off). The page groups the buildings by person id; nothing new
comes in `/api/cities`.

## `GET /api/state` (the climb)

Unchanged fields are not listed. Changes:

| Field | Shape |
|---|---|
| `mode`, `generatedAt`, `refreshSeconds` | unchanged |
| `season` | Period + `{ elapsed, summitTokens, summitSource }`. **Removed:** `name`, `recordHolder` |
| `mountain` | `{ baseAltitude, summitAltitude, camps: [{ kind: "base"\|"camp"\|"summit", n: 0..5, altitude }] }`. **Removed:** `name`, `camps[].name`. `n` is the index in the array (base = 0, summit = 5) |
| `climbers[]` | Person identity + existing numeric fields. `camp` is the camp index (0..5). `badges` is a list of badge ids: `champion summit sherpa streak rocket cache marathon surgical chatty rookie stage` |
| `badges` | **Removed** (catalog lives in the browser dictionaries as `badge.<id>.name` / `.desc`) |
| `stage` | **Removed:** `name`. `day` (ISO) is the only date. `records.week` gains `{ year, week }`; **removed:** `records.week.label` |
| `hallOfFame[]` | `{ season: Period, ...Person identity, tokens }` |
| `error` | see conventions |

## `GET /api/cities` (the city)

| Field | Shape |
|---|---|
| `mode`, `generatedAt`, `start`, `floorTokens` | unchanged |
| `week`, `month`, `lastMonth` | Period (**removed:** `name`) |
| `today` | `{ day, start }` unchanged |
| `mission` | `{ target, lastWeek, growth }` in floors: the region's goal for this week (last week's floors plus `growth` %), or `null` when it is off or there was no last week. The floors done are the sum of `cities[].week` |
| `cities[]` | City + `{ floors, week, people, builders, building, sessions, growth, buildings[] }` |
| `cities[].buildings[]` | `{ id, name, anon }` of the Person identity (the city draws no avatars, so `avatar`, `photo` and `body` are not sent) + `{ belt, beltSince, floors, week, today, month, lastMonth, streak, idle, hours, night, model, modelShare, now, isNew, cities, others }`. `clock` (only with usage in the last 7 days) = 24 digits, one per hour of the day in `TIMEZONE`: on how many of the last 7 days that hour had usage. `models` (only with more than one family) = `[[family, share], …]` of the last 7 days, biggest first. `back` (only on that day) = how many days the building had been stopped when it was used again today, if more than the fire's days. `record: true` (only on that day) = today is already the person's best day in the window. `idle` = calendar days since the last day with usage (0 = today; null without usage in the window). `belt ∈ "white" \| "blue" \| "purple" \| "brown" \| "black"` (was `dojo`), present only for belt holders; `beltSince` ISO day, present only when the list has it (was `dojoDesde`). `model ∈ "opus" \| "sonnet" \| "haiku" \| "fable" \| "other"` (was `outro`) |
| `links[]` | `{ a, b, n }` unchanged |
| `belts` | `{ total, unmatched }` — counts only (was `dojo: { total, semPredio: [...] }`, which leaked e-mails) |
| `error` | see conventions |

## `GET /api/history`

Unchanged: `generatedAt, start, days, floorTokens, cities[{ id, people[{ id, d[] }] }]`. `d[i]` is the
person's floors on day `i` (counted from `start`), in tenths of a floor.

## `?demo`

`/api/state?demo`, `/api/cities?demo` and `/api/history?demo` serve the demo region regardless of
`DATA_SOURCE`. `/api/config?demo` reports `mode: "demo"`.

## HTTP

- `/` serves `city.html`.
- Static files come from `public/` only; `.json`, `.glb` and `.md` get proper MIME types.
- 401 (when `PANEL_PASSWORD` is set): realm is `APP_NAME` reduced to printable ASCII; body `password required`.
- 403 body `forbidden`; 404 body `not found`; 502 body is the `error` object as JSON.

## Configuration (`.env`)

New or renamed variables. Everything else keeps its current name and meaning (see `.env.example`).

| Variable | Default | Meaning |
|---|---|---|
| `APP_NAME` | `Tokenopolis` | Shown in titles, headers, the share card and the auth realm |
| `LOCALE` | `en` | Default language for first-time visitors: `en` or `pt-BR` |
| `TIMEZONE` | host time zone | IANA zone (e.g. `America/Sao_Paulo`). Day/week boundaries use the zone's UTC offset, recomputed at every refresh. Invalid zone → warning and UTC. **Replaces `SEASON_UTC_OFFSET`** |
| `DATA_SOURCE` | auto | `datadog`, `mock`, `demo`, `file`, or a path to a module exporting `createSource(config)`. Auto = `datadog` when Datadog credentials exist, else `mock` |
| `DATA_FILE` | `data.json` | Records file for `DATA_SOURCE=file` |
| `BELTS_FILE` | `belts.json` | Belt program file (relative to the project root). **Replaces `server/dojo.json`** |
| `ID_SALT` | empty | Salt mixed into person ids. Changing it changes every id (saved "my building", shared `?person=` links). Set once, before going live |
| `MOCK` / `--mock` | | Still accepted as a shortcut for `DATA_SOURCE=mock` |

## Local data files (never committed)

`belts.json` (was `server/dojo.json`):
```json
{ "belts": [ { "name": "Marina Albuquerque", "belt": "black", "since": "2025-08-01" },
             { "email": "otavio@example.com", "belt": "brown" } ] }
```
`belt` accepts `white | blue | purple | brown | black` and, for convenience, `branca | azul | roxa | marrom | preta`. Every belt counts for the city's Dojo; only black changes the building.

`nicknames.json`: per e-mail `{ "name", "avatar", "photo", "body": "m" | "f" }` (`body` was `corpo`).

`team.json`: list of e-mails to include (unchanged).

`data.json` (for `DATA_SOURCE=file`): one record per person per day.
```json
{ "records": [
  { "day": "2026-11-03", "email": "ana@example.com", "team": "Platform",
    "tokens": { "input": 1200000, "output": 300000, "cacheCreation": 0, "cacheRead": 5000000 },
    "sessions": 3, "model": "opus",
    "hours": [0,0,0,0,0,0,0,0,120000,900000,800000,400000,0,700000,600000,500000,300000,200000,0,0,0,0,0,0] }
] }
```
`team` is the city id (a name or an org id). `hours` (24 token counts, optional) drives the live
state: without it the file source is "end-of-day only" (everyone idle, no cranes, pace 0).

## Data-source interface (`server/sources/`)

`createSource(config)` returns an object with:

| Member | Returns |
|---|---|
| `mode` | `"datadog" \| "mock" \| "demo" \| "file" \| "custom"` |
| `seasonUsage(season, now)` | `Promise<Array<{ email, byType: {[type]: n}, daily: [{ day: localMidnightMs, byType }], sessions: n \| null }>>` — all token types, unfiltered |
| `seasonTotals(season)` | `Promise<Map<email, {[type]: n}>>` — unfiltered |
| `dailyScores(fromMs, toMs)` | `Promise<Map<email, Map<localMidnightMs, tokens>>>` — filtered to `SCORE_TYPES` |
| `recentUsage(fromMs, now)` | `Promise<{ bucketMs, byUser: Map<email, Map<bucketTs, tokens>> }>` — filtered |
| `orgDaily(fromMs, toMs)` | `Promise<Map<org, Map<email, Map<dayTs, tokens>>>>` — filtered |
| `orgRecent(fromMs, now)` | `Promise<Map<org, Set<email>>>` |
| `orgHourly?(fromMs, toMs)` | `Map<org, Map<email, Map<hourTs, tokens>>>` (optional) |
| `orgSessions?(fromMs, now)` | `Map<org, number>` (optional) |
| `orgModels?(fromMs, toMs)` | `Map<org, Map<email, Map<model, tokens>>>` (optional) |
| `nicknames?()` | `Map<email, { name, avatar, photo, body }>` (optional; demo uses it) |
| `belts?()` | `Map<email \| name, { belt, since }>` (optional; mock/demo use it) |

Errors thrown by a source may carry `status` (HTTP), `retryAfter` (seconds) and `cause`;
`index.js` maps them to the `error` object and to the retry back-off (429 waits at least 60 s).
Daily bucket timestamps must be aligned to local midnight of the configured zone. Person keys are
normalized with `personKey()` from `config.js`, so sources may return either raw e-mails or the
Datadog tag form.
