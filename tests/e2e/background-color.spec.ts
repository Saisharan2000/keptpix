/**
 * tests/e2e/background-color.spec.ts
 *
 * The background-colour control (docs/12 D-122): JobConfig.backgroundColor
 * flowed store → worker → encoder from the start, and no UI exposed it —
 * which made "white unless you change it" an overclaim D-115 had to rewrite.
 * This spec pins the two claims the restored copy now makes:
 *
 *   1. On a route whose output flattens alpha (JPG), the control exists,
 *      keyboard-reachable under its accessible name, and changing it is
 *      reflected — the copy's "unless you pick another" is a real choice.
 *   2. On a route whose output keeps alpha (PNG), it does NOT render —
 *      a background picker that does nothing is a lie with a label.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

async function ready(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector('input[type="file"][accept="image/*"]') !== null,
  );

  // The whole settings area exists only once a file is queued — an empty page
  // is just the dropzone — and the config panel then lives inside a collapsed
  // native <details>. Add a file, open Settings: the path a real user takes.
  await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.fillStyle = '#0f8a5f';
    ctx.fillRect(0, 0, 120, 90);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob === null) throw new Error('toBlob produced nothing');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'source.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const settings = page.locator('#tool summary', { hasText: 'Settings' });
  await expect(settings).toBeVisible({ timeout: 15_000 });
  await settings.click();
}

test.describe('background colour control (D-122)', () => {
  test('exists on a JPG route and the change is reflected', async ({ page }) => {
    await ready(page, '/convert/png-to-jpg');

    const input = page.getByLabel(/background for transparency/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue('#ffffff');

    /*
     * fill() on a color input skips the OS picker dialog and drives the value
     * directly — the picker itself is the browser's, not ours to test. What IS
     * ours: the controlled round-trip through the store and the visible hex.
     */
    await input.fill('#e11d48');
    await expect(input).toHaveValue('#e11d48');
    await expect(page.locator('#tool')).toContainText('#e11d48');
  });

  test('does not render on a PNG route', async ({ page }) => {
    await ready(page, '/convert/webp-to-png');
    // The panel is hydrated (another control proves it), and the colour
    // control is absent — scoped inside #tool so nothing elsewhere can
    // satisfy this vacuously.
    await expect(page.locator('#tool').getByLabel(/metadata|strip/i).first()).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.locator('#tool').getByLabel(/background for transparency/i)).toHaveCount(0);
  });
});
