# Changelog

Dates are the day each version went live on the author's panel. Earlier versions were an internal
tool with another name; the open-source release renames it Tokenopolis.

## v31 (2026-11-10)

- The page times its first seconds and, under 38 frames a second, merges the region into one piece by
  itself (the per-city pieces cost draw calls a weak machine or a TV may not have). `?parts=1` keeps
  one piece per city whatever the speed.

## v30 (2026-11-10)

- The address follows the screen: the city, the building (or the Dojo, `dojo`, or a headquarters,
  `hq=<id>`), the data map and a fixed hour go to the URL as you move, so Back returns to where you
  were and a reload opens the same screen. `?person=<id>` alone opens the person's tallest building.
- City Hall lists everyone: "See everyone" opens the whole city, sorted by floors, this week, today or
  days stopped, with a filter by name. The finder finds cities too.
- The card shows the race around the building: its place in the week's builds, how many floors to
  pass whoever is just above, last week against this one, and how long until it catches fire.
- First visit: an invitation to find your building and mark it as yours (once per browser, never on
  a TV link).
- The city and the climb know each other's people: "See on the climb" on the card,
  "🏙️ Building" on a climber's tag, `climb.html?person=<id>`, and the building marked as yours in the
  city is marked on the wall and in the ranking.
- Breathing room for small buildings: a gentle rise at the base, so a 20-floor building no longer
  looks like a 50-floor one (and both no longer sit lower than a townhouse) next to a giant. More
  floors is still always taller.
- The sky has a sun and a moon that cross it with the hour, brightens toward them, and its clouds
  take the color of dusk and of the night.
- Night: the ground darkens with everything else (it stayed bright green), street lamps cast a pool
  of light, the glow keeps the edges smooth, and the shadow pass rests while the sun is down.
- The ground: a soft shadow at the foot of every building, crosswalks at the crossings, a grain on
  the grass.
- The region's mission: the whole region against last week's floors plus `MISSION_GROWTH` % (10), with
  a bar under the week's builds and fireworks when it is met (`mission` in `/api/cities`).
- The TV tour says what is on screen (the stop and its numbers, in big letters) and holds for a
  minute when someone touches the screen.
- The building's card: a PNG with the building framed and the person's numbers, to download or, where
  the browser can, to copy.
- The climb shows the season's badges on each climber's tag (the server always worked them out).
- A new data map, 🚒 Health (`?map=health`): green for buildings used today, then yellow, orange close
  to the fire, red on fire and dark for rubble. Every map's key now counts the buildings of each color.
