/**
 * Taking the events off the screen and into somebody else's tool.
 *
 * Two formats, because they answer different questions. The .ics goes into a
 * calendar, where an event is something that will happen and needs to be seen
 * coming. The .csv goes into a spreadsheet, where an event is a row to sort,
 * filter and total. Neither substitutes for the other, and they share
 * everything that matters: the same events, the same language, the same
 * download.
 *
 * Everything here is a pure function over already-loaded state. Nothing
 * touches the network, nothing touches the DOM -- the click handler in
 * panels.js does both -- which is what lets tests/export.test.mjs run this
 * under plain `node`.
 */

import { state } from './store.js';
import { t, eventTitle, countryName, categoryLabel, impactLabel, getLang } from './i18n.js';

/* --------------------------------------------------------------- iCalendar */

/**
 * Escape a value for an iCalendar text property (RFC 5545 §3.3.11).
 *
 * Backslash first, or the escapes introduced below get escaped again and a
 * comma leaves as `\\,`. Live data needs this: 48 issuers carry a comma
 * ("INEGI - Instituto Nacional de Estadistica, Geografia e Informatica") and
 * two titles do. Semicolons, backslashes and newlines are absent from the
 * feeds today, which is exactly why they are handled here rather than when
 * one finally appears.
 */
export function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Fold a content line to 75 octets (RFC 5545 §3.1), never mid-character.
 *
 * The limit is in octets, not characters, and the calendar is not ASCII:
 * "ECB Vujčić Speech" and "2037 OAT€i Auction" are both longer in bytes than
 * in characters. Splitting a UTF-8 sequence in half produces mojibake in the
 * importing client, so the cut is walked back off any continuation byte
 * (0b10xxxxxx) before it lands.
 *
 * A continuation line begins with one space, and that space counts toward the
 * 75 -- hence 74 for every segment after the first.
 */
export function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const parts = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut inside a multi-byte character.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = 74;
  }

  return parts.join('\r\n ');
}

