/**
 * tests/e2e/images-to-pdf.spec.ts
 *
 * The user's path, end to end: land on /pdf/from-images, add images, click the
 * button, and get a real PDF out of a real browser download.
 *
 * The unit tests prove the bytes are well formed and the integration tests
 * prove the streams decode. Neither proves a person can actually get a file,
 * which is the only claim the route makes. This one does — by reading the
 * downloaded file off disk and checking its structure.
 */
import { test, expect, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ROUTE = '/pdf/from-images';

async function ready(page: Page): Promise<void> {
  await page.goto(ROUTE);
  // DELIBERATELY NOT skipped without OffscreenCanvas.
  //
  // Every other tool route needs it to encode, so its suite skips on WebKit
  // (docs/12 D-55). This one does not: a baseline JPEG is embedded verbatim,
  // which is a header parse and a byte copy — no canvas, no codec, nothing that
  // Safari lacks. So images-to-pdf works on engines where the image converter
  // cannot, and skipping here would hide that rather than prove it. D-74 is
  // what a reflexive WebKit skip costs.
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector('input[type="file"]') !== null,
    null,
    { timeout: 30_000 },
  );
}

/**
 * Adds n synthetic JPEGs through the real file input.
 *
 * JPEG on purpose: it exercises the passthrough path, which is the one that
 * matters and the one a canvas can produce without any codec download.
 */
async function addJpegs(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('file input not found');

    const transfer = new DataTransfer();
    for (let i = 0; i < n; i += 1) {
      const canvas = document.createElement('canvas');
      // Different sizes per page, so a layout that ignored dimensions would
      // produce identical page boxes and be caught below.
      canvas.width = 160 + i * 40;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.fillStyle = i % 2 === 0 ? '#4f46e5' : '#059669';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, 'image/jpeg', 0.9),
      );
      if (blob === null) throw new Error('toBlob failed');
      transfer.items.add(new File([blob], 'page-' + (i + 1) + '.jpg', { type: 'image/jpeg' }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, count);
}

/** latin1 so the binary streams survive being read as text. */
function pdfText(path: string): string {
  return readFileSync(path).toString('latin1');
}

async function runAndDownload(page: Page): Promise<{ download: Download; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    page.getByRole('button', { name: 'Images to PDF', exact: true }).click(),
  ]);
  const path = await download.path();
  if (path === null) throw new Error('download produced no local path');
  return { download, text: pdfText(path) };
}

test.describe('images to PDF, as a user does it', () => {
  test('one image in, one real PDF out @smoke', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 1);

    const { download, text } = await runAndDownload(page);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    // A PDF a reader will open: correct header, one page, and an EOF marker.
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Pages /Count 1');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    // startxref must point at the xref table, or the document is unopenable
    // however plausible the rest of it looks.
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(Number.isFinite(startxref)).toBe(true);
    expect(text.startsWith('xref\n', startxref)).toBe(true);
  });

  test('several images become several pages, in the order shown', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 3);

    // The list is the page order, so it has to be visible as such.
    await expect(page.getByText('page-1.jpg')).toBeVisible();
    await expect(page.getByText('page-3.jpg')).toBeVisible();

    const { text } = await runAndDownload(page);
    expect(text).toContain('/Type /Pages /Count 3');

    // Three distinct media boxes, because the three inputs had different widths.
    const boxes = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => m[0]);
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes).size).toBe(3);
  });

  test('the page order can be changed by keyboard alone', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 2);

    const rows = () => page.locator('ol li');
    await expect(rows()).toHaveCount(2);
    await expect(rows().first()).toContainText('page-1.jpg');

    // Move the second page earlier using its own labelled control.
    const moveUp = page.getByRole('button', { name: 'Move page-2.jpg earlier' });
    await moveUp.focus();
    await expect(moveUp).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(rows().first()).toContainText('page-2.jpg');
    await expect(rows().nth(1)).toContainText('page-1.jpg');
  });

  test('a file can be removed before converting', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 2);

    await page.getByRole('button', { name: 'Remove page-1.jpg' }).click();
    await expect(page.locator('ol li')).toHaveCount(1);

    const { text } = await runAndDownload(page);
    expect(text).toContain('/Type /Pages /Count 1');
  });

  test('changing a setting after adding files is not discarded (D-71)', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 1);

    // Settings live behind a collapsed disclosure now (D-86), because the
    // defaults are good and the dropzone should be the only first move. Opening
    // it is part of the real interaction, so the test performs it rather than
    // reaching into hidden markup.
    await page.getByText('the defaults are fine').click();

    // Fit-to-image would give a 160x120 page; A4 portrait must not.
    await page.locator('#tool-field-pageSize').selectOption('a4');
    await page.locator('#tool-field-orientation').selectOption('portrait');

    const { text } = await runAndDownload(page);
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
    const width = Number(box?.[1]);
    const height = Number(box?.[2]);

    // A4 portrait in points, to the nearest whole number.
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(height).toBeGreaterThan(width);
  });

  test('shows a thumbnail per page, so the order is visible', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 3);

    // Reordering pages named IMG_4650.jpg by their four-digit suffix is
    // guesswork; this is the interaction the tool exists for.
    const thumbs = page.locator('ol li img');
    await expect(thumbs).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(thumbs.nth(i)).toHaveAttribute('src', /^blob:/);
    }
  });

  test('revokes a thumbnail URL when its file is removed', async ({ page }) => {
    await ready(page);
    await addJpegs(page, 2);

    const first = page.locator('ol li img').first();
    await expect(first).toHaveAttribute('src', /^blob:/);
    const url = (await first.getAttribute('src')) ?? '';
    expect(url.startsWith('blob:')).toBe(true);

    // A live blob URL fetches; a revoked one cannot. This is the only way to
    // assert the revoke actually happened rather than trusting the cleanup
    // function exists (docs/05 §4 invariant 1 — leaked object URLs are the top
    // memory-leak source in this class of app).
    expect(await page.evaluate(async (u) => {
      const r = await fetch(u).then(() => true).catch(() => false);
      return r;
    }, url)).toBe(true);

    await page.getByRole('button', { name: 'Remove page-1.jpg' }).click();
    await expect(page.locator('ol li')).toHaveCount(1);

    expect(
      await page.evaluate(async (u) => fetch(u).then(() => true).catch(() => false), url),
      'the object URL for the removed file should have been revoked',
    ).toBe(false);
  });

  test('the action is absent until there is something to act on', async ({ page }) => {
    await ready(page);
    await expect(page.getByRole('button', { name: 'Images to PDF', exact: true })).toHaveCount(0);
  });
});
