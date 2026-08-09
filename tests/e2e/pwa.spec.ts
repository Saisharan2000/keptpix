/**
 * tests/e2e/pwa.spec.ts — docs/10 M8 acceptance: offline capability, install
 * prompt timing.
 *
 * Runs against the real static build (playwright.config.ts's webServer), not
 * the dev server — a service worker registering `/sw.js` and reading real
 * Cache Storage only means anything against what actually ships.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

const ROUTE = '/convert/heic-to-jpg';

async function ready(page: Page): Promise<void> {
  await page.goto(ROUTE);
  // docs/12 D-55: no OffscreenCanvas means the converter UI never renders.
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded();
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('input[type="file"][accept="image/*"]') !== null, null, {
    timeout: 30_000,
  });
}

async function addImages(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n: number) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');
    const transfer = new DataTransfer();
    for (let i = 0; i < n; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(0, 0, 320, 240);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (blob === null) throw new Error('toBlob failed');
      transfer.items.add(new File([blob], 'p-' + i + '.jpg', { type: 'image/jpeg' }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, count);
}

/** Every pathname currently in the precache (shell) cache, or null if it does
 *  not exist yet. */
async function shellCacheEntries(page: Page): Promise<string[] | null> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const shellName = names.find((n) => n.startsWith('keptpix-shell-'));
    if (shellName === undefined) return null;
    const cache = await caches.open(shellName);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
}

/**
 * Wait until the precache actually CONTAINS `pathname`.
 *
 * Neither `state === 'activated'` nor the existence of the cache is a valid
 * signal that precaching finished, and both were used here before: the cache
 * is created by `caches.open` before a single entry is added, and activation
 * is observably reachable while the install loop is still running — measured
 * at 8 of 27 entries present the moment the worker reported 'activated', with
 * all 27 landing ~500 ms later. Asserting on either produced a failure that
 * looked exactly like the truncation bug in docs/12 D-52 but was not one.
 */
async function waitForPrecached(page: Page, pathname: string): Promise<void> {
  await expect
    .poll(async () => (await shellCacheEntries(page))?.includes(pathname) ?? false, {
      timeout: 20_000,
      message: 'waiting for ' + pathname + ' to be precached',
    })
    .toBe(true);
}

const convertButton = (page: Page) => page.getByRole('button', { name: /^Convert \d+ files?$/ });

async function runConversion(page: Page): Promise<void> {
  await convertButton(page).click();
  await expect(page.getByRole('status').first()).toContainText(/[1-9]\d* done/, { timeout: 60_000 });
}

test.describe('service worker (docs/10 M8, docs/12 D-52)', () => {
  test('registers, activates, and precaches the real app shell', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));

    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        return reg?.active?.state === 'activated';
      },
      null,
      { timeout: 20_000 },
    );

    // The manifest's LAST entry — so this returning means the whole sequential
    // install loop ran to completion, which is the property docs/12 D-52 is
    // actually about.
    await waitForPrecached(page, '/resize');

    const shellEntries = await shellCacheEntries(page);

    expect(shellEntries).not.toBeNull();
    // Spot-check rather than exact-match: the manifest's own content is
    // build-generated (docs/12 D-52) and does not need duplicating here.
    expect(shellEntries).toContain('/');
    expect(shellEntries).toContain('/convert/heic-to-jpg');
    expect(shellEntries).toContain('/manifest.webmanifest');
    expect(shellEntries?.some((p) => p.endsWith('.js'))).toBe(true);
    // The whole point of "cache on first use, not precache" for codecs
    // (docs/12 D-52) — nothing WASM-shaped should be in the EAGER shell cache.
    expect(shellEntries?.some((p) => p.includes('.wasm'))).toBe(false);
  });

  test('a precached route still loads with the network fully cut', async ({
    page,
    context,
    browserName,
  }) => {
    // Everything up to the reload works on WebKit — registration, activation
    // and the full 27-entry precache all verified. It is `page.reload()` under
    // `setOffline(true)` that dies with "WebKit encountered an internal
    // error", a harness-level failure in WebKit's offline emulation rather
    // than an assertion this app failed. Skipped rather than deleted so the
    // coverage stays real on Chromium and Firefox, where it passes (D-55).
    test.skip(
      browserName === 'webkit',
      'Playwright WebKit cannot reload under setOffline() — harness limitation, not app behaviour',
    );
    await page.goto('/about');
    await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.state === 'activated',
      null,
      { timeout: 20_000 },
    );
    // Wait for THIS route specifically, not merely for the cache to exist —
    // the cache is created empty before the first entry is added.
    await waitForPrecached(page, '/about');

    // And wait until the worker actually CONTROLS this page. A page loaded
    // before the worker activated stays uncontrolled until `clients.claim()`
    // takes effect, which is asynchronous — reloading before that happens
    // bypasses the fetch handler entirely and hits the dead network, which is
    // indistinguishable from the offline support being broken.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 20_000,
    });

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator('h1')).toBeVisible();
    } finally {
      // Tolerant on purpose: when the test above fails or times out, the
      // context may already be tearing down, and a throw here replaces the
      // real failure with a confusing "Target page, context or browser has
      // been closed" — which is what CI reported instead of the actual cause.
      await context.setOffline(false).catch(() => undefined);
    }
  });
});

