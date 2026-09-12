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
  renderSources, renderTooltip, bindPanelControls,
} from './panels.js';
import { applyStaticStrings, initLang, setLang, t, locale } from './i18n.js';

const REFRESH_MS = 5 * 60 * 1000;

let globe = null;
let nextEvent = null;

async function boot() {
  initLang();
  applyStaticStrings();
  syncLangButtons();

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

function bindLanguage() {
  for (const button of document.querySelectorAll('.lang button')) {
    button.addEventListener('click', () => {
      setLang(button.dataset.lang);
      applyStaticStrings();
      syncLangButtons();
      document.title = locale().startsWith('pt')
        ? 'orbis — o calendário econômico mundial num globo'
        : 'orbis — the world economic calendar on a globe';
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
