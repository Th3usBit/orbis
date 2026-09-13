<div align="center">

# orbis

**The world economic calendar, on a globe.**

Every scheduled economic release, central bank decision and market holiday on Earth — plotted on a live 3D globe, lit by the real position of the sun.

No API keys. No backend. No paid tiers. Clone it and run `start.bat`.

[Português](README.pt-BR.md) · [Live demo](https://th3usbit.github.io/orbis/) · [Report an issue](https://github.com/Th3usBit/orbis/issues)

</div>

---

## Contents

[What it is](#what-it-is) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Architecture](#architecture) · [The data pipeline](#the-data-pipeline) · [The browser](#the-browser) · [Automation](#automation-ci-and-deploy) · [Data sources](#data-sources) · [Project structure](#project-structure) · [Configuration](#configuration) · [Running your own](#running-your-own) · [Contributing](#contributing) · [Roadmap](#roadmap) · [Licence](#licence)

---

## What it is

An economic calendar is normally a spreadsheet: a wall of rows sorted by time. That format hides the two things that actually matter — **where** the money is moving and **when**, relative to the market that is awake right now.

orbis plots the same data on a rotating globe:

- **Pillars** rise from each country with events on the selected day. Height and colour encode market impact.
- **The lit half of the planet is real.** The day/night terminator is computed from the actual subsolar point, corrected by the equation of time, so you can see at a glance whether Tokyo is trading while Frankfurt sleeps.
- **Rings pulse** only on releases landing within the next hour — nothing animates for decoration.
- **A timeline strip** across the bottom shows the load of every day in the window as a stacked micro-chart, so a heavy week is visible before you click into it.
- **Take it with you.** Whatever the panel is showing — a day, a country, whatever your filters left — exports as `.csv` for a spreadsheet or `.ics` for your calendar. The file is built in your browser and saved straight to your disk; nothing is uploaded.

The whole interface speaks English, Português and Español, including translated indicator names and country names. It picks your browser's language on first load and remembers the switch after that.

Everything on screen is **UTC**, because that is the only honest choice for a calendar spanning every market. The topbar says so, and shows how far your own clock is from it.

---

## Quick start

**Windows**

```bat
git clone https://github.com/Th3usBit/orbis.git
cd orbis
start.bat
```

**Linux / macOS**

```bash
git clone https://github.com/Th3usBit/orbis.git
cd orbis
./start.sh
```

That is the whole setup. `start` finds Python 3, builds the globe geometry on first run, fetches the latest calendar, and opens the page at `http://127.0.0.1:8080`.

The only requirement is **Python 3.9+**, and only the standard library is used — there is no `pip install` step, no `package.json`, no build tool. Node 18+ is needed only to run the tests; the site itself never needs it.

> **The repository ships no data.** A clone contains source code only: the calendar and the globe geometry are generated on your machine, on first run, from public endpoints. That is deliberate — nobody inherits a stale snapshot of somebody else's session, and the git history stays free of a half-megabyte file that changes every hour. The first run needs a network connection and takes about a minute; every run after that is instant.

Once generated, the data is yours. `offline` skips the collectors and serves what you already have:

```bat
start.bat offline     :: Windows
./start.sh offline    # Linux / macOS
```

This is real offline: Three.js and the fonts are committed under [`vendor/`](vendor/), so the page loads nothing from a CDN and **no request from your browser leaves the origin**. Globe and all, on a plane.

---

## How it works

None of the free calendar providers send CORS headers, so a browser cannot call them directly. orbis turns that constraint into an advantage: a collector runs *outside* the browser, reconciles every feed into one file, and the page reads only that file.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  COLLECT — python, standard library only                             │
  │  runs at deploy time in CI, or on your machine when you run start    │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │   TradingView ──┐  primary      global coverage, impact-rated        │
  │   ForexFactory ─┼─► merge()  ◄── reconcile, do not concatenate       │
  │   Nager.Date ───┘  context      market holidays                      │
  │                      │                                               │
  │                      ▼                                               │
  │              data/calendar.json      one static file, ~550 KB        │
  └──────────────────────┬───────────────────────────────────────────────┘
                         │  uploaded as a Pages artefact, never committed
                         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  RENDER — the browser, no framework, no bundler                      │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │   store.js  ── state + selectors ──► subscribe(reason)               │
  │      │                                   │                           │
  │      │                                   ├──► globe.js   three.js    │
  │      │                                   ├──► panels.js  DOM         │
  │      └── calendar.json ──────────────────┴──► i18n.js    EN/PT/ES    │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

Because the output is a single static JSON file, the whole site runs on GitHub Pages for free, forever, with **no server to keep alive and no key to leak**.

---

## Architecture

Two halves that never meet at runtime. The collector writes a file; the browser reads it. There is no API between them, which is what removes the backend entirely.

| | Collector | Browser |
|---|---|---|
| Language | Python 3.9+, stdlib only | Vanilla ES modules |
| Dependencies | none | three.js (vendored) |
| Runs | in CI, or locally via `start` | on the viewer's machine |
| Output | `data/calendar.json` | pixels |
| Network | the three providers | its own origin only |

**Why no framework.** The page is one screen with a handful of derived views. A store with a `subscribe` callback and functions that rewrite their own subtree is enough, and it means the site has no build step: what is in the repository is what runs in the browser. You can read a stack trace against the actual source.

**Why vendored dependencies.** Three.js and both fonts are committed under `vendor/`. A CDN is a third party that can see every viewer, go down, or change what it serves. Vendoring costs ~930 KB in the repository and buys an offline-capable page that makes zero third-party requests — a promise `tests/offline.test.mjs` enforces on every CI run.

---

## The data pipeline

### 1. Collect

Each source is a module under `scripts/sources/` exposing the same contract:

```python
ID = "tradingview"            # stable identifier, used in event ids
NAME = "TradingView Economic Calendar"
HOMEPAGE = "https://..."      # shown in the Sources panel

def fetch(window, ...) -> list[dict]:
    """Normalised events, or raise on failure."""
```

`collect()` in [`scripts/fetch.py`](scripts/fetch.py) runs each one inside a `try/except`, so **one source being down cannot fail the run** — the failure is recorded in the output with its error, and the Sources panel shows a red dot with the reason.

A source must *raise* on failure rather than return an empty list. Returning `[]` makes an outage indistinguishable from a quiet week, which is the one thing the report exists to prevent.

### 2. Normalise

Providers disagree about everything, so each module maps its rows onto one schema:

| field | meaning |
|---|---|
| `id` | stable and unique — dedupes across weekly feeds and across runs |
| `ts` | ISO 8601 UTC, always `…Z` |
| `country` | ISO 3166-1 alpha-2, must exist in `data/countries.json` |
| `title`, `indicator` | what was released |
| `category` | one of 13 buckets derived from the title by `classify.py`, plus `holiday` from the holiday collector |
| `impact` | `0` holiday · `1` low · `2` medium · `3` high |
| `actual`, `forecast`, `previous` | numbers, or absent |
| `unit`, `period`, `issuer` | context for the detail view |
| `source`, `source_url` | attribution; the URL is the only field that becomes a link |

Loosely-typed figures are parsed by `to_number()`, which handles `3.2%`, `-1.4K`, `215B`, `1,234.5` **and** `1.234,5` — the same number in two conventions. It returns `None` for `NaN` and infinities, because `json.dump` writes those as bare literals that no JSON parser accepts: one such value would make the whole file unparseable and take the page down with it.

### 3. Reconcile

The two calendar feeds are **merged, not concatenated**. Two rows are the same release when they share a country, land within 45 minutes of each other, and their titles are similar enough — with guards that a similarity ratio gets wrong on its own:

- **Period must agree.** `CPI MoM` and `CPI YoY` are different releases with near-identical names.
- **Polarity must not invert.** `Exports` vs `Imports`, `Unemployment` vs `Employment`, `Core` vs non-core, `Prelim` vs `Final`.
- **Scale must be plausible.** An index level (~330) and a percentage change (~0.4) are never the same number reported twice.

Matches are tagged `confirmed_by` and marked `✦` in the UI — a release two independent sources agree on is worth more than one that appears in a single feed. Unmatched rows from the secondary feed are kept as genuine additions.

### 4. Publish

`fetch.py` writes one file and refuses to write a bad one:

- **Nothing collected** → exit 1, existing data untouched.
- **The primary source failed** → exit 1. It carries ~96% of events, so publishing without it would replace ~1800 rows with ~90 while every downstream check still passed. A stale calendar with an honest `generated_at` beats a current-looking one missing nineteen releases in twenty. `--allow-partial` overrides this deliberately.
- Fields that are `None` are dropped rather than serialised — at ~1800 events that is a third of what the browser would download.

---

## The browser

### Module map

| file | responsibility |
|---|---|
| [`js/store.js`](js/store.js) | state, every derived selector, the impact palette. The single owner of date logic. |
| [`js/globe.js`](js/globe.js) | the three.js scene: shaders, markers, camera flights, the terminator |
| [`js/panels.js`](js/panels.js) | DOM rendering for the rails, timeline and tooltip |
| [`js/i18n.js`](js/i18n.js) | UI strings plus phrase-by-phrase indicator translation |
| [`js/export.js`](js/export.js) | `.ics` and `.csv` generation, as pure functions |
| [`js/main.js`](js/main.js) | boot, tickers, wiring |

Everything downstream reads from the store and re-renders on `subscribe(reason)`. The render functions are pure in the sense that matters: they read state and rewrite their own subtree, with no partial diffing. These lists are small enough that clarity is worth more than the microseconds.

### Two clocks, on purpose

Days are keyed in **your local timezone**, because that is how people read a calendar. The globe's terminator stays on **real UTC**, because the sun does not care where you are.

All-day events are the exception that proves the rule: a holiday is a calendar date, not an instant. Christmas is the 25th in Auckland and in Los Angeles alike, so the nominal date is taken from the string and never converted — the same reasoning the `.ics` export follows.

### The globe

Layers, outward from the centre: ocean lit by the subsolar point · an equal-area land-dot matrix · country borders · a graticule · marker pillars · pulse rings · an additive fresnel atmosphere.

Every animated thing is driven by a number that actually changed: the sun moves because time moved, a marker pulses because a release is imminent. The idle spin respects `prefers-reduced-motion`, read live — a viewer can flip the setting with the page already open.

---

## Automation, CI and deploy

The site has **no backend**, so `calendar.json` is baked into the published artefact. That means *the only thing that refreshes the data is a deploy*.

```
  push to main ─┐
  cron */3h ────┼──► Deploy to Pages ──► build geometry ──► collect calendar
  manual  ──────┘                                │
                                                 ├──► stamp asset links (?v=sha)
                                                 └──► upload artefact ──► Pages
```

| workflow | triggers | what it does |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | push, PR, manual | Builds from a clean checkout on Linux, Windows and macOS, plus one job on Python 3.9 — the version this README promises. Runs six headless suites, and the browser suite on Linux. |
| [`pages.yml`](.github/workflows/pages.yml) | push, cron, manual | Rebuilds everything from source and publishes. Nothing is ever committed back. |

Three things worth knowing if you run a fork:

- **A scheduled run is not a promise.** GitHub delays the `schedule` event under load and **drops** firings it will not take rather than queueing them — measured here: asking for eight a day lands roughly four. That is fine, because every build is a full rebuild, so a run that lands carries everything a dropped one would have done.
- **GitHub disables scheduled workflows in public repositories after 60 days of inactivity.** Nothing then rebuilds, and since the collector looks only 21 days ahead, the site keeps serving until the window runs out and then goes empty with nothing appearing broken. Re-enable it from the Actions tab or with `gh workflow enable "Deploy to Pages"`.
- **CI passes `--allow-partial`; the deploy does not.** CI asks whether a fresh clone builds and runs — whether TradingView is up this afternoon is not its question, and a contributor's CSS-only PR should not go red because a third party had an outage. Publishing is where the strict guard belongs.

### Tests

```bash
node tests/store.test.mjs .       # state layer and every selector
node tests/format.test.mjs .      # number formatting, URL safety, solar maths
node tests/export.test.mjs .      # the .ics and .csv the panel hands out
node tests/i18n.test.mjs .        # EN/PT/ES parity, against real feed titles
node tests/merge.test.mjs .       # the reconciled dataset's shape
node tests/offline.test.mjs .     # nothing reaches for a CDN
node tests/ui.test.mjs .          # the real page in a real browser (Playwright)
```

The first six need only Node. The browser suite measures contrast on rendered pixels rather than declared colours, checks keyboard reach and the layout at four widths; it is opt-in locally and runs on Linux in CI, installed outside the checkout so nothing enters the repository.

The calendar is rebuilt on every run, so these check against **whatever the feeds published today** rather than against a fixture. `i18n.test.mjs` fails on a phrase that never fires, a language missing a key the others have, and on any title that comes out spliced.

---

## Data sources

All free, all key-free, all reachable without an account.

| Source | Role | Coverage | Why this one |
|---|---|---|---|
| [TradingView](https://www.tradingview.com/economic-calendar/) | primary | ~80 countries | The richest free feed: importance ratings, actual/forecast/previous as numbers, units, and a link to the releasing institution |
| [ForexFactory](https://www.forexfactory.com/calendar) via the FairEconomy weekly JSON | cross-check | major currencies | Independently maintained, so it corroborates the primary feed and fills its gaps |
| [Nager.Date](https://date.nager.at) | context | worldwide | Open-source public holiday API — tells you when a market is simply closed |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | geometry | worldwide | Public domain coastlines and borders, used once at build time |

**Evaluated and rejected:**

- **Trading Economics** — the `guest:guest` account returns `410 Gone`; the API is now paid only.
- **MQL5** — no public API. Its calendar is an internal endpoint with no usage terms for third parties.
- **FRED** — authoritative, but requires an API key *and* publishes only a bare date with no time, which is strictly less precise than what TradingView already gives for the same US releases. It would be a downgrade on every field orbis publishes.

> **On terms of use.** These are public, key-free endpoints that back the providers' own public widgets, and the published demo polls them a few times a day — far less than one person reading the site would generate. The data is factual scheduling information (dates, institutions, published figures), which is not itself copyrightable, and every event links back to its source. If you run a fork at higher frequency, be a good citizen and cache aggressively. If you are a provider and want a change, open an issue.

---

## Project structure

```
orbis/
├── index.html              single page — the whole UI
├── css/orbis.css           design system: tokens, glass panels, timeline
├── js/
│   ├── main.js             boot, tickers, wiring
│   ├── store.js            state, selectors, the impact palette
│   ├── globe.js            three.js scene, shaders, camera flights
│   ├── panels.js           DOM rendering for the rails and timeline
│   ├── export.js           .ics and .csv generation
│   └── i18n.js             EN/PT/ES strings + indicator translation
├── scripts/
│   ├── fetch.py            collect → reconcile → publish
│   ├── build_geometry.py   TopoJSON → land dots + borders (run once)
│   ├── serve.py            no-cache static dev server
│   └── sources/            one module per provider
├── tests/                  seven suites; six need only Node
├── vendor/                 three.js and the fonts, committed on purpose
├── data/countries.json     the only committed data: names, coords, regions
└── .github/workflows/      CI and the Pages deploy
```

**Generated, never committed** — `.gitignore` enforces it:

| path | size | built by |
|---|---|---|
| `data/calendar.json` | ~550 KB | `scripts/fetch.py`, every run |
| `assets/land-dots.json` | ~95 KB | `scripts/build_geometry.py`, once |
| `assets/borders.json` | ~104 KB | `scripts/build_geometry.py`, once |

---

## Configuration

**Time window.** Defaults to 7 days back and 21 days ahead:

```bash
python scripts/fetch.py --days-back 14 --days-ahead 45
```

**Globe density.** Change `DOT_SPACING_DEG` in `scripts/build_geometry.py` (lower = more dots), delete `assets/land-dots.json`, and re-run it.

**Impact colours.** Defined in [`js/store.js`](js/store.js) as `IMPACT_COLORS` and mirrored in `css/orbis.css` as `--impact-*` — change both, and the comment in the CSS says so.

**Rebuild frequency.** The `schedule:` block in `.github/workflows/pages.yml`. Delete it if you would rather it did not run at all.

---

## Running your own

orbis is designed to be forked and self-hosted, with nothing to configure and nobody to ask:

1. Fork the repository.
2. Push anything, or run the **Deploy to Pages** workflow by hand.

The first run turns Pages on for you (`configure-pages` has `enablement: true`), so there is genuinely no setting to change first. If your organisation blocks that, switch it on by hand at **Settings → Pages → Source: GitHub Actions** and run the workflow again.

Your fork builds its own geometry, collects its own calendar and publishes to your own `github.io` URL. **No secrets to add, no API keys, no account with any data provider, and no bot committing data into your branches.**

The rebuild is scheduled every three hours, which in practice lands a few times a day — see [Automation](#automation-ci-and-deploy) for why, and for the 60-day inactivity rule that will eventually silence it if you stop pushing.

---

## Contributing

Issues and pull requests are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the details; the short version:

- **Free and key-free sources only.** That constraint is the point of the project.
- **No dependencies.** Python standard library, vanilla JS. If a change needs `pip install` or a `package.json`, the promise is broken.
- **Comments explain *why*, with measured detail.** The codebase is full of them: why the match threshold is 0.90, why the terminator needed the equation of time, why a scrollbar inside a group was the worst of both worlds. A comment that restates its code is noise; one that records what was measured is what makes the next change safe.
- Run the suites before opening a PR.

Adding a language means four edits: a block in `UI` and a phrase table in `PHRASES` in `js/i18n.js`, a `name_xx` column in `data/countries.json`, and a button with its flag in `index.html`. `tests/i18n.test.mjs` enforces the rest.

---

## Roadmap

- [x] Vendored three.js so the page works fully offline
- [x] Export the events on screen — `.csv` for a spreadsheet, `.ics` for a calendar
- [ ] Central bank meeting calendars scraped from the institutions themselves — the feeds stop at ~33 days, the banks publish years ahead
- [ ] A staleness banner when `generated_at` falls too far behind

---

## Disclaimer

orbis is an informational and educational tool. It aggregates publicly published scheduling data and is **not investment advice**. Figures can be revised, feeds can be wrong, and times can shift. Verify anything you intend to trade against the releasing institution — every event links to its source for exactly that reason.

---

## Licence

[MIT](LICENSE) — **the code**: use it, fork it, sell it, no attribution beyond the licence notice required.

Third-party code under [`vendor/`](vendor/) keeps its own licence: three.js is MIT, Inter and JetBrains Mono are SIL OFL 1.1, each licence text sitting beside the files it covers. [`NOTICE.md`](NOTICE.md) is the full accounting — what is bundled, what is fetched, and what you must keep if you redistribute.

**The data is a separate matter.** orbis distributes none of it: the calendar is fetched by you, at runtime, from the providers listed above, and each provider retains whatever rights it has in its own feed. The generated `calendar.json` is not covered by this licence, is not committed to this repository, and is not redistributed by it. Natural Earth geometry is public domain.

If you redistribute a fork that bundles collected data, that is your call to make with the providers — not something this licence grants you.
