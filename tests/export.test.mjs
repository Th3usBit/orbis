/**
 * The .ics and .csv exports, checked against whatever the feeds published.
 *
 * Both formats are strict in ways that fail quietly: an over-long line, a
 * comma that should have been escaped, a date that shifts by one. None of that
 * shows up until somebody imports the file into a calendar or opens it in
 * Excel, which is too late. So this asserts the shape of the output rather
 * than eyeballing it.
 *
 *     node tests/export.test.mjs <repo root>
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node tests/export.test.mjs <repo root>');
  process.exit(2);
}

globalThis.document = {
  documentElement: { lang: 'en', dataset: { lang: 'en' } },
  querySelectorAll: () => [],
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const calendar = JSON.parse(readFileSync(path.join(ROOT, 'data', 'calendar.json'), 'utf8'));
const reference = JSON.parse(readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8'));
globalThis.fetch = async (url) => ({
  ok: true,
  url,
  json: async () => (String(url).includes('countries') ? reference : calendar),
});

const load = (file) => import(pathToFileURL(path.join(ROOT, 'js', file)).href);
const store = await load('store.js');
const { safeUrl, surpriseOf } = await load('panels.js');
const { setLang } = await load('i18n.js');
const {
  escapeText, foldLine, icsStamp, icsDate, buildIcs,
  csvField, csvDialect, buildCsv, exportName,
} = await load('export.js');

await store.loadData();

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const sample = store.state.events.slice(0, 400);
const allDay = store.state.events.filter((e) => e.all_day);

/* ------------------------------------------------------------------ pieces */

console.log('\n=== escaping and folding ===');

check('backslash is escaped first', escapeText('a\\,b') === 'a\\\\\\,b');
check('comma is escaped', escapeText('PPI Ex Food, Energy') === 'PPI Ex Food\\, Energy');
check('semicolon is escaped', escapeText('a;b') === 'a\\;b');
check('newline becomes \\n', escapeText('a\nb') === 'a\\nb');
check('CRLF becomes one \\n', escapeText('a\r\nb') === 'a\\nb');
check('plain text is untouched', escapeText('Inflation Rate') === 'Inflation Rate');

const short = 'SUMMARY:short';
check('a short line is not folded', foldLine(short) === short);

// The folding limit is in octets. These titles are longer in bytes than in
// characters, which is exactly where a naive fold corrupts the text.
const accented = `SUMMARY:${'ç'.repeat(60)}`;
const folded = foldLine(accented);
check('a long line is folded', folded.includes('\r\n '));
check('folding never splits a character',
  folded.split('\r\n ').join('') === accented,
  'round-trip differs');
for (const line of folded.split('\r\n')) {
  const octets = new TextEncoder().encode(line).length;
  if (octets > 75) { check('every folded segment fits 75 octets', false, `${octets}`); break; }
}
check('every folded segment fits 75 octets',
  folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));

check('icsStamp strips separators', icsStamp('2026-09-14T12:30:00Z') === '20260914T123000Z');
check('icsDate takes the nominal date', icsDate('2026-09-16T12:00:00Z') === '20260916');

/* --------------------------------------------------------------------- ics */

console.log('\n=== the calendar file ===');

const ics = buildIcs(sample, { safeUrl, generatedAt: store.state.generatedAt });
const lines = ics.split('\r\n').filter(Boolean);

check('it is CRLF throughout', !/[^\r]\n/.test(ics));
check('it ends with CRLF', ics.endsWith('\r\n'));
check('it opens and closes VCALENDAR',
  lines[0] === 'BEGIN:VCALENDAR' && lines.at(-1) === 'END:VCALENDAR');

const begins = lines.filter((l) => l === 'BEGIN:VEVENT').length;
const ends = lines.filter((l) => l === 'END:VEVENT').length;
check('every VEVENT is closed', begins === ends && begins === sample.length, `${begins}/${ends}`);

check('required calendar properties are present',
  ['VERSION:2.0', 'PRODID:', 'CALSCALE:'].every((p) => ics.includes(p)));

const over = lines.filter((l) => new TextEncoder().encode(l).length > 75 && !l.startsWith(' '));
check('no unfolded line exceeds 75 octets', over.length === 0, `${over.length} lines`);

const uids = lines.filter((l) => l.startsWith('UID:'));
check('every event carries a UID', uids.length === sample.length);
check('UIDs are unique', new Set(uids).size === uids.length);

check('every event has DTSTAMP',
  lines.filter((l) => l.startsWith('DTSTAMP:')).length === sample.length);
check('every event has a start',
  lines.filter((l) => l.startsWith('DTSTART')).length === sample.length);
check('every event has a SUMMARY',
  lines.filter((l) => l.startsWith('SUMMARY:')).length === sample.length);

// DTSTAMP comes from the payload, not the clock, so the same data yields the
// same bytes -- which is what makes this suite meaningful at all.
check('the same events produce the same file',
  buildIcs(sample, { safeUrl, generatedAt: store.state.generatedAt }) === ics);

/* An all-day event must keep its nominal date. A holiday at noon UTC is
   already the next day in Auckland, so anything that goes through a Date
   moves Mexican Independence Day to the 17th for a reader in New Zealand. */
