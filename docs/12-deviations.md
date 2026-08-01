# 12 — Deviations Log

Every decision taken during implementation that **departs from, amends, or resolves
an ambiguity in** the blueprint set (docs 00–11), with the reason and the evidence.

Read this as the diff between "what the plan said" and "what was built, and why".

**Severity key**

| | Meaning |
|---|---|
| 🔴 | Changes a documented contract or an architectural non-negotiable. Review this. |
| 🟠 | Resolves a genuine conflict *between* two docs, or a spec that could not work as written. |
| 🟡 | Fills a gap the docs left open, or adds tooling the docs implied but did not list. |

Where a deviation amended a blueprint doc, that doc was updated in the same commit
(standing rule 2 in `10-build-plan.md`).

---

## 🔴 D-01 — Preact/compat replaces React 19 as the island runtime

**Docs affected:** `07 §3` (dependency table, amended), `04 §5` (new ADR-007)
**Milestone:** 0

`07 §3` mandates `react`/`react-dom` ^19. `04 §7` mandates a 60 KB gz baseline
island budget. Measured on the real build, these could not both hold:

| Runtime | gzip -9 |
|---|---|
| React 19 + react-dom, runtime only, zero app code | **59.45 KB** |
| Preact/compat + hooks + signals + zustand + a hooked component | **16.3 KB** |

React alone consumed 99% of the budget before a single component existed.
Milestone 4 then added ~20 components, the store and Comlink on top.

`compat` means islands are still **authored as React** — `import { useState } from
'react'` resolves to `preact/compat` — so the component tree in `08 §3`, the file
list in `07 §1` and the Milestone 4 prompt all remain valid as written.

**Outcome:** the finished island tree measures **26.9 KB gz**, 45% of budget. The
same tree on React 19 would have been ~76 KB and over.

**Consequences accepted:** React-19-only APIs (`use()`, Actions, `useOptimistic`)
are unavailable — the tool UI needs none. Two follow-on hazards are documented in
ADR-007 and both bit during development: see D-13 and D-19.

---

## 🔴 D-02 — Target-size reference algorithm amended (floor probe + proportional scale jump)

**Docs affected:** `06 §3.1` (reference algorithm, amended with a rationale note)
**Milestone:** 2

**The specified algorithm could not hit the product's headline targets.** It
searched each scale from the midpoint and only discovered the scale was hopeless
after the binary search collapsed. Traced on a realistic 12 MP photo (quality 95
≈ 6 MB) against a 100 KB target, it spent **6 of its 8 passes proving scale 1 was
impossible**, got one pass at scale 0.85, and returned `targetMet: false`.

Same for 50 KB and 20 KB — precisely the Form Filer targets in `09 §2.2`, and
precisely the case `04 §3` calls out as "the case most competitors handle badly".
It would have failed the Milestone 7 acceptance outright.

Two changes, within the same signature and the same pass budget:

1. **Floor probe.** Probe `minQuality` first at each scale. By the monotonic
   assumption invariant I-3 already grants, if the floor overshoots then nothing
   at that scale fits — so skip it in one pass instead of six.
2. **Proportional jump.** Encoded size tracks pixel count, which goes as scale²,
   so `sqrt(target / achieved)` estimates the right scale in one hop instead of
   walking down by 0.85. Still bounded above by `scaleStep`, below by `minScale`.

| 12 MP photo → target | before | after |
|---|---|---|
| 100 KB | unmet, 8 passes | **met, 3 passes**, 100.0% of target |
| 50 KB | unmet, 8 passes | **met, 3 passes**, 100.0% of target |
| 20 KB | unmet, 8 passes | **met, 3 passes**, 100.0% of target |

All eight invariants I-1..I-8 still hold, verified by a 500-case property test.

---

## 🔴 D-03 — RESOLVED: SVG rasterises on the main thread (documented exception)

**Docs affected:** `07 §4` non-negotiable 3 — narrow documented exception;
`07 §1` — `src/platform/raster.ts` added to the tree
**Milestone:** 5

Measured in Chromium: **`createImageBitmap` cannot decode an SVG blob at all** —
it rejects with "The source image could not be decoded", on the main thread as
well as inside a worker. (Firefox can; Chromium cannot.) A test asserts this, so
it flips the day that changes.

The portable route is `HTMLImageElement` + `drawImage` — exactly what `07 §1`
prescribes for svg.ts, "Image + canvas, no WASM". But `HTMLImageElement` is a DOM
API, and a Web Worker has no DOM. So following `07 §1` as written necessarily
breaks `07 §4` non-negotiable 3, "All image processing happens inside a Web
Worker".

**Decision: follow `07 §1` and take a narrow exception to `07 §4`.**

Only the vector→pixels step runs on the main thread, and it is a single
`drawImage`. What crosses to the worker is an ordinary raster PNG, so every
expensive stage — the encode, the target-size search, the resize plan — still
happens off the main thread. The spirit of the non-negotiable (never block the
UI with image work) holds; only its letter bends, for one format that has no
other option.

**Where the code lives, and why:**

| Piece | Location | Reason |
|---|---|---|
| Rasteriser (DOM) | `platform/raster.ts` | `state/` may import `platform/` but not `engines/` (`07 §2`), and the queue is the caller |
| Sizing maths (pure) | `core/resize.ts` | Pure string parsing + arithmetic; `platform/` may import `core/`. The boundary rule caught the first attempt to put it in `engines/` |
| Documentation | `engines/svg.ts` | Stays as the place you look for "how does SVG work", re-exporting the maths |

**Verified:** an SVG converts to PNG at 1024px on its longest edge with the
aspect ratio preserved, converts to JPG flattened onto the background colour,
and a malformed SVG fails with `E_CORRUPT_FILE` rather than crashing.

**Unblocks:** `/convert/svg-to-png` (a Wave 1 ★ route) and the two other SVG
routes. They may now set `supported: true` under the `09 §3` hard gate.

**Note:** `svg` is still not a registered *decoder*, because there is no such
thing as a worker-side SVG decoder. Conversion is handled by pre-rasterisation
in the queue instead.

---
## 🟠 D-04 — `--color-text-subtle` fails WCAG AA and cannot carry body text

**Docs affected:** `08 §2.1` (contrast table extended with measured values + a rule)
**Milestone:** 1 — **Claude Design should be told**

`@axe-core/playwright` caught two violations. Measured against every background in
both themes:

| | on `bg` | on `bg-subtle` |
|---|---|---|
| light `#838c99` | 3.40:1 | 3.20:1 |
| dark `#6f7a8a` | 4.44:1 | 4.17:1 |

All below the 4.5:1 that `08 §6` makes a release gate. `08 §2.1`'s contrast
verification table lists `text` and `text-muted` but **omits `text-subtle`
entirely** — it was never checked for text use.

The design handoff explicitly specifies `--color-text-subtle` for the dropzone
constraints line, so this will recur unless Design is informed.

**Resolution:** token values unchanged (they are verbatim from `08 §2` and the
token itself is fine for decorative `aria-hidden` glyphs and large text, both of
which need only 3:1). Body-text usages moved to `--color-text-muted` (5.7:1 /
7.9:1). `08 §2.1` now records the measurements and the rule.

---

## 🟠 D-05 — `core/capabilities.ts` split: policy in core, probing outside

**Docs affected:** resolves a conflict between `07 §1` and ADR-006
**Milestone:** 3

`07 §1` places `capabilities.ts` in `src/core/`, and `04 §2` puts the "capability
matrix" in the pure domain layer. But detecting capabilities requires
`navigator.deviceMemory`, `OffscreenCanvas` and friends — browser globals that
ADR-006 forbids in `core/`.

**Resolution:** `core/capabilities.ts` holds the pure *policy* — the worker-count
table from `04 §4`, the pixel ceilings, the support folding. The actual reading
happens where those globals legally live: `workers/pool.ts` for the device,
`engines/canvas/encoder.ts` for the codec probe.

This is why the whole decision table is unit-testable in plain Node.

---

## 🟠 D-06 — `components/astro/` granted `core/` type access

**Docs affected:** `07 §2` (dependency table, amended)
**Milestone:** 1

`07 §2` grants `components/react/` "core/ (types)" but grants `components/astro/`
only `content/`. `FormatSpecTable.astro` renders a `ComparisonTable` and must name
that type. `05 §1` makes `core/types.ts` the single source of truth and forbids
parallel shapes, so duplicating it would have been the worse fix.

A type is neither React nor stateful — the two things that column forbids — and
the React components already have the identical grant. Table updated.

---

## 🟠 D-07 — `state/` granted `workers/protocol` (types only)

**Docs affected:** `07 §2` (encoded in the ESLint config with a comment)
**Milestone:** 0

`07 §2` grants `state/` access to `workers/pool` specifically. But `05 §1` requires
`toJobResult()` to live in `state/jobs.slice.ts`, and its parameter type
`SerializableResult` is declared in `workers/protocol.ts` per `06 §2`.

The ESLint boundary config breaks `pool.ts` and `protocol.ts` out as their own
element types so the grant stays exactly this narrow rather than opening the whole
workers layer.

---

## 🟠 D-08 — Delivery moved from components into store actions

**Docs affected:** none — this *restores* `04 §2`
**Milestone:** 4

Components initially imported `platform/deliver` directly. The boundary rule
caught it: `07 §2` does not grant `components/react/` access to `platform/`, and
`04 §2`'s layer diagram draws the arrow as **JobStore → deliver**.

`saveResult(jobId)` and `downloadAllResults()` are now store actions. Components
stay "dumb, props-only" as `04 §2` describes them. `platform/clipboard` is
re-exported through `state/queue` for the same reason.

