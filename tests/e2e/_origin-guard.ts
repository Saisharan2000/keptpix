/**
 * tests/e2e/_origin-guard.ts — Playwright globalSetup.
 *
 * Asserts that the origin the suite is about to test is THIS site.
 *
 * WHY THIS EXISTS (docs/12 D-76)
 *
 * `reuseExistingServer: !CI` plus a port hardcoded to 4321 — Astro's default —
 * means that if ANY other Astro project is already serving on 4321, Playwright
 * silently adopts it and never builds this one. That happened: a sibling
 * project was running, and a11y.spec.ts reported "73 passed, 2 failed" where
 * the two failures were `/convert/heic-to-jpg` returning 404 because the other
 * site does not have that route. Every one of the 73 passes was equally
 * meaningless. Re-run against the right origin: 75 passed.
 *
 * A green suite against the wrong build is worse than a red one, because it is
 * believed. Nothing in the output said which site had been tested — the only
 * clue was another product's brand name inside a failure snapshot nobody would
 * open if the run had been fully green.
 *
 * THE CHECK: every route this build produced must exist at the target origin.
 * That is stronger than sniffing for a brand string and it needs no marker to
 * maintain — a foreign server fails on the first route it does not have, and a
 * stale one fails on whatever was added since it started. It also covers the
 * `E2E_BASE_URL` case, where the origin is a real deployment and "is the thing
 * I am testing the thing I just built" is exactly as easy to get wrong.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

/** Every .html in dist/, as the path it is served at. */
function builtRoutes(): string[] {
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
  return (
    files
      .map((f) => '/' + relative(DIST, f).split(sep).join('/'))
      .map((r) => r.replace(/\.html$/, '').replace(/^\/index$/, '/'))
      /**
       * `/404` is excluded, and the reason is worth stating because it looks
       * like an omission.
       *
       * Locally the static server hands back `404.html` at that path with a
       * 200. On Cloudflare Pages a request for `/404.html` is 308-redirected to
       * `/404`, and `/404` itself is served for unknown URLs with a genuine 404
       * status — which is correct, and is exactly what this guard is built to
       * reject. So including it would fail every run against production, i.e.
       * against the one origin the privacy suite is required to be run on
       * (docs/13 launch gate).
       *
       * Nothing is lost: no page links to it, it is absent from the sitemap,
       * and the behaviour that matters — an unknown path returning 404 and our
       * own page — is not a route check.
       */
      .filter((r) => r !== '/404')
  );
}

/** Routes whose absence is most diagnostic, checked first for a fast failure. */
const CANARIES = ['/', '/convert/heic-to-jpg', '/compress/jpg-to-100kb'];

export default async function guardOrigin(): Promise<void> {
  const base = (process.env.E2E_BASE_URL?.trim() ?? '').replace(/\/$/, '') || 'http://localhost:4321';

  const routes = builtRoutes();
  if (routes.length === 0) {
    throw new Error(
      'origin guard: dist/ has no built routes. Run `npm run build` before the e2e suite.',
    );
  }

  // Canaries first: if the origin is a different app entirely, say so in one
  // line rather than after 24 failed requests.
  const ordered = [
    ...CANARIES.filter((r) => routes.includes(r)),
    ...routes.filter((r) => !CANARIES.includes(r)),
  ];

  const missing: string[] = [];
  for (const route of ordered) {
    let status = 0;
    try {
      // `redirect: 'manual'` on purpose — a 308 to a slashed variant is D-65,
      // a real defect, and must not be laundered into a pass here.
      const response = await fetch(base + route, { redirect: 'manual' });
      status = response.status;
    } catch (cause) {
      throw new Error(
        `origin guard: cannot reach ${base}${route} — ${String(cause)}\n` +
          'Is anything serving that origin?',
      );
    }
    if (status !== 200) missing.push(`${route} -> ${status}`);
    // Bail early on a clearly foreign origin.
    if (missing.length >= 3) break;
  }

  if (missing.length > 0) {
    throw new Error(
      `origin guard: ${base} is not serving this build (docs/12 D-76).\n\n` +
        missing.map((m) => '  ' + m).join('\n') +
        '\n\nMost likely another project is already listening on that port and\n' +
        'Playwright reused it (reuseExistingServer). Stop it, or run against a\n' +
        'port of your own:\n\n' +
        '  npm run build\n' +
        '  node scripts/serve-with-headers.mjs 4399\n' +
        '  E2E_BASE_URL=http://localhost:4399 npx playwright test\n',
    );
  }
}
