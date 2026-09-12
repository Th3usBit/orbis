/**
 * DOM rendering for every panel around the globe.
 *
 * Pure render functions: they read from the store and rewrite their own
 * subtree. No partial diffing — these lists are small enough that clarity is
 * worth more than the microseconds.
 */

import {
  IMPACTS, REGIONS, state, dayList, panelEvents, filterCounts,
  selectDay, selectCountry, toggleEvent, toggleFilter, clearSelection, todayKey,
} from './store.js';
import {
  t, tCount, locale, categoryLabel, impactLabel, regionLabel, eventTitle, countryName,
} from './i18n.js';
import { IMPACT_COLORS } from './globe.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ utils */

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
    (value) => regionLabel(value), () => '#5d86ad');

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

  for (const category of categories) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${selected.has(category) ? ' is-on' : ''}`;
    chip.setAttribute('aria-pressed', String(selected.has(category)));

    const label = document.createElement('span');
    label.textContent = categoryLabel(category);

    const count = document.createElement('span');
    count.className = 'chip-count';
    count.textContent = counts.get(category);

    chip.append(label, count);
    chip.addEventListener('click', () => toggleFilter('category', category));
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
  host.replaceChildren();

  let lastMonth = null;

  for (const day of days) {
    const isToday = day.date.getTime() === today.getTime();
    const weekday = day.date.getDay();

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'tl-day';
    cell.classList.toggle('is-selected', day.key === state.selectedDay);
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
    cell.addEventListener('click', () => selectDay(day.key));
    host.append(cell);
  }

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
}

/* ------------------------------------------------------------- event list */

export function renderPanel() {
  const { mode, events } = panelEvents();
  const host = $('event-list');
  const reset = $('panel-reset');

  if (mode === 'country') {
    const country = state.countries[state.selectedCountry];
    $('panel-title').textContent = `${flagOf(state.selectedCountry)}  ${countryName(country)}`;
    $('panel-sub').textContent = tCount(events.length);
    reset.hidden = false;
  } else {
    const date = events[0]?.date ?? new Date(`${state.selectedDay}T12:00:00`);
    $('panel-title').textContent = longDate(date);
    $('panel-sub').textContent = tCount(events.length);
    reset.hidden = true;
  }

  host.replaceChildren();

  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.innerHTML = `${t('no_events')}<br><span style="opacity:.65">${t('no_events_hint')}</span>`;
    host.append(empty);
    return;
  }

  const now = Date.now();
  let lastGroup = null;

  for (const event of events) {
    const group = mode === 'country'
      ? event.date.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })
      : `${String(event.date.getHours()).padStart(2, '0')}:00`;

    if (group !== lastGroup) {
      const head = document.createElement('div');
      head.className = 'hour-head';
      head.textContent = group;
      host.append(head);
      lastGroup = group;
    }

    host.append(buildEventRow(event, now));

    if (state.openEventId === event.id) {
      host.append(buildEventDetail(event));
    }
  }
}

function buildEventRow(event, now) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'event';
  row.classList.toggle('is-open', state.openEventId === event.id);
  row.classList.toggle('is-past', event.time < now);

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
    value.style.opacity = '0.7';
    value.textContent = formatValue(event.forecast, event.unit);
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

  if (event.source_url) {
    const link = document.createElement('a');
    link.href = event.source_url;
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
    $('generated-line').textContent = `${t('generated')} · ${t('updated_ago', { n: ago })}`;
  }
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

export function bindPanelControls() {
  $('panel-reset').addEventListener('click', clearSelection);

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
    if (event.target.matches('input, textarea')) return;
    if (event.key === 'ArrowLeft') stepDay(-1);
    if (event.key === 'ArrowRight') stepDay(1);
    if (event.key === 'Escape') clearSelection();
  });
}

function stepDay(direction) {
  const days = dayList();
  const index = days.findIndex((day) => day.key === state.selectedDay);
  const next = days[Math.min(Math.max(index + direction, 0), days.length - 1)];
  if (next && next.key !== state.selectedDay) selectDay(next.key);
}

export { selectCountry };