---

## 🟠 D-09 — `CodecSupport` is the single authority on canvas capability

**Docs affected:** clarifies `06 §1`
**Milestone:** 3

The canvas adapters kept their own static format lists while `CodecSupport`
carried the same fact. The two could disagree — and did, causing the registry to
throw for formats the support matrix said were fine.

`06 §1` frames the `auto` rule as `support.nativeEncode[format]`, so the matrix is
now the sole authority for resolution. The adapters' own lists are synced from it
at `configure()` time so `canHandle()` can never contradict what resolution just
decided.

---

## 🟠 D-10 — An empty codec probe is treated as probe failure, not as truth

**Docs affected:** none — a robustness rule the docs did not anticipate
**Milestone:** 3

`probeNativeEncodeFormats` created an `OffscreenCanvas` without ever obtaining a
2d context. `convertToBlob` on such a canvas yields nothing, which read as "this
browser encodes no formats" — so `CodecSupport` came back empty and **every
conversion failed with `E_ENCODE_FAILED`.**

Two fixes: the probe now gets a context, and `withEncodeBaseline()` in `core/`
treats an empty result as probe failure and falls back to the universally
supported JPEG/PNG/WebP baseline. That policy lives in `core/` specifically so it
is unit-tested; there is a named regression guard for it.

---

## 🟡 D-11 — `TargetSearchOptions` widened so its documented defaults are reachable

**Docs affected:** `06 §3.1` (interface, amended)
**Milestone:** 2

`06 §3.1` annotates a default for every option but declares them all required,
which makes those defaults unreachable. Every field except `targetBytes` is now
optional, with `DEFAULT_TARGET_SEARCH_OPTIONS` exported. This is a pure widening —
a caller passing the full object still type-checks.

---

## 🟡 D-12 — `searchForTargetSize` rejects on abort rather than returning

**Docs affected:** clarifies invariant I-5
**Milestone:** 2

I-5 says "never throw", but that is scoped to the *unreachable target* case, which
genuinely never throws. Cancellation is a different outcome: it has no code in the
`04 §6` taxonomy because it is not a failure, and rejecting is the only way the
pipeline can distinguish "cancelled" from "finished". The pool maps the rejection
to `status: 'cancelled'`, never to an error card.

---

## 🟡 D-13 — Vite externalises SSR deps, defeating the Preact alias

**Docs affected:** recorded as an ADR-007 consequence
**Milestone:** 0

`zustand` imports React internally. Vite externalises `node_modules` during the
prerender pass, so Node resolved it directly and bypassed the compat alias — the
build died on "Cannot find package 'react'". Fixed with explicit `resolve.alias`
plus `ssr.noExternal: ['zustand']`.

**Standing hazard:** any future React-coupled dependency must be added to
`ssr.noExternal`. Written into CLAUDE.md.

---

## 🟡 D-14 — `@astrojs/preact` must be pinned to Astro's major

**Docs affected:** `07 §3` note
**Milestone:** 0

`@astrojs/preact` v6 needs Vite 8 and v5 needs Vite 7, but Astro 5 ships Vite 6.
Installing `@latest` breaks the build with an opaque unresolved
`astro:preact:opts`. The correct line for Astro 5 is `^4` — the same major as the
`@astrojs/react@^4` the docs originally specified.

---

## 🟡 D-15 — `check-budgets.mjs` separates hydration cost from lazy chunks

**Docs affected:** implements `04 §7` more precisely
**Milestone:** 4

The script initially charged **everything reachable** to the baseline, including
the image worker and dynamically imported chunks. Neither is hydration cost: the
worker is fetched when the first conversion starts, client-zip only when someone
downloads a ZIP. Counting them would have pushed optimisation at the wrong target.

The 60 KB budget now applies to the **static** module graph. Lazy chunks are
reported separately so they still cannot grow unwatched.

It also had a genuine bug in the opposite direction — see D-16.

---

## 🟡 D-16 — Astro islands are not `<script src>`, and the budget script missed them

**Docs affected:** none — a defect in our own tooling
**Milestone:** 4

`client:visible` emits `<astro-island component-url="…" renderer-url="…">` plus a
minified inline bootstrap, not a `<script src>`. The budget script only looked at
script tags, so it reported **1.5 KB for a page shipping an entire UI framework**.

Caught because the number was implausibly small. Fixed to follow the island
attributes; it now reports the real figure.

---

## 🟡 D-17 — `sharp` is present as an Astro optional dependency

**Docs affected:** `07 §3` forbids `sharp`
**Milestone:** 0

npm installs `sharp` as an **optional transitive dependency of astro itself**, for
the default build-time `astro:assets` image service. It is never bundled and ships
zero bytes to the browser, so its presence is not a violation of the intent
("native bindings; no browser equivalent — use canvas").

ESLint's `no-restricted-imports` blocks our code from importing it, and
`image: { service: passthroughImageService() }` removes any possibility of a build
step depending on it.

---

## 🟡 D-18 — Tooling added beyond the `07 §3` dev list

**Milestone:** 0, 3

`@types/node`, `eslint-plugin-astro` + `astro-eslint-parser` (without which the
boundary rules silently lint **zero** `.astro` files), `eslint-plugin-jsx-a11y`
(`08 §6` makes a11y a release gate), `@vitest/coverage-v8` (Milestone 2 requires a
coverage figure), `@vitest/browser-playwright` (Vitest 4 changed the provider to a
factory), `prettier-plugin-astro`, `libheif-js`, `utif2`.

Vitest is on **4.x**; the docs did not pin a version.

---

## 🟡 D-19 — The Preact alias existed twice and drifted

**Milestone:** 4

`astro.config.mjs` and `vitest.config.ts` each had their own copy. They diverged,
and the symptom was an opaque "Could not resolve react imported by zustand" in
browser tests only. Now one exported `PREACT_ALIAS` constant that both import.

Also: with Vitest `projects`, root-level `resolve`/`optimizeDeps` do **not**
propagate — they must be set on the project.

---

## 🟡 D-20 — Browser tests are a vitest *project*, not a second config file

**Docs affected:** keeps `07 §1` exact
**Milestone:** 3

`07 §1`'s tree lists `vitest.config.ts` and nothing else. Browser mode is
configured as a second project inside that one file rather than adding
`vitest.browser.config.ts`. `npm test` runs only the `unit` project so the fast
gate stays fast; `npm run test:integration` runs the browser suite.

---

## 🟡 D-21 — "Allow resizing to reach target" implemented as a resize override

**Docs affected:** implements `08 §5`
**Milestone:** 4

The search already downscales to `minScale`, so "allow resizing" has to mean
shrinking the image itself. The action sets a real per-file `resize:
{ kind: 'maxDimension' }` override at 60% of the longest edge and re-runs — using
existing `JobConfig` fields, so no contract change was needed.

---

## 🟡 D-22 — libheif is loaded via its Emscripten glue directly

**Milestone:** 5

The package's own `libheif-js/wasm` entry reads the binary with Node's `fs` and is
unusable in a browser. The adapter imports `libheif-wasm/libheif.js` directly and
hands it a `?url` asset, which makes Vite emit `libheif.wasm` as a **same-origin**
asset — required by `04 §1`, and what makes the Milestone 7 privacy allowlist
assertable.

The 1.46 MB inlined-wasm bundle variant was rejected: it would breach the 1.2 MB
per-codec budget. The separate `.wasm` is **0.99 MB**, and JPEG→WebP downloads
**zero** WASM (measured).

---

## 🟡 D-23 — `exifr` is called with `true` rather than granular block flags

**Milestone:** 5

exifr's `.d.ts` types the per-block options as `FormatOptions`, not `boolean`, so
`{ ifd0: true, exif: true, gps: true }` does not compile despite being valid at
runtime. `exifr.parse(bytes, true)` (parse everything) is used instead — slightly
heavier, correct, and typed.

---

## 🟡 D-24 — Components built but not yet wired

**Milestone:** 4

`MetadataPanel.tsx` (its data source lands with the metadata inspector) and
`CompareView.tsx` (Milestone 8) exist with fixed prop contracts but are not
imported by `ToolShell`, deliberately — importing them would add weight to the
hydration baseline before they do anything.

The desktop layout is currently **two panes** (settings + files) rather than the
three-pane settings/files/preview in `08 §4.2`; the preview pane arrives with
`CompareView` in Milestone 8.

---

## 🟠 D-25 — The in-flight privacy rule excludes `blob:` and `data:` URLs

**Docs affected:** clarifies `06 §5` assertion (b)
**Milestone:** 7

`06 §5` (b) says "zero requests of **any** kind while a job is in flight". Taken
literally the test failed, because the FileCard thumbnails resolve `blob:` URLs
while the batch runs.

A `blob:` URL is a handle into the document's own memory — it is how the card
shows the user their own thumbnail. It **cannot reach the network by
construction**: there is no origin to send it to and no socket involved.
Playwright surfaces it through the same resource pipeline as a real fetch, which
is the only reason it appeared.

`blob:` and `data:` are therefore excluded from assertion (b), with the reasoning
written at the assertion. Everything that could actually carry bytes off the
device is still asserted to be zero, and (a) — zero bodies — is applied to the
in-flight window **including** blob URLs.

**This is a narrowing of one assertion's scope, not of the guarantee.** Verified
by falsification: injecting `fetch('/upload', { body })` into the pipeline turns
3 of the 4 privacy tests red.

---

## 🔴 D-26 — Files could be added but never converted (found by the e2e suite)

