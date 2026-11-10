# Features and rules

Two pages share one server and one set of data: the **city** (`/`, `city.html`) and the **climb**
(`climb.html`). Both re-read the API every minute (every 15 s with generated data) and only redraw
what changed. `?demo` on either page shows a fictional region/stage instead of your data.

## The city

**Floors.** Each person is a building in each team (Claude organization) they use. Height is the
tokens that count (`SCORE_TYPES`) accumulated since `CITIES_START`, at `CITY_FLOOR_TOKENS` per floor
(default one million). Teams with fewer than `CITY_MIN_PEOPLE` people are not cities. The week's
contest is the floors built from Monday to Sunday; the total never resets.

**City milestones.** The title of a city follows its total floors and changes the look of all its
buildings and unlocks a perk on the map:

| Floors | Title | Look / perk |
|---|---|---|
| 0 | Village | exposed brick |
| 250 | Town | concrete |
| 1,000 | Capital | blue glass |
| 3,000 | Metropolis | golden art deco |
| 8,000 | Megalopolis | neon and solar roofs |
| 15,000 | Global City | a holographic globe |
| 30,000 | City of the Future | flying cars |
| 60,000 | Mars Colony | a base on Mars |

**Building types.** House (0), townhouse (3), house with pool (7), condo (11), building (15), tower
(150), skyscraper (450), supertower (1,000), cloud tower (2,500, with a lighthouse beam), orbital
tower (5,000) and the space elevator (10,000 floors = 10 billion tokens, with a cable to the sky
and a rocket on the day someone gets there). Roofs tell a story: helipad, garden, antenna, and an
owl sign for night workers. Windows light up by the hours each person actually used.

**Abandoned buildings.** After more than `IDLE_FIRE_DAYS` (15) calendar days without Claude the
building catches fire: soot on the walls, flames on the roof and out of the windows, a column of
smoke. After more than `IDLE_RUBBLE_DAYS` (30) it is a pile of rubble with a broken wall and twisted
beams. Using Claude again puts it back up the same day. The card and the hover tip say how many days;
`0` turns either stage off and `?ruins=0` hides both on one screen. Someone whose last use is older than
`CITIES_START` has no tokens in the window and no building at all.

