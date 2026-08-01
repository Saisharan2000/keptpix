/**
 * tests/e2e/_capability.ts
 *
 * Shared engine-capability gate for the e2e suites that actually CONVERT.
 *
 * Every codec path encodes through OffscreenCanvas inside a worker, so an
 * engine without it cannot convert at all — and the app now says so up front
 * instead of failing per file (docs/12 D-55). Playwright's bundled WebKit is
 * such an engine: measured here, it has `OffscreenCanvas === undefined` while
 * its MAIN-THREAD canvas encodes JPEG, PNG and WebP perfectly well.
 *
 * Gating on the real capability rather than on `browserName === 'webkit'` is
 * deliberate: real Safari has shipped OffscreenCanvas since 16.4, so a
 * name-based skip would keep skipping forever and hide a genuine Safari
 * regression the day this suite runs against a browser that supports it.
 */
import { test, type Page } from '@playwright/test';

export async function hasOffscreenCanvas(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof OffscreenCanvas !== 'undefined');
}

/**
 * Skip the current test when the engine cannot convert. Call inside a
 * `beforeEach` (or at the top of a test) AFTER a navigation — it needs a
 * document to evaluate against.
 */
export async function skipWithoutOffscreenCanvas(page: Page): Promise<void> {
  const supported = await hasOffscreenCanvas(page);
  test.skip(
    !supported,
    'engine has no OffscreenCanvas, so conversion is unsupported by design — docs/12 D-55',
  );
}