test.describe('install prompt (docs/10 M8)', () => {
  test('never appears before a conversion, even if the browser signals installability', async ({
    page,
  }) => {
    await ready(page);
    // The real beforeinstallprompt is fired by the browser's own install
    // heuristics, which a fresh automated context does not satisfy — so this
    // simulates exactly what BaseLayout.astro's listener receives, to test
    // the GATING logic this app owns, not Chromium's install criteria.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as Event & { prompt?: () => Promise<void> };
      event.prompt = async () => undefined;
      window.dispatchEvent(event);
    });

    await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0);

    await addImages(page, 1);
    await runConversion(page);

    await expect(page.getByRole('button', { name: 'Install' })).toBeVisible();
  });

  test('clicking Install calls .prompt() on the captured event exactly once', async ({ page }) => {
    await ready(page);
    await addImages(page, 1);
    await runConversion(page);

    await page.evaluate(() => {
      (window as unknown as { __promptCalls: number }).__promptCalls = 0;
      const event = new Event('beforeinstallprompt') as Event & { prompt?: () => Promise<void> };
      event.prompt = async () => {
        (window as unknown as { __promptCalls: number }).__promptCalls += 1;
      };
      window.dispatchEvent(event);
    });

    await page.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0);

    const calls = await page.evaluate(() => (window as unknown as { __promptCalls: number }).__promptCalls);
    expect(calls).toBe(1);
  });
});

/**
 * docs/12 D-67 — iOS Safari never fires `beforeinstallprompt`, so the install
 * affordance has a second, manual path. Found on a real iPhone: the Install
 * button simply never appeared, on the platform most likely to be converting
 * HEIC in the first place.
 *
 * Driven with an iOS user agent in CHROMIUM rather than in the webkit project,
 * deliberately: Playwright's WebKit has no OffscreenCanvas (D-55), so no
 * conversion can complete there, so `eligible` is never true and this branch is
 * unreachable. A real iPhone on Safari 16.4+ has OffscreenCanvas AND no
 * beforeinstallprompt — a combination no bundled engine reproduces, so it is
 * synthesised here.
 */
test.describe('iOS install hint (docs/12 D-67)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'needs OffscreenCanvas + a forced iOS UA');

  test('offers Add to Home Screen instructions instead of a dead silence', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    try {
      await page.goto(ROUTE);
      await page.locator('#tool').scrollIntoViewIfNeeded();
      await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
      await page.waitForFunction(
        () => document.querySelector('input[type="file"][accept="image/*"]') !== null,
        null,
        { timeout: 30_000 },
      );

      // Nothing before a conversion — the docs/10 M8 rule applies to both paths.
      await expect(page.getByText(/Add to Home Screen/i)).toHaveCount(0);

      await addImages(page, 1);
      await runConversion(page);

      // And no Chromium-style button, since the event never fired.
      await expect(page.getByText(/Add to Home Screen/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