**Mega Builders and the Corporate District.** Whoever builds in 2 or more cities and adds up
`MEGA_FLOORS` (1,000) floors across them is a Mega Builder: a 💎 badge on the card ("1 billion tokens
in 2+ cities"), a black and gold banner instead of the network flag on their buildings, and a
**campus** in the Corporate District, a remote quarter across a channel behind the cities, reached by
a bridge from the highway. The campus has one wing per city, each rising 1 floor for every 10 floors
there (on the same scale as the buildings, so it grows ten times slower), with the city's name at its
door, a lobby with the person's name, and a golden crown with a diamond on the tallest wing. Choosing a
Mega Builder (on the campus or on one of their buildings) draws golden lines along the streets from
each of their buildings to the campus. The next in line (2+ cities and at least half the line, up to
6) get a foundation with a board showing how far they are. A campus burns and falls into rubble with
its owner, like any building. `?mega=<floors>` moves the line on one screen; `0` hides the district.

**Monuments.** Rewards the city earns, placed on its plots in this order of priority:

| Monument | Requirement |
|---|---|
| 10 Billion Obelisk | 10,000 floors |
| Airport | Megalopolis (8,000 floors) |
| Stadium | 60% of the people building this week |
| Ferris Wheel | 10% growth in one week |
| Central Park | 50 buildings |
| TV Tower | a skyscraper (450 floors) |
| Leadership Statue | leading this week's builds |
| Fountain Square | 3 newcomers in one week |

Weekly feats reset on Monday, so monuments appear during the week.

**Life.** Cranes and scaffolding on buildings that grew this week, people on the sidewalks for open
sessions, boats on the river, planes leaving the airport, a helicopter with a spotlight, a blimp
towing the news, the mayor's rally (a speech on a stage, a crowd and confetti), and a monster (`?monster`, or the Konami code). Fireworks, confetti
and a countdown ring when a city reaches a milestone.

**Panels.** Trophies, this week's builds, the weekly derby (two cities neck and neck), countdowns to
the next milestones, the Mega Builders (with who is next in line), the mayor of the month (most floors last month, with a statue and a rally in front of it), advisors, the
regional newspaper with classifieds, a live ticker of events, the legend, and the city hall sheet
with everyone in the city. Panels hide with 👁️ or the `P` key (`?panels=0`).

**On a phone** (up to 700 px wide) the scene comes first: the tools, the climb link and the language
move behind ☰, this week's builds and the Mega Builders fold into chips, City Hall and the building card are drawers at
the bottom (the touched building is framed above them), the camera bar keeps spin and reframe
(drag to turn, pinch to zoom), and from afar only the city names show. Phones also get a lighter
canvas (pixel ratio 1.25, a 2,048 shadow map).

**Reduced motion.** A device that asks to reduce motion (iOS Reduce Motion, Android "Remove
animations", which some battery savers switch on) keeps the slow everyday life (cars, people, cranes,
flames and smoke, the Ferris wheel, boats, clouds) and drops the bursts: fireworks, sparkles, confetti,
rockets, blinking lights and the monster.

**How old the data is.** The bar shows the date and time of the reading on screen; on a narrow screen
it becomes a short "3 min ago", and the climb shows the same under its clock. When the data source
fails, the warning says when the last good reading was made.

**The top bar on smaller windows.** It never runs off the screen: up to 1,480 px wide it drops the
building and floor counts, up to 1,180 px the date gives way to the short "3 min ago", and up to
1,100 px the tools, the climb link and the language go behind ☰ (the phone's drawer).

**Tools.** 🔍 find a building, 📍 "my building" (a pin that follows you between visits), 🗺️ data
maps (`?map=now|week|network|model|belts`; ⚡ now, 📈 week, 🚩 network, 🧠 model, 🥋 belts), 📰 newspaper, 🎬 history (a time-lapse since day one,
the timeline of a building, and a race of the cities week by week), ❔ help with a tab that builds
URLs for every parameter and preset (TV, TV at night, clean, reset).

**Belt program (optional).** With a `belts.json` (name or e-mail, belt, since), every belt holder
(white to black) joins the city's Dojo, which appears with the team's first belt and grows into a
Temple (3 belts) and a Great Temple (7). Black belts get a black pagoda instead of their building.
The Dojo sheet lists the masters and, only there, who is on the way (white, blue, purple, brown).
The `belts` map paints each building with its belt color and the rest grey.

**URL parameters.** `city`, `person`, `hour` (0–24, fixes the sun), `map`, `style`
(`brick|concrete|glass|deco|neon`), `panels=0`, `names=0`, `quality=low`, `ruins=0`, `monuments=all`,
`monster`, `spin`, `tour` (flies from region to city to city, for TVs), `cam=angle,tilt,distance`,
`giant=N` (test tall buildings), `mega=<floors>` (the Mega Builders' line), `demo`, `lang`, `debug`. The help modal documents all of them.

## The climb

**Season.** Weekly by default (Monday 00:00 to Sunday 23:59 in `TIMEZONE`); `SEASON_LENGTH=month`
switches to months. The season total is the overall ranking: the champion, badges and the hall of
fame are per season. Only the top `TOP_N` (25) are drawn; the rest "warm up at base camp". People
under `MIN_TOKENS` (scaled by how far the season has run) are below the cut.

**Altitude.** Season tokens divided by the summit, mapped from 5,364 m (base camp) to 8,848 m, with
camps 1–4 at Everest's real altitudes. The summit is `SUMMIT_TOKENS`, else the previous champion's
total, else a projection of the leader. The **sherpa** is a ghost climbing at the exact pace needed
to reach the summit on the last day; the 🟡 yellow jersey marks the leader.

**Daily stage.** The wall shows today: everyone starts at base camp at midnight and climbs by the
tokens used today, on a linear scale up to the **day's mark**, the median of the winners of the
last `STAGE_MARK_DAYS` (10) workday stages (holidays with fewer than half the usual people are
skipped; `STAGE_MARK_TOKENS` fixes a value; with fewer than 3 stages, 1.2× today's leader). Up to 25
people are on the wall: those who scored today, completed by the top of the season still asleep.
At midnight everyone abseils down and sleeps until their first token.

**States.** Climbing: tokens in the last 15 minutes (more than 20k, in 1-minute buckets). Resting:
used today, not in the last 15 minutes. Sleeping: nothing yet today. The pace is the last hour's
tokens; a chalk trail links where the person was an hour ago to where they are now.

**Records.** From the same 91-day history the mark uses, closed stages only: best stage, best full
week, best stage on this weekday, the last 5 stage winners, and everyone's personal best. They
become plaques on the rock.

**Badges.**

| | Badge | Rule |
|---|---|---|
| 👑 | Reigning Champion | won last season |
| 🚩 | Planted the Flag | reached the summit |
| 🧭 | Ahead of the Sherpa | on pace for the summit |
| 🔥 | On Fire | 5+ days in a row (weekends neither count nor break it) |
| 🚀 | Rocket | biggest climb of the day (unique) |
| 🧊 | Cache Master | highest cache-read share (unique) |
| 🏃 | Marathoner | most sessions (unique) |
| 🎯 | Surgical | fewest tokens per session, min. 10 sessions (unique) |
| 🗣️ | Chatterbox | most output tokens (unique) |
| 🐣 | Rookie | did not score last season and is already in the top |
| 🏅 | Stage Winner | won at least one daily stage this season |

Marathoner and Surgical need the sessions metric; automated accounts (50+ sessions under 50k tokens
each) are left out of those two.

**Screen.** A live ticker narrates overtakes, camp arrivals, new badges and a new leader (banner and
confetti). Zoom levels Top 5 / 10 / 25 / whole wall (keys 1–4, `?zoom=`), name cards (`N`,
`?names=0`), the ranking list with Today and Week tabs (`R`, `T`, `?board=0`, `?tab=week`), plaques
(`?plaques=0`), `?hour=` to fix the light, `?tour` to cycle zoom levels on a TV, `?quality=low` for
weak machines. A shareable vertical PNG card of any climber (position, today's tokens, badges, the
jersey).

## Demo mode

`?demo` serves a fictional region next to your data: a hundred cities, about three thousand
buildings, every milestone, building type and monument, Dojos at all three levels, mayors, newcomers,
night owls, people in two or three cities (seven of them Mega Builders), an overtake and a derby this week, countdowns, and 96
days of history. The pill "demo · fictional data" shows while it is on.

## Keyboard

City: `P` panels, `G` spin, `?` help, `Esc` back to the region. Climb: `1`–`4` zoom, `N` names,
`R` ranking, `T` tab, `F` next person, `Home`/`End` summit/base, arrows and `+`/`−` to move.
