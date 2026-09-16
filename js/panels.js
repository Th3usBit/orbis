/**
 * DOM rendering for every panel around the globe.
 *
 * Pure render functions: they read from the store and rewrite their own
 * subtree. No partial diffing — these lists are small enough that clarity is
 * worth more than the microseconds.
 */

import {
  IMPACTS, REGIONS, state, dayList, panelEvents, filterCounts,
  selectDay, selectCountry, toggleEvent, toggleFilter, clearSelection, todayKey, activeFilterCount, isNarrowed, resetFilters,
  IMPACT_COLORS, REGION_COLOR,
} from './store.js';
import {
  t, tCount, locale, categoryLabel, impactLabel, regionLabel, eventTitle, countryName,
} from './i18n.js';
import { buildIcs, buildCsv, exportName } from './export.js';

const $ = (id) => document.getElementById(id);

// Twelve hours: the schedule asks for a rebuild every three and GitHub drops
// most of what it is asked for, so four missed windows is a pattern rather
// than bad luck.
const STALE_AFTER_MINUTES = 12 * 60;

/* ------------------------------------------------------------------ utils */

/**
 * A link target from the calendar, or null if it is not an ordinary web link.
 *
 * calendar.json is generated from third-party feeds, and in a fork it may come
 * from anywhere. Every other field is rendered as text, which cannot execute;
 * source_url becomes an href, which can. The collector already filters this,
 * so the check here is the second layer rather than the only one.
 */
export function safeUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/** ISO 3166-1 alpha-2 to a flag emoji, via the regional indicator block. */
export function flagOf(code) {
  if (!code || code.length !== 2) return '🏳';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';

  const magnitude = Math.abs(value);
  let text;

  if (magnitude >= 10000) {
    text = new Intl.NumberFormat(locale(), {
      notation: 'compact', maximumFractionDigits: 1,
    }).format(value);
  } else {
    text = new Intl.NumberFormat(locale(), {
      maximumFractionDigits: magnitude < 10 ? 2 : 1,
    }).format(value);
  }

  if (unit === '%') return `${text}%`;
  if (unit && unit.length <= 4) return `${text} ${unit}`;
  return text;
}

function timeOf(date) {
  return date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false });
}

