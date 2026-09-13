<div align="center">

# orbis

**The world economic calendar, on a globe.**

Every scheduled economic release, central bank decision and market holiday on Earth — plotted on a live 3D globe, lit by the real position of the sun.

No API keys. No backend. No paid tiers. Clone it and run `start.bat`.

[Português](README.pt-BR.md) · [Live demo](https://th3usbit.github.io/orbis/) · [Report an issue](https://github.com/Th3usBit/orbis/issues)

</div>

---

## What it is

An economic calendar is normally a spreadsheet: a wall of rows sorted by time. That format hides the two things that actually matter — **where** the money is moving and **when**, relative to the market that is awake right now.

orbis plots the same data on a rotating globe:

- **Pillars** rise from each country with events on the selected day. Height and colour encode market impact.
- **The lit half of the planet is real.** The day/night terminator is computed from the actual subsolar point, so you can see at a glance whether Tokyo is trading while Frankfurt sleeps.
- **Rings pulse** only on releases landing within the next hour — nothing animates for decoration.
- **A timeline strip** across the bottom shows the load of every day in the window as a stacked micro-chart, so a heavy week is visible before you click into it.

The whole interface speaks English, Português and Español, including translated indicator names and country names. It picks your browser's language on first load and remembers the switch after that.

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

The only requirement is **Python 3.9+**, and only the standard library is used — there is no `pip install` step, no `package.json`, no build tool. Node 18+ is needed only to run the tests below; the site itself never needs it.

**The repository ships no data.** A clone contains source code only: the calendar and the globe geometry are generated on your machine, on first run, from public endpoints. That is deliberate — nobody inherits a stale snapshot of somebody else's session, and the git history stays free of a half-megabyte file that changes every hour. The first run needs a network connection and takes about a minute; every run after that is instant.

Once generated, the data is yours. `offline` skips the collectors and serves what you already have:

```bat
start.bat offline     :: Windows
./start.sh offline    # Linux / macOS
```

This is real offline: Three.js and the fonts are committed under [`vendor/`](vendor/), so the page loads nothing from a CDN and no request from your browser leaves the origin. Globe and all, on a plane.

## How it works

None of the free calendar providers send CORS headers, so a browser cannot call them directly. orbis turns that constraint into an advantage:

```
  ┌────────────────────┐     at deploy time, in CI
  │  scripts/fetch.py  │  ── or whenever you run start ──┐
  └────────────────────┘                                 │
      │                                                  ▼
      ├─ TradingView      (primary: global, impact-rated)
      ├─ ForexFactory     (cross-check: majors)          data/calendar.json
      └─ Nager.Date       (context: market holidays)     one static file
                                                          │
                                                          ▼
                                             ┌────────────────────────┐
                                             │  index.html + three.js │
                                             │  reads the file, draws │
                                             │  the globe. No server. │
                                             └────────────────────────┘
```

Because the output is a single static JSON file, the whole site runs on GitHub Pages for free, forever, with no server to keep alive and no key to leak. The published demo is rebuilt from scratch on every deploy and every six hours — the artefact is uploaded straight to Pages and never committed, so the repository stays clean.

**Reconciliation.** The two calendar feeds are merged rather than concatenated. Events from different providers are treated as the same release when they share a country, land within 45 minutes of each other and their titles are similar enough. Matches are tagged `confirmed_by`, and the UI marks them with a `✦` — a release two independent sources agree on is worth more than one that only appears in a single feed. Unmatched events from the secondary feed are kept as genuine additions.

**Failure isolation.** Each source runs independently. If one is down the run still succeeds, the failure is written into `data/calendar.json`, and the Sources panel shows a red dot with the error. The collector refuses to overwrite good data with an empty result.

## Data sources

All free, all key-free, all reachable without an account.

| Source | Role | Coverage | Why this one |
|---|---|---|---|
| [TradingView Economic Calendar](https://www.tradingview.com/economic-calendar/) | primary | ~80 countries | The richest free feed: importance ratings, actual/forecast/previous as numbers, units, and a link to the releasing institution |
| [ForexFactory](https://www.forexfactory.com/calendar) via the FairEconomy weekly JSON | cross-check | major currencies | Independently maintained, so it corroborates the primary feed and fills its gaps |
| [Nager.Date](https://date.nager.at) | context | worldwide | Open-source public holiday API — tells you when a market is simply closed |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | geometry | worldwide | Public domain coastlines and borders, used once at build time |

**Sources that were evaluated and rejected:**

- **Trading Economics** — the `guest:guest` account returns `410 Gone`; the API is now paid only.
- **MQL5** — no public API. Its calendar is an internal endpoint with no usage terms for third parties.
- **FRED** — excellent and authoritative, but requires an API key, which breaks the "clone and run" promise. It is a good optional addition for US release dates (see the roadmap).

> **On terms of use.** These are public, key-free endpoints that back the providers' own public widgets, and orbis polls them once an hour — roughly what one person reading the site would generate. The data is factual scheduling information (dates, institutions, published figures), which is not itself copyrightable, and every event links back to its source. If you run a fork at higher frequency, be a good citizen and cache aggressively. If you are a provider and want a change, open an issue.

## Project structure

```
orbis/
├── index.html              single page — the whole UI
├── css/orbis.css           design system: tokens, glass panels, timeline
├── js/
│   ├── main.js             boot, tickers, wiring
│   ├── globe.js            three.js scene, shaders, camera flights
│   ├── store.js            state and every derived selector
│   ├── panels.js           DOM rendering for the rails and timeline
│   └── i18n.js             EN/PT/ES strings + indicator translation
├── scripts/
│   ├── fetch.py            collect → reconcile → publish
│   ├── build_geometry.py   TopoJSON → land dot matrix + borders (run once)
│   ├── serve.py            no-cache static dev server
│   └── sources/            one module per provider
├── tests/                  state layer, translations, and the offline guarantee
├── data/
│   ├── calendar.json       generated, git-ignored — the only file the page reads
│   └── countries.json      hand-maintained reference (capitals, currencies)
├── assets/                 generated, git-ignored — globe geometry
└── vendor/                 three.js and the fonts, committed — no CDN
```

Everything marked *generated* is absent from a fresh clone and rebuilt by `start`. Only `countries.json` is committed, because it is hand-written reference data rather than a fetched snapshot.

## Configuration

**Time window.** Defaults to 7 days back and 21 days ahead:

```bash
python scripts/fetch.py --days-back 14 --days-ahead 45
```

**Globe density.** Change `DOT_SPACING_DEG` in `scripts/build_geometry.py` (lower = more dots), delete `assets/land-dots.json`, and re-run it.

**Impact colours.** Defined once in `css/orbis.css` as `--impact-*` and mirrored in `js/globe.js` as `IMPACT_COLORS` — change both.

## Running your own

orbis is designed to be forked and self-hosted, with nothing to configure and nobody to ask:

1. Fork the repository.
2. **Settings → Pages → Source: GitHub Actions.**
3. Push anything, or run the **Deploy to Pages** workflow by hand.

Your fork builds its own geometry, collects its own calendar and publishes to your own `github.io` URL. No secrets to add, no API keys, no account with any data provider, and no bot committing data into your branches. The scheduled rebuild runs every six hours; if you would rather it did not run at all, delete the `schedule:` block in `.github/workflows/pages.yml`.

That rebuild is the only thing that keeps the published calendar current — the site has no backend, so the data is exactly as old as the last deploy. **GitHub disables a scheduled workflow in a public repository after 60 days without activity**, and since the collector only looks 21 days ahead, a fork left alone for two months goes quiet and then, about three weeks later, starts serving an empty calendar without anything appearing to be broken. If you are not pushing to your fork regularly, check the Actions tab now and then, or re-enable it with `gh workflow enable "Deploy to Pages"`.

`CI` runs the same build on Linux, Windows and macOS against a clean checkout, which is the check that your fork still satisfies the clone-and-run promise.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the house rules and how to add a data source. In short: no data in the repo, no dependencies, no API keys.

The easiest useful contributions:

- **Add a country.** One line in `data/countries.json` with its capital's coordinates and currency.
- **Improve a translation.** `PHRASES` in `js/i18n.js` maps English indicator, holiday and period names to each language. Group a new row wherever it belongs — ordering is handled on load, and every rule is anchored to word edges, so nothing fires inside a longer word. Any unmapped phrase falls back to English, so partial coverage is safe.

  The calendar is rebuilt on every run, so `tests/i18n.test.mjs` checks the tables against whatever the feeds published rather than against a fixture. It fails on a phrase that never fires, a language missing a key the others have, and on any title that comes out spliced.
- **Add a language.** Four edits across three files, no build step: a block in `UI` and a table in `PHRASES` (both in `js/i18n.js`), a `name_xx` column in `data/countries.json`, and a button with its flag in the `.lang` group in `index.html`.
- **Add a source.** Drop a module in `scripts/sources/` exposing `ID`, `NAME`, `HOMEPAGE` and a `fetch()` that returns the normalized event shape, then register it in `scripts/fetch.py`. Sources that are free and key-free only, please — that constraint is the point of the project.
Before opening a PR, run the state-layer checks against your own freshly
fetched data:

```bash
python scripts/fetch.py
node tests/store.test.mjs .
node tests/i18n.test.mjs .
node tests/merge.test.mjs .
node tests/offline.test.mjs .
```

- **Sharpen the classifier.** `CATEGORY_PATTERNS` in `scripts/sources/classify.py` decides which bucket an event falls into. Misfiled events are easy to spot and easy to fix.

## Roadmap

- [ ] Optional FRED integration for authoritative US release dates (opt-in via key)
- [ ] Central bank meeting calendars scraped from the institutions themselves
- [ ] Historical surprise index per country
- [x] Vendored three.js so the page works fully offline
- [ ] iCal export of the events matching your filters

## Disclaimer

orbis is an informational and educational tool. It aggregates publicly published scheduling data and is **not investment advice**. Figures can be revised, feeds can be wrong, and times can shift. Verify anything you intend to trade against the releasing institution — every event links to its source for exactly that reason.

## License

[MIT](LICENSE) — **the code**: use it, fork it, sell it, no attribution beyond the licence notice required.

Third-party code under [`vendor/`](vendor/) keeps its own licence: three.js is MIT, Inter and JetBrains Mono are SIL OFL 1.1, each licence text sitting beside the files it covers, and all three credited in the Sources panel of the running app. [NOTICE.md](NOTICE.md) is the full accounting — what is bundled, what is fetched, and what you must keep if you redistribute.

**The data is a separate matter.** orbis distributes none of it: the calendar is fetched by you, at runtime, from the providers listed above, and each provider retains whatever rights it has in its own feed. The generated `calendar.json` is not covered by this licence, is not committed to this repository, and is not redistributed by it. Every event links back to its source, and the Sources panel credits each provider by name. Natural Earth geometry is public domain.

If you redistribute a fork that bundles collected data, that is your call to make with the providers — not something this licence grants you.
