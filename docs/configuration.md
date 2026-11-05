# Configuration

Everything is read once at startup from `.env` (and the process environment). Copy `.env.example`
to `.env`; every value has a default. An empty value counts as "not set".

## Appearance and language

| Variable | Default | Meaning |
|---|---|---|
| `APP_NAME` | `Tokenopolis` | Name in titles, headers, the share card and the password prompt (the prompt gets it reduced to ASCII) |
| `LOCALE` | `en` | Language for first-time visitors: `en` or `pt-BR`. Visitors switch with 🌐 or `?lang=`; the choice is remembered per browser |
| `TIMEZONE` | the host's zone | IANA name (`America/Sao_Paulo`, `Europe/Lisbon`…). Days, weeks and months use the zone's UTC offset, recomputed at every refresh. An invalid name logs a warning and falls back to UTC |

## Data source

| Variable | Default | Meaning |
|---|---|---|
| `DATA_SOURCE` | auto | `datadog`, `mock`, `demo`, `file`, or a path to a module exporting `createSource(config)`. Auto = `datadog` when Datadog credentials exist, else `mock` |
| `MOCK` / `--mock` | | Shortcut for `DATA_SOURCE=mock` |
| `DATA_FILE` | `data.json` | Records file for `DATA_SOURCE=file` ([format](data-sources.md#file)) |
| `DD_ACCESS_TOKEN` | | Datadog Personal/Service Access Token (`ddpat_…`/`ddsat_…`) that can run metric queries; also accepted when pasted into `DD_APP_KEY` |
| `DD_API_KEY`, `DD_APP_KEY` | | The classic key pair, used when no token is set |
| `DD_SITE` | `datadoghq.com` | `datadoghq.eu`, `us3.datadoghq.com`, `us5.datadoghq.com`, `ap1.datadoghq.com`… |
| `DD_FILTER` | `*` | Tag scope of every query (`team:platform`, `service:claude-code`) |
| `DD_USER_TAG` | `user.email` | Tag that identifies a person |
| `DD_TYPE_TAG` | `type` | Token-type tag |
| `DD_ORG_TAG` | `organization.id` | Tag that identifies a team (a city) |
| `DD_MODEL_TAG` | `model` | Model tag (the "Model" map) |
| `METRIC_TOKENS` | `claude_code.token.usage` | Token metric |
| `METRIC_SESSIONS` | `claude_code.session.count` | Sessions metric (optional; feeds Marathoner, Surgical and the sidewalks) |

## Scoring and seasons

| Variable | Default | Meaning |
|---|---|---|
| `SCORE_TYPES` | `input,output,cachecreation` | Token types that count towards altitude and floors; `all` = every type. Cache reads are out by default (most of the volume, and they measure re-reading, not new work) |
| `MIN_TOKENS` | `0` | Minimum scoring tokens to be in the season ranking, scaled by how far the season has run |
| `TOP_N` | `25` | People drawn on the mountain |
| `SEASON_LENGTH` | `week` | `week` (Monday–Sunday) or `month` |
| `SUMMIT_TOKENS` | | Fixed summit; empty = previous champion's total, else a projection |
| `HALL_OF_FAME_SIZE` | `3` | Past seasons shown |
| `STAGE_MARK_TOKENS` | | Fixed daily mark; empty = median of the last `STAGE_MARK_DAYS` workday winners |
| `STAGE_MARK_DAYS` | `10` | Workday stages in that median |

## The city

| Variable | Default | Meaning |
|---|---|---|
| `CITIES_START` | 90 days ago | Local date (`YYYY-MM-DD`) from which floors accumulate. Set it to your rollout date and keep it: moving it changes every building |
| `CITY_FLOOR_TOKENS` | `1000000` | Tokens per floor |
| `CITY_MIN_PEOPLE` | `5` | Teams with fewer people are not cities (personal accounts) |
| `CITY_NAMES` | | Display names per organization id, whole or prefix: `a1b2c3d4=Platform,e5f6a7b8=Data`. Unnamed teams show as "Team A1B2" |

## People, access and privacy

| Variable | Default | Meaning |
|---|---|---|
| `TEAM_FILE` | `team.json` | JSON array of e-mails that take part; without the file, everyone in the filter does |
| `NICKNAMES_FILE` | `nicknames.json` | Per e-mail: `name`, `avatar` (emoji), `photo` (https URL or a file in `public/avatars/`), `body` (`m`, `f` or a model id from `public/models/climbers.json`) |
| `BELTS_FILE` | `belts.json` | The belt program: `{ "belts": [{ "name" or "email", "belt": "blue"\|"purple"\|"brown"\|"black", "since": "YYYY-MM-DD" }] }`. Re-read when it changes |
| `ANONYMIZE` | `false` | Shows people as "Swift Llama" (stable per person); photos are hidden |
| `ID_SALT` | | Salt mixed into the short person ids the browser sees. Set it once before going live: changing it changes every id (saved "my building", shared `?person=` links) |
| `PANEL_PASSWORD` | | Basic-auth password for the whole panel (the user name is ignored). Without HTTPS it crosses the network in the clear |

## Server

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REFRESH_SECONDS` | `60` (Datadog) / `15` | Seconds between refreshes; minimum 15 with Datadog, 5 otherwise. On errors the server backs off up to 15 minutes and keeps the last good state on screen |

Local files (`team.json`, `nicknames.json`, `belts.json`, `data.json`, `.env`, `public/avatars/*`)
are ignored by git. Examples live next to them (`*.example.json`).
