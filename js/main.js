/**
 * Entry point: load the data, build the globe, wire the panels, keep the
 * clock honest.
 */

import {
  state, loadData, subscribe, dayMarkers, imminentEvents, dayList,
  nextHighImpact, selectCountry, selectDay, clearSelection, todayKey,
} from './store.js';
import { createGlobe } from './globe.js';
import {
  renderFilters, renderTimeline, renderPanel, renderNextEvent, renderCountdown,
  renderSources, renderTooltip, bindPanelControls, renderFilterBadge,
} from './panels.js';
import { applyStaticStrings, initLang, setLang, t } from './i18n.js';
import { parseView, writeView } from './url.js';

const REFRESH_MS = 5 * 60 * 1000;

let globe = null;
let nextEvent = null;

async function boot() {
  initLang();
  applyLanguage();

  try {
    await loadData();
  } catch (error) {
    return fail(t('boot_failed'), error);
  }

  applyViewFromUrl();

  try {
    globe = await createGlobe(document.getElementById('stage'), {
      onSelect: (marker) => {
        if (marker) {
          selectCountry(marker.code);
        } else if (state.selectedCountry) {
          clearSelection();
        }
      },
      onHover: (marker, x, y) => renderTooltip(marker, x, y),
    });
  } catch (error) {
    return fail('WebGL is unavailable in this browser.', error);
  }

  bindPanelControls();
  bindLanguage();
  bindFilterPanel();
  bindNextEventCard();

  renderAll();

  // A link that names a country should open looking at it. subscribe() flies
  // the camera on a change, and arriving already selected is not one.
  if (state.selectedCountry) {
    const country = state.countries[state.selectedCountry];
    if (country) globe.focus(country.lat, country.lon);
  }

  startTickers();
  reveal();
}

function fail(message, error) {
  console.error(error);
  const node = document.getElementById('boot-error');
  node.textContent = message;
  node.hidden = false;
  document.querySelector('.boot-mark')?.remove();
}

function reveal() {
  document.getElementById('shell').hidden = false;
  const boot = document.getElementById('boot');
  boot.classList.add('is-done');
  setTimeout(() => boot.remove(), 600);

  // The hint has done its job once the viewer touches the globe, or after 9s.
  const hint = document.getElementById('hint');
  const dismiss = () => hint.classList.add('is-hidden');
  document.getElementById('stage').addEventListener('pointerdown', dismiss, { once: true });
  setTimeout(dismiss, 9000);
}

/**
 * Open on the view the link asked for, when it still exists.
 *
 * A shared link outlives the data it points at: the window moves every few
 * hours, so yesterday's `?d=` is tomorrow's gone day. Both parameters are
 * therefore checked against what was actually loaded, and a stale one is
 * dropped rather than honoured — landing on an empty screen because a
 * bookmark is three weeks old would read as the app being broken.
 */
function applyViewFromUrl() {
  const { day, country } = parseView();

  if (day && dayList().some((entry) => entry.key === day)) {
    state.selectedDay = day;
  }
  if (country && state.countries[country]) {
    state.selectedCountry = country;
  }

  // Normalise: a link with a dropped parameter, or none at all, should end up
  // showing the address of what is actually on screen.
  writeView({ day: state.selectedDay, country: state.selectedCountry });
}

/* ------------------------------------------------------------- rendering */

function renderAll() {
  renderFilters();
  renderTimeline();
  renderPanel();
  renderSources();
  renderFilterBadge();
  refreshNextEvent();
  syncGlobe();
}

function syncGlobe() {
  if (!globe) return;

  globe.setMarkers(dayMarkers());
  globe.setHighlight(state.selectedCountry);
  globe.setPulses(imminentEvents().map((event) => ({
    lat: state.countries[event.country].lat,
    lon: state.countries[event.country].lon,
    impact: event.impact,
  })));
}

function refreshNextEvent() {
  nextEvent = nextHighImpact();
  renderNextEvent(nextEvent);
  renderCountdown(nextEvent);
}

subscribe((reason) => {
  // The address bar follows day and country only. Filters are deliberately
  // left out: they are a way of reading the calendar rather than a place in
  // it, and a link carrying somebody else's eight switched-off categories
  // opens on a screen the sender never saw.
  if (reason === 'day' || reason === 'country') {
    writeView({ day: state.selectedDay, country: state.selectedCountry });
  }

  if (reason === 'filter') {
    renderFilters();
    renderTimeline();
    // The badge is the only sign filters are narrowing the view once the rail
    // is collapsed, so it has to follow every change rather than only boot.
    renderFilterBadge();
  }
  if (reason === 'day') renderTimeline();

  renderPanel();
  syncGlobe();

  // Flying to a country the viewer picked from the list, not from the globe.
  if (reason === 'country' && state.selectedCountry && globe) {
    const country = state.countries[state.selectedCountry];
    if (country) globe.focus(country.lat, country.lon);
  }
});

/* --------------------------------------------------------------- tickers */

