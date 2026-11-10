// Textos comuns às duas páginas: nomes, catálogos (marcos, monumentos, badges, faixas, modelos,
// mapas, estilos, acampamentos), listas de palavras, períodos, erros e a navegação. Cada item de
// catálogo traz as formas explícitas (name, a, lower, plural) e o gênero (fem); nunca derive com
// toLowerCase(). Os artigos de cidade abaixo servem aos outros arquivos pt-BR.

export const city = (c) => c.name ?? `Time ${c.code}`;
export const a = (c) => (c.name ? `a ${c.name}` : `o ${city(c)}`); // "a Plataforma" / "o Time 43FA"
export const A = (c) => (c.name ? `A ${c.name}` : `O ${city(c)}`);
export const da = (c) => (c.name ? `da ${c.name}` : `do ${city(c)}`);
export const na = (c) => (c.name ? `na ${c.name}` : `no ${city(c)}`);

const milhoes = (tokens) => (tokens === 1e6 ? '1 milhão de' : `${(tokens / 1e6).toLocaleString('pt-BR')} milhões de`);

export default {
  page: { title: '{appName}' },

  city: { unnamed: 'Time {code}' },
  anon: {
    // Mesma ordem da lista de avatares do servidor (o índice é o animal do nome anônimo).
    animals: ['Cabra', 'Lhama', 'Urso Polar', 'Águia', 'Pinguim', 'Raposa', 'Lobo', 'Panda', 'Coala', 'Coruja',
      'Tigre', 'Leão', 'Sapo', 'Macaco', 'Guaxinim', 'Castor', 'Bisão', 'Ouriço', 'Tartaruga', 'Lontra',
      'Polvo', 'Unicórnio', 'Dragão', 'T-Rex', 'Baleia', 'Flamingo', 'Abelha', 'Caranguejo', 'Joaninha', 'Foca',
      'Esquilo', 'Preguiça', 'Leopardo', 'Canguru', 'Jacaré'],
    adjectives: ['Veloz', 'Audaz', 'Valente', 'Ágil', 'Sagaz', 'Tenaz', 'Imparável', 'Radiante',
      'Destemido', 'Lendário', 'Feroz', 'Elétrico', 'Cósmico', 'Turbo', 'Supremo'],
    name: ({ animal, adjective, n }) => `${animal} ${adjective}${n ? ` ${n}` : ''}`,
    unknown: 'Alguém',
  },

  badge: {
    champion: { icon: '👑', name: 'Campeão Reinante', desc: 'Venceu a temporada passada' },
    summit: { icon: '🚩', name: 'Fincou a Bandeira', desc: 'Chegou ao cume nesta temporada' },
    sherpa: { icon: '🧭', name: 'À Frente do Sherpa', desc: 'Acima do ritmo pra chegar ao cume até o fim da temporada' },
    streak: { icon: '🔥', name: 'Em Chamas', desc: '5 ou mais dias seguidos escalando' },
    rocket: { icon: '🚀', name: 'Foguete', desc: 'Maior subida do dia' },
    cache: { icon: '🧊', name: 'Mestre do Cache', desc: 'Maior reaproveitamento de cache (cache read)' },
    marathon: { icon: '🏃', name: 'Maratonista', desc: 'Mais sessões abertas na temporada' },
    surgical: { icon: '🎯', name: 'Cirúrgico', desc: 'Menos tokens por sessão (mín. 10 sessões)' },
    chatty: { icon: '🗣️', name: 'Tagarela', desc: 'Mais tokens de output gerados' },
    rookie: { icon: '🐣', name: 'Calouro', desc: 'Não pontuou na temporada passada e já está no top' },
    stage: { icon: '🏅', name: 'Vencedor da etapa', desc: 'Venceu ao menos uma etapa diária nesta semana' },
  },

  belt: {
    white: { icon: '⚪', name: 'Faixa branca', a: 'uma faixa branca', lower: 'faixa branca', plural: 'faixas brancas', fem: true },
    blue: { icon: '🔵', name: 'Faixa azul', a: 'uma faixa azul', lower: 'faixa azul', plural: 'faixas azuis', fem: true },
    purple: { icon: '🟣', name: 'Faixa roxa', a: 'uma faixa roxa', lower: 'faixa roxa', plural: 'faixas roxas', fem: true },
    brown: { icon: '🟤', name: 'Faixa marrom', a: 'uma faixa marrom', lower: 'faixa marrom', plural: 'faixas marrons', fem: true },
    black: { icon: '⚫', name: 'Faixa preta', a: 'uma faixa preta', lower: 'faixa preta', plural: 'faixas pretas', fem: true },
  },
  dojoLevel: {
    dojo: { name: 'Dojo', a: 'um Dojo', lower: 'dojo', plural: 'dojos', fem: false },
    temple: { name: 'Templo', a: 'um Templo', lower: 'templo', plural: 'templos', fem: false },
    greatTemple: { name: 'Grande Templo', a: 'um Grande Templo', lower: 'grande templo', plural: 'grandes templos', fem: false },
  },

  model: {
    opus: { name: 'Opus', lower: 'Opus' },
    sonnet: { name: 'Sonnet', lower: 'Sonnet' },
    haiku: { name: 'Haiku', lower: 'Haiku' },
    fable: { name: 'Fable', lower: 'Fable' },
    other: { name: 'Outros modelos', lower: 'outros modelos' },
  },

  tier: {
    // Marcos da cidade; `perk` é o que o marco destrava no mapa.
    city: {
      village: { name: 'Vila', a: 'uma vila', lower: 'vila', plural: 'vilas', fem: true, perk: 'tijolo à vista' },
      town: { name: 'Cidade', a: 'uma cidade', lower: 'cidade', plural: 'cidades', fem: true, perk: 'prédios de concreto' },
      capital: { name: 'Capital', a: 'uma capital', lower: 'capital', plural: 'capitais', fem: true, perk: 'torres de vidro azul' },
      metropolis: { name: 'Metrópole', a: 'uma metrópole', lower: 'metrópole', plural: 'metrópoles', fem: true, perk: 'art déco dourado' },
      megalopolis: { name: 'Megalópole', a: 'uma megalópole', lower: 'megalópole', plural: 'megalópoles', fem: true, perk: 'neon e telhados solares' },
      globalCity: { name: 'Cidade Global', a: 'uma cidade global', lower: 'cidade global', plural: 'cidades globais', fem: true, perk: 'um globo holográfico' },
      futureCity: { name: 'Cidade do Futuro', a: 'uma cidade do futuro', lower: 'cidade do futuro', plural: 'cidades do futuro', fem: true, perk: 'carros voadores' },
      marsColony: { name: 'Colônia em Marte', a: 'uma colônia em Marte', lower: 'colônia em Marte', plural: 'colônias em Marte', fem: true, perk: 'uma base em Marte' },
    },
    building: {
      house: { name: 'Casa', a: 'uma casa', lower: 'casa', plural: 'casas', fem: true },
      townhouse: { name: 'Sobrado', a: 'um sobrado', lower: 'sobrado', plural: 'sobrados', fem: false },
      poolHouse: { name: 'Casa com piscina', a: 'uma casa com piscina', lower: 'casa com piscina', plural: 'casas com piscina', fem: true },
      condo: { name: 'Condomínio', a: 'um condomínio', lower: 'condomínio', plural: 'condomínios', fem: false },
      building: { name: 'Prédio', a: 'um prédio', lower: 'prédio', plural: 'prédios', fem: false },
      tower: { name: 'Torre', a: 'uma torre', lower: 'torre', plural: 'torres', fem: true },
      skyscraper: { name: 'Arranha-céu', a: 'um arranha-céu', lower: 'arranha-céu', plural: 'arranha-céus', fem: false },
      supertower: { name: 'Supertorre', a: 'uma supertorre', lower: 'supertorre', plural: 'supertorres', fem: true },
      cloudTower: { name: 'Torre das Nuvens', a: 'uma torre das nuvens', lower: 'torre das nuvens', plural: 'torres das nuvens', fem: true },
      orbitalTower: { name: 'Torre Orbital', a: 'uma torre orbital', lower: 'torre orbital', plural: 'torres orbitais', fem: true },
      spaceElevator: { name: 'Elevador Espacial', a: 'um elevador espacial', lower: 'elevador espacial', plural: 'elevadores espaciais', fem: false },
    },
  },

  monument: {
    obelisk: { name: 'Obelisco dos 10 bi', a: 'um Obelisco dos 10 bi', lower: 'obelisco dos 10 bi', plural: 'obeliscos dos 10 bi', fem: false, req: 'chegar a 10 bilhões de tokens (10.000 andares)' },
    airport: { name: 'Aeroporto', a: 'um aeroporto', lower: 'aeroporto', plural: 'aeroportos', fem: false, req: 'virar Megalópole (8.000 andares)' },
    stadium: { name: 'Estádio', a: 'um estádio', lower: 'estádio', plural: 'estádios', fem: false, req: '60% das pessoas construindo na semana' },
    ferrisWheel: { name: 'Roda-gigante', a: 'uma roda-gigante', lower: 'roda-gigante', plural: 'rodas-gigantes', fem: true, req: 'crescer 10% numa semana' },
    centralPark: { name: 'Parque Central', a: 'um parque central', lower: 'parque central', plural: 'parques centrais', fem: false, req: 'chegar a 50 prédios' },
    tvTower: { name: 'Torre de TV', a: 'uma torre de TV', lower: 'torre de TV', plural: 'torres de TV', fem: true, req: 'ter um arranha-céu (450 andares)' },
    leadershipStatue: { name: 'Estátua da Liderança', a: 'uma Estátua da Liderança', lower: 'estátua da liderança', plural: 'estátuas da liderança', fem: true, req: 'liderar as obras da semana' },
    mayor: { name: 'Palanque do prefeito', a: 'um palanque do prefeito', lower: 'palanque do prefeito', plural: 'palanques do prefeito', fem: false, req: 'quem mais construiu na cidade no mês passado' },
    fountainSquare: { name: 'Praça da Fonte', a: 'uma praça da fonte', lower: 'praça da fonte', plural: 'praças da fonte', fem: true, req: '3 estreias numa semana' },
  },

  // Mapas de dados da cidade; `legend` segue as cores do MAPKEYS, na ordem.
  map: {
    default: { name: 'Normal', title: 'Normal', desc: 'a cidade como ela é' },
    now: { name: 'Agora', title: 'Agora', desc: 'quem está construindo neste momento', legend: ['construindo agora', 'trabalhou hoje', 'parado'] },
    week: { name: 'Obras da semana', title: 'Obras da semana', desc: 'do frio (nada) ao quente (maior obra)', legend: ['nada', 'pouca', 'média', 'muita', 'as maiores'] },
    network: { name: 'Rede', title: 'Rede', desc: 'quem constrói em mais de uma cidade', legend: ['💎 Mega Builder', '3 cidades ou mais', '2 cidades', '1 cidade'] },
    model: { name: 'Modelo', title: 'Modelo mais usado (7 dias)', desc: 'o modelo que cada um mais usou na semana', legend: ['Opus', 'Sonnet', 'Haiku', 'Fable', 'outros ou sem dado'] },
    belts: { name: 'Dojo', title: 'Dojo', desc: 'a faixa de cada um no Dojo', legend: ['preta', 'marrom', 'roxa', 'azul', 'branca', 'sem faixa'] },
  },
  style: {
    brick: { name: 'Tijolo à vista', lower: 'tijolo à vista' },
    concrete: { name: 'Concreto', lower: 'concreto' },
    glass: { name: 'Vidro azul', lower: 'vidro azul' },
    deco: { name: 'Art déco', lower: 'art déco' },
    neon: { name: 'Futurista com neon', lower: 'futurista com neon' },
  },

  mountain: { name: 'Pico do Contexto' },
  camp: {
    base: { name: 'Acampamento Base', lower: 'acampamento base' },
    camp: { name: 'Campo {n}', lower: 'campo {n}' },
    summit: { name: 'Cume', lower: 'o cume' },
  },

  period: {
    day: { name: 'Dia', lower: 'dia', plural: 'dias', fem: false },
    week: { name: 'Semana', lower: 'semana', plural: 'semanas', fem: true },
    month: { name: 'Mês', lower: 'mês', plural: 'meses', fem: false },
    season: { name: 'Temporada', lower: 'temporada', plural: 'temporadas', fem: true },
    stage: { name: 'Etapa', lower: 'etapa', plural: 'etapas', fem: true },
    today: 'hoje',
    yesterday: 'ontem',
    tomorrow: 'amanhã',
    thisWeek: 'esta semana',
    lastWeek: 'semana passada',
    thisMonth: 'este mês',
    lastMonth: 'mês passado',
  },
  months: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  // Domingo primeiro, como Date#getUTCDay().
  weekdays: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
  date: {
    // "desde 1º de agosto" (o início da contagem, config.start); sem ele, "desde o início".
    since: ({ day, month }) => (day ? `desde ${day === 1 ? '1º' : day} de ${month}` : 'desde o início'),
  },
  clock: { in: 'em {zone}' },
  // a idade da leitura que está na tela
  age: { now: 'agora', min: 'há {n} min', hours: 'há {n} h', title: 'Leitura dos dados: {time}', label: 'Dados: {age}' },

  // Contagens comuns, via plural(n, 'count.floor').
  count: {
    floor: { one: '{n} andar', other: '{n} andares' },
    building: { one: '{n} prédio', other: '{n} prédios' },
    person: { one: '{n} pessoa', other: '{n} pessoas' },
    city: { one: '{n} cidade', other: '{n} cidades' },
    day: { one: '{n} dia', other: '{n} dias' },
    week: { one: '{n} semana', other: '{n} semanas' },
    session: { one: '{n} sessão', other: '{n} sessões' },
  },

  legend: {
    floor: ({ tokens = 1e6 }) => `1 andar = ${tokens >= 1e6 && tokens % 1e6 === 0 ? milhoes(tokens) : tokens.toLocaleString('pt-BR')} tokens`,
  },

  // O objeto `error` da API (docs/contract.md).
  error: {
    upstream: ({ status }) => `A fonte de dados respondeu com erro${status ? ` (HTTP ${status})` : ''}`,
    timeout: 'A fonte de dados demorou demais para responder',
    rate_limited: ({ retryAfter }) => `Pedidos demais à fonte de dados${retryAfter ? `; nova tentativa em ${retryAfter} s` : ''}`,
    auth: 'A fonte de dados recusou as credenciais',
    config: 'A fonte de dados não está configurada',
    unknown: 'Erro inesperado ao ler os dados',
    offline: 'Não deu para falar com o servidor',
    webgl: 'Este navegador não conseguiu iniciar os gráficos 3D (WebGL), então a cidade não pode ser desenhada. Tente outro navegador ou ligue a aceleração de hardware nas configurações dele.',
    stale: 'mostrando a última leitura',
    lastReading: 'última leitura: {time}',
  },

  nav: {
    city: { label: '🏙️ {appName}', title: 'Abrir {appName}' },
    climb: { label: '🏔️ Escalada dos Tokens', title: 'Abrir a Escalada dos Tokens' },
  },
  switcher: { aria: 'Idioma', en: 'English', pt: 'Português (Brasil)' },
};
