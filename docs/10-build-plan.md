# 10 — Build Plan for Claude Code

Nine milestones. Each has a copy-paste prompt and acceptance criteria. **Do not advance until the criteria pass.** The order is deliberate: the riskiest, most differentiating logic (target-size search) is proven in pure TypeScript before any UI exists.

Estimated total: **3–4 weeks** at a normal pace for one person driving Claude Code.

---

## Milestone 0 — Scaffold

```
Read docs/00-INDEX.md, docs/04-architecture.md, and docs/07-folder-structure.md.

Create a new Astro 5 project with TypeScript (strict), React 19 integration,
and Tailwind 4. Set output to fully static.

Create the exact directory tree from docs/07-folder-structure.md. Add a
placeholder .gitkeep or a one-line stub in every directory so the structure
is real, not aspirational.

Also create:
- CLAUDE.md at the repo root with the exact content from docs/07 §4
- src/styles/tokens.css with the exact token values from docs/08 §2
- src/core/types.ts with the exact types from docs/05 §1
- eslint config with eslint-plugin-boundaries enforcing the dependency table
  in docs/07 §2
- vitest.config.ts (node environment for tests/unit)
- playwright.config.ts
- scripts/check-budgets.mjs enforcing ALL THREE static budgets from
  docs/04-architecture.md §7: HTML per route < 25 KB gz, baseline island JS
  < 60 KB gz, any single .wasm < 1.2 MB
- npm scripts: dev, build, preview, test, test:e2e, check:budgets, lint

Do NOT install pdf-lib, mupdf, ffmpeg, or sharp.
Stop and show me the tree plus package.json.
```

**Acceptance:** `npm run build` succeeds · `npm run lint` passes · `npx tsc --noEmit` clean · tree matches doc 07 exactly · forbidden packages absent.

---

## Milestone 1 — Static shell and one real route

```
Read docs/08-design-system.md and docs/09-seo-content-plan.md.

Build BaseLayout.astro, ToolLayout.astro, ContentLayout.astro, Header.astro, Footer.astro,
SeoHead.astro, FaqSection.astro, FormatSpecTable.astro, RelatedTools.astro,
PrivacyBanner.astro — all pure Astro, ZERO client-side JavaScript.

Implement theme switching (light/dark/system) via a tiny inline script in
<head> that sets data-theme before first paint. No flash of wrong theme.

Create src/content/formats.ts with ONE fully-written FormatPairRoute entry:
heic-to-jpg (tier: 'star'). Write the real 400+ words of HEIC-specific copy,
the five-row comparison table (docs/05 §5 ComparisonTable), and 4 HEIC-specific
FAQ entries. Use docs/09 §3 as the spec and its anti-pattern table as the bar.

Build src/pages/convert/[pair].astro using getStaticPaths over that array,
matching the desktop-idle wireframe in docs/08 §4.1. Leave a placeholder div
where ToolShell will mount.

Emit WebApplication + FAQPage + BreadcrumbList JSON-LD from SeoHead.
```

**Acceptance:** `/convert/heic-to-jpg` builds to static HTML · `curl` the built file and confirm the h1, all body copy, the table, and the FAQ are present in the **raw HTML** (this is the AI-crawler test) · zero JS in the network waterfall · Lighthouse SEO and Accessibility both 100 · light and dark both render with no flash.

---

## Milestone 2 — ⭐ Target-size search (pure, no browser)

The wedge feature. Built and proven first, in Node, before any UI exists.

```
Read docs/06-contracts.md §3.1 in full.

Implement src/core/target-size.ts exactly to the specified signature, following
the reference algorithm. Also implement:
- src/core/detect.ts (magic-byte table from docs/06 §3.2)
- src/core/resize.ts (computeTargetDimensions, planDownscaleSteps)
- src/core/guards.ts (assessMemoryRisk)
- src/core/errors.ts (JobError factory, all codes from docs/04 §6)
- src/core/naming.ts (output filename generation with collision handling)

Then write tests/unit covering:
- searchForTargetSize against synthetic encoders: perfectly monotonic, noisy
  monotonic, step-function, and pathological non-monotonic. Assert invariants
  I-1 through I-8 from docs/06 §3.1 hold in EVERY case. Note the Step 0
  easy-case probe — an oversized target must resolve in ONE pass, not eight.
- A property test with 500 randomized encoder curves × randomized targets.
- detectFormat against byte fixtures for all 11 formats, plus truncated input,
  zero-byte input, and files whose extension contradicts their magic bytes.
- planDownscaleSteps: no step exceeds 2x reduction per axis.
- assessMemoryRisk at 2/4/8/16 GB × 1/12/50/100 megapixels.

These tests must run in a plain Node environment. If any of them needs jsdom
or a browser API, a layer boundary has been violated — fix the code, not the test.
```

