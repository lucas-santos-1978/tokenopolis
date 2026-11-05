// Formatters for one language and one time zone (docs/i18n.md). Instants (ms) are shown in
// `timeZone`; ISO calendar days ("2026-10-21") are formatted at UTC noon so the day never shifts.
// Every clock is 24 h, in every language. Built once by initI18n() and exported there as `fmt`.

const NBSP = ' ';
const two = (n) => String(n).padStart(2, '0');
const noDots = (s) => s.replace(/\./g, '');
const isoNoon = (iso) => {
  const [y, m, d] = String(iso ?? '').slice(0, 10).split('-').map(Number);
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12);
};

// The few words the formatters need, so fmt.js works without the dictionaries (and in Node).
const WORDS = {
  en: { million: 'M', and: 'and', week: (w, y) => `Week ${w}, ${y}`, weekShort: (w) => `W${w}` },
  'pt-BR': { million: 'mi', and: 'e', week: (w, y) => `Semana ${w}/${y}`, weekShort: (w) => `S${w}` },
};

// Proper names whose IANA id lost the accent.
const ZONE_NAMES = {
  Sao_Paulo: 'São Paulo', Bogota: 'Bogotá', Asuncion: 'Asunción', Cuiaba: 'Cuiabá', Belem: 'Belém',
  Maceio: 'Maceió', Araguaina: 'Araguaína', Santarem: 'Santarém', Reykjavik: 'Reykjavík',
};
// "America/Sao_Paulo" → "São Paulo", "Europe/Lisbon" → "Lisbon", "UTC" → "UTC".
export function zoneName(timeZone) {
  const last = String(timeZone || 'UTC').split('/').at(-1);
  return ZONE_NAMES[last] ?? last.replace(/_/g, ' ');
}

export function createFmt({ locale = 'en', timeZone = 'UTC' } = {}) {
  const L = locale === 'pt-BR' ? 'pt-BR' : 'en';
  const pt = L === 'pt-BR';
  const w = WORDS[L];
  const cache = new Map();
  const num = (o) => {
    const k = `n${JSON.stringify(o)}`;
    if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(L, o));
    return cache.get(k);
  };
  // utc: ISO days (formatted at UTC noon); otherwise the configured zone.
  const dtf = (o, utc = false) => {
    const k = `d${utc}${JSON.stringify(o)}`;
    if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat(L, { ...o, timeZone: utc ? 'UTC' : timeZone }));
    return cache.get(k);
  };
  const parts = (f, ms) => Object.fromEntries(f.formatToParts(ms).map((p) => [p.type, p.value]));
  const HM = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
  const ORD = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

  const int = (v) => num({ maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0) || 0);
  const dec = (v, max = 1, min = 0) => num({ maximumFractionDigits: max, minimumFractionDigits: min }).format(Number(v) || 0);
  const weekday = (iso, style = 'long') => {
    const s = dtf({ weekday: style }, true).format(isoNoon(iso));
    return pt ? noDots(s.replace(/-feira$/, '')) : s;
  };
  const dayMonth = (iso) => dtf({ day: '2-digit', month: '2-digit' }, true).format(isoNoon(iso));
  const monthName = (m0, style = 'long') => {
    const s = dtf({ month: style }, true).format(Date.UTC(2000, m0, 15, 12));
    return pt ? noDots(s) : s;
  };
  // Tokens in millions, always (never compact notation): "466.9 M", short: integer from 100 M up
  // ("302 M"); a trace that would round to 0 shows as "<0.01 M".
  const tokens = (t, opt) => {
    const short = opt === true || !!opt?.short;
    const m = (Number(t) || 0) / 1e6, a = Math.abs(m);
    const n = a > 0 && a < 0.005 ? `<${dec(0.01, 2, 2)}` : a < 1 ? dec(m, 2) : short && a >= 100 ? int(m) : dec(m, 1, 1);
    return `${n}${NBSP}${w.million}`;
  };

  return {
    locale: L,
    timeZone,
    zone: zoneName(timeZone),
    int,
    dec,
    percent: (v01) => num({ style: 'percent', maximumFractionDigits: 0 }).format(Number(v01) || 0),
    ordinal: (n) => (pt ? `${int(n)}º` : `${int(n)}${ORD[ordinalRules.select(Math.round(n))]}`),
    list: (arr) => {
      const a = [...arr];
      return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ${w.and} ${a.at(-1)}`;
    },
    collator: new Intl.Collator(L, { numeric: true }),
    tokens,
    pace: (t) => `${tokens(t)}/h`,
    meters: (m) => `${int(m)}${NBSP}m`,
    // long: "Wednesday, October 21" / "quarta-feira, 21 de outubro"; short: "Oct 21" / "21 out"
    date: (ms, style = 'long') => {
      if (style === 'long') return dtf({ weekday: 'long', month: 'long', day: 'numeric' }).format(ms);
      if (!pt) return dtf({ month: 'short', day: 'numeric' }).format(ms);
      const p = parts(dtf({ month: 'short', day: 'numeric' }), ms);
      return `${p.day} ${noDots(p.month)}`;
    },
    time: (ms) => dtf(HM).format(ms),
    // "Wed Oct 21 14:05" / "qua 21 out 14:05"
    dateTime: (ms) => {
      const p = parts(dtf({ weekday: 'short', month: 'short', day: 'numeric', ...HM }), ms);
      const wd = noDots(p.weekday), mo = noDots(p.month);
      return pt ? `${wd} ${p.day} ${mo} ${p.hour}:${p.minute}` : `${wd} ${mo} ${p.day} ${p.hour}:${p.minute}`;
    },
    // 14.0833 → "14:05"
    clock: (h) => {
      const tm = Math.floor((Number(h) || 0) * 60 + 1e-6);
      return `${two(Math.floor(tm / 60))}:${two(tm % 60)}`;
    },
    isoDate: (iso) => dtf({ day: '2-digit', month: '2-digit', year: 'numeric' }, true).format(isoNoon(iso)),
    dayShort: (iso) => `${weekday(iso, 'short')} ${dayMonth(iso)}`,
    dayMonth,
    weekday,
    monthName,
    // A Period from the API ({ kind, year, week, month }): "Week 45, 2026" / "W45"; "November 2026" / "Nov".
    period: (p, style = 'long') => {
      const isWeek = p.kind ? p.kind === 'week' : p.week != null;
      if (isWeek) return style === 'short' ? w.weekShort(p.week) : w.week(p.week, p.year);
      if (style === 'short') return monthName(p.month, 'short');
      return dtf({ month: 'long', year: 'numeric' }, true).format(Date.UTC(p.year, p.month, 15, 12));
    },
    // { d, h, m } (or ms): "4d 07h", "1h05", "15 min"; approx: true → "~15 min".
    duration: (x) => {
      let { d = 0, h = 0, m = 0, approx = false } = typeof x === 'number' ? {} : x ?? {};
      if (typeof x === 'number') {
        const tm = Math.max(0, Math.floor(x / 60_000));
        d = Math.floor(tm / 1440); h = Math.floor((tm % 1440) / 60); m = tm % 60;
      }
      if (d > 0) return `${d}d ${two(h)}h`;
      if (h > 0) return `${h}h${two(m)}`;
      return `${approx ? '~' : ''}${m} min`;
    },
  };
}
