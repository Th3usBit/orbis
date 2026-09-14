# Notices and attributions

orbis itself is MIT-licensed — see [LICENSE](LICENSE). That covers the code in
this repository written for this project. It does not cover the third-party code
bundled under `vendor/`, nor the calendar data the collector fetches at runtime.
This file says who owns what, and under which terms.

## Bundled in this repository

Committed under [`vendor/`](vendor/) so the page loads nothing from a CDN and
works with no network. Each licence text sits beside the files it covers.

| Component | Version | Licence | Notice |
|---|---|---|---|
| [three.js](https://threejs.org) | r171 | MIT | [`vendor/three/LICENSE`](vendor/three/LICENSE) |
| [Inter](https://rsms.me/inter/) | v4 | SIL OFL 1.1 | [`vendor/fonts/LICENSE-Inter.txt`](vendor/fonts/LICENSE-Inter.txt) |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | v2 | SIL OFL 1.1 | [`vendor/fonts/LICENSE-JetBrainsMono.txt`](vendor/fonts/LICENSE-JetBrainsMono.txt) |
| [Noto Color Emoji](https://github.com/googlefonts/noto-emoji) | v2.051 | SIL OFL 1.1 | [`vendor/fonts/LICENSE-NotoColorEmoji.txt`](vendor/fonts/LICENSE-NotoColorEmoji.txt) |

Copyright © 2010-2024 three.js authors.
Copyright © 2016 The Inter Project Authors.
Copyright © 2020 The JetBrains Mono Project Authors.
Copyright © 2013 Google LLC (Noto Color Emoji).

**On the OFL and the fonts.** The SIL Open Font License permits bundling and
redistribution, including in a commercial product, provided the font files keep
their licence and are not sold on their own. It also reserves the font names:
if you *modify* Inter or JetBrains Mono, the derivative may not be distributed
under those names. orbis ships both unmodified, subset to `latin` and
`latin-ext`, which the licence allows and which does not trigger the name
reservation. Noto Color Emoji is subset the same way -- to the country flags
in `data/countries.json` -- and is likewise unmodified otherwise; it is
referenced from an injected `@font-face` under the family name `orbis flags`,
which is a CSS alias rather than a renamed font file, so the reserved name is
untouched.

**Why not Twemoji.** It is the usual answer for missing flags on Windows and
was rejected here: the Twemoji artwork is CC-BY 4.0, which does require the
visible credit the paragraph below says this project owes nobody. Using it
would have meant putting an attribution line in the interface. Noto is OFL,
so the notice travelling with the file is enough.

**On three.js.** MIT. The notice above, the file in `vendor/three/` and the
`@license` header the build carries all satisfy it.

**On visible attribution.** Neither MIT nor the OFL asks for a credit printed
on screen — that is a CC-BY-style requirement, and these are not CC-BY. What
both require is that the notice travel with the code, which it does: every
licence file sits in the directory it covers and is published with it, so
`vendor/three/LICENSE` and the two font licences are reachable on the live
site alongside the files they cover.

## Fetched at runtime, not distributed here

The collector downloads these when you run it. None of them is committed, and
orbis redistributes none of them — each stays its owner's.

| Source | Role | Terms |
|---|---|---|
| [TradingView](https://www.tradingview.com/economic-calendar/) | primary calendar | Public, key-free endpoint behind their own public widget |
| [ForexFactory](https://www.forexfactory.com/calendar) via FairEconomy | cross-check | Public weekly JSON |
| [Nager.Date](https://date.nager.at) | market holidays | Open-source public holiday API |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | globe geometry | **Public domain** — no restrictions |

Scheduling facts — dates, institutions, published figures — are not themselves
copyrightable, and every event in the interface links back to the source that
published it. The generated `data/calendar.json` is therefore not covered by the
MIT licence in this repository: it is not this project's to license, which is
part of why it is never committed.

If you redistribute a fork that ships collected data rather than fetching it,
that is a question between you and those providers.

## Reusing orbis

Under the MIT licence you may use, modify, sell and redistribute this code,
including in closed-source work. Two obligations come with it:

1. Keep the copyright notice and the licence text (`LICENSE`).
2. Keep the third-party notices for whatever you redistribute from `vendor/` —
   removing the credits from the interface does not remove the obligation, so
   if you restyle that panel away, put the notices somewhere else.

There is no warranty. See [`LICENSE`](LICENSE).
