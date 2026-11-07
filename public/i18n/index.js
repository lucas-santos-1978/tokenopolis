// Language layer of the pages (docs/i18n.md). initI18n() loads /api/config, picks the language,
// loads the page's dictionaries and fills the static HTML; the pages await it before importing
// their main module. Changing the language saves it and reloads: nothing re-renders live.

import { createFmt } from './fmt.js';

export const config = {};
export let locale = 'en';
export const fmt = createFmt({ locale: 'en', timeZone: 'UTC' }); // rebuilt in place by initI18n()

let dict = {}, fallback = {};
const globals = {}; // {appName}, {appNameUpper}, {zone}, {since}, {floor}, {idleFire}, {idleRubble}: usable in every string
const warned = new Set();
const partials = new Map();

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
// "pt", "pt-br", "pt_BR" → "pt-BR"; anything unknown → "en".
const normalize = (code) => (/^pt/i.test(String(code ?? '')) ? 'pt-BR' : 'en');

function resolveLocale() {
  const q = new URLSearchParams(location.search).get('lang');
  const v = q || store.get('lang') || config.locale || navigator.language;
  return normalize(v);
}

async function loadConfig() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const defaults = {
    appName: 'Tokenopolis', locale: 'en', timeZone: zone, utcOffset: -new Date().getTimezoneOffset() / 60,
    floorTokens: 1e6, features: {},
  };
  let got = {};
  try {
    const res = await fetch(`api/config${new URLSearchParams(location.search).has('demo') ? '?demo' : ''}`, { cache: 'no-store' });
    if (res.ok) got = await res.json();
  } catch { /* offline or older server: defaults */ }
  Object.assign(config, defaults, got);
  try { new Intl.DateTimeFormat('en', { timeZone: config.timeZone }); } catch { config.timeZone = 'UTC'; }
}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(into, from) {
  for (const [k, v] of Object.entries(from ?? {})) into[k] = isPlain(v) && isPlain(into[k]) ? merge({ ...into[k] }, v) : v;
  return into;
}
async function loadDicts(code, page) {
  const names = ['common', page, `${page}-static`];
  const mods = await Promise.all(names.map((n) => import(`./${code}/${n}.js`).catch((e) => {
    console.warn('[i18n] could not load', `${code}/${n}.js`, e);
    return { default: {} };
  })));
  return mods.reduce((d, m) => merge(d, m.default), {});
}

function lookup(d, key) {
  let v = d;
  for (const part of String(key).split('.')) {
    if (v == null || typeof v !== 'object' || !(part in v)) return undefined;
    v = v[part];
  }
  return v;
}
const warnOnce = (kind, key) => { if (!warned.has(kind + key)) { warned.add(kind + key); console.warn(`[i18n] ${kind}`, key); } };
function find(key) {
  let v = lookup(dict, key);
  if (v === undefined) {
    v = lookup(fallback, key);
    warnOnce(v === undefined ? 'missing' : 'untranslated', key);
  }
  return v;
}
const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m));
function render(v, params) {
  const p = { ...globals, ...params };
  if (typeof v === 'function') return v(p);
  if (typeof v === 'string') return fill(v, p);
  return v; // arrays and catalog objects, as they are
}

// A dictionary value: a string with {x} filled from params, a function's result, or (for word
// lists and catalog entries) the array/object itself. Missing → English → the key.
export function t(key, params = {}) {
  const v = find(key);
  return v === undefined ? key : render(v, params);
}

// The value is { zero?, one, other }; n is the number AS DISPLAYED. {n} defaults to fmt.int(n).
const rules = new Map();
export function plural(n, key, params = {}) {
  const v = find(key);
  if (v === undefined) return key;
  if (!rules.has(locale)) rules.set(locale, new Intl.PluralRules(locale));
  const form = n === 0 ? v.zero ?? v.other : v[rules.get(locale).select(n)] ?? v.other;
  return render(form, { n: fmt.int(n), ...params });
}