if (allDay.length) {
  const holidayIcs = buildIcs(allDay, { safeUrl, generatedAt: store.state.generatedAt });
  const kept = allDay.every((e) => holidayIcs.includes(`DTSTART;VALUE=DATE:${icsDate(e.ts)}`));
  check('all-day events keep their nominal date', kept, `${allDay.length} checked`);
  check('all-day events use a DATE value', holidayIcs.includes('DTSTART;VALUE=DATE:'));
  check('all-day events get an exclusive DTEND', holidayIcs.includes('DTEND;VALUE=DATE:'));
} else {
  check('all-day events exist to check', false, 'none in the window');
}

const timed = sample.filter((e) => !e.all_day);
check('timed events keep the UTC instant',
  timed.slice(0, 50).every((e) => ics.includes(`DTSTART:${icsStamp(e.ts)}`)));

// The one field that becomes a link.
const urls = lines.filter((l) => l.startsWith('URL:')).map((l) => l.slice(4));
check('every exported URL is http(s)',
  urls.every((u) => /^https?:\/\//i.test(u)), `${urls.length} urls`);

const hostile = [{
  id: 'x:1', ts: '2026-09-14T12:00:00Z', country: 'US', impact: 3, category: 'other',
  title: 'Evil, Event; With\\Everything', source_url: 'javascript:alert(1)',
}];
const hostileIcs = buildIcs(hostile, { safeUrl, generatedAt: store.state.generatedAt });
check('a javascript: source is dropped', !hostileIcs.includes('javascript:'));
check('punctuation in a title is escaped', hostileIcs.includes('Evil\\, Event\\; With\\\\Everything'));

/* --------------------------------------------------------------------- csv */

console.log('\n=== the spreadsheet file ===');

check('quotes only when needed', csvField('plain', ',') === 'plain');
check('a separator forces quotes', csvField('a,b', ',') === '"a,b"');
check('a semicolon dialect quotes on semicolons', csvField('a;b', ';') === '"a;b"');
check('a comma is safe in the semicolon dialect', csvField('a,b', ';') === 'a,b');
check('inner quotes are doubled', csvField('say "hi"', ',') === '"say ""hi"""');
check('a newline forces quotes', csvField('a\nb', ',') === '"a\nb"');
check('null is an empty cell', csvField(null, ',') === '');

// Excel and Sheets execute a cell that starts with these. The feeds do not
// produce one today; a fork's data is arbitrary.
for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)']) {
  check(`formula injection is defused: ${dangerous}`,
    csvField(dangerous, ',').startsWith("'"));
}

check('en uses comma and dot', JSON.stringify(csvDialect('en')) === JSON.stringify({ separator: ',', decimal: '.', bom: false }));
check('pt uses semicolon and comma', JSON.stringify(csvDialect('pt')) === JSON.stringify({ separator: ';', decimal: ',', bom: true }));
check('es matches pt', JSON.stringify(csvDialect('es')) === JSON.stringify(csvDialect('pt')));

setLang('en');
const csvEn = buildCsv(sample, { surpriseOf, lang: 'en' });
const rowsEn = csvEn.split('\r\n').filter(Boolean);
check('one header plus one row per event', rowsEn.length === sample.length + 1, `${rowsEn.length}`);
check('english csv has no BOM', !csvEn.startsWith('﻿'));
check('it is CRLF throughout', !/[^\r]\n/.test(csvEn.replace(/"[^"]*"/g, '')));

const columns = rowsEn[0].split(',').length;
const ragged = rowsEn.findIndex((row) => {
  // count separators outside quotes
  let inQuote = false; let count = 1;
  for (const ch of row) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) count += 1;
  }
  return count !== columns;
});
check('every row has the same column count', ragged === -1, ragged === -1 ? '' : `row ${ragged}`);

setLang('pt');
const csvPt = buildCsv(sample, { surpriseOf, lang: 'pt' });
check('portuguese csv carries a BOM', csvPt.startsWith('﻿'));
check('portuguese csv is semicolon separated', csvPt.split('\r\n')[0].includes(';'));
check('portuguese header is translated', csvPt.includes('Pa') && csvPt.includes('Evento'));

const withDecimal = sample.find((e) => typeof e.forecast === 'number' && !Number.isInteger(e.forecast));
if (withDecimal) {
  const row = csvPt.split('\r\n').find((r) => r.includes(String(withDecimal.forecast).replace('.', ',')));
  check('portuguese numbers use a decimal comma', Boolean(row), `${withDecimal.forecast}`);
} else {
  check('a fractional figure exists to check', false, 'none in the window');
}
setLang('en');

/* ---------------------------------------------------------------- filename */

console.log('\n=== the filename ===');

store.clearSelection();
check('day mode names the day', exportName('ics') === `orbis-${store.state.selectedDay}.ics`);
store.selectCountry('BR');
check('country mode names the country', exportName('csv') === `orbis-BR-${store.state.selectedDay}.csv`);
check('the filename is ASCII', /^[\x20-\x7e]+$/.test(exportName('csv')));
store.clearSelection();

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : '\nALL CHECKS PASSED\n');
process.exit(failures ? 1 : 0);