**Acceptance:** `npx vitest run tests/unit` passes in Node with no jsdom · ≥ 95% line coverage on `src/core/` · the 500-case property test shows zero I-1 violations (never overshoots the target) and zero I-2 violations (never exceeds maxPasses) · `eslint-plugin-boundaries` reports no violations from `core/`.

---

## Milestone 3 — Worker pipeline with canvas engines only

```
Read docs/06-contracts.md §1 and §2, and docs/04-architecture.md §3-4.

Implement:
- src/engines/types.ts (Decoder/Encoder interfaces)
- src/engines/canvas/decoder.ts (createImageBitmap; JPEG/PNG/WebP/GIF/BMP)
- src/engines/canvas/encoder.ts (OffscreenCanvas.convertToBlob; JPEG/PNG/WebP,
  feature-detect AVIF)
- src/engines/registry.ts — resolveEncoder AND resolveDecoder, both pure and
  synchronous, following the two resolution tables in docs/06 §1
- src/core/capabilities.ts (DeviceProfile + CodecSupport detection)
- src/workers/protocol.ts (exact types from docs/06 §2)
- src/workers/pipeline.ts (the flowchart in docs/04 §3)
- src/workers/image.worker.ts (Comlink.expose)
- src/workers/pool.ts (main-thread pool; worker count from DeviceProfile per
  docs/04 §4)

Requirements:
- ArrayBuffers are TRANSFERRED to workers, never cloned.
- Every ImageBitmap is closed in a finally block.
- Progress callbacks wrapped in Comlink.proxy().
- Cancellation is checked before every encode pass.
- A worker that throws twice consecutively is terminated and replaced.

Write tests/integration (vitest browser mode) that round-trips a real 4 MP JPEG
through the full pipeline in both quality mode and target-size mode.
```

**Acceptance:** integration tests pass in a real browser · after `pool.process()`, the source `ArrayBuffer.byteLength === 0` (proving transfer, not clone) · main thread never blocks >50 ms during a 4 MP conversion (measure with the Long Tasks API) · a 10-file batch completes with no memory growth between runs · cancelling mid-batch stops within one pass.

---

## Milestone 4 — Tool UI island

```
Read docs/08-design-system.md §3-5 and docs/03-feature-map.md.

Implement the Zustand store (src/state/*) per docs/05 §4, including
src/state/queue.ts — the QueueController that owns scheduling, concurrency
(from DeviceProfile), retry, and cancellation. This is feature M-10 and it is
the piece that makes batching work; do not fold it into a component.

Also implement toJobResult() in src/state/jobs.slice.ts exactly as specified in
docs/05 §1 — it is the ONLY place SerializableResult becomes JobResult.

Then build the React island tree: ToolShell, Dropzone, ConfigPanel, FormatSelect,
ModeToggle, QualityControl, TargetSizeControl, ResizeControl, MetadataToggle,
PresetPicker, PrivacyIndicator, FileGrid, FileCard, ProgressBar, BatchSummary,
ResultActions, ErrorCard, DiagnosticsPanel (dev-only), and the primitives.

Match the wireframes in docs/08 §4: three-pane on lg+, step flow below md.

Requirements:
- ToolShell is the ONLY client:visible component on the page.
- Dropzone supports drag-drop, folder drop (webkitGetAsEntry), click-to-browse,
  and clipboard paste.
- Route slug preconfigures the store. Only /convert/heic-to-jpg exists at this
  point, so wire and test that path; the size-preset routes land in Milestone 6
  and must plug into the same mechanism with no changes here.
- E_TARGET_UNREACHABLE renders as a RESULT with a warning badge and an
  "Allow resizing to reach target" action — never as a failed file. See
  docs/04 §6 and docs/05 §4 invariant 5.
- FileCard has fixed dimensions in every state — the grid must not reflow as
  jobs complete.
- Progress shows the real pass number during target search ("pass 4/8 · 112 KB"),
  never a fake bar.
- Every JobError renders its specific message plus a next action. No generic
  "something went wrong" anywhere.
- All numeric readouts use tabular-nums monospace.
- Revoke every object URL on unmount.

Implement src/platform/deliver.ts: single download, streaming ZIP via client-zip,
and save-in-place via File System Access API where available (feature-detected —
it's Chrome-desktop only, ~28% global).
```

