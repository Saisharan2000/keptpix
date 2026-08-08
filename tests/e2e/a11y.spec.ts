/**
 * tests/e2e/a11y.spec.ts
 *
 * Spec: docs/10-build-plan.md Milestone 7, docs/08-design-system.md §6
 *
 * "@axe-core/playwright on every route type, zero violations, plus a full
 * keyboard-only conversion flow."
 *
 * Runs over EVERY built route rather than a hand-picked sample, in both themes.
 * docs/08 §6 makes accessibility a release gate, and a gate that only covers the
 * routes someone remembered to list is not a gate — an a11y regression from
 * Milestone 4 (docs/12 D-39) survived several milestones for exactly that reason.
 */
import { test, expect, type Page } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = join(process.cwd(), 'dist');

/** Enumerate the built routes at collection time, so new pages are covered. */
function builtRoutes(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      // Every .html file is a route. The project builds with
      // `format: 'file'` (docs/12 D-65), so routes are `about.html` rather
      // than `about/index.html` — matching only index.html silently reduced
      // this sweep from 22 routes to 2, which the guard below caught.
      else if (entry.endsWith('.html')) files.push(full);
    }
  };
  try {
    walk(DIST);
  } catch {
    return ['/'];
  }
  return files
    .map((f) => '/' + relative(DIST, f).split(sep).join('/'))
    // 404.html is fetched by that exact name; every other page drops .html
    // (or /index.html) to become the URL it is actually served at.
    .map((r) => (r === '/404.html' ? r : r.replace(/index\.html$/, '').replace(/\.html$/, '')))
    .map((r) => r.replace(/\/$/, ''))
    .map((r) => (r === '' ? '/' : r))
    .sort();
}

const ROUTES = builtRoutes();
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * `color-contrast` cannot be measured under Playwright's WebKit `isMobile`
 * emulation, and this is the narrowest possible way to say so (docs/12 D-77).
 *
 * With `isMobile: true`, WebKit stops resolving author CSS for some elements on
 * a page entirely: `body`, `main` and `<select>` report no background, no
 * colour, and not even the inherited custom properties, while their own
 * children report correctly. axe then walks up looking for a background, finds
 * none, assumes white, and reports every text node on the page as a serious
 * contrast failure. It reported 31 on a page that is visually correct — checked
 * by screenshot, and by the same CSS passing on every other engine.
 *
 * Isolated to `isMobile` alone: the same page at the same 390px viewport in the
 * same WebKit build is fine without that one flag, as is Chromium's Pixel 7,
 * which also sets it. It is an emulation artifact, and no CSS change can fix it
 * because no author CSS applies at all.
 *
 * WHAT STILL COVERS CONTRAST, so this is a narrowing and not a hole:
 *   - every other project, including `mobile-chromium` — a mobile-emulated
 *     engine at a mobile width, which is the risk this was guarding
 *   - `webkit` desktop, which exercises the identical stylesheet
 *   - every OTHER axe rule still runs here; only this one is dropped
 *
 * Two real fixes came out of the investigation and are staying regardless: the
 * background is now declared on `html` as well as `body`, and `Select` owns its
 * colours via `appearance: none` instead of inheriting the native control's.
 */
const CONTRAST_UNMEASURABLE = 'mobile-safari';

async function scan(page: Page, route: string, project: string): Promise<void> {
  await page.goto(route);
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (project === CONTRAST_UNMEASURABLE) builder = builder.disableRules(['color-contrast']);

  const results = await builder.analyze();
  const summary = results.violations.map(
    (v) => v.id + ' (' + v.impact + ') x' + v.nodes.length + ' — ' + v.nodes[0]?.target.join(' '),
  );
  expect(summary, route).toEqual([]);
}

test.describe('accessibility — every route, both themes', () => {
  test('finds routes to scan', () => {
    // Guard against the walk silently returning nothing and the suite passing
    // by scanning one page.
    expect(ROUTES.length).toBeGreaterThan(15);
  });

  for (const route of ROUTES) {
    test('light: ' + route, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await scan(page, route, testInfo.project.name);
    });

    test('dark: ' + route, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await scan(page, route, testInfo.project.name);
    });
  }
});

test.describe('SEO structure — what Lighthouse would check', () => {
  for (const route of ROUTES) {
    test('structure: ' + route, async ({ page }) => {
      await page.goto(route);

      // Exactly one h1 (docs/09 §3), a canonical URL, and a real description.
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
      await expect(page.locator('meta[name=description]')).toHaveCount(1);
      expect((await page.title()).length).toBeGreaterThan(10);

      // lang on <html>, required by docs/08 §6 and by every screen reader.
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  }
});

test.describe('keyboard-only operation', () => {
  test('a conversion can be driven without a mouse', async ({ page }) => {
    await page.goto('/convert/heic-to-jpg');
    // docs/12 D-55: no OffscreenCanvas means the converter UI never renders.
    await skipWithoutOffscreenCanvas(page);
    await page.locator('#tool').scrollIntoViewIfNeeded();
    await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });

    // The skip link must be the first focusable element (docs/08 §6).
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('href', '#tool');

    // Every interactive element must be reachable by keyboard and must have an
    // accessible name — an unnamed control is unusable with a screen reader
    // even when it is focusable.
    const unnamed: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === null || el === document.body) return null;
        const name =
          el.getAttribute('aria-label') ??
          el.textContent?.trim() ??
          el.getAttribute('title') ??
          '';
        return { tag: el.tagName, type: el.getAttribute('type'), named: name.length > 0 };
      });
      if (info === null) break;
      if (!info.named) unnamed.push(info.tag + (info.type === null ? '' : '[' + info.type + ']'));
    }

    expect(unnamed, 'focusable elements with no accessible name').toEqual([]);
  });

  test('the dropzone is operable with Enter and Space', async ({ page }) => {
    await page.goto('/convert/heic-to-jpg');
    // docs/12 D-55: no OffscreenCanvas means the dropzone never renders.
    await skipWithoutOffscreenCanvas(page);
    await page.locator('#tool').scrollIntoViewIfNeeded();
    await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });

    const dropzone = page.getByRole('button', { name: 'Choose images to convert' });
    await expect(dropzone).toBeVisible();
    await dropzone.focus();
    await expect(dropzone).toBeFocused();

    // WCAG 2.5.7: everything achievable by drag must be achievable without it.
    // The picker cannot be asserted open from a test, but the handler must exist
    // and the element must be a real, focusable, named control.
    await expect(dropzone).toHaveAttribute('tabindex', '0');
    await expect(dropzone).toHaveAttribute('aria-describedby', 'dropzone-constraints');
  });
});
