/**
 * tests/e2e/no-orphans.spec.ts
 *
 * Every route in the sitemap must be linked from somewhere else on the site.
 *
 * WHY (docs/12 D-79): `/pdf/from-images` shipped, deployed, and returned 200,
 * and the only page linking to it was itself. It was in the sitemap, absent
 * from the nav, and reachable only by typing the URL. Google treats orphan
 * pages as low priority and internal links are a ranking signal, so a page
 * nothing links to is close to invisible — and nobody browsing the site could
 * find it at all.
 *
 * Nothing caught it. The build passed, the route test passed, a11y passed on
 * the page, the sitemap contained it, and the deploy verified it. "Does this
 * page exist" and "can anyone get to it" are different questions, and only the
 * first one was ever being asked.
 *
 * Chromium only: this is a property of the generated HTML, identical on every
 * engine, and crawling every page five times would cost minutes for no
 * additional signal.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = join(process.cwd(), 'dist');

/**
 * One normalisation, used for sitemap entries, page paths and hrefs alike.
 *
 * They arrive in three different shapes and comparing them without agreeing on
 * a form is how the homepage ends up being both `/` and `''` in the same test.
 */
const normalise = (path: string): string => path.replace(/\/$/, '');

/** Every built .html file, as the path it is served at. */
function builtPages(): Array<{ route: string; file: string }> {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.html')) files.push(full);
    }
  };
  try {
    walk(DIST);
  } catch {
    return [];
  }
  return files.map((file) => ({
    file,
    route: normalise(
      '/' +
        relative(DIST, file)
          .split(sep)
          .join('/')
          .replace(/index\.html$/, '')
          .replace(/\.html$/, ''),
    ),
  }));
}

/**
 * Routes that are deliberately unlinked, each for a stated reason.
 *
 * Kept deliberately short. Anything added here is a page nobody can find, so
 * it needs a reason better than "it was easier".
 */
const INTENTIONAL_ORPHANS = new Set([
  '', // '/' — the root; everything links to it, and it links to itself
  '/404', // reached by a bad URL, never by a link
  '/selftest', // diagnostic surface, noindex + disallowed in robots (D-68)
]);

test.describe('internal linking', () => {
  // Playwright requires an object-destructuring first parameter and eslint
  // rejects an empty one, so name a fixture that is actually used.
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'a property of the generated HTML — identical on every engine',
    );
  });

  test('no page in the sitemap is an orphan', () => {
    const pages = builtPages();
    expect(pages.length, 'no built pages found — run `npm run build` first').toBeGreaterThan(15);

    // Which routes claim to be indexable content.
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const inSitemap = new Set(
      [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
        normalise(new URL(m[1]!).pathname),
      ),
    );

    // Every href appearing in any page OTHER than the page itself.
    const linkedFrom = new Map<string, string[]>();
    for (const { file, route } of pages) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(/href="(\/[^"#?]*)/g)) {
        const target = normalise(match[1]!);
        if (target === route) continue; // self-links do not count
        const sources = linkedFrom.get(target) ?? [];
        sources.push(route);
        linkedFrom.set(target, sources);
      }
    }

    const orphans = [...inSitemap]
      .filter((route) => !INTENTIONAL_ORPHANS.has(route))
      .filter((route) => (linkedFrom.get(route) ?? []).length === 0);

    expect(
      orphans,
      'these routes are in the sitemap but no other page links to them — ' +
        'Google will treat them as low priority and no visitor can find them',
    ).toEqual([]);
  });

  test('every published manifest tool is linked site-wide', () => {
    // Stronger than "linked from somewhere": a tool in the nav is linked from
    // EVERY page, which is the signal that matters. This is what makes the
    // derived nav in Header.astro a guarantee rather than a convention.
    const pages = builtPages();
    const home = pages.find((p) => p.route === '');
    expect(home, 'no homepage found').toBeDefined();

    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const toolRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => normalise(new URL(m[1]!).pathname))
      // Manifest tools live under a category directory, e.g. /pdf/from-images.
      .filter((route) => /^\/(pdf|video|qr)\//.test(route));

    if (toolRoutes.length === 0) return; // nothing published yet

    const homeHtml = readFileSync(home!.file, 'utf8');
    for (const route of toolRoutes) {
      expect(homeHtml.includes('href="' + route + '"'), route + ' is not linked from /').toBe(true);
    }
  });
});
