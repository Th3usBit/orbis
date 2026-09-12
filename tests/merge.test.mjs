/**
 * Reconciliation and value-parsing checks, run against the published dataset.
 *
 *     node tests/merge.test.mjs .
 *
 * fetch.py folds a second calendar feed into the primary one. Getting that
 * wrong is quiet in a way the other suites do not catch: a bad match does not
 * throw, it publishes one plausible-looking row carrying another release's
 * numbers, and the row it swallowed simply is not there. So these assert
 * properties of the output rather than exercising the Python.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node tests/merge.test.mjs <repo root>');
  process.exit(2);
}

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

const calendar = JSON.parse(await readFile(path.join(ROOT, 'data', 'calendar.json'), 'utf8'));
const events = calendar.events ?? [];

console.log('\n=== payload is parseable data ===');

check('the calendar has events', events.length > 0, `${events.length}`);

/* json.dump writes NaN and Infinity as bare literals that no JSON parser
   accepts. One in the feed would take the whole page down, so the collector
   drops them — this is the check that says it still does. */
const raw = await readFile(path.join(ROOT, 'data', 'calendar.json'), 'utf8');
check('no NaN or Infinity literals', !/[:[,]\s*(NaN|-?Infinity)\s*[,\]}]/.test(raw));

const numeric = ['actual', 'forecast', 'previous'];
const nonFinite = events.filter((e) =>
  numeric.some((k) => typeof e[k] === 'number' && !Number.isFinite(e[k])));
check('every published number is finite', nonFinite.length === 0, `${nonFinite.length} events`);

console.log('\n=== reconciliation did not invent or lose rows ===');

/* Ids are what deduplicate the overlapping weekly feeds. A collision does not
   warn — the second event is dropped as though it had already been seen. */
const ids = events.map((e) => e.id);
const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i);
check('event ids are unique', duplicated.length === 0, [...new Set(duplicated)].slice(0, 3).join(', '));

/* Compare a value against the same indicator's previous reading, never
   actual against forecast: a trade balance genuinely swings from -800k to
   +96m between months, and flagging that would be noise. What is not possible
   is a series whose own previous reading is three orders of magnitude away —
   that is two different indicators fused into one row. */
const mismatched = events.filter((e) => {
  const pairs = [[e.actual, e.previous], [e.forecast, e.previous]];
  return pairs.some(([x, y]) => {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (Math.abs(x) < 0.01 || Math.abs(y) < 0.01) return false;
    const ratio = Math.max(Math.abs(x), Math.abs(y)) / Math.min(Math.abs(x), Math.abs(y));
    return ratio > 1000;
  });
});
check('no series sits three orders of magnitude from its own previous value',
  mismatched.length === 0,
  mismatched.slice(0, 3).map((e) => `${e.title} (${e.actual}/${e.previous})`).join('; '));

/* Two releases that differ only by reporting period are different releases.
   If one swallowed the other, the survivor carries a corroboration tag and its
   sibling is gone — so a country reporting MoM should still report YoY. */
const PERIOD = /\b(mom|m\/m|qoq|q\/q|yoy|y\/y|wow|w\/w)\b/i;
const byBase = new Map();
for (const event of events) {
  const period = event.title.match(PERIOD)?.[1]?.toLowerCase().replace('/', '');
  if (!period) continue;
  const base = `${event.country}|${event.ts}|${event.title.replace(PERIOD, '').trim().toLowerCase()}`;
  byBase.set(base, (byBase.get(base) ?? new Set()).add(period));
}
const collapsed = [...byBase.entries()].filter(([, periods]) => periods.size > 1);
// Before the merge was fixed this was zero: MoM and YoY siblings were being
// folded into one row, so the survivor stood alone. A real feed always carries
// some of both.
check('period variants survive as separate events', collapsed.length > 0,
  `only ${collapsed.length} indicators publish more than one period`);

/* A corroborated row must name the feed that corroborated it, and must not
   claim to be confirmed by its own source. */
const badConfirm = events.filter((e) =>
  e.confirmed_by && (e.confirmed_by.length === 0 || e.confirmed_by.includes(e.source)));
check('confirmed_by names a different feed', badConfirm.length === 0, `${badConfirm.length} events`);

console.log('\n=== all-day events keep their calendar date ===');

/* A holiday is a date, not an instant. Christmas is the 25th in Auckland and
   in Los Angeles alike, so its timestamp must not sit close enough to midnight
   UTC for a viewer timezone to shift it. */
const allDay = events.filter((e) => e.all_day);
const drifting = allDay.filter((e) => {
  const hour = Number(e.ts.slice(11, 13));
  return hour < 3 || hour > 21;
});
check('all-day events are anchored away from midnight UTC',
  drifting.length === 0, drifting.slice(0, 3).map((e) => e.ts).join(', '));

check('all-day events exist to check', allDay.length > 0, `${allDay.length}`);

console.log('\n=== window ===');

const from = Date.parse(calendar.window?.from);
const to = Date.parse(calendar.window?.to);
check('window is a valid range', Number.isFinite(from) && Number.isFinite(to) && to > from);

const outside = events.filter((e) => {
  const t = Date.parse(e.ts);
  return !Number.isFinite(t) || t < from || t > to;
});
check('every event falls inside the declared window', outside.length === 0, `${outside.length} events`);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
