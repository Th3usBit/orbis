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

Licence texts sit next to the files they cover: `three/LICENSE`,
`fonts/LICENSE-Inter.txt`, `fonts/LICENSE-JetBrainsMono.txt`. The MIT licence in
the repository root covers orbis itself, not these.

Both font families are *variable* fonts, so one file per subset carries every
weight the design uses — four files instead of the fourteen `@font-face` blocks
Google's stylesheet would otherwise hand out. Only `latin` and `latin-ext` are
vendored, which is what English, Portuguese and Spanish need; add the subset
file and a `@font-face` block in `fonts.css` if you add a language that does not.

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

Then open the page and rotate the globe. `js/globe.js` uses 25 three.js classes
and its own shaders; a major version bump can change either.

## Updating the fonts

Fetch Google's stylesheet with a modern browser User-Agent (it serves woff2 only
to browsers it recognises), keep the `latin` and `latin-ext` blocks, download the
files they point at, and rewrite the `src` URLs to `fonts/…` in `fonts.css`.
