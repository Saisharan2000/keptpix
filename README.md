# KeptPix

Batch image conversion and exact-target-size compression that runs **100% in your
browser**. Nothing is ever uploaded.

- **Canonical domain:** `keptpix.app`
- **Architecture:** static-first, layered client monolith with a worker-offloaded
  compute tier. No backend in v1.
- **Marginal cost per user:** exactly zero — every conversion runs on the user's
  own device, so the app cannot lose money on traffic.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Astro dev server |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Serve the built site |
| `npm test` | Vitest unit tests — **plain Node, no jsdom** |
| `npm run test:e2e` | Playwright suites, including the privacy gate |
| `npm run check:budgets` | Enforces the three static budgets in docs/04 §7 |
| `npm run lint` | ESLint, including the layer-boundary rules |
| `npm run typecheck` | `astro sync && tsc --noEmit` |

## The three decisions everything else hangs on

1. **Astro + prerendered HTML per route, React islands for the tool UI.** GPTBot,
   ClaudeBot, and PerplexityBot do not execute JavaScript at all — a
   client-rendered tool page is invisible to every AI answer engine. (ADR-001)
2. **No cross-origin isolation.** No COOP/COEP headers, so every WASM codec must
   work single-threaded. In exchange, third-party payment popups and OAuth keep
   working. (ADR-003)
3. **Canvas-native encoding first, WASM only as fallback or quality tier.** Most
   users complete a conversion having downloaded zero WASM. (ADR-004)

## Repo layout

`src/core/` is pure TypeScript with no DOM, no workers, and no browser globals —
it runs under plain Node. That is what makes the target-size binary search, the
feature this product lives or dies on, provable in CI. See
[docs/07-folder-structure.md](docs/07-folder-structure.md) for the full tree and
the layer dependency table, which ESLint enforces.

## Documentation

The blueprint set in [docs/](docs/) is the source of truth. Start with
[docs/00-INDEX.md](docs/00-INDEX.md). Standing instructions for contributors —
human or agent — are in [CLAUDE.md](CLAUDE.md).

## Non-negotiable

Nothing is ever uploaded. No fetch, XHR, WebSocket, or beacon may carry user file
data. `tests/e2e/privacy.spec.ts` asserts this against the real build, and it is
a release blocker whenever it fails.
