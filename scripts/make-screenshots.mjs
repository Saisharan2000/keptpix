/**
 * scripts/make-screenshots.mjs
 *
 * Renders marketing screenshots to `screenshots/`, once, by hand.
 *
 *   node scripts/make-screenshots.mjs          # needs a built dist/
 *
 * NOT part of `npm run build`, for the same reason as make-og-image.mjs: the
 * output changes when the UI changes, not when the bytes do, so regenerating it
 * every build would burn four browser launches for identical files. The output
 * is git-ignored rather than committed — unlike the OG card these are not served
 * to anyone, they are dragged into a directory submission form by hand.
 *
 * WHY PLAYWRIGHT: already a devDependency for e2e (make-og-image.mjs argued this
 * at length). Adds nothing to the bundle and runs no code in production.
 *
 * WHY POPULATED STATES: an empty dropzone photographs as an empty box. The two
 * tool shots below add real files through the real file input — the same
 * technique tests/e2e/images-to-pdf.spec.ts uses — so the screenshot shows
 * thumbnails, filenames and byte counts, which is what the product actually
 * looks like in use. A screenshot of an idle page is honest but says nothing.
 *
 * WHY dist/ AND NOT PRODUCTION: this captures the build in the working tree, so
 * a screenshot can never show a version that is not the one being shipped.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'screenshots');

/**
 * Desktop at 2x. AlternativeTo displays screenshots in a lightbox at roughly
 * 1200px wide, so 1280 logical is the smallest width that is not upscaled, and
 * deviceScaleFactor 2 keeps text crisp on the retina displays most reviewers
 * are using.
 */
const VIEWPORT = { width: 1280, height: 800 };
const SCALE = 2;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

/**
 * `build.format: 'file'` (D-65) means /pdf/merge is dist/pdf/merge.html, so the
 * bare path needs the extension appended before it resolves.
 */
async function resolveFile(pathname) {
  const clean = pathname.split('?')[0];
  for (const candidate of [clean, clean + '.html', path.join(clean, 'index.html')]) {
    const full = path.join(DIST, candidate);
    if (!full.startsWith(DIST)) return null; // traversal
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (file === null) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      // The codecs need this, and a screenshot of a failed decode is worthless.
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    res.end(await readFile(file));
  });
  // Port 0 = let the OS pick a free one. Hardcoding a port is how you end up
  // photographing a stale dev server that happens to hold it (docs/12 D-88).
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** Waits for the island to hydrate — an un-hydrated tool page has no controls. */
async function hydrated(page) {
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('input[type="file"]') !== null, null, {
    timeout: 30_000,
  });
  // Let the fonts settle, or text reflows mid-capture.
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Adds synthetic images through the real file input, exactly as the e2e suite
 * does. Different sizes per file so the list does not look copy-pasted.
 */
