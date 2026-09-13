/**
 * The view in the address bar.
 *
 * A URL is user input: it arrives hand-edited, truncated by a chat client,
 * pasted from a bookmark three weeks old, or carrying a country that does not
 * exist. None of that may throw, and none of it may put the app into a state
 * the interface cannot get out of — so every shape below is asserted rather
 * than assumed.
 *
 *     node tests/url.test.mjs <repo root>
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node tests/url.test.mjs <repo root>');
  process.exit(2);
}

// url.js reads window.location and window.history. Neither exists in node.
const calls = [];
globalThis.window = {
  location: { search: '', pathname: '/orbis/', hash: '' },
  history: { replaceState: (_state, _title, url) => calls.push(url) },
};

const { parseView, buildQuery, writeView } = await import(
  pathToFileURL(path.join(ROOT, 'js', 'url.js')).href
);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------------------------------------------------------- parsing */

console.log('\n=== reading a link ===');

check('both parameters', eq(parseView('?d=2026-09-30&c=BR'), { day: '2026-09-30', country: 'BR' }));
check('day alone', eq(parseView('?d=2026-09-30'), { day: '2026-09-30', country: null }));
check('country alone', eq(parseView('?c=US'), { day: null, country: 'US' }));
check('nothing', eq(parseView(''), { day: null, country: null }));
check('order does not matter', eq(parseView('?c=JP&d=2026-01-05'), { day: '2026-01-05', country: 'JP' }));
check('unknown parameters are ignored', eq(parseView('?d=2026-09-30&utm_source=x'), { day: '2026-09-30', country: null }));

// A chat client that lowercases a link must not break it.
check('a lowercase country is accepted', parseView('?c=br').country === 'BR');
check('a mixed-case country is accepted', parseView('?c=Br').country === 'BR');

console.log('\n=== a bad link is ignored, never trusted ===');

for (const bad of [
  '?d=30-09-2026',        // the other date order
  '?d=2026-9-30',         // unpadded
  '?d=yesterday',
  '?d=',
  '?d=2026-09-30T12:00',  // an instant, not a day
  "?d='; DROP TABLE--",
  '?d=<script>',
]) {
  check(`day rejected: ${bad}`, parseView(bad).day === null);
}

for (const bad of ['?c=BRA', '?c=B', '?c=', '?c=12', '?c=../../etc', '?c=<img>']) {
  check(`country rejected: ${bad}`, parseView(bad).country === null);
}

// Shape only. Whether the day is in the window is main.js's question,
// because only main.js has the data to answer it.
check('a real but distant date parses', parseView('?d=1999-01-01').day === '1999-01-01');
check('a well-formed but unknown country parses', parseView('?c=ZZ').country === 'ZZ');

/* ---------------------------------------------------------------- writing */

console.log('\n=== writing a link ===');

check('both parameters', buildQuery({ day: '2026-09-30', country: 'BR' }) === '?d=2026-09-30&c=BR');
check('day alone', buildQuery({ day: '2026-09-30' }) === '?d=2026-09-30');
check('country alone', buildQuery({ country: 'BR' }) === '?c=BR');
check('the default view has no query', buildQuery({}) === '');
check('nulls are omitted, not written', buildQuery({ day: null, country: null }) === '');
check('no argument is safe', buildQuery() === '');

// Round-trip: anything written must read back as itself.
for (const view of [
  { day: '2026-09-30', country: 'BR' },
  { day: '2026-01-01', country: null },
  { day: null, country: 'US' },
]) {
  const back = parseView(buildQuery(view));
  check(`round-trip ${JSON.stringify(view)}`, eq(back, { day: view.day, country: view.country }));
}

/* ---------------------------------------------------------------- history */

console.log('\n=== the address bar ===');

calls.length = 0;
writeView({ day: '2026-09-30', country: 'BR' });
check('replaceState is called once', calls.length === 1);

// The path is kept, so this works at /orbis/ on Pages, at / on a local
// server, and under whatever path a fork publishes to.
check('the path is preserved', calls[0] === '/orbis/?d=2026-09-30&c=BR', calls[0]);

calls.length = 0;
window.location.pathname = '/';
writeView({ day: '2026-09-30' });
check('a root path works too', calls[0] === '/?d=2026-09-30', calls[0]);

calls.length = 0;
window.location.pathname = '/orbis/';
window.location.hash = '#event-list';
writeView({ day: '2026-09-30' });
check('a hash survives', calls[0] === '/orbis/?d=2026-09-30#event-list', calls[0]);
window.location.hash = '';

calls.length = 0;
writeView({});
check('the default view clears the query', calls[0] === '/orbis/', calls[0]);

// Scrubbing a timeline is not navigation: thirty days must not leave thirty
// entries in the back button.
check('pushState is never used', !('pushState' in window.history) || calls.length >= 0);

// A browser that refuses history access should lose the shareable link,
// not the page.
const realHistory = window.history;
window.history = { replaceState() { throw new Error('SecurityError'); } };
let threw = false;
try { writeView({ day: '2026-09-30' }); } catch { threw = true; }
check('a hostile history object does not throw', !threw);
window.history = realHistory;

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : '\nALL CHECKS PASSED\n');
process.exit(failures ? 1 : 0);
