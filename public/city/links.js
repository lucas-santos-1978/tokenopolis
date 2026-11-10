// The help's "Links and TV" tab: the link builder (where to open, the time, the map, the panels, the
// language and the TV mode; the link comes out ready to copy or open) and the list of everything the
// URL accepts. The builder starts from what is on screen now, so nobody needs to remember a parameter.
import { t, fmt, cityLabel, displayName } from '../i18n/index.js';
import { copyText } from '../lib/clipboard.js';
import { MAPKEYS, queueToast } from './panels.js';
import { CITY_TIERS, cityTier } from './rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STYLE_ICONS = { brick: '🧱', concrete: '🏢', glass: '🪟', deco: '🎩', neon: '🌃', global: '🌐', future: '🛸', mars: '🪐' };
const LANGS = ['en', 'pt-BR'];
const langOf = (v) => (!v ? '' : /^pt/i.test(v) ? 'pt-BR' : 'en');

// Everything the URL accepts, in the help's order (docs/i18n.md): the parameter, its syntax and what it does.
const row = (key, syntax) => ({ key, syntax, desc: t(`urldoc.${key}`) });
export const URL_DOC = [
  { title: t('urldoc.group.where'), rows: [row('city', 'city=<name or id>'), row('person', 'person=<id>'), row('cam', 'cam=<angle>,<tilt>,<distance>')] },
  { title: t('urldoc.group.tv'), rows: [row('tour', 'tour'), row('spin', 'spin'), row('hour', 'hour=14.5')] },
  { title: t('urldoc.group.visual'), rows: [
    row('map', `map=${Object.keys(MAPKEYS).join('|')}`), row('panels', 'panels=0'), row('names', 'names=0'),
    row('style', `style=${Object.keys(STYLE_ICONS).join('|')}`), row('quality', 'quality=low'), row('parts', 'parts=0'), row('ruins', 'ruins=0'), row('lang', `lang=${LANGS.join('|')}`),
  ] },
  { title: t('urldoc.group.tests'), rows: [row('demo', 'demo'), row('monuments', 'monuments=all'), row('giant', 'giant=N'), row('mega', 'mega=<floors>'), row('monster', 'monster'), row('debug', 'debug')] },
];