/**
 * Write the viewer's own offset from UTC beside the clock.
 *
 * Every time in orbis -- the event list, the timeline, the countdown -- is UTC.
 * That is the only honest choice for a calendar spanning every market, but it
 * silently misleads anyone who reads 21:00 as their evening. This says, once,
 * how far their clock is from the one on screen.
 */
function renderClockOffset() {
  const node = document.getElementById('clock-offset');
  if (!node) return;

  // getTimezoneOffset is minutes *behind* UTC, so the sign is inverted.
  const minutes = -new Date().getTimezoneOffset();
  if (minutes === 0) { node.textContent = t('clock_here'); return; }

  const sign = minutes < 0 ? '\u2212' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const offset = rest ? `${sign}${hours}:${String(rest).padStart(2, '0')}` : `${sign}${hours}h`;
  node.textContent = t('clock_you', { offset });
}

function startTickers() {
  const clock = document.getElementById('clock');
  renderClockOffset();

  setInterval(() => {
    const now = new Date();
    clock.textContent = now.toISOString().slice(11, 19);
    renderCountdown(nextEvent);

    // The terminator tracks real time on today, and the same hour on any other
    // day the viewer scrubbed to — so the lit half always means something.
    if (globe) {
      globe.setDate(state.selectedDay === todayKey() ? now : atSelectedDay(now));
    }
  }, 1000);

  // Cheap re-derivations that only matter on the scale of a minute.
  setInterval(() => {
    refreshNextEvent();
    syncGlobe();
    renderSources();
  }, 60_000);

  // Pick up a freshly built calendar.json without a manual reload.
  setInterval(async () => {
    try {
      const before = state.generatedAt;
      await loadData();
      if (state.generatedAt !== before) renderAll();
    } catch { /* offline: keep showing what we have */ }
  }, REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshNextEvent();
      syncGlobe();
    }
  });
}

function atSelectedDay(now) {
  const [year, month, day] = state.selectedDay.split('-').map(Number);
  const date = new Date(now);
  date.setFullYear(year, month - 1, day);
  return date;
}

/** The "next high-impact" card doubles as a jump-to control. */
function bindNextEventCard() {
  document.getElementById('next-event').addEventListener('click', () => {
    if (!nextEvent) return;
    if (state.selectedDay !== nextEvent.day) selectDay(nextEvent.day);
    selectCountry(nextEvent.country);
  });
}

/* -------------------------------------------------------------- language */

/** Everything the language owns outside the render functions. */
function applyLanguage() {
  applyStaticStrings();
  syncLangButtons();
  renderClockOffset();
  document.title = t('doc_title');
}

/**
 * Put the keyboard inside a panel that is still animating open.
 *
 * `visibility` is part of the slide-in transition, and an element that is
 * still hidden refuses focus without complaining -- so focusing on the click
 * did nothing at all and the keyboard stayed on the button behind the sheet.
 * Waiting for `transitionend` is not the fix either: with reduced motion the
 * transition is 1ms and the element fires spurious ones (scrollbar-color,
 * among others) before it is visible, so the real one is easy to miss.
 * Checking the thing we actually care about, for a few frames, works in both.
 */
function focusWhenVisible(panel, tries = 20) {
  const target = panel.querySelector('button');
  if (!target) return;
  const attempt = () => {
    if (!panel.classList.contains('is-open')) return;   // closed again meanwhile
    if (getComputedStyle(panel).visibility === 'visible') {
      target.focus();
      if (panel.contains(document.activeElement)) return;
    }
    if (tries-- > 0) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

/**
 * The filters panel on narrow screens.
 *
 * Below 1040px the left rail slides over the globe instead of sharing space
 * with it. That makes it a dialog in all but name, so it behaves like one:
 * Escape closes it, a click outside closes it, and focus is sent into it on
 * open and back to the button on close.
 */
function bindFilterPanel() {
  const toggle = document.getElementById('filters-toggle');
  const rail = document.getElementById('rail-left');
  if (!toggle || !rail) return;

  const isOpen = () => rail.classList.contains('is-open');

  const setOpen = (open) => {
    rail.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) focusWhenVisible(rail);
    else if (document.activeElement && rail.contains(document.activeElement)) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Capture, and preventDefault rather than stopPropagation: both handlers sit
  // on document, and stopPropagation does not reach a listener already
  // registered on the same node -- bindPanelControls runs first, so Escape
  // closed the sheet and cleared the country selection in one press. Marking
  // the event handled is what the panel handler actually checks.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      setOpen(false);
    }
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (rail.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(false);
  });

  // Returning to a wide layout puts the rail back on the page for good; the
  // open class would otherwise keep a stale transform hanging around.
  matchMedia('(min-width: 1041px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

function bindLanguage() {
  for (const button of document.querySelectorAll('.lang button')) {
    button.addEventListener('click', () => {
      setLang(button.dataset.lang);
      applyLanguage();
      renderAll();
    });
  }
}

function syncLangButtons() {
  for (const button of document.querySelectorAll('.lang button')) {
    button.classList.toggle('is-active', button.dataset.lang === document.documentElement.dataset.lang);
  }
}

boot();
