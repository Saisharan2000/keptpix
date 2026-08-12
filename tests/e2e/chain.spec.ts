/**
 * tests/e2e/chain.spec.ts
 *
 * Task chaining (docs/12 D-113): an exam or PAN form requires a photo AND a
 * signature, so a user who finished one still has the other to do. Once a batch
 * completes on a chained route, the success bar offers the next task as a plain
 * prerendered link.
 *
 * Three claims, and the timing one is the load-bearing one:
 *
 *   1. The link appears after completion, pointing at the sibling route.
 *   2. It does NOT exist before the batch completes — offering "do the next
 *      task" while this one is still running is the distraction the feature
 *      was specified not to be.
 *   3. Unchained routes never grow one.
 *
 * Real page, real conversion, real worker — same discipline as convert.spec.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

async function waitForHydration(page: Page, route: string): Promise<void> {
  await page.goto(route);
  // docs/12 D-55: no OffscreenCanvas means the converter UI never renders.
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector('input[type="file"][accept="image/*"]') !== null,
  );
}

/** A small in-page JPEG, the same shape convert.spec generates. */
async function addOneJpeg(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = '#f9fafb';
    ctx.font = '48px serif';
    ctx.fillText('sig', 90, 120);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (blob === null) throw new Error('toBlob produced nothing');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'signature.jpg', { type: 'image/jpeg' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function convertAndWait(page: Page): Promise<void> {
  const convert = page.getByRole('button', { name: /^Convert \d+ files?$/ });
  await expect(convert).toBeVisible({ timeout: 15_000 });
  await convert.click();
  await expect(page.getByRole('status').first()).toContainText(/1 done/, { timeout: 60_000 });
}

test.describe('task chaining on the success screen', () => {
  test.setTimeout(120_000);

  test('signature route offers the photo next, only after completion', async ({ page }) => {
    await waitForHydration(page, '/compress/signature-to-20kb');

    /*
     * Scoped to the success bar, not the page: D-113's other half put the SAME
     * destination in the static Related-tools section, so a page-wide locator
     * matches that link before the batch has even started and the
     * "not before completion" assertion fails against the wrong element.
     * The claim under test is about the success bar specifically.
     */
    const summary = page.getByRole('status').first();
    const chainLink = summary.getByRole('link', { name: /Compress a passport photo to 50 KB/ });

    await addOneJpeg(page);
    /*
     * Claim 2, asserted at the strongest point available: the file is added,
     * the batch has NOT run, and the link must not be in the DOM. (Asserting
     * mid-run instead would race a fast conversion; pre-run is the state the
     * spec actually forbids the link in, and it is stable.)
     */
    await expect(chainLink).toHaveCount(0);

    await convertAndWait(page);

    // Claim 1: appears on completion, navigating to the sibling route.
    await expect(chainLink).toBeVisible({ timeout: 10_000 });
    await expect(chainLink).toHaveAttribute('href', '/compress/passport-photo-to-50kb');

    // And it is a real navigation to a real prerendered page.
    await chainLink.click();
    await page.waitForURL('**/compress/passport-photo-to-50kb');
    await expect(page.locator('h1')).toContainText(/passport photo/i);
  });

  test('a generic byte-target route never grows a chain link', async ({ page }) => {
    await waitForHydration(page, '/compress/jpg-to-100kb');
    await addOneJpeg(page);
    await convertAndWait(page);

    /*
     * The batch is complete — the exact moment a chain WOULD render. Assert on
     * the success bar's own text, not a broad selector, so this cannot pass
     * vacuously against some other part of the page.
     */
    const summary = page.getByRole('status').first();
    await expect(summary).toContainText(/1 done/);
    await expect(summary.getByRole('link')).toHaveCount(0);
  });
});