async function addImages(page, count, { type = 'image/jpeg', width = 4000, height = 3000 } = {}) {
  await page.evaluate(
    async ({ n, mime, w, h }) => {
      const input = document.querySelector('input[type="file"]');
      if (input === null) throw new Error('no file input');
      const transfer = new DataTransfer();
      const palette = ['#4f46e5', '#0891b2', '#059669', '#c026d3', '#ea580c', '#0284c7'];
      for (let i = 0; i < n; i += 1) {
        const canvas = document.createElement('canvas');
        // 12 MP, like a phone camera. Deliberately large: the first version of
        // this script made 1400x1000 files that came out at 45-60 KB, which on
        // a page titled "Compress JPG to 100KB" is a demo of nothing. The
        // source has to exceed the target or the screenshot argues against us.
        canvas.width = w + i * 120;
        canvas.height = h + i * 60;
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('no 2d context');
        // A gradient, not a flat fill: a flat colour compresses to almost
        // nothing and the byte counts in the screenshot would look fake.
        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, palette[i % palette.length]);
        g.addColorStop(1, palette[(i + 3) % palette.length]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Enough high-frequency detail that JPEG cannot trivially compress it.
        // A smooth gradient alone encodes to almost nothing at 12 MP.
        for (let k = 0; k < 2600; k += 1) {
          ctx.globalAlpha = 0.1 + Math.random() * 0.2;
          ctx.fillStyle = palette[(i + k) % palette.length];
          ctx.beginPath();
          ctx.arc(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
            Math.random() * 160,
            0,
            7,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.95));
        if (blob === null) throw new Error('toBlob failed');
        const ext = mime === 'image/png' ? 'png' : 'jpg';
        transfer.items.add(new File([blob], `IMG_${4600 + i}.${ext}`, { type: mime }));
      }
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { n: count, mime: type, w: width, h: height },
  );
}

/**
 * Puts a real file from disk through the real file input.
 *
 * The metadata viewer needs this. Canvas-produced JPEGs carry NO EXIF, so the
 * first version of this script screenshotted the EXIF/GPS tool showing an empty
 * result — a picture of the feature not working. `portrait-scrubbed.HEIC` has
 * genuine EXIF whose GPS is synthetic (Greenwich Observatory, injected by
 * scripts/scrub-fixture.mjs), so it demonstrates GPS detection without
 * publishing anyone's location.
 */
async function addRealFile(page, absPath, name, mime) {
  const base64 = (await readFile(absPath)).toString('base64');
  await page.evaluate(
    ({ b64, fileName, fileType }) => {
      const input = document.querySelector('input[type="file"]');
      if (input === null) throw new Error('no file input');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], fileName, { type: fileType }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { b64: base64, fileName: name, fileType: mime },
  );
}

/** Waits for every card to reach the green "Done" badge. */
async function allDone(page, expected, timeout = 180_000) {
  await page.waitForFunction(
    (n) => [...document.querySelectorAll('span')].filter((s) => s.textContent?.trim() === 'Done').length >= n,
    expected,
    { timeout },
  );
}

const shots = [
  {
    name: '01-home',
    route: '/',
    caption: 'Homepage — the tool grid',
    async prepare(page) {
      await page.evaluate(() => document.fonts.ready);
    },
  },
  {
    name: '02-compress-done',
    route: '/compress/jpg-to-100kb',
    caption: 'Compressed to an exact target — before and after, real numbers',
    async prepare(page) {
      await hydrated(page);
      await addImages(page, 4);
      // Thumbnails are object URLs decoded off-thread; without this the shot
      // catches grey placeholders.
      await page.waitForFunction(
        () => {
          const imgs = [...document.querySelectorAll('img')].filter((i) =>
            (i.currentSrc || i.src || '').startsWith('blob:'),
          );
          return imgs.length >= 3 && imgs.every((i) => i.complete && i.naturalWidth > 0);
        },
        null,
        { timeout: 30_000 },
      );
      // ACTUALLY RUN IT. A queued list proves the file picker works; the claim
      // this page makes is that the output lands under the limit, and only the
      // finished state shows that.
      await page.getByRole('button', { name: /^Convert \d+ files?$/ }).click();
      await allDone(page, 4);
    },
  },
  {
    name: '03-pdf-from-images',
    route: '/pdf/from-images',
    caption: 'Building a PDF from photos, page order visible',
    async prepare(page) {
      await hydrated(page);
      await addImages(page, 3);
      await page.waitForFunction(
        () => {
          const imgs = [...document.querySelectorAll('ol li img')];
          return imgs.length >= 3 && imgs.every((i) => i.complete && i.naturalWidth > 0);
        },
        null,
        { timeout: 30_000 },
      );
      // Open the disclosure so the settings are visible rather than implied
      // (D-86 collapsed them by default, which is right for use and wrong for
      // a screenshot that needs to show the tool has options).
      const toggle = page.getByText('the defaults are fine');
      if ((await toggle.count()) > 0) {
        await toggle.first().click();
        await page.waitForTimeout(250);
      }
    },
  },
  {
    name: '04-metadata',
    route: '/metadata',
    caption: 'What a photo is carrying — EXIF and GPS, from a real HEIC',
    async prepare(page) {
      await hydrated(page);
      await addRealFile(
        page,
        path.join(ROOT, 'tests/fixtures/images/portrait-scrubbed.HEIC'),
        'IMG_4650.HEIC',
        'image/heic',
      );
      // The GPS warning dot only renders once metadata has been parsed
      // (FileCard checks `source.metadata?.hasGps`), so it is the honest signal
      // that the read finished — better than a fixed wait.
      await page
        .waitForFunction(
          () => {
            const info = [...document.querySelectorAll('button')].find(
              (b) => b.textContent?.trim() === 'Info',
            );
            return info !== undefined && info.querySelector('span') !== null;
          },
          null,
          { timeout: 60_000 },
        )
        .catch(() => {});
      const info = page.getByRole('button', { name: 'Info' }).first();
      if ((await info.count()) > 0) {
        await info.click();
        await page.waitForTimeout(600);
      }
    },
  },
];

mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const { server, port } = await startServer();
const browser = await chromium.launch();
const results = [];

try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      colorScheme: 'light',
      // Deterministic: a screenshot that reads "2 minutes ago" ages badly.
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    try {
      await page.goto(`http://127.0.0.1:${port}${shot.route}`, { waitUntil: 'load' });
      await shot.prepare(page);
      const file = path.join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: file, type: 'png', fullPage: false });
      const kb = (statSync(file).size / 1024).toFixed(0);
      results.push({ ok: true, name: shot.name, kb, caption: shot.caption, errors });
    } catch (e) {
      results.push({ ok: false, name: shot.name, why: String(e).split('\n')[0].slice(0, 140), errors });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\nscreenshots -> ${path.relative(ROOT, OUT_DIR)}/  (${VIEWPORT.width}x${VIEWPORT.height} @${SCALE}x)\n`);
for (const r of results) {
  if (r.ok) {
    console.log(`  ok    ${r.name}.png  ${String(r.kb).padStart(4)} KB   ${r.caption}`);
  } else {
    console.log(`  FAIL  ${r.name}  ${r.why}`);
  }
  for (const e of r.errors ?? []) console.log(`        page error: ${e}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(
  failed === 0
    ? `\n${results.length} screenshots written.\n`
    : `\n${failed} of ${results.length} failed.\n`,
);
process.exit(failed === 0 ? 0 : 1);
