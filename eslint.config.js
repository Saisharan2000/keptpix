import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

/* ────────────────────────────────────────────────────────────────────────────
 * Layer elements — docs/07 §2.
 *
 * Order matters: the first matching pattern wins. `pool.ts` and `protocol.ts`
 * are broken out as their own element types because docs/07 §2 grants `state/`
 * access to `workers/pool` specifically, not to the whole workers layer.
 * `protocol` is included in that narrow grant because docs/05 §1 requires
 * `toJobResult()` to live in `state/jobs.slice.ts` and it takes a
 * `SerializableResult`, which docs/06 §2 declares in `workers/protocol.ts`.
 * ──────────────────────────────────────────────────────────────────────────── */
const elements = [
  { type: 'workers-pool', pattern: 'src/workers/pool.ts', mode: 'file' },
  { type: 'workers-protocol', pattern: 'src/workers/protocol.ts', mode: 'file' },
  { type: 'workers', pattern: 'src/workers/**/*', mode: 'file' },

  // Broken out for the same reason as workers-pool above: docs/07 §2 denies
  // `pages/` the whole of core/, but the ToolManifest is what every tool route
  // generates itself from (docs/kepttools/03 §1), so getStaticPaths has to read
  // it. Granting the ONE file keeps the rest of core/ closed to pages/ — see
  // docs/12 D-69 for why the alternative (a content/ copy) was worse.
  { type: 'core-tools', pattern: 'src/core/tools.ts', mode: 'file' },
  { type: 'core', pattern: 'src/core/**/*', mode: 'file' },
  { type: 'engines', pattern: 'src/engines/**/*', mode: 'file' },
  { type: 'state', pattern: 'src/state/**/*', mode: 'file' },
  { type: 'platform', pattern: 'src/platform/**/*', mode: 'file' },
  { type: 'content', pattern: 'src/content/**/*', mode: 'file' },
  { type: 'components-astro', pattern: 'src/components/astro/**/*', mode: 'file' },
  { type: 'components-react', pattern: 'src/components/react/**/*', mode: 'file' },
  { type: 'layouts', pattern: 'src/layouts/**/*', mode: 'file' },
  { type: 'pages', pattern: 'src/pages/**/*', mode: 'file' },
  { type: 'styles', pattern: 'src/styles/**/*', mode: 'file' },
];

/* The dependency table from docs/07 §2, verbatim. Anything not listed is denied. */
const elementRules = [
  // core/ may import core/ only — no DOM, no window, no document.
  // `core-tools` is core: it gets the same grant, and everything already
  // allowed to read core/ keeps reading it without a second thought.
  { from: ['core', 'core-tools'], allow: ['core', 'core-tools'] },

  // engines/ may import core/, engines/.
  { from: ['engines'], allow: ['core', 'core-tools', 'engines'] },

  // workers/ may import core/, engines/, workers/.
  {
    from: ['workers', 'workers-pool', 'workers-protocol'],
    allow: ['core', 'core-tools', 'engines', 'workers', 'workers-pool', 'workers-protocol'],
  },

  // state/ may import core/, platform/, workers/pool (+ the protocol types).
  {
    from: ['state'],
    allow: ['core', 'core-tools', 'platform', 'state', 'workers-pool', 'workers-protocol'],
  },

  // platform/ may import core/.
  { from: ['platform'], allow: ['core', 'core-tools', 'platform'] },

  // components/react/ may import core/ (types), state/, content/.
  {
    from: ['components-react'],
    allow: ['core', 'core-tools', 'state', 'content', 'components-react', 'styles'],
  },

  // components/astro/ may import content/ and core/ TYPES — nothing React or
  // stateful. docs/07 §2 originally listed content/ alone, but docs/05 §1 makes
  // core/types.ts the single source of truth and forbids parallel shapes, so an
  // Astro component rendering a ComparisonTable has to name that type. A type
  // is neither React nor stateful, and components/react/ already has the same
  // grant. docs/07 §2 updated to match.
  {
    from: ['components-astro'],
    allow: ['core', 'core-tools', 'content', 'components-astro', 'styles'],
  },

  // pages/ may import layouts/, components/, content/ — plus core/tools.ts and
  // nothing else from core/ (docs/12 D-69).
  {
    from: ['pages'],
    allow: [
      'layouts',
      'components-astro',
      'components-react',
      'content',
      'core-tools',
      'styles',
      'pages',
    ],
  },

  // layouts/ is not in the docs/07 §2 table; it sits with pages/ in the
  // presentation layer and gets the same grants minus pages/.
  {
    from: ['layouts'],
    allow: [
      'layouts',
      'components-astro',
      'components-react',
      'content',
      'core-tools',
      'styles',
    ],
  },

  { from: ['content'], allow: ['core', 'core-tools', 'content'] },
  { from: ['styles'], allow: ['styles'] },
];