/** An instant as iCalendar UTC: 20260914T123000Z. */
export function icsStamp(iso) {
  return String(iso).replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/**
 * The nominal calendar date, as a DATE value: 20260916.
 *
 * Sliced off the string, never parsed into a Date. A holiday is a date, not an
 * instant -- Christmas is the 25th in Auckland and in Los Angeles alike -- and
 * the collector already anchors them at noon UTC to survive sorting. Noon
 * still crosses: 2026-09-16T12:00:00Z is the 17th in Kiritimati and Auckland,
 * so Mexican Independence Day would land on the wrong day for a reader in New
 * Zealand the moment it went through a Date. The string does not have that
 * problem.
 */
export function icsDate(iso) {
  return String(iso).slice(0, 10).replace(/-/g, '');
}

/** The day after a nominal date. DTEND on a DATE value is exclusive. */
function nextDay(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Thirty minutes after an instant: the feeds publish no duration, and a
 *  zero-length event draws as a hairline in most clients. */
function halfHourLater(iso) {
  return icsStamp(new Date(new Date(iso).getTime() + 30 * 60000).toISOString());
}

/** What a human should read in the calendar entry. */
function describe(event) {
  const lines = [];
  const country = state.countries[event.country];
  if (country) lines.push(`${countryName(country)} · ${categoryLabel(event.category)}`);
  lines.push(`${t('impact')}: ${impactLabel(event.impact)}`);
  if (event.period) lines.push(`${t('period')}: ${event.period}`);
  if (event.issuer) lines.push(`${t('issuer')}: ${event.issuer}`);
  if (event.forecast !== null && event.forecast !== undefined) {
    lines.push(`${t('forecast')}: ${event.forecast}${event.unit === '%' ? '%' : ''}`);
  }
  if (event.previous !== null && event.previous !== undefined) {
    lines.push(`${t('previous')}: ${event.previous}${event.unit === '%' ? '%' : ''}`);
  }
  return lines.join('\n');
}

/**
 * A VCALENDAR for the given events.
 *
 * `safeUrl` gates the one field that becomes a link. The collector already
 * filters it and no live row fails, which is the point: this is the second
 * layer, and a fork's data can come from anywhere.
 */
export function buildIcs(events, { safeUrl, generatedAt } = {}) {
  const stamp = icsStamp((generatedAt || new Date().toISOString()).replace(/\.\d+/, ''));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//orbis//economic calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Non-standard, and the only way Apple and Google show a calendar name.
    `X-WR-CALNAME:${escapeText(t('ics_calname'))}`,
  ];

  for (const event of events) {
    const country = state.countries[event.country];
    const where = country ? countryName(country) : event.country;

    lines.push('BEGIN:VEVENT');
    // The id is stable across rebuilds, so re-importing updates an entry
    // rather than adding a second copy of it.
    lines.push(`UID:${event.id}@orbis`);
    lines.push(`DTSTAMP:${stamp}`);

    if (event.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(event.ts)}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(event.ts)}`);
    } else {
      lines.push(`DTSTART:${icsStamp(event.ts)}`);
      lines.push(`DTEND:${halfHourLater(event.ts)}`);
    }

    lines.push(`SUMMARY:${escapeText(`${eventTitle(event.title)} · ${where}`)}`);
    lines.push(`DESCRIPTION:${escapeText(describe(event))}`);
    lines.push(`CATEGORIES:${escapeText(categoryLabel(event.category))}`);

    const url = safeUrl ? safeUrl(event.source_url) : null;
    if (url) lines.push(`URL:${url}`);

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // CRLF throughout, and a trailing one: RFC 5545 §3.1 asks for it and some
  // parsers drop the final property without it.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/* --------------------------------------------------------------------- CSV */

/**
 * Which CSV the spreadsheet on the other side is expecting.
 *
 * There is no single right answer, so this follows the language already on
 * screen. Excel in a Portuguese or Spanish locale reads `;` as the separator
 * and `,` as the decimal mark, and opens a comma-separated file as one column
 * of text; in an English locale the opposite holds. Somebody reading the page
 * in Portuguese is overwhelmingly likely to open the file in that same Excel.
 *
 * The BOM is for the same reason: without it Excel decodes UTF-8 as Latin-1
 * and "Inflação" arrives as "InflaÃ§Ã£o". Tools that read the standard (pandas,
 * R, Sheets) skip a BOM without being asked, so it costs them nothing.
 */
export function csvDialect(lang = getLang()) {
  return lang === 'en'
    ? { separator: ',', decimal: '.', bom: false }
    : { separator: ';', decimal: ',', bom: true };
}

/**
 * Quote a CSV field (RFC 4180 §2): only when it has to be, and doubling any
 * quote inside. A field is also quoted when it merely *starts* with a
 * character Excel would read as a formula -- see below.
 */
export function csvField(value, separator = ',') {
  if (value === null || value === undefined) return '';
  let text = String(value);

  // Formula injection: a cell beginning = + - @ or a control character is
  // executed by Excel and Sheets on open, which turns a calendar download into
  // a way to run something on the reader's machine. The feeds do not produce
  // such a title today; a fork's data is arbitrary. Prefixing an apostrophe
  // is the standard defusal and shows nothing in the cell.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  const mustQuote = text.includes(separator)
    || text.includes('"')
    || text.includes('\n')
    || text.includes('\r');

  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A number in the dialect's decimal mark, or an empty cell. */
function csvNumber(value, decimal) {
  if (value === null || value === undefined) return '';
  return decimal === ',' ? String(value).replace('.', ',') : String(value);
}

/**
 * One row per event, in the language on screen.
 *
 * Columns are the fields a reader can actually do something with: when, where,
 * what, how much it mattered, and the three figures. `surprise` is the signed
 * difference the panel already computes, so a spreadsheet can sort by it
 * without redoing the arithmetic.
 */
export function buildCsv(events, { surpriseOf, lang } = {}) {
  const { separator, decimal, bom } = csvDialect(lang);

  const headers = [
    t('csv_date'), t('csv_time'), t('csv_country'), t('csv_event'),
    t('category'), t('impact'), t('actual'), t('forecast'), t('previous'),
    t('csv_surprise'), t('csv_unit'), t('csv_source'),
  ];

  const rows = [headers.map((h) => csvField(h, separator)).join(separator)];

  for (const event of events) {
    const country = state.countries[event.country];
    const surprise = surpriseOf ? surpriseOf(event) : null;

    rows.push([
      event.ts.slice(0, 10),
      // All-day events have a nominal date and no meaningful time.
      event.all_day ? t('all_day') : event.ts.slice(11, 16),
      country ? countryName(country) : event.country,
      eventTitle(event.title),
      categoryLabel(event.category),
      impactLabel(event.impact),
      csvNumber(event.actual, decimal),
      csvNumber(event.forecast, decimal),
      csvNumber(event.previous, decimal),
      surprise ? csvNumber(Number(surprise.delta.toFixed(4)), decimal) : '',
      event.unit ?? '',
      event.issuer ?? event.source,
    ].map((cell) => csvField(cell, separator)).join(separator));
  }

  // CRLF per RFC 4180, and the BOM where Excel needs it to read UTF-8.
  return `${bom ? '﻿' : ''}${rows.join('\r\n')}\r\n`;
}

/* ---------------------------------------------------------------- filename */

/**
 * A filename that says what is inside, in ASCII.
 *
 * The `download` attribute carries no encoding declaration, and a non-ASCII
 * name is mangled by enough clients to be not worth the risk -- so the country
 * code and the ISO date do the describing rather than a translated word.
 */
export function exportName(extension) {
  const scope = state.selectedCountry ? `-${state.selectedCountry}` : '';
  return `orbis${scope}-${state.selectedDay}.${extension}`;
}