**Acceptance:** full flow works end to end for HEIC-less formats · a 20-file batch completes with visible per-file progress · one deliberately corrupt file fails without aborting the batch · ZIP download of 20 files never spikes memory above ~150 MB · baseline JS still under 60 KB gz (`npm run check:budgets`) · mobile step flow usable at 390px.

---

## Milestone 5 — WASM codecs (lazy)

```
Read docs/04-architecture.md ADR-004 and docs/07-folder-structure.md §3.

Implement src/engines/wasm/loader.ts — lazy fetch, instantiate, cache per worker,
with a timeout and a clear E_CODEC_LOAD_FAILED path.

Also implement src/engines/svg.ts — SVG rasterization via Image + canvas draw
at a chosen raster size (feature M-17). No WASM required; needed for the three
SVG routes, one of which (svg-to-png) is a Wave 1 star route.

Then the WASM adapters, each conforming to the Decoder/Encoder interfaces:
- heif.ts   (libheif-js)  — HEIC/HEIF decode. HIGHEST PRIORITY.
- mozjpeg.ts (@jsquash/jpeg) — best-quality JPEG encode
- oxipng.ts  (@jsquash/oxipng) — lossless PNG optimise
- avif.ts    (@jsquash/avif)
- jxl.ts     (@jsquash/jxl)
- tiff.ts    (utif2)

Wire them into registry.ts per the resolution table in docs/06 §1.

CRITICAL: a user converting JPEG→WebP must download ZERO WASM. Verify this in
the network waterfall. WASM loads only when the format actually requires it.

Add src/core/metadata.ts + the exifr-based MetadataPanel: show EXIF/GPS presence
BEFORE processing. This doubles as the privacy demonstration.
```

**Acceptance:** HEIC files from a real iPhone convert correctly, orientation applied · JPEG→WebP downloads zero WASM (verify in DevTools) · HEIC→JPG downloads only libheif · codec load failure produces `E_CODEC_LOAD_FAILED` with a retry, never a blank screen · metadata panel correctly flags GPS-tagged photos · each codec stays under 1.2 MB.

---

## Milestone 6 — Content scale-out

```
Read docs/09-seo-content-plan.md §2-3.

Build all of publishing Wave 1 — 21 routes total, exactly as listed in
docs/09 §6.

Content data (src/content/formats.ts, src/content/presets.ts):
- The remaining 6 star pair routes (heic-to-jpg already exists from M1):
  webp-to-jpg, webp-to-png, png-to-jpg, png-to-webp, jpg-to-webp, svg-to-png
- 6 JPG size routes: 20kb, 50kb, 100kb, 200kb, 500kb, 1mb

Each pair route needs 400+ words of genuinely pair-specific copy, the five-row
comparison table, and 4+ pair-specific FAQs. Use the anti-pattern table in
docs/09 §3 as the bar. If you cannot write 400 non-generic words about a pair,
tell me and we drop that route rather than shipping filler.

Pages: src/pages/compress/[preset].astro, /, /404, /convert/index, /compress,
/resize, /metadata, /privacy, /about, and sitemap.xml.ts.

Also build the templates (but not the content) for /resize/[preset].astro and
/formats/[format].astro — Waves 2-4 are pure data additions and must require
no further code.

Write /how-it-works — the trust page. Include: step-by-step instructions for
verifying zero uploads in the DevTools Network tab, a plain-English explanation
of the architecture, and an honest list of what this tool cannot do.

Add public/robots.txt exactly as specified in docs/09 §5.
```

**Acceptance:** all 21 Wave 1 routes build to static HTML · every route's full content is present in raw HTML with JS disabled · no two routes share more than 20% of their prose (check with a similarity script) · sitemap lists every route · Lighthouse ≥ 95 on all four categories, with SEO and Accessibility at 100, on a sample of 5 routes · adding a Wave 2 entry to `formats.ts` produces a working route with zero code changes.

---

## Milestone 7 — ⭐ Verification gate

Nothing ships until this milestone passes. The privacy test in particular is the product's core claim expressed as code.

