# 07 — Repository Structure

Claude Code must create exactly this tree. Do not reorganise, do not add a `utils/` catch-all, do not collapse `core/` into `lib/`.

---

## 1. Tree

```
noupload/
├── docs/                              ← this blueprint set, committed
│
├── public/
│   ├── favicon.svg
│   ├── manifest.webmanifest
│   ├── sw.ts                          ← service worker: app-shell + WASM precache
│   ├── robots.txt                     ← explicitly allows GPTBot/ClaudeBot/PerplexityBot
│   └── og/                            ← static OG images per route family
│
├── src/
│   ├── pages/                         ← Astro routes; ALL prerendered
│   │   ├── index.astro                        /
│   │   ├── compress.astro                     /compress
│   │   ├── resize.astro                       /resize
│   │   ├── metadata.astro                     /metadata
│   │   ├── convert/
│   │   │   ├── index.astro                    /convert
│   │   │   └── [pair].astro                   /convert/heic-to-jpg  (getStaticPaths)
│   │   ├── compress/
│   │   │   └── [preset].astro                 /compress/jpg-to-100kb
│   │   ├── resize/
│   │   │   └── [preset].astro                 /resize/1920x1080
│   │   ├── formats/
│   │   │   └── [format].astro                 /formats/heic  (reference pages)
│   │   ├── blog/
│   │   │   └── [slug].astro                   sparse; Wave 4 onward
│   │   ├── privacy.astro
│   │   ├── about.astro
│   │   ├── how-it-works.astro                 ← the "verify it yourself" page
│   │   ├── 404.astro
│   │   └── sitemap.xml.ts
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro           ← <head>, JSON-LD, theme bootstrap
│   │   ├── ToolLayout.astro           ← tool page chrome + island slot
│   │   └── ContentLayout.astro        ← prose pages
│   │
│   ├── components/
│   │   ├── astro/                     ← ZERO JavaScript, static markup only
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   ├── FaqSection.astro
│   │   │   ├── FormatSpecTable.astro
│   │   │   ├── PrivacyBanner.astro
│   │   │   ├── RelatedTools.astro
│   │   │   └── SeoHead.astro
│   │   │
│   │   └── react/                     ← hydrated islands
│   │       ├── ToolShell.tsx          ← the ONLY client:visible entry point
│   │       ├── Dropzone.tsx
│   │       ├── FileCard.tsx
│   │       ├── FileGrid.tsx
│   │       ├── ConfigPanel.tsx
│   │       ├── FormatSelect.tsx
│   │       ├── ModeToggle.tsx
│   │       ├── QualityControl.tsx
│   │       ├── TargetSizeControl.tsx
│   │       ├── ResizeControl.tsx
│   │       ├── MetadataToggle.tsx     ← config switch, lives in ConfigPanel
│   │       ├── MetadataPanel.tsx      ← inspector drawer (a different component)
│   │       ├── PresetPicker.tsx
│   │       ├── PrivacyIndicator.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── BatchSummary.tsx
│   │       ├── CompareView.tsx
│   │       ├── ResultActions.tsx
│   │       ├── ErrorCard.tsx
│   │       ├── DiagnosticsPanel.tsx
│   │       └── primitives/            ← Button, Slider, Select, Toggle, Tooltip…
│   │
│   ├── core/                          ← PURE TS. No DOM. No workers. No imports from
│   │   │                                 pages/components/engines/platform. Node-testable.
│   │   ├── types.ts                   ← doc 05 §1 lives here; single source of truth
│   │   ├── detect.ts                  ← magic-byte format detection
│   │   ├── target-size.ts             ← ⭐ the binary-search wedge feature
│   │   ├── resize.ts                  ← dimension math + stepped downscale plan
│   │   ├── guards.ts                  ← assessMemoryRisk
│   │   ├── capabilities.ts            ← DeviceProfile + CodecSupport resolution
│   │   ├── metadata.ts                ← EXIF/GPS parsing via exifr; pure, works on ArrayBuffer
│   │   ├── naming.ts                  ← output filename generation, collision handling
│   │   ├── errors.ts                  ← JobError factory, code → message map
│   │   └── __tests__/
│   │
│   ├── engines/                       ← codec adapters; browser APIs allowed
│   │   ├── types.ts                   ← Decoder / Encoder interfaces (doc 06 §1)
│   │   ├── registry.ts                ← resolveEncoder / resolveDecoder
│   │   ├── svg.ts                     ← SVG rasterizer (Image + canvas, no WASM)
│   │   ├── canvas/
│   │   │   ├── decoder.ts             ← createImageBitmap
│   │   │   └── encoder.ts             ← OffscreenCanvas.convertToBlob
│   │   └── wasm/
│   │       ├── loader.ts              ← lazy fetch + instantiate + cache
│   │       ├── heif.ts                ← libheif — HEIC/HEIF decode
│   │       ├── mozjpeg.ts             ← best-quality JPEG encode
│   │       ├── oxipng.ts              ← lossless PNG optimise
│   │       ├── avif.ts                ← libavif
│   │       ├── jxl.ts                 ← libjxl
│   │       └── tiff.ts                ← UTIF
│   │
│   ├── workers/
│   │   ├── protocol.ts                ← WorkerApi + message types (doc 06 §2)
│   │   ├── image.worker.ts            ← Comlink.expose(api); the pipeline
│   │   ├── pipeline.ts                ← decode → resize → encode orchestration
│   │   └── pool.ts                    ← main-thread WorkerPool
│   │
│   ├── state/
│   │   ├── store.ts                   ← Zustand root
│   │   ├── queue.ts                   ← QueueController: scheduling, concurrency,
│   │   │                                 retry, cancellation (feature M-10)
│   │   ├── jobs.slice.ts              ← incl. toJobResult() mapping (docs/05 §1)
│   │   ├── config.slice.ts
│   │   ├── ui.slice.ts
│   │   └── selectors.ts
│   │
│   ├── platform/                      ← browser-API wrappers, all feature-detected
│   │   ├── db.ts                      ← Dexie schema (doc 05 §2)
│   │   ├── opfs.ts                    ← OPFS session store
│   │   ├── deliver.ts                 ← download / ZIP / File System Access
│   │   ├── clipboard.ts
│   │   ├── license.ts                 ← Phase 4, Ed25519 verify
│   │   └── analytics.ts               ← pageview counts only; NEVER file data
│   │
│   ├── content/
│   │   ├── formats.ts                 ← FormatPairRoute[] — hand-curated
│   │   ├── presets.ts                 ← SizePresetRoute[] + built-in JobConfigs
│   │   └── copy/
│   │       ├── en.ts                  ← message catalog
│   │       └── index.ts               ← t() helper
│   │
│   ├── styles/
│   │   ├── tokens.css                 ← design tokens (doc 08 §2) as CSS custom properties
│   │   └── global.css
│   │
│   └── env.d.ts
│
├── tests/
│   ├── unit/                          ← Vitest, Node env, covers src/core
│   ├── integration/                   ← Vitest browser mode, covers engines + workers
│   ├── e2e/                           ← Playwright
│   │   ├── convert.spec.ts
│   │   ├── target-size.spec.ts
│   │   ├── batch.spec.ts
│   │   ├── a11y.spec.ts
│   │   └── privacy.spec.ts            ← ⭐ asserts zero outbound data requests
│   ├── perf/
│   │   └── benchmark.ts
│   └── fixtures/
│       └── images/                    ← one sample per format + edge cases
│
├── scripts/
│   ├── check-budgets.mjs              ← CI fails if HTML/JS/WASM exceed doc 04 §7 budgets
│   └── generate-og.mjs
│
├── astro.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── package.json
├── wrangler.toml                      ← Phase 4 license Worker only
├── CLAUDE.md                          ← standing instructions for Claude Code
└── README.md
```