**Docs affected:** none — a defect in our Milestone 4 implementation
**Milestone:** 4, fixed during 7

Jobs were only created when Convert was pressed, but the file grid and the
Convert button both derive from the **job** list. So after dropping files the UI
showed "Files (0)" and **the Convert button never rendered at all** — the app was
unusable end to end.

Every unit and integration test passed throughout: they drove `QueueController`
directly and never went through the button. Only the Milestone 7 browser flow
caught it.

**Fix:** `ToolShell` creates a job the moment a file is added, so cards render in
their `queued` state as `08 §5` describes and the Convert button appears.
`QueueController.start()` now reuses an already-queued job for a source rather
than creating a second one.

---

## 🟠 D-27 — Unicode escapes were rendering as literal text in the UI

**Docs affected:** none — a defect in our own code generation
**Milestone:** 4, fixed during 7

Components were written through a generator, and `·` sequences survived into
the source as literal backslash-u text. The rendered UI read
`0 done · 0 running` instead of `0 done · 0 running`. 26 occurrences across
8 components, now real characters.

Caught by reading the Playwright page snapshot, not by any assertion — worth a
visual-regression check later.

---

## 🔴 D-28 — `passesUsed` could report 9 against a `maxPasses` of 8

**Docs affected:** none — a defect against invariant I-2 in `06 §3.1`
**Milestone:** 3, found and fixed during 7

After the target search returned, the pipeline re-encoded at the winning
(quality, scale) pair to rebuild its blob — and counted that as a pass. So a
search that legitimately used all 8 passes reported **`passesUsed: 9`**, which
the UI would have rendered as "pass 9/8".

The unit suite could not catch it: `searchForTargetSize` itself never exceeded
8, and the extra encode happened in the pipeline above it. Only the Milestone 7
realism suite, running real photos through the whole stack, surfaced it.

**Fix:** the pipeline now caches the blobs a search could return — every result
at or under target, plus the single smallest seen for the I-5 unreachable case —
and reuses the winner instead of re-encoding it. That removes an entire encode
pass from every target-size conversion as well as correcting the number.

The cache is bounded on purpose: under-target blobs are by definition smaller
than the target, and at most one over-target blob is ever retained. Caching every
pass would have held the `maxQuality` probe, which can be several megabytes.

**Verified:** 24 runs across 2 real photos × 1/3/8/12 MP × 20/50/100 KB —
22 met, 2 unreachable (12 MP → 20 KB, below `minScale`, correctly soft-failed
with a best-effort file), **p95 = 8 passes, max = 8**.

---

## 🟡 D-29 — The provided fixtures are JPEGs named `.png`, not HEIC

**Milestone:** 5 / 7

`tests/fixtures/images/` now holds two real files. They are **JPEG content with a
`.png` extension** (magic bytes `ff d8 ff e0`), 1170×2532, ~200 KB, 10 EXIF tags,
no GPS.

They are excellent for three things and are now used for all of them: real-world
**extension-vs-magic-bytes** detection (exactly the case `06 §3.2` exists to
defeat), real EXIF parsing, and the Milestone 7 target-size realism matrix.

**They do not close the HEIC gap.** The libheif path is wired, size-checked
(0.99 MB) and proven to load lazily, but has still never decoded an actual HEIC.
A real iPhone `.HEIC`, and one GPS-tagged photo, are the two fixtures still
missing.

---

## 🔴 D-30 — EXIF orientation was silently ignored on every real photo

**Docs affected:** none — a defect against the `10 M5` acceptance ("orientation applied")
**Milestone:** 5, found by the first real camera fixture

`exifr` **translates enum values to human-readable strings by default**, so
`Orientation` arrives as `'Rotate 90 CW'`, not `6`. `normaliseOrientation` did
`Number(value)`, got `NaN`, and fell through to its "treat unknown as upright"
branch — returning **1 for every real photo ever taken**.

The guard clause written to be defensive was what hid the bug. Every synthetic
fixture in the suite passed, because a canvas-generated JPEG has no orientation
tag to mis-read; there was nothing to get wrong until a real camera file arrived.

The visible consequence would have been HEIC conversions coming out sideways —
the libheif path applies orientation explicitly from this value, since libheif
returns raw pixels with no rotation baked in.

**Fix:** `normaliseOrientation` now accepts both forms, mapping all eight exifr
labels as well as the numeric values. Covered by a named regression guard in
`tests/integration/orientation.test.ts`.

---

## 🟠 D-31 — Real-world files have EXIF that contradicts their pixels

**Milestone:** 5 / 7

`IMG_4650.jpeg` reports `Orientation = 6` and `ExifImageWidth = 4032`, but its
**actual stored pixels are 3024x4032 — already portrait**. Windows re-encoded it
during the phone transfer, applied the rotation, and left the original tag
behind. Chrome trusts the JPEG's own record and decodes it upright; exifr
faithfully reports the stale tag.

Nothing here is broken — but it means **`ImageMetadata.orientation` cannot be
assumed to describe the pixels a decoder will hand back.** Any future code that
rotates based on that value (the libheif path does) must apply it only where the
decoder is known NOT to have done so already.

The test asserts self-consistency between reported and actual output dimensions
rather than a hardcoded expectation, so it stays true for both kinds of file.

---

## 🟡 D-32 — Phone-to-PC transfer strips the metadata we most wanted to test

**Milestone:** 5 / 7 — **still blocking one acceptance criterion**

Four real fixtures are now in place, and **none carries GPS**, despite location
services being enabled on the device. All four show the same signature: JFIF
header, no `Make`/`Model`, no `DateTimeOriginal`, no GPS block.

That is iPhone's default **"Automatic"** transfer setting, which converts HEIC to
JPEG on the way across and drops identifying metadata. It is also why no `.HEIC`
has reached the repo.

**To get the two missing fixtures:** set iPhone → Settings → Photos → *Transfer to
Mac or PC* → **Keep Originals**, then copy from `Internal Storage\DCIM`. Files
copied that way stay HEIC and retain GPS.

**Still unverified without them:** an actual libheif decode (the path is wired,
size-checked at 0.99 MB and proven to load lazily, but has never decoded a real
HEIC), and the "correctly flags GPS-tagged photos" acceptance.

---

## 🔴 D-33 — Metadata is now read once on the main thread and passed to the worker

**Docs affected:** `06 §2` — `ProcessRequest` gains optional `sourceMetadata`;
`06 §1` — `DecodeInput` gains optional `orientation`
**Milestone:** 5

`10 M5` requires showing EXIF/GPS presence **before** processing, so the main
thread has to parse it anyway. Parsing again inside the worker was wasteful, and
`SourceImage.metadata` was being left `null` — a documented field that nothing
populated.

`ingestFiles` now extracts metadata once at ingest and it rides along on the
request. Both additions are optional fields, so every existing caller still
type-checks.

**Verified working at ingest:** orientation 6, GPS true, 81 tags on a real HEIC.

---

## 🔴 D-34 — FIXED: HEIC converted landscape because it was rotated TWICE

**Docs affected:** `06 §1` — the `Decoder` interface gains `appliesOrientation`
**Milestone:** 5 — found and fixed with the real iPhone fixtures

A portrait iPhone HEIC converted to a **landscape** JPEG: 4032x3024 instead of
3024x4032. Every portrait phone photo would have come out sideways.

**My first diagnosis was wrong**, which is worth recording because the wrong fix
looked entirely reasonable. I assumed libheif returned unrotated pixels and that
the orientation was failing to cross the Comlink boundary, so I plumbed the
metadata through to the worker (D-33). The symptom did not move.

Instrumenting the worker showed everything was already arriving correctly:

```
hasMeta=true  orientation=6  decoder=libheif  dims=3024x4032
```

The decoded bitmap was **already portrait**. libheif honours the HEIF
container’s own `irot` / `imir` transform properties, so `image.display()`
hands back display-ready pixels. The pipeline then applied EXIF orientation 6 on
top of that, rotating a correct image a second time.

**The bug was not a missing rotation. It was an extra one.**

**Fix:** whether a decoder self-orients is now DECLARED on the `Decoder`
interface as `appliesOrientation`, instead of being inferred from its id. Both
registered decoders set it true — canvas via
`imageOrientation: 'from-image'`, libheif via the container transform — so the
pipeline’s rotation path currently never runs. It stays for future adapters that
do hand back raw pixels, such as utif for TIFF.

Guessing per-decoder is exactly what caused this, so it is now part of the
contract rather than a branch on `decoderUsed === 'canvas'`.

**Verified:** a real portrait iPhone HEIC now converts to a 3024x4032 portrait
JPG, with GPS and camera tags stripped, hitting an exact 100 KB target in ≤ 8
passes. The `it.fails` marker is gone and the assertion is strict again.

**D-33 keeps its value regardless:** `SourceImage.metadata` was a documented
field that nothing populated, and `10 M5` requires showing GPS presence before
processing. That parse now happens once, at ingest.

---
## 🟡 D-35 — Worker-fetched assets are invisible to the main thread's resource timeline

**Milestone:** 5

A test asserting "HEIC→JPG downloads libheif" via
`performance.getEntriesByType('resource')` fails even though the codec loads:
the fetch happens **inside the worker**, and the main thread's resource timeline
does not see it. That was a flaw in the measurement, not the product.

The inverse assertion — JPEG→WebP downloads **zero** WASM — remains valid and
passing, because it asserts an *absence* on the main thread while nothing else
is fetching. Proving the positive needs `PerformanceObserver` inside the worker,
or the built-`dist` network capture the Playwright privacy suite already does.

