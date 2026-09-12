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

The only requirement is **Python 3.9+**, and only the standard library is used — there is no `pip install` step, no `package.json`, no build tool.

Already have the data and just want the page?

```bat
start.bat offline
```

## How it works

None of the free calendar providers send CORS headers, so a browser cannot call them directly. orbis turns that constraint into an advantage:

```
  ┌────────────────────┐     hourly, in GitHub Actions
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

Because the output is a single static JSON file, the whole site runs on GitHub Pages for free, forever, with no server to keep alive and no key to leak.

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
│   └── i18n.js             EN/PT-BR strings + indicator translation
├── scripts/
│   ├── fetch.py            collect → reconcile → publish
│   ├── build_geometry.py   TopoJSON → land dot matrix + borders (run once)
│   ├── serve.py            no-cache static dev server
│   └── sources/            one module per provider
├── tests/store.test.mjs    smoke tests for the state layer (optional, needs Node)
├── data/
│   ├── calendar.json       generated — the only file the page reads
│   └── countries.json      hand-maintained reference (capitals, currencies)
└── assets/                 generated globe geometry
```

## Configuration

**Time window.** Defaults to 7 days back and 21 days ahead:

```bash
python scripts/fetch.py --days-back 14 --days-ahead 45
```

**Globe density.** Change `DOT_SPACING_DEG` in `scripts/build_geometry.py` (lower = more dots), delete `assets/land-dots.json`, and re-run it.

**Impact colours.** Defined once in `css/orbis.css` as `--impact-*` and mirrored in `js/globe.js` as `IMPACT_COLORS` — change both.

## Contributing

Pull requests welcome. The easiest useful contributions:

- **Add a country.** One line in `data/countries.json` with its capital's coordinates and currency.
- **Improve a translation.** `PHRASES` in `js/i18n.js` maps English indicator, holiday and period names to each language. Group a new row wherever it belongs — ordering is handled at compile time, and every rule is anchored to word edges, so nothing fires inside a longer word. Any unmapped phrase falls back to English, so partial coverage is safe.

  The calendar is rebuilt hourly, so `tests/i18n.test.mjs` checks the tables against whatever the feeds published rather than against a fixture. It fails on a phrase that never fires, a language missing a key the others have, and on any title that comes out spliced.
- **Add a language.** Three edits, no build step: a block in `UI` and a table in `PHRASES` (both in `js/i18n.js`), a `name_xx` column in `data/countries.json`, and a button with its flag in the `.lang` group in `index.html`.
- **Add a source.** Drop a module in `scripts/sources/` exposing `ID`, `NAME`, `HOMEPAGE` and a `fetch()` that returns the normalized event shape, then register it in `scripts/fetch.py`. Sources that are free and key-free only, please — that constraint is the point of the project.
Before opening a PR, run the state-layer checks against your own freshly
fetched data:

```bash
python scripts/fetch.py
node tests/store.test.mjs .
node tests/i18n.test.mjs .
```

- **Sharpen the classifier.** `CATEGORY_PATTERNS` in `scripts/sources/classify.py` decides which bucket an event falls into. Misfiled events are easy to spot and easy to fix.

## Roadmap

- [ ] Optional FRED integration for authoritative US release dates (opt-in via key)
- [ ] Central bank meeting calendars scraped from the institutions themselves
- [ ] Historical surprise index per country
- [ ] Vendored three.js so the page works fully offline
- [ ] iCal export of the events matching your filters

## Disclaimer

orbis is an informational and educational tool. It aggregates publicly published scheduling data and is **not investment advice**. Figures can be revised, feeds can be wrong, and times can shift. Verify anything you intend to trade against the releasing institution — every event links to its source for exactly that reason.

## License

[MIT](LICENSE) — the code. The underlying calendar data belongs to its respective providers, each credited in the Sources panel and linked from every event.
