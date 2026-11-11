// The city's rules that decide what people see: the building and city tiers, the abandoned stages and
// the Mega Builders. The module is the browser's (public/city/rules.js); it only needs a `location`.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let rules, i18n;
before(async () => {
  globalThis.location = { search: '', href: 'http://localhost/', pathname: '/' };
  i18n = await import('../public/i18n/index.js');
  Object.assign(i18n.config, { idle: { fire: 15, rubble: 30 }, mega: { floors: 1000 } });
  rules = await import('../public/city/rules.js');
});

const person = (id, floors, extra = {}) => ({ id, name: id, floors, week: 0, month: 0, today: 0, idle: 0, hours: 0, now: false, cities: 1, ...extra });

test('building tiers change at the documented floors', () => {
  const key = (f) => rules.tierOf(f, rules.BUILDING_TIERS).key;
  assert.equal(key(0), 'house');
  assert.equal(key(14.9), 'condo');
  assert.equal(key(15), 'building');
  assert.equal(key(150), 'tower');
  assert.equal(key(450), 'skyscraper');
  assert.equal(key(1000), 'supertower');
  assert.equal(key(10000), 'spaceElevator');
});

test('city tiers change at the documented floors', () => {
  const key = (f) => rules.tierOf(f).key;
  assert.equal(key(249), 'village');
  assert.equal(key(250), 'town');
  assert.equal(key(8000), 'megalopolis');
  assert.equal(key(60000), 'marsColony');
});

test('a tier says how far the next one is', () => {
  const t = rules.tierOf(100, rules.BUILDING_TIERS);
  assert.equal(t.next.key, 'tower');
  assert.equal(t.missing, 50);
  assert.ok(t.progress > 0 && t.progress < 1);
});

test('a building burns after 15 days and is rubble after 30', () => {
  assert.equal(rules.ruinOf({ idle: 0 }), null);
  assert.equal(rules.ruinOf({ idle: 15 }), null);
  assert.equal(rules.ruinOf({ idle: 16 }), 'fire');
  assert.equal(rules.ruinOf({ idle: 30 }), 'fire');
  assert.equal(rules.ruinOf({ idle: 31 }), 'rubble');
  assert.equal(rules.ruinOf({ idle: null }), null);
});

test('Mega Builders: 2+ cities and the line; the next in line from half of it', () => {
  const data = { cities: [
    { id: 'a', buildings: [person('ana', 700, { cities: 2 }), person('bia', 2000), person('caio', 300, { cities: 2 }), person('duda', 100, { cities: 2 })] },
    { id: 'b', buildings: [person('ana', 400, { cities: 2 }), person('caio', 250, { cities: 2 }), person('duda', 100, { cities: 2 })] },
  ] };
  const m = rules.megaOf(data);
  assert.equal(m.line, 1000);
  assert.deepEqual(m.members.map((p) => p.id), ['ana'], 'ana adds up 1,100 in two cities; bia has 2,000 in only one');
  assert.equal(m.members[0].floors, 1100);
  assert.equal(m.members[0].parts.length, 2);
  assert.deepEqual(m.queue.map((p) => p.id), ['caio'], 'caio has 550 (half the line); duda has 200');
  assert.ok(data.cities[0].buildings[0].mega && data.cities[1].buildings[0].mega, 'the members\' buildings are marked');
  assert.ok(!data.cities[0].buildings[1].mega);
});

test('token medals: the highest mark reached, from every city added up', () => {
  assert.equal(rules.markOf(99.9), null);
  assert.deepEqual(rules.markOf(100), { i: 0, floors: 100, next: 250 });
  assert.equal(rules.markOf(999).floors, 500);
  assert.equal(rules.markOf(2011.4).floors, 2000);
  assert.deepEqual(rules.markOf(12000), { i: 6, floors: 10000, next: null });
  const data = { cities: [
    { id: 'a', buildings: [person('ana', 700, { cities: 2 }), person('bia', 120)] },
    { id: 'b', buildings: [person('ana', 400, { cities: 2 })] },
  ] };
  rules.megaOf(data);
  assert.equal(data.cities[0].buildings[0].total, 1100, 'ana adds up both cities');
  assert.equal(data.cities[1].buildings[0].total, 1100, 'the same total on each of her buildings');
  assert.equal(data.cities[0].buildings[1].total, 120);
});