---

## ⚠️ Privacy note on the test fixtures

`tests/fixtures/images/` now contains four real photos from the owner's device,
two of them HEIC **carrying real GPS coordinates**, camera model and capture
timestamps.

They are genuinely valuable as fixtures — they caught D-30 and D-34, neither of
which any synthetic file could have surfaced. But committing them publishes a
location. Before this repo goes anywhere public, either scrub the GPS from the
fixtures, add `tests/fixtures/images/*.HEIC` to `.gitignore` with a documented
local-fixture step, or replace them with photos taken somewhere neutral.

Flagged rather than decided, because it is the owner's data.

---

## 🟠 D-36 — Fixture photos are git-ignored; suites skip without them

**Docs affected:** `07 §1` — `tests/integration/fixtures.ts` and a fixtures
README added
**Milestone:** 5 / 7

The fixtures are real camera files carrying **GPS coordinates**, camera model
and capture timestamps. Committing them would publish a location — which is
precisely what this product exists to strip. Keeping them was also not optional:
they caught D-30 and D-34, neither of which any synthetic file could surface.

**Decision:** keep them locally, git-ignore them, and make every suite that
needs them skip cleanly when they are absent.

That required replacing the `?url` fixture imports with runtime `fetch`. A
`?url` import resolves at BUILD time, so a missing fixture would have stopped the
whole suite compiling rather than skipping.

**Verified both ways:** with the photos present, 41 integration tests pass; with
them moved away, 30 pass and 11 skip, and the unit suite goes 227 passed /
6 skipped. A fresh clone runs green.

`tests/fixtures/images/README.md` documents what to drop in and how to get
originals off an iPhone without the default transfer stripping them.

---

## 🟡 D-37 — svg-to-png confirmed for Wave 1

**Milestone:** 6

With D-03 resolved, SVG conversion genuinely works, so `/convert/svg-to-png`
ships in Wave 1 as `09 §6` specifies. All 7 star routes are in scope; none is
blocked by an unsupported engine path any more.

---
## 🔴 D-38 — D-33 quietly doubled the hydration bundle by pulling in exifr

**Milestone:** 6 — caught by `check:budgets`, not by any test

Moving metadata extraction to ingest time (D-33) put `exifr` on the main thread,
and therefore into the island bundle. ToolShell went from 48.5 KB raw to
**126 KB**, and baseline JS from **27.0 KB gz to 53.4 KB** — 89% of the 60 KB
budget in `04 §7`, consumed by a library nothing needs at first paint.

Every test still passed. Only the budget check noticed.

**Fix:** `extractMetadata` now dynamic-imports exifr. It is already async, so
this cost nothing structurally, and EXIF is only needed once a user actually
adds a file. **Baseline back to 28.0 KB gz**; exifr sits in the lazy chunks
alongside the worker and client-zip.

This is the second time the same shape of mistake appeared — a main-thread
convenience quietly becoming a hydration cost. It is exactly what D-15 rebuilt
`check:budgets` to make visible.

---

## 🟠 D-39 — The file input had no accessible name (a11y regression from M4)

**Milestone:** 4, caught in 6

Dropzone’s hidden `<input type="file">` is `sr-only`, which hides it visually
but keeps it in the accessibility tree — so it still needs its own name. axe
reported a "form element has no label" violation on **every tool route**, in
both themes: 26 violations across 22 routes.

It arrived with the island in Milestone 4. The Milestone 1 axe sweep predated
the island, and the runs after M4 covered the raw-HTML and privacy suites but
not the full route sweep, so it sat unnoticed until Wave 1 multiplied the tool
routes and the sweep was re-run.

**Fix:** an `aria-label` naming the source format. **Zero axe violations across
all 22 routes in both themes.**

**Process note:** the full a11y sweep should run on every milestone, not only
when new routes appear. `08 §6` makes it a release gate, and a gate that only
runs sometimes is not a gate.

---

## 🟡 D-40 — Wave 1 content: all 7 star routes and 6 size routes written

**Milestone:** 6

Held to the `09 §3` anti-pattern bar rather than padded to a word count.
Verified mechanically, since "it reads specific" is not a measurement:

| Route | Words |
|---|---|
| heic-to-jpg | 881 |
| webp-to-jpg | 795 |
| svg-to-png | 783 |
| png-to-jpg | 755 |
| jpg-to-webp | 718 |
| webp-to-png | 694 |
| png-to-webp | 687 |

All well past the 400-word minimum. Pairwise prose overlap was measured with
5-word shingles rather than bare word frequency — any two pages about image
formats share words like "quality" and "compression", and a bag-of-words score
would flag honest writing as duplication. Shingles catch reused *phrasing*,
which is what the rule is actually about.

**Highest overlap: 18.4%** (heic-to-jpg / webp-to-jpg), under the 20% ceiling.
Those two are the closest by nature — both are "convert X to JPG" and share the
JPEG-side reasoning — so if a future route pushes past the ceiling, that pair is
where it will happen first.

No route had to be dropped for failing to sustain 400 non-generic words.

---
## 🟠 D-42 — RESOLVED: Windows Smart App Control blocked Playwright’s Chromium

**Milestone:** 7 (a11y sweep) — **environmental, not a code defect**

Partway through the Milestone 6/7 accessibility sweep, every Playwright and
vitest-browser command started failing with `spawn UNKNOWN`. The binary itself
read fine at the OS level; direct execution surfaced the real cause: **Windows
Smart App Control** — a signature/reputation-based OS control, not an
antivirus detection — blocked `chrome-headless-shell.exe` under
`AppData\Local\ms-playwright`. Downloaded Playwright browser binaries are not
independently signed in a way it trusts, and heavy repeated execution during
this session likely triggered the evaluation.

**What this blocks:** every browser-based suite — `test:integration` (41 tests:
HEIC decode, SVG rasterisation, target-size realism, orientation), the
`privacy.spec.ts` e2e gate, and the new `a11y.spec.ts` sweep.

**What still runs, unaffected:** the entire unit suite (233 tests, 100% line
coverage on `src/core/`), the Astro build, lint, `tsc`, the folder-tree check,
all three static budgets, and every static-file content check — none of that
touches a browser.

**What I did NOT do:** attempt to disable, bypass, or route around an OS-level
security control. That is the owner’s decision on their own machine, not an
engineering judgment call. Flagged directly rather than worked around.

**Resolved by the owner** via Windows Security > App & browser control > Smart
App Control, turned Off after confirming no per-file allow option existed in
Protection History for an unsigned binary. I did not touch this setting.

**Re-verified in full immediately after:**

| Suite | Result |
|---|---|
| Integration (browser) | 41/41, unaffected by the M6 content changes |
| Privacy e2e | 4/4, still falsification-verified |
| a11y + SEO structure (NEW, all 22 routes) | **69/69** — zero axe violations, both themes |
| Keyboard-only flows | both pass |

This is the first time the a11y sweep has run against the full Wave 1 content,
and it is clean on the first pass — no repeat of D-39.

---
## 🔴 D-43 — `E_TOO_LARGE` was fully built, fully unit-tested, and never once reachable

**Docs affected:** resolves a real inconsistency between `04 §3` and `04 §6`
**Milestone:** 7 — found while writing the batch e2e test the acceptance requires

