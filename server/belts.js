// Belt program: an optional recognition program (white, blue, purple, brown, black) matched to the people
// of the cities. Entries come from BELTS_FILE (default belts.json at the project root) by name
// (as shown in the city) or by e-mail, or from the data source when it provides `belts()` (the
// mock and demo sources do). Every belt counts for the city's Dojo and appears in its sheet; only the
// black belt changes the person's building (a black pagoda). The file is re-read when it changes
// (at most once a minute).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { personKey } from './config.js';

export const BELTS = ['white', 'blue', 'purple', 'brown', 'black'];
// Portuguese belt names are accepted in the file for convenience.
const ALIASES = { branca: 'white', azul: 'blue', roxa: 'purple', marrom: 'brown', preta: 'black' };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const beltName = (s) => { const b = norm(s); return BELTS.includes(b) ? b : ALIASES[b] ?? null; };

export function createBelts(config, source) {
  const file = resolve(config.root, config.beltsFile);
  const fromSource = source?.belts?.() ?? null; // Map(personKey(email) -> { belt, since })
  let byEmail = new Map(), byName = new Map(), entries = [], mtime = -1, checkedAt = 0;

  function reload() {
    const now = Date.now();
    if (now - checkedAt < 60_000) return;
    checkedAt = now;
    const stamp = existsSync(file) ? statSync(file).mtimeMs : 0;
    if (stamp === mtime) return;
    mtime = stamp;
    byEmail = new Map(); byName = new Map(); entries = [];
    if (!stamp) return;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      for (const e of Array.isArray(raw) ? raw : raw.belts ?? []) {
        const belt = beltName(e.belt);
        if (!belt) continue; // an unknown belt name (a typo) does not count
        const entry = { name: e.name ?? null, email: e.email ?? null, belt, since: e.since ?? null, used: false };
        entries.push(entry);
        if (e.email) byEmail.set(personKey(e.email), entry);
        if (e.name) byName.set(norm(e.name), entry);
      }
      console.log(`[belts] ${entries.length} belts read from ${config.beltsFile} (${entries.filter((e) => e.belt === 'black').length} black)`);
    } catch (err) {
      console.warn(`[belts] could not read ${file}: ${err.message}`);
    }
  }

  // The person's belt ({ belt, since } or null), by the e-mail of the tag or by the displayed name.
  function beltOf(email, name) {
    if (fromSource) return fromSource.get(personKey(email)) ?? null;
    reload();
    const e = byEmail.get(personKey(email)) ?? (name ? byName.get(norm(name)) : null);
    if (!e) return null;
    e.used = true;
    return { belt: e.belt, since: e.since };
  }

  // Summary for the API: how many belts there are and how many entries matched nobody. The names
  // of the unmatched entries only go to the server log, never to the browser.
  function summary() {
    if (fromSource) return { total: fromSource.size, unmatched: 0 };
    reload();
    const unmatched = entries.filter((e) => !e.used);
    if (unmatched.length && Date.now() - mtime < 120_000) {
      console.warn(`[belts] ${unmatched.length} entries matched nobody: ${unmatched.map((e) => e.name ?? e.email).join(', ')}`);
    }
    return { total: entries.length, unmatched: unmatched.length };
  }

  // Whether the belt feature has any data (for /api/config).
  function enabled() {
    if (fromSource) return fromSource.size > 0;
    reload();
    return entries.length > 0;
  }

  return { beltOf, summary, enabled };
}
