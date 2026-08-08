/**
 * tests/e2e/smoke.spec.ts — WO-3. Tagged @smoke.
 *
 * ONE path, every engine, every run: land on a tool route, add a file,
 * convert it, download it, and check the bytes are really that format.
 *
 * This exists because of a CLASS of defect, not a specific one. The two worst
 * bugs in docs/12 both survived multiple milestones with every test green:
 *
 *   D-26 — files could be added but never converted. The Convert button never
 *          rendered at all. Every unit and integration test passed, because
 *          they drove QueueController directly and never touched the button.
 *   D-49 — the store's device/codecs never left their construction-time
 *          defaults, so every session used a generic 4 GB profile. Nothing
 *          asserted the wiring, so nothing noticed.
 *
 * Both were end-to-end wiring failures invisible to any test that starts below
 * the UI. Keeping one fast, unconditional, all-engines path through the real
 * product is the cheapest guard against the next one.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

const ROUTE = '/convert/png-to-jpg';

async function addOnePng(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, 240, 180);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 120, 90);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob === null) throw new Error('toBlob failed');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'smoke.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test.describe('@smoke', () => {
  test('convert and download one file, end to end, in this engine', async ({ page }) => {
    await page.goto(ROUTE);
    await skipWithoutOffscreenCanvas(page);
    await page.locator('#tool').scrollIntoViewIfNeeded();
    await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
    await page.waitForFunction(
      () => document.querySelector('input[type="file"][accept="image/*"]') !== null,
      null,
      { timeout: 30_000 },
    );

    await addOnePng(page);

    // D-26: the button must actually RENDER once a file is added. That is the
    // whole bug — not that conversion was broken, but that it was unreachable.
    const convert = page.getByRole('button', { name: /^Convert \d+ files?$/ });
    await expect(convert).toBeVisible({ timeout: 15_000 });
    await convert.click();

    await expect(page.getByRole('status').first()).toContainText(/1 done/, { timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Save .+\.jpg$/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.jpg$/i);

    // Real bytes, not just a filename: JPEG's SOI marker.
    const path = await download.path();
    expect(path).not.toBeNull();
    const { readFileSync } = await import('node:fs');
    expect([...readFileSync(path!).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  test('WO-4: the settings surface exposes no control that does nothing', async ({ page }) => {
    await page.goto(ROUTE);
    await skipWithoutOffscreenCanvas(page);
    await page.locator('#tool').scrollIntoViewIfNeeded();
    await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
    await page.waitForFunction(
      () => document.querySelector('input[type="file"][accept="image/*"]') !== null,
      null,
      { timeout: 30_000 },
    );
    // ConfigPanel only renders once there are files.
    await addOnePng(page);
    await expect(page.getByRole('button', { name: /^Convert \d+ files?$/ })).toBeVisible({
      timeout: 15_000,
    });

    /**
     * `keepFilesForSession` is a real settings field (docs/05 §2) whose OPFS
     * write-through is deliberately not built yet (docs/12 D-51). Nothing
     * writes to OPFS today, so a toggle for it would be a control that silently
     * does nothing — worse than an absent feature, because it makes a promise
     * about the user's files that the code does not keep.
     *
     * This asserts it stays absent until the write-through lands, rather than
     * relying on nobody adding it by reflex when wiring the settings panel.
     */
    /**
     * Below `lg` the tool is a two-step flow and the settings rail starts
     * collapsed, so it has to be opened before anything in it can be asserted.
     * Asserting visibility directly passed on desktop and failed the moment a
     * `mobile-chromium` project existed (docs/12 D-74 added it, D-78 fixed
     * this) — the check was only ever running at one viewport.
     *
     * Opening it is also the honest test: a control that does nothing is just
     * as wrong on a phone, and this is how a phone user gets there.
     */
    const settingsTab = page.getByRole('button', { name: 'Settings', exact: true });
    if (await settingsTab.isVisible()) await settingsTab.click();

    const settings = page.getByRole('complementary', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await expect(settings.getByText(/keep files|keep.*session|retain/i)).toHaveCount(0);
    await expect(settings.locator('input[name*="keep" i]')).toHaveCount(0);
  });

  test(
    'D-49 regression: the store holds this device’s REAL profile, not the ' +
      'construction-time default',
    async ({ page }) => {
      await page.goto(ROUTE);
      await page.locator('#tool').scrollIntoViewIfNeeded();
      await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });

      // hydrateEnvironment() resolves asynchronously after mount.
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const w = window as unknown as { __keptpix_store?: { getState(): unknown } };
              const state = w.__keptpix_store?.getState() as
                | { device?: { hardwareConcurrency?: number } }
                | undefined;
              return state?.device?.hardwareConcurrency ?? null;
            }),
          { timeout: 20_000, message: 'waiting for hydrateEnvironment() to land' },
        )
        .toBe(await page.evaluate(() => navigator.hardwareConcurrency));

      // And the codec matrix is this browser's real answer, not the generic
      // construction-time baseline. `nativeDecode` is populated by a genuine
      // feature probe, so it must at minimum cover the universal five.
      const probed = await page.evaluate(() => {
        const w = window as unknown as { __keptpix_store?: { getState(): unknown } };
        const state = w.__keptpix_store?.getState() as
          | { codecs?: { nativeDecode?: Record<string, boolean> } }
          | undefined;
        return state?.codecs?.nativeDecode ?? null;
      });
      expect(probed).not.toBeNull();
      expect(probed?.['jpeg']).toBe(true);
      expect(probed?.['png']).toBe(true);
    },
  );
});