- The numbers as a spreadsheet: "⬇️ CSV" for a city (in City Hall's full list) and for the whole
  region (under this week's builds), one line per building.
- Pages, scripts and API answers go out gzipped (the cities' reading shrinks to about a tenth).
- Tests (`npm test`, in CI): the two languages have the same keys, no key is defined twice, and the
  rules for tiers, abandoned buildings and Mega Builders.
- three.js is served by the panel itself (`public/vendor/three/`, r160, unmodified) instead of a
  CDN: the pages open on a network that blocks outside sites.
- 🔔 Notices: the notices of the visit stay in a list, with the week's diary (worked out from the
  record, so it is there for whoever was not watching). The news ticker's items are clickable.
- Keyboard: `/` opens the finder, every button and panel row is reachable with Tab and shows a focus
  ring, the arrows (and Home/End) walk the rows of a list or a menu, dialogs take the focus, keep it inside and give it back.
- City signs keep a readable size from afar and no longer pile up (the nearer city's stays); a text
  size (A, A+, A++) for panels and signs in the 👁️ list.
- Phone: finger-sized rows in the drawers and lists; a drawer goes down with a swipe.
- Mid-size windows (701 to 900 px): this week's builds and the Mega Builders fold into chips, as on a
  phone, instead of the Mega Builders vanishing. On a short window the Mega Builders list scrolls
  instead of running under the derby.
- The card shows the person's habits: the hours of the day they build (last 7 days), the models
  they use and on how many of the last 30 days they built (`clock` and `models` in `/api/cities`).
- A look of their own for the three biggest city titles (they shared the Megalopolis's neon): white
  stone and sea-green glass for the Global City, chrome and violet for the City of the Future,
  Martian terracotta for the Mars Colony (`?style=global|future|mars`).
- Living water (glints drifting over the river and the channel, and the sky's color in it), trees of
  three shapes, and fields and rounded hills beyond the map instead of a flat green and cones.
- Back from the ashes: a building used again after it had caught fire gets balloons, confetti, a
  notice and a line in the news (`back` in `/api/cities`). Fire trucks at some burning buildings;
  rubble closed off with trestles and tape, with weeds around it.
- New roofs: an infinity pool on the day of a personal record (`record`), a zen garden in the week
  of a new belt. Buildings got a street level (a ledge, doors, a canopy).
- "🏙️ Rooftop view" on the card: the camera stands on the building's roof and looks at the city.
- A new floor redraws only its city: each city is a piece of the scene of its own (up to 24 cities;
  the Corporate District is another), and the land (ground, water, trees, lamps, cars) is redrawn only
  when the map's layout changes. With the author's data a change in one city went from about 830 ms
  to about 115 ms. It costs more draw calls per frame; `?parts=0` goes back to one piece.
- Mid-size windows up to 1,300 px: the right column folds into chips (this week's builds start open).

## v29 (2026-11-10)

- "Copy link" works on a panel served over plain http (a browser offers no clipboard there, and the
  button did nothing); when nothing works, the link shows in a box to copy by hand. The climb offers
  "Copy image" only where the browser can do it.
- 🌗 "Automatic" goes back to the real time on a page that was opened with `?hour=`.
- How old the data is: "3 min ago" in the bar of a narrow screen (where the date had no room) and under
  the climb's clock; a failed reading says when the last good one was made.
- Choosing a campus, a foundation or a temple no longer covers it with a golden box: an outline, a
  golden frame on the ground and the ring, sized to the lot. The box on buildings is lighter.
- The top bar no longer runs off the right edge on a laptop or a tablet (it cut the language switch and
  the climb link below about 1,400 px): it sheds the counts, then the date, and up to 1,100 px the
  tools go behind ☰. A long notice shrinks before the title does, with its whole text on hover.
- Screens 701 to 900 px wide: this week's builds keeps the city names (the bar gives way), and the
  camera bar no longer sits on top of the news ticker.
- The notice of a failed reading stays up when the panels are drawn again (it vanished on the next click).
- The city reads the API as often as the server refreshes (`REFRESH_SECONDS`), no longer every 60 s
  whatever the setting.
- A sessions query that fails keeps its last result for up to 30 minutes instead of counting as zero
  (empty sidewalks, missing session badges).
- A browser without WebGL gets a message instead of "Building the region…" forever.
- The 10-billion rocket frees its smoke. `docs/contract.md` and `docs/data-sources.md` match the code.

## v28 (2026-11-09)

- Mega Builders: whoever builds in 2+ cities and adds up 1,000 floors across them (`MEGA_FLOORS`,
  `?mega=`, `mega` in `/api/config`) gets a 💎 badge, a black and gold banner on their buildings and a
  campus in the new Corporate District, across a channel behind the cities: one wing per city, 1 floor
  for every 10 there, the diamond on the tallest wing. Choosing one draws golden lines along the
  streets from their buildings to the campus. The next in line get a foundation with a progress board.
  A Mega Builders panel (a chip on phones), a card for each campus, 💎 in search and City Hall, and
  their own color on the network map.
- The mayor's rally banner no longer leaves a texture behind every time the scene is redrawn (a TV
  left on all day kept growing its memory); signs drawn on a canvas are now kept per text and freed
  when no longer drawn.
- This week's builds shows 12 rows (was 14) to make room for the Mega Builders.

## v27 (2026-11-06)

- A device that asks to reduce motion (common on phones, sometimes switched on by battery savers) no
  longer freezes the city: cars, people, cranes, flames and smoke keep moving; only fireworks,
  sparkles, confetti, rockets, blinking lights and the monster stay off.

## v26 (2026-11-06)

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
