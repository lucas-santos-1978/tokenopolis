// The two languages must have the same keys: a string added in English and forgotten in Portuguese
// (or the other way around) would show a raw key on screen. Plural forms may differ in `zero`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const FILES = ['common', 'city', 'city-static', 'climb', 'climb-static'];
const PLURAL = new Set(['zero', 'one', 'other']);

// every leaf of a dictionary as a dotted path, with its kind (string, function, array, plural)
function leaves(obj, path = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (Array.isArray(v)) out.set(p, `array(${v.length})`);
    else if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length && keys.every((x) => PLURAL.has(x))) out.set(p, 'plural');
      else leaves(v, p, out);
    } else out.set(p, 'text'); // a string or a function: either language may need a function for grammar
  }
  return out;
}

for (const file of FILES) {
  test(`en and pt-BR have the same keys in ${file}.js`, async () => {
    const en = leaves((await import(`../public/i18n/en/${file}.js`)).default);
    const pt = leaves((await import(`../public/i18n/pt-BR/${file}.js`)).default);
    // `fem` is Portuguese grammar (the gender of a catalog entry): English has no use for it
    const onlyEn = [...en.keys()].filter((k) => !pt.has(k)), onlyPt = [...pt.keys()].filter((k) => !en.has(k) && !k.endsWith('.fem'));
    assert.deepEqual(onlyEn, [], `missing in pt-BR/${file}.js`);
    assert.deepEqual(onlyPt, [], `missing in en/${file}.js`);
    const kinds = [...en].filter(([k, kind]) => pt.get(k) !== kind).map(([k, kind]) => `${k}: en ${kind}, pt-BR ${pt.get(k)}`);
    assert.deepEqual(kinds, [], 'same key, different shape');
  });
}

test('no key is defined twice in the same dictionary file', async () => {
  // a duplicated top-level key silently replaces the first one (the later object wins)
  const { readFile } = await import('node:fs/promises');
  for (const lang of ['en', 'pt-BR']) for (const file of FILES) {
    const src = await readFile(new URL(`../public/i18n/${lang}/${file}.js`, import.meta.url), 'utf8');
    const tops = [...src.matchAll(/^ {2}([A-Za-z_$][\w$]*): /gm)].map((m) => m[1]);
    const twice = tops.filter((k, i) => tops.indexOf(k) !== i);
    assert.deepEqual(twice, [], `${lang}/${file}.js`);
  }
});

test('what counts: the SCORE_TYPES types in words, cache reads said to be out or in', async () => {
  const en = (await import('../public/i18n/en/common.js')).default.legend.counted;
  const pt = (await import('../public/i18n/pt-BR/common.js')).default.legend.counted;
  assert.equal(en({}), 'input, output and cache writes (cache reads are left out)', 'the default');
  assert.equal(pt({ types: ['input', 'output', 'cachecreation'] }), 'entrada, saída e escrita de cache (a leitura de cache fica de fora)');
  assert.equal(en({ types: [] }), 'every type, cache reads included', 'empty = every type');
  assert.equal(pt({ types: [] }), 'todos os tipos, inclusive a leitura de cache');
  assert.equal(en({ types: ['output', 'cacheRead'] }), 'output and cache reads', 'cache reads in: no note');
  assert.equal(pt({ types: ['input', 'thinking'] }), 'entrada e thinking (a leitura de cache fica de fora)', 'an unknown type by its name');
});
