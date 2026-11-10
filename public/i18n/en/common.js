// Shared strings of both pages: names, catalogs (tiers, monuments, badges, belts, models, map
// modes, styles, camps), word lists, periods, errors and the page navigation. Catalog entries carry
// their explicit forms (name, a, lower, plural); never derive them with toLowerCase().

const million = (tokens) => `${(tokens / 1e6).toLocaleString('en')} million`;

export default {
  page: { title: '{appName}' },

  city: { unnamed: 'Team {code}' },
  anon: {
    // Same order as the server's avatar list (the index is the animal of the anonymized name).
    animals: ['Goat', 'Llama', 'Polar Bear', 'Eagle', 'Penguin', 'Fox', 'Wolf', 'Panda', 'Koala', 'Owl',
      'Tiger', 'Lion', 'Frog', 'Monkey', 'Raccoon', 'Beaver', 'Bison', 'Hedgehog', 'Turtle', 'Otter',
      'Octopus', 'Unicorn', 'Dragon', 'T-Rex', 'Whale', 'Flamingo', 'Bee', 'Crab', 'Ladybug', 'Seal',
      'Squirrel', 'Sloth', 'Leopard', 'Kangaroo', 'Caiman'],
    adjectives: ['Swift', 'Bold', 'Brave', 'Nimble', 'Clever', 'Tenacious', 'Unstoppable', 'Radiant',
      'Fearless', 'Legendary', 'Fierce', 'Electric', 'Cosmic', 'Turbo', 'Supreme'],
    name: ({ animal, adjective, n }) => `${adjective} ${animal}${n ? ` ${n}` : ''}`,
    unknown: 'Someone',
  },

  badge: {
    champion: { icon: '👑', name: 'Reigning Champion', desc: 'Won last season' },
    summit: { icon: '🚩', name: 'Planted the Flag', desc: 'Reached the summit this season' },
    sherpa: { icon: '🧭', name: 'Ahead of the Sherpa', desc: 'On pace to reach the summit by the end of the season' },
    streak: { icon: '🔥', name: 'On Fire', desc: '5 or more days in a row climbing' },
    rocket: { icon: '🚀', name: 'Rocket', desc: 'Biggest climb of the day' },
    cache: { icon: '🧊', name: 'Cache Master', desc: 'Highest cache reuse (cache read)' },
    marathon: { icon: '🏃', name: 'Marathoner', desc: 'Most sessions opened this season' },
    surgical: { icon: '🎯', name: 'Surgical', desc: 'Fewest tokens per session (min. 10 sessions)' },
    chatty: { icon: '🗣️', name: 'Chatterbox', desc: 'Most output tokens generated' },
    rookie: { icon: '🐣', name: 'Rookie', desc: 'Did not score last season and is already in the top' },
    stage: { icon: '🏅', name: 'Stage Winner', desc: 'Won at least one daily stage this week' },
  },

  belt: {
    white: { icon: '⚪', name: 'White belt', a: 'a white belt', lower: 'white belt', plural: 'white belts' },
    blue: { icon: '🔵', name: 'Blue belt', a: 'a blue belt', lower: 'blue belt', plural: 'blue belts' },
    purple: { icon: '🟣', name: 'Purple belt', a: 'a purple belt', lower: 'purple belt', plural: 'purple belts' },
    brown: { icon: '🟤', name: 'Brown belt', a: 'a brown belt', lower: 'brown belt', plural: 'brown belts' },
    black: { icon: '⚫', name: 'Black belt', a: 'a black belt', lower: 'black belt', plural: 'black belts' },
  },
  dojoLevel: {
    dojo: { name: 'Dojo', a: 'a Dojo', lower: 'dojo', plural: 'dojos' },
    temple: { name: 'Temple', a: 'a Temple', lower: 'temple', plural: 'temples' },
    greatTemple: { name: 'Great Temple', a: 'a Great Temple', lower: 'great temple', plural: 'great temples' },
  },

  model: {
    opus: { name: 'Opus', lower: 'Opus' },
    sonnet: { name: 'Sonnet', lower: 'Sonnet' },
    haiku: { name: 'Haiku', lower: 'Haiku' },
    fable: { name: 'Fable', lower: 'Fable' },
    other: { name: 'Other models', lower: 'other models' },
  },

  tier: {
    // City milestones; `perk` is what the milestone unlocks on the map.
    city: {
      village: { name: 'Village', a: 'a village', lower: 'village', plural: 'villages', perk: 'exposed brick' },
      town: { name: 'Town', a: 'a town', lower: 'town', plural: 'towns', perk: 'concrete buildings' },
      capital: { name: 'Capital', a: 'a capital', lower: 'capital', plural: 'capitals', perk: 'blue glass towers' },
      metropolis: { name: 'Metropolis', a: 'a metropolis', lower: 'metropolis', plural: 'metropolises', perk: 'golden art deco' },
      megalopolis: { name: 'Megalopolis', a: 'a megalopolis', lower: 'megalopolis', plural: 'megalopolises', perk: 'neon and solar roofs' },
      globalCity: { name: 'Global City', a: 'a global city', lower: 'global city', plural: 'global cities', perk: 'a holographic globe' },
      futureCity: { name: 'City of the Future', a: 'a city of the future', lower: 'city of the future', plural: 'cities of the future', perk: 'flying cars' },
      marsColony: { name: 'Mars Colony', a: 'a Mars colony', lower: 'Mars colony', plural: 'Mars colonies', perk: 'a base on Mars' },
    },
    building: {
      house: { name: 'House', a: 'a house', lower: 'house', plural: 'houses' },
      townhouse: { name: 'Townhouse', a: 'a townhouse', lower: 'townhouse', plural: 'townhouses' },
      poolHouse: { name: 'House with pool', a: 'a house with a pool', lower: 'house with pool', plural: 'houses with pools' },
      condo: { name: 'Condo', a: 'a condo', lower: 'condo', plural: 'condos' },
      building: { name: 'Building', a: 'a building', lower: 'building', plural: 'buildings' },
      tower: { name: 'Tower', a: 'a tower', lower: 'tower', plural: 'towers' },
      skyscraper: { name: 'Skyscraper', a: 'a skyscraper', lower: 'skyscraper', plural: 'skyscrapers' },
      supertower: { name: 'Supertower', a: 'a supertower', lower: 'supertower', plural: 'supertowers' },
      cloudTower: { name: 'Cloud Tower', a: 'a cloud tower', lower: 'cloud tower', plural: 'cloud towers' },
      orbitalTower: { name: 'Orbital Tower', a: 'an orbital tower', lower: 'orbital tower', plural: 'orbital towers' },
      spaceElevator: { name: 'Space Elevator', a: 'a space elevator', lower: 'space elevator', plural: 'space elevators' },
    },
  },

  monument: {
    obelisk: { name: '10 Billion Obelisk', a: 'a 10 Billion Obelisk', lower: '10 billion obelisk', plural: '10 billion obelisks', req: 'reach 10 billion tokens (10,000 floors)' },
    airport: { name: 'Airport', a: 'an airport', lower: 'airport', plural: 'airports', req: 'become a Megalopolis (8,000 floors)' },
    stadium: { name: 'Stadium', a: 'a stadium', lower: 'stadium', plural: 'stadiums', req: '60% of the people building this week' },
    ferrisWheel: { name: 'Ferris Wheel', a: 'a Ferris wheel', lower: 'Ferris wheel', plural: 'Ferris wheels', req: 'grow 10% in one week' },
    centralPark: { name: 'Central Park', a: 'a central park', lower: 'central park', plural: 'central parks', req: 'reach 50 buildings' },
    tvTower: { name: 'TV Tower', a: 'a TV tower', lower: 'TV tower', plural: 'TV towers', req: 'have a skyscraper (450 floors)' },
    leadershipStatue: { name: 'Leadership Statue', a: 'a Leadership Statue', lower: 'leadership statue', plural: 'leadership statues', req: 'lead the week’s builds' },
    mayor: { name: 'Mayor’s rally', a: 'a mayor’s rally', lower: 'mayor’s rally', plural: 'mayor’s rallies', req: 'whoever built the most in the city last month' },
    fountainSquare: { name: 'Fountain Square', a: 'a fountain square', lower: 'fountain square', plural: 'fountain squares', req: '3 newcomers in one week' },
  },

  // Data maps of the city; `legend` follows the colors of MAPKEYS, in order.
  map: {
    default: { name: 'Normal', title: 'Normal', desc: 'the city as it is' },
    now: { name: 'Now', title: 'Now', desc: 'who is building right now', legend: ['building now', 'worked today', 'idle'] },
    week: { name: 'This week’s builds', title: 'This week’s builds', desc: 'from cold (nothing) to hot (biggest build)', legend: ['nothing', 'a little', 'average', 'a lot', 'the biggest'] },
    network: { name: 'Network', title: 'Network', desc: 'who builds in more than one city', legend: ['💎 Mega Builder', '3 cities or more', '2 cities', '1 city'] },
    model: { name: 'Model', title: 'Most used model (7 days)', desc: 'the model each person used most this week', legend: ['Opus', 'Sonnet', 'Haiku', 'Fable', 'other or no data'] },
    belts: { name: 'Dojo', title: 'Dojo', desc: 'everyone’s belt in the Dojo', legend: ['black', 'brown', 'purple', 'blue', 'white', 'no belt'] },
    health: { name: 'Health', title: 'Health: days without Claude', desc: 'how long since each building was used', legend: ['used today', 'stopped for a few days', 'close to catching fire', 'on fire', 'rubble'] },
  },
  style: {
    brick: { name: 'Exposed brick', lower: 'exposed brick' },
    concrete: { name: 'Concrete', lower: 'concrete' },
    glass: { name: 'Blue glass', lower: 'blue glass' },
    deco: { name: 'Art deco', lower: 'art deco' },
    neon: { name: 'Futuristic neon', lower: 'futuristic neon' },
    global: { name: 'White stone and sea glass', lower: 'white stone and sea glass' },
    future: { name: 'Chrome and violet', lower: 'chrome and violet' },
    mars: { name: 'Martian terracotta', lower: 'Martian terracotta' },
  },

  mountain: { name: 'Context Peak' },
  camp: {
    base: { name: 'Base Camp', lower: 'base camp' },
    camp: { name: 'Camp {n}', lower: 'camp {n}' },
    summit: { name: 'Summit', lower: 'the summit' },
  },

  period: {
    day: { name: 'Day', lower: 'day', plural: 'days' },
    week: { name: 'Week', lower: 'week', plural: 'weeks' },
    month: { name: 'Month', lower: 'month', plural: 'months' },
    season: { name: 'Season', lower: 'season', plural: 'seasons' },
    stage: { name: 'Stage', lower: 'stage', plural: 'stages' },
    today: 'today',
    yesterday: 'yesterday',
    tomorrow: 'tomorrow',
    thisWeek: 'this week',
    lastWeek: 'last week',
    thisMonth: 'this month',
    lastMonth: 'last month',
  },
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  // Sunday first, like Date#getUTCDay().
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  date: {
    // "since August 1" (the start of the count, config.start); without it, "since the start".
    since: ({ day, month }) => (day ? `since ${month} ${day}` : 'since the start'),
  },
  clock: { in: 'in {zone}' },
  // how old the reading on screen is
  age: { now: 'just now', min: '{n} min ago', hours: '{n} h ago', title: 'Data read: {time}', label: 'Data: {age}' },

  // Shared counts, through plural(n, 'count.floor').
  count: {
    floor: { one: '{n} floor', other: '{n} floors' },
    building: { one: '{n} building', other: '{n} buildings' },
    person: { one: '{n} person', other: '{n} people' },
    city: { one: '{n} city', other: '{n} cities' },
    day: { one: '{n} day', other: '{n} days' },
    week: { one: '{n} week', other: '{n} weeks' },
    session: { one: '{n} session', other: '{n} sessions' },
  },

  legend: {
    floor: ({ tokens = 1e6 }) => `1 floor = ${tokens >= 1e6 && tokens % 1e6 === 0 ? million(tokens) : tokens.toLocaleString('en')} tokens`,
  },

  // The `error` object of the API (docs/contract.md).
  error: {
    upstream: ({ status }) => `The data source answered with an error${status ? ` (HTTP ${status})` : ''}`,
    timeout: 'The data source took too long to answer',
    rate_limited: ({ retryAfter }) => `Too many requests to the data source${retryAfter ? `; trying again in ${retryAfter} s` : ''}`,
    auth: 'The data source rejected the credentials',
    config: 'The data source is not configured',
    unknown: 'Unexpected error while reading the data',
    offline: 'Could not reach the server',
    webgl: 'This browser could not start 3D graphics (WebGL), so the city cannot be drawn. Try another browser, or turn on hardware acceleration in its settings.',
    stale: 'showing the last reading',
    lastReading: 'last reading: {time}',
  },

  nav: {
    city: { label: '🏙️ {appName}', title: 'Open {appName}' },
    climb: { label: '🏔️ Token Climb', title: 'Open the Token Climb' },
  },
  switcher: { aria: 'Language', en: 'English', pt: 'Português (Brasil)' },
};