---

## 2. Dependency rules (enforce with `eslint-plugin-boundaries`)

| Layer | May import from | Must never import |
|---|---|---|
| `core/` | `core/` only | everything else — **no DOM, no `window`, no `document`** |
| `engines/` | `core/`, `engines/` | `state/`, `components/`, `pages/`, `workers/` |
| `workers/` | `core/`, `engines/`, `workers/` | `state/`, `components/`, `pages/` |
| `state/` | `core/`, `platform/`, `workers/pool` | `components/`, `pages/`, `engines/` |
| `platform/` | `core/` | `state/`, `components/`, `engines/` |
| `components/react/` | `core/` (types), `state/`, `content/` | `engines/`, `workers/` (except via `state`) |
| `components/astro/` | `core/` (types), `content/` | anything React or stateful |
| `pages/` | `layouts/`, `components/`, `content/` | `core/` internals, `engines/`, `workers/` |

The rule that matters most: **`core/` must run in plain Node.** If `npx vitest run tests/unit` needs jsdom, a boundary has been violated.

---

## 3. Dependencies

### Runtime

| Package | Version | Purpose | Notes |
|---|---|---|---|
| `astro` | ^5 | Static site + islands | ADR-001 |
| `@astrojs/preact` | ^4 | Island integration, `compat: true` | ADR-007. Must track Astro's major — `@astrojs/preact` 5 needs Vite 7 and 6 needs Vite 8; Astro 5 ships Vite 6. |
| `preact` | ^10 | Island UI runtime via `preact/compat` | ADR-007. Islands are still **authored as React** — `import { useState } from 'react'` resolves to `preact/compat`. React 19's runtime alone measured 59.45 KB gz, 99% of the docs/04 §7 budget. |
| `zustand` | ^5 | Client state | ~1 KB, no context boilerplate |
| `comlink` | ^4 | Worker RPC | Typed `postMessage` |
| `dexie` | ^4.4 | IndexedDB | Settings/presets only |
| `client-zip` | ^2 | Streaming ZIP | Never materialises the archive in memory |
| `exifr` | ^7 | EXIF/GPS/IPTC parsing | Read-only, for the metadata panel |
| `tailwindcss` | ^4 | Styling | Tokens in `styles/tokens.css` |

