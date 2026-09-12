/**
 * Smoke tests for the translation layer, run against the real data files.
 *
 *     node tests/i18n.test.mjs .
 *
 * The calendar is rebuilt on every run, so most of what matters here cannot be
 * pinned to a fixture: the feeds invent indicator names, holidays rotate
 * through the year, and countries come and go. These checks are written to
 * hold against whatever data/calendar.json happens to contain — the point is
 * that a title nobody has seen yet still comes out intact.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.argv[2];

// setLang writes to the document; the rest of the module never touches the DOM.
globalThis.document = { documentElement: { dataset: {} } };

const i18n = await import(pathToFileURL(path.join(ROOT, 'js', 'i18n.js')).href);
const { LANGS, UI, PHRASES, setLang, t, eventTitle, countryName } = i18n;

const calendar = JSON.parse(await readFile(path.join(ROOT, 'data', 'calendar.json'), 'utf8'));
const countries = JSON.parse(await readFile(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) { console.log(`  PASS  ${label}`); }
  else { console.log(`  FAIL  ${label}  ${detail}`); failures += 1; }
};

/* ----------------------------------------------------------------- parity */

console.log('\n=== parity ===');

const enKeys = Object.keys(UI.en);
for (const lang of LANGS) {
  const keys = Object.keys(UI[lang]);
  const missing = enKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !enKeys.includes(k));
  check(`${lang} has every UI key`, missing.length === 0, `missing ${missing.join(', ')}`);
  check(`${lang} has no stray UI key`, extra.length === 0, `extra ${extra.join(', ')}`);
  check(`${lang} leaves no UI string empty`,
    keys.every((k) => typeof UI[lang][k] === 'string' && UI[lang][k].length > 0));
}

const phraseLangs = Object.keys(PHRASES);
const englishOf = (lang) => new Set(PHRASES[lang].map(([english]) => english));
for (const lang of phraseLangs) {
  const mine = englishOf(lang);
  for (const other of phraseLangs) {
    if (other === lang) continue;
    const gaps = [...englishOf(other)].filter((p) => !mine.has(p));
    check(`${lang} covers every phrase ${other} covers`, gaps.length === 0,
      `${gaps.length} missing, e.g. ${gaps.slice(0, 3).join(' | ')}`);
  }
  const duplicates = PHRASES[lang].map(([e]) => e).filter((e, i, all) => all.indexOf(e) !== i);
  check(`${lang} phrase table has no duplicate key`, duplicates.length === 0, duplicates.join(', '));
}

/* ------------------------------------------------------------ word edges */

/**
 * The bug this guards against: a rule for "Adv" firing inside
 * "Advertisements" and emitting "préviaertisements". Each rule is probed on
 * its own, glued to a letter on either side, so the check does not depend on
 * which other rules happen to exist.
 */
console.log('\n=== word edges ===');

for (const lang of phraseLangs) {
  setLang(lang);
  const bleeding = [];

  for (const [english, translated] of PHRASES[lang]) {
    // A phrase alone must translate, or the rule is dead weight.
    if (eventTitle(english) === english && translated !== english) {
      bleeding.push(`${english} (never fires)`);
      continue;
    }
    // Glued to a letter, nothing should fire on that occurrence.
    for (const probe of [`Qx${english}`, `${english}Qx`]) {
      if (eventTitle(probe).includes(translated) && !english.includes(translated)) {
        bleeding.push(`${english} -> ${eventTitle(probe)}`);
        break;
      }
    }
  }

  check(`${lang} rules only fire on whole words`, bleeding.length === 0,
    `${bleeding.length} bleed, e.g. ${bleeding.slice(0, 3).join(' | ')}`);
}

/* --------------------------------------------------------- live calendar */

/**
 * Every word coming out of a translation has to be traceable: either it was
 * already in the English title, or it belongs to one of the phrases we
 * deliberately substituted. A word that is neither is a splice — half an
 * English word welded to half a translated one.
 */
console.log('\n=== live calendar ===');

const strip = (word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
const wordsOf = (text) => text.split(/\s+/).map(strip).filter(Boolean);

const titles = [...new Set(calendar.events.map((e) => e.title))];

for (const lang of phraseLangs) {
  setLang(lang);

  const known = new Set();
  for (const [english, translated] of PHRASES[lang]) {
    for (const word of wordsOf(english)) known.add(word);
    for (const word of wordsOf(translated)) known.add(word);
  }

  const spliced = [];
  for (const title of titles) {
    const allowed = new Set([...known, ...wordsOf(title)]);
    for (const word of wordsOf(eventTitle(title))) {
      if (!allowed.has(word)) { spliced.push(`${title} -> ${eventTitle(title)}`); break; }
    }
  }

  check(`${lang} never splices a word on the live feed`, spliced.length === 0,
    `${spliced.length} of ${titles.length}, e.g. ${spliced.slice(0, 2).join(' | ')}`);
}

setLang('en');
check('English titles pass through untouched', titles.every((title) => eventTitle(title) === title));
check('translating twice changes nothing more', phraseLangs.every((lang) => {
  setLang(lang);
  return titles.every((title) => {
    const once = eventTitle(title);
    return eventTitle(once) === once;
  });
}));

/* --------------------------------------------------------------- countries */

console.log('\n=== countries ===');

const codes = [...new Set(calendar.events.map((e) => e.country))];
check('every country on the feed is in countries.json',
  codes.every((code) => countries[code]),
  codes.filter((code) => !countries[code]).join(', '));

for (const lang of LANGS) {
  setLang(lang);
  const nameless = Object.entries(countries).filter(([, c]) => !countryName(c)).map(([code]) => code);
  check(`${lang} names every country`, nameless.length === 0, nameless.join(', '));

  const english = Object.entries(countries)
    .filter(([, c]) => lang !== 'en' && countryName(c) === c.name_en && !c[`name_${lang}`]);
  check(`${lang} has no country falling back to English`, english.length === 0,
    english.map(([code]) => code).join(', '));
}

/* ------------------------------------------------------------------ UI use */

console.log('\n=== ui strings ===');

const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const used = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
check('every key the markup asks for exists', used.every((key) => enKeys.includes(key)),
  used.filter((key) => !enKeys.includes(key)).join(', '));

for (const lang of LANGS) {
  setLang(lang);
  check(`${lang} resolves every markup key`, used.every((key) => t(key) === UI[lang][key]));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
