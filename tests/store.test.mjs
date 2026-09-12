/**
 * Smoke tests for the state layer, run against the real data/calendar.json.
 *
 *     node tests/store.test.mjs .
 *
 * Node is only needed for this file - the site itself runs on Python's
 * standard library and a browser. store.js touches no browser API other
 * than fetch, which is shimmed onto the filesystem below.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.argv[2];

// Shim the browser fetch onto the local filesystem.
globalThis.fetch = async (url) => {
  const file = path.join(ROOT, url.split('?')[0]);
  const text = await readFile(file, 'utf8');
  return { ok: true, url, json: async () => JSON.parse(text) };
};

const store = await import(pathToFileURL(path.join(ROOT, 'js', 'store.js')).href);

await store.loadData();
const s = store.state;

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) { console.log(`  PASS  ${label}`); }
  else { console.log(`  FAIL  ${label}  ${detail}`); failures += 1; }
};

console.log('\n=== load ===');
check('events loaded', s.events.length > 500, `got ${s.events.length}`);
check('every event maps to a known country',
  s.events.every((e) => e.country in s.countries));
check('selectedDay initialised', /^\d{4}-\d{2}-\d{2}$/.test(s.selectedDay || ''), s.selectedDay);
check('sources recorded', s.sources.length === 3, `got ${s.sources.length}`);

console.log('\n=== dayList ===');
const days = store.dayList();
check('continuous day strip', days.length >= 20, `got ${days.length}`);
check('no gaps between days', days.every((d, i) =>
  i === 0 || (d.date - days[i - 1].date) === 86400000));
check('counts sum to totals', days.every((d) =>
  d.counts[0] + d.counts[1] + d.counts[2] + d.counts[3] === d.total));
check('total across days equals visible events',
  days.reduce((a, d) => a + d.total, 0) === store.visibleEvents().length);

console.log('\n=== filters ===');
const before = store.visibleEvents().length;
store.toggleFilter('impact', 1);
const after = store.visibleEvents().length;
check('disabling low impact shrinks the set', after < before, `${before} -> ${after}`);
check('low-impact events are gone', store.visibleEvents().every((e) => e.impact !== 1));
store.toggleFilter('impact', 1);
check('re-enabling restores the set', store.visibleEvents().length === before);

for (const only of [3, 2, 1, 0]) {
  for (const v of [3, 2, 1, 0]) if (v !== only) store.toggleFilter('impact', v);
  check(`impact ${only} alone cannot be emptied`, s.filters.impact.size >= 1);
  for (const v of [3, 2, 1, 0]) if (!s.filters.impact.has(v)) store.toggleFilter('impact', v);
}
check('all impacts restored', s.filters.impact.size === 4);

console.log('\n=== markers ===');
const markers = store.dayMarkers();
check('markers produced for the selected day', markers.length > 0, `got ${markers.length}`);
check('markers carry coordinates', markers.every((m) =>
  Number.isFinite(m.lat) && Number.isFinite(m.lon)));
check('marker counts match their event arrays',
  markers.every((m) => m.count === m.events.length));
check('maxImpact is the true max',
  markers.every((m) => m.maxImpact === Math.max(...m.events.map((e) => e.impact))));
check('sorted by impact then volume', markers.every((m, i) =>
  i === 0 || markers[i - 1].maxImpact > m.maxImpact
  || (markers[i - 1].maxImpact === m.maxImpact && markers[i - 1].count >= m.count)));

console.log('\n=== panel ===');
const day = store.panelEvents();
check('day mode by default', day.mode === 'day');
check('day mode is chronological', day.events.every((e, i) =>
  i === 0 || day.events[i - 1].time <= e.time));

store.selectCountry('BR');
const country = store.panelEvents();
check('country mode after selecting BR', country.mode === 'country');
check('country mode only has BR', country.events.every((e) => e.country === 'BR'));
check('country mode spans more than one day',
  new Set(country.events.map((e) => e.day)).size > 1,
  `days: ${new Set(country.events.map((e) => e.day)).size}`);
store.clearSelection();
check('selection cleared', s.selectedCountry === null);

console.log('\n=== derived ===');
const next = store.nextHighImpact();
check('next high-impact found', next !== null && next.impact === 3, next?.title);
check('next high-impact is not stale', next && next.time > Date.now() - 31 * 60 * 1000);
check('imminentEvents returns only soon and significant', store.imminentEvents(24 * 60)
  .every((e) => e.impact >= 2 && e.time >= Date.now()));

const counts = store.filterCounts('impact');
check('filterCounts covers the impact scale', [...counts.keys()].length >= 3, [...counts.keys()].join(','));

console.log('\n=== data integrity ===');
check('no NaN timestamps', s.events.every((e) => Number.isFinite(e.time)));
check('impact always 0-3', s.events.every((e) => e.impact >= 0 && e.impact <= 3));
check('every event has a category', s.events.every((e) => typeof e.category === 'string' && e.category));
check('ids are unique', new Set(s.events.map((e) => e.id)).size === s.events.length,
  `${new Set(s.events.map((e) => e.id)).size} unique of ${s.events.length}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
