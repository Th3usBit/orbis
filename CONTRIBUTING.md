# Contributing to orbis

Thanks for taking the time. orbis is deliberately small and dependency-free,
and contributions are judged partly on whether they keep it that way.

## Ground rules

**No data in the repository.** `data/calendar.json`, `assets/land-dots.json`
and `assets/borders.json` are generated artefacts and are git-ignored. If a
diff of yours contains one of them, something went wrong — do not commit it,
and never use `git add -f` on them.

**No dependencies, and no CDN.** The collector uses the Python standard library
and nothing else: no `requirements.txt`, no `pip install`. The site is plain ES
modules: no `package.json`, no bundler, no build step. A change that introduces
a package manager is a change to the project's premise, so open an issue first.

The one exception is `vendor/`, where three.js and the two fonts are committed
so the page loads nothing from a third party and works with no network at all.
Adding a file there is a deliberate act, not a convenience: it means shipping
someone else's code, with their licence, forever. Do not point the page at a
CDN to avoid it — that trades every viewer's privacy and every offline user's
globe for a smaller diff.

**No keys, no backend.** Every source orbis reads is public and unauthenticated.
A source that needs an API key does not belong here, because it would break the
promise that a clone works for anyone with no account anywhere.

## Getting set up

```bash
git clone https://github.com/<you>/orbis.git
cd orbis
./start.sh          # Windows: start.bat
```

The first run builds the globe geometry (~30s, downloads public-domain Natural
Earth data), collects the calendar, and opens `http://127.0.0.1:8080`.

Working offline afterwards:

```bash
./start.sh offline  # reuses whatever you already generated
```

## Running the checks

```bash
python scripts/build_geometry.py    # regenerate assets/
python scripts/fetch.py             # regenerate data/calendar.json
node tests/store.test.mjs .         # smoke-test the state layer (needs Node 18+)
node tests/i18n.test.mjs .          # check the EN/PT/ES translation tables
node tests/offline.test.mjs .       # check nothing loads from a CDN
```

CI runs exactly this on Linux, Windows and macOS against a fresh clone. If it
passes locally on a clean checkout, it will pass there.

## Adding or improving a language

The UI speaks English, Portuguêse and Spanish. Everything lives in `js/i18n.js`:
a `UI` block of interface strings and a `PHRASES` table translating indicator
names, plus a `name_xx` column per country in `data/countries.json`.

A fourth language is a data edit, not a code change: add a `UI` block, a
`PHRASES` table, the country column and a button. `tests/i18n.test.mjs` enforces
that every language carries the same keys, so a missing string fails the build
rather than silently falling back.

Phrase rules are anchored to word edges, so a short rule cannot fire inside a
longer word. Keep it that way — the test probes each rule for exactly this.

## Adding a data source

Each source is one module in `scripts/sources/` exposing:

```python
ID       = "example"                       # stable slug, used in the UI
NAME     = "Example"                       # display name
HOMEPAGE = "https://example.com/calendar"  # credited in the sources panel

def fetch(window, ...) -> list[dict]: ...
```

Return rows in the shape the other adapters return (see `tradingview.py` for the
fullest example). Wire the module into `collect()` in `scripts/fetch.py`.

A failing source must never fail the run — `collect()` already catches per-source
exceptions and records them, so the UI can report degraded coverage honestly.
Preserve that.

## Style

Match the surrounding code. Comments explain *why*, not *what*. The codebase is
commented sparsely and deliberately; prose that restates the line below it will
be asked about in review.

Commit messages use a short prefix: `fix:`, `feat:`, `docs:`, `data:`, `ci:`.

## Reporting bugs

Open an issue with what you ran, what you expected, and what happened. If the
globe misbehaves, include your browser and whether WebGL is available
(`chrome://gpu`, or https://get.webgl.org).