export function applyStatic(root = document) {
  const each = (attr, fn) => root.querySelectorAll(`[${attr}]`).forEach((el) => fn(el, t(el.getAttribute(attr))));
  each('data-i18n', (el, s) => { el.textContent = s; });
  each('data-i18n-html', (el, s) => { el.innerHTML = s; });
  each('data-i18n-title', (el, s) => { el.title = s; });
  each('data-i18n-placeholder', (el, s) => { el.placeholder = s; });
  each('data-i18n-aria', (el, s) => { el.setAttribute('aria-label', s); });
}

export function setLocale(code) {
  store.set('lang', normalize(code));
  // drop only ?lang, keeping the rest of the query as written ("?demo", not "?demo=")
  const search = location.search.replace(/([?&])lang=[^&]*(&|$)/, (m, pre, post) => (post ? pre : ''));
  if (search !== location.search) location.replace(location.pathname + search + location.hash);
  else location.reload();
}

export const cityLabel = (city) => city?.name ?? t('city.unnamed', { code: city?.code ?? '' });

// { full, short }: the configured/pretty name and its first word, or the anonymized
// "Swift Llama 2" / "Lhama Veloz 2", whose short form is the animal.
export function displayName(person) {
  if (person?.name) return { full: person.name, short: person.name.split(' ')[0] };
  const a = person?.anon;
  if (!a) return { full: t('anon.unknown'), short: t('anon.unknown') };
  const animal = t('anon.animals')[a.animal] ?? '?', adjective = t('anon.adjectives')[a.adjective] ?? '';
  return { full: t('anon.name', { animal, adjective, n: a.n }), short: animal };
}

// public/i18n/<locale>/<name>.html (help panes), English when missing, {appName} etc. filled.
export async function loadPartial(name) {
  if (!partials.has(name)) {
    const get = (code) => fetch(new URL(`./${code}/${name}.html`, import.meta.url)).then((r) => (r.ok ? r.text() : null));
    partials.set(name, get(locale).catch(() => null).then((html) => html ?? (locale === 'en' ? '' : get('en').catch(() => ''))));
  }
  return fill((await partials.get(name)) ?? '', globals);
}

function wireSwitcher(root = document) {
  for (const b of root.querySelectorAll('[data-lang]')) {
    b.setAttribute('aria-pressed', String(normalize(b.dataset.lang) === locale));
    b.addEventListener('click', () => { if (normalize(b.dataset.lang) !== locale) setLocale(b.dataset.lang); });
  }
}

export async function initI18n(page = document.documentElement.dataset.page ?? (/climb/.test(location.pathname) ? 'climb' : 'city')) {
  try {
    await loadConfig();
    locale = resolveLocale();
    const [own, en] = await Promise.all([loadDicts(locale, page), locale === 'en' ? null : loadDicts('en', page)]);
    dict = own; fallback = en ?? own;
    Object.assign(fmt, createFmt({ locale, timeZone: config.timeZone }));
    const start = config.start != null ? Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: config.timeZone, day: 'numeric', month: 'numeric' })
      .formatToParts(config.start).map((p) => [p.type, Number(p.value)])) : null;
    Object.assign(globals, {
      appName: config.appName, appNameUpper: String(config.appName).toLocaleUpperCase(locale), zone: fmt.zone,
      floor: t('legend.floor', { tokens: config.floorTokens }),
      idleFire: fmt.int(config.idle?.fire ?? 15), idleRubble: fmt.int(config.idle?.rubble ?? 30), // the abandoned buildings' thresholds
    });
    globals.since = t('date.since', start ? { day: start.day, month: fmt.monthName(start.month - 1) } : {});
    document.documentElement.lang = locale;
    document.title = t('page.title', { appName: config.appName });
    applyStatic();
    wireSwitcher();
    await Promise.all([...document.querySelectorAll('[data-i18n-partial]')].map(async (el) => {
      el.innerHTML = await loadPartial(el.dataset.i18nPartial);
      applyStatic(el);
    }));
  } catch (e) {
    console.error('[i18n] init failed', e);
  } finally {
    document.documentElement.classList.add('i18n-ready');
  }
}
