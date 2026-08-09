/**
 * scripts/make-icons.mjs
 *
 * Rasterises `public/favicon.svg` into the PNG icons that SVG alone cannot
 * cover. Run deliberately, output committed:
 *
 *   node scripts/make-icons.mjs
 *
 * WHY THIS EXISTS. The site shipped exactly one icon — `favicon.svg` — and the
 * manifest listed only that. Two consequences, both real:
 *
 *   1. NO `apple-touch-icon`. iOS Safari does not read SVG for the home screen,
 *      so "Add to Home Screen" produced a blurry screenshot thumbnail instead of
 *      the app mark. D-67 exists to give iOS an install path; it had one that
 *      looked broken on arrival.
 *   2. NO raster manifest icon. Chrome's installability criteria want a PNG of
 *      at least 192px, and Android's adaptive launcher needs a `maskable` icon
 *      or it centre-crops whatever it is given.
 *
 * WHY PLAYWRIGHT: same argument as make-og-image.mjs — it is already a
 * devDependency for e2e, `sharp` is forbidden by docs/07 §3, and `canvas` needs
 * native bindings. Nothing here ships to the browser.
 *
 * THREE VARIANTS, because the platforms genuinely differ:
 *
 *   apple-touch-icon  FULL BLEED, NO ROUNDED CORNERS. iOS applies its own mask
 *                     and renders any transparency as BLACK, so a rounded-rect
 *                     source produces an icon with four black corners peeking
 *                     out from under Apple's rounding. Square and opaque.
 *   any               Rounded rect, matching favicon.svg. Displayed as-is.
 *   maskable          Full bleed with the glyph scaled into the central safe
 *                     zone. The spec guarantees only a circle of 80% diameter
 *                     survives cropping, so a glyph sized for a square gets its
 *                     extremities shaved off on a round launcher.
 */
import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'public', 'icons');

/** From tokens.css via favicon.svg — not invented here. */
const BRAND = '#4f46e5';

/**
 * The mark, in a 32x32 box: an arrow pointing up out of a baseline, struck
 * through. Kept identical to public/favicon.svg so the raster and the vector
 * cannot drift.
 */
const GLYPH = `
  <path d="M16 21V10m0 0-4.5 4.5M16 10l4.5 4.5" fill="none" stroke="#fff"
        stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 24h16" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round"/>
  <path d="M6 6l20 20" fill="none" stroke="#fff" stroke-width="2.75" stroke-linecap="round"/>
`;

/**
 * @param {{ size: number, radius: number, glyphScale: number }} opts
 *   radius     corner radius in the 32-unit box; 0 for full bleed.
 *   glyphScale 1 = as drawn. Below 1 shrinks the mark about the centre, which is
 *              what a maskable icon needs.
 */
function svg({ size, radius, glyphScale }) {
  const inset = ((1 - glyphScale) * 32) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${inset} ${inset}) scale(${glyphScale})">${GLYPH}</g>
</svg>`;
}

const VARIANTS = [
  {
    file: 'apple-touch-icon.png',
    size: 180,
    radius: 0,
    glyphScale: 0.82,
    note: 'iOS home screen — square, opaque, iOS rounds it',
  },
  { file: 'icon-192.png', size: 192, radius: 7, glyphScale: 1, note: 'manifest, purpose any' },
  { file: 'icon-512.png', size: 512, radius: 7, glyphScale: 1, note: 'manifest, purpose any' },
  {
    file: 'icon-maskable-512.png',
    size: 512,
    radius: 0,
    glyphScale: 0.6,
    note: 'manifest, purpose maskable — glyph inside the 80% safe circle',
  },
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const results = [];

try {
  for (const v of VARIANTS) {
    const context = await browser.newContext({
      viewport: { width: v.size, height: v.size },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html><head><style>
         html,body{margin:0;padding:0;width:${v.size}px;height:${v.size}px;overflow:hidden}
         svg{display:block}
       </style></head><body>${svg(v)}</body></html>`,
      { waitUntil: 'load' },
    );
    const out = path.join(OUT_DIR, v.file);
    // omitBackground:false — these must be OPAQUE. A transparent apple-touch-icon
    // is the exact bug this script exists to prevent.
    await page.screenshot({ path: out, type: 'png', omitBackground: false });
    results.push({ ...v, bytes: statSync(out).size });
    await context.close();
  }

  // ---- Verify, rather than assume ----------------------------------------
  // Reads each PNG back through a canvas and checks the two things that
  // actually break on device: real pixel dimensions, and a fully opaque corner.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('about:blank');
  for (const r of results) {
    const png = path.join(OUT_DIR, r.file);
    const dataUrl =
      'data:image/png;base64,' + (await import('node:fs')).readFileSync(png).toString('base64');
    const probe = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
      return {
        w: img.naturalWidth,
        h: img.naturalHeight,
        topLeft: at(0, 0),
        bottomRight: at(c.width - 1, c.height - 1),
        centre: at(Math.floor(c.width / 2), Math.floor(c.height / 2)),
      };
    }, dataUrl);
    r.probe = probe;
  }
  await context.close();
} finally {
  await browser.close();
}

console.log(`\nicons -> public/icons/\n`);
let bad = 0;
for (const r of results) {
  const p = r.probe;
  const sizeOk = p.w === r.size && p.h === r.size;
  // Corner alpha must be 255 on every variant. On the rounded ones the corner is
  // still opaque because the page background is not transparent.
  const opaque = p.topLeft[3] === 255 && p.bottomRight[3] === 255;
  const ok = sizeOk && opaque;
  if (!ok) bad += 1;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${r.file.padEnd(24)} ${String(p.w) + 'x' + p.h}`.padEnd(46) +
      `${String((r.bytes / 1024).toFixed(1) + ' KB').padStart(9)}  corner alpha ${p.topLeft[3]}  ${r.note}`,
  );
}
console.log(
  bad === 0
    ? `\n${results.length} icons written, all opaque and correctly sized.\n`
    : `\n${bad} icon(s) FAILED verification.\n`,
);
process.exit(bad === 0 ? 0 : 1);
