/**
 * Country flags on a system that has none.
 *
 * `flagOf` turns "BR" into two regional indicator characters and leaves it to
 * the font to join them into one flag. Every platform does that -- except
 * Windows: Segoe UI Emoji has carried no country flags since Windows 8, by a
 * Microsoft decision that has never been reverted, and Chromium has said it
 * will not work around it. So Chrome and Edge on Windows draw the two letters
 * instead -- "JP Japão", "DE Alemanha", "CN" on the countdown card. Firefox is
 * fine on any platform, because it ships its own Twemoji.
 *
 * The fix is a font, and the font is 205KB -- which is why it is not simply
 * linked from the stylesheet. Most visitors already have flags and would be
 * paying for a file that changes nothing they can see. This asks first, and
 * loads it only where the answer is no.
 *
 * Measured on the machines this was reproduced on: a composed flag is a single
 * glyph, so it is as wide as one regional indicator (ratio 1.0); an uncomposed
 * pair is two glyphs side by side (ratio 1.94). That number is identical at
 * 13px and at 40px, and identical in Chrome and Edge, so the 1.5 threshold has
 * a wide margin either side. `document.fonts.check()` looks like the obvious
 * API for this and is useless: it answers true for "Noto Color Emoji" and
 * "Twemoji Mozilla" on a machine that has neither installed.
 */

const FAMILY = 'orbis flags';
const FILE = 'vendor/fonts/noto-color-emoji-flags.woff2';

/* U+1F1E7 U+1F1F7 -- the pair behind the Brazilian flag, and a sufficient
   test: a font that joins these joins all of them. */
const PAIR = '\u{1F1E7}\u{1F1F7}';
const SINGLE = '\u{1F1E7}';

/** Does this font stack join a pair of regional indicators into one flag? */
export function composesFlags(stack) {
  try {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return true;
    const width = (text) => {
      context.font = `40px ${stack}`;
      return context.measureText(text).width;
    };
    const single = width(SINGLE);
    if (!single) return true;
    return width(PAIR) / single < 1.5;
  } catch {
    // A flag is not worth an exception: assume the platform is fine and leave
    // the page exactly as it was.
    return true;
  }
}

/**
 * Load the flag font, once, and only where the platform lacks flags.
 *
 * Injected rather than declared in orbis.css so that only the browsers missing
 * flags request the file. `unicode-range` is what makes it safe to name the
 * family first on `body`: the font is consulted for regional indicators and
 * for nothing else, so every other character on the page still comes from
 * Inter exactly as before. It has to go on `body` rather than on the flag
 * elements because two of the four places a flag appears -- the panel title
 * and the globe tooltip -- put the flag and the country name in one text node.
 *
 * Returns whether the font was needed, which is what the tests asserts on.
 */
export function ensureFlagFont() {
  const stack = getComputedStyle(document.body).fontFamily || 'Inter, sans-serif';
  if (composesFlags(stack)) return false;

  const style = document.createElement('style');
  style.textContent = `@font-face {
  font-family: '${FAMILY}';
  src: url('${FILE}') format('woff2');
  unicode-range: U+1F1E6-1F1FF;
  font-display: swap;
}
body { font-family: '${FAMILY}', ${stack}; }`;
  document.head.append(style);

  // So the test suite -- and anyone debugging a report of missing flags -- can
  // tell a platform that needed the font from one that drew flags natively.
  document.documentElement.dataset.flagFont = 'loaded';
  return true;
}
