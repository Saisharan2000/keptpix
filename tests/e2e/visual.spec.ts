/**
 * tests/e2e/visual.spec.ts — WO-12.
 *
 * A deliberately COARSE visual guard. Chromium only, loose threshold.
 *
 * The bug this exists for is docs/12 D-27: unicode escapes survived code
 * generation as literal text, so the UI rendered `0 done · 0 running`
 * instead of `0 done · 0 running`, across 26 occurrences in 8 components.
 * Every test passed. It was caught by a human happening to read a Playwright
 * page snapshot — which is not a process.
 *
 * The goal is catching encoding garbage and layout collapse, NOT pixel
 * perfection. A strict threshold on a rendering-heavy page produces failures
 * on font hinting and antialiasing, which trains people to update snapshots
 * without reading them — worse than having no check, because it launders real
 * regressions through a habit.
 *
 * Two states only: idle (the dropzone, the largest element on the page) and
 * results (cards, summary, actions). Those cover the surfaces where text is
 * composed at runtime.
 *
 * On first run Playwright writes the baselines and reports the tests as
 * failed; commit the generated `*-snapshots/` files and it goes green. Update
 * intentionally with `npx playwright test visual.spec.ts --update-snapshots`,
 * and READ the diff before you do.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

const ROUTE = '/convert/png-to-jpg';

// Generous: anti-aliasing and font rasterisation differ between machines and
// between headless/headed runs, and none of that is what this is looking for.
const SNAPSHOT = {
  maxDiffPixelRatio: 0.02,
  threshold: 0.3,
  animations: 'disabled',
} as const;

async function ready(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector('input[type="file"][accept="image/*"]') !== null,
    null,
    { timeout: 30_000 },
  );
}

async function addOnePng(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    // Flat, deterministic colours — a gradient or noise would make the
    // thumbnail itself a source of diff noise.
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, 200, 150);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob === null) throw new Error('toBlob failed');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'visual.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * TEXT INTEGRITY — the part that actually catches D-27 (WO-12, Rule 0).
 *
 * The screenshot check below was specified as the guard for the literal-escape
 * bug. Measured, it is not: re-injecting the exact D-27 defect (rendering
 * `No upload caps 00b7 No sign-up` instead of `·`) and re-running the
 * screenshots produced **2 passed**. The corrupted string occupies far less
 * than the 2% `maxDiffPixelRatio` of the element being compared, and tightening
 * the ratio far enough to catch a few characters of text would make every run
 * flaky on font antialiasing — trading a miss for noise, which trains people to
 * re-baseline without reading the diff.
 *
 * A screenshot diff is simply the wrong instrument for "did an escape sequence
 * survive into the rendered text". Scanning the rendered text for the escape
 * patterns themselves is exact, deterministic, needs no baseline, and fails
 * loudly with the offending string quoted. Verified to catch the injected bug
 * that the screenshots missed.
 *
 * The screenshots stay for what they ARE good at: layout collapse.
 */
const ESCAPE_ARTEFACTS: Array<[RegExp, string]> = [
  [/\\u[0-9a-fA-F]{4}/, 'literal \\uXXXX escape'],
  [/(?<![0-9a-fA-F])00[a-fA-F][0-9a-fA-F](?![0-9a-fA-F])/, 'orphaned hex codepoint (e.g. 00b7)'],
  [/\\n|\\t/, 'literal \\n or \\t'],
  [/&[a-z]+;|&#\d+;/, 'unrendered HTML entity'],
  [/�/, 'replacement character (mojibake)'],
  [/undefined|\[object Object\]|NaN/, 'a value that leaked into the UI as text'],
];

test.describe('text integrity — no escape artefacts in rendered copy (D-27)', () => {
  for (const route of ['/', ROUTE, '/compress/jpg-to-100kb', '/privacy']) {
    test('rendered text is clean on ' + route, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      const text = await page.evaluate(() => document.body.innerText);

      for (const [pattern, label] of ESCAPE_ARTEFACTS) {
        const match = pattern.exec(text);
        expect(
          match,
          label + ' found in rendered text on ' + route + ': ' + JSON.stringify(match?.[0]),
        ).toBeNull();
      }
    });
  }
});

test.describe('visual regression (chromium only, coarse)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'baseline is chromium-only by design');

  test('idle tool route', async ({ page }) => {
    await ready(page);
    await expect(page.locator('#tool')).toHaveScreenshot('tool-idle.png', SNAPSHOT);
  });

  test('results state after one conversion', async ({ page }) => {
    await ready(page);
    await addOnePng(page);

    const convert = page.getByRole('button', { name: /^Convert \d+ files?$/ });
    await expect(convert).toBeVisible({ timeout: 15_000 });
    await convert.click();
    await expect(page.getByRole('status').first()).toContainText(/1 done/, { timeout: 60_000 });

    await expect(page.locator('#tool')).toHaveScreenshot('tool-results.png', SNAPSHOT);
  });
});
