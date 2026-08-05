import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;

/**
 * Point the suite at a DEPLOYED origin with `E2E_BASE_URL`, e.g.
 *
 *   E2E_BASE_URL=https://keptpix.com npx playwright test tests/e2e/privacy.spec.ts
 *
 * docs/10 M8's acceptance requires re-running the privacy suite against
 * production, and docs/13 lists it as a launch gate — but the base URL was
 * hardcoded to localhost, so that gate could not actually be run. Some things
 * only exist on a real origin: HTTPS, a service worker with a real scope, and
 * Cloudflare's own URL handling, which is where D-65's redirect bug lived and
 * which nothing local models.
 */
const REMOTE = process.env.E2E_BASE_URL?.trim();
const BASE_URL = REMOTE && REMOTE.length > 0 ? REMOTE : `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The project-coverage reporter is not optional tooling: it fails the run if
  // a configured engine never executed a single test (WO-3, docs/12 D-55).
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['./tests/e2e/_project-coverage-reporter.ts']]
    : [['list'], ['html', { open: 'never' }], ['./tests/e2e/_project-coverage-reporter.ts']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],

  // Tests run against the real static build, never the dev server — the privacy
  // suite (Milestone 7) must observe exactly what ships.
  //
  // Skipped entirely when E2E_BASE_URL points at a deployed origin: building and
  // serving locally would be pointless work, and `url` would poll the wrong host.
  ...(REMOTE
    ? {}
    : {
        webServer: {
          command: `npm run build && npm run preview -- --port ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