`assessMemoryRisk()` and the `E_TOO_LARGE` code were both built at Milestone 2
with full unit coverage. **Neither was ever called by the running pipeline.**
The canvas decoder only ever PRESCALED via `maxPixels` — an oversized image always
silently succeeded at a smaller size. The Milestone 7 batch acceptance ("one
oversized, flagged with a specific error") could not be tested, because the
behaviour it names did not exist.

This also exposed a real inconsistency between two docs: `04 §3`’s flowchart says
exceeding the budget triggers PRESCALE (silent, no error); `04 §6`’s own message for
E_TOO_LARGE reads as an outright rejection — "too large for this device’s
memory. **Try resizing first**," not "we resized it for you." Both cannot be
exactly true of the same threshold.

**Resolution, two tiers:** below the per-device soft budget, behaviour is
unchanged — exactly the `04 §3` flowchart, silent and free. Above the absolute
80 MP figure in `06 §3.4` ("the empirical crash line"), no prescale is attempted
at all — decode is rejected outright with `E_TOO_LARGE`, naming the real dimensions.
That figure was previously gated on `device.isMobile`; a crash line is not a mobile-
only phenomenon, so it is now a universal backstop.

**Verified:** a 90 MP image hard-rejects with the exact dimensions in the
message; a 72 MP image is completely unaffected. Both are now permanent
regression tests in `tests/integration/pipeline.test.ts`.

---

## 🔴 D-44 — `showSaveFilePicker` can hang forever; a try/catch cannot save you from that

**Milestone:** 7 — found by `convert.spec.ts`, a real product reliability bug, not a test artifact

Every star-route download test hung for the full 30 s timeout waiting for a
`download` event that never fired. The Save button genuinely was clicked.
The conversion genuinely succeeded — the resulting page snapshot even confirmed
the D-34 orientation fix was working (3024x4032, correctly portrait).

The cause: `showSaveFilePicker` **exists** in this Chromium build (confirmed directly:
`'showSaveFilePicker' in globalThis` → `true`), so `hasFileSystemAccess()` returned
true and `saveBlob()` took the native-picker branch. Under Playwright’s CDP-driven
automation, no dialog can ever actually appear — and the call does not reject,
it **never settles at all**. The existing `try/catch` around it was correct in intent
but structurally powerless: a promise that never settles never reaches a catch
block, no matter how the catch is written.

This is not only a test problem. "The API is present" was silently treated as
"the API works here," and any other context where a native picker cannot
actually be shown — another automation framework, certain embedded webviews —
would hit the identical silent hang for a real user clicking Save.

**Fix, two layers:**

1. **Primary — detect automation precisely.** Chrome sets `navigator.webdriver`
   `= true` under any CDP/Selenium/Playwright-driven session specifically so pages
   can detect this. `hasFileSystemAccess()` now excludes it, so automated contexts
   take the ordinary anchor-download path immediately — costs a real user
   nothing, and is exact rather than a guess.
2. **Backstop — a generous timeout.** `withTimeout()` (extracted from
   `engines/wasm/loader.ts` into `core/timeout.ts`, since it is browser-agnostic and
   both `engines/` and `platform/` need it) wraps the picker call at 120 seconds.
   Deliberately long: a real person choosing a folder in a real dialog can
   legitimately take a long time, and firing the fallback while they are still
   mid-dialog would show a confusing duplicate download underneath them. This
   catches anything the webdriver check misses, eventually, without
   second-guessing a slow human.

**Verified:** all 7 star-route download tests now pass in 1.8-12s each, no
hangs, real Playwright download events with magic-byte-verified output —
including HEIC (D-34’s orientation fix, proven through the real UI this time,
not just the direct pipeline API) and SVG-to-PNG (D-03’s rasteriser, likewise).

---
## 🔴 D-45 — The `04 §7` memory budget cannot be measured in this app’s own security posture

**Docs affected:** `04 §7` (peak-memory budget — measurability caveat added)
**Milestone:** 7 — a structural consequence of ADR-003, not a test bug

`04 §7` sets "Memory peak, 12 MP image: < 400 MB." The obvious instrument is
`performance.memory.usedJSHeapSize`. It reported a flat **0.0 MB** for every run
no matter what — including while holding a live **200 MB** `Uint8Array` array
that cannot be garbage collected. The API was not failing to catch a peak; it
was not moving AT ALL, on an allocation four times its own would-be budget.

The cause, confirmed directly rather than guessed: this page has
`crossOriginIsolated === false`. Since roughly Chrome 122, `usedJSHeapSize`
is quantized/frozen to resist exactly the Spectre-class cross-origin memory
side-channel that cross-origin isolation exists to close, and it only unlocks
full precision on a page where `crossOriginIsolated` is true.

**This app will never have that.** ADR-003 deliberately does not set
COOP/COEP, specifically to keep OAuth and payment popups working — a real,
already-made, still-correct trade-off. Its side effect, only now surfaced by
M7’s memory-budget requirement, is that the standard browser instrument for
this exact budget cannot report a usable number in this app’s own,
permanent configuration. This is two already-correct decisions (ADR-003, and
the §7 budget) colliding via a measurement mechanism neither anticipated.

**Resolution:** a cheap, real probe — allocate ~100 MB of live typed arrays,
confirm the counter actually moves by more than 20 MB — runs before any byte-
denominated assertion. Confirmed unreliable every run in this configuration,
so the `<400 MB` assertion is skipped with the reason printed, rather than the
earlier version of this benchmark’s **false "0.0 MB, PASS"**, which looked like
a real result and was not one.

Two things are still genuinely verified without that API:
- **Timing is completely unaffected** — `performance.now()` is standard and exact
  regardless of isolation. The 4 MP / 3s (p75) budget is measured for real,
  across all three device-profile tiers, and passes.
- **Survival is checked directly**: a 12 MP image is run through the real
  pipeline and confirmed to complete rather than the worker dying silently.
  That is not "<400 MB," but it is the thing the budget actually protects
  against, checked without depending on a restricted API.

**If a real number is ever required** — before a v2 that revisits ADR-003, or
for a one-off manual profiling pass — Chrome’s DevTools Performance panel or
task-manager-level RSS observation works regardless of isolation; it is a
human-driven measurement, not one this automated suite can take.

---

## 🔴 D-46 — Quality-tier codecs: two of five candidate WASM binaries do not fit the budget, and shipping the other three exposed a real routing bug

**Docs affected:** `05 §1` (`CodecSupport` — new `nativeDecode` field, amended), `07 §1` (adapter list — AVIF/JXL scope narrowed with a rationale note)
**Milestone:** 5

`07 §1` calls for five WASM adapters: mozjpeg, oxipng, AVIF (encode + decode), and
JXL (encode + decode). `04 §7` caps every individual WASM file at 1.2 MB raw.
Measured against real binaries, two of the five candidates do not fit and have
no smaller build available:

| Binary | Raw size | Fits 1.2 MB? |
|---|---|---|
| `mozjpeg_enc.wasm` | ~246 KB | ✅ |
| `squoosh_oxipng_bg.wasm` (single-threaded — the only build ADR-003 permits) | ~164 KB | ✅ |
| `avif_dec.wasm` | ~1.17 MB | ✅ (tight — ~2% headroom) |
| `avif_enc.wasm` | **3.48 MB** | ❌ — 2.9x over |
| `jxl` smallest encoder build | **1.36 MB** | ❌ — 13% over, no smaller build exists |

**Decision:** ship mozjpeg (encode), oxipng (encode), AVIF **decode only**, and
utif2 for TIFF (pure JS, zero WASM, no budget question at all). JXL is skipped
entirely, encode and decode — no currently-planned route decodes *from* JXL
(`09 §2.1` lists it only as a destination column), and native JXL support is
the product's own stated bet for the browsers that matter (see `wasm/jxl.ts`).
AVIF-as-**output** still works wherever the browser encodes it natively —
ADR-004's existing canvas feature-detection already covers that; where neither
canvas nor a registered WASM encoder can produce AVIF, `resolveEncoder` throws
`E_ENCODE_FAILED` honestly, which is correct behaviour here, not a gap.

**A real bug surfaced by registering the decoder.** Adding `libavif` to the
decoders map made `support.decode.avif` fold to `true` on *every* browser
(`decode[f] = nativeDecode.has(f) || wasmDecode.has(f)`), but
`resolveDecoderId`'s existing AVIF branch read that same folded value to choose
between canvas and libavif — so the moment libavif was registered, that branch
would always resolve to `'canvas'`, making the new decoder **permanently
unreachable on exactly the non-native-AVIF-decode browsers it exists for.**

**Fix:** added `nativeDecode: Record<InputFormat, boolean>` to `CodecSupport`,
symmetric with the pre-existing `nativeEncode`, so "canvas specifically can do
this" is distinguishable from "some adapter, native or WASM, can do this."
`resolveDecoderId`'s AVIF branch now reads `nativeDecode.avif`. `05 §1` updated
in the same commit. Locked in with regression tests in `registry.test.ts` and
`capabilities.test.ts` built specifically around a WASM-only-AVIF matrix (the
exact shape that broke).

**A second, live consequence found while verifying the first fix:**
`image.worker.ts`'s real runtime `configure()` method had its own,
independently-hardcoded `nativeDecode`/`wasmDecode` lists that had drifted from
the module's default — `nativeDecode` never probed AVIF at all (always `[]` for
it) and `wasmDecode` still listed only `['heic', 'heif']`, missing the two
decoders this milestone just added. Net effect: `support.nativeDecode.avif` was
unconditionally `false` on every real page load, so the just-fixed AVIF branch
above would *always* pick `libavif` — downloading and running the 1.17 MB WASM
decoder on every single AVIF file, even on the large majority of browsers
(Chrome and Firefox have decoded AVIF natively for years) that decode it for
free. A direct ADR-004 violation, live in production had this shipped as-is.

**Fix:** deduplicated the two format lists into one module-level constant
(`WASM_DECODE_FORMATS`) so they cannot drift apart again structurally, not just
by value, and added a genuine native-AVIF-decode probe —
`probeNativeDecodeFormats()` in `canvas/decoder.ts`, the decode-side sibling of
the existing `probeNativeEncodeFormats()`. Decode has no `capabilities.avif`
flag to query, so the only honest check is "try to decode a real AVIF and see
if it throws" — which needs a real AVIF byte fixture. One was produced **once**
by `@jsquash/avif`'s own encoder (never shipped — the encoder is excluded from
the app entirely per the budget table above; it was used only as a one-time,
build-time fixture generator, the same role `OffscreenCanvas` plays for the
JPEG/PNG fixtures elsewhere in the test suite) and confirmed to decode natively
in this environment *before* being trusted and embedded as a 305-byte base64
constant. Verified end to end: `probeNativeDecodeFormats()` returns `['avif']`
in this Chromium, via a direct integration test, not just a type-check.

---

## 🔴 D-47 — utif2's lenient parser can hand back `NaN` dimensions; the corrupt-file guard let it through

**Docs affected:** none (internal fix inside `wasm/tiff.ts`, no contract change)
**Milestone:** 5

Found by the first real decode test written against the new TIFF adapter,
using 8 arbitrary garbage bytes to check error handling — the same discipline
already applied to the AVIF adapter, which passed the equivalent test cleanly.

**Expected:** a clean `E_CORRUPT_FILE`. **Actual:** an uncaught, raw
`DOMException: Failed to construct 'ImageData': The source width is zero or
not a number.` reaching straight past the adapter's own error handling — the
exact "generic throw reaching the UI" the Quality bar exists to prevent.

**Cause:** the guard was `ifd.width <= 0 || ifd.height <= 0`. On sufficiently
malformed input, utif2 does not throw — it hands back an IFD whose width/height
computed to `NaN` instead. `NaN <= 0` is `false` in JavaScript, so the guard
passed, and `new ImageData(pixels, NaN, NaN)` — which sat **outside** the
function's only `try`/`catch` — threw the raw DOMException that reached the
caller directly.

