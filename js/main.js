/**
 * Entry point: load the data, build the globe, wire the panels, keep the
 * clock honest.
 */

import {
  state, loadData, subscribe, dayMarkers, imminentEvents,
  nextHighImpact, selectCountry, selectDay, clearSelection, todayKey,
} from './store.js';
import { createGlobe } from './globe.js';
import {
  renderFilters, renderTimeline, renderPanel, renderNextEvent, renderCountdown,
  renderSources, renderTooltip, bindPanelControls, renderFilterBadge,
} from './panels.js';
import { applyStaticStrings, initLang, setLang, t } from './i18n.js';

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
  bindScrollHints();
  bindNextEventCard();

  renderAll();
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
  if (reason === 'filter') {
    renderFilters();
    renderTimeline();
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

function startTickers() {
  const clock = document.getElementById('clock');

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
  document.title = t('doc_title');
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
    if (open) rail.querySelector('button')?.focus();
    else if (document.activeElement && rail.contains(document.activeElement)) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.stopPropagation();
      setOpen(false);
    }
  });

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

/**
 * Drop the bottom fade on a scroll box once there is nothing left below it,
 * so the hint means "there is more" rather than decorating every state.
 */
function bindScrollHints() {
  for (const box of document.querySelectorAll('.card-scroll')) {
    const sync = () => {
      const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
      const fits = box.scrollHeight <= box.clientHeight + 2;
      box.classList.toggle('is-at-end', atEnd || fits);
    };
    box.addEventListener('scroll', sync, { passive: true });
    // The chips are rendered after this runs and again on every filter change,
    // so observe the content rather than measuring an empty box once.
    new ResizeObserver(sync).observe(box);
    if (box.firstElementChild) new ResizeObserver(sync).observe(box.firstElementChild);
    new MutationObserver(sync).observe(box, { childList: true, subtree: true });
    sync();
  }
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
