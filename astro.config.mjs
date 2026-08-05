// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

/**
 * ADR-007. Exported so vitest.config.ts imports the SAME mapping instead of
 * keeping its own copy — they drifted once already, and the symptom was an
 * opaque "Could not resolve react imported by zustand" only in browser tests.
 */
export const PREACT_ALIAS = {
  react: 'preact/compat',
  'react-dom': 'preact/compat',
  'react-dom/test-utils': 'preact/test-utils',
  'react/jsx-runtime': 'preact/jsx-runtime',
};

// ADR-001: static output, React only inside islands.
// ADR-003: no COOP/COEP headers are set anywhere — cross-origin isolation is
// deliberately NOT enabled, so every WASM codec must work single-threaded.
export default defineConfig({
  // Overridable so a validation deploy (e.g. *.pages.dev) emits canonicals and
  // a sitemap pointing at ITSELF. A build whose canonical names a different
  // origin is crawled and then declined for indexing, silently — docs/12 D-63.
  site: process.env.SITE_URL ?? 'https://keptpix.com',
  output: 'static',
  trailingSlash: 'never',

  // ADR-007: Preact with `compat: true` aliases react/react-dom to
  // preact/compat, so every island is still AUTHORED as React — the component
  // tree in docs/08 §3 and the Milestone 4 prompt in docs/10 are unchanged —
  // while the hydration runtime drops from 59.45 KB gz to a figure that leaves
  // real headroom under the 60 KB budget in docs/04 §7.
  integrations: [preact({ compat: true })],

  // `sharp` is on the forbidden list in docs/07 §3, but npm still installs it as
  // an OPTIONAL transitive dependency of astro itself, for the default
  // build-time `astro:assets` image service. It is never bundled and ships zero
  // bytes to the browser, so its presence in node_modules is not a violation —
  // but leaving the default service wired would let a build step quietly grow a
  // dependency on it. The passthrough service removes that possibility.
  //
  // Site imagery is static and OG cards come from scripts/generate-og.mjs, so
  // nothing needs optimising here. User images never touch the build at all.
  // Reverse this only alongside a decision in docs/07 §3.
  image: { service: passthroughImageService() },

  build: {
    // Keeps small critical CSS inline and out of the request waterfall.
    inlineStylesheets: 'auto',

    /**
     * 'file' emits `convert/heic-to-jpg.html`, NOT `convert/heic-to-jpg/index.html`.
     *
     * This has to match `trailingSlash: 'never'` above, and by default it did
     * not. Astro's default 'directory' format made Cloudflare Pages serve every
     * route at its SLASHED url and 308-redirect the unslashed one — so every
     * canonical, every sitemap entry and every internal link pointed at a URL
     * that immediately redirected, and the page it landed on declared a
     * canonical back to the redirecting URL.
     *
     * Google resolves that eventually, but it is a muddled signal on a site
     * whose entire growth model is organic search, and a wasted round trip on
     * every internal navigation. Caught by curl-ing production before
     * submitting anything to Search Console (docs/12 D-65).
     */
    format: 'file',
  },

  vite: {
    plugins: [
      tailwindcss(),
      // Bundle report for the 60 KB gz island budget (docs/04 §7).
      // Opt-in: ANALYZE=1 npm run build
      ...(process.env.ANALYZE
        ? [
            visualizer({
              filename: 'stats.html',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],
    // ADR-007. `compat: true` aliases react/react-dom for code Vite bundles,
    // but Vite EXTERNALISES node_modules during the SSR/prerender pass, so a
    // dependency that imports react internally (zustand does) gets resolved by
    // Node directly and fails with "Cannot find package 'react'". Declaring the
    // aliases here and pulling those packages into the SSR bundle fixes it.
    // Any future react-coupled dependency must be added to ssr.noExternal too.
    resolve: { alias: PREACT_ALIAS },
    ssr: {
      noExternal: ['zustand'],
    },
    worker: {
      format: 'es',
    },
    build: {
      target: 'es2022',
    },
  },
});