// root: the help dialog (#help); state(): what is on screen now (cities, view, time, map…).
export function initLinks({ root, state }) {
  const pane = root.querySelector('[data-help-pane="links"]');
  let cities = [];
  const form = () => pane.querySelector('#lk-form');
  const field = (name) => form()?.elements[name];

  function showTab(name) {
    for (const tab of root.querySelectorAll('.tabs [data-help-tab]')) tab.classList.toggle('on', tab.dataset.helpTab === name);
    for (const p of root.querySelectorAll('[data-help-pane]')) p.hidden = p.dataset.helpPane !== name;
    if (name === 'links') render(state());
    root.querySelector('.help').scrollTop = 0;
  }

  function render(st) {
    cities = st.cities ?? [];
    const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
    const notes = t('links.hourNote');
    const cityOpts = [opt('', t('links.wholeRegion'), st.city), ...cities.map((c) => opt(c.id, cityLabel(c), st.city))].join('');
    const hourOpts = [opt('', t('links.hourAuto'), st.hour), ...Array.from({ length: 24 }, (_, h) => opt(h, `${fmt.clock(h)}${notes[h] ? ` · ${notes[h]}` : ''}`, st.hour))].join('');
    const mapOpts = [opt('', t('links.mapNone'), st.map), ...Object.keys(MAPKEYS).map((k) => opt(k, `${MAPKEYS[k].icon} ${t(`map.${k}`).title}`, st.map))].join('');
    const styleOpts = [opt('', t('links.styleAuto'), st.style), ...Object.entries(STYLE_ICONS).map(([k, ic]) => opt(k, `${ic} ${t(`style.${k}`).name} (${cityTier(CITY_TIERS.find((x) => x.style === k).key).lower})`, st.style))].join('');
    const lang = langOf(st.lang), langOpts = [opt('', t('links.langAuto'), lang), opt('en', t('switcher.en'), lang), opt('pt-BR', t('switcher.pt'), lang)].join('');
    const check = (name, on) => `<label><input type="checkbox" name="${name}"${on ? ' checked' : ''}>${t(`links.check.${name}`)}</label>`;
    const doc = URL_DOC.map(({ title, rows }) => `<tr class="grp"><th colspan="2">${esc(title)}</th></tr>${rows.map((r) => `<tr><td><code>?${esc(r.syntax)}</code></td><td>${esc(r.desc)}</td></tr>`).join('')}`).join('');
    pane.innerHTML = `
      <div class="lk">
        <form class="lk-form" id="lk-form" autocomplete="off">
          <h3>${t('links.build')}</h3>
          <p class="note">${t('links.buildNote')}</p>
          <div class="lk-presets"><span>${t('links.presets')}</span><button type="button" data-lk-preset="tv">${t('links.preset.tv')}</button><button type="button" data-lk-preset="night">${t('links.preset.night')}</button><button type="button" data-lk-preset="clean">${t('links.preset.clean')}</button><button type="button" data-lk-preset="reset">${t('links.preset.reset')}</button></div>
          <label>${t('links.field.city')}<select name="city">${cityOpts}</select></label>
          <label>${t('links.field.person')}<select name="person"><option value="">${t('links.personNone')}</option></select></label>
          <label>${t('links.field.hour')}<select name="hour">${hourOpts}</select></label>
          <label>${t('links.field.map')}<select name="map">${mapOpts}</select></label>
          <label>${t('links.field.style')}<select name="style">${styleOpts}</select></label>
          <label>${t('links.field.lang')}<select name="lang">${langOpts}</select></label>
          <fieldset><legend>${t('links.tv')}</legend>
            ${check('tour', st.tour)}
            ${check('spin', st.spin)}
            ${check('panels', st.panels)}
            ${check('names', st.names)}
          </fieldset>
          <fieldset><legend>${t('links.extras')}</legend>
            ${check('demo', st.demo)}
            ${check('quality', st.quality)}
            ${check('monuments', st.monuments)}
            ${check('monster', false)}
          </fieldset>
        </form>
        <div class="lk-out">
          <h3>${t('links.link')}</h3>
          <code class="lk-url" id="lk-url"></code>
          <div class="lk-actions"><button type="button" class="primary" data-lk="copy">${t('links.copy')}</button><button type="button" data-lk="open">${t('links.open')}</button><button type="button" data-lk="tab">${t('links.newTab')}</button></div>
          <p class="note">${t('links.outNote')}</p>
          <h3>${t('links.accepts')}</h3>
          <table class="lk-doc">${doc}</table>
          <p class="note">${t('links.combine')}</p>
        </div>
      </div>`;
    fillPeople(st.person);
    updateUrl();
  }

  // A building only makes sense inside a city: the list follows the chosen city.
  function fillPeople(keep = '') {
    const sel = field('person'), c = cities.find((x) => x.id === field('city').value), nm = (b) => displayName(b).full;
    const people = c ? [...c.buildings].sort((a, b) => fmt.collator.compare(nm(a), nm(b))) : [];
    sel.innerHTML = `<option value="">${c ? t('links.personWhole') : t('links.personPick')}</option>` + people.map((b) => `<option value="${esc(b.id)}"${b.id === keep ? ' selected' : ''}>${esc(nm(b))}</option>`).join('');
    sel.disabled = !c;
  }

  function currentUrl() {
    const f = form(); if (!f) return location.href;
    const parts = [], val = (n) => f.elements[n].value, on = (n) => f.elements[n].checked;
    if (val('city')) parts.push(`city=${encodeURIComponent(val('city'))}`);
    if (val('city') && val('person')) parts.push(`person=${encodeURIComponent(val('person'))}`);
    if (on('tour')) parts.push('tour');
    if (on('spin') && !on('tour')) parts.push('spin');
    if (val('hour') !== '') parts.push(`hour=${val('hour')}`);
    if (val('map')) parts.push(`map=${val('map')}`);
    if (val('style')) parts.push(`style=${val('style')}`);
    if (on('panels')) parts.push('panels=0');
    if (on('names')) parts.push('names=0');
    if (on('quality')) parts.push('quality=low');
    if (on('monuments')) parts.push('monuments=all');
    if (on('monster')) parts.push('monster');
    if (on('demo')) parts.push('demo');
    if (val('lang')) parts.push(`lang=${val('lang')}`);
    return location.origin + location.pathname + (parts.length ? `?${parts.join('&')}` : '');
  }
  function updateUrl() { const out = pane.querySelector('#lk-url'); if (out) out.textContent = currentUrl(); }

  function preset(name) {
    const f = form(); if (!f) return;
    if (name === 'reset') { f.reset(); for (const el of f.elements) { if (el.type === 'checkbox') el.checked = false; else if (el.tagName === 'SELECT') el.value = ''; } fillPeople(); }
    if (name === 'tv' || name === 'night') { f.elements.tour.checked = true; f.elements.spin.checked = false; }
    if (name === 'night') f.elements.hour.value = '21';
    if (name === 'clean') { f.elements.panels.checked = true; f.elements.names.checked = true; }
    updateUrl();
  }

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-help-tab]');
    if (tab) return showTab(tab.dataset.helpTab);
    const p = e.target.closest('[data-lk-preset]');
    if (p) return preset(p.dataset.lkPreset);
    const b = e.target.closest('[data-lk]');
    if (!b) return;
    const url = currentUrl();
    if (b.dataset.lk === 'copy') {
      copyText(url).then((ok) => queueToast(ok
        ? { icon: '🔗', title: t('toast.linkCopied.title'), text: t('links.copied'), ms: 3000, quiet: true }
        : { icon: '🔗', title: t('links.copyFailed.title'), text: t('links.copyFailed.text'), ms: 4000, quiet: true }));
    } else if (b.dataset.lk === 'open') location.assign(url);
    else if (b.dataset.lk === 'tab') window.open(url, '_blank', 'noopener');
  });
  pane.addEventListener('change', (e) => { if (e.target.name === 'city') fillPeople(); updateUrl(); });
  pane.addEventListener('submit', (e) => e.preventDefault());

  return { showTab };
}
