/**
 * tests/e2e/batch.spec.ts
 *
 * Spec: docs/10-build-plan.md Milestone 7.
 * "50 files, one corrupt, one oversized — batch completes, 48 succeed, 2
 * flagged with specific errors and retry available."
 *
 * This is the load-bearing rule in docs/07 §4: "Never let a batch abort on one
 * file's failure." A batch tool that dies on the first bad file in a folder of
 * fifty is worse than useless. Drives the real page through the real UI.
 *
 * The "oversized" case exercises docs/12 D-43 — assessMemoryRisk/E_TOO_LARGE
 * were fully built and unit-tested at Milestone 2 but never once wired into the
 * running pipeline until this suite's requirements surfaced the gap.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

const GOOD_COUNT = 48;
const TOTAL_COUNT = GOOD_COUNT + 2; // + 1 corrupt + 1 oversized

async function waitForHydration(page: Page, route: string): Promise<void> {
  await page.goto(route);
  // docs/12 D-55: no OffscreenCanvas means the converter UI never renders.
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('input[type="file"][accept="image/*"]') !== null);
}

/**
 * Build the 50-file batch directly in the page: 48 small real JPEGs, one file
 * with valid JPEG magic bytes but garbage payload (decoder throws ->
 * E_CORRUPT_FILE), and one image large enough to cross the 80 MP hard ceiling
 * in core/guards.ts (-> E_TOO_LARGE, docs/12 D-43).
 */
async function addBatch(page: Page, goodCount: number): Promise<void> {
  await page.evaluate(async (n: number) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');

    const transfer = new DataTransfer();

    for (let i = 0; i < n; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.fillStyle = 'hsl(' + ((i * 47) % 360) + ' 70% 50%)';
      ctx.fillRect(0, 0, 80, 60);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85),
      );
      if (blob === null) throw new Error('toBlob failed for good-' + i);
      transfer.items.add(new File([blob], 'good-' + i + '.jpg', { type: 'image/jpeg' }));
    }

    // Valid JPEG signature, garbage payload — the decoder rejects it.
    const corrupt = new Uint8Array(2048);
    corrupt.set([0xff, 0xd8, 0xff, 0xe0], 0);
    for (let i = 4; i < corrupt.length; i += 1) corrupt[i] = (i * 7) % 251;
    transfer.items.add(new File([corrupt], 'broken.jpg', { type: 'image/jpeg' }));

    // 10000x9000 = 90 MP, over the 80 MP ceiling in core/guards.ts.
    const big = document.createElement('canvas');
    big.width = 10_000;
    big.height = 9_000;
    const bigCtx = big.getContext('2d');
    if (bigCtx === null) throw new Error('no 2d context for the oversized canvas');
    bigCtx.fillStyle = '#4f46e5';
    bigCtx.fillRect(0, 0, big.width, big.height);
    const bigBlob = await new Promise<Blob | null>((resolve) =>
      big.toBlob(resolve, 'image/png'),
    );
    if (bigBlob === null) throw new Error('toBlob failed for the oversized canvas');
    transfer.items.add(new File([bigBlob], 'panorama-huge.png', { type: 'image/png' }));

    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, goodCount);
}