### Codecs (lazy, per-format)

| Package | Purpose |
|---|---|
| `libheif-js` | HEIC/HEIF decode — no native browser path exists |
| `@jsquash/jpeg` | mozjpeg encode/decode (best-quality tier) |
| `@jsquash/png` + `@jsquash/oxipng` | PNG + lossless optimise |
| `@jsquash/webp` | WebP fallback where canvas is absent |
| `@jsquash/avif` | AVIF |
| `@jsquash/jxl` | JPEG XL |
| `utif2` | TIFF decode |

⚠️ jSquash packages last published 2024–2025. That's acceptable — they are thin wrappers over stable Squoosh codec builds, and Squoosh itself is effectively frozen. Not the same risk profile as an abandoned application-level library.

### Dev

`typescript`, `vitest`, `@vitest/browser`, `playwright`, `@axe-core/playwright`, `eslint` + `eslint-plugin-boundaries`, `prettier`, `rollup-plugin-visualizer`, `wrangler` (Phase 4).

### ⛔ Explicitly forbidden

| Package | Reason |
|---|---|
| `pdf-lib` | Last published **2021-11-06** despite 10M weekly downloads. If PDF work ever happens, use `@cantoo/pdf-lib`. |
| `mupdf` (WASM) | **AGPL-3.0 / commercial dual license.** Do not add without buying a licence. |
| `@ffmpeg/ffmpeg` | 0.04–0.08× native speed, memory-bound, multithread needs COOP/COEP (ADR-003). Not in v1. If video ever ships, use `mediabunny`. |
| `sharp` | Native bindings; there is no browser equivalent. Use canvas. |
| Any analytics that transmits payloads | Violates the product's core claim. Cloudflare Web Analytics only. |

---

## 4. `CLAUDE.md` — commit this at the repo root

```md
# NoUpload — standing instructions

## Non-negotiables
1. NOTHING is ever uploaded. No fetch/XHR/WebSocket/beacon may carry user file
   data. If a task seems to need a server, stop and ask — do not improvise one.
2. `src/core/` is pure TypeScript. No DOM, no browser globals, no worker APIs.
   It must run under plain Node in Vitest.
3. All image processing happens inside a Web Worker. The main thread never blocks.
4. Follow docs/07-folder-structure.md exactly. New files go where it says.
5. Follow the contracts in docs/06-contracts.md exactly. Do not change a signature
   without updating that doc in the same commit.

## Performance
- Baseline island JS must stay under 60 KB gzipped. `npm run check:budgets` enforces it.
- Try canvas-native encode before loading any WASM codec (ADR-004).
- Transfer ArrayBuffers to workers — never clone. Close every ImageBitmap in a `finally`.
- Revoke every object URL on unmount.

## Quality bar
- Every JobError must use a code from docs/04-architecture.md §6. No generic throws
  reaching the UI.
- One file failing must never abort a batch.
- Every interactive element is keyboard-operable and has an accessible name.
- New format support = a new adapter in src/engines/. Never a branch in the pipeline.

## Do not add
pdf-lib (unmaintained since 2021), mupdf (AGPL), ffmpeg.wasm, sharp,
any analytics that transmits payloads, any dependency over 100 KB gz without asking.
```
