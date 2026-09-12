/**
 * Application state and the selectors derived from it.
 *
 * Everything downstream — globe, panels, timeline — reads from here and
 * re-renders on `subscribe`. Days are keyed in the viewer's local timezone,
 * because that is how people read an economic calendar; the globe's day/night
 * terminator stays on real UTC.
 */

const listeners = new Set();

export const IMPACTS = [3, 2, 1, 0];
export const REGIONS = ['americas', 'europe', 'asiapac', 'mea'];

export const state = {
  events: [],
  countries: {},
  sources: [],
  generatedAt: null,
  window: null,

  selectedDay: null,
  selectedCountry: null,
  openEventId: null,

  filters: {
    impact: new Set(IMPACTS),
    region: new Set(REGIONS),
    category: new Set(),   // empty means "every category"
  },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change') {
  for (const fn of listeners) fn(reason);
}

/* ------------------------------------------------------------------ dates */

export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey() {
  return dayKey(new Date());
}

/* ------------------------------------------------------------------- load */

export async function loadData() {
  const bust = `?v=${Math.floor(Date.now() / 60000)}`;
  const [calendar, reference] = await Promise.all([
    fetch(`data/calendar.json${bust}`).then(assertOk),
    fetch(`data/countries.json${bust}`).then(assertOk),
  ]);

  state.countries = reference.countries;
  state.sources = calendar.sources || [];
  state.generatedAt = calendar.generated_at;
  state.window = calendar.window;

  state.events = (calendar.events || [])
    .map(decorate)
    .filter((event) => event.country in state.countries);

  if (!state.selectedDay) {
    // Land on today when it is inside the window, otherwise on the first day.
    const keys = dayList().map((day) => day.key);
    state.selectedDay = keys.includes(todayKey()) ? todayKey() : keys[0];
  }

  return state;
}

function assertOk(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`);
  return response.json();
}

function decorate(event) {
  const date = new Date(event.ts);
  return {
    ...event,
    date,
    time: date.getTime(),
    // A holiday has a calendar date, not an instant: Christmas is the 25th in
    // Auckland and in Los Angeles alike. Converting its timestamp through a
    // viewer timezone moves it a day either side of the date line, so the
    // nominal date in the payload is used as-is.
    day: event.all_day ? event.ts.slice(0, 10) : dayKey(date),
    region: null,       // filled lazily below, once countries are known
    forecast: event.forecast ?? null,
    previous: event.previous ?? null,
    actual: event.actual ?? null,
  };
}

/** Region of an event, resolved through the country reference table. */
export function regionOf(event) {
  return state.countries[event.country]?.region ?? 'mea';
}

/* -------------------------------------------------------------- selectors */

/** Events passing every active filter. Day selection is applied separately. */
export function visibleEvents() {
  const { impact, region, category } = state.filters;
  const anyCategory = category.size === 0;

  return state.events.filter((event) =>
    impact.has(event.impact)
    && region.has(regionOf(event))
    && (anyCategory || category.has(event.category)));
}

/** One entry per day in the data window, with per-impact counts for the timeline. */
export function dayList() {
  const buckets = new Map();

  for (const event of visibleEvents()) {
    let bucket = buckets.get(event.day);
    if (!bucket) {
      bucket = { key: event.day, date: startOfDay(event.date), total: 0, counts: { 0: 0, 1: 0, 2: 0, 3: 0 } };
      buckets.set(event.day, bucket);
    }
    bucket.total += 1;
    bucket.counts[event.impact] += 1;
  }

  // Fill gaps so the strip is continuous even on quiet days.
  const all = [...buckets.values()].sort((a, b) => a.date - b.date);
  if (!all.length) return [];

  const filled = [];
  const cursor = new Date(all[0].date);
  const last = all[all.length - 1].date;

  while (cursor <= last) {
    const key = dayKey(cursor);
    filled.push(buckets.get(key) || {
      key, date: new Date(cursor), total: 0, counts: { 0: 0, 1: 0, 2: 0, 3: 0 },
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return filled;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Events shown in the right panel: a whole country, or the selected day. */
export function panelEvents() {
  const visible = visibleEvents();

  if (state.selectedCountry) {
    return {
      mode: 'country',
      events: visible
        .filter((event) => event.country === state.selectedCountry)
        .sort((a, b) => a.time - b.time),
    };
  }

  return {
    mode: 'day',
    events: visible
      .filter((event) => event.day === state.selectedDay)
      .sort((a, b) => a.time - b.time || b.impact - a.impact),
  };
}

/** Aggregated per-country markers for the selected day — what the globe plots. */
export function dayMarkers() {
  const markers = new Map();

  for (const event of visibleEvents()) {
    if (event.day !== state.selectedDay) continue;

    let marker = markers.get(event.country);
    if (!marker) {
      const country = state.countries[event.country];
      marker = {
        code: event.country,
        lat: country.lat,
        lon: country.lon,
        count: 0,
        maxImpact: 0,
        nextTime: Infinity,
        events: [],
      };
      markers.set(event.country, marker);
    }

    marker.count += 1;
    marker.maxImpact = Math.max(marker.maxImpact, event.impact);
    marker.events.push(event);
    if (event.time > Date.now() && event.time < marker.nextTime) {
      marker.nextTime = event.time;
    }
  }

  return [...markers.values()].sort((a, b) => b.maxImpact - a.maxImpact || b.count - a.count);
}

/** Counts used to label the filter rows — computed against the *other* filters
 *  so each row shows what enabling it would add. */
export function filterCounts(dimension) {
  const counts = new Map();
  const { impact, region, category } = state.filters;
  const anyCategory = category.size === 0;

  for (const event of state.events) {
    if (dimension !== 'impact' && !impact.has(event.impact)) continue;
    if (dimension !== 'region' && !region.has(regionOf(event))) continue;
    if (dimension !== 'category' && !anyCategory && !category.has(event.category)) continue;

    const key = dimension === 'impact' ? event.impact
      : dimension === 'region' ? regionOf(event)
        : event.category;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

/** The next high-impact release from now, ignoring filters (it is a global alert). */
export function nextHighImpact() {
  const now = Date.now();
  let best = null;

  for (const event of state.events) {
    if (event.impact !== 3 || event.time < now - 30 * 60 * 1000) continue;
    if (!best || event.time < best.time) best = event;
  }

  return best;
}

/** Events starting within the next `minutes` — drives the pulse rings. */
export function imminentEvents(minutes = 60) {
  const now = Date.now();
  const horizon = now + minutes * 60 * 1000;

  return visibleEvents().filter((event) =>
    event.impact >= 2 && event.time >= now && event.time <= horizon);
}

/* ----------------------------------------------------------------- actions */

export function selectDay(key) {
  state.selectedDay = key;
  state.selectedCountry = null;
  state.openEventId = null;
  emit('day');
}

export function selectCountry(code) {
  state.selectedCountry = state.selectedCountry === code ? null : code;
  state.openEventId = null;
  emit('country');
}

export function clearSelection() {
  state.selectedCountry = null;
  state.openEventId = null;
  emit('country');
}

export function toggleEvent(id) {
  state.openEventId = state.openEventId === id ? null : id;
  emit('event');
}

export function toggleFilter(dimension, value) {
  const set = state.filters[dimension];

  if (set.has(value)) {
    set.delete(value);
    // Never let a dimension go completely empty — an empty globe helps nobody.
    if (dimension !== 'category' && set.size === 0) {
      set.add(value);
      return;
    }
  } else {
    set.add(value);
  }

  emit('filter');
}
