# Changelog

Dates are the day each version went live on the author's panel. Earlier versions were an internal
tool with another name; the open-source release renames it Tokenopolis.

## Unreleased

- Abandoned buildings: after more than 15 days without Claude a building catches fire (soot, flames
  on the roof and out of the windows, smoke), after more than 30 it is a pile of rubble; using Claude
  again puts it back up. `IDLE_FIRE_DAYS` / `IDLE_RUBBLE_DAYS` (0 turns a stage off), `?ruins=0`,
  `idle` on each building and in `/api/config`. The demo's stopped people now stopped 10 to 45 days ago.
- The city on a phone: tools, climb link and language behind ☰, this week's builds folds into a chip,
  City Hall and the building card are drawers at the bottom with the touched building framed above
  them, only city names from afar, no hover tip on touch screens, a lighter canvas.
- The "Now" data map uses ⚡ (🔥 now means a building on fire).

## v25: Tokenopolis 1.0 (open source, 2026-11-06)

- English by default, Brazilian Portuguese selectable in the panel (🌐 switcher, `?lang=`); every
  string lives in `public/i18n/` and the server sends only ids, numbers and dates.
- `APP_NAME`, `LOCALE` and `TIMEZONE` (any IANA zone) configuration; `GET /api/config`.
- Pluggable data sources: Datadog, a JSON file of daily records, or your own module
  (`DATA_SOURCE`); the demo region is built only when first requested.
- The belt program reads `belts.json` at the project root (`BELTS_FILE`), with English belt names.
  White belts count: the city's Dojo appears with the team's first belt and grows with every belt;
  the black pagoda stays for black belts only; the 🥋 map paints each building with its belt color.
- The map key of the data maps no longer hides under the camera bar (both stack in the corner).
- The mayor of the month got a rally in front of the statue (speech, crowd, confetti, a banner with
  the name) instead of the official car; hovering any monument tells what it is and what earns it.
- Privacy: unmatched belt entries and upstream error details no longer reach the browser; optional
  `ID_SALT` for person ids; the climb's fallback model comes from the bundled Rocketbox set.
- Pages and modules renamed (`city.html`, `climb.html`); URL parameters, storage keys and the debug
  globals in English (no backward compatibility: nothing had been published).
- The 2D city page was retired; the 3D city is the home page.
- Dockerfile and docker-compose, MIT license, third-party notices, CI smoke test, documentation.

## v22 (2026-11-04)

- Demo mode (`?demo`) grew into a dense region: about a hundred cities and three thousand buildings,
  every milestone, building type and monument, Dojos at all three levels, overtakes, derbies,
  countdowns and 96 days of history.
- Performance for large regions: instanced crane jibs (draw calls from ~3,600 to ~500), lighter
  tree crowns above 6,000 trees, a 2048 shadow map above 1,500 buildings.

## v21 (2026-11-04)

- Help modal with tabs; the "Links, TV and parameters" tab builds URLs from what is on screen, with
  presets (TV, TV at night, clean, reset) and the table of every parameter.
- First demo mode with nine hand-drawn cities, served next to the real data on the same API paths.
- Fix: on the first load with "my building" saved, the panels could stay empty until the next read.

## v20 (2026-11-04)

- Belt chip on the person's sheet (with the date when known) that opens the city's Dojo sheet.

## v19 (2026-11-04)

- Belt program: black pagodas for black belts, a Dojo that grows into a Temple and a Great Temple,
  the belt count on the city sign, the "Dojo" data map, and a re-read belts file.

## v18 (2026-11-03)

- Highlighted buildings: white outline under the mouse; gold pulsing outline, light beam and ground
  ring on the selected building; search and sheet fly straight to it.

## v17 (2026-11-03)

- Fix: the "you" pin and the floating "+N floors" labels drifted to a screen corner (the animation
  moved the transform the label renderer uses). The sheet moved to the left corner.

## v16 (2026-11-03)

- Only the 3D pages are linked: the climb and the city point at each other.

## v15 (2026-11-03)

- Fix: cranes and meshes doubled at every refresh and memory grew by the minute.

## v14 (2026-11-03): the 3D city

- The region in real 3D (three.js): plots, river with bridges, highways, golden routes, monuments,
  farms, woods; buildings merged per material; the camera flies from region to city and back; sheets,
  tooltips, panels, data maps, newspaper, time-lapse, city race, building timeline, help, news
  ticker; sidewalk crowds, boats, planes, a helicopter, a blimp, a lighthouse beam, the space
  elevator cabin, the mayor's car and a monster; fireworks, confetti, countdown rings and the
  10-billion rocket; windows lit by each person's hours of use; names on façades up close.

## v8–v9 (2026-11-02): giants

- Building types above the skyscraper (supertower, cloud tower, orbital tower, space elevator), city
  styles per milestone, evolving houses, roofs that tell a story, a compressed scale for giants, the
  10-billion club and the milestones beyond Megalopolis, the weekly derby, countdowns, the mayor of
  the month, sidewalk crowds from open sessions, a winding river with boats, golden roads with
  bridges, zoom details, a sun-driven shadow, the regional time-lapse, the building timeline, the
  race of the cities, the "Model" data map, hideable panels and the help modal.

## Before v8 (October 2026)

- The climb: the daily stage on a 3D rock wall, the day's mark as a median of recent winners,
  records as plaques on the rock, badges, the hall of fame and the shareable PNG card.