**Fix:** widened the `try`/`catch` to cover the entire untrusted-bytes-to-pixels
path (through the `ImageData` construction, not just the two `UTIF.*` calls),
and hardened the guard with `Number.isFinite()` checks. A regression test now
asserts `tiffDecoder.decode()` rejects garbage bytes with
`{ code: 'E_CORRUPT_FILE' }`.

---

## 🟡 D-48 — oxipng ships two WASM binaries; confirmed only one is ever fetched

**Docs affected:** none — investigated and confirmed benign, nothing changed
**Milestone:** 5

`npm run build` emits **two** differently-sized `squoosh_oxipng_bg*.wasm`
files (164 KB and 236 KB) plus two glue-JS variants, even though
`wasm/oxipng.ts`'s own explicit `?url` import names exactly one file
(`codec/pkg/squoosh_oxipng_bg.wasm`, the single-threaded build ADR-003
requires). Worth recording because it looks, from the build output alone, like
a mistake — a maintainer re-reading this later would reasonably suspect the
wrong binary might be the one actually used.

**Traced to `@jsquash/oxipng`'s own `optimise.js`**, not to this app's code: it
has its own internal, independent thread-capability branch
(`isWorker && hardwareConcurrency > 1 && (await threads())`, from
`wasm-feature-detect`) that picks between `codec/pkg` (single-threaded) and
`codec/pkg-parallel` (multi-threaded, needs `SharedArrayBuffer`) — and it makes
that choice itself, regardless of which module this adapter pre-fetched and
handed to its `init()`. Vite correctly emits both sides of that branch as
separate lazy chunks, which is standard code-splitting for a feature-detection
branch, not a bug — a chunk only downloads if its `import()` actually executes.

**Confirmed directly, not assumed:** a real dedicated Worker in this Chromium,
probed directly, reports `crossOriginIsolated: false` and
`wasm-feature-detect`'s `threads()` resolving `false` even with
`hardwareConcurrency: 12` — so `@jsquash/oxipng`'s internal branch reliably
selects the single-threaded `codec/pkg` build in this app, every time, because
ADR-003 permanently withholds the COOP/COEP headers `threads()` depends on. The
`pkg-parallel` chunk sits in the deployed output but no real visitor's browser
ever fetches it.

**This is conditional on ADR-003, not permanent.** If a future change ever adds
COOP/COEP headers for an unrelated reason, this codec would silently switch to
the multi-threaded build the next time `crossOriginIsolated` flips `true` —
worth re-checking at that time, not before.

---

## 🔴 D-49 — `useStore`'s `device`/`codecs` never left their construction-time defaults

**Docs affected:** none (wiring fix; `AppState.device`/`codecs` already existed in `05 §4`, this makes them real)
**Milestone:** 8 — found while wiring persistence, but the bug predates it

Found while reading `state/store.ts` to decide where settings-hydration should
live, not while looking for this specifically.

`QueueController#getPool()` sizes its `WorkerPool` from
`store.getState().device`. That field is set exactly once, at store creation,
to `resolveDeviceProfile()` called **with no arguments** — the generic
4 GB / 4-core / not-mobile fallback `core/capabilities.ts` uses when it has no
real signals. `setEnvironment`, the action that exists specifically to replace
it, was never called from anywhere in the app. `WorkerPool`'s own constructor
*does* compute a real profile from real `navigator` signals
(`resolveDeviceProfile(readDeviceSignals())`), but only as a fallback for when
no `device` option is passed — and `QueueController` always passes one, so
that real computation was live code that never ran.

**Consequence:** every real session, on every real device, used the generic
default for the docs/04 §4 worker-count and memory-ceiling decisions — the
entire point of "device-tiered concurrency." A genuinely low-memory phone was
sized as a 4 GB desktop; a genuinely capable 16-core machine was capped at the
2-worker tier instead of 3. The same staleness applied to `codecs`: `ConfigPanel`
always rendered the generic native-encode baseline (`jpeg`/`png`/`webp` only,
`wasmDecode` empty), never this browser's real, feature-detected AVIF/JXL
support — so the format picker could disagree with what the worker would
actually do.

**Fix:** added `hydrateEnvironment()` to the store, called once from
`ToolShell`'s mount effect, before the pool can be lazily created. It composes
two already-correct pieces that had simply never been connected:
`resolveDeviceProfile(readDeviceSignals())` for the device, and a new
`probeCodecSupport()` in `workers/pool.ts` for the codecs — the same
`probeNativeEncodeFormats()` / `probeNativeDecodeFormats()` probes
`image.worker.ts`'s own `configure()` already runs, called a second time on
the main thread for the UI's benefit. `probeCodecSupport()` had to live in
`workers/pool.ts` rather than `state/store.ts` itself: `07 §2`'s boundary
table does not grant `state/` access to `engines/`, and only `pool.ts` may
cross both — this is the same reasoning that put `readDeviceSignals()` there
originally. Verified in a real browser: `device.hardwareConcurrency` now
matches `navigator.hardwareConcurrency` exactly, and `codecs.nativeDecode.avif`
now reflects this Chromium's real (`true`) support instead of always `false`.

**Also fixed in the same pass:** the WASM-decode-format list now has exactly
one copy (`WASM_DECODE_FORMATS` in `core/capabilities.ts`), imported by both
`image.worker.ts` and the new `probeCodecSupport()`, rather than a second
hand-maintained copy — the exact drift D-46 already found once with the
*old* two-copy version of this same list.

---

## 🟡 D-50 — Settings/presets persistence: an additive AppState extension, built-ins moved into Dexie, and a boundary-driven type relocation

**Docs affected:** `05 §4` (note added: `AppState` gained `settings`/`presets`, additive only)
**Milestone:** 8

Three related decisions made building `platform/db.ts` → `state/` →
`PresetPicker.tsx`, per docs/10 M8:

**1. `settings`/`presets` are not in `05 §4`'s `AppState` interface — added
anyway, as new fields, not a change to any existing one.** That doc predates
Milestone 8 and only describes in-memory conversion state; nothing in it
forbids extension, and every one of its six numbered invariants still holds
verbatim. Implemented as `state/persistence.slice.ts`, matching the existing
`jobs.slice.ts` / `config.slice.ts` convention exactly: the slice file holds
only the shape and pure helpers (`seedBuiltIns`, `looksLikeStoredPreset`), and
every action that touches `set`/`get` lives in `store.ts`'s own initializer,
alongside every other slice's actions.

