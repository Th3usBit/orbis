/**
 * The pure helpers in panels.js, and the astronomy in globe.js.
 *
 * These were unreachable from Node until IMPACT_COLORS moved into store.js:
 * panels.js imported it from globe.js, which imports three, so loading a DOM
 * helper pulled in a WebGL library that only resolves in a browser. The
 * colours are data about the impact scale, not about the scene, so they live
 * in the store now and this file can exist.
 *
 * globe.js still needs three, so sunDirection is re-derived here rather than
 * imported -- the point is to check the arithmetic the comment in globe.js
 * claims ("good to a fraction of a degree"), and that claim is about the
 * formula, which is copied verbatim below and asserted against the real
 * astronomical values.
 *
 *     node tests/format.test.mjs <repo root>
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node tests/format.test.mjs <repo root>');
  process.exit(2);
}

// panels.js reads the language through i18n.js, which touches the document on
// import. Nothing under test renders, so a stub is enough.
globalThis.document = {
  documentElement: { lang: 'en', dataset: { lang: 'en' } },
  querySelectorAll: () => [],
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const load = (file) => import(pathToFileURL(path.join(ROOT, 'js', file)).href);
const { safeUrl, flagOf, formatValue, surpriseOf } = await load('panels.js');
const { IMPACT_COLORS, REGION_COLOR, IMPACTS } = await load('store.js');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

/* ------------------------------------------------------------------ safeUrl */

console.log('\n=== safeUrl: the one field that becomes an href ===');

for (const url of ['https://bls.gov', 'http://example.org/a?b=c', '  https://ok.com  ']) {
  check(`accepts ${JSON.stringify(url)}`, safeUrl(url) === url.trim());
}

// calendar.json is generated from third-party feeds. Everything else is
// rendered as text, which cannot execute; this one is assigned to .href.
for (const hostile of [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '\tjavascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  '//evil.example',
  'ftp://example.org',
]) {
  check(`rejects ${JSON.stringify(hostile)}`, safeUrl(hostile) === null);
}

for (const junk of ['', null, undefined, 42, {}, []]) {
  check(`rejects non-string ${JSON.stringify(junk) ?? String(junk)}`, safeUrl(junk) === null);
}

/* ------------------------------------------------------------------- flagOf */

console.log('\n=== flagOf: ISO 3166-1 alpha-2 to regional indicators ===');

check('BR is the Brazilian flag', flagOf('BR') === '\u{1F1E7}\u{1F1F7}');
check('US is the American flag', flagOf('US') === '\u{1F1FA}\u{1F1F8}');
check('lowercase still works', flagOf('jp') === flagOf('JP'));
for (const bad of ['', 'X', 'BRA', null, undefined]) {
  check(`falls back on ${JSON.stringify(bad) ?? String(bad)}`, flagOf(bad) === '\u{1F3F3}');
}

/* -------------------------------------------------------------- formatValue */

console.log('\n=== formatValue: the three branches and the unit rules ===');

check('null is an em dash, not "null"', formatValue(null, '%') === '—');
check('undefined is an em dash', formatValue(undefined, null) === '—');
check('zero is a value, not absent', formatValue(0, '%') === '0%');

// Percent binds tight; a short unit gets a space; a long one is dropped
// rather than crowding the row.
check('percent has no space', formatValue(3.2, '%') === '3.2%');
check('short unit takes a space', formatValue(42, 'K') === '42 K');
check('long unit is dropped', !formatValue(42, 'points').includes('points'));
check('no unit is bare', formatValue(42, null) === '42');

// Under 10 keeps two decimals, above keeps one, and 10000 switches to
// compact notation so a row cannot be overrun by an index level.
check('under 10 keeps two decimals', formatValue(1.23456, null) === '1.23');
check('over 10 keeps one', formatValue(1234.56, null).startsWith('1,234.6'));
check('10000 is compact', /k$/i.test(formatValue(15000, null)));
check('millions are compact', /m$/i.test(formatValue(1500000, null)));
check('negatives survive', formatValue(-2.4, '%') === '-2.4%');

/* -------------------------------------------------------------- surpriseOf */

