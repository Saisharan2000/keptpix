import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
// One source of truth for the ADR-007 aliasing; see astro.config.mjs.
import { PREACT_ALIAS } from './astro.config.mjs';

/**
 * Two projects, deliberately separated.
 *
 * `unit` runs in plain Node. docs/07 §2: "core/ must run in plain Node. If
 * `npx vitest run tests/unit` needs jsdom, a boundary has been violated." There
 * is no jsdom in this repo at all, so that cannot quietly stop being true.
 *
 * `integration` runs in a REAL browser via Playwright, because canvas,
 * OffscreenCanvas, ImageBitmap and Workers have no faithful fake. Simulating
 * them would prove nothing about the thing we actually ship.
 *
 * `npm test` runs only `unit`, so the fast gate stays fast.
 */
export default defineConfig({
  // ES modules inside workers — the pool loads image.worker.ts as a module
  // worker, and an IIFE build would break its imports.
  worker: { format: 'es' },

  // Without this, zustand's optional react peer dep fails to resolve in the
  // browser project and every store-touching test dies at import time.
  resolve: { alias: PREACT_ALIAS },
  optimizeDeps: { include: ['zustand', 'client-zip', 'comlink'] },

  test: {
    // Root-level only — Vitest 4 rejects this inside a project config.
    passWithNoTests: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/__tests__/**', 'src/core/types.ts'],
      // Milestone 2 acceptance: >= 95% line coverage on src/core/
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90,
      },
    },

    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          globals: false,
          include: [
            'tests/unit/**/*.{test,spec}.ts',
            'src/core/__tests__/**/*.{test,spec}.ts',
          ],
          exclude: ['node_modules/**', 'dist/**', '.astro/**'],
        },
      },
      {
        // Vite options must live on the PROJECT, not the root — with `projects`
        // the root resolve/optimizeDeps do not propagate, and the symptom is
        // zustand's optional react peer dep failing at import time.
        resolve: { alias: PREACT_ALIAS },
        optimizeDeps: { include: ['zustand', 'client-zip', 'comlink'] },
        test: {
          name: 'integration',
          globals: false,
          include: ['tests/integration/**/*.{test,spec}.ts'],
          exclude: ['node_modules/**', 'dist/**', '.astro/**'],
          browser: {
            enabled: true,
            // Vitest 4 takes a provider factory, not a string.
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        /**
         * The perf benchmark, in an INSTRUMENTED browser (WO-6, docs/12 D-45).
         *
         * D-45 established that `performance.memory.usedJSHeapSize` is frozen
         * on any page where `crossOriginIsolated === false` — which this app is
         * permanently, by ADR-003's deliberate refusal of COOP/COEP. So the
         * production page genuinely cannot measure its own heap, and the
         * `< 400 MB` budget in docs/04 §7 was skipped with a printed reason
         * rather than faked with a false "0.0 MB, PASS".
         *
         * The HARNESS is not bound by that trade-off. `--enable-precise-memory-info`
         * restores real precision to the counter, so the budget can be measured
         * for real here even though it cannot be on the deployed page. The
         * benchmark's own canary probe (allocate ~100 MB, require the counter to
         * move >20 MB) still gates the assertion, so if the flag ever stops
         * working this reverts to an honest skip instead of a false pass.
         *
         * Its own project rather than a flag on `integration`: launch options
         * are per browser instance, and the rest of the suite should keep
         * testing the browser users actually have.
         */
        resolve: { alias: PREACT_ALIAS },
        optimizeDeps: { include: ['zustand', 'client-zip', 'comlink'] },
        test: {
          name: 'perf',
          globals: false,
          // benchmark.ts (docs/07 §1) is named without a .test/.spec infix.
          include: ['tests/perf/**/*.ts'],
          exclude: ['node_modules/**', 'dist/**', '.astro/**'],
          browser: {
            enabled: true,
            // launchOptions belongs on the PROVIDER, not the instance — an
            // instance-level `launchOptions` is silently ignored, and the
            // symptom is simply that the flag never arrives and the canary
            // keeps reporting the counter unreliable.
            provider: playwright({ launchOptions: { args: ['--enable-precise-memory-info'] } }),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
