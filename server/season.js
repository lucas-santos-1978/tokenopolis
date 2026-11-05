// Seasons by week (default) or month, and daily stages, aligned to the configured time zone.
// Every period is a plain object the browser formats itself (see docs/contract.md):
//   { id, kind: 'week' | 'month', year, week, month (0-based), start, end }

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// "Local time" represented as a Date in UTC, so getUTC* can be used.
const toLocal = (ms, offset) => new Date(ms + offset * HOUR);
const fromLocal = (localMs, offset) => localMs - offset * HOUR;

function isoWeek(local) {
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / DAY + 1) / 7) };
}

export function seasonAt(ms, { length, utcOffsetHours: off }) {
  const local = toLocal(ms, off);
  if (length === 'week') {
    const dow = local.getUTCDay() || 7; // Monday = 1
    const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (dow - 1));
    const start = fromLocal(startLocal, off);
    const { year, week } = isoWeek(local);
    return {
      id: `${year}-W${String(week).padStart(2, '0')}`,
      kind: 'week',
      year,
      week,
      month: null,
      start,
      end: start + 7 * DAY,
    };
  }
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return {
    id: `${y}-${String(m + 1).padStart(2, '0')}`,
    kind: 'month',
    year: y,
    week: null,
    month: m,
    start: fromLocal(Date.UTC(y, m, 1), off),
    end: fromLocal(Date.UTC(y, m + 1, 1), off),
  };
}

// The local day that contains `ms`: the daily stage, from midnight to midnight.
export function dayAt(ms, { utcOffsetHours: off }) {
  const local = toLocal(ms, off);
  const start = fromLocal(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()), off);
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dow = local.getUTCDay();
  return {
    day: `${local.getUTCFullYear()}-${mm}-${dd}`,
    dow, // 0 = Sunday
    workday: dow >= 1 && dow <= 5,
    start,
    end: start + DAY,
  };
}

// Local day index (days since 1970 in the zone): a key, and a way to find the weekday.
export const localDayIndex = (ms, off) => Math.floor((ms + off * HOUR) / DAY);

export function previousSeasons(current, count, opts) {
  const list = [];
  let s = current;
  for (let i = 0; i < count; i++) {
    s = seasonAt(s.start - 1, opts);
    list.push(s);
  }
  return list;
}