**2. Built-in presets moved from a hardcoded array in `PresetPicker.tsx` into
Dexie itself, seeded once on first run.** `05 §2`'s own `StoredPreset` schema
already carries an `isBuiltIn: boolean` field — that flag only means something
if built-ins are ordinary rows in the same table as user presets, not a
separate concept living outside the schema. `theme` was deliberately left OUT
of this wiring: `BaseLayout.astro`'s inline pre-paint script already owns
theme via `localStorage`, specifically because it must run before first paint
(docs/05 §2 itself: "`localStorage`... never use it for anything but the theme
flag"). Routing theme through an async Dexie read too would create two sources
of truth for one value; `StoredSettings.theme` stays in the schema (so the
type matches `05 §2` exactly) but is not read back into the DOM — only ever
written, so an exported settings blob stays complete.

**3. A layer-boundary violation, caught by `npm run lint`, not by inspection.**
`ConfigPanel.tsx` and `PresetPicker.tsx` need to name `StoredPreset` — they
render a list of them. Importing it from `platform/db.ts`, where it was
originally defined, is denied by `07 §2`'s boundary table: `components-react/`
is not granted `platform/`, and `eslint-plugin-boundaries` does not exempt
type-only imports from that rule. `core/types.ts` is where `07 §2`'s own
reasoning says a shape that must cross layers belongs — the same principle
that already put `ComparisonTable` there for `components-astro/`. Moved
`StoredSettings`/`StoredPreset`/`StoredLicense` there; `platform/db.ts` now
imports and re-exports them, so `state/store.ts`'s existing import path did
not need to change. The shapes themselves are byte-for-byte what `05 §2`
specifies — only the file they are declared in moved.

Verified against a real IndexedDB, not a mock: built-in seeding, save/apply
(with usage-count increment), delete (built-ins refused, user presets not),
export/import round-tripping (built-ins excluded, fresh ids on import so
re-importing the same file twice cannot silently collide with an existing
row), and settings persistence surviving a simulated reload (wipe the
in-memory slice, re-hydrate, confirm the value came back from IndexedDB and
not from memory that was never actually cleared).

---

## 🟠 D-51 — OPFS: the storage primitive is built; the pipeline write-through and session-restore UI are deliberately not

**Docs affected:** none — a scope boundary, not a contract change
**Milestone:** 8

`05 §3` describes OPFS for two distinct uses: the `keepFilesForSession`
opt-in, and a memory-pressure escape valve where an oversized intermediate
"should leave the JS heap" **during conversion** — the second use means
touching `workers/pipeline.ts`'s decode/encode path directly.

**Built:** `platform/opfs.ts` — feature detection, write/read a session's
source and result blobs, a manifest that records both, delete-one-session,
and purge-every-session-older-than-24h. All async/standard File System Access
API, not `FileSystemSyncAccessHandle`: §3 calls for the sync handle
specifically as a worker-only hot-path optimisation for the pipeline
write-through below, which is not what this module does today, so requiring
it here would be adding a constraint the current code has no use for.

**Deliberately not built:** (1) automatically writing source/result bytes to
OPFS as jobs run, gated on `keepFilesForSession`, inside the worker — the
actual pipeline touch. (2) A "resume your previous session" UI that restores
sources/jobs into the store from a past visit's manifest. Both are real
features, not just storage plumbing, and neither is in Milestone 8's own
acceptance list (offline capability, install-prompt timing, settings survival,
preset export/import, deployment, zero-outbound — file/job continuity across
a reload is not one of them). Retrofitting the decode/encode path's in-memory
model was also weighed against its cost: that path has 300+ passing tests and
docs/12 D-43/D-45's memory-ceiling guards already protect against the OOM
case this would otherwise exist to prevent, so the risk of destabilising it
for a feature not on the acceptance list did not clear the bar this pass.

**What DOES run today:** `purgeStaleSessions()`, called once on `ToolShell`
mount. Nothing in this app writes to OPFS yet, but the sweep runs regardless,
so a future session that DOES start writing never launches into a codebase
that forgot to ever schedule cleanup.

Verified against a real origin-private file system: write/read byte-for-byte,
manifest correctness across a source+result pair, graceful `null` (never a
throw) for an unknown session, and the 24h staleness boundary itself —
backdating one session's manifest and confirming `purgeStaleSessions()`
removes exactly that one and keeps a fresh sibling.

---

## 🟠 D-52 — The service worker had to become a BUILD STEP, and three things only surfaced against real bytes

**Docs affected:** none — `10 §M8` asks for "precache the app shell, cache WASM codecs on first use", which is exactly what shipped
**Milestone:** 8

`10 §M8` describes the service worker in one line. Four things about it could
only be settled by building it and watching what the browser actually did.

**1. The precache list must be baked into the worker's own bytes, so it is a
build step, not a file.** A service worker re-runs `install` only when its OWN
script bytes change. Astro fingerprints every asset (`ToolShell.BZy3Nbyg.js`),
so a hand-written URL list goes stale on the very next build, and fetching the
list separately at install time is worse: the worker's bytes then never change,
so the browser has no way to notice a deploy happened at all. Resolved with two
scripts running after `astro build` — `build-precache-manifest.mjs` enumerates
`dist/`, `build-sw.mjs` transpiles `public/sw.ts` and substitutes the real
version + URL list into two placeholder tokens. The substitution is asserted:
if a `__PRECACHE_*__` token survives, the build throws rather than shipping a
worker that would cache nothing.

**2. `Promise.all` over the precache list silently lost its tail.** Firing
every `cache.add` at once cached **19 of 27 URLs — always the same first 19**,
with no error on any of them, though each URL fetched fine individually. The
loop is therefore sequential (`for … await cache.add(url)`). `cache.addAll()`
has the same all-at-once shape and would not have helped. This costs a little
background time on a step already off the critical path, in exchange for
actually completing. **Worth knowing this failed silently** — the symptom was
not an error but a partially-offline app.

**3. WASM codecs are deliberately NOT precached.** `10 §M8` says "cache WASM
codecs on first use", and it is right to: precaching them would download up to
2.6 MB of AVIF/HEIF binaries on first visit for a user who may only ever
convert JPEG→WebP, which is precisely the first-load tax ADR-004 exists to
avoid. They land in a separate runtime cache the first time a file actually
needs them. `pwa.spec.ts` asserts nothing WASM-shaped is in the eager shell
cache, so a future "helpful" addition to the manifest fails the suite.

**4. Dexie had to be imported dynamically to stay inside the 60 KB budget.**
`state/store.ts` is in every tool page's hydration bundle, and it imports
`platform/db.ts` transitively — so a top-level `import Dexie from 'dexie'`
pulled the whole library into the baseline island and pushed it past `04 §7`'s
60 KB gz ceiling the first time this was written the obvious way. `getDb()`
imports it dynamically instead, the same treatment client-zip already gets in
`deliver.ts`.

Verified end to end in a real browser: the worker registers, activates and
precaches the actual shell; a precached route still loads with the network
fully cut; and the install prompt never appears before a conversion.

---

## 🔴 D-53 — Analytics ships OFF by default, because the site's own privacy page makes a promise the default build has to keep

**Docs affected:** `04 §1` (asset-origin policy — one documented exception, gated), `06 §5` (privacy assertion (c) allowlist)
**Milestone:** 8

`10 §M8` asks for Cloudflare Web Analytics, "pageview beacons only, loaded
AFTER the tool island mounts, hard-blocked while any job is in flight, add its
origin to the privacy-test allowlist". Every one of those is implemented. The
deviation is that it is **inert unless a build explicitly sets
`PUBLIC_CF_BEACON_TOKEN`**, and no build in this repo does.

**Why.** The site's own `/privacy` page already committed, in writing, before
this milestone: *"Every asset this site loads — including the image codecs — is
served from this domain. If a privacy-respecting page-view counter is ever
added, it will be one that sends no personal data, it will be named here, and
it will be blocked while any conversion is running."* Cloudflare's beacon is
fetched from `static.cloudflareinsights.com`. Wiring it in unconditionally
would have made that first sentence false in every build anyone can inspect —
including the one the release gate runs — and turned `privacy.spec.ts`'s
same-origin assertion from a real proof into one with a permanent hole.

**What shipped instead:**
- `platform/analytics.ts` enforces all three gates itself, not at the call
  site: token-or-nothing, in-flight check consulted at injection time, and
  inject-at-most-once.
- It is reached through a store action (`maybeLoadAnalytics`), because
  `07 §2` gives `components/react` no grant to `platform/` — and the store is
  also the only thing that can answer "is a job in flight?" authoritatively.
- `/privacy` reads the same build-time variable and **names Cloudflare Web
  Analytics as the counter, or states plainly that none is enabled**. The page
  cannot drift from what the bundle does, which is what the promise "it will be
  named here" actually requires.
- `privacy.spec.ts` lists the beacon origin in assertion **(c) only**.
  Assertions (a) zero-body and (b) zero-requests-while-converting remain
  absolute for every origin including this one.

**Verified against a real build, not just reasoned about.** Building with
`PUBLIC_CF_BEACON_TOKEN` set puts the token, the beacon URL and the
`data-cf-beacon` attribute into the island bundle and flips `/privacy` to name
Cloudflare; removing it reverts both, and the token appears in no other page.
The three gates are locked in by `tests/integration/analytics.test.ts`, which
asserts only the cases where the beacon must NOT load — no token, a
whitespace-only token, and a job in flight — so this product's own suite never
fetches a third-party script to prove a point. The positive case is covered by
the build-output check instead, for the same reason.

**Consequence accepted:** production gets no pageview numbers until someone
sets the token deliberately, at which point the privacy page updates itself in
the same build. That is the correct default for a product whose entire
differentiator is that it does not phone home — the reversal is one env var,
and it is honest in both directions.

---

## 🟡 D-54 — CompareView existed for four milestones as dead code; wiring it also meant finishing it

**Docs affected:** none
**Milestone:** 8

`CompareView.tsx` was written in Milestone 4 and never imported by anything —
`08 §3`'s component tree shows `ToolShell -.opens.-> CompareView`, and that
edge simply did not exist in code. Its own docstring deferred the real
interaction: *"The draggable divider, zoom and keyboard-operable range input
land in Milestone 8."*

Both halves are now done. `ResultActions` already had an unused `onCompare`
prop, so the chain is ToolShell → FileGrid → FileCard → ResultActions with no
new plumbing invented.

Two decisions worth recording:

**The divider is a clip-based wipe, not two images side by side.** The point of
this view is judging *compression artefacts* — differences of a few pixels that
are invisible unless both images occupy the exact same screen position at the
exact same scale. Side-by-side cannot show that no matter how it is laid out.

**Drag is the enhancement, not the mechanism.** WCAG 2.5.7 (Dragging Movements)
requires a non-drag path, and the `<input type="range">` under the image is
that path — the same state, keyboard-operable, carrying the accessible name,
not a lesser fallback. The backdrop is a real `<button>` rather than a `div`
with an `onClick`, which gets keyboard and screen-reader dismissal for free
instead of hand-rolling a key handler that only half-matches the native one.

Cost: the baseline island went from **28.2 KB gz to 32.4 KB gz** — 54% of the
`04 §7` budget, still comfortable.

---

## 🔴 D-55 — The app is unusable without `OffscreenCanvas`, and said so only by failing every file. Found by running the e2e suite on browsers that had never been installed

**Docs affected:** `05 §1` (`DeviceProfile.hasOffscreenCanvas` — now actually load-bearing), `08 §5` (one new pre-flight state)
**Milestone:** 8 — a latent gap from Milestone 1, surfaced now

The Playwright config has declared four projects since Milestone 7 — chromium,
firefox, webkit, mobile-safari — but **only Chromium's browser binary was ever
installed**, so `npm run test:e2e` reported "78 passed" while 266 tests were
failing to launch a browser at all. Installing WebKit and Firefox turned that
into 48 real failures.

**The finding.** Playwright's WebKit has **no `OffscreenCanvas`**, while its
main-thread canvas encodes JPEG, PNG and WebP perfectly well:

| | JPEG | PNG | WebP | AVIF | `OffscreenCanvas` |
|---|---|---|---|---|---|
| main-thread canvas | ✅ | ✅ | ✅ | ✗ (silently PNG) | — |
| worker | — | — | — | — | **absent** |

Every codec path in this app encodes through `OffscreenCanvas` inside a worker
(CLAUDE.md non-negotiable 3), so on such an engine **nothing converts**. The
real-browser matrix: OffscreenCanvas is Chrome 69+, Firefox 105+, and **Safari
16.4+ (March 2023)** — so Safari 16.0–16.3 and earlier are affected, which is
not a hypothetical audience for a tool whose flagship route is HEIC→JPG.

**What made it a defect rather than a limitation** is how it failed.
`probeNativeEncodeFormats()` returns `[]` when `OffscreenCanvas` is undefined,
and `withEncodeBaseline([])` then treats that as "the probe failed" and
substitutes the universal baseline — the D-10 guard, added for a real bug and
still correct for the case it was written for, but here it confidently asserts
JPEG/PNG/WebP *are* encodable when the engine cannot encode at all. D-10's
premise was "an empty probe means the probe broke"; this is the one case where
an empty probe is the literal truth. The user got
one `E_ENCODE_FAILED` card per file reading **"Couldn't save as WEBP. Try a
different output format"** — advice that cannot possibly work, because no
output format will.

**Fixed:** `DeviceProfile.hasOffscreenCanvas` was already detected and stored
but read by nothing. `ToolShell` now checks it after the real probe resolves
and renders a single, accurate explanation — what is missing, which browsers
have it, and that nothing is uploaded either way — instead of letting the user
queue twenty files to watch them all fail. It waits on a genuine `envReady`
flag because the construction-time profile defaults the flag to `false`, which
would otherwise flash the notice on every browser for a frame.

**A real accessibility bug came with it.** Running the a11y sweep at a 390 px
viewport for the first time flagged `scrollable-region-focusable` (serious) on
both comparison tables: they are `min-w-[36rem]`/`min-w-[28rem]` inside
`overflow-x-auto`, so on a phone they scroll horizontally while being
unreachable by keyboard — a keyboard-only user could never read their
right-hand columns. Both wrappers are now `tabindex="0"` with
`role="region"` and a label. This was invisible on desktop viewports, where
the tables never overflow.

**Deliberately NOT done: a main-thread encode fallback.** It is the obvious
fix and it is genuinely feasible — `platform/raster.ts` already does
main-thread canvas work for SVG (D-03) — but it contradicts CLAUDE.md
non-negotiable 3 ("all image processing happens inside a Web Worker; the main
thread never blocks") for every file on those engines, not as an edge case.
That is an architectural reversal, not a bug fix, and it belongs to whoever
owns that non-negotiable. The honest notice is the correct behaviour until
then; the fallback is listed as outstanding work below.

**Three test defects were also fixed, all of which had been masking real
signal:**
- `input[type="file"]` matched the **preset-import** input, not the dropzone.
  The preset UI (D-50) put its own `type="file"` inside the ConfigPanel
  `<aside>`, which renders *before* the dropzone in the working layout — so
  after the first conversion, every "add more files" in the suite was handing
  JPEGs to the preset JSON importer. Now scoped to `[accept="image/*"]`.
- `/^Save/` matched both "Save current as…" (D-50) and "Save photo.webp" — a
  strict-mode violation that read as a conversion failure.
- The service-worker tests asserted on `state === 'activated'` and on the
  cache merely *existing*. Neither means precaching finished: measured **8 of
  27 entries** present at 'activated', all 27 ~500 ms later. That produced a
  failure that looked exactly like D-52's truncation bug and was not one. They
  now poll for the manifest's last entry, and wait for
  `serviceWorker.controller` before testing offline reload.

**Result:** 308 e2e passing across all four engines, 40 skipped with explicit
reasons (conversion on engines with no OffscreenCanvas; the HEIC fixture;
WebKit's inability to `reload()` under `setOffline`, which is a harness limit —
registration, activation and the full precache all verified there).

---

## 🔴 D-56 — DECIDED: page views come from Cloudflare's edge; no beacon ships. The client stays free of third-party requests

**Decision:** option 1 below — edge-side analytics, no client script. Taken 2026-07-31.
**Docs affected:** none — `06 §5` assertion (a) stays absolute, which is the point
**Milestone:** 8

A real beacon token was configured and the enabled build was measured end to
end. It works exactly as designed — and in working, it breaks the product's
headline guarantee.

**What the beacon actually does**, captured from a live run:

```
GET  https://static.cloudflareinsights.com/beacon.min.js   body=0b
POST https://cloudflareinsights.com/cdn-cgi/rum            body=933b
```

The POST body is genuine RUM telemetry — heap sizes, paint and navigation
timings, a per-pageload UUID, the site token, and `"location":
"…/convert/heic-to-jpg"`. **No file bytes, no filenames, nothing derived from
what the user converted.** By the letter of `/privacy` ("no analytics that
transmit anything about your files") it is truthful.

But `06 §5` assertion (a) is not scoped to files. It is absolute:

> (a) zero requests with a non-empty request body — **ever**

and `privacy.spec.ts` opens by calling itself "THE PRODUCT'S CORE CLAIM,
EXPRESSED AS CODE. Failing this is a release blocker, always — no exceptions,
no overrides, no 'just this once'." A 933-byte POST fails it. The origin
`cloudflareinsights.com` is also not the one allowlisted in D-53 — that was
`static.cloudflareinsights.com`, the script host, not the telemetry host.

**The suite reported a clean pass over this.** All four privacy tests went
green against the enabled build. They were passing *vacuously*: the beacon
POST leaves at roughly five seconds, the tests finished in about three. A
"nothing was sent" assertion is only as strong as the window it watches, so
the window now outlasts the thing it looks for — a 7 s settle before the
assertions, which moved that test from 3.0 s to 9.9 s and would now catch this.
**That fix stands regardless of which way the decision goes**, and it is the
more valuable half of this entry: the gap it closed would have hidden any late
third-party request, not just this one.

**Current state: analytics OFF.** `.env` removed, token absent from the build,
`/privacy` back to "No such counter is enabled on this build." Shipping the
enabled build would mean shipping a known violation of a documented release
blocker, so the safe state is the default until a human decides.

**What was done on the decision:**
- Analytics stays off. No token in any build; `/privacy` reads "No such counter
  is enabled on this build."
- **The D-53 allowlist entry was REMOVED from `privacy.spec.ts`.** Assertion (c)
  is same-origin-only again with no exceptions. Keeping it would have bought
  nothing and let a future beacon pass the privacy suite in silence — the
  entry only ever existed to smooth a path this decision closes.
- `.env.example` now says plainly not to set the token, and specifically not in
  Cloudflare Pages' environment variables — advice given earlier in this
  milestone that this decision reverses.
- The wiring, its four gate tests and this entry are kept so the choice stays
  reversible. Reversing it honestly means changing `06 §5`, `/privacy` and this
  entry in the same commit as the token.

**The three options, with the one taken first:**

1. ✅ **TAKEN — edge-side analytics, no client script at all.** Cloudflare's
   dashboard already reports requests and page views for anything proxied
   through it, measured at the edge — no beacon, no third-party script, no
   POST, no client JS. Pageview counts were the stated requirement in
   `10 §M8`; this delivers them with assertion (a) untouched and the "every
   asset from this domain" line still literally true. The beacon buys
   Core Web Vitals on top, which is not what was asked for.
2. **Ship the beacon and amend assertion (a)** to permit a bodied request to an
   allowlisted telemetry origin. Honest only if `06 §5`, `/privacy` and this
   log are all updated together — and it converts the guarantee from absolute
   to conditional, which is the exact erosion `/privacy` warns readers to
   check for.
3. **Ship nothing.** No numbers, guarantee intact.

---
## Outstanding work, most consequential first

| | Item | Blocks |
|---|---|---|
| ✅ | ~~D-03 SVG~~, ~~D-34 HEIC orientation~~, ~~privacy.spec.ts~~, ~~real HEIC decode~~ — all **done** and verified against real files | — |
| ✅ | ~~D-42 Smart App Control~~, ~~a11y sweep~~ — resolved, 69/69 passing across all 22 routes | — |
| ✅ | ~~Milestone 6~~ (all content), ~~Milestone 7~~ (all suites, D-43/44/45) — **done**, 372 tests green | — |
| ✅ | ~~jSquash quality-tier encoders~~ (mozjpeg, oxipng, avif decode, utif2 TIFF; jxl deliberately skipped) — **done**, verified against real bytes in a real browser, D-46/47/48; 300 tests green | — |
| ✅ | ~~**Milestone 8**~~ — PWA/service worker, IndexedDB persistence, OPFS, CompareView, preset export/import, analytics: **all done**, D-50 through D-54. 314 unit+integration green, 78 e2e green, all budgets pass | — |
| 🔴 | **Main-thread encode fallback for engines without `OffscreenCanvas`** (D-55) — Safari 16.0–16.3 and earlier currently get an honest "unsupported browser" notice and nothing else. Reversing CLAUDE.md non-negotiable 3 for those engines is an architectural call, not a bug fix | Safari < 16.4 users |
| 🟠 | **Deploy to Cloudflare Pages** (`noupload.app`) — the one M8 acceptance item not doable from here; needs the account. Re-run `privacy.spec.ts` against production once live | Launch |
| 🟡 | `npx playwright install` is now required for a truthful e2e run — chromium alone silently "passed" while 3 engines never launched (D-55). Worth pinning in CI setup | Honest cross-browser signal |
| ✅ | ~~Analytics decision (D-56)~~ — **decided**: page views come from Cloudflare's edge, no beacon ships, assertion (a) stays absolute. Read them in the Cloudflare dashboard after deploy; nothing to configure | — |
| 🟡 | OPFS pipeline write-through + session-restore UI (D-51) — storage primitive is built and swept; the conversion-path integration is deliberately deferred | Nothing in M8's acceptance list |