function longDate(date) {
  return date.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Signed difference between the release and what was expected. */
export function surpriseOf(event) {
  if (event.actual === null || event.forecast === null) return null;

  const delta = event.actual - event.forecast;
  if (Math.abs(delta) < 1e-9) return { delta: 0, direction: 'inline', percent: 0 };

  const percent = event.forecast !== 0
    ? (delta / Math.abs(event.forecast)) * 100
    : null;

  return { delta, direction: delta > 0 ? 'beat' : 'miss', percent };
}

/* ---------------------------------------------------------------- filters */

export function renderFilters() {
  renderFilterRows($('filter-impact'), 'impact', IMPACTS,
    (value) => impactLabel(value), (value) => IMPACT_COLORS[value]);

  renderFilterRows($('filter-region'), 'region', REGIONS,
    (value) => regionLabel(value), () => REGION_COLOR);

  renderCategoryChips();
}

function renderFilterRows(host, dimension, values, label, color) {
  const counts = filterCounts(dimension);
  host.replaceChildren();

  for (const value of values) {
    const active = state.filters[dimension].has(value);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `filter-row${active ? '' : ' is-off'}`;
    row.setAttribute('aria-pressed', String(active));
    row.style.color = color(value);

    const dot = document.createElement('span');
    dot.className = 'filter-dot';

    const name = document.createElement('span');
    name.className = 'filter-label';
    name.textContent = label(value);

    const count = document.createElement('span');
    count.className = 'filter-count';
    count.textContent = counts.get(value) || 0;

    row.append(dot, name, count);
    row.addEventListener('click', () => toggleFilter(dimension, value));
    host.append(row);
  }
}

function renderCategoryChips() {
  const host = $('filter-category');
  const counts = filterCounts('category');
  const selected = state.filters.category;

  host.replaceChildren();

  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  // An empty selection means "every category", so every chip is on. Drawing
  // them all as off in that state said the opposite of what the globe showed.
  const everything = selected.size === 0;

  for (const category of categories) {
    const on = everything || selected.has(category);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${on ? ' is-on' : ''}${everything ? ' is-all' : ''}`;
    chip.setAttribute('aria-pressed', String(on));

    const label = document.createElement('span');
    label.textContent = categoryLabel(category);

    const count = document.createElement('span');
    count.className = 'chip-count';
    count.textContent = counts.get(category);

    chip.append(label, count);
    chip.addEventListener('click', () => toggleFilter('category', category, categories));
    host.append(chip);
  }
}

/* --------------------------------------------------------------- timeline */

export function renderTimeline() {
  const host = $('tl-track');
  const days = dayList();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const busiest = Math.max(1, ...days.map((day) => day.total));
  // Asked before the strip is torn down, because afterwards the focused cell
  // is gone and the answer is always no.
  const focusWasInTimeline = host.contains(document.activeElement);
  host.replaceChildren();

  let lastMonth = null;

  for (const day of days) {
    const isToday = day.date.getTime() === today.getTime();
    const weekday = day.date.getDay();

    const isSelected = day.key === state.selectedDay;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'tl-day';
    cell.classList.toggle('is-selected', isSelected);
    // The blue border says "this day" to anyone looking at it. A screen reader
    // was handed twenty-nine identical buttons with no way to tell which one
    // the list below belongs to; aria-current is the same fact, said out loud.
    if (isSelected) cell.setAttribute('aria-current', 'date');
    cell.classList.toggle('is-today', isToday);
    cell.classList.toggle('is-past', day.date < today);
    cell.classList.toggle('is-weekend', weekday === 0 || weekday === 6);
    cell.title = `${longDate(day.date)} — ${tCount(day.total)}`;

    const month = document.createElement('span');
    month.className = 'tl-month';
    const monthName = day.date.toLocaleDateString(locale(), { month: 'short' });
    month.textContent = monthName !== lastMonth ? monthName : '';
    lastMonth = monthName;

    const dow = document.createElement('span');
    dow.className = 'tl-dow';
    dow.textContent = day.date.toLocaleDateString(locale(), { weekday: 'short' }).slice(0, 3);

    const num = document.createElement('span');
    num.className = 'tl-num';
    num.textContent = day.date.getDate();

    const bar = document.createElement('span');
    bar.className = 'tl-bar';
    // Stacked by impact, tallest impact on top, scaled against the busiest day.
    for (const impact of [1, 0, 2, 3]) {
      const value = day.counts[impact];
      if (!value) continue;
      const segment = document.createElement('i');
      segment.className = 'tl-seg';
      segment.style.background = IMPACT_COLORS[impact];
      segment.style.height = `${Math.max((value / busiest) * 100, 7)}%`;
      segment.style.opacity = impact >= 2 ? '0.95' : '0.5';
      bar.append(segment);
    }

    cell.append(month, dow, num, bar);
    cell.dataset.day = day.key;
    cell.addEventListener('click', () => selectDay(day.key));
    host.append(cell);
  }

  // Twenty-nine days used to be twenty-nine tab stops. One stop gets you into
  // the strip; the arrows move along it from there, which is how a date picker
  // behaves and what a keyboard user tries first.
  rollTabStops(host);

  // Centre the selected day by moving this track only. scrollIntoView would
  // also scroll any scrollable ancestor, which is how the left rail ended up
  // scrolled past its first card.
  const selected = host.querySelector('.is-selected');
  if (selected) {
    host.scrollTo({
      left: selected.offsetLeft - (host.clientWidth - selected.clientWidth) / 2,
      behavior: 'smooth',
    });
  }

  // These cells are rebuilt on every day change, so the element the user was
  // standing on no longer exists by the time the new strip is in place --
  // pressing → sent focus back to the top of the document. Put it back on the
  // day that is now selected, but only if it was in here to begin with.
  if (focusWasInTimeline) selected?.focus({ preventScroll: true });
}

/**
 * Is the keypress addressed to the view rather than to a control?
 *
 * True when nothing is focused (the page itself, after a click on the globe),
 * when the globe has it, or when focus is somewhere in the event list -- the
 * places where "the day" and "the selection" are what the user is looking at.
 * A focused button, chip or flag is a control, and its keys are its own.
 */
function viewHasFocus(target) {
  if (!target || target === document.body || target === document.documentElement) return true;
  if (target.id === 'stage') return true;
  return Boolean(target.closest?.('#event-list'));
}

/**
 * One tab stop for the whole strip, arrows to move within it.
 *
 * The pattern is the roving tabindex from the ARIA authoring practices: every
 * cell but the current one is taken out of the tab order, so Tab treats the
 * timeline as a single control and the arrows do the walking inside it.
 */
function rollTabStops(host) {
  const cells = [...host.children];
  if (!cells.length) return;
  const current = cells.find((cell) => cell.classList.contains('is-selected')) ?? cells[0];
  for (const cell of cells) cell.tabIndex = cell === current ? 0 : -1;
}

/** Move along the timeline with the arrow keys, selecting as we go. */
function bindTimelineKeys() {
  const host = $('tl-track');
  if (!host) return;

  host.addEventListener('keydown', (event) => {
    const cell = event.target.closest?.('.tl-day');
    if (!cell) return;

    const cells = [...host.children];
    const index = cells.indexOf(cell);
    let next = null;

    if (event.key === 'ArrowLeft') next = cells[index - 1];
    else if (event.key === 'ArrowRight') next = cells[index + 1];
    else if (event.key === 'Home') next = cells[0];
    else if (event.key === 'End') next = cells.at(-1);
    else return;

    // Stop even at the ends of the strip: the page-level shortcut would
    // otherwise pick the same keypress up and step the day anyway, which is
    // the bug this pattern exists to avoid.
    event.preventDefault();
    if (!next) return;

    // selectDay rebuilds the strip; renderTimeline restores focus from here.
    selectDay(next.dataset.day);
  });
}

/* ------------------------------------------------------------- event list */

/**
 * One tab stop for the whole list, arrows to move within it.
 *
 * The same roving tabindex the timeline uses, for the same reason and at a
 * worse scale: the busiest day in the window is 226 events, so Tab meant 226
 * presses to get past the panel -- and the skip link that exists to reach the
 * list was no help at all to anyone trying to leave it. The current row is the
 * open one, else the one that had focus, else the first.
 */
function rollEventStops(host) {
  const rows = [...host.querySelectorAll('.event')];
  if (!rows.length) return;

  const current = rows.find((row) => row.classList.contains('is-open'))
    ?? rows.find((row) => row.tabIndex === 0)
    ?? rows[0];

  for (const row of rows) row.tabIndex = row === current ? 0 : -1;
}

/**
 * Arrow-key navigation for the event list.
 *
 * Moving focus does not open anything: the rows are a list to read through,
 * and expanding every one on the way past would be unusable. Enter and Space
 * are the button's own, and already toggle the detail.
 */
function bindEventListKeys() {
  const host = $('event-list');
  if (!host) return;

  host.addEventListener('keydown', (event) => {
    const row = event.target.closest?.('.event');
    if (!row) return;

    const rows = [...host.querySelectorAll('.event')];
    const index = rows.indexOf(row);
    let next = null;

    if (event.key === 'ArrowDown') next = rows[index + 1];
    else if (event.key === 'ArrowUp') next = rows[index - 1];
    else if (event.key === 'Home') next = rows[0];
    else if (event.key === 'End') {
      // End means the end of the list, not the end of what happens to be
      // drawn, so the tail is flushed before we go looking for the last row.
      drainPending(host);
      next = [...host.querySelectorAll('.event')].at(-1);
    } else return;

    // Claimed even when there is nowhere to go: at the last row ArrowDown must
    // not fall through to the page handler and scroll the panel out from under
    // the user, and the day shortcuts are ArrowLeft/Right for the same reason.
    event.preventDefault();
    if (!next || next === row) return;

    // Near the bottom of what is drawn, draw more before moving onto it.
    if (index >= rows.length - 3) appendChunk(host, NEXT_CHUNK);

    for (const other of rows) other.tabIndex = -1;
    next.tabIndex = 0;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
  });
}

/** Draw everything still pending, in one go. */
function drainPending(host) {
  while (pending) appendChunk(host, NEXT_CHUNK * 4);
}

/**
 * Draw more of the list as the reader approaches the end of it.
 *
 * Scroll, not IntersectionObserver: there is one scroller and one threshold,
 * and a sentinel element would have to be moved and re-observed on every
 * chunk. Also the one case an observer misses -- a panel taller than its
 * content, which never scrolls at all -- is handled by the same call.
 */
function bindEventListScroll() {
  const host = $('event-list');
  if (!host) return;

  host.addEventListener('scroll', () => {
    if (!pending) return;
    if (host.scrollTop + host.clientHeight >= host.scrollHeight - 600) {
      appendChunk(host, NEXT_CHUNK);
    }
  }, { passive: true });
}

/**
 * The skip link points here, and a div is not focusable without help.
 *
 * It used to carry tabindex="0", which made the container itself a tab stop
 * sitting in front of the rows. The roving tabindex gives the list a stop of
 * its own now, so the link moves focus to the current row instead -- which is
 * both a real place to start reading and the thing the arrows then move.
 */
function bindSkipLink() {
  const link = document.querySelector('.skip-link');
  const host = $('event-list');
  if (!link || !host) return;

  link.addEventListener('click', (event) => {
    const first = host.querySelector('.event[tabindex="0"]') ?? host.querySelector('.event');
    if (!first) return;          // empty list: let the browser jump to the container
    event.preventDefault();
    first.focus();
    first.scrollIntoView({ block: 'nearest' });
  });
}

export function renderPanel() {
  const { mode, events } = panelEvents();
  const host = $('event-list');
  const reset = $('panel-reset');

  if (mode === 'country') {
    const country = state.countries[state.selectedCountry];
    $('panel-title').textContent = `${flagOf(state.selectedCountry)}  ${countryName(country)}`;
    $('panel-sub').textContent = tCount(events.length);
  } else {
    const date = events[0]?.date ?? new Date(`${state.selectedDay}T12:00:00`);
    $('panel-title').textContent = longDate(date);
    $('panel-sub').textContent = tCount(events.length);
  }

  // Reset is offered whenever anything is narrowing the view -- a filter, a
  // category, a country -- not only when a country is selected. Filtering down
  // to nothing and finding no way back is the worst version of this screen.
  reset.hidden = !isNarrowed();

  // Nothing to export is not an empty file: it is no button. A VCALENDAR with
  // no VEVENT is rejected by some clients, and a spreadsheet of headers alone
  // answers nothing.
  const exportable = events.length > 0;
  $('export-ics').hidden = !exportable;
  $('export-csv').hidden = !exportable;

  // Which row the keyboard was on, asked before the list is torn down. The
  // rows are rebuilt from scratch on every render, so afterwards the focused
  // element is detached and the answer is always no.
  const focusedId = host.contains(document.activeElement)
    ? document.activeElement.closest('.event')?.dataset.eventId ?? null
    : null;

  host.replaceChildren();
  pending = null;

  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.innerHTML = `${t('no_events')}<br><span style="opacity:.65">${t('no_events_hint')}</span>`;
    host.append(empty);
    // Nothing to arrow through, and a listbox with no options is a lie.
    host.removeAttribute('role');
    host.removeAttribute('aria-label');
    host.tabIndex = -1;
    return;
  }

  // A list of buttons is a list of buttons to a screen reader: 93 stops with
  // nothing saying they belong together. Naming it and letting the arrows walk
  // it is the listbox pattern, and it is what the label now promises.
  host.setAttribute('role', 'listbox');
  host.setAttribute('aria-label', t('aria_event_list'));
  // The roving tabindex lives on the rows; the container must not also be a
  // stop, or Tab lands on the list and then again on the first row.
  host.tabIndex = -1;

  // Paint one screenful now and hand the rest to the scroll handler. The whole
  // day was being built on every render -- 226 rows on the busiest day in the
  // window, to show the four that fit on a phone -- and the cost scaled with
  // the day: 24.4ms of synchronous work on average, 33ms on that day, against
  // 12.8ms flat now. The rows are the same rows and they all still arrive;
  // only *when* changed, so Ctrl+F, the sticky hour headers and the scrollbar
  // behave exactly as before.
  pending = { events, mode, now: Date.now(), index: 0, lastGroup: null, focusedId };
  appendChunk(host, FIRST_CHUNK);
}

/* How many rows to paint immediately, and how many to add per scroll. The
   first number covers the tallest panel we lay out (about 12 rows at 1080p)
   with room to spare, so nobody ever sees the list grow. */
const FIRST_CHUNK = 24;
const NEXT_CHUNK = 24;

/* The unrendered tail of the current list, or null when everything is drawn. */
let pending = null;

/**
 * Draw the next `count` events into the list.
 *
 * Kept deliberately close to the loop it replaced: same grouping, same rows,
 * same detail panel. The only new job is remembering where it stopped.
 */
function appendChunk(host, count) {
  if (!pending) return;
  const { events, mode, now } = pending;
  const limit = Math.min(pending.index + count, events.length);

  for (; pending.index < limit; pending.index += 1) {
    const event = events[pending.index];
    const group = mode === 'country'
      ? event.date.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })
      : `${String(event.date.getHours()).padStart(2, '0')}:00`;

    if (group !== pending.lastGroup) {
      const head = document.createElement('div');
      head.className = 'hour-head';
      // A listbox holds options; a loose text node between them is announced
      // as a stray label belonging to nothing. Hidden from the tree rather
      // than removed: the hour is a visual anchor while scrolling, and every
      // row already carries its own time in its accessible name.
      head.setAttribute('role', 'presentation');
      head.setAttribute('aria-hidden', 'true');
      head.textContent = group;
      host.append(head);
      pending.lastGroup = group;
    }

    host.append(buildEventRow(event, now));

    if (state.openEventId === event.id) {
      host.append(buildEventDetail(event));
    }
  }

  const done = pending.index >= events.length;
  const focusedId = pending.focusedId;
  if (done) pending = null;

  rollEventStops(host);

  // Put the keyboard back where it was, once the row it was on exists again.
  if (focusedId) {
    const again = host.querySelector(`.event[data-event-id="${CSS.escape(focusedId)}"]`);
    if (again) {
      again.focus({ preventScroll: true });
      if (pending) pending.focusedId = null;
    }
  }
}

function buildEventRow(event, now) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'event';
  const isOpen = state.openEventId === event.id;
  row.classList.toggle('is-open', isOpen);
  row.classList.toggle('is-past', event.time < now);
  // The id is how focus finds its way back to this row after a re-render, and
  // how the arrow keys know which one they are standing on.
  row.dataset.eventId = event.id;
  row.setAttribute('role', 'option');
  // The row expands a detail panel below it, which is a fact the border shows
  // and a screen reader otherwise never hears.
  row.setAttribute('aria-expanded', String(isOpen));
  row.setAttribute('aria-selected', String(isOpen));

  const bar = document.createElement('span');
  bar.className = 'event-bar';
  bar.style.color = IMPACT_COLORS[event.impact];

  const time = document.createElement('span');
  time.className = 'event-time';
  if (event.all_day) {
    time.classList.add('is-allday');
    time.textContent = t('all_day');
  } else {
    time.textContent = timeOf(event.date);
  }

  const main = document.createElement('span');
  main.className = 'event-main';

  const title = document.createElement('span');
  title.className = 'event-title';
  title.textContent = eventTitle(event.title);

  const sub = document.createElement('span');
  sub.className = 'event-sub';

  const flag = document.createElement('span');
  flag.className = 'event-flag';
  flag.textContent = flagOf(event.country);

  const where = document.createElement('span');
  where.textContent = `${countryName(state.countries[event.country])} · ${categoryLabel(event.category)}`;

  sub.append(flag, where);

  if (event.confirmed_by?.length) {
    const verified = document.createElement('span');
    verified.className = 'event-verified';
    verified.textContent = '✦';
    verified.title = t('confirmed');
    sub.append(verified);
  }

  main.append(title, sub);

  const metric = document.createElement('span');
  metric.className = 'event-metric';
  metric.append(buildMetricPreview(event));

  row.append(bar, time, main, metric);
  row.addEventListener('click', () => toggleEvent(event.id));

  return row;
}

function buildMetricPreview(event) {
  const fragment = document.createDocumentFragment();

  if (event.actual !== null) {
    const surprise = surpriseOf(event);
    const value = document.createElement('span');
    value.textContent = formatValue(event.actual, event.unit);
    if (surprise && surprise.direction !== 'inline') {
      value.className = surprise.direction === 'beat' ? 'is-up' : 'is-down';
    }
    fragment.append(value);
  } else if (event.forecast !== null) {
    const value = document.createElement('span');
    // A forecast is marked by the tilde and by its own colour, never by fading
    // the text: partial opacity dropped this to 3.42:1, and a number nobody
    // can read is not a softer number, it is a missing one.
    value.className = 'is-forecast';
    value.textContent = `~${formatValue(event.forecast, event.unit)}`;
    fragment.append(value);
  }

  return fragment;
}

function buildEventDetail(event) {
  const detail = document.createElement('div');
  detail.className = 'event-detail';

  const readings = document.createElement('div');
  readings.className = 'readings';

  const surprise = surpriseOf(event);

  for (const [key, value, extra] of [
    ['actual', event.actual, 'is-actual'],
    ['forecast', event.forecast, ''],
    ['previous', event.previous, ''],
  ]) {
    const cell = document.createElement('div');
    cell.className = `reading ${extra}`.trim();

    const label = document.createElement('span');
    label.className = 'reading-label';
    label.textContent = t(key);

    const figure = document.createElement('span');
    figure.className = 'reading-value';
    if (value === null) figure.classList.add('is-empty');
    if (key === 'actual' && surprise && surprise.direction !== 'inline') {
      figure.classList.add(surprise.direction === 'beat' ? 'is-up' : 'is-down');
    }
    figure.textContent = formatValue(value, event.unit);

    cell.append(label, figure);
    readings.append(cell);
  }

  detail.append(readings);

  if (surprise) {
    const line = document.createElement('div');
    line.className = 'surprise';

    const pill = document.createElement('span');
    pill.className = 'surprise-pill';
    pill.style.color = surprise.direction === 'beat' ? 'var(--up)'
      : surprise.direction === 'miss' ? 'var(--down)' : 'var(--ink-dim)';
    pill.textContent = surprise.direction === 'inline'
      ? '='
      : `${surprise.delta > 0 ? '+' : ''}${formatValue(surprise.delta, event.unit)}`;

    const text = document.createElement('span');
    text.textContent = t(surprise.direction);

    line.append(pill, text);
    detail.append(line);
  } else if (event.actual === null && event.impact > 0) {
    const pending = document.createElement('div');
    pending.className = 'surprise';
    pending.textContent = t('pending');
    detail.append(pending);
  }

  const meta = document.createElement('div');
  meta.className = 'detail-meta';

  if (event.period) meta.append(chipText(`${t('period')}: ${event.period}`));
  if (event.issuer) meta.append(chipText(`${t('issuer')}: ${event.issuer}`));

  const sourceUrl = safeUrl(event.source_url);
  if (sourceUrl) {
    const link = document.createElement('a');
    link.href = sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${t('source')} ↗`;
    meta.append(link);
  }

  if (event.confirmed_by?.length) meta.append(chipText(`✦ ${t('confirmed')}`));

  detail.append(meta);
  return detail;
}

function chipText(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

/* ------------------------------------------------------------ next / meta */

export function renderNextEvent(event) {
  const card = $('next-card');

  if (!event) {
    $('next-title').textContent = t('no_upcoming');
    $('next-country').textContent = '';
    $('next-flag').textContent = '🌐';
    $('next-date').textContent = '';
    $('next-countdown').textContent = '--:--:--';
    card.dataset.eventId = '';
    return;
  }

  $('next-flag').textContent = flagOf(event.country);
  $('next-title').textContent = eventTitle(event.title);
  $('next-country').textContent = countryName(state.countries[event.country]);
  $('next-date').textContent = `${event.date.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} · ${timeOf(event.date)}`;
  card.dataset.eventId = event.id;
}

export function renderCountdown(event) {
  const node = $('next-countdown');
  if (!event) return;

  const remaining = event.time - Date.now();
  node.classList.toggle('is-imminent', remaining > 0 && remaining < 3600_000);
  node.classList.toggle('is-live', remaining <= 0);

  if (remaining <= 0) {
    node.textContent = t('live_now');
    return;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  node.textContent = days > 0
    ? `${days}d ${pad(hours)}:${pad(minutes)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function renderSources() {
  const host = $('source-list');
  host.replaceChildren();

  for (const source of state.sources) {
    const item = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = `source-dot${source.ok ? '' : ' is-down'}`;
    if (!source.ok && source.error) item.title = source.error;

    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.name;

    const count = document.createElement('span');
    count.className = 'source-count';
    count.textContent = source.events;

    item.append(dot, link, count);
    host.append(item);
  }

  if (state.generatedAt) {
    const built = new Date(state.generatedAt);
    const minutes = Math.round((Date.now() - built.getTime()) / 60000);
    const ago = minutes < 60
      ? `${minutes}${t('minutes_short')}`
      : `${Math.round(minutes / 60)}h`;
    const line = $('generated-line');
    line.textContent = `${t('generated')} · ${t('updated_ago', { n: ago })}`;
    line.classList.toggle('is-stale', minutes > STALE_AFTER_MINUTES);
    renderStaleNotice(minutes);
  }
}

/**
 * Say so when the calendar has stopped being rebuilt.
 *
 * This is the project's most likely failure, and the quietest. The site has no
 * backend: the data is baked into the published artefact, so if the deploy
 * stops -- a scheduled workflow disabled after sixty days of inactivity, a
 * provider gone, a fork whose owner moved on -- nothing breaks. The globe
 * still turns, the panel still lists events, and the calendar simply ages
 * until the twenty-one day window runs out and the screen empties with
 * nothing appearing wrong.
 *
 * Twelve hours is the threshold because the schedule asks for a rebuild every
 * three and GitHub drops most of them; four missed windows in a row is a
 * pattern rather than bad luck. The notice states the age and nothing else --
 * the data is not wrong, it is old, and a reader deciding whether to trust a
 * figure needs to know which.
 */
function renderStaleNotice(minutes) {
  const node = $('stale-notice');
  if (!node) return;

  if (minutes <= STALE_AFTER_MINUTES) {
    node.hidden = true;
    return;
  }

  const hours = Math.round(minutes / 60);
  const age = hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}${t('days_short')}`;
  node.textContent = t('stale', { n: age });
  node.hidden = false;
}

/* ---------------------------------------------------------------- tooltip */

export function renderTooltip(marker, x, y) {
  const node = $('tooltip');

  if (!marker) {
    node.hidden = true;
    return;
  }

  node.replaceChildren();

  const name = document.createElement('div');
  name.className = 'tooltip-name';
  name.textContent = `${flagOf(marker.code)}  ${countryName(state.countries[marker.code])}`;
  node.append(name);

  const rows = document.createElement('div');
  rows.className = 'tooltip-rows';

  const ranked = [...marker.events]
    .sort((a, b) => b.impact - a.impact || a.time - b.time)
    .slice(0, 4);

  for (const event of ranked) {
    const row = document.createElement('div');
    row.className = 'tooltip-row';
    row.style.color = IMPACT_COLORS[event.impact];

    const dot = document.createElement('i');

    const label = document.createElement('span');
    label.style.color = 'var(--ink-dim)';
    label.textContent = `${event.all_day ? '' : `${timeOf(event.date)}  `}${eventTitle(event.title)}`;

    row.append(dot, label);
    rows.append(row);
  }

  node.append(rows);

  if (marker.events.length > ranked.length) {
    const more = document.createElement('div');
    more.className = 'tooltip-more';
    more.textContent = `+${marker.events.length - ranked.length}`;
    node.append(more);
  }

  node.hidden = false;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

/* ---------------------------------------------------------------- wiring */

/** Mirror the active-filter count onto the topbar button. */
export function renderFilterBadge() {
  const badge = document.getElementById('filters-badge');
  if (!badge) return;
  const n = activeFilterCount();
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

/**
 * Hand a generated file to the browser.
 *
 * A blob inherits the page's origin, so the link is same-origin and the file
 * never leaves the machine -- no upload, no server, consistent with a page
 * that makes no third-party request at all. The revoke is deferred because
 * Firefox cancels a download whose object URL is released in the same tick.
 *
 * Wrapped, because a failed download must not throw into a render path: the
 * calendar on screen is worth more than the copy of it.
 */
function download(text, mime, filename) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error('export failed', error);
  }
}

export function bindPanelControls() {
  // Reset clears the filters as well as the selection: a button labelled
  // "clear" that leaves three filters on is a lie.
  $('panel-reset').addEventListener('click', resetFilters);

  $('export-ics').addEventListener('click', () => {
    const { events } = panelEvents();
    download(buildIcs(events, { safeUrl, generatedAt: state.generatedAt }),
      'text/calendar;charset=utf-8', exportName('ics'));
  });

  $('export-csv').addEventListener('click', () => {
    const { events } = panelEvents();
    download(buildCsv(events, { surpriseOf }), 'text/csv;charset=utf-8', exportName('csv'));
  });

  bindTimelineKeys();
  bindEventListKeys();
  bindEventListScroll();
  bindSkipLink();

  $('tl-prev').addEventListener('click', () => stepDay(-1));
  $('tl-next').addEventListener('click', () => stepDay(1));
  $('tl-today').addEventListener('click', () => {
    const days = dayList();
    const midnight = new Date().setHours(0, 0, 0, 0);
    const today = days.find((day) => day.key === todayKey())
      ?? days.find((day) => day.date >= midnight);
    if (today) selectDay(today.key);
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    // Both shortcuts below are bindings for the view, not for whatever has
    // focus. Listening on document meant they fired while the user was tabbing
    // through the filters: arrowing off the language buttons changed the day,
    // and Escape on a category chip threw away the country panel they were
    // reading. So they only apply where nothing in particular is focused, or
    // where the focused thing is the globe or the event list -- the places the
    // day and the selection are the subject. The timeline has its own arrow
    // handling (bindTimelineKeys) and marks those events handled.
    if (!viewHasFocus(event.target)) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepDay(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    // Escape undoes the innermost thing that is open: an expanded event row
    // sits inside the country selection, so it goes first, and the country
    // only goes once there is no row open. The filter sheet is handled in
    // bindFilterPanel, which marks the event handled before this runs.
    if (event.key === 'Escape') {
      if (state.openEventId) toggleEvent(state.openEventId);
      else if (state.selectedCountry) clearSelection();
    }
  });
}

function stepDay(direction) {
  const days = dayList();
  const index = days.findIndex((day) => day.key === state.selectedDay);
  const next = days[Math.min(Math.max(index + direction, 0), days.length - 1)];
  if (next && next.key !== state.selectedDay) selectDay(next.key);
}

export { selectCountry };
