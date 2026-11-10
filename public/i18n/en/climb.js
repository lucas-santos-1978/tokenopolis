// Runtime strings of the climb (HUD, board, tags, signs, ticker, plaques, card, ruler).
// Numbers arrive already formatted with `fmt` ({tokens}, {pace}, {meters}, {pct}…); plurals take
// the number as displayed. Strings carry their own non-breaking spaces where a number and its unit
// must not wrap (the share card wraps on plain spaces only).

export default {
  // State of a climber in the stage (tags, board, card)
  state: {
    lastHour: ' · {tokens} in the last hour',
    restingFor: 'resting for {time}{hour}',
    resting: 'resting{hour}',
    restingOver15: 'resting for over 15 min',
    restingOver1h: 'resting for over 1 h',
    noTokensToday: 'no tokens today',
    inWeek: 'this week',
    inMonth: 'this month',
  },

  // Where the mark of the day comes from
  mark: {
    fixed: 'fixed mark',
    fallback: 'estimate (too few stages for the median yet)',
    median: { one: 'the last stage', other: 'median of the last {n} stages' },
  },

  // The stage of the day ({weekday} from fmt.weekday)
  stage: {
    title: '{weekday}’s stage',
  },

  // Gap to whoever is right above (second line of a tag)
  gap: {
    leftToMark: '{tokens} to the mark',
    leftToSummit: '{tokens} to the summit',
    tie: 'tied with #{rank} (Δ {tokens})',
    behind: '{tokens} behind #{rank}',
    markIn: '{tokens} to the mark',
    summitIn: '{tokens} to the summit',
  },

  person: { notOnWall: '{name} is not on the wall today', unknown: 'That person is not in this season’s ranking' },
  // Climber tags and ranking plates
  tag: {
    card: '📸 Card',
    cardTitle: 'Card to share on Teams/Slack (C key)',
    city: '🏙️ Building',
    cityTitle: 'See this person’s building in the city',
    zzz: 'z z z',
    resting: 'resting',
    todayState: '{tokens} today · {state}',
    pastMark: '{flag} +{tokens} past the mark',
    pastSummit: '{flag} +{tokens} past the summit',
    tie: ' (tie)',
  },

  // Signs: the summit sign at the top, the base camp and the empty wall ({src} and {stage} may be HTML-escaped)
  sign: {
    markOfDay: '🏁 Mark of the day: {mark}',
    noOneYet: '{src} · {stage}: nobody has climbed yet (starts at midnight)',
    passed: { one: '{name} passed the mark of the day', other: '{n} people passed the mark of the day' },
    leaderPast: 'leader +{tokens} past · mark {mark} ({src})',
    leaderTo: '{src} · leader {tokens} away ({pct})',
    below: '+{n} below #{rank}',
    belowToday: '+{n} <span class="wide">with tokens today </span>below #{rank}',
    baseStage: 'the stage starts at midnight · {zero}',
    emptyStage: '{stage}: nobody has climbed yet',
    emptyStageSub: 'the first token of the day shows up here',
    emptySeason: 'Nobody has climbed yet this season',
    emptySeasonSub: 'the first token shows up here',
    summitTaken: { one: '🚩 Summit reached by {n} person · leader +{tokens} past', other: '🚩 Summit reached by {n} people · leader +{tokens} past' },
    summitAbove: '= {pct} above {ref} ({tokens})',
    ref: { record: 'the record', projection: 'the projection', summit: 'the summit' },
    summitIn: '▲ Summit {tokens} above the leader',
    summitInSub: '{meters} of mountain to go',
    campStage: '{tokens} · {pct} of the mark',
  },

  // Ranking list (the "Week" tab label and its title come from html.board.*)
  board: {
    month: 'Month',
    monthTitle: 'Overall standings of the month (T switches)',
    emptyWeek: 'The week began at midnight on Monday: nobody has scored yet.',
    emptyMonth: 'The month began at midnight on the 1st: nobody has scored yet.',
    champWeek: ' Last week’s champion: {name}.',
    champMonth: ' Last month’s champion: {name}.',
    stagesWon: { one: '{n} stage won', other: '{n} stages won' },
    jersey: '🟡 yellow jersey',
    todayRank: '#{rank} in today’s stage (click to see up close)',
    todayShort: 'today #{rank}',
    notOnWall: 'not on the wall today',
    offFrame: 'off the frame',
    clickHint: ' (click to see up close)',
    cardTitle: 'Card to share (C key with the chosen person)',
    belowCut: '{n} below the cut ({tokens} {period})',
    cutTitleWeek: 'The week’s standings only count those past the cut, which grows with the period. Today’s stage counts everyone.',
    cutTitleMonth: 'The month’s standings only count those past the cut, which grows with the period. Today’s stage counts everyone.',
    withTokensToday: '{n} with tokens today',
  },

  zoom: {
    all: 'Everyone',
  },

  // Short messages at the top of the screen
  toast: {
    cardHint: '📸 Click someone on the wall and press C to make the card',
    cardOnlyWall: '📸 The card is for people on today’s stage wall',
    newMark: 'New mark of the day: {mark} · 1 body ≈ {body}',
    newScale: 'New scale: 1 body ≈ {body}',
    newStage: '🌙 {stage} has begun: everyone goes back to base camp',
  },

  // LIVE strip: events of the stage ({who} is a first name) and the highlights that rotate
  ticker: {
    newStage: '🌙 {stage} has begun: everyone rappels down to base camp',
    pb: '⭐ {who} beat their personal best ({tokens})',
    passedMark: '🏅 {who} passed the mark of the day ({mark})!',
    camp: '⛺ {camp} ({tokens}): {who} made it',
    started: '☀️ {who} started climbing today',
    leads: '🥇 {who} leads the stage (passed {other})',
    overtook: '🔼 #{rank} of the stage: {who} passed {other}',
    empty: '💤 {stage}: nobody has climbed yet · the stage began at midnight',
    fastest: '🚀 Biggest climb of the last hour: {who}, +{tokens}',
    fastestWall: '🚀 Biggest climb of the last hour on the wall: {who}, +{tokens}',
    climbingNow: { one: '🧗 {n} person climbing now, out of {active} with tokens today', other: '🧗 {n} people climbing now, out of {active} with tokens today' },
    climbingWall: '🧗 {n} of the {total} on the wall climbing now',
    leaderPast: '🏅 {who} leads the stage, {tokens} past the mark',
    leaderAt: '🥇 {who} leads the stage: {tokens} ({pct} of the mark)',
    jersey: '🟡 {who} wears the yellow jersey: {tokens} {period}{wins}',
    mark: '🏁 Mark of the day: {mark} · {src}',
  },

  // Duels: who catches the one above in less than 90 min ({eta}: "~15 min")
  duel: {
    text: '⚔️ #{rank} catches #{up} in {eta}',
  },

  // Arrow on the screen edge when someone off the frame climbed (manual camera)
  edge: {
    climbed: { one: '{arrow} #{rank} climbed +{tokens}', other: '{arrow} {n} climbed · biggest: #{rank} +{tokens}' },
  },

  hint: {
    closeUp: 'See up close',
  },

  // HUD: in the stage the week shows without the year
  hud: {
    week: 'Week {n}',
  },

  // Record plaques on the rock: the summit mural, the plates of the latest stages and the pitons
  records: {
    title: 'Records',
    titleSince: 'Records (since {month})',
    stage: 'Stage',
    week: 'Week',
    weekOf: 'week of {date}',
    weekdayRecord: '{weekday} record',
    timesMark: '{x}× the mark',
    above: 'above',
    aboveToday: ' ({tokens} above today’s mark)',
    plateTip: '{stage}: {tokens}{above}\n🏅 won by: {name}',
    pb: 'best: {tokens}',
    pbNew: '⭐ new best · was {tokens}',
  },

  // Token ruler on the side of the wall (2D canvas)
  ruler: {
    tick: '{n} M',
    base: 'base · 0',
    sherpa: '🧭 sherpa · {tokens}',
    mark: '🏁 Mark of the day · {tokens}',
    summit: '🚩 Summit · {tokens}',
    toMark: '{tokens} to the mark ({full} to #{rank})',
    toSummit: '{tokens} to the summit ({full} to #{rank})',
  },

  // "My climb" card (PNG). The tiles wrap on plain spaces only:   keeps words together
  card: {
    header: '{appNameUpper}',
    of: 'Card for {name}',
    alt: '{appName} climb card for {name}: #{rank} in the stage',
    saveAs: 'Save as {file}',
    who: '#{rank} ({name})',
    alone: 'alone in the stage',
    tieWith: 'tied with {who}',
    ahead: '+{tokens} ahead of #{rank}',
    behind: '{tokens} behind {who}',
    notStarted: 'has not started today',
    climbing: '{tokens} today · climbing at {pace}',
    resting: '{tokens} today · resting',
    passed: 'passed the mark of the day · +{tokens}',
    progress: '{pct} of the mark of the day ({mark})',
    tile: { stage: 'In the stage', week: 'Week', month: 'Month', wins: 'Wins', best: 'Best' },
    weekRank: '#{rank} · {tokens} {period}',
    outOfTopWeek: 'out of the week’s top',
    outOfTopMonth: 'out of the month’s top',
    wins: { zero: 'no stage won {period}', one: '{n} stage won {period}', other: '{n} stages won {period}' },
    firstDay: 'first day on record',
    newBest: '⭐ new personal best today (was {tokens})',
    best: 'personal best {tokens} · {date}',
    footer: '{period} · internal use',
    notOnWall: 'only people on the stage wall have a card',
    recovering: 'the 3D scene is recovering; try again in a moment',
    tooSmall: 'the window is too small for the photo',
    emptyPng: 'empty PNG',
    failed: 'Could not make the card: {msg}',
    copied: '✅ Image copied: just paste it into Teams or Slack.',
    copyFailed: 'This browser could not copy it. Use “Download PNG” and attach the image.',
  },

  // ❔ Help panel (the guide itself is help-climb.html)
  help: {
    button: 'Help',
    buttonTitle: 'How the climb works (? key)',
    title: '❔ How the climb works',
    close: 'Close the help',
  },

  error: {
    models: 'Could not download the 3D models: {msg}',
    frame: 'Animation error: {msg}',
    load: 'Could not load the data: {msg}',
  },

  // Vertical distance in climber bodies (scale.js)
  scale: {
    bodies: { one: '≈ {n} body', other: '≈ {n} bodies' },
    bodiesTiny: '< {n} body',
  },
};
