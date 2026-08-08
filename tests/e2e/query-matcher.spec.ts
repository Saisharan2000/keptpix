/**
 * tests/e2e/query-matcher.spec.ts
 *
 * The homepage search box (docs/kepttools/04 §1 layer 2).
 *
 * Two things are being proved, and the second is the one that would end the
 * product if it were false:
 *
 *   1. A sentence in someone's own words reaches the right tool, prefilled.
 *   2. Typing that sentence sends NOTHING anywhere.
 *
 * (2) is asserted by watching every request the page makes while a full query
 * is typed character by character. The unit tests cannot see this — a pure
 * function has no network — and it is exactly the guarantee an LLM-backed
 * version of this feature would have quietly broken.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#query-matcher', { timeout: 30_000 });
  // The island must be hydrated, or typing goes into a dead input.
  await page.waitForFunction(
    () => document.querySelectorAll('astro-island:not([ssr])').length > 0,
    null,
    { timeout: 30_000 },
  );
}

const box = (page: Page) => page.locator('#query-matcher');

test.describe('the query matcher', () => {
  test('a natural sentence reaches the right tool @smoke', async ({ page }) => {
    await ready(page);
    await box(page).fill('I want to convert my iphone photos to jpeg');

    const link = page.getByRole('link', { name: /HEIC to JPG/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveAttribute('href', '/convert/heic-to-jpg');
  });

  test('an arbitrary size prefills the compressor', async ({ page }) => {
    await ready(page);
    // No 137 KB route exists, and none should — this is the tail layer 2 covers.
    await box(page).fill('compress a photo under 137kb');

    const link = page.getByRole('link', { name: /Compress an image to 137 KB/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveAttribute('href', '/compress?target=140288');
  });

  test('typing sends nothing anywhere — the whole reason this is client-side', async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      // Everything the page legitimately loads is same-origin static assets;
      // record anything with a body or any foreign origin.
      const foreign = !url.startsWith(new URL(page.url() || 'http://localhost').origin);
      if (request.postData() !== null || foreign) sent.push(request.method() + ' ' + url);
    });

    await ready(page);
    sent.length = 0; // ignore the page load itself; we care about typing

    // Character by character, the way a person types — a per-keystroke request
    // is exactly what this must never make.
    await box(page).pressSequentially('convert my iphone photos to jpeg under 200kb', {
      delay: 15,
    });
    await expect(page.getByRole('link', { name: /HEIC to JPG/i }).first()).toBeVisible();

    // Give any debounced request a chance to fire before concluding.
    await page.waitForTimeout(2_000);
    expect(sent, 'requests made while typing').toEqual([]);
  });

  test('Enter does not submit the query anywhere', async ({ page }) => {
    await ready(page);
    const before = page.url();
    await box(page).fill('convert heic to jpg');
    await box(page).press('Enter');
    await page.waitForTimeout(500);
    // The query must not end up in the URL, and the page must not navigate.
    expect(page.url()).toBe(before);
  });

  test('results are reachable by keyboard from the field', async ({ page }) => {
    await ready(page);
    await box(page).fill('convert heic to jpg');
    await expect(page.getByRole('link', { name: /HEIC to JPG/i }).first()).toBeVisible();

    await box(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toHaveAttribute('href', /^\/convert\//);
  });

  test('says so honestly when nothing matches', async ({ page }) => {
    await ready(page);
    await box(page).fill('zzzzqqqq');
    await expect(page.getByText(/Nothing matches that yet/i)).toBeVisible();
  });

  test('shows nothing at all until the query is worth matching', async ({ page }) => {
    await ready(page);
    await box(page).fill('co');
    // Two characters match half the site; a list there is noise, not help.
    await expect(page.getByText(/Nothing matches that yet/i)).toHaveCount(0);
  });
});