/* ADR-006 / docs/07 §2: `src/core/` must run in plain Node. */
const browserOnlyGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'SharedArrayBuffer',
  'OffscreenCanvas',
  'createImageBitmap',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'importScripts',
  'postMessage',
  'self',
  'alert',
].map((name) => ({
  name,
  message:
    'src/core/ is pure TypeScript and must run under plain Node (ADR-006). ' +
    'Move browser-dependent code to src/engines/ or src/platform/.',
}));

/* docs/07 §3 — the ⛔ explicitly forbidden table, made executable. */
const forbiddenPackages = [
  { name: 'pdf-lib', message: 'Unmaintained since 2021-11-06. Use @cantoo/pdf-lib if PDF work ever happens (docs/07 §3).' },
  { name: 'mupdf', message: 'AGPL-3.0 / commercial dual license. Do not add without buying a licence (docs/07 §3).' },
  { name: 'sharp', message: 'Native bindings; no browser equivalent. Use canvas (docs/07 §3).' },
  { name: '@ffmpeg/ffmpeg', message: 'Multithread needs COOP/COEP, which ADR-003 forecloses. Use mediabunny if video ever ships (docs/07 §3).' },
  { name: '@ffmpeg/core', message: 'See @ffmpeg/ffmpeg — forbidden by docs/07 §3.' },
  { name: '@ffmpeg/util', message: 'See @ffmpeg/ffmpeg — forbidden by docs/07 §3.' },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.astro/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'docs/**',
      'stats.html',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,

  /* ── Global language options ─────────────────────────────────────────── */
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2023 },
    },
    rules: {
      'no-restricted-imports': ['error', { paths: forbiddenPackages }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  /* ── Layer boundaries (docs/07 §2) ───────────────────────────────────── */
  {
    files: ['src/**/*.{ts,tsx,astro}'],
    plugins: { boundaries },
    settings: {
      // Without TS/Astro extensions here, the default node resolver cannot
      // resolve `../state/store` and eslint-plugin-boundaries SILENTLY SKIPS
      // the import — the rules appear to pass while enforcing nothing.
      // tests in `npm run lint` are only as good as this list.
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.astro', '.css'],
        },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': elements,
    },
    rules: {
      'boundaries/element-types': ['error', { default: 'disallow', rules: elementRules }],
      'boundaries/no-private': 'off',
    },
  },

  /* ── ADR-006: core/ is pure ──────────────────────────────────────────── */
  {
    files: ['src/core/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      'no-restricted-globals': ['error', ...browserOnlyGlobals],
    },
  },

  /* ── React islands ───────────────────────────────────────────────────── */
  {
    files: ['src/**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },

  /* ── Astro components (docs/08 §6 makes a11y a release gate) ─────────── */
  {
    files: ['src/**/*.astro'],
    rules: {
      ...astro.configs['jsx-a11y-recommended'].reduce(
        (acc, cfg) => ({ ...acc, ...(cfg.rules ?? {}) }),
        {},
      ),
      /**
       * Two a11y rules genuinely disagree here, and axe is the one that wins.
       *
       * axe's `scrollable-region-focusable` (serious) REQUIRES tabindex="0" on
       * a container that scrolls, or keyboard users cannot reach its content —
       * a real failure this suite caught on the comparison tables at a 390 px
       * viewport (docs/12 D-55). This rule's default role allowlist forbids
       * exactly that. `role="region"` + `tabindex="0"` on a scroll container is
       * the documented WCAG pattern, so the role is allowed rather than the
       * accessibility fix being dropped or blanket-disabled at the call sites.
       */
      'astro/jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
    },
  },

  /* ── Workers ─────────────────────────────────────────────────────────── */
  {
    files: ['src/workers/**/*.ts', 'public/sw.ts'],
    languageOptions: { globals: { ...globals.worker, ...globals.serviceworker } },
  },

  /* ── Node-side tooling ───────────────────────────────────────────────── */
  {
    files: ['scripts/**/*.mjs', '*.config.{js,mjs,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
