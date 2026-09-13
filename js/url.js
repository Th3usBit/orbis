/**
 * The view, in the address bar.
 *
 * Without this a link to orbis is always the same link: you cannot send
 * somebody "Brazil on the 30th", a reload loses wherever you were, and no
 * particular view can be indexed or bookmarked. Two parameters fix all three:
 *
 *     ?d=2026-09-30        the selected day
 *     ?d=2026-09-30&c=BR   …and the selected country
 *
 * `replaceState`, not `pushState`: scrubbing a timeline is not navigation, and
 * filling somebody's back button with thirty entries for thirty days is how
 * you make the back button useless. The address stays shareable; Back still
 * leaves the site.
 *
 * Everything here is defensive. A URL is user input — it arrives edited,
 * truncated, from a stale bookmark, or pointing at a day that has since left
 * the window — so a bad parameter is ignored rather than trusted, and the app
 * falls back to the behaviour it had before this file existed.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY = /^[A-Z]{2}$/;

/**
 * Read the view out of a query string.
 *
 * Shape only — whether the day is in the window and the country exists is the
 * caller's question, because only the caller has the data to answer it.
 */
export function parseView(search = window.location.search) {
  const params = new URLSearchParams(search);
  const day = params.get('d');
  const country = (params.get('c') || '').toUpperCase();

  return {
    day: DAY.test(day || '') ? day : null,
    country: COUNTRY.test(country) ? country : null,
  };
}

/** The query string for a view, or '' when it is the default one. */
export function buildQuery({ day, country } = {}) {
  const params = new URLSearchParams();
  if (day) params.set('d', day);
  if (country) params.set('c', country);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Point the address bar at the current view.
 *
 * The path is kept and only the query replaced, so this works the same at
 * `/orbis/` on Pages, at `/` on a local server, and in a fork published under
 * any other path. Failures are swallowed: a browser that refuses history
 * access (an unusual sandbox, an exotic privacy mode) should lose the
 * shareable link, not the page.
 */
export function writeView(view) {
  try {
    const url = `${window.location.pathname}${buildQuery(view)}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  } catch { /* the view is a convenience, not the app */ }
}