```
Read docs/02-prd.md §7 and docs/06-contracts.md §5.

Write tests/e2e/privacy.spec.ts:
- Intercept ALL network traffic with Playwright's route handler.
- Load a tool page, add 5 images, run a full conversion, download results.
- ASSERT: zero requests with a non-empty request body — ever, no exceptions.
- ASSERT: zero requests of ANY kind while a job is in flight.
- ASSERT: every request origin is in an explicit allowlist. For v1.0 the
  allowlist is `self` ONLY — all WASM codecs are bundled same-origin per
  docs/04 §1. Cloudflare Insights joins the allowlist in Milestone 8 and our
  R2 bucket in Phase 3; both are additions to the list, never to the
  non-empty-body or in-flight rules.
- This test failing is a release blocker, always.

Write tests/e2e/target-size.spec.ts:
- 20 real sample photos spanning 1-20 MP × targets 20/50/100 KB = 60 runs.
  (The 500-case property test in Milestone 2 provides the breadth; this
  provides the realism. Both are required — see docs/03 §6.)
- ASSERT: 100% of outputs are at or under target.
- ASSERT: p95 passes <= 8.
- ASSERT: zero silent failures — every non-met target produces
  E_TARGET_UNREACHABLE with a best-effort result attached.

Write tests/e2e/convert.spec.ts (happy path: land on a route, drop a file,
convert, download — asserted per supported format pair in Wave 1).

Write tests/e2e/batch.spec.ts (50 files, one corrupt, one oversized — batch
completes, 48 succeed, 2 flagged with specific errors and retry available).

Write tests/e2e/a11y.spec.ts (@axe-core/playwright on every route type, zero
violations; plus a full keyboard-only conversion flow).

Write tests/perf/benchmark.ts recording time-to-first-result and peak memory
across device profiles.

Wire all of it into CI. check:budgets must fail the build if exceeded.
```

**Acceptance:** all five suites green · privacy test genuinely fails if you add a `fetch('/upload', {body})` to the pipeline (verify by temporarily adding one) · a11y zero violations across all route types · time-to-first-result under 3 s for a 4 MP JPEG on a mid-range laptop · peak memory under 400 MB for a 12 MP image.

---

## Milestone 8 — PWA, persistence, polish

```
Read docs/05-data-models.md §2-3 and docs/03-feature-map.md (SHOULD items).

Implement:
- src/platform/db.ts — Dexie schema exactly as specified. Settings and presets
  ONLY. Never user images.
- src/platform/opfs.ts — session blob store, worker-side FileSystemSyncAccessHandle,
  feature-detected (Safari private browsing has no OPFS), purged on unload and
  for sessions older than 24h.
- public/sw.ts — service worker: precache the app shell, cache WASM codecs on
  first use. Full offline capability after first visit.
- manifest.webmanifest + install prompt, triggered ONLY after a successful
  conversion, never before.
- CompareView modal: original vs output, draggable divider, zoom.
- Preset save/load with JSON export/import (Safari's 7-day ITP eviction means
  IndexedDB is not durable — export is the real durability story).
- Cloudflare Web Analytics — pageview beacons only, loaded AFTER the tool
  island mounts, and hard-blocked while any job is in flight. Add its origin
  to the privacy-test allowlist in the same commit, and re-run that test.
- Deploy config for Cloudflare Pages, domain noupload.app.
```

**Acceptance:** app fully functional offline after first visit (test with DevTools offline mode) · install prompt appears only post-conversion · settings survive reload · preset export/import round-trips · deployed to Cloudflare Pages with all routes reachable · still zero outbound data requests (re-run the privacy test against production).

---

## Phase 3+ (post-v1, separate planning)

| Milestone | Content | Key risk |
|---|---|---|
| **9** — Background removal | RMBG-1.4 via `@huggingface/transformers` 4.x, WebGPU fast path (~83.6% global) with WASM fallback. Model served from **our own R2 bucket** — not Cloudflare Pages, which caps single assets at 25 MiB, and not a third-party CDN, which would widen the privacy allowlist. | 40–180 MB one-time download. Needs a genuinely good loading UX or it kills the session. |
| **10** — ID/passport photo | MediaPipe face detection + per-country crop specs + print-sheet layout. First paid feature. | Country spec accuracy — get them wrong and people's applications get rejected. |
| **11** — Monetization | Ed25519 offline license keys (docs/06 §4), Polar or Paddle as merchant of record, static `revoked.json`. | Client-side verification is bypassable by design. Budget ~15–30% leakage. |
| **12** — Localization | Hindi, Indonesian, Portuguese — follows the audience geography. | Route structure must accommodate locale prefixes; plan before Wave 3 SEO. |

---

## Standing rules for every milestone

1. **Never invent a backend.** If a task appears to need a server, stop and ask.
2. **Never break a contract in `06-contracts.md`** without updating that document in the same commit.
3. **Never let a batch abort on one file's failure.**
4. **Never ship a generic error message.** Every failure maps to a code in `04-architecture.md` §6.
5. **Run `npm run check:budgets` before declaring a milestone done.** Bundle creep is silent and cumulative.
6. **New format support means a new adapter in `src/engines/`** — never a conditional branch inside the pipeline.
7. **If `src/core/` needs a browser API, the design is wrong.** Fix the design.
