// Static text of climb.html (data-i18n* attributes). {appName} is filled by index.js.

export default {
  page: { title: 'Token Climb · {appName}' },
  html: {
    hud: {
      title: 'Token Climb <small>3D prototype</small>',
      season: 'Season ',
      endsIn: ' · ends in ',
      stage: 'Today’s stage',
      mark: ' · mark of the day ',
      credit: 'People:',
    },
    view: {
      aria: 'Display',
      names: '🏷️ Names', namesTitle: 'Names always shown; off, only on mouse hover (N key)',
      board: '📋 Board', boardTitle: 'Ranking as a list (R key)',
      plaques: '🪧 Plaques', plaquesTitle: 'Record plaques on the rock: summit wall, latest stages and everyone’s personal best (P key)',
    },
    board: {
      aria: 'Ranking',
      title: '🏆 Ranking',
      today: 'Today', todayTitle: 'Today’s stage: tokens since midnight (T switches)',
      week: 'Week', weekTitle: 'Overall standings of the week (T switches)',
      hide: 'Hide the ranking', hideTitle: 'Hide (R key)',
    },
    live: 'LIVE',
    zoom: {
      aria: 'Wall zoom',
      out: 'Zoom out', outTitle: 'Zoom out (−)',
      top5: 'Top 5', top5Title: 'Top 5 (key 1)',
      top10: 'Top 10', top10Title: 'Top 10 (key 2)',
      top25: 'Top 25', top25Title: 'Top 25 (key 3)',
      wall: 'Whole wall', wallTitle: 'Whole wall (key 4)',
      in: 'Zoom in', inTitle: 'Zoom in (+)',
    },
    card: {
      title: 'Card',
      wait: 'Making the card…',
      download: '⬇️ Download PNG',
      copy: '📋 Copy image',
      close: 'Close',
    },
    loading: 'Loading the wall…',
  },
};
