# vendor/

Third-party assets, committed on purpose.

orbis loads nothing from a CDN. Everything the page needs is served from the
repository itself, so the site works on a machine with no internet, behind a
corporate proxy that blocks jsDelivr, or in any network where Google Fonts is
unreachable — and no request from a viewer's browser ever reaches a third party.

Nothing here is generated, so unlike `data/` and `assets/` these files *are*
committed. They are also the only third-party code in the project: the Python
collector remains standard library only.

## Contents

| Path | Version | Licence | Upstream |
|---|---|---|---|
| `three/three.module.min.js` | r171 | MIT | [three.js](https://github.com/mrdoob/three.js) |
| `three/three.core.min.js` | r171 | MIT | same — `three.module` imports it |
| `three/OrbitControls.js` | r171 | MIT | `examples/jsm/controls/` |
| `fonts/inter-*.woff2` | v4 | SIL OFL 1.1 | [Inter](https://github.com/rsms/inter) |
| `fonts/jetbrains-mono-*.woff2` | v2 | SIL OFL 1.1 | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) |
| `fonts/noto-color-emoji-flags.woff2` | v2.051 | SIL OFL 1.1 | [Noto Emoji](https://github.com/googlefonts/noto-emoji) |

Licence texts sit next to the files they cover: `three/LICENSE`,
`fonts/LICENSE-Inter.txt`, `fonts/LICENSE-JetBrainsMono.txt`,
`fonts/LICENSE-NotoColorEmoji.txt`. The MIT licence in the repository root
covers orbis itself, not these.

Both font families are *variable* fonts, so one file per subset carries every
weight the design uses — four `@font-face` blocks instead of the fourteen
Google's stylesheet would otherwise hand out for these families. Only `latin` and `latin-ext` are
vendored, which is what English, Portuguese and Spanish need; add the subset
file and a `@font-face` block in `fonts.css` if you add a language that does not.

## The flag font

`noto-color-emoji-flags.woff2` exists because Windows has no country flags.
Segoe UI Emoji has shipped none since Windows 8 -- a Microsoft decision that
has not been reverted, and one Chromium has said it will not work around -- so
Chrome and Edge there render `flagOf('JP')` as the two letters "JP" rather than
🇯🇵. Firefox is unaffected on every platform because it bundles its own Twemoji.

It is the only vendored file the page does not always load. `js/flags.js`
measures whether the platform joins a pair of regional indicators and injects
the `@font-face` only when it does not, so the 205KB is paid by the browsers
that need it and by nobody else. The `unicode-range` is `U+1F1E6-1F1FF`, so
even there the font is consulted for flags and for no other character.

Twemoji was the other candidate and was rejected on licensing: its artwork is
CC-BY 4.0, which requires visible attribution, and `NOTICE.md` explains why
this project has none. Noto Color Emoji is SIL OFL 1.1, the same licence as
the two text families already here.

### Rebuilding it

Google serves the flag slice already separated by `unicode-range`, but with the
full 17k-glyph `glyf` table attached -- 693KB. Subsetting it down to the 84
countries in `data/countries.json` needs two passes, because the ordinary
closure walks from the 26 regional indicators out to all 259 flags, and from
each flag into its COLRv1 layers:

1. prune the GSUB ligature table to the pairs this project can draw;
2. walk the COLRv1 paint graph from those and keep only the glyphs it reaches.

That yields 205KB. It does not go lower: the 6,034 glyphs that survive are the
vector layers the flags are actually made of, not orphans. `fontTools` and
`brotli` are needed for the rebuild; neither is a dependency of the site.

## Updating three.js

```bash
V=0.171.0   # pick the version you want
B=https://cdn.jsdelivr.net/npm/three@$V
curl -o vendor/three/three.module.min.js "$B/build/three.module.min.js"
curl -o vendor/three/three.core.min.js   "$B/build/three.core.min.js"
curl -o vendor/three/OrbitControls.js    "$B/examples/jsm/controls/OrbitControls.js"
curl -o vendor/three/LICENSE             "$B/LICENSE"
```

Take both build files: since r171 `three.module` is a thin wrapper that imports
`./three.core.min.js`, and fetching one without the other breaks the page in a
way no test catches until the globe fails to draw.

Then open the page and rotate the globe. `js/globe.js` leans on about
twenty-five three.js classes and its own shaders; a major version bump can
change either.

## Updating the fonts

Fetch Google's stylesheet with a modern browser User-Agent (it serves woff2 only
to browsers it recognises), keep the `latin` and `latin-ext` blocks, download the
files they point at, and rewrite the `src` URLs to `fonts/…` in `fonts.css`.
