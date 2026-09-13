/**
 * The picture a shared link shows.
 *
 * A project whose entire argument is what it looks like was being posted as a
 * grey rectangle with a title in it. This renders the real page at the Open
 * Graph size and saves a screenshot, so the preview can never drift from what
 * a visitor actually sees -- there is no hand-made asset to forget to update
 * when the design changes.
 *
 *     node scripts/social_card.mjs <repo root> [output]
 *
 * Playwright is a CI tool here and never enters the repository, exactly as in
 * tests/ui.test.mjs. When it is absent this exits 0 with a notice: a missing
 * preview image must not fail a deploy, because the site works without it.
 */

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const ROOT = process.argv[2] ?? '.';
const OUT = process.argv[3] ?? path.join(ROOT, 'assets', 'social.png');

/* Open Graph's canonical size. Twitter, LinkedIn, Slack and WhatsApp all crop
   from it rather than asking for their own. */
const WIDTH = 1200;
const HEIGHT = 630;
const PORT = Number(process.env.ORBIS_PORT ?? 8351);
const SITE = `http://127.0.0.1:${PORT}/`;

let chromium;
{
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) {
    const given = process.env.PLAYWRIGHT_PATH;
    if (!given.startsWith('file:') && /[\\/]/.test(given)) candidates.push(pathToFileURL(given).href);
    candidates.push(given);
  }
  candidates.push('playwright');

  for (const name of candidates) {
    try {
      ({ chromium } = await import(name));
      if (chromium) break;
    } catch { /* try the next */ }
  }

  if (!chromium) {
    console.log('  SKIP  Playwright not found; leaving the social card as it is.');
    process.exit(0);
  }
}

const up = async () => fetch(SITE).then((r) => r.ok).catch(() => false);
let server = null;
if (!(await up())) {
  server = spawn(process.platform === 'win32' ? 'python' : 'python3',
    ['scripts/serve.py', '--no-browser', '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up()); i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 250); });
  }
}
const shutdown = () => { try { server?.kill(); } catch { /* already gone */ } };
process.on('exit', shutdown);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  // Deterministic framing: the terminator follows real time, so without a
  // fixed timezone the globe is lit differently on every run.
  timezoneId: 'UTC',
  // English, because the card is what the world sees first and the repository
  // describes itself in English. The page otherwise picks the runner's locale,
  // which is nobody's deliberate choice.
  locale: 'en-GB',
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForSelector('#shell:not([hidden])', { timeout: 40000 });

// Let the opening camera flight finish and the markers settle, or the card
// catches the globe mid-approach.
await page.waitForTimeout(6000);

// The hint is an instruction to somebody using the page, and this is a
// picture. The boot overlay is gone by now but is removed defensively.
await page.evaluate(() => {
  document.getElementById('hint')?.remove();
  document.getElementById('boot')?.remove();
  // At 630px the rail is taller than the frame and its last card is sliced
  // through a row of chips. Dropping the two that give way leaves the globe,
  // the impact scale and the event list -- which is the argument the card is
  // making -- rather than a half-drawn list of categories.
  document.querySelector('.card-scroll')?.remove();
  document.querySelector('.card-meta')?.remove();
});
await page.waitForTimeout(400);

await mkdir(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });

console.log(`  wrote ${path.relative(ROOT, OUT)} (${WIDTH}x${HEIGHT})`);

await browser.close();
shutdown();