test.describe('batch of 50: one corrupt, one oversized', () => {
  test('completes with 48 done, 2 flagged, and never aborts', async ({ page }) => {
    await waitForHydration(page, '/convert/png-to-jpg');
    await addBatch(page, GOOD_COUNT);

    await expect(page.getByRole('heading', { name: 'Files (' + TOTAL_COUNT + ')' })).toBeVisible({
      timeout: 20_000,
    });

    const convertButton = page.getByRole('button', { name: /^Convert \d+ files?$/ });
    await expect(convertButton).toBeVisible();

    /**
     * Pin a 4 GB device profile before converting (WO-1, docs/12 D-57).
     *
     * The hard rejection ceiling is device-scaled now: 80 MP on mobile and
     * under 8 GB, scaling with real memory above that. So "oversized" is no
     * longer an absolute — this 90 MP panorama is genuinely over the limit on a
     * 4 GB machine and genuinely FINE on a 16 GB one, which is the entire point
     * of the change.
     *
     * Making the fixture big enough to fail on any machine would need ~170 MP,
     * about 700 MB of canvas backing store, on every run of this suite. Pinning
     * the profile instead keeps the acceptance intact ("2 flagged with specific
     * errors") and deterministic on any hardware, for free. It goes through
     * setEnvironment — the store's own public action — and must happen BEFORE
     * the first convert, because the WorkerPool is created lazily on start()
     * and configures its workers from this profile.
     *
     * Both tiers are proven for real in tests/integration/pipeline.test.ts,
     * where the same 90 MP image is refused at 4 GB and converts at 16 GB.
     */
    await page.evaluate(() => {
      const w = window as unknown as {
        __keptpix_store?: { getState(): Record<string, unknown> };
      };
      const state = w.__keptpix_store?.getState();
      if (state === undefined) throw new Error('store handle missing');
      const device = state['device'] as Record<string, unknown>;
      const setEnvironment = state['setEnvironment'] as (d: unknown, c: unknown) => void;
      setEnvironment({ ...device, deviceMemoryGb: 4, isMobile: false }, state['codecs']);
    });

    await convertButton.click();

    // The whole point of this suite: the batch reaches a terminal state for
    // EVERY file, including the two bad ones, without dying partway through.
    await expect(page.getByRole('status').first()).toContainText(
      new RegExp(GOOD_COUNT + ' done'),
      { timeout: 120_000 },
    );

    /**
     * Wait for NOTHING to be running before counting failures.
     *
     * "48 done" does not mean the batch is finished — it means the 48 good
     * files are. The two bad ones can still be in flight, and the oversized
     * 90 MP decode is by far the slowest item here. Asserting failures
     * immediately after the successes passed locally and failed on CI's
     * single-worker runner with "48 done · 1 running · 1 failed": a real race
     * in the test, surfaced only by slower hardware.
     */
    await expect(page.getByRole('status').first()).toContainText('0 running', {
      timeout: 120_000,
    });
    await expect(page.getByRole('status').first()).toContainText('2 failed');

    // Both failures are named, specific, and offer a next action — never a
    // generic "something went wrong" (docs/07 §4).
    const corruptCard = page.locator('article', { hasText: 'broken.jpg' });
    await expect(corruptCard).toContainText('E_CORRUPT_FILE');
    await expect(corruptCard).toContainText(/damaged/i);
    // No Retry here, deliberately: docs/04 §6 marks E_CORRUPT_FILE
    // unrecoverable — the bytes are simply broken, and retrying identical
    // bytes fails identically. Offering Retry would be a false affordance.
    await expect(corruptCard.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect(corruptCard.getByRole('button', { name: 'Remove' })).toBeVisible();

    const oversizedCard = page.locator('article', { hasText: 'panorama-huge.png' });
    await expect(oversizedCard).toContainText('E_TOO_LARGE');
    await expect(oversizedCard).toContainText('10000');
    await expect(oversizedCard).toContainText('9000');
    await expect(oversizedCard.getByRole('button', { name: 'Retry' })).toBeVisible();

    // Every one of the 48 successful results is still present and downloadable
    // — a batch failure must never take working results down with it.
    const doneCards = page.locator('article[aria-label*="— Done"]');
    await expect(doneCards).toHaveCount(GOOD_COUNT);

    const downloadAll = page.getByRole('button', { name: /^Download all/ });
    await expect(downloadAll).toBeEnabled();
  });

  test('downloading the batch produces a real multi-file ZIP', async ({ page }) => {
    await waitForHydration(page, '/convert/png-to-jpg');
    // A smaller, all-good batch: this test is about the ZIP mechanism, not
    // partial failure, which the previous test already covers thoroughly.
    await addBatch(page, 5);

    const convertButton = page.getByRole('button', { name: /^Convert \d+ files?$/ });
    await convertButton.click();
    await expect(page.getByRole('status').first()).toContainText('5 done', { timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Download all/ }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.zip$/i);

    const path = await download.path();
    expect(path).not.toBeNull();
    if (path === null) return;

    // A real ZIP: local file header signature "PK\x03\x04", and the archive
    // must be non-trivial in size — five real JPEGs cannot compress to nothing.
    const { readFileSync, statSync } = await import('node:fs');
    const bytes = readFileSync(path);
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(statSync(path).size).toBeGreaterThan(500);
  });
});