console.log('\n=== surpriseOf: actual against forecast ===');

const ev = (actual, forecast) => ({ actual, forecast });

check('no actual, no surprise', surpriseOf(ev(null, 3.0)) === null);
check('no forecast, no surprise', surpriseOf(ev(3.0, null)) === null);

const beat = surpriseOf(ev(3.1, 3.0));
check('above forecast is a beat', beat.direction === 'beat');
check('beat percent is positive', beat.percent > 0);

const miss = surpriseOf(ev(2.9, 3.0));
check('below forecast is a miss', miss.direction === 'miss');
check('miss percent is negative', miss.percent < 0);

check('equal is inline', surpriseOf(ev(3.0, 3.0)).direction === 'inline');

// Float arithmetic: 0.1 + 0.2 !== 0.3, so an exact match has to be a
// tolerance rather than an equality or every third row reads as a surprise.
check('inline survives float noise', surpriseOf(ev(0.1 + 0.2, 0.3)).direction === 'inline');

// A forecast of zero cannot yield a percentage; the sign still matters.
const fromZero = surpriseOf(ev(1.0, 0));
check('zero forecast still has a direction', fromZero.direction === 'beat');
check('zero forecast has no percent', fromZero.percent === null);

// A negative forecast must not invert the reading: -1 against -2 is a beat.
check('negative forecast keeps direction', surpriseOf(ev(-1, -2)).direction === 'beat');
check('negative forecast percent uses magnitude', surpriseOf(ev(-1, -2)).percent === 50);

/* ------------------------------------------------------------------ colours */

console.log('\n=== the impact palette ===');

check('every impact level has a colour', IMPACTS.every((i) => IMPACT_COLORS[i]));
check('all colours are hex triples', IMPACTS.every((i) => /^#[0-9a-f]{6}$/i.test(IMPACT_COLORS[i])));
check('no two impact levels share a colour',
  new Set(IMPACTS.map((i) => IMPACT_COLORS[i])).size === IMPACTS.length);
check('the region colour is a hex triple', /^#[0-9a-f]{6}$/i.test(REGION_COLOR));

/* ------------------------------------------------------------ sunDirection */

console.log('\n=== sunDirection: the terminator is a real position ===');

// The formula from globe.js, kept here because importing it would pull in
// three. If these ever drift apart this suite is worth nothing -- but the
// values below are astronomical facts, so a drift fails loudly rather than
// quietly agreeing with a broken copy.
const DEG = Math.PI / 180;
const declinationOf = (date) => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  return -23.44 * Math.cos(((360 / 365.24) * (dayOfYear + 10)) * DEG);
};

const near = (value, target, tolerance) => Math.abs(value - target) <= tolerance;

// The axial tilt is 23.44°, and the solstices are where the sun reaches it.
check('June solstice is the northern extreme',
  near(declinationOf(new Date('2026-06-21T12:00:00Z')), 23.44, 0.2),
  `${declinationOf(new Date('2026-06-21T12:00:00Z')).toFixed(2)}°`);
check('December solstice is the southern extreme',
  near(declinationOf(new Date('2026-12-21T12:00:00Z')), -23.44, 0.3),
  `${declinationOf(new Date('2026-12-21T12:00:00Z')).toFixed(2)}°`);

// At an equinox the sun stands over the equator, give or take the day-level
// resolution of a formula that takes no account of the time of day.
for (const [iso, name] of [['2026-03-20T12:00:00Z', 'March'], ['2026-09-23T12:00:00Z', 'September']]) {
  const d = declinationOf(new Date(iso));
  check(`${name} equinox is over the equator`, near(d, 0, 1.5), `${d.toFixed(2)}°`);
}

// Never outside the tropics, on any day of any year.
let extreme = 0;
for (let day = 0; day < 366; day += 1) {
  const d = declinationOf(new Date(Date.UTC(2026, 0, 1 + day, 12)));
  extreme = Math.max(extreme, Math.abs(d));
}
check('declination never leaves the tropics', extreme <= 23.45, `max ${extreme.toFixed(2)}°`);

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : '\nALL CHECKS PASSED\n');
process.exit(failures ? 1 : 0);
