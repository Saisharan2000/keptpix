/**
 * scripts/make-og-image.mjs
 *
 * Renders the Open Graph card to `public/og/default.png`, once, by hand.
 *
 * NOT part of `npm run build`. The output is committed and changes only when
 * the brand does, so regenerating it on every build would burn a browser launch
 * for a byte-identical file. Run it deliberately:
 *
 *   node scripts/make-og-image.mjs
 *
 * WHY PLAYWRIGHT: an OG image has to be a raster. Facebook does not render SVG
 * `og:image` at all and several scrapers agree with it, so shipping an SVG means
 * shipping no card. Producing a PNG needs something that rasterises, and the
 * options were a new dependency — `sharp` is forbidden by docs/07 §3, `canvas`
 * needs native bindings — or the headless browser this repo already installs for
 * e2e. Playwright is a devDependency that is already here, adds nothing to the
 * bundle, and runs no code in production.
 *
 * Colours come from tokens.css rather than being invented here, so the card
 * cannot drift away from the site it represents.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** The size every platform crops from. 1.91:1. */
const WIDTH = 1200;
const HEIGHT = 630;

/** From src/styles/tokens.css — the dark theme, which is the stronger card. */
const BG = '#0b0e13';
const TEXT = '#eef1f6';
const MUTED = '#a2acbb';
const ACCENT = '#4f46e5';

const OUT_DIR = join(process.cwd(), 'public', 'og');
const OUT = join(OUT_DIR, 'default.png');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${WIDTH}px;height:${HEIGHT}px}
  body{
    background:${BG};
    color:${TEXT};
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:flex;flex-direction:column;justify-content:center;
    padding:80px;position:relative;overflow:hidden;
  }
  /* A single accent stripe. Anything more would be decoration competing with
     the one sentence that has to survive being scaled into a chat preview. */
  .stripe{position:absolute;left:0;top:0;bottom:0;width:14px;background:${ACCENT}}
  .brand{font-size:40px;font-weight:700;letter-spacing:-0.02em}
  h1{font-size:82px;font-weight:700;line-height:1.05;letter-spacing:-0.03em;margin-top:28px;max-width:20ch}
  .sub{font-size:32px;color:${MUTED};margin-top:32px;max-width:34ch;line-height:1.35}
  .foot{position:absolute;bottom:64px;left:80px;font-size:28px;color:${MUTED}}
  .em{color:${TEXT};font-weight:600}
</style></head>
<body>
  <div class="stripe"></div>
  <div class="brand">KeptPix</div>
  <h1>Your files never leave your device</h1>
  <p class="sub">Convert, compress and build PDFs in your browser. No upload, no sign-up.</p>
  <div class="foot">keptpix.com &nbsp;·&nbsp; <span class="em">verify it yourself in a minute</span></div>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    // 1x: the card is already at its native size, and a 2x render would be
    // 2400px wide for no visible gain and four times the bytes.
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: OUT, type: 'png' });
  console.log('wrote ' + OUT + ` (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
