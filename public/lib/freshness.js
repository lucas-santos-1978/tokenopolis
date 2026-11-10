// How old the reading on screen is, in the page's language, shared by the city and the climb.
//
// The age is counted on the server's clock (the Date header of its last answer), so a device with
// the wrong time does not make a fresh reading look old.

import { t, fmt } from '../i18n/index.js';

let skew = 0; // server clock − device clock, in ms
export function noteServerClock(res) {
  const at = Date.parse(res?.headers?.get('date') ?? '');
  if (Number.isFinite(at)) skew = at - Date.now();
}
const serverNow = () => Date.now() + skew;

// "just now", "3 min ago", "2 h ago"; the date and time after two days.
export function ageText(at) {
  const min = Math.floor((serverNow() - at) / 60_000);
  if (min < 1) return t('age.now');
  if (min < 60) return t('age.min', { n: fmt.int(min) });
  if (min < 48 * 60) return t('age.hours', { n: fmt.int(Math.floor(min / 60)) });
  return fmt.dateTime(at);
}

// The time of a reading: "14:05" while it is recent, with the day once it could be yesterday's.
export const readingTime = (at) => (serverNow() - at < 20 * 3_600_000 ? fmt.time(at) : fmt.dateTime(at));
