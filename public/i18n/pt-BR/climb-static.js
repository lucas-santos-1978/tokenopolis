// Texto estático de climb.html (atributos data-i18n*). {appName} vem do index.js.

export default {
  page: { title: 'Escalada dos Tokens · {appName}' },
  html: {
    hud: {
      title: 'Escalada dos Tokens <small>protótipo 3D</small>',
      season: 'Temporada ',
      endsIn: ' · termina em ',
      stage: 'Etapa do dia',
      mark: ' · marca do dia ',
      credit: 'Pessoas:',
    },
    view: {
      aria: 'Exibição',
      names: '🏷️ Nomes', namesTitle: 'Nomes sempre à mostra; desligado, só ao passar o mouse (tecla N)',
      board: '📋 Ranking', boardTitle: 'Ranking em lista (tecla R)',
      plaques: '🪧 Placas', plaquesTitle: 'Placas de recorde na rocha: mural do cume, últimas etapas e o recorde pessoal de cada um (tecla P)',
    },
    board: {
      aria: 'Ranking',
      title: '🏆 Ranking',
      today: 'Hoje', todayTitle: 'Etapa de hoje: tokens desde 00h (tecla T troca)',
      week: 'Semana', weekTitle: 'Classificação geral da semana (tecla T troca)',
      hide: 'Esconder o ranking', hideTitle: 'Esconder (tecla R)',
    },
    live: 'AO VIVO',
    zoom: {
      aria: 'Zoom do paredão',
      out: 'Afastar', outTitle: 'Afastar (−)',
      top5: 'Top 5', top5Title: 'Top 5 (tecla 1)',
      top10: 'Top 10', top10Title: 'Top 10 (tecla 2)',
      top25: 'Top 25', top25Title: 'Top 25 (tecla 3)',
      wall: 'Paredão inteiro', wallTitle: 'Paredão inteiro (tecla 4)',
      in: 'Aproximar', inTitle: 'Aproximar (+)',
    },
    card: {
      title: 'Cartão',
      wait: 'Gerando o cartão…',
      download: '⬇️ Baixar PNG',
      copy: '📋 Copiar imagem',
      close: 'Fechar',
    },
    loading: 'Carregando o paredão…',
  },
};
