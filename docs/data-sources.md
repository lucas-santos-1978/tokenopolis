# Data sources

Tokenopolis reads usage through a small interface (`server/sources/`). `DATA_SOURCE` picks one:

| Value | What it reads |
|---|---|
| `datadog` | Claude Code OpenTelemetry metrics stored in Datadog (the default when credentials exist) |
| `file` | A JSON file of daily records that you produce from anything |
| a module path | Your own implementation of the interface |
| `mock` | Generated data for trying it out (`npm run mock`) |
| `demo` | The large fictional region (`?demo` also serves it next to any other source) |

## Datadog

Claude Code can [export metrics over OpenTelemetry](https://docs.anthropic.com/en/docs/claude-code/monitoring-usage).
With the Datadog agent (or the OTLP endpoint) receiving them, the panel only needs:

- `claude_code.token.usage` tagged with the user (`user.email`), the token type (`type`:
  `input`, `output`, `cacheRead`, `cacheCreation`), the organization (`organization.id`) and the
  model (`model`). Tag names are configurable (`DD_*_TAG`).
- Optionally `claude_code.session.count` for the sessions-based badges and the sidewalk crowds.
- A **Personal or Service Access Token** that can run `POST /api/v1/query` (metrics read), or an
  API key + Application key pair. Nothing else is called; the token stays on the server.

Every refresh runs five queries: three for the climb (the season by person and type, its sessions,
the last two hours by the minute) and two for the city (today by team and person, who used it in the
last 15 minutes). The rest is cached: the daily history, the city's past days and the models for 30
minutes, the hours of use for 15, the open sessions for 5, and a closed season for good. A `429`
from Datadog backs the server off for at least a minute and keeps the last good state on screen. A
sessions query that fails any other way keeps its last result for up to 30 minutes, so the sidewalks
do not empty and the session badges do not vanish over one bad answer.

## File

`DATA_SOURCE=file` reads `DATA_FILE` (default `data.json`), re-read whenever it changes:

```json
{ "records": [
  { "day": "2026-11-03", "email": "ana@example.com", "team": "Platform",
    "tokens": { "input": 1200000, "output": 300000, "cacheCreation": 0, "cacheRead": 5000000 },
    "sessions": 3, "model": "opus",
    "hours": [0,0,0,0,0,0,0,0,120000,900000,800000,400000,0,700000,600000,500000,300000,200000,0,0,0,0,0,0] }
] }
```

- One record per person per day per team. `day` is a local date in `TIMEZONE`.
- `team` is the city id: a name, or an organization id you map with `CITY_NAMES`.
- `tokens` keys are matched case-insensitively against `SCORE_TYPES` (`cacheRead` → `cacheread`).
- `hours` (24 token counts, optional) drives the live parts: "building now", lit windows, the daily
  stage and the climbers' states and pace. Without it the panel is "end of day only": everyone is
  idle, no cranes, pace 0.
- `sessions` and `model` are optional (sessions badges, sidewalks, the "Model" map).

A script that exports your usage into this shape (from a database, a CSV, another vendor's API)
is all it takes to run Tokenopolis anywhere.

## Your own module

`DATA_SOURCE=./my-source.js` (relative to the project root) loads a module that exports
`createSource(config)` and returns an object with the methods below. `config` is the parsed
configuration (`server/config.js`): `season.utcOffsetHours`, `scoreTypes`, `cities.start`, `root`…

| Member | Returns |
|---|---|
| `mode` | A short name shown in the mode pill (`"custom"` if you leave it out) |
| `seasonUsage(season, now)` | `Promise<Array<{ email, byType: {[type]: n}, daily: [{ day: localMidnightMs, byType }], sessions: n \| null }>>`, all types |
| `seasonTotals(season)` | `Promise<Map<email, {[type]: n}>>`, all types |
| `dailyScores(fromMs, toMs)` | `Promise<Map<email, Map<localMidnightMs, tokens>>>`, scoring types only |
| `recentUsage(fromMs, now)` | `Promise<{ bucketMs, byUser: Map<email, Map<bucketTs, tokens>> }>`, scoring types only |
| `orgDaily(fromMs, toMs)` | `Promise<Map<org, Map<email, Map<dayTs, tokens>>>>`, scoring types only |
| `orgRecent(fromMs, now)` | `Promise<Map<org, Set<email>>>` (who used tokens in the window) |
| `orgHourly?(fromMs, toMs)` | `Map<org, Map<email, Map<hourTs, tokens>>>` (optional) |
| `orgSessions?(fromMs, now)` | `Map<org, number>` (optional) |
| `orgModels?(fromMs, toMs)` | `Map<org, Map<email, Map<model, tokens>>>` (optional) |
| `nicknames?()` | `Map<email, { name, avatar, photo, body }>` (optional) |
| `belts?()` | `Map<email, { belt, since }>` (optional; replaces the belts file) |

`season` is `{ id, kind, year, week, month, start, end }`. Day buckets must be aligned to local
midnight of the configured zone (`localMidnight()` in `server/config.js` helps). Thrown errors may
carry `status` (HTTP), `retryAfter` (seconds) and `cause`; the server turns them into the `error`
object of the API and into its retry back-off. `server/sources/file.js` is the smallest complete
example; `server/sources/mock.js` the most complete one.
