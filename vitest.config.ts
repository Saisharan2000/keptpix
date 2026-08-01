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
          // tests/perf/benchmark.ts (docs/07 §1) is named without a .test/.spec
          // infix, so it needs its own explicit include — it needs the same
          // real browser (OffscreenCanvas, Workers) as the integration suite.
          include: ['tests/integration/**/*.{test,spec}.ts', 'tests/perf/**/*.ts'],
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
    ],
  },
});
