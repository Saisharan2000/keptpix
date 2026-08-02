/**
 * tests/e2e/convert.spec.ts
 *
 * Spec: docs/10-build-plan.md Milestone 7.
 * "Happy path: land on a route, drop a file, convert, download — asserted per
 * supported format pair in Wave 1."
 *
 * Drives the REAL page through the REAL UI — not the QueueController API the
 * integration suite calls directly. That distinction matters: every other
 * suite proves the algorithm and the pipeline are correct, but none of them
 * proves a user clicking through the actual site produces a real, downloadable
 * file. A Playwright download event plus a magic-byte check on the downloaded
 * bytes is the strongest available proof of that.
 *
 * HEIC is the one input this cannot synthesise in a browser. Its case uses the
 * real local fixture via Playwright's own file-path upload (reads straight off
 * the test runner's disk, never touches the network or the built site) and
 * skips cleanly when the fixture is absent — see docs/12 D-36.
 */
import { test, expect, type Page, type Download } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prefer the committed, scrubbed HEIC so this runs on a fresh clone and in CI
 * (docs/12 D-62); fall back to the local original if someone still has it.
 */
const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/images');
const FIXTURE_HEIC = existsSync(join(FIXTURE_DIR, 'portrait-scrubbed.HEIC'))
  ? join(FIXTURE_DIR, 'portrait-scrubbed.HEIC')
  : join(FIXTURE_DIR, 'IMG_4650.HEIC');

interface StarRoute {
  slug: string;
  /** Format to generate client-side, or 'heic-fixture' for the real file. */
  sourceFormat: 'jpeg' | 'png' | 'webp' | 'svg' | 'heic-fixture';
  /** Magic bytes the downloaded OUTPUT must start with. */
  outputMagic: number[];
  outputExtension: string;
}

const STAR_ROUTES: StarRoute[] = [
  { slug: 'heic-to-jpg', sourceFormat: 'heic-fixture', outputMagic: [0xff, 0xd8, 0xff], outputExtension: '.jpg' },
  { slug: 'webp-to-jpg', sourceFormat: 'webp', outputMagic: [0xff, 0xd8, 0xff], outputExtension: '.jpg' },
  { slug: 'webp-to-png', sourceFormat: 'webp', outputMagic: [0x89, 0x50, 0x4e, 0x47], outputExtension: '.png' },
  { slug: 'png-to-jpg', sourceFormat: 'png', outputMagic: [0xff, 0xd8, 0xff], outputExtension: '.jpg' },
  { slug: 'png-to-webp', sourceFormat: 'png', outputMagic: [0x52, 0x49, 0x46, 0x46], outputExtension: '.webp' },
  { slug: 'jpg-to-webp', sourceFormat: 'jpeg', outputMagic: [0x52, 0x49, 0x46, 0x46], outputExtension: '.webp' },
  { slug: 'svg-to-png', sourceFormat: 'svg', outputMagic: [0x89, 0x50, 0x4e, 0x47], outputExtension: '.png' },
];

/** Generate a small image of the given format directly in the page. */
async function generateAndUpload(
  page: Page,
  format: 'jpeg' | 'png' | 'webp' | 'svg',
): Promise<void> {
  await page.evaluate(async (fmt: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');

    let file: File;
    if (fmt === 'svg') {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
        '<rect width="100" height="100" fill="#4f46e5"/></svg>';
      file = new File([svg], 'source.svg', { type: 'image/svg+xml' });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(0, 0, 300, 200);
      ctx.fillStyle = '#0f8a5f';
      ctx.fillRect(20, 20, 100, 80);
      const mime = 'image/' + fmt;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.9));
      if (blob === null) throw new Error('toBlob produced nothing for ' + fmt);
      file = new File([blob], 'source.' + fmt, { type: mime });
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, format);
}

async function waitForHydration(page: Page, route: string): Promise<void> {
  await page.goto(route);
  // Before waiting on any converter UI: an engine with no OffscreenCanvas
  // renders the unsupported notice instead, so the file input never appears
  // and every wait below would time out (docs/12 D-55).
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('input[type="file"][accept="image/*"]') !== null);
}

/** First few bytes of a Playwright Download, for a magic-byte check. */
async function magicBytes(download: Download, n: number): Promise<number[]> {
  const path = await download.path();
  if (path === null) throw new Error('download produced no local path');
  return [...readFileSync(path).subarray(0, n)];
}

for (const route of STAR_ROUTES) {
  test.describe(route.slug, () => {
    test.skip(
      route.sourceFormat === 'heic-fixture' && !existsSync(FIXTURE_HEIC),
      'real HEIC fixture not present locally — see tests/fixtures/images/README.md',
    );

    test(
      'drop a file, convert, and download a real ' + route.outputExtension + ' file',
      async ({ page }) => {
        await waitForHydration(page, '/convert/' + route.slug);

        if (route.sourceFormat === 'heic-fixture') {
          await page.locator('input[type="file"][accept="image/*"]').setInputFiles(FIXTURE_HEIC);
        } else {
          await generateAndUpload(page, route.sourceFormat);
        }

        const convertButton = page.getByRole('button', { name: /^Convert \d+ files?$/ });
        await expect(convertButton).toBeVisible({ timeout: 15_000 });
        await convertButton.click();

        await expect(page.getByRole('status').first()).toContainText(/1 done/, {
          timeout: 60_000,
        });

        // The real proof: click Save and capture an actual browser download.
        //
        // Matched on the RESULT button's full accessible name ("Save
        // photo.webp"), not a bare /^Save/: the preset UI added in docs/12
        // D-50 put a "Save current as…" button on the same screen, and the
        // looser pattern matches both — a strict-mode violation that reads as
        // a conversion failure when it is really an ambiguous selector.
        const saveResult = page.getByRole('button', {
          name: new RegExp('^Save .+\\' + route.outputExtension + '$', 'i'),
        });
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          saveResult.click(),
        ]);

        expect(download.suggestedFilename()).toMatch(
          new RegExp('\\' + route.outputExtension + '$', 'i'),
        );

        const bytes = await magicBytes(download, route.outputMagic.length);
        expect(bytes, 'downloaded file magic bytes').toEqual(route.outputMagic);
      },
    );
  });
}
