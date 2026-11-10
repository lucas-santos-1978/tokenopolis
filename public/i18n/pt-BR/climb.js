// Textos da escalada em tempo de execução (HUD, lista, etiquetas, placas, faixa AO VIVO, cartão,
// régua). Os números chegam já formatados pelo `fmt` ({tokens}, {pace}, {meters}, {pct}…); os plurais
// recebem o número como aparece. Os textos levam o espaço não quebrável onde número e unidade não
// podem se separar (o cartão só quebra linha em espaço comum).

export default {
  // Estado de um escalador na etapa (etiquetas, lista, cartão)
  state: {
    lastHour: ' · {tokens} na última hora',
    restingFor: 'parado há {time}{hour}',
    resting: 'parado{hour}',
    restingOver15: 'parado há mais de 15 min',
    restingOver1h: 'parado há mais de 1 h',
    noTokensToday: 'sem tokens hoje',
    inWeek: 'na semana',
    inMonth: 'no mês',
  },

  // De onde vem a marca do dia
  mark: {
    fixed: 'marca fixa',
    fallback: 'estimativa (ainda há poucas etapas para a mediana)',
    median: { one: 'a última etapa', other: 'mediana das últimas {n} etapas' },
  },

  // A etapa do dia ({weekday} vem de fmt.weekday: "quinta")
  stage: {
    title: 'Etapa de {weekday}',
  },

  // Diferença para quem está logo acima (segunda linha da etiqueta)
  gap: {
    leftToMark: 'faltam {tokens} pra marca',
    leftToSummit: 'faltam {tokens} pro cume',
    tie: 'empate com #{rank} (Δ {tokens})',
    behind: '−{tokens} do #{rank}',
    markIn: 'marca a {tokens}',
    summitIn: 'cume a {tokens}',
  },

  person: { notOnWall: '{name} não está na parede hoje', unknown: 'Essa pessoa não está no ranking desta temporada' },
  // Etiquetas dos escaladores e plaquinhas do ranking
  tag: {
    card: '📸 Cartão',
    cardTitle: 'Cartão para compartilhar no Teams/Slack (tecla C)',
    city: '🏙️ Prédio',
    cityTitle: 'Ver o prédio desta pessoa na cidade',
    zzz: 'z z z',
    resting: 'parado',
    todayState: '{tokens} hoje · {state}',
    pastMark: '{flag} +{tokens} além da marca',
    pastSummit: '{flag} +{tokens} além do cume',
    tie: ' (empate)',
  },

  // Placas: a do cume, no topo, a do acampamento base e a da parede vazia ({src} e {stage} podem vir escapados)
  sign: {
    markOfDay: '🏁 Marca do dia: {mark}',
    noOneYet: '{src} · {stage}: ninguém escalou ainda (largada às 00h)',
    passed: { one: '{name} passou da marca do dia', other: '{n} pessoas passaram da marca do dia' },
    leaderPast: 'líder +{tokens} além · marca {mark} ({src})',
    leaderTo: '{src} · líder a {tokens} ({pct})',
    below: '+{n} abaixo do #{rank}',
    belowToday: '+{n} <span class="wide">com tokens hoje </span>abaixo do #{rank}',
    baseStage: 'largada da etapa às 00h · {zero}',
    emptyStage: '{stage}: ninguém escalou ainda',
    emptyStageSub: 'o primeiro token de hoje já aparece aqui',
    emptySeason: 'Ninguém escalou ainda nesta temporada',
    emptySeasonSub: 'o primeiro token já aparece aqui',
    summitTaken: { one: '🚩 Cume conquistado por {n} pessoa · líder +{tokens} além', other: '🚩 Cume conquistado por {n} pessoas · líder +{tokens} além' },
    summitAbove: '= {pct} acima {ref} ({tokens})',
    ref: { record: 'do recorde', projection: 'da projeção', summit: 'do cume' },
    summitIn: '▲ Cume a {tokens} do líder',
    summitInSub: '{meters} de montanha até lá',
    campStage: '{tokens} · {pct} da marca',
  },

  // Ranking em lista (o rótulo da aba "Semana" e o título dela vêm de html.board.*)
  board: {
    month: 'Mês',
    monthTitle: 'Classificação geral do mês (tecla T troca)',
    emptyWeek: 'A semana começou às 00h de segunda: ninguém pontuou ainda.',
    emptyMonth: 'O mês começou às 00h do dia 1º: ninguém pontuou ainda.',
    champWeek: ' Campeão da semana passada: {name}.',
    champMonth: ' Campeão do mês passado: {name}.',
    stagesWon: { one: '{n} etapa vencida', other: '{n} etapas vencidas' },
    jersey: '🟡 camisa amarela',
    todayRank: '#{rank} na etapa de hoje (clique para ver de perto)',
    todayShort: 'hoje #{rank}',
    notOnWall: 'não está na parede hoje',
    offFrame: 'fora do quadro',
    clickHint: ' (clique para ver de perto)',
    cardTitle: 'Cartão para compartilhar (tecla C com a pessoa escolhida)',
    belowCut: '{n} abaixo do corte ({tokens} {period})',
    cutTitleWeek: 'A classificação da semana só conta quem passou do corte, que cresce junto com o período. A etapa de hoje conta todo mundo.',
    cutTitleMonth: 'A classificação do mês só conta quem passou do corte, que cresce junto com o período. A etapa de hoje conta todo mundo.',
    withTokensToday: '{n} com tokens hoje',
  },

  zoom: {
    all: 'Todos',
  },

  // Avisos curtos no alto da tela
  toast: {
    cardHint: '📸 Clique em alguém da parede e aperte C para fazer o cartão',
    cardOnlyWall: '📸 O cartão é para quem está na parede da etapa de hoje',
    newMark: 'Nova marca do dia: {mark} · 1 corpo ≈ {body}',
    newScale: 'Nova escala: 1 corpo ≈ {body}',
    newStage: '🌙 {stage} começou: todo mundo volta ao acampamento base',
  },

  // Faixa AO VIVO: acontecimentos da etapa ({who} é o primeiro nome) e os destaques que giram
  ticker: {
    newStage: '🌙 {stage} começou: todo mundo desce de rapel até o acampamento base',
    pb: '⭐ {who} bateu o recorde pessoal ({tokens})',
    passedMark: '🏅 {who} passou da marca do dia ({mark})!',
    camp: '⛺ {camp} ({tokens}): {who} chegou',
    started: '☀️ {who} começou a escalar hoje',
    leads: '🥇 {who} lidera a etapa (passou {other})',
    overtook: '🔼 #{rank} da etapa: {who} passou {other}',
    empty: '💤 {stage}: ninguém escalou ainda · a etapa começou às 00h',
    fastest: '🚀 Maior subida da última hora: {who}, +{tokens}',
    fastestWall: '🚀 Maior subida da última hora na parede: {who}, +{tokens}',
    climbingNow: { one: '🧗 {n} pessoa subindo agora, de {active} com tokens hoje', other: '🧗 {n} pessoas subindo agora, de {active} com tokens hoje' },
    climbingWall: '🧗 {n} dos {total} da parede subindo agora',
    leaderPast: '🏅 {who} lidera a etapa, {tokens} além da marca',
    leaderAt: '🥇 {who} lidera a etapa: {tokens} ({pct} da marca)',
    jersey: '🟡 {who} veste a camisa amarela: {tokens} {period}{wins}',
    mark: '🏁 Marca do dia: {mark} · {src}',
  },

  // Duelos: quem alcança o de cima em menos de 90 min ({eta}: "~15 min")
  duel: {
    text: '⚔️ #{rank} alcança #{up} em {eta}',
  },

  // Seta na borda da tela quando alguém fora do quadro subiu (câmera manual)
  edge: {
    climbed: { one: '{arrow} #{rank} subiu +{tokens}', other: '{arrow} {n} subiram · maior: #{rank} +{tokens}' },
  },

  hint: {
    closeUp: 'Ver de perto',
  },

  // HUD: na etapa a semana aparece sem o ano
  hud: {
    week: 'Semana {n}',
  },

  // Placas de recorde na rocha: o mural do cume, as plaquinhas das últimas etapas e os grampos
  records: {
    title: 'Recordes',
    titleSince: 'Recordes (desde {month})',
    stage: 'Etapa',
    week: 'Semana',
    weekOf: 'semana de {date}',
    weekdayRecord: 'Recorde de {weekday}',
    timesMark: '{x}× a marca',
    above: 'acima',
    aboveToday: ' ({tokens} acima da marca de hoje)',
    plateTip: '{stage}: {tokens}{above}\n🏅 venceu: {name}',
    pb: 'recorde: {tokens}',
    pbNew: '⭐ novo recorde · era {tokens}',
  },

  // Régua de tokens ao lado da parede (canvas 2D)
  ruler: {
    tick: '{n} mi',
    base: 'base · 0',
    sherpa: '🧭 sherpa · {tokens}',
    mark: '🏁 Marca do dia · {tokens}',
    summit: '🚩 Cume · {tokens}',
    toMark: '{tokens} até a marca ({full} do #{rank})',
    toSummit: '{tokens} até o cume ({full} do #{rank})',
  },

  // Cartão "minha escalada" (PNG). Os quadros só quebram linha em espaço comum:   segura as palavras juntas
  card: {
    header: '{appNameUpper}',
    of: 'Cartão de {name}',
    alt: 'Cartão da escalada de {name} no {appName}: #{rank} na etapa',
    saveAs: 'Salvar como {file}',
    who: '#{rank} ({name})',
    alone: 'sozinho na etapa',
    tieWith: 'empate com {who}',
    ahead: '+{tokens} à frente do #{rank}',
    behind: '−{tokens} do {who}',
    notStarted: 'ainda não começou hoje',
    climbing: '{tokens} hoje · subindo a {pace}',
    resting: '{tokens} hoje · parado',
    passed: 'passou da marca do dia · +{tokens}',
    progress: '{pct} da marca do dia ({mark})',
    tile: { stage: 'Na etapa', week: 'Semana', month: 'Mês', wins: 'Vitórias', best: 'Recorde' },
    weekRank: '#{rank} · {tokens} {period}',
    outOfTopWeek: 'fora do top da semana',
    outOfTopMonth: 'fora do top do mês',
    wins: { zero: 'nenhuma etapa vencida {period}', one: '{n} etapa vencida {period}', other: '{n} etapas vencidas {period}' },
    firstDay: 'primeiro dia no histórico',
    newBest: '⭐ novo recorde pessoal hoje (antes {tokens})',
    best: 'recorde pessoal {tokens} · {date}',
    footer: '{period} · uso interno',
    notOnWall: 'só quem está na parede da etapa tem cartão',
    recovering: 'a cena 3D está se recuperando; tente de novo em instantes',
    tooSmall: 'a janela está pequena demais para a foto',
    emptyPng: 'PNG vazio',
    failed: 'Não consegui gerar o cartão: {msg}',
    copied: '✅ Imagem copiada: é só colar no Teams ou no Slack.',
    copyFailed: 'Não deu para copiar neste navegador. Use “Baixar PNG” e anexe a imagem.',
  },

  // ❔ Painel de ajuda (o guia em si é o help-climb.html)
  help: {
    button: 'Ajuda',
    buttonTitle: 'Como funciona a escalada (tecla ?)',
    title: '❔ Como funciona a escalada',
    close: 'Fechar a ajuda',
  },

  error: {
    models: 'Não consegui baixar os modelos 3D: {msg}',
    frame: 'Erro na animação: {msg}',
    load: 'Não consegui carregar os dados: {msg}',
  },

  // Distância vertical em corpos de escalador (scale.js); em pt-BR 1,7 fica no singular
  scale: {
    bodies: { one: '≈ {n} corpo', other: '≈ {n} corpos' },
    bodiesTiny: '< {n} corpo',
  },
};
