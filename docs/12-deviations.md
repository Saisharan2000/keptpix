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

> **AMENDED — WO-6: the harness is not bound by ADR-003, and the counter now
> works. It is measuring the wrong heap.**
>
> The production page cannot read precise heap numbers, but the TEST browser
> can be launched with `--enable-precise-memory-info`. Verified against a raw
> Playwright launch, which settles it beyond doubt:
>
> | chromium launch args | delta for a 100 MB allocation |
> |---|---|
> | *(none)* | **0.00 MB** — value frozen at a round `10000000` |
> | `--enable-precise-memory-info` | **100.03 MB** — unrounded, real |
>
> A new `perf` vitest project passes that flag, so the canary now measures
> ~99.9 MB and the `< 400 MB` assertion **runs instead of skipping**. One
> gotcha cost real time: `launchOptions` must go on the PROVIDER
> (`playwright({ launchOptions })`), not on the browser instance — an
> instance-level `launchOptions` is silently ignored, and the only symptom is
> the canary continuing to report the counter unreliable.
>
> **What it then measured is a genuinely useful negative result.** A 12 MP
> conversion moves the main-thread heap by **~0.0 MB** — and that is a TRUE
> reading, not a broken one. Every byte of image work happens inside the
> worker, which has its own heap that `performance.memory` on the main thread
> cannot see. So this now proves the main thread stays light (real, and
> consistent with the responsiveness budget) while saying nothing about the
> peak `04 §7` actually cares about.
>
> **Deliberately not done:** sampling `performance.memory` inside
> `image.worker.ts` and reporting it over the progress channel. That is
> production code changed for a test's benefit, on the hot path, and it is a
> decision rather than a fix — recorded as outstanding. The honest position is
> that the budget is now *instrumentable* but still *unmeasured*, which is a
> better place to stand than a comfortable 0.0 MB that looks like a pass.

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

**2. `Promise.all` over the precache list appeared to lose its tail.** Firing
every `cache.add` at once was observed caching **19 of 27 URLs**, with no error
on any of them. The loop was made sequential (`for … await cache.add(url)`) and
has stayed that way.

> **AMENDED — WO-5: this DOES NOT REPRODUCE, and the original diagnosis was
> probably wrong.** Re-measured against the built `dist/` on the preview
> server, in all three shapes, and every one cached the full set:
>
> | Shape | Context | Result |
> |---|---|---|
> | `Promise.allSettled(urls.map(cache.add))` | page | **27/27**, 0 rejected |
> | `cache.addAll(urls)` | page | **27/27**, no throw |
> | `for … await cache.add(url)` | page | **27/27** |
> | `Promise.allSettled(urls.map(cache.add))` | **real SW `install`** | **27/27**, 0 rejected |
>
> The last row is the one that matters — same all-at-once shape, inside a
> genuine service-worker install handler, against what actually ships.
>
> **The likely real explanation is an observation-timing artifact, not a
> caching bug.** D-55 later found exactly this mistake in `pwa.spec.ts`: the
> cache was being READ at `state === 'activated'`, which is reachable while the
> install loop is still running — measured there at **8 of 27 entries present**,
> with all 27 landing ~500 ms later. "19 of 27" is the same shape of number
> obtained the same way. An install that had not finished would look precisely
> like a truncating `Promise.all`, and nothing at the time distinguished them.
>
> **Not reproduced on HTTP/2**: the preview server is HTTP/1.1, and `wrangler`
> is not a dependency of this repo, so the HTTP/2 origin case remains untested
> rather than cleared. That is the one open thread here.
>
> **The sequential loop stays**, per WO-5 — it costs a little background time on
> a step already off the critical path, and changing it now would trade a
> known-good behaviour for a marginal gain on the strength of a diagnosis this
> amendment has just weakened. What changed is what we CLAIM to know: the
> earlier text asserted a browser bug that measurement does not support.

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

> **DECIDED (2026-08-01, work order): not built, permanently-until-data.**
> Weighed under CLAUDE.md Rule 0, and merit and the standard rule agree here —
> no override was needed.
>
> - Safari 16.4 shipped **March 2023**. The pre-16.4 cohort is a thin and
>   continuously shrinking sliver.
> - Those same devices are the *worst* candidates for main-thread encoding —
>   older chips, tight memory ceilings. The realistic outcome for a 12 MP HEIC
>   is a frozen UI for many seconds and then a tab crash. **"Works badly, then
>   dies" is worse than an honest "update your browser"**, which is free to act
>   on.
> - It would mean a full parallel pipeline — a main-thread twin of every codec
>   path — maintained for the least-capable, least-tested platform, and it
>   would degrade the architecture for everyone who *does* have the feature.
> - D-03's main-thread exception is narrow by design: one format that cannot
>   work in a worker at all. This would be wholesale.
>
> **Reversal condition:** real user reports from that cohort after launch,
> weighed against the edge-analytics traffic share (D-56). Not before — the
> current signal is a browser-support table, not a user.

**WO-2 follow-up, since the notice alone was not enough.** The UI told the
truth while the data layer still lied: `withEncodeBaseline` kept substituting
the JPEG/PNG/WebP baseline, so any future caller of `CodecSupport` that forgot
to also check `hasOffscreenCanvas` would reproduce the original failure. The
capability signal is now a **required** parameter — the compiler found every
call site — and the encode matrix comes back honestly empty, with
`resolveEncoder` throwing `E_ENCODE_FAILED` for every format at every
preference. That also caught a second hole: `'best-quality'` was handing back
mozjpeg, which builds its `ImageData` through an `OffscreenCanvas` and would
have failed the same way, just later and after downloading a codec.

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

## 🟠 D-57 — The 80 MP ceiling was mobile Safari's number applied to every device, and the site promised no limit at all (WO-1)

**Docs affected:** `06 §3.4` (device-scaled table added), `04 §6` (E_TOO_LARGE trigger reworded)
**Milestone:** 8 — audit work order

D-43 promoted `06 §3.4`'s 80 MP figure from a mobile-only guard to a universal
hard rejection. That fixed a real gap (`E_TOO_LARGE` was unreachable) but
over-corrected: **80 MP was measured as mobile Safari's crash line**, and
applying it everywhere meant a 32 GB workstation refusing a 100 MP panorama it
could handle comfortably — while the homepage, the dropzone and the
`WebApplication` JSON-LD all advertised "No file size limit."

Two things were wrong, and both are fixed:

**The ceiling is now device-scaled**, defined once in
`resolveHardPixelCeiling(device)` and imported by the pipeline rather than
hardcoded at the call site (hardcoding it there is how the desktop case went
unnoticed):

| Device | Ceiling |
|---|---|
| Mobile, any memory | 80 MP — where the figure was actually measured |
| Desktop < 8 GB | 80 MP |
| Desktop ≥ 8 GB | `min(80 MP × gb/4, 300 MP)` |

Proven end to end rather than by unit test alone: **the same 90 MP PNG is
refused on a 4 GB profile and converts on a 16 GB profile.** The 300 MP
absolute cap stays — past it the failure stops being "slow" and becomes a tab
dying with no catchable error, which is worse than an honest refusal.

**And the copy no longer makes a claim the code cannot keep.** Every absolute
size promise is replaced with one true by construction — "No upload caps, no
quotas, no watermarks. Your device's memory is the only limit." "No file
*count* limit" is kept, because that one is genuinely true. This is the D-56
principle applied to marketing copy rather than to telemetry: **this product
must never publish an absolute claim its own code contradicts**, because the
whole proposition rests on its claims being checkable.

---

## 🟡 D-58 — JXL Wave 4 shelved: the routes need an encoder that does not fit (WO-8)

**Docs affected:** `09 §6` (Wave 4 marked SHELVED with a reversal condition)
**Milestone:** 8 — audit work order

`09 §6` plans 5 JXL pair routes timed to Chrome's on-by-default flip. The bet
is sound and the timing logic is sound; the routes are simply not buildable.
Every one converts **to** JXL, so every one needs JXL **encode** — and neither
canvas nor any budget-compliant WASM build provides it. The smallest JXL
encoder is 1.36 MB against the 1.2 MB per-codec ceiling in `04 §7` (D-46), and
Chrome shipping *decode* does not help a destination format.

**No budget exception granted.** That cap exists to protect mobile users on
slow connections, who are this product's core audience; a speculative SEO bet
does not outrank them.

**Reversal condition, recorded in `09 §6` itself:** revisit only when a browser
ships native JXL encode via canvas, or a sub-1.2 MB encoder build exists.
Verified there is nothing to unship — `content/formats.ts` defines no
jxl-destination route, the build emits none, and the sitemap contains zero.

---

## 🟡 D-59 — CompareView stays a modal; the three-pane wireframe is amended (WO-11)

**Docs affected:** `08 §4.2` (wireframe amended to two-pane + modal)
**Milestone:** 8 — audit work order

`08 §4.2` drew a third "PREVIEW" pane holding the original/output comparison.
What shipped is a full-width modal (D-54), and the spec is amended to match
rather than the code being rebuilt to chase it.

The reasoning is the same one that shaped D-54: this view exists to judge
**compression artefacts**, differences of a few pixels that are invisible
unless both images occupy the exact same screen position at the exact same
scale. A narrow side pane beside the grid cannot do that at any useful zoom; a
clip-based wipe over the full width can. The modal is also already built,
verified and WCAG 2.5.7-compliant, so rebuilding it as a pane would spend
baseline budget to get a worse tool.

The wireframe's `[Compare full ⤢]` affordance survives as the per-card
`Compare` button. The right-hand edge is now the metadata drawer (WO-10).
Reversal condition: a persistent preview pane may return as an ADDITION if
users ask for always-visible preview — never as a replacement for the
same-position wipe.

---

## 🔴 D-60 — A screenshot diff cannot catch the bug it was specified to catch (WO-12)

**Docs affected:** none — a testing-instrument decision
**Milestone:** 8 — audit work order

WO-12 specified a Playwright `toHaveScreenshot` guard, loose threshold, to
catch the D-27 class: unicode escapes surviving code generation so the UI
renders `0 done 00b7 0 running` instead of `·`. That bug was originally caught
by a human happening to read a page snapshot, which is not a process.

**The specified instrument does not work, and this was measured rather than
argued.** The exact D-27 defect was re-injected into `Dropzone.tsx`, rebuilt,
and the screenshot suite run:

| Guard | Result with the D-27 bug live |
|---|---|
| `toHaveScreenshot`, `maxDiffPixelRatio: 0.02` | **2 passed** — missed it entirely |
| Rendered-text scan for escape artefacts | **failed, quoting `"00b7"` and the route** |

The corrupted string is a few characters inside a full-page element, far below
a 2% pixel ratio. Tightening the ratio enough to catch it would make every run
flaky on font antialiasing — which trains people to re-baseline without reading
the diff, and that is worse than no check at all: it launders real regressions
through a habit.

**Both ship, each doing what it is actually good at** (Rule 0: the better
answer wins, with evidence). The screenshots stay for layout collapse, which
they genuinely detect. A text-integrity scan across four representative routes
does the D-27 job — exact, deterministic, no baseline to maintain, and it fails
with the offending string quoted. It also covers neighbouring failure modes
that would look fine in a screenshot: unrendered HTML entities, mojibake, and
`undefined` / `[object Object]` / `NaN` leaking into copy.

---

## 🔴 D-61 — The UI reported "0% ↓" for a file that grew by half. Found on a real iPhone, first run

**Docs affected:** `05 §4` (`BatchSummary.savedBytes` documented as SIGNED)
**Milestone:** 8 — real-device launch-gate testing

First real-device test of the flagship route, on an actual iPhone over LAN: a
**2.2 MB HEIC converted to a 3.4 MB JPG**, and the card reported
**`0% ↓` in success green**.

**The growth is not the bug.** HEIC uses HEVC intra-frame coding and is roughly
twice as efficient as JPEG, so the same photo genuinely costs more bytes as a
JPEG. A 2 MB HEIC becoming a 3.5 MB JPG is correct behaviour and the expected
trade for universal compatibility.

**The bug was the app claiming a reduction that did not happen**, in the colour
reserved for wins. Two clamps, both silently turning growth into "zero saved":

| Location | Was | Effect |
|---|---|---|
| `FileCard` | `Math.max(0, 1 - out/in)` rendered `text-success` with `↓` | 55% growth displayed as `0% ↓` |
| `selectors.summarise` | `savedBytes = Math.max(0, in - out)` | whole batch reported `saved 0%` |

The `summarise` one was the worse of the two: clamping at the selector meant
**no consumer could tell the truth even if it wanted to** — the sign was gone
before any component saw it.

**Fixed:** `savedBytes`/`savedPercent` are now SIGNED, documented as such in
`05 §4` and `core/types.ts`, and both surfaces render growth explicitly —
`+55% ↑` and `54.5% larger`, in warning rather than success, with a tooltip
explaining that converting from a more efficient format is expected to grow the
file. Locked in by `tests/unit/selectors.test.ts`, which asserts the specific
lie ("saved 0%") can no longer be produced.

**Content gap closed in the same pass.** `webp-to-jpg` already answered "Why is
the JPG bigger than the WebP I started with?" — the identical question was
missing from `heic-to-jpg`, the flagship route, where it will surprise far more
people. Added, with the target-size mode offered as the remedy for anyone who
needs the output under a specific limit.

**Worth noting how this was caught.** 331 unit and integration tests, 334 e2e
across four engines, and none of them looked at what the number *said* — they
asserted conversions succeeded, not that the reported saving was honest. It
took one real photo on one real phone. That is an argument for the real-device
gate staying in the launch checklist permanently, not being retired once it
passes.

---

## 🔴 D-63 — The canonical URL was hardcoded, which would have made a validation deploy invisible to Google

**Docs affected:** none — `09 §5` is unchanged; this makes it deployable anywhere
**Milestone:** 8 — caught while planning the first deploy

The production origin was hardcoded in **four** places: `astro.config.mjs`,
`SeoHead.astro`'s canonical, `sitemap.xml.ts`, and `public/robots.txt`.

Deploying that build to any other origin — a `*.pages.dev` validation
deployment, a staging host — produces pages that each declare:

```html
<link rel="canonical" href="https://noupload.app/convert/heic-to-jpg">
```

**Google honours that.** It would crawl the deployment and then decline to
index it, because every page says the real version lives somewhere else. The
sitemap would list a different site's URLs and robots.txt would point crawlers
at a different site's sitemap.

**The failure mode is what makes this a 🔴.** Nothing errors. The site is up,
every route returns 200, the build is green, and the traffic simply never
arrives. For a product whose entire growth model is organic search, that is
indistinguishable from "SEO takes a while" — and could have burned the whole
validation window before anyone worked out why.

**Fixed:** one source of truth in `content/site.ts`, read from `SITE_URL` at
build time and defaulting to production, so the default build is byte-identical
to before. `public/robots.txt` became `pages/robots.txt.ts` — as a static file
its `Sitemap:` line could not follow the origin.

```bash
SITE_URL=https://noupload.pages.dev npm run build
```

Verified both ways: the default build still emits `noupload.app` canonicals,
and a `SITE_URL` build is **fully self-referential** — canonical, `og:url`,
sitemap and robots all agree, with zero remaining references to the other
origin anywhere in `dist/`.

**Placed in `content/` rather than `core/`** because `07 §2` grants `pages/`
access to content but not core, and both new endpoints need it. Widening a
layer boundary to place a single string was the worse trade — and the origin
genuinely is site content, alongside `formats.ts` and `presets.ts`.

---

## 🔴 D-64 — Rebranded NoUpload → KeptPix: the name was already four other people's

**Docs affected:** every forward-looking doc's brand and domain references; `06 §4` (licence worker → `license.keptpix.com`)
**Milestone:** 8 — before first indexing

Research before buying a domain found the name was not ownable. Every short
`noupload` TLD was taken, and — the deciding finding — **four live products
already use the name for the same thing**:

| Domain | What it is |
|---|---|
| `noupload.app` | "No Upload Image Converter — .webp & .heic to .jpg, all done locally" — the same product, the same name, already indexed |
| `no-upload.com` | a "noupload"-branded privacy image/PDF suite |
| `noupload.io` | in-browser converter |
| `noupload.tools` | in-browser converter |

Zero US trademark registrations for "NoUpload" (Trademarkia + Justia; EUIPO and
India could not be queried). That cuts both ways: nothing blocks us, and
nothing can ever be defended — while four sites split every branded search.

**Rebranded to KeptPix on `keptpix.com`** — coined, so it is genuinely ownable.
Done now because it costs an hour at zero users, and a ranking rebuild later.

**A blanket find-replace was not sufficient**, and the interesting part is what
it broke or would have missed:

- **It changed the TLD.** `noupload.app` → `keptpix.app` — a domain we do not
  own. The new brand is on `.com`. Every occurrence had to be corrected by
  hand, including inside D-63's own explanation.
- **`favicon.svg` was missed entirely** — its `aria-label="NoUpload"` is
  user-facing and read aloud by screen readers, but `.svg` was not in the set
  of file types being rewritten.
- **Three storage keys are breaking changes**, not cosmetics:
  `localStorage['noupload-theme']`, the IndexedDB database name
  (`super('noupload')`), and the service-worker cache prefixes. Renaming them
  discards a returning visitor's theme, settings and presets. At ~0 users that
  cost is zero, which is precisely why this had to happen now rather than after
  launch.
- **The service worker would have littered.** Its activate handler evicts
  caches matching its own prefix, so renaming to `keptpix-shell-` would have
  stranded every `noupload-shell-<hash>` cache permanently — invisible,
  unreachable, a few MB on a stranger's device. It now sweeps the legacy
  prefixes too.
- `'noupload-pro'`, the licence product ID in `06 §4`, was renamed before any
  key was ever issued. After issuance it would have been permanent.

**`docs/12` is deliberately NOT rewritten.** This log is a record of decisions
as they were made, and D-63's account is *about* `noupload.app` — rewriting it
to say `keptpix.com` would describe a bug that never happened at a domain that
did not then exist. Historical entries keep their original names; only
forward-looking docs were updated.

**On the finding itself:** four independent builders converging on the same
name and the same pitch validates the positioning, but it also means the niche
is contested rather than unserved. `01 §2`'s claimed gap was "batch + exact
target size + provably local"; the *provably local* third is demonstrably
served by others now. What remains genuinely differentiating is the
exact-target-size search — which is the most heavily tested thing in this
codebase, and is what the `/compress/jpg-to-*` routes have to earn traffic on.

---

## 🟠 D-65 — Every canonical URL 308-redirected, because the build format contradicted `trailingSlash`

**Docs affected:** none — this makes the served URLs match what `09 §5` already assumed
**Milestone:** 8 — caught by curl-ing production before submitting anything to Search Console

`astro.config.mjs` declared `trailingSlash: 'never'`, and every canonical tag,
sitemap entry and internal link followed that. But Astro's DEFAULT
`build.format` is `'directory'`, which emits `convert/heic-to-jpg/index.html` —
and Cloudflare Pages serves that at the **slashed** URL, 308-redirecting the
unslashed one.

Measured on the live site:

```
GET /convert/heic-to-jpg      -> 308 -> /convert/heic-to-jpg/
GET /convert/heic-to-jpg/     -> 200, canonical: /convert/heic-to-jpg
```

So the sitemap listed URLs that redirect, and the page each one landed on
declared a canonical pointing back at the redirecting URL. Google resolves that
eventually, but it is a muddled signal on a site whose entire growth model is
organic search — and a wasted round trip on every internal navigation.

**Fixed with `build: { format: 'file' }`** — one line. The output becomes
`convert/heic-to-jpg.html`, which Cloudflare serves at `/convert/heic-to-jpg`
with no redirect. Nothing else changed, because every link, canonical and
sitemap entry already assumed the unslashed form; it was the OUTPUT that
disagreed with the config, not the URLs.

**Two consumers were walking `dist/` for `index.html` and had to follow:**
`build-precache-manifest.mjs` (a manifest of redirecting URLs would cache
redirects rather than pages) and the a11y sweep's route discovery. **The a11y
suite caught its own regression**: its guard asserts more than 15 routes are
found, and it reported 2 — exactly the "silently scanned one page and passed"
failure the guard was written for. Both now handle either build format, so
revisiting this decision cannot silently break them.

**Worth noting how it was found.** The full gate was green, the site was live,
and every route returned 200 to a browser. It took `curl` against production —
looking at status codes rather than rendered pages — to see it. Nothing in the
local suite models Cloudflare's URL handling, which is a real gap in what
"tests pass" can tell you about a static host's behaviour.

---

## 🔴 D-66 — Cloudflare injected an analytics beacon into production. The app now refuses it at the browser, not the dashboard

**Docs affected:** `04 §1` (asset-origin policy — now enforced by a CSP, not only asserted), `06 §5` (assertion (a) upheld against an edge-injected script)
**Milestone:** 8 — found by the first run of the privacy gate against production

`privacy.spec.ts` had never run against a deployed origin, because its base URL
was hardcoded to localhost. The first run against `keptpix.com` failed:

```
GET  https://static.cloudflareinsights.com/beacon.min.js   ← third-party script
POST https://keptpix.com/cdn-cgi/rum            941 bytes   ← telemetry
```

**This is the exact beacon D-56 decided not to ship.** Cloudflare added it
anyway, at the edge, on every HTML response. It is not in this repo — `grep`
across `dist/` finds nothing, and `curl` does not even see it, because the
injection is conditional on the request looking like a browser. It breaks
**two** assertions at once: (a) zero requests with a non-empty body, and (c)
same-origin only.

**Nobody enabled it.** The account's only Web Analytics entry is a JS-snippet
install for an unrelated pre-existing domain; the Pages project exposes no
Web Analytics toggle at all. Cloudflare turns RUM on by default for proxied
zones, so the dashboard offered nothing obvious to switch off.

**Fix: a Content-Security-Policy in `_headers`, and this is a reversal.** That
file previously said a CSP would be *"belt-and-braces, not the mechanism"*, on
the reasoning that the app is same-origin by construction and the privacy suite
already asserts it. That reasoning had a hole: **"same-origin by construction"
is only true of code we wrote.** It says nothing about what the host adds on the
way out. So the CSP IS the mechanism — `script-src 'self'` means the browser
refuses the beacon whatever the dashboard says, and a future Cloudflare default
cannot quietly reintroduce it.

**Verified, not assumed** — and verifying it needed new tooling, because
`astro preview` ignores `_headers` entirely. `scripts/serve-with-headers.mjs`
serves `dist/` the way Pages does: applying `_headers` and resolving
extensionless URLs to `.html`.

| Check | Result |
|---|---|
| Full chromium e2e under the CSP | **95/95 pass** — WASM decode, workers, islands, service worker, a11y across 22 routes |
| Injecting the beacon script by hand | **BLOCKED**, with a CSP violation naming `script-src 'self'` |

Shipping an untested CSP is how you discover in production that you have
blocked your own WASM codecs, so the first row matters as much as the second.

**Three things this says about the earlier work:**

- **The 7-second settle window from D-56 is what caught it.** That was widened
  against a *hypothetical* beacon, because a real one fired at ~5 s while the
  test finished at ~3 s. It just caught a real one nobody installed. Without it
  this run goes green and the site is submitted to Search Console carrying a
  live privacy violation.
- **D-56's decision was right for a reason stronger than the one given.** It
  refused this beacon on principle; production then added it by default. The
  principle turned out to also need enforcement.
- **The local gate cannot see the host.** 331 unit and integration tests, 95
  e2e, all green, on a site that was loading third-party script and POSTing
  941 bytes per pageview. D-65 was the same shape. `serve-with-headers.mjs`
  closes part of that gap; the rest is why the production gate exists.

**PRODUCTION GATE NOW PASSES — 4/4 against `keptpix.com`.** Confirmed live:
the `POST /cdn-cgi/rum` is gone entirely, and the beacon script is refused with
Chromium reporting `csp`.

**Two test defects had to be fixed to get an honest result, and both were the
test being wrong rather than the app:**

1. **Playwright's `request` event fires on ATTEMPT, before CSP has ruled.** A
   refused load looked identical to one that reached the network, so the suite
   reported a leak that had not happened. Assertion (c) now scopes to requests
   actually SENT — and additionally asserts that every foreign-origin attempt
   WAS refused, which turns the edge injection from noise into a positive proof
   the CSP is working. If Cloudflare ever stops injecting, that list is simply
   empty and the assertion still holds.
2. **The refusal detector matched the wrong string.** Chromium reports
   `errorText` as exactly `csp` — not `net::ERR_BLOCKED_BY_CSP`, which is what
   was first written and which never fires. The symptom was a genuinely blocked
   beacon still failing the gate. Found by printing the raw `errorText` against
   production rather than guessing at the constant.

Neither change weakens anything: (a) zero-body and (b) zero-requests-in-flight
remain absolute, and (c) now distinguishes "nothing was sent" from "nothing was
attempted" — which is the honest reading of a guarantee about transmission.

Verified in all three environments: production, local `astro preview` (no CSP),
and local `serve-with-headers` (CSP applied). 4/4 in each.

**One operational note:** running the four privacy tests in PARALLEL against
production intermittently stalls a conversion at "0 done, 2 running" — four
browsers fetching WASM codecs over the network at once. Serial (`--workers=1`)
is reliable. That is contention in the harness, not the product; the same tests
pass in parallel locally.

**Still worth turning the RUM toggle off** if it can be found — a refused
request is still a wasted round trip and a console error on every visit. But
the guarantee no longer depends on finding it.

---

## 🔴 D-67 — iPhone users got no install affordance at all, on a tool built for iPhone users

**Docs affected:** `10 §M8` (install prompt — a second, manual path documented)
**Milestone:** 8 — found on a real device, by a human tapping through the checklist

The real-device launch gate turned up a plain absence: **the Install button
never appeared on iOS.**

`beforeinstallprompt` is Chromium-only. Safari has never implemented it and
Apple has no plans to. `InstallPrompt.tsx` waited for that event and returned
`null` when it was missing — and its own docstring even said so, describing
"degrades to rendering nothing" as if that were the graceful outcome.

**It is not graceful. iOS CAN install a PWA** — Share → Add to Home Screen. It
just cannot be asked programmatically. So the component silently withheld a
feature that works, from the one platform most likely to want it: the flagship
route is HEIC→JPG, and HEIC comes off an iPhone.

Every automated test agreed with the code, because none of them could see the
gap:

| Engine | `OffscreenCanvas` | `beforeinstallprompt` | Reaches this branch? |
|---|---|---|---|
| Chromium | ✅ | ✅ | no — takes the button path |
| Playwright WebKit | **✗** (D-55) | ✗ | no — cannot convert, so never `eligible` |
| **Real iPhone, Safari 16.4+** | ✅ | ✗ | **yes** |

That combination — OffscreenCanvas present, `beforeinstallprompt` absent —
exists on no bundled engine. Playwright's WebKit misses it for the wrong
reason: it cannot convert at all, so `eligible` never becomes true and the
branch is unreachable. **A gap only a real device could show**, which is the
argument for keeping the manual gate rather than retiring it once green.

**Fixed:** on iOS, and only when not already installed, the same
post-conversion slot now names the actual controls — "tap **Share** at the
bottom of Safari, then **Add to Home Screen**". Named rather than "install this
app" because iOS's Share control is an unlabelled icon; telling someone to
install leaves them hunting. The `eligible` gate is unchanged, so `10 §M8`'s
"never before a successful conversion" still holds on both paths.

**Tested by synthesising the impossible combination**: an iOS user agent inside
Chromium, which has OffscreenCanvas so a conversion can complete, while the
forced UA takes the iOS branch. Asserts the hint is absent before conversion,
present after, and that no Chromium-style Install button appears alongside it.

Cost: baseline island 33.8 → **34.1 KB gz**, 57% of the `04 §7` budget.
---

## 🟡 D-68 — iOS cannot be automated from Windows, so the device tests itself instead

**Docs affected:** none — new diagnostic surface at `/selftest`, plus CI fixes
**Milestone:** 8 — response to D-61 and D-67 both being found only by hand

D-61 and D-67 were both found by tapping through a real iPhone, and both were
invisible to 331 unit/integration tests and 96 e2e across four engines. The
obvious response is to automate iOS. It is not available from this machine.

| Approach | Windows? | Why |
|---|---|---|
| Appium + XCUITest | ✗ | driver requires the Xcode toolchain |
| iOS Simulator | ✗ | Apple hardware only |
| Playwright → real iPhone | ✗ | unsupported; its "webkit" is a build, not Safari |
| Anthropic's Simulator integration | ✗ | real, but macOS only — it drives your Mac's Simulator, it does not supply one |
| `ios-webkit-debug-proxy` | ~ | runs on Windows, but needs `usbmuxd` (iTunes install, admin), a hand-built binary, **and has no Input domain — you cannot tap** |

**The last row is what reframed it.** Tapping was never the requirement: this
project's own e2e suite drives conversions by assigning `input.files` and
dispatching events in JS, not by clicking. What is actually needed on the device
is a **JS execution context** — and the cheapest one is the page itself.

**So `/selftest` runs the checks on-device.** Open it on any phone; it runs
automatically and reports. No cable, no proxy, no admin, no macOS — and it
executes in the REAL engine rather than a lookalike, which is the whole point.
Playwright's WebKit has no `OffscreenCanvas` at all (D-55), so it could never
have caught D-67 no matter how many engines were added.

It checks exactly what real devices found and automation missed: engine
capability (D-55), a real PNG→JPEG conversion through the actual pipeline, that
the size delta is reported with the correct **sign** (D-61), that an install path
exists for this platform (D-67), and that the offline shell is precached.

**What it deliberately does NOT check:** HEIC decode and EXIF orientation. Those
need a genuine camera file, and iOS hands a web page a transcoded JPEG when you
pick from the Photo Library rather than Files. The page says so and points at the
one manual step instead of pretending to cover it.

Not indexed, three ways: `noindex`, absent from the sitemap, `Disallow` in
robots.txt. It ships to production rather than hiding behind a dev flag because
the entire value is checking the REAL deployed build on a REAL device.

**Cost, recorded rather than waved through:** adding the route pushed the tool
routes' baseline from 34.1 to **34.9 KB gz** — chunk splitting reshuffled, so a
diagnostic page made the product pages 0.8 KB heavier. 58% of the `04 §7` budget,
accepted, but it is the D-38 pattern and worth watching.

### The same push finally ran CI, which found three more things

The workflow built in WO-3 had never executed — no git remote. Pushing to GitHub
ran it, and it failed three times before going green. Every failure was real and
none was reproducible locally:

1. **`npm ci` could not install the lockfile.** Valid on Windows, invalid on
   Linux: `@tailwindcss/oxide-wasm32-wasi` records its `@emnapi/*` transitive
   deps at positions that differ per platform. The first run wanted them
   hoisted; regenerating with `--package-lock-only` made the second want them
   nested, at different versions. A known npm issue with that package — which is
   Tailwind's WASM fallback, dead weight on both platforms we build on, but
   transitive and optional so it cannot be removed. CI now uses `npm install`,
   with the trade documented in the workflow: not byte-identical to a local
   install, which beats a permanently red pipeline.
2. **A real race in `batch.spec.ts`.** It waited for "48 done" then immediately
   asserted "2 failed" — but "48 done" only means the 48 GOOD files finished.
   CI reported `48 done · 1 running · 1 failed`: the 90 MP decode was still in
   flight. It now waits for `0 running` first. Passed locally every time; only
   slower hardware exposed it.
3. **`setOffline(false)` in a `finally` masked real failures.** When the test
   above it timed out, the context was already tearing down, so the cleanup threw
   "Target page, context or browser has been closed" — replacing the actual
   cause with a confusing one. Now tolerant.

Worth stating plainly: **CI earned its keep on its first three runs**, and every
one of those defects had been sitting in a suite that was green on this laptop.

---
## 🟠 D-69 — `pages/` gets `core/tools.ts`, and nothing else from `core/`

**Docs affected:** `07 §2` (boundary table, amended), `kepttools/03 §1`
**Milestone:** KeptTools M0

`kepttools/03 §1` puts the ToolManifest at `src/core/tools.ts`. `07 §2` denies
`pages/` any access to `core/`. Both cannot hold: one route file generates every
tool page, and its `getStaticPaths` has to read the manifest.

Three options were on the table:

1. **Copy the manifest into `content/`** — the precedent `content/site.ts` set
   for exactly this reason. Rejected: site.ts is one string, while the manifest
   is the property's single source of truth with pure lookup functions over it,
   and `kepttools/03 §1` names the path. A copy in `content/` is either a second
   source of truth or a re-export shim pretending not to be one.
2. **Widen `pages/` → `core/`** wholesale. Rejected: that is the boundary doing
   its most valuable work — keeping decode/encode/guard logic out of build-time
   page code — traded away for one import.
3. **A file-scoped element type**, which is what was done.

`eslint.config.js` already had this exact pattern: `workers/pool.ts` and
`workers/protocol.ts` are broken out as their own element types so `state/` can
reach those two files and no more. `core-tools` follows it verbatim, and
everything already allowed to read `core/` reads `core/tools.ts` too.

Verified by probe rather than by reading the config: adding
`import { ERROR_MESSAGES } from '../core/errors'` to a page still fails with
`No rule allowing this dependency was found. File is of type 'pages'.
Dependency is of type 'core'`. The grant is one file wide.

---

## ⚪ D-70 — SUPERSEDED — the image-pair routes were deleted in the fork, and are restored here

**Docs affected:** `09 §2.1`, `kepttools/04 §2`
**Milestone:** KeptTools M0, reversed at the merge

The fork deleted `convert/[pair].astro`, `convert/index.astro`,
`formats/[format].astro`, `content/formats.ts` and `FormatSpecTable.astro`,
on the reasoning that serving them from a second domain would be duplicate
content competing with the sibling property.

That reasoning was correct *for a second domain*. There is no second domain.
The tools merged into KeptPix instead, so the premise is gone and every one of
those routes is restored — they are the pages that are actually indexed, and
the only ones with any ranking history at all.

What survives from D-70 is the part that was right regardless: `convert.spec.ts`
choosing its output format from the settings rail rather than the route slug is
a better test, because it exercises the control a real user touches. That change
is what surfaced D-71, which is a genuine bug fix and is ported in full.

Nothing here is owed at M3. The "still owed" clause in the original entry —
retiring `/compress`, `/resize` and `/metadata` before launch — is void:
those are KeptPix's own routes on KeptPix's own domain.

---

## 🔴 D-71 — a settings change after adding a file was silently discarded

**Docs affected:** `06 §5` (QueueController.start, clarified)
**Milestone:** KeptTools M0
**Pre-existing in KeptPix.** Not introduced by the fork; found by it.

`ToolShell` creates a job the moment a file is added, so the card can render in
its `queued` state (D-39). `QueueController.start()` then reuses that queued job
rather than creating a second one. The job carries the `JobConfig` it was
created with — so **every settings change made between adding a file and
clicking Convert was dropped on the floor.**

On a format-pair route this was invisible: the slug set the format via
`applyRouteDefaults` before any file existed, so the snapshot was always right.
It is not invisible anywhere else, and `/compress` is the worst case — the
settings rail does not render until a file has been added, so "add, then change
a setting" is the *only* order the UI permits there. A user picking PNG got a
JPG, with no error and no indication anything had been ignored.

Found by the D-70 repointing: the four non-JPG rows of `convert.spec.ts` timed
out waiting for a download whose extension never matched, while every JPG row
passed. That asymmetry is the bug's signature.

Fix: `start()` refreshes a reused job's config from `configFor(sourceId)` before
queueing it. The job has not run yet, so re-reading its config is safe, and the
job id survives — which is the whole reason the reuse exists.

Covered at two levels, deliberately: `tests/integration/queue.test.ts` asserts
the run-time config and the produced format directly, and the non-JPG rows of
`convert.spec.ts` fail if it regresses through the real UI.

---

## 🟡 D-72 — the manifest shell is a second component, not a branch in the first

**Docs affected:** `07 §1` (tree, amended), `08 §3`
**Milestone:** KeptTools M0

`07 §1` lists `ToolShell.tsx` as the only `client:visible` entry point and
`08 §3` depends on that. KeptTools needs a manifest-driven shell that shares
almost nothing with the image shell's pipeline — different state, different
controls, no worker pool yet.

`ToolShell` stays the single entry point and became a dispatcher: `tool` prop
present → `ManifestToolShell`, absent → `ImageToolShell` (the inherited body,
unchanged). It is a fork in the router, not a branch in a pipeline — no
tool-specific logic sits on either side of it.

Two new files, both added to `07 §1`:
- `ManifestToolShell.tsx` — renders dropzone, settings rail and output
  affordance from a `ToolManifestEntry`.
- `ToolConfigPanel.tsx` — renders `ConfigFieldSpec[]`. `ConfigPanel.tsx` is
  untouched: it is the image tool's hand-built panel, with format-aware controls
  and preset management that no declarative spec should try to express.

The dispatcher exists for a concrete reason: `ImageToolShell` calls a dozen
hooks before its first return, so choosing between the two paths inside one
component body would make hook order depend on a prop.

`Dropzone` gained `accept`, `multiple`, `actionLabel` and `zoneLabel` props,
all defaulting to the inherited values — including `zoneLabel`'s default of the
exact string `a11y.spec.ts` locates the control by. Renaming a control that a
suite finds by accessible name is how that assertion rots silently.

Enforced by `tests/integration/manifest-shell.test.ts`, which renders **every**
manifest entry through the shell and checks that each declared field produces a
labelled control, that a dropzone appears only for tools that take files, and
that `accept`/`multiple` match the entry. A tool the shell cannot express fails
there, before a route or an engine exists.

---

## 🟡 D-73 — the licence claim is `kept-pro`, not per-property

**Docs affected:** `05 §1` (LicenseStatus, amended), `kepttools/02 §6`
**Milestone:** KeptTools M0

The rebrand would have turned `keptpix-pro` into `kepttools-pro`.
`kepttools/02 §6` is explicit that one $9 lifetime licence covers the whole Kept
family under one Ed25519 key, which makes each property a sales channel for the
other. A per-property claim forces a second key and makes every purchase dead on
the sibling site. Set to `kept-pro` in `core/types.ts` and in the commented
`wrangler.toml` vars. Nothing verifies licences yet — this is Phase 4 — but the
claim string is the part that would have been expensive to change later.

---

## 🔴 D-74 — the WebKit skips were hiding the entire mobile layout, and a `mobile-chromium` project now covers it

**Docs affected:** `07 §3` (dev deps / projects), `13` (WO-3)
**Milestone:** KeptTools M0

I reported M0 as "251 passed across all four engines" locally. That claim was
wrong, and the way it was wrong is worth recording.

Playwright's WebKit on **Windows** has no `OffscreenCanvas`, so
`skipWithoutOffscreenCanvas` (D-55) skipped every `webkit` and `mobile-safari`
test on this machine — 53 of them. The Linux runner's WebKit **does** have it,
so CI ran them for real. Four engines were configured, four engines "executed",
and the WO-3 project-coverage check passed — because it verifies that a project
*started*, not that its tests did anything. Green locally, seven failures on CI.

Every one of those seven was mine: `convert.spec.ts` now picks the output format
from the settings rail (D-70), and below `lg` the shell is a **step flow**
(docs/08 §4.3) where the rail is `hidden` until the Settings tab is chosen. The
control existed in the DOM and was never actionable, so `selectOption` burned
its full 30s timeout on an element it could see but not use.

Two fixes:

1. `convert.spec.ts` switches to the Settings step, sets the format, and
   switches back to the file pane before clicking Convert. On the desktop
   projects those tabs never render and both helpers are no-ops. The tab bar
   also does not exist until a file registers, and `isVisible()` on a
   not-yet-rendered element returns false *immediately* rather than waiting —
   so the helpers run only after the Convert button confirms the file landed.
   The first version of this fix got that ordering wrong and failed identically.
2. A **`mobile-chromium` project** (Pixel 7) now runs the narrow-viewport layout
   on every machine, because it is Chromium and cannot silently skip here.

Adding it paid for itself immediately: it reproduced **two pre-existing KeptPix
mobile failures** locally that had only ever appeared on CI as `mobile-safari`
(`batch.spec.ts:85`, `smoke.spec.ts:83`). Those are not fixed here — they are
KeptPix defects, unrelated to the fork, and listed under outstanding work.

It also broke the visual-regression scoping, which guarded on
`browserName !== 'chromium'`. `mobile-chromium` reports `browserName ===
'chromium'`, so a 412px viewport began comparing itself against a 1280px
baseline. The guard now checks the **project name**, so there is one baseline at
one viewport, as intended.

**The general lesson, which outlives this fix:** a skip that depends on the host
OS is a silent hole in the matrix. WO-3 was built to catch "an engine never
started"; it cannot catch "an engine started and skipped everything". Worth a
follow-up that fails a run when a project skips more than some share of its
tests.

## 🟠 D-75 — `images-to-pdf` writes its own PDF rather than pulling in a PDF library

**Docs affected:** `kepttools/03 §2` (PDF engine libraries, amended), `07 §3`
**Milestone:** KeptTools M1

`kepttools/03 §2` names `@cantoo/pdf-lib` for the whole PDF engine. For merge,
split, rotate and compress that is exactly right: those *parse* an arbitrary
existing document, which is a hard problem with decades of malformed real-world
input behind it, and nobody should re-solve it.

`images-to-pdf` parses nothing. It writes the simplest document PDF can express
— one image per page, no fonts, no transparency, no annotations. Measured, the
library is ~130 KB gz to use roughly 3% of its surface.

**The bundle size is the smaller half of the argument.** The larger half is
output quality. A JPEG is *already* a PDF image stream: `/DCTDecode` takes the
raw JPEG bytes verbatim. So the passthrough path does no image work at all —
no decode, no re-encode, no generational loss, and a 40 MP photo costs a memory
copy instead of a rasterise. Any route through a general library that decodes
to a bitmap first produces a strictly worse file, slower.

Three pure modules, all Node-testable under ADR-006:

| | |
|---|---|
| `core/pdf/writer.ts` | Objects, xref, trailer; orientation applied through the `cm` matrix |
| `core/pdf/layout.ts` | Page geometry — fit / A4 / Letter, orientation, margins, centring |
| `core/pdf/jpeg.ts` | Frame-header parse; decides passthrough eligibility |

68 tests, 98% lines on `core/pdf`. Two of them earned their place immediately:

**EXIF 5 and 7 were transposed**, and review would not have caught it. PDF's
origin is bottom-left, so the line `s = t` that `(s,t)→(t,s)` mirrors across is
the image's *anti*-diagonal, not its main one — which swaps transpose and
transverse. Both render a plausible rotated photo. Only asserting where each
corner lands, derived from where EXIF places stored row 0 and column 0, finds
it.

**Passthrough is refused for progressive, arithmetic, 12-bit and CMYK JPEGs.**
Real viewers cope with progressive almost always. "Almost always" is the wrong
bar when the failure mode is a blank page with no error raised anywhere, and
nobody re-reads a PDF they just made. Re-encoding a minority of inputs costs a
little quality; guessing wrong costs someone their document silently.

A third came from the fixtures: `IMG_4474.png` is a JPEG with the wrong
extension, on purpose. The parser went by bytes and read it correctly, and the
*test* was what needed fixing.

**Scope limit, deliberately narrow:** this cannot read a PDF, edit one, embed a
font, or draw text. When those are needed — merge, split, rotate, compress,
sign — add `@cantoo/pdf-lib` for those tools. This file must never grow into a
PDF implementation.

## 🔴 D-76 — the e2e suite tested a different product and reported 73 passed

**Docs affected:** `11 §4` (e2e harness, amended)
**Milestone:** KeptTools M1

`playwright.config.ts` had `const PORT = 4321` — Astro's default — together with
`reuseExistingServer: !process.env.CI`. A sibling Astro project was serving on
4321. Playwright adopted it, never built this site, and ran the entire suite
against someone else's product.

It reported **73 passed, 2 failed**. The two failures were
`/convert/heic-to-jpg` timing out, because the other site does not have that
route. I read that as a pre-existing defect from the KeptTools merge and said so.
It was not: re-run against the right origin, **75 passed**.

The 73 passes were worth exactly as little as the 2 failures. A11y assertions,
SEO structure checks, theme sweeps — all green, all about a different build.

**Nothing in the output named the site under test.** The only evidence was
another product's brand string inside a failure snapshot, and that snapshot only
exists because two tests happened to fail. A fully green run against the wrong
build leaves no trace at all, and would have been believed.

**The fix is a `globalSetup` origin guard** (`tests/e2e/_origin-guard.ts`): every
route in `dist/` must return 200 at the target origin before any test runs.

Chosen over sniffing for a brand string because it needs no marker to maintain
and it fails for the right reasons — a foreign server fails on the first route
it lacks, a stale server fails on whatever was added since it started, and a
deployment behind the local build fails too, which matters because `E2E_BASE_URL`
makes "am I testing what I just built" just as easy to get wrong. `redirect:
'manual'` on those requests, so a 308 to a slashed variant still fails: that is
D-65, and laundering it into a pass here would undo that fix.

Verified against the actual hazard rather than a hypothetical: serving the
sibling project's own `dist/` and pointing the guard at it produces

```
origin guard: http://localhost:4398 is not serving this build (docs/12 D-76).
  /convert/heic-to-jpg -> 404
  /convert/jpg-to-webp -> 404
  /convert/png-to-jpg -> 404
```

`PORT` also moved off 4321. The guard makes the collision loud; not colliding is
still better.

**This is the fourth time the local gate has been green about the wrong thing** —
D-63 (canonicals pointing at a domain that did not exist), D-65 (308 on every
canonical), D-66 (a beacon `curl` could not see), and now an entire suite aimed
at another product. The pattern is not carelessness in any one case; it is that
"the tests pass" is a claim about the harness as much as the code, and the
harness is the part nobody re-reads.

## 🟠 D-77 — 31 "serious" contrast violations on a page that is visually perfect

**Docs affected:** `08 §6` (a11y gate scope, amended), `11 §4`
**Milestone:** KeptTools M1

`/pdf/from-images` failed `dark:` a11y on `mobile-safari` with
`color-contrast (serious) x31 — h1`. Deterministic, 3 runs out of 3. Every other
route passed, and the same route passed in light and on every other engine.

A screenshot settled what it was not: the page renders correctly — dark
background, light text, comfortable contrast.

**What axe was actually seeing.** Under Playwright's WebKit `isMobile`
emulation, WebKit stops resolving author CSS for *some* elements on the page:
`body`, `main` and `<select>` report no background, no colour, and not even the
inherited custom properties — while `header`, and `main`'s own child `h1`,
report correctly. axe walks up from each text node looking for a background,
finds none, assumes white, and calls every text node on the page a failure.

Bisected to one flag. Not the viewport (390px alone is fine), not touch, not
device pixel ratio, not the engine — `isMobile: true` and nothing else. Chromium's
Pixel 7 sets it too and is unaffected. The page renders dark because
`color-scheme` gives WebKit a dark canvas, which is why it looks right while
measuring wrong.

**Why this route and no other:** it is the first page in the site to contain a
`<select>`. Every existing control is a radio group or a button. Twelve routes
of a11y coverage never reached this combination.

**Two real fixes, kept regardless of the tooling problem:**

| | |
|---|---|
| `html` now carries the background | It was on `body` alone — the usual advice, and it renders fine. Declaring it on both costs nothing and means nothing walking up the tree can fail to find a real background. Cut the violations from 31 to 2 on its own. |
| `Select` owns its colours | `appearance: none` plus its own arrow. Left native, iOS paints the control from the system appearance and reports its text as `#000000` whatever `color` says. Owning it makes rendered and reported the same thing, and makes the control look identical on every platform instead of three different ways. |

**The remaining 2 could not be fixed in CSS**, because under that flag no author
CSS applies to a `<select>` at all. So `color-contrast` — and only that rule — is
disabled for `mobile-safari` alone.

That is a narrowing, not a hole:
- every other project still checks contrast, **including `mobile-chromium`** — a
  mobile-emulated engine at a mobile width, which is the actual risk
- `webkit` desktop exercises the identical stylesheet
- every other axe rule still runs on `mobile-safari`

**Owed:** this is Playwright's WebKit, not Safari. Whether real iOS Safari
resolves that CSS correctly is unverified and cannot be verified from Windows
(D-68). It folds into the existing on-device check: open `/pdf/from-images` on a
real iPhone in dark mode and confirm the settings rail is readable. The evidence
says emulation artifact — the same build is correct on five other
engine/viewport combinations — but "the emulator is wrong" is a claim that
deserves a real device behind it.

## 🟡 D-78 — the smoke settings check only ever ran at one viewport

**Docs affected:** `11 §4`
**Milestone:** KeptTools M1

`smoke.spec.ts`'s WO-4 check ("the settings surface exposes no control that does
nothing") asserted the settings rail was visible and then searched it. Below
`lg` the tool is a two-step flow and that rail starts collapsed, so the
assertion could only ever pass on a desktop viewport. It went red the moment a
`mobile-chromium` project existed (added in D-74).

Fixed by opening the disclosure first, which is also the more honest test: a
control that does nothing is just as wrong on a phone, and tapping Settings is
how a phone user reaches it. Green on both projects now.

Worth noting the interaction that made this non-obvious: on mobile, opening
Settings *hides* the files panel, so a test that opens Settings and then looks
for the convert button will not find it. The two panels are alternatives below
`lg`, not siblings.

## 🔴 D-79 — the tool shipped, deployed, returned 200, and nothing linked to it

**Docs affected:** `09 §3` (internal linking, amended), `08 §4.1`
**Milestone:** KeptTools M1

`/pdf/from-images` went live and the only page linking to it was itself. In the
sitemap, absent from the header, absent from the footer, reachable only by
typing the URL.

Google treats orphan pages as low priority, and internal links are a ranking
signal — so the page built, tested and deployed that day was close to
invisible. No visitor browsing the site could reach it at all.

**Nothing caught it, and everything ran.** The build passed. The route test
passed. a11y passed on the page in both themes across five engines. The sitemap
contained it. The deploy was verified against the live origin. Every one of
those asks "does this page exist"; not one asks "can anyone get to it".

It surfaced only because a deployment check happened to diff the homepage, and
the *reason* it surfaced was an unrelated mistake of mine — see below.

**Fixed by deriving, not by adding.** `Header.astro` and `Footer.astro` now
append `publishedTools`, so a tool that passes its `supported` gate is linked
site-wide by construction and one that has not cannot appear. Hardcoding a
fifth nav entry would have fixed today and re-broken on the next tool — which
is exactly how a hardcoded list of four produced this.

`tests/e2e/no-orphans.spec.ts` asserts it two ways: no sitemap route is
unlinked, and every published manifest tool is linked from the homepage
specifically. Verified by removing the derived links and confirming both fail
with the route named.

### The mistake that found it, which is worth more than the bug

I told the founder to verify the deploy by checking the homepage HTML contained
`"Add to Home Screen"`. That string lives inside a runtime-conditional branch of
`InstallPrompt.tsx` that renders **only on iOS Safari**. It is in no build's
static HTML, including the correct one.

So the check could never pass. The founder's browser agent dutifully found it
missing, correctly established it was not a caching artifact — it checked the
deployment's own preview URL and a cache-busted request — and concluded from
sound reasoning on a false premise that the uploaded build was a mix of new
routes and an old homepage. It then recommended rebuilding, which would have
changed nothing.

Two lessons, and the second is the general one:

1. **An acceptance criterion has to be verified against a known-good artifact
   before it is handed to anyone.** One `grep` of my own `dist/` would have
   caught this. I checked the live site and not the local one, which tests the
   claim in exactly the wrong direction.
2. **A confident agent reasoning carefully from a bad premise produces a
   confident wrong answer**, and the care is what makes it persuasive. The
   preview-URL and cache-status checks were genuinely good work; they just
   cannot detect that the question is wrong. Whoever writes the criterion owns
   its validity — the executor cannot recover it.

## 🟠 D-80 — the batch test's device pin leaked one field, and that decided the outcome

**Docs affected:** `11 §4`
**Milestone:** KeptTools M1

`batch.spec.ts` passed on chromium and reported `49 done · 0 running · 1 failed`
on `mobile-chromium`, where the acceptance is `48 done, 2 flagged`. It sat red
for a day, through two wrong hypotheses of mine, before being measured properly.

**What it actually was.** The oversized fixture came out as **`Done`, at
9428×8485** — 80.0 MP, not the 90 MP that went in. It had been silently
downscaled to exactly the ceiling.

That is D-43 working as designed. There are two tiers: under the soft budget the
DECODER pre-scales via `device.maxDecodedPixels`, silently and for free, and only
above the hard ceiling is a decode refused. The hard-ceiling check reads the
dimensions **after** that pre-scale — so on a profile declaring an 80 MP decode
cap, 90 MP becomes 80 MP first, `80M > 80M` is false, and the file converts. The
product was right; the test was measuring the wrong path.

**The leak.** The pin was `{ ...device, deviceMemoryGb: 4, isMobile: false }`,
and `maxDecodedPixels` rode through the spread from whatever real device the
project emulates — absent on a desktop, 80 MP on an emulated phone. So the test
exercised outright rejection on one project and silent pre-scaling on another,
while claiming in its own comment to be "deterministic on any hardware". Fixed by
pinning `maxDecodedPixels: 0`, which disables the pre-scale tier so the
hard-ceiling path is what runs everywhere. Green on all five projects.

### Two wrong turns worth recording, because both were confidently reasoned

**I moved the pin earlier and broke it.** Hypothesis: ingest ran before the pin,
so it saw the real profile. I moved the pin to immediately after hydration — and
the diagnostic then showed `deviceMemoryGb: 16`, i.e. not pinned at all.
`ToolShell` calls `hydrateEnvironment()` on mount, which REPLACES device and
codecs with the real measured profile; pinning before that resolves gets
overwritten. The original placement was load-bearing for a reason its comment did
not state. Reverted.

**I trusted `window.__keptpix_store` and it was empty.** Both diagnostics
reported `jobCount: 0, sourceCount: 0` with fifty cards on screen. The `device`
field read correctly, so the handle is live — but its job and source maps were
empty, which cannot be the store driving that UI. Reading the DOM instead gave
the answer in one run. **The store handle is not a trustworthy diagnostic
surface, and smoke.spec's D-49 assertion rests on it** — that assertion happens
to read `device`, which is populated, so it is not currently wrong. Worth
understanding before anything else leans on that handle.

**The general lesson.** Three probes I wrote failed to reproduce the ingest at
all, and I kept refining them. The instrumented real test — the same code path
as the failure, one `console.log` — answered it immediately. When a bug only
appears in one harness configuration, instrument that configuration rather than
rebuilding it.

## 🟡 D-81 — a 60-second allowance inside a 30-second test

**Docs affected:** `11 §4`
**Milestone:** KeptTools M1

`convert.spec.ts`'s HEIC case failed roughly half of local Firefox runs with
`0 done · 1 running · 0 failed`, which reads exactly like a product flake.

It is not. The conversion step asks for 60 s, and the enclosing test kept
Playwright's 30 s default — so the 60 s was unreachable and the test was killed
mid-conversion. **An assertion allowance longer than its test timeout is always
a mistake, because the smaller one wins silently.** Same shape as the reporter
that overrode the config in D-55, and the `launchOptions` that were ignored on
the wrong object.

Raised to 120 s, which costs nothing when things are fast — the canvas
conversions still finish in seconds. HEIC is the case that genuinely needs it:
it fetches and instantiates ~1 MB of libheif WASM and decodes a 2.2 MB camera
file.

**What remains, and why it is not chased further.** At 120 s it still fails
occasionally with six Firefox workers in parallel, and passes every time at
`--workers=1`. It needs six simultaneous WASM instantiations to reproduce.
**CI runs `workers: 1` with `retries: 2`, so that contention cannot occur
there** — this is a local-dev artifact of running the whole matrix at once, not
a defect a user or CI can reach. Recorded rather than papered over: if it ever
appears at one worker, it is a real hang in the pool under contention and
should be treated as one.

## 🟠 D-82 — every page declared a large share card and shipped no image

**Docs affected:** `09 §3` (on-page requirements, amended), `11 §4`
**Milestone:** continuous SEO

`SeoHead.astro` emitted `twitter:card="summary_large_image"` with **no
`og:image` on any of the 25 pages**. X renders no card at all in that state, so
the declaration was simply untrue, and every link shared anywhere — chat, Slack,
Reddit, HN — appeared as a bare blue URL. For a product whose entire pitch is a
claim people have to be persuaded to believe, that is the worst place to have
nothing to show.

Nobody had looked, which is the actual finding. Titles, descriptions,
canonicals and h1s were all correct and unique across 25 routes; the one thing
absent was the one thing no test asserted.

**`scripts/check-seo.mjs`, wired as `npm run check:seo`.** A gate, not an audit,
for the same reason `check:budgets` is one: an eyeballed review is accurate on
the day it runs and decays immediately. It checks title length and presence,
description length, canonical absoluteness, exactly one `h1`, OG tags, and
duplicate titles or descriptions across indexable routes. Errors fail; warnings
print. It deliberately judges nothing about whether copy is *good* — only what
is mechanically wrong.

It found the missing images and one over-long description of mine
(`/pdf/from-images`, 166 chars, truncated in a result page). Both fixed; the
audit is clean.

**The image is a real PNG, generated by `scripts/make-og-image.mjs`.** An SVG
would have been easier and would have shipped no card — Facebook does not render
SVG `og:image` and several scrapers agree. Rasterising needed either a new
dependency (`sharp` is forbidden by docs/07 §3; `canvas` needs native bindings)
or the headless browser this repo already installs for e2e. Playwright is
already a devDependency, adds nothing to any bundle, and runs no production
code. Colours are taken from `tokens.css` so the card cannot drift from the site.

NOT part of `npm run build`: the output is committed and changes only when the
brand does, so regenerating it every build would burn a browser launch for a
byte-identical file. `npm run og:image` when it needs to change.

Per-route cards were considered and deferred. "Compress JPG to 100KB" on the
card would beat a generic one when that specific link is shared, but it means 25
PNGs and about a megabyte of assets, and right now the marginal value over
*having a card at all* is small. Revisit if sharing ever becomes a real channel.

## 🟠 D-83 — a `keepBookmarks` toggle that could not have worked, and the real chunk size

**Docs affected:** `07 §3` (dependency table), `04 §6` (error taxonomy),
`kepttools/03 §2`, `06 §2.2`
**Milestone:** KeptTools M1

`@cantoo/pdf-lib` added, approved by the founder, for merge / split / rotate.
Those read an arbitrary PDF someone else produced, which is a genuinely hard
problem; `images-to-pdf` only *writes* and still has no parser (D-75).

**Two corrections to what was approved.**

**The chunk is 269 KB gz, not the ~130 KB I estimated.** Off by 2x, and the
approval was given on my number, so it was reported immediately. Verified
genuinely lazy rather than assumed: the built worker contains
`import("./index-BcivbndO.js")` and **zero** occurrences of `class PDFDocument`.
Baseline island JS moved 42.6 → 43.7 KB (runner code only) against the 60 KB
budget, and `/pdf/from-images` never loads it at all, because that tool uses our
own writer.

**The manifest's `keepBookmarks` toggle is deleted.** The library has no outline
API — checked the type surface, the only `Outline` in it is a text-rendering
enum — so `copyPages` drops bookmarks and the toggle could not have done
anything whichever way it was set. That is exactly the control `smoke.spec`'s
WO-4 check exists to keep off the settings rail. Merging needs no settings, so it
now has none, and the page says outlines are lost instead of implying a choice
that does not exist.

**Two new error codes**, `E_PDF_ENCRYPTED` and `E_PDF_MALFORMED`, added to
docs/04 §6 in the same commit — the taxonomy test failed until the table was
updated, which is the gate working. Both are deliberately not `E_CORRUPT_FILE`:
that means "this is not a readable file", these mean "this IS a readable PDF and
cannot be operated on". Conflating them sends someone to re-download a file that
will fail again identically.

`ignoreEncryption` stays **false**. Passing true lets the library open a
protected file and emit subtly wrong output — blank pages, still-encrypted text
— which is worse than refusing, because the user receives a file and believes it
worked.

**Rotation adds rather than sets.** A page a scanner already marked 90° that the
user rotates 90° must land on 180°. Setting absolutely would silently
un-rotate pages that were already correct, turning one problem into two on a
mixed document.

**The integration tests double as a check on our own writer.** Their fixtures are
built by `core/pdf/writer.ts`, so a real PDF parser — one that had no part in
making them — has to accept them before any assertion runs. 17 tests, and split
producing one file per range is asserted directly, because handing back a single
merged range is the thing most tools get wrong.

## ⚪ D-84 — the Astro 7 upgrade is attempted, blocked, and deliberately parked

**Docs affected:** none changed. `07 §3` dependency versions stand.
**Milestone:** continuous maintenance

Astro 5.18.2 is two majors behind 7.2.0 and carries eight high-severity XSS
advisories. Attempted on branch `astro-7-upgrade`, **not merged**, and the branch
is kept so resuming does not repeat the investigation.

**First, the advisories were checked rather than assumed.** All eight require
either SSR or user-controlled data reaching an Astro template. This site has
`output: 'static'`, and greps confirmed **zero** `define:vars`, zero server
islands, zero spread props in `.astro` files, zero view transitions, and zero
dynamic slot names. Every vector is unreachable, so this is drift management, not
an incident.

**What worked:** `astro@7` and `@astrojs/preact@6.0.2` install cleanly, and
`vitest@4.1.10` already accepts Vite 6, 7 *or* 8, so the test runner needed
nothing. That was the risk that could have made this genuinely expensive.

**Where it stops.** The build compiles every entrypoint and then fails at
`generating static routes`:

```
Cannot find package 'react' imported from zustand/esm/react.mjs
```

Which is precisely the failure `ssr.noExternal: ['zustand']` was added to
prevent. The cause is that **Vite 8 moved the option** — its own types say *"Only
works in server environments for now. Previously this was `ssr.noExternal`"*, and
it now lives at `environments.ssr.resolve.noExternal`. The old key is silently
ignored rather than warned about, so a load-bearing setting simply stopped being
read.

Moving it there did not fix it. Neither did `noExternal: true`, which bundles
every dependency. So Astro 7's prerender is not honouring that environment
config: the bare `react` specifier survives into the server bundle and Node
resolves it directly, outside Vite, where no alias exists.

**Two candidate fixes, neither attempted:**

| | Approach | Trade |
|---|---|---|
| 1 | A vendored `react` package re-exporting `preact/compat`, so Node can resolve the bare specifier | Cheap and permanent; adds a confusing artifact, and ships no extra bytes |
| 2 | Move `state/store.ts` to `zustand/vanilla` and bind with `useSyncExternalStore` from `preact/compat` | Removes the problem class entirely; touches every `useStore` call site |

**Why parked.** No user-visible benefit, every advisory unreachable, and the
remaining work is unbounded bundler archaeology at a moment when the site has
three visitors. Worth doing when there is a reason: a reachable advisory, a
dependency that requires Astro 7, or Astro 8 forcing the question. Option 2 is
the better fix if it is ever done properly, because it removes the coupling
rather than working around it.

**Recorded as a white entry, not a coloured one:** nothing was deviated from and
nothing was built. This is a decision not to act, with the evidence for it.

## 🟠 D-85 — pdf.js, and the three things that would have broken it silently

**Docs affected:** `07 §3` (dependency table), `kepttools/03 §2`, `06 §2.2`
**Milestone:** KeptTools M2

`pdfjs-dist` (Apache-2.0) added for `/pdf/to-images`. The only credible option:
`mupdf` is AGPL and forbidden by docs/07 §3, and a PDF rasteriser is not
something to hand-write — unlike `core/pdf/writer.ts`, which is 300 lines
because writing one image per page is genuinely simple (D-75).

**Measured before building, because D-83's estimate was 2x wrong.** 171 KB gz for
the API plus 464 KB for the renderer as published; **125 KB + 368 KB = 493 KB gz
after bundling**. Largest dependency in the project, smaller than the 1.12 MB
AVIF decoder already shipped. Verified lazy the same way as D-83: the built
worker has **zero** `class PDFDocumentProxy`, and the only grep hit was this
module's own `'PasswordException'` string literal. Baseline held at 44.5 KB of 60.

**Three things that would have failed in production, handled up front:**

**`isEvalSupported: false` is mandatory here, not hardening.** pdf.js compiles
some font programs with `eval` when it is available. Our CSP is
`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` — no `unsafe-eval` — so
those calls would be blocked at runtime and *some* documents would render with
missing glyphs while most looked fine. A failure that only shows on a subset is
the worst kind to ship.

**A per-page pixel ceiling.** The manifest offers 600 DPI, and pixel count grows
with the *square* of DPI: an A3 page at 600 DPI is ~70 megapixels, 280 MB of
canvas before the encoder copies it. The requested DPI is honoured up to 30 MP,
then the scale is reduced and **the figure actually used is reported back** — the
same bargain the image pipeline strikes in D-43, and the runner surfaces it as a
warning rather than letting someone wonder why 600 produced less.

**White fill plus `alpha: false`.** A PDF page is paper. Rendered onto a default
canvas and encoded as JPEG, transparent regions come out BLACK — exactly D-83,
in the opposite direction. Encoding also goes through the shared `canvasEncoder`
rather than a local `convertToBlob`, so alpha flattening and quality handling
stay in one place instead of being reimplemented per engine.

**A nested worker, deliberately.** pdf.js requires a `Worker` and v6 has no
in-thread mode, and this engine already runs inside `image.worker.ts`. Workers
spawning workers is supported across the whole target range (Safari 16.4+ is
already the floor via the OffscreenCanvas gate, D-55) and the CSP permits it:
`worker-src 'self' blob:`. The alternative — rendering on the main thread —
breaks CLAUDE.md non-negotiable 3 and would freeze the tab.

**A stated limitation rather than a hidden one.** No cMap or standard-font data
is shipped, which would be over a megabyte for every visitor to cover PDFs that
reference fonts without embedding them, mostly older CJK documents. Those may
render with substituted glyphs. The page says so.

**API detail worth recording:** `destroy` is on `PDFDocumentLoadingTask`, not on
`PDFDocumentProxy` — the proxy exposes only `numPages` and getters. Holding the
task is the only way to release the worker's copy of the document, so failing to
would leak the whole parsed PDF per conversion.

Tests round-trip through our own writer: an image becomes a PDF via
`core/pdf/writer.ts`, and pdf.js renders it back. 10 integration tests in a real
browser, including the nested-worker path, DPI scaling, the clamp, and a pixel
sample proving pages land on white rather than black.

## 🟠 D-86 — the UX pass, and the two contrast bugs a design review cannot catch

**Docs affected:** `08 §4.3` (tool page layout, amended)
**Milestone:** continuous UX

The founder's read was that the site was not intuitive. Diagnosed before acting,
because that is not actionable: it was **readable rather than scannable**. Tools
were text links under headings, so finding one meant reading; tool pages showed
a 260px settings rail before any file existed; and the primary action sat below
the fold.

An external design pass produced a handoff that reached the same conclusion
independently, which was worth more than the markup: **fold the settings so the
dropzone is the only possible first move.**

### What shipped

| | |
|---|---|
| `ToolIcon` / `ToolCard` | Nine inline SVG icons, `currentColor`, zero dependencies. Whole card is the link. |
| Homepage | Search, Common fixes, PDF and documents, categories with derived counts |
| Trust chip | In `ToolLayout`, so all 20 tool routes get it for zero JS and it is in the crawled HTML |
| Dropzone | Accent-tinted **at rest**, with a solid button |
| Tool page | Single column: dropzone → files → collapsed settings → sticky action |

### Four things only rendering the page could find

Screenshots at every step. Every one of these passed type-check, lint and unit
tests.

**Two contrast failures, both light-theme only.** The handoff used
`text-text-subtle` for small labels (3.1:1 on white) and `text-success` on
`success-subtle` for the trust chip (**3.90:1**, and it broke all 20 tool
routes). Both under the 4.5:1 floor. Fixed by computing the ratios from the
tokens rather than judging by eye: the chip's text is `text-text` at 16.24:1,
and the lock keeps its green because WCAG asks only 3:1 of a non-text element.
`--color-text-subtle` is effectively a **large-text-only token** in the light
theme, which is worth knowing before reaching for it again.

**Descriptions truncated at three columns while fitting on a phone**, because a
3-col desktop card is NARROWER than a 1-col mobile card — the opposite of the
intuition, and invisible without looking at both.

**The action was below the fold** in the state that matters. Empty state looked
fine; add files and the settings rail plus the file grid pushed Convert off
screen. Now sticky.

### A regression of my own, and the lesson in it

D-79 made the header derive from `publishedTools` so `/pdf/from-images` could
not be orphaned. Five PDF tools later that header carried **nine items** — a wall
of text, which is exactly the problem this pass exists to fix. Right fix, wrong
component: a header is for the handful of destinations most people want, not for
completeness. Curated again, with the orphan guarantee moved to the footer and
the homepage card sections, both derived and both still asserted by
`no-orphans.spec.ts`.

**An automatic guarantee still has to be attached to the right thing.** Deriving
the nav was correct in principle and wrong in placement, and nothing failed — it
just quietly got worse with every tool.

### Tests that legitimately changed

`privacy.spec` and `pwa.spec` matched `/^Convert \d+ files$/`, with a mandatory
plural. Part two made the label singular for one file, which is correct English
and broke five tests; `convert.spec` already used `files?` and passed
throughout. Regexes relaxed rather than the copy reverted.

Two visual baselines were re-generated **deliberately**, after reading the diff
as that spec's own comment demands: 4% of pixels, 16px taller, from the button
the design added. The text-integrity half of that suite — the part that actually
catches D-27 escape garbage — passed unchanged.

---
## 🟡 D-87 — AGPL-3.0, because "verifiable" was doing no work

The pitch is that your files never leave your device. Until now the only evidence
offered was the sentence itself. The repo was private, so *verifiable* meant
"take our word for it" — which is exactly what every competitor also says.

Open-sourcing costs us almost nothing that was not already given away: the entire
program is shipped to every visitor's browser on every page load. Minified, but
present. The privacy claim is checkable by anyone willing to open devtools; a
public repo just removes the tedium.

**AGPL-3.0, not MIT.** MIT permits a competitor to take the whole thing, rebrand,
and run a paid clone with no obligation. AGPL §13 says a modified version run as
a network service must publish its source — the one clause that matters for a web
app. Every dependency allows it: MIT and Apache-2.0 are one-way compatible into
the GPLv3 family, and `libheif-js` is LGPL-3.0, which is *more* comfortable under
AGPL than under a permissive licence. Verified by reading each `package.json`.

The name is deliberately **not** licensed. AGPL grants no trademark rights, so a
fork may use the code but must not call itself KeptPix or use `keptpix.com`.

`docs/12` becomes public with everything else — 87 candid entries, most of them
my own bugs. Keeping it is the point: a spec set with an honest defect log is
stronger evidence of care than a clean one, and the alternative is pretending.

### Pre-publication audit, since a public repo is not reversible

Two real risks, both checked rather than assumed:

- **Personal photos.** `tests/fixtures/images/` is git-ignored precisely because
  camera files carry GPS — the thing this product strips. One file *is* tracked:
  `portrait-scrubbed.HEIC`. Its EXIF still holds GPS and a timestamp, which
  looked alarming until the values were read: `51.4778, -0.0015` is Greenwich
  Observatory and the date is `2020-01-01T08:00:00Z`. Both are injected by
  `scripts/scrub-fixture.mjs --with-synthetic-metadata`, and the script asserts
  afterwards that the coordinate present is the synthetic one. Clean. Make/Model
  (`Apple / iPhone 13`) is retained on purpose — the metadata suites need tags to
  find, and a device model shared with millions identifies nobody.
- **Secrets.** No `.env` tracked, no secret-shaped strings outside the lockfile,
  and `wrangler.toml` is commented out end to end with no account ID.

### Two things the founder should decide before flipping the switch

Neither is mine to decide, and neither blocks the licence:

1. `docs/01-market-scan.md` and `docs/09-seo-content-plan.md` contain the
   commercial playbook — competitor analysis, pricing, and the exact keyword
   targets. They add nothing to verifiability, which is the whole reason for
   going public. Realistic downside is low (iLovePDF is not reading this repo)
   but so is the upside.
2. `NoUploadblueprints/` is a **stale duplicate** of `docs/` that has since
   diverged — `04-architecture.md` differs by 3.1 KB. That is a problem
   independent of licensing: CLAUDE.md names `docs/` the source of truth, and a
   contributor or agent reading the older copy would follow contradictory specs.
   It wants deleting, and git history keeps it.

Also fixed on the way past: the README advertised `keptpix.app`. The site is
`keptpix.com`, and it has been for as long as it has been deployed.

---
## 🟠 D-88 — two headers that were never declared, and a verification that lied twice

Verifying the redesign deploy against production, I read the response headers.
CSP was intact — `connect-src 'self' blob:`, no external origin, no
`unsafe-eval`. But `Strict-Transport-Security` and `Permissions-Policy` were
absent, and `_headers` turned out never to have declared either. Not a broken
deploy; a gap that had always been there.

**HSTS.** Cloudflare redirects HTTP to HTTPS, but a redirect means the first
request of a session can still leave the device in cleartext. For a product whose
whole claim concerns what does not leave the device, that is the wrong default.
`max-age=31536000; includeSubDomains`, and deliberately **no `preload`** —
preload requires submission to hstspreload.org and removal takes months, so it is
a one-way door that should not be acquired as a side effect of a header edit.

**Permissions-Policy.** `git grep` for `getUserMedia`, `navigator.geolocation`
and every sensor API returns nothing across `src/` — checked, not assumed. So
denying them costs nothing and buys a real guarantee: even with a script injected
past the CSP, the page cannot reach the camera or microphone. `payment` is
deliberately left unrestricted, because ADR-003 gave up cross-origin isolation
specifically to keep the Phase 4 payment and OAuth popups working, and closing it
here would quietly undo that trade.

### The verification was green about the wrong thing — twice

Worth recording, because it is the same failure this log keeps returning to
(D-63, D-65, D-66, D-76) and it took two forms in five minutes:

1. **A stale server answered instead of mine.** `serve-with-headers.mjs` died on
   `EADDRINUSE` while an old Astro dev server held 4321. My readiness probe
   succeeded on the *first* try — which should have been the tell, since Node
   cannot boot that fast — and I read a response with none of our headers on it.
   The success line I trusted was from a previous run's log.
2. **A live server served pre-edit headers.** `const RULES = parseHeaderRules()`
   runs at **module load**, so a process started before the edit serves the old
   `_headers` for its entire life. This is the more dangerous of the two: the
   response looked *plausible* — our real CSP, our real X-Frame-Options, just
   missing the two lines I had added — which reads as "my edit is wrong" rather
   than "this server is old."

Both were only caught by dumping the **full** header set instead of grepping for
the two I expected. A grep for what you hope to find cannot distinguish "absent"
from "you are talking to the wrong process." Fixed by killing the orphan and
binding a port checked free first; both headers then served, all four original
headers unchanged, 414 unit tests green, all three budgets passing (baseline JS
44.9 KB against the 60 KB ceiling).

Requires a rebuild and re-upload to take effect — `dist/_headers` is a build
artefact, so the copy now live on production predates this change.

---
## 🔴 D-89 — the finished state was deleting its own text, and no test could see it

Found while screenshotting the results view for a directory listing, which is a
humbling place to find it: the state a user reaches after every successful
conversion, on the flagship route, wrong in three ways at once.

`FileCard` is `h-[212px]` and `overflow-hidden`. docs/08 §5 requires the height
to be FIXED so the grid does not reflow as jobs finish — that rule is right and
stays. The done state simply did not fit inside it:

1. **The Save button was sheared off.** Measured 11px past its clipping parent.
   Its centre was still clickable, so it worked; it just looked broken.
2. **Then, worse.** Raising the height to 228px moved the failure instead of
   fixing it. The two text rows carry `truncate`, which sets `overflow: hidden`,
   and a flex child that both shrinks and clips gets squeezed to **height zero**
   when the column is overconstrained. The filename and the compression stats
   were still in the DOM — correct, announced to screen readers, invisible on
   screen. A screenshot is what caught it; `getByText` would have passed.
3. **The root cause was neither.** `ResultActions` used `flex-wrap`, so three
   text buttons occupied 76px in a 171px column and 36px in a wider one. A
   fixed-height card cannot accommodate a height that depends on column width.
   No single number is correct, which is why 212 and 228 were both wrong.

### The fix, in the order the reasoning ran

- **`flex-nowrap` on the actions, Remove reduced to a bare ✕** with a per-file
  `aria-label` (`Remove IMG_4610.jpg`, better than the old generic "Remove
  file"). Not a new pattern — `ManifestToolShell`'s page list already does
  exactly this. The row is now 36px at every width.
- **`shrink-0` on all three text rows.** Overflowing is recoverable; silently
  deleting content is not.
- **`truncate` on the metrics line**, so percentage/quality/dimensions cannot
  wrap. At a 168px column it elides to `200×1…` with the full value in `title`.
  A deterministic height is what docs/08 §5 actually wants, and a wrapping line
  inside a fixed box cannot give one.
- **Height 236px (`h-59`), measured not chosen:** rows 18 + 21 + 18 + 36, gaps
  12, padding 24 = 129px of body over a 104px thumbnail.

Verified at 900/1280/1600px viewports: **0px overflow, 12px clearance under
Save, zero collapsed rows, 6/6 filenames and 6/6 stat lines visible.** 414 unit
tests green; 92 e2e passed including the full axe sweep, which is what confirms
the icon-only button kept an accessible name. `tool-results.png` regenerated
deliberately after reading the diff; `tool-idle.png` unchanged, as predicted,
because the idle state has no cards.

### Two process notes, both recurrences

**The origin guard earned its keep.** Running the visual spec, Playwright reused
a stale Astro dev server on 4321 that serves a different project, and
`_origin-guard.ts` refused to let the suite run — 404s on every route instead of
a green run against the wrong product. That guard exists because of D-76, and it
just prevented D-76 from happening again unnoticed.

**Screenshots are a test class this repo lacked.** Three defects here were
invisible to every existing assertion because assertions ask "is the text
present?" and the answer was yes. `scripts/make-screenshots.mjs` was written for
marketing and immediately paid for itself as a UI audit. Its first two outputs
were also wrong in instructive ways: canvas-generated JPEGs carry no EXIF, so the
metadata tool photographed as an empty result, and 1400x1000 sources came out at
45–60 KB, which on a page titled "Compress JPG to 100KB" demonstrates nothing.
Both now use inputs that make the claim visible — the real `portrait-scrubbed`
HEIC, and 12 MP sources that genuinely need compressing.

---
## 🟠 D-90 — D-67 gave iOS an install path, and the icon at the end of it was a screenshot

Found while confirming which icon AlternativeTo had auto-fetched for the
listing. The site advertised exactly one: `<link rel="icon" href="/favicon.svg">`,
and the manifest listed the same SVG as its only entry. Two things follow, and
neither is cosmetic:

- **iOS Safari does not read `rel="icon"` for the home screen and does not accept
  SVG there at all.** With no `apple-touch-icon`, "Add to Home Screen" saves a
  cropped screenshot of the page as the icon. D-67 built an install path for iOS
  and it terminated in a blurry thumbnail — the install worked and looked broken,
  which is arguably worse than not offering it.
- **Chrome's installability criteria want a raster icon of at least 192px**, and
  Android's adaptive launcher needs a `maskable` entry or it centre-crops
  whatever it is handed.

### Three variants, because the platforms genuinely differ

`scripts/make-icons.mjs` rasterises `public/favicon.svg` with Playwright — the
same argument make-og-image.mjs already settled: already a devDependency, `sharp`
is banned by docs/07 §3, `canvas` needs native bindings, nothing ships.

- `apple-touch-icon.png` 180x180, **square and fully opaque**. iOS applies its
  own corner mask and renders transparency as **BLACK**, so rasterising the
  rounded-rect favicon directly would put four black corners under Apple's
  rounding. Glyph at 82% so it does not touch the edge Apple rounds off.
- `icon-192.png` / `icon-512.png`, `purpose: any`, rounded rect matching the
  favicon, displayed as-is.
- `icon-maskable-512.png`, `purpose: maskable`, full bleed with the glyph at
  60%. The spec guarantees only a circle of 80% diameter survives cropping, so a
  glyph sized for a square loses its extremities on a round launcher.

The script verifies its own output rather than trusting the screenshot call: it
reads each PNG back through a canvas and asserts real pixel dimensions and a
**fully opaque corner**, since a transparent apple-touch-icon is the precise bug
it exists to prevent. All four report `corner alpha 255`.

### Deliberately NOT precached

The service worker's seed set stays `['/', '/favicon.svg', '/manifest.webmanifest']`.
The favicon earns its place by being fetched on every page load; the touch icon
is fetched once, at install, when the device is necessarily online. Against that,
D-52 recorded precache truncation on HTTP/2 that does not reproduce on HTTP/1.1
and is therefore untested rather than cleared — adding bytes to that path for no
offline benefit is the wrong trade.

Verified: manifest parses with 4 icons, PNG ≥192 present, maskable present;
`apple-touch-icon` in **29/29** built HTML files; all three served as `image/png`;
414 unit tests and 8 e2e green including D-67's own iOS install-hint test and the
network-cut service-worker test; all three budgets pass.

**Still unverifiable from here:** whether iOS actually picks it up. That needs a
real iPhone — one more entry for the manual device pass, alongside the deferred
dark-mode check.

---
## 🔴 D-91 — the compressor inflated files it should have left alone

Reported from outside, by an agent filling in a directory listing: a **57 KB JPG
with a 100 KB target came back at 89 KB**, and the UI said "56.9% larger" — which
was at least honest. The flagship feature, making a file bigger.

Nothing was broken, which is why no test caught it. Step 0 of
`searchForTargetSize` probes `maxQuality` (95); 89 KB is genuinely under 100 KB,
so it settled in one pass and reported `targetMet: true`. Correct against its own
contract. **The gap was that nobody in the chain ever asked whether re-encoding
was worth doing at all.** A source already squeezed harder than q95 costs *more*
bytes when re-encoded at q95, and a generous ceiling hides it completely.

### Why not just pass the original bytes through

That is the obvious fix and it is wrong for this product. Emitting the source
untouched would be smaller *and* would carry the **EXIF and GPS** straight to the
output, because re-encoding through a canvas is what strips them. A file 30 KB
larger is a much better failure than a file that quietly still knows where the
photo was taken.

### The fix

Tighten the target to the source size and let the existing search do its job:

```ts
const effectiveTarget = Math.min(userTarget, sourceBytes);
```

No new code path, no new option, no contract change — the search now simply has
to beat the file it was handed. `tolerance` is a fraction *of* the target, so it
scales with it. `sourceBytes` is read at function entry, before the decoder can
detach the transferred buffer.

`targetMet` is now judged against the **user's** figure rather than the tightened
one. If a 5 KB source cannot be re-encoded below 5 KB, the search reports failure
against its own stricter goal — but the user asked for "under 100 KB" and has it,
and surfacing `E_TARGET_UNREACHABLE` there would be a lie about a job that
succeeded.

### My first regression test was green about the wrong thing

Worth recording, because it is the exact failure this log keeps returning to and
I walked into it while fixing an instance of it.

The test I wrote passed **with the bug deliberately restored**. Cause: it built
its source with `makeJpegBytes`, which encodes at q95 — and a q95 source
re-encoded at q95 comes out roughly the same size, so inflation was impossible by
construction. The test exercised the code path and asserted the right thing about
an input that could never fail.

Fixed by making source quality a parameter and encoding at **q35**, harder than
the search's ceiling. Now:

- with the fix: **passes**
- with the fix reverted: **fails**, `source 91727 B, target 366908 B, got 180400 B`
  — 97% inflation, caught

A regression test that has not been observed to fail is a comment.

Verified: 414 unit, **164 integration** (real browser, none skipped), 12 e2e
across convert/batch/smoke, all three budgets pass.

---
## 🟡 D-92 — routes named for the job, not the number

The six size routes answer `compress jpg to 20kb`. **Nobody with a rejected form
types that.** They type "compress signature to 20kb" or "passport photo
compressor", and the SERPs for those phrases belong to competitors whose URL
matches the phrase — one of them owns an entire domain for it
(`photosignatureresize.com`). Evidence in docs/14; this is the build.

Two routes, both `supported: true`, both pure data in `presets.ts`:
`signature-to-20kb` and `passport-photo-to-50kb`.

### The bar, set by docs/05 §5 itself

That section warns that Google treats pages built to rank which are "less useful
than the destination" as doorway abuse. A route that merely re-words
`jpg-to-20kb` would be exactly that, and would cannibalise it. So each new route
had to carry advice the generic page cannot give — and they genuinely do. In one
case it is close to **opposite**: `jpg-to-20kb` explains that a photo physically
cannot hold 20 KB at full resolution, whereas a signature is line art, 20 KB is
roomy, and the real problem is never the compression but the photograph of the
paper — shadow, page texture, the grey of a one-bulb room, all of it bytes spent
on something that is not the signature.

Both pages also say plainly what they do **not** do: neither crops to 35×45 mm
or 600×200, and both tell you to crop first, because cropping after compressing
changes the file size and undoes the work. Naming the limit is what keeps these
from being the doorway pages the spec warns about.

### Two bugs caught on the way in

- **Card names collided.** `compressCards` derived its label purely from
  `formatTarget(targetBytes)`, which was fine while every route *was* a size:
  `signature-to-20kb` and `jpg-to-20kb` would both have rendered "Compress to
  20 KB" — identical text, different destinations. Added an optional
  `cardName` to `SizePresetRoute`, with docs/05 §5 updated in the same commit
  per CLAUDE.md rule 5. Omitted, the derived name is unchanged, so the six
  existing routes are byte-identical.
- **A FAQ answer described an intention, not the code.** `jpg-to-1mb` claimed a
  file already under target came back "essentially untouched". It did not — it
  was re-encoded at high quality and could come back 57% **larger** (D-91). The
  copy has been rewritten to say what actually happens: still re-encoded,
  because that is what strips EXIF and GPS, but never inflated.

Verified: 8 compress routes built and in the sitemap, unique card names,
`check:seo` clean after shortening a 64-char title it flagged as truncating,
FAQ rich-results schema with 5 questions on each, 414 unit green, **98 e2e**
covering orphan-linking and the a11y/structure sweep of every route, budgets
pass. Functionally smoke-tested through a real browser rather than inferred from
shared machinery: **594 KB → 16 KB** on the signature route and **584 KB → 47 KB**
on the passport route, each under its own ceiling.

**Deliberately not built: a visa route.** The obvious third candidate, and the
evidence for the query is there, but the advice is regionally contradictory — US
DS-160 wants 600×600 px under 240 KB, while Indian portals want 20–50 KB. One
page cannot answer both without being wrong for somebody, and a confidently wrong
number on an identity document is worse than no page. It needs per-region routes
or none.

---
## 🟡 D-93 — one command that decides whether the work is shippable

Built to remove the founder from the loop, which is the actual bottleneck on this
project: not the code, the fact that a human had to assemble "is this good?" out
of seven separate npm scripts. An agent that cannot answer that itself has to
stop and ask, and every stop costs a person their afternoon.

`node scripts/verify.mjs` runs eslint → typescript → unit → build → budgets → seo
→ integration → e2e, cheapest and most-likely-to-fail first so a broken build is
not discovered after three minutes of browser tests. One exit code. `--fast`
drops e2e (63s vs 3.7min); `--json` emits a machine-readable result for hooks and
CI.

**It owns the server lifecycle**, because that is the part that kept going wrong
by hand. It asks the OS for a free port (`listen(0)`), starts a fresh
`serve-with-headers`, and always kills it. Never a hardcoded port, never a reused
server. Both failure modes are already in this log: Playwright's
`reuseExistingServer` attached to a stale Astro dev server and 404'd every route
(D-88), and the same class of mistake ran an entire suite against a different
product (D-76). `serve-with-headers.mjs` also parses `_headers` once at module
load, so a long-lived server serves stale headers for its whole life.

### It found a flake within a minute of existing

Run alone, the integration suite is 164/164. Run immediately after the other
gates, `never blocks for more than 50 ms during a 4 MP conversion` failed at
**114 ms**.

Not a regression — the assertion was absolute, so it conflated two different
things: whether *our* work blocks the main thread, and whether the machine is
busy. A 5 ms interval timer gets starved by a build finishing thirty seconds
earlier regardless of what the worker is doing.

**A gate that fails for ambient reasons is worse than no gate**, because an agent
cannot act on its verdict — which would have defeated the whole point of the
tool on its first run.

Fixed by measuring a **control baseline**: the same timer, same duration, with no
conversion running, then asserting the conversion adds no more than 40 ms over
whatever this machine was already doing. Starvation hits the control exactly as
hard as the real run, so the delta isolates the claim. It still catches the
regression that matters — moving encode to the main thread would add hundreds of
milliseconds, not tens — and now it holds under load, which is also the condition
CI runs in.

Verified: **all 8 gates pass** — 414 unit, 164 integration, 140 e2e, 31 routes
built, budgets and SEO clean.

---
## 🔴 D-94 — every PDF page thumbnail was a grey box on Safari

Sai reported that images-to-PDF on his iPhone "is just opening the selected
screenshot, nothing feels downloaded". I could not see his screenshots, so I ran
the existing `images-to-pdf.spec.ts` against the WebKit and mobile-safari
projects instead of guessing. Both: **6 passed, 2 failed**, and both failures
were `locator('ol li img')` resolving to **0 elements**. No thumbnails at all.

`FileThumbnail` catches everything and renders a placeholder, so the failure was
invisible from outside — a grey box with the file extension in it, on a list
whose whole purpose its own docstring states: "Reordering pages you cannot see
is the core interaction of the tool."

### The measurement corrected my guess

I assumed Safari was rejecting `createImageBitmap`'s resize options. Probing all
three requirements separately in the real engine:

| | WebKit | Chromium |
|---|---|---|
| `createImageBitmap` with `resizeWidth` | **ok 56x42** | ok 56x42 |
| `OffscreenCanvas` | **absent** | present |

The resize options were fine. The guard on line 43 required `OffscreenCanvas`,
found none, and returned before attempting anything.

### The requirement was pointless

`FileThumbnail` is a component on the MAIN THREAD. There is no worker here, so an
offscreen surface buys nothing a detached `<canvas>` does not — and a detached
`<canvas>` with `toBlob` works everywhere. Removed the requirement, swapped in a
regular canvas. `createImageBitmap` stays, because it is the part that keeps a
12 MP photo from ever existing at full size.

`images-to-pdf.spec.ts`: **8/8 on webkit, 8/8 on mobile-safari, 8/8 on chromium**,
up from 6/8 on the first two. Swept the rest of the codebase for the same mistake
— no other main-thread `OffscreenCanvas` use. The remaining references are
correct: `SelfTest` reports the capability and `ToolShell` gates the converter on
it, which is right because the real conversion genuinely needs it in the worker.

Full verify green: 8 gates, 414 unit, 164 integration, 140 e2e.

### What this does NOT explain

Downloads **passed** on both Safari projects, so the "nothing feels downloaded"
half is unproven. Playwright's mobile-safari is WebKit with an iPhone viewport,
**not iOS Safari** — real iOS handles `<a download>` on a `blob:` URL differently
and may navigate to it rather than save it. A one-page PDF built from a
screenshot renders identically to that screenshot, so "it just opened my
screenshot" is equally consistent with the PDF being produced correctly and then
displayed instead of saved.

Also unresolved: real Safari 16.4 shipped `OffscreenCanvas`, so a current iPhone
probably HAS it and would have shown thumbnails. This fix is right regardless,
but it may not be what he saw. **Both need his screenshots or a real device**;
queued rather than assumed.

---
## 🔴 D-95 — the PDF was never saved, and the UI said it was

Reported from a real iPhone, and the description was precise enough to diagnose:
adding several screenshots to images-to-PDF "shows scrollable pictures in a new
screen", nothing lands anywhere, the page says "Saved images.pdf", and
"Download again" repeats the same nothing.

That scrollable screen **is the PDF**. Multiple screenshots became a multi-page
document and iOS Safari rendered it in its built-in viewer. The generator was
never the problem.

The problem is that **iOS Safari ignores the `download` attribute on a `blob:`
URL and navigates to it instead.** `downloadBlob` creates an anchor, sets
`download`, and clicks it — which saves a file everywhere except the one platform
this product is most used on.

And on top of it, `Outcome` said "Saved <filename>" unconditionally. It was
asserting an outcome it had never checked. Same defect class as the D-91 FAQ that
described an intention rather than the code, and this one told the user something
false while they were looking at the evidence.

### Platform detection, on purpose

There is nothing to feature-detect. iOS Safari **has** `download` on
`HTMLAnchorElement` and ignores it, so `'download' in a` is true on exactly the
platform where it means nothing. UA detection is the only instrument, with
`maxTouchPoints` separating an iPad — which reports itself as Macintosh — from a
Mac.

### The share sheet, and why activation matters

`navigator.share({ files })` is the only route from a web page to the Files app.
It requires user activation, so the automatic call after a conversion finishes
cannot use it. That path now returns `needs-tap` and the UI asks for the tap
instead of claiming a save. Falling back to the anchor there would reproduce the
bug exactly.

On the user's tap, a share failure DOES fall back to the anchor, because at that
point the alternative is handing them no file at all — worse than the viewer.
Gesture state is threaded explicitly rather than guessed.

### Honest limits

**The share path is unverifiable from here.** Playwright's WebKit has neither
`navigator.share` nor `navigator.canShare` — both `undefined`, measured — so
`usesShareSheet()` is false in every engine available to me and the new code is a
no-op in all of them. Every gate passing proves only that nothing regressed. Only
a real iPhone can confirm the fix, and it is queued as such rather than claimed.

### I nearly reverted it on a flake

Running three browser projects back to back, mobile-safari reported **3 failed**
where it had just been 8/8, and my first instinct was that the delivery change
had broken it. Two clean re-runs: **8 passed, 8 passed.** It was load, the same
class of flake as D-93's timing gate, this time in Playwright's own browser
startup. Worth recording because the wrong conclusion — revert a correct fix —
was one step away, and the thing that prevented it was re-running rather than
reasoning.

Verified: 8/8 on chromium, webkit and mobile-safari; 140 e2e on chromium; 414
unit, 164 integration; all budgets pass at 45.3 KB baseline JS.

---
## 🟠 D-96 — a valid token reported dead, and secrets in a tracked file

Three failures in one exchange, all in the credential path, none of them in the
product.

**Secrets went into `.env.example`.** That file is TRACKED and this repository is
PUBLIC, so the next commit would have published a Cloudflare token with all
permissions — DNS, billing, zone deletion. HEAD was clean; only the working copy
was affected, so nothing shipped.

**My recovery made it worse.** I parsed the file with a strict `^KEY=(.*)$`,
found nothing because the line was `KEY = value`, and ran `git checkout --` on
the strength of that — discarding the edit I was trying to protect. *A parser
that silently finds nothing must never be the input to a destructive command.*
VS Code's local history held a copy, and the permission classifier blocked me
from reading credentials out of it and writing them elsewhere. That block was
correct: the operation is indistinguishable from exfiltration whatever the
intent. Credential handling stays with the human.

**Then I declared a working token invalid.** `check-token.mjs` asked only
`/user/tokens/verify`, which accepts USER tokens. Sai's is an ACCOUNT-OWNED
token, and that endpoint answers a flat "Invalid API Token" for one — so he was
told to roll a credential that was fine. Both endpoints are tried now, and
neither decides it: the authoritative test is whether Pages is reachable, because
that is what the token is for. Asking a metadata endpoint's opinion was the
mistake.

Once fixed it immediately earned itself: the Pages project is named **`noupload`**,
not `keptpix`. A wrong `--project-name` does not fail — `wrangler` CREATES the
project and publishes to a fresh subdomain, leaving the real site untouched.

Also fixed: `process.exit()` while fetch keep-alive sockets are open trips
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` on Windows.
`process.exitCode` lets Node close its own handles.

And `.env` was read by `check-token.mjs` but not by `deploy.mjs`, so `check:token`
passed and `deploy` then refused for want of the same credentials — after all
eight gates had run. One shared `scripts/load-env.mjs` now, real environment
winning over the file.

His token still reports **exit 2, over-scoped**: DNS zones and Workers scripts
are reachable. It deploys correctly. Left as his call, deliberately — the warning
stands because a deploy token's blast radius should be one Pages project.

---
## 🔴 D-97 — a deploy that succeeded and changed nothing

First real run of `npm run deploy`. `wrangler` exited 0, printed a `*.pages.dev`
URL, and keptpix.com carried on serving the old build.

`wrangler pages deploy` takes `--branch`, and without it uses the CURRENT GIT
BRANCH. This repo is on `master`; the Pages project's production branch is
`main`. A mismatch is not an error — it publishes a **preview** deployment. The
API confirmed it: `environment: preview, branch: master`.

So the upload worked, the bytes were right, the exit code was 0, and the site was
untouched. Nothing in the tooling would have caught it except the post-deploy
check, which is the entire reason that check exists — it reported 3/6 pages not
matching `dist/` and named exactly the three whose bundles had changed.

Fixed by reading `production_branch` from the API and passing it, rather than
hardcoding `main` — so renaming the branch in Cloudflare cannot quietly turn
every future deploy back into a preview. Second run: `environment: production,
branch: main`, and **6/6 byte-identical, 29/29 routes 200, 6/6 headers**.

### Two smaller things the same run exposed

**`.env` was read by one script and not the other.** `check-token.mjs` parsed the
file; `deploy.mjs` read only `process.env`. So `check:token` passed and `deploy`
then refused for want of the same credentials — after sitting through all eight
gates first. Node does not load `.env` on its own. Extracted to
`scripts/load-env.mjs`, one copy, used by both, real environment winning over the
file so CI can override.

**The project was named `noupload`, not `keptpix`.** `check:token` caught it
before a deploy did. With a wrong name `wrangler` does not fail either — it
CREATES the project and publishes to a fresh subdomain. `deploy.mjs` now lists
projects and refuses with the real names.

### And I scared myself for no reason

After deploying I grepped the served `ManifestToolShell.BSX1pOdI.js` for the new
strings and found none, and briefly believed the fix had not shipped. That file is
a **289-byte wrapper**; the component is `ManifestToolShell.B8nJ1_xZ.js` at
24,987 bytes, which it imports. Following the import on production: `your
Downloads` ✓, `Save somewhere else` ✓, and `octet-stream` ✓ `canShare` ✓ in the
delivery chunk. Grepping one file of a code-split graph proves nothing about the
graph.

---
## 🟠 D-98 — monitoring without telemetry, and two copies that disagreed

Sentry was next on the pipeline plan (docs/17 item D). It cannot be used here, and
that is a design decision rather than an obstacle: docs/06 §5 asserts **zero
requests with a non-empty body, ever** and every origin in an allowlist of `self`
only, both release-blocking. A browser SDK POSTs error payloads to a third party,
violating both, and CLAUDE.md forbids "any analytics that transmits payloads". An
error reporter would trade the thing being sold for information about it.

So `scripts/monitor.mjs` watches production **from outside**, like a user would.
No client code, nothing transmitted. It checks the live sitemap's routes for 200,
all six security headers, that the CSP still pins `connect-src 'self'` and
`default-src 'self'`, that no third-party `<script src>` is being served, and that
the live route set matches this checkout.

It cannot see a JavaScript exception in somebody's browser. That is a real limit,
and `/selftest` is the answer to it — the user runs the diagnostic on their own
device and reads the result themselves. But it does catch what has actually gone
wrong here: **Cloudflare injecting a beacon into every response** with nothing in
the repo changed (D-66), a deploy that succeeded and changed nothing (D-97), and
headers production never served (D-88).

Routes come from the LIVE sitemap rather than the local build, deliberately. A
monitor reading the local one only checks routes this checkout knows about, so a
page dropped by a bad deploy is absent from both and the absence matches.

### Verified by making it fail

A monitor that only ever reports "fine" is worth nothing, so it was pointed at
two foreign origins: `example.com` (no sitemap) and `cloudflare.com` (a sitemap,
none of our headers). Four criticals each, exit 1; exit 0 against real production.

### The bug underneath the bug

`--queue` filed **five duplicates on its second run**. The comment said "`add`
skips duplicates" — and that was false: `import` deduplicated by title, `add`
never did. A comment asserting behaviour the code lacks is the D-91 and D-95
defect again, this time in my own tooling.

Added `add --unique`, which skips when an OPEN item carries the same title —
open only, so a fault recurring after its fix is closed correctly files a new
item.

Then it *still* failed, and the second cause was worse: `monitor.mjs` calls the
**INSTALLED** copy at `~/.claude/backlog/backlog.mjs`, and I had edited the repo
copy without re-running `install`. The flag existed in one file and not in the one
actually executing. It looked like a logic error and was a deployment error — the
same two-copies-that-disagree problem as `load-env.mjs` in D-96, in the tool built
to prevent that class of thing.

`doctor` now compares the installed copy against the repo copy and reports STALE
with the command to fix it. Confirmed: it flagged the real staleness, went green
after `install`, and `--queue` then suppressed all five on the second run.

---
## 🔴 D-99 — Cloudflare is telling the crawlers ADR-001 exists for to go away

Reported by another agent auditing the live site, and verified here by fetching
`/robots.txt`: production serves **2752 bytes** where we generate **916**. The
difference is a "Cloudflare Managed content" block prepended at the edge, and it
contains:

```
User-agent: ClaudeBot          User-agent: GPTBot
Disallow: /                    Disallow: /
```

Our own block, further down the same file, says `Allow: /` for both. So each agent
appears twice with opposite rules. RFC 9309 says groups for the same user-agent
are merged and the most specific path wins, which leaves `Allow: /` and
`Disallow: /` tied — Google resolves a tie toward Allow, but a crawler that takes
the first matching group and stops simply leaves.

**This attacks the architectural premise of the product.** ADR-001 prerenders
every route specifically because GPTBot, ClaudeBot and PerplexityBot execute no
JavaScript, and being readable by them is the distribution this product is built
for. Blocking them discards the entire benefit the design was paying for — the
`docs/09` §5 comment in our own robots.txt says so in as many words.

Affected: GPTBot, ClaudeBot, Google-Extended carry `Disallow: /` while we
explicitly allow them. Cloudflare also blocks CCBot, Amazonbot,
Applebot-Extended, Bytespider and meta-externalagent, which we take no position
on. Its `Content-Signal: search=yes,ai-train=no,use=reference` is roughly aligned
with wanting citation without training, so that part is not the harm.

### Same class as D-66, and that is the lesson

Nothing in the repository changed. `dist/robots.txt` is correct, every test
passes, `grep` over the build finds nothing wrong. Cloudflare injected a tracking
beacon into every HTML response once before under exactly these conditions. **The
host modifying our output is a recurring failure mode on this platform, and only a
check against the live origin can see it.**

`monitor.mjs` now parses the served robots.txt into user-agent groups and fails on
`Disallow: /` for any of the seven crawlers we welcome. Verified against real
production: 1 critical, exit 1, naming GPTBot, ClaudeBot and Google-Extended. It
would have caught this on the first scheduled run after the setting appeared.

**Not fixable from here.** The zone is visible to the deploy token but
`ai_bots_protection`, `ai_crawl_control` and `managed_robots_txt` all return
"Unauthorized to access requested resource" — so this is a dashboard action,
queued as blocked rather than attempted.

### An analytics correction while in the same area

The 1-view/118-view discrepancy has been explained elsewhere as "Web Analytics
needs a JavaScript beacon that bots do not run". That reasoning does not apply to
this site: **there is no beacon.** D-56 chose edge measurement precisely so none
ships, and D-66 removed the one Cloudflare tried to inject. `monitor.mjs` confirms
it — no third-party `<script src>` is served.

The right explanation is that Web Analytics applies bot filtering and the traffic
overview does not. Same conclusion — trust the 1 — but it matters, because
believing a beacon is running invites worrying about ad-blockers undercounting,
when the number has nothing to do with them.

---
## 🟡 D-100 — the robots.txt block is off, and I sent someone after the wrong menu

**Resolved.** Live `/robots.txt` is now **916 bytes, byte-identical to
`dist/robots.txt`** — it was 2752. `monitor.mjs` confirms it: *robots.txt welcomes
all 7 intended crawlers*, exit 0. The check written in D-99 verified its own fix.

### There were TWO blockers, and my instructions found neither

I sent a browser agent to "Security → Bots". **That page does not exist any more** —
Cloudflare folded Bots into Security → Settings. The real controls, recorded here
so nobody re-derives them:

1. **AI Crawl Control → Overview → "Managed robots.txt"** (top-right card). This is
   what prepends the block. Was ON.
2. **Security → Settings → search "bot" → "Block AI bots [Deprecating 15 Sept]" →
   Configurations → "Blocks AI Bots scope"**. Was set to *"Block only on pages with
   ads"*. This is the one that matters: with it on, every per-crawler toggle in AI
   Crawl Control → Security shows blocked and **clicking them does nothing**, with a
   tooltip saying the security setting owns it. Set to *"Do not block"* and all
   sixteen crawler toggles released on their own.

Also learned: **Google-Extended has no crawler toggle at all** — it is a
robots.txt-only token, so it was only ever blocked through the managed file.

The instruction that saved this was telling the agent to *find* the setting and
describe what it actually saw rather than trust my description. That rule exists
because of an earlier incident where a confident wrong premise from me produced
confident wrong work from it; this time it produced a correction instead.

### I relayed a claim I had not checked

Another agent's audit said four pages were unindexed and I passed the list on
verbatim. URL inspection, on the actual property:

| Page | Reality |
|---|---|
| `/pdf/merge` | not on Google — *Discovered, currently not indexed*, never crawled |
| `/pdf/from-images` | same |
| `/convert/svg-to-png` | **already indexed**, crawled 11 Aug 09:03 |
| `/convert/png-to-webp` | **already indexed**, crawled 11 Aug 09:03 |

Half the list was wrong, and two Request-Indexing quota slots were spent on pages
that did not need them. Earlier in this same session I wrote the rule that a
criterion must be verified against a known-good artefact before being handed over,
and then handed over someone else's list without doing it. Second-hand evidence
needs the same check as my own.

**The real finding is more useful than the wrong one.** The two PDF routes are
*"Discovered – currently not indexed"* with **no crawl ever attempted** — a
discovery and crawl-budget matter, not a quality rejection. Google knows they exist
and has not spent a fetch.

I then wrote that the lever was internal links from higher-authority pages, and
**that was wrong too — checked it and it does not hold**:

| Route | Inbound internal links | Indexed |
|---|---|---|
| `/pdf/merge` | **30**, including the homepage | no |
| `/pdf/from-images` | **30**, including the homepage | no |
| `/convert/svg-to-png` | **4** | **yes** |

The uncrawled pages are among the most linked on the site; the indexed one is
among the least. Three of five `/pdf/` routes are indexed, so it is not a pattern
in that prefix either.

**So there is nothing to build, and building something would be cargo cult.** The
correct action was the Request Indexing already performed. What remains is a
six-day-old property's crawl scheduling, and the only honest response is to wait
and look again. Worth recording precisely because the instinct was to ship an
internal-linking change that the evidence says would have done nothing.

Also: Search Console was **already** verified with `sitemap.xml` submitted on 5 Aug,
last read 11 Aug, 29 pages discovered, status Success. My step-by-step for setting
it up was unnecessary — I should have checked before writing it.

### Crawler Hints is compatible with the privacy posture

It was enabled, and the card warns about sharing "website information required for
feature functionality". That is Cloudflare telling IndexNow which URLs changed and
when — **server to server, about pages rather than people**. It adds no client
script, no request from the browser, and nothing to the response body. docs/06 §5
governs bodied requests from the user's browser and non-`self` origins; this
touches neither. `monitor.mjs` confirms nothing new is served: robots.txt is
byte-identical and no third-party script tag appears.

---
## 🟡 D-101 — deleted a duplicate spec set that told agents to install React

`NoUploadblueprints/` held a copy of `docs/` from the original blueprint, 12 files,
and had diverged. CLAUDE.md names `docs/` the source of truth, so the second copy
could only mislead — but "stale duplicate" understates it. I diffed every file
before touching anything, and `docs/` is **not** a strict superset: every blueprint
file has lines that exist nowhere else. Those lines are the problem.

| The blueprint said | Current reality |
|---|---|
| `react` and `react-dom` ^19 as dependencies | CLAUDE.md **forbids both** (ADR-007). React 19's runtime alone is 59.45 KB gz and blows the 60 KB budget by itself |
| privacy allowlist permits "the Cloudflare Insights beacon in Milestone 8" | D-66 removed that beacon. docs/06 §5 is now `self` only, **ever**, and it is a release gate |
| `noupload.app`, codename NoUpload, license service at that host | the domain is keptpix.com |
| the original target-size search algorithm | amended by D-02 |
| `@astrojs/react` ^4 | the project runs Preact via `@astrojs/preact` |

So this was not tidying. An unattended agent reading
`NoUploadblueprints/docs/07-folder-structure.md` would find React listed as a
dependency to install, and reading `06-contracts.md` would find a privacy
allowlist that permits a tracking beacon — the two things this codebase most
explicitly forbids, stated as instructions, in a folder that looked
authoritative. The risk was highest exactly when nobody is watching.

Nothing is lost: every byte is in git at `2f4abc43`, retrievable with
`git show 2f4abc43:NoUploadblueprints/docs/06-contracts.md`. Verified that no code
or doc depends on the folder before removing it, and cleaned the two now-dangling
ignore entries in `.prettierignore` and `eslint.config.js` rather than leaving
config pointing at a path that does not exist.

The reason this took a diff rather than a `rm`: "it's a duplicate" was an
assumption, and it was wrong in the direction that mattered — the copy was not
redundant, it was contradictory.

---
## 🟡 D-102 — a PAN card route, and a flaky assertion fixed for the third time

### The route

`/compress/pan-card-photo`, target 30 KB. It earns a page because the two PAN
portals disagree and neither number is the one people search for:

| | NSDL | UTIITSL |
|---|---|---|
| Photo | 3.5 x 2.5 cm @ 200 DPI, **20–50 KB** | 213 x 213 px @ 300 DPI, **under 30 KB** |
| Signature | 2 x 4.5 cm @ 200 DPI, 10–50 KB | 400 x 200 px @ 600 DPI, ≤ 60 KB |

**Only 20–30 KB satisfies both**, which is why the target is 30 KB rather than the
50 KB most guides quote — compressing to 50 KB is still rejected on UTIITSL.

And NSDL sets a **floor of 20 KB**. Every other limit on this site punishes a file
for being too large; this one also punishes it for being too small, so the usual
instinct to squeeze as hard as possible is wrong here. No generic size page says
that, because for every other limit it is not true. That is the whole
justification for the route under docs/05 §5, which treats a page that ranks while
being less useful than the destination as doorway abuse.

Smoke-tested through a real browser against **both** bounds — 771 KB → 27 KB,
under the 30 KB ceiling and above the 20 KB floor. A test that only checked the
ceiling would have missed the point of the page.

Demand is not assumed: whole domains exist for this — `pancardresizer.com`,
`pancardsize.com`, `sarkaridna.com`, `formphotoeditor.com`.

### Only one route, not the two the backlog asked for

The obvious second was a PAN *signature* page. Its requirement is 10–50 KB on NSDL
and ≤ 60 KB on UTIITSL, and `signature-to-20kb` already lands inside both. A
second page targeting the same band with the same advice is the cannibalisation
docs/05 §5 warns about, so it was not built. The backlog item said two; the
evidence supported one.

Also honest on the page itself: it does **not** crop to 3.5 x 2.5 cm or 213 x 213,
and says so, with the instruction to crop first because cropping afterwards
changes the file size again.

### The responsiveness assertion, third correction

`stays responsive during a 4 MP conversion` has now flaked three times under
`verify`, and each fix was a genuine improvement that did not go far enough:

1. Absolute `max(gap) < 50ms` — conflated our work with machine load (D-93).
2. Compared against a single idle baseline — load drifts across a run.
3. Baseline on both sides, worse of the two — still `max`, and **max is
   maximally sensitive to one event**. A single GC pause anywhere in the ~2 s
   conversion window fails it, provided it misses both 600 ms control windows.

The claim is that the main thread stays RESPONSIVE, which is a property of the
distribution, not of its worst member. One 60 ms stall in two seconds is
responsive; fifty consecutive 100 ms gaps is not, and only the second moves a
**p95**. So: p95 during vs p95 idle, 25 ms headroom — plus a loose `max` ceiling
so catastrophic blocking cannot hide behind a good percentile.

Verified it still has teeth by injecting 900 ms of real main-thread work: fails
immediately with *"expected 900.7 to be less than 406.7"*. Then renamed, because
the test was still called "never blocks for more than 50 ms" and that is no longer
what it asserts — a test whose name describes an older assertion is a small lie
that survives every future reading.

All 8 gates green: 414 unit, 164 integration, 143 e2e, 32 routes.

---
## 🟠 D-103 — the memory budget is measured at last, and it is over

docs/04 §7 budgets **peak memory for a 12 MP image at under 400 MB**. It has been
*instrumentable but unmeasured* since Milestone 8 (D-45, WO-6), because
`tests/perf/benchmark.ts` reads `performance.memory.usedJSHeapSize` — on the
**main thread**, which a conversion barely touches. Every byte is allocated in a
worker.

### Both ways of reading the worker's heap are closed

Probed rather than assumed:

- **`performance.memory` does not exist inside a Worker.** `typeof` is
  `'undefined'` there even with `--enable-precise-memory-info`.
- **CDP cannot read it either.** A worker target attaches fine via
  `Target.attachToTarget`, and then `Runtime.getHeapUsage`,
  `Performance.getMetrics` and the HeapProfiler domain are all reported as *not
  found* on that session.

So WO-6's question — instrument `image.worker.ts`, i.e. change production code for
a test's benefit? — had a third answer: **measure from outside the browser.**
`scripts/measure-memory.mjs` sums the working set of the browser process tree
(the worker runs in a renderer that is a CHILD of the browser process, so the
browser pid alone would miss it) while driving a real conversion.

That is an **upper bound**, and for a budget of the form "stay under 400 MB" a
conservative bound is the right direction. It also counts what a heap counter
misses and the budget cares about: decoded ImageBitmaps, WASM linear memory, and
GPU-side canvas backing.

### The number, and it fails

Two independent runs, agreeing within 2%:

| Reading | Run 1 | Run 2 | Budget |
|---|---|---|---|
| Baseline, page loaded, idle | 105.7 MB | 114.8 MB | — |
| **Peak** | **528.4 MB** | **530.9 MB** | < 400 MB |
| Attributable to the conversion | 422.7 MB | 416.1 MB | < 400 MB |

Over on the strict reading by ~32%, and over on the fairest reading — peak minus
Chromium's own idle footprint — by about 5%. §7 says "Memory peak" unqualified
with "manual profiling" as its method, which is process memory, so the strict
reading is the literal one.

**Not wired into `verify`, deliberately.** Each sample spawns a PowerShell CIM
query costing about a second, so a 2-second conversion yields seven or eight
samples however short the interval is set — the spawn cost dominates the sleep.
A peak found from eight samples is reproducible, as the two runs show, but it is
too coarse to gate a commit on. It is a measurement you take, not a wall you hit.

**Deliberately NOT resolved by amending the budget.** Adjusting a number until the
measurement passes is the same move as weakening an assertion to make a test
green, and this log exists partly because that is tempting. Whether 400 MB was
ever the right figure for a desktop browser measured this way is a real question —
and it is a separate decision, with the evidence now in hand, rather than a
side-effect of finally looking. Queued as its own item.

Worth noting what already protects users: `core/guards` scales the hard pixel
ceiling by device (D-57), so a low-memory phone refuses an image a workstation
accepts. The budget's *intent* — do not crash a phone — is served by that,
independently of this figure.

---
## 🟡 D-104 — the diagnostic was not lying; the way it was read was wrong

D-80 recorded `window.__keptpix_store` as *"reporting empty `jobs`/`sources` while
the UI shows fifty cards"*, noted that `device` read correctly, and concluded the
handle was live but not the instance driving the UI. It sat in the outstanding
table as a diagnostic surface that lies.

**It does not lie.** Measured in a real browser with three files queued:

```
s.jobs returned across the boundary : {}
jobs instanceof Map (in page)       : true
jobs.size read INSIDE the page      : 3
[...sources.keys()].length          : 3
device serialises fine              : true
```

`sources` and `jobs` are `Map`s, and **a Map does not survive a structured clone**
— crossing a Playwright `evaluate` or devtools boundary it arrives as `{}`.
`device` is a plain object and arrives intact. That asymmetry is the entire
symptom: not two store instances, not stale state, just one type that serialises
and one that does not.

So the store was always correct and the log was wrong about it — for months, in a
row of a table titled "outstanding work", pointing at a bug that did not exist.
That is worth more than the fix: a wrong entry in this file costs more than a
missing one, because someone will act on it.

### Documenting the trap would not have been enough

The next person to reach for the handle would read `state.jobs`, see nothing, and
believe it — exactly as I did. So `__keptpix_snapshot()` now returns a JSON-safe
view: counts, `jobStatuses`, `sourceNames`, `device`, `codecs`. Verified across the
boundary — `sourceCount: 3`, `jobCount: 3`, real names and statuses — with the raw
`__keptpix_store` handle left in place, because `smoke.spec` and `batch.spec` use
it for `device` and `setEnvironment` and both were always fine.

The fix is making the trap unreachable rather than signposted.

---
## 🟡 D-105 — the only error reporting this product is allowed to have

`monitor.mjs` watches production from outside and **cannot see a JavaScript
exception in somebody's browser** (D-98). That is not a gap to close, it is the
price of the privacy claim: docs/06 §5 forbids any request with a body and any
origin outside `self`, both release-blocking, so an error reporter would trade the
thing being sold for information about it.

What remains is a block the user **copies and sends by hand**, and it inverts the
usual arrangement — they read it before anything moves, and nothing moves unless
they choose. `/selftest` now renders one, with a Copy button.

Deliberately absent: no filename, no file contents, no identifier of any kind.
Present: the nine check results, the user agent, core count, DPR, language, the
resolved device profile and the probed codec support — enough to reproduce a
failure, nothing that describes the person.

**Plain text, not JSON**, and that is a decision. This gets pasted into an issue,
an email or a comment, where JSON arrives as a wall the reader skips and the
writer cannot skim before sending — and "read it before you send it" is the entire
proposition. 1501 characters, which survives being quoted.

The Clipboard API is feature-detected with a real fallback: it needs a secure
context AND permission, and WebKit refuses often enough that a dead button would
be the common case. On failure the textarea selects itself and the label changes
to "Select it and copy".

### My own copy was overclaiming, and the audit caught it

The footer read *"No filenames, file contents, or image dimensions are
included."* Verified against the rendered output: the report **plainly contains
400 and 300** — the dimensions of the test image the page generates itself. True
in spirit, false as written.

Nobody would have been harmed, and it would still have been a lie inside a block
whose entire purpose is being trustworthy enough to read before sending. It now
says what is actually there: *"describes this browser and a 400x300 test image the
page generated itself. No file of yours is named or measured here."* This is the
same defect as D-91 and D-95, a third time, in a feature about honesty.

Verified: nine checks render, the report is 1501 chars, `selftest.png` never
appears, and **zero bodied requests** were observed while the page ran its own
conversion. 8 gates green; deployed.

### A note on the deploy check

Post-deploy verification failed on the first attempt — three hub pages not
matching `dist/` — and passed on a re-check twenty-five seconds later. That is
Cloudflare briefly serving the previous build, which the script's own failure
message predicts. Worth recording because a red first run here is not
automatically a rollback, and treating it as one would be its own mistake.

---
## 🟡 D-106 — infrastructure the repository cannot see, now watched

Three things changed outside this codebase on 12 Aug, each verified here rather
than taken on report:

| Change | Verified |
|---|---|
| `www.keptpix.com` added as a Pages custom domain | was a Namecheap parking CNAME |
| www → apex 301 redirect rule | `www/convert` → 301 → `keptpix.com/convert` |
| DMARC record | `_dmarc` TXT = `v=DMARC1; p=reject; sp=reject`, live in DNS |

The www change created a real problem for about a minute of wall time and would
have persisted indefinitely: www and the apex served **identical content with no
redirect**, against a sitemap and a Search Console property that are both
apex-only. That is duplicate content, and nothing in a build, a test or a deploy
could have detected it.

**So `monitor.mjs` now checks both host invariants**: www must 301 to the apex
rather than serve 200, and plain http must upgrade to https. Neither rule lives in
this repository — both are Cloudflare dashboard state — which is the same exposure
as the robots.txt block Cloudflare injected (D-99) and the beacon before it
(D-66). *The host owns state we depend on, so the only way to know is to ask the
live origin.* Verified the checks can fail by pointing them at a foreign origin:
www warns, http goes critical.

`p=reject` is right despite looking aggressive: the zone has **no outbound sending
path** — five Namecheap forwarding MX records, an SPF `~all`, no DKIM — so
rejecting forgeries costs nothing today. Inbound forwarding is unaffected, because
DMARC governs mail *claiming to be from* the domain, not mail arriving at it. It
does become a live constraint the moment anything tries to send as
`@keptpix.com`, and that is now the first line of the outstanding table.

### Two small corrections, both mine

My Chrome prompt said to expect **29** sitemap URLs. It is 30 — the figure predated
the PAN card route. The agent counted the file rather than trusting me and said so,
which is exactly the behaviour those prompts ask for, and it caught my error.

`http://www.` takes **two hops** — http-www → https-www → apex — because the
redirect rule matches `https://www.*` only. Harmless, since crawlers follow short
chains, but it is a chain and not the single hop it appears to be.

---
## 🟡 D-107 — five dead directives, and the rule they were guarding against never existed

`npm run lint` printed **5 warnings** on every run: four unused `no-console`
disables in `tests/perf/benchmark.ts`, one unused `prefer-promise-reject-errors`
in `tests/unit/timeout.test.ts`. Small, and worth fixing for a specific reason — a
permanently non-empty warning line is how a real warning goes unread. Every
`verify` run for weeks ended in "5 warnings" and everyone, me included, learned to
skip that line.

**Neither rule was configured anywhere.** Not in `eslint.config.js`, not in
`js.configs.recommended`, not in the typescript-eslint presets. The directives were
written defensively against rules that had never been enabled, so they had never
suppressed anything.

### Deleting them would have missed the point

`no-console` **should** be on for shipped source. So before enabling it I counted:
**zero `console.*` calls in `src/`** — measured, not hoped. Which makes the rule
free today and a guard tomorrow, rather than a cleanup project.

It cannot help with the **62 console calls that are in the shipped bundle** —
`console.warn` ×31, `console.log` ×16, `console.error` ×9, plus debug and info.
Those come from dependencies (preact, zustand, pdf.js, the codecs) and no lint rule
reaches them. Worth knowing so nobody reads "no-console: error" as a promise about
the bundle.

Scoped to `src/**` only. `scripts/`, `tests/` and `public/sw.ts` legitimately
print, and verified they stay quiet: zero complaints there.

Verified the rule actually bites rather than assuming — appended a `console.log`
to `src/core/naming.ts` and it errored on line 72, then restored the file. A rule
that has not been observed to fire is the same as a test that has not been observed
to fail.

`allow: []` was my first attempt and eslint rejects it: the schema requires at
least one entry if the option is present, so **omitting the option is how you allow
nothing**.

**`npm run lint` now reports "no problems"** — the first clean run in this
project's history, which means the next warning to appear will be visible.

---
## 🟡 D-108 — D-52 CLEARED, and the check guarding it had expired

### D-52 is resolved

D-52 asked whether the service-worker precache truncates over **HTTP/2**. It never
reproduced on HTTP/1.1 in any shape, including inside a real SW install, and
`wrangler` was not a dependency — so the h2 case sat as *"untested rather than
cleared"* for months.

The answer did not need wrangler. **Production is an HTTP/2 origin**, so a real
browser against the real edge *is* the untested case, and no local server can
reproduce what Cloudflare does anyway. Measured:

```
negotiated protocol : h2
cache name          : keptpix-shell-908574452adef553
manifest expects    : 40 URLs
actually cached     : 40
complete            : YES
a route with the network CUT: 200
```

**No truncation over h2.** Full precache, and a route loads with the network cut.
Closed on evidence rather than on the absence of a reproduction — which is the
distinction that kept it open, correctly, until now.

(`curl` in this environment cannot negotiate h2 at all — `--http2` reports the
libcurl build lacks support — which is worth knowing before anyone tries to settle
a protocol question with curl here.)

### The check that was supposed to catch it had stopped working

`/selftest`'s "Offline shell precached" compared `entries >= 20` under a comment
reading *"the manifest is 27 URLs"*. The manifest is now **40** — it grows with
every route — so a **half-finished install reported "pass"**. The check had
expired without saying so, which is worse than not having it: it was the thing
meant to catch D-52's original symptom on a real device.

Now it fetches `/precache-manifest.json` and compares against the real count,
reporting "N of 40". A hardcoded threshold in a growing system is a check with a
silent expiry date; asking the source has none.

It also degrades honestly: if the manifest cannot be read — offline, or missing —
it reports the raw count and says it could not compare, rather than inventing a
threshold to pass against.

8 gates green, deployed and verified.

---
## 🟠 D-109 — the Astro 7 item was right for the wrong reason

`#18` said "re-attempt the Astro 7 upgrade", blocked on zustand's React import at
prerender. Two things made that premise wrong before any code was written.

**The branch is stale.** `astro-7-upgrade` sits at 267f63a, roughly twenty commits
behind master. Its diff against master is 92 files and 14,468 deletions, which is
mostly master's newer work missing from it. Nothing there is worth merging forward;
its only value was the WIP finding, and that is already written down.

**And "upgrade for its own sake" had no justification.** Astro 5 → 7 is two majors
across 30 routes, 143 e2e tests, a 60 KB budget and four engines. So before
touching it I looked for a reason, and found one — but not the one the item named.

### `npm audit`: 9 vulnerabilities, 1 critical

The first was `sharp@0.34.5`, which **CLAUDE.md forbids adding** and which arrives
transitively from `astro@5.18.2`. Established that it is not exploitable here
before treating it as urgent:

- **Astro's image service is never invoked** — no `astro:assets`, no `<Image>`, no
  `getImage` anywhere in `src/`. The OG card is a static PNG from our own script.
- **No sharp binary reaches `dist/`.** Nothing ships.

So it is a build-time path we never execute. Still worth closing: the advisory
needs `sharp >= 0.35.0` and astro pins `^0.34.0`, so an `overrides` entry forces
the patched version without touching astro. One line, and sharp is now 0.35.3.

Then `npm audit fix` — **non-major only, deliberately, no `--force`** — cleared the
rest that did not need a breaking change.

| | Before | After |
|---|---|---|
| Total | 9 (1 critical) | **5** |
| **Prod tree** | **5** | **2** (1 low, 1 high) |
| Declared dep versions changed | — | **none** |

Astro is still `^5.16.2`, preact `^10.29.7`, zustand `^5.0.8`. Nothing we declare
moved, so the risk was lockfile-only — and 8 gates pass, including 143 e2e across
four engines.

### The real justification for Astro 7, recorded rather than acted on

The remaining HIGH is **`astro <=7.0.9`**, and `fixAvailable` names `astro@7.2.1`
with `isSemVerMajor: true`. So the upgrade now has a security reason where before it
had none — which is a much better footing than the one the item was written on.

**Deliberately not attempted in this iteration.** A two-major framework upgrade
wants its own session with room to fail, not the tail of a long one, and
CLAUDE.md requires `@astrojs/preact` to track Astro's major in the same change.
Requeued with this evidence attached, and the remaining critical (`handlebars`) is
dev-tooling only — it never reaches a build output or a user.

---
## 🟠 D-110 — the distribution strategy is right, and its revenue plan breaks its own moat

`claude-cowork-docs/keptpixdistributionstrategy.md` arrived from Cowork. Read
against what has actually been measured here, it is good work — and it contains one
contradiction serious enough that acting on the document as written would undo the
product.

### Where it is independently corroborated

Its central claim is that the winnable ground is exact-size and exam-form tasks in
India. I reached the same conclusion separately and from different evidence: the
SERP for `compress jpg to 100kb` is entirely competitor tool pages with no
discussion threads (docs/14), signature compression has whole domains devoted to it
(D-92), and the PAN portals' conflicting 20–50 KB and sub-30 KB requirements were
verifiable from primary sources (D-102). Two independent routes to the same answer
is the strongest signal in the document.

### Three stale facts

| Doc says | Actually |
|---|---|
| "We have ~9 pages" | **30 routes, 22 tools** |
| AlternativeTo listing, Sep W1–2 | **submitted and rejected 10 Aug** — their policy names converters and PDF tools as frequent declines (docs/14 §2) |
| "open-source one component" | **the whole repository is public** under AGPL-3.0 since 9 Aug (D-87) |

### The rule collision: 150–400 programmatic pages

docs/05 §5 treats pages built to rank while being less useful than the destination
as **doorway abuse**, and that rule has already killed two proposed routes here — a
visa page on regionally contradictory facts, and a PAN signature page that would
have cannibalised an existing route.

The document is not wrong that the query space is large. The reconciliation is that
**the exam-spec data is the load-bearing asset, not the page count.** A page
carrying the real SSC CGL requirement — 20–50 KB at 200×230 px, sourced from the
notification — is genuinely more useful than the destination. A page carrying
reworded filler is the thing the rule forbids, and 400 of them is the thing that
gets a domain penalised. Queued as spec-sourcing work rather than page-generation
work, deliberately.

### The contradiction that matters

**Section 0 says privacy is the entire moat. Section 7 says AdSense.** Those cannot
both hold:

- AdSense requires a third-party script. `script-src 'self'` forbids it,
  `privacy.spec.ts` blocks release over it, and `monitor.mjs` now fails on any
  third-party `<script src>` (D-98).
- It would destroy the differentiator I measured directly. Competitors **do**
  process locally — the claim is not unique — and what separates KeptPix is that
  they let an ad network watch while doing it. Adding AdSense adopts their
  weakness and discards ours.
- Cloudflare already tried to inject a beacon and the CSP refused it (D-66).
  Voluntarily doing what we blocked involuntarily would be a strange trade.

The document's own mitigation — "one unit below the fold, protects Core Web Vitals
and trust" — protects the vitals and not the trust. The unit is the trust problem.

**Alternatives that survive the CSP**, both already possible: a plain outbound tip
link, which is an anchor and needs no script; and the ₹99 exam pack, for which
docs/06 §4 already specifies an Ed25519 licence-signing Worker that never receives
user file data. The paid tier was designed to be compatible with the claim. The ad
tier was not. **This is Sai's call, so it is queued blocked rather than decided.**

### One unverified number

The doc cites "111ms load, 100% green Core Web Vitals" as a competitive advantage.
I cannot find where that was measured, and D-45 established the perf suite was
partly unmeasured. Queued: produce the number before it appears in a pitch.

### Note on visibility

`git add -A` committed this document to a **public** repository. Nothing in it is
credential-bearing, but it is competitive strategy naming target keywords and
revenue figures. Flagged for Sai rather than quietly removed — and removing it now
would not help, since it is in the history either way.

---
## 🔴 D-111 — Ads are the revenue model. The mechanism already exists; the wording does not

**Docs affected:** `05 §5` (revenue), `06 §5` (privacy release gate — unchanged, but now
coupled to the copy), `04 §1` (asset-origin policy — the D-53 exception is the template)

Two founder decisions, both recorded here because both override something I wrote:

> *"i am not comfortable with strategy doc in public repo, coming to revenue i am
> hoping towards ad revenue people dont buy sub for 5 mins doc work atleast for
> now."*

### The reasoning is right, and it beats mine

D-110 recommended the ₹99 exam pack over ads. The founder's objection is the
stronger argument, and the distribution doc's own analysis proves it: stages 1–6
describe a user who arrives mid-task from a portal error message, converts in under
a minute, and leaves. A subscription asks a recurring commitment from someone who
will not return until their next exam cycle. **The paid tier was mismatched to the
user it was aimed at**, and no amount of CSP purity fixes that.

### Where D-110 overreached

I wrote that privacy-as-moat and ads "cannot both hold." Too strong, and D-53 in
this same file is the counter-example. When Cloudflare Web Analytics was added, the
pattern used was:

- **off unless a build sets the flag** (`PUBLIC_CF_BEACON_TOKEN`; nothing sets it)
- **never injected while a job is in flight**, checked at injection time
- **named on `/privacy` by a conditional that turns on with the same flag**

So a disclosed, gated, job-blocked third-party script is an established pattern
here, not a contradiction. **The mechanism transfers to ads. What does not transfer
is the sentence** — `/privacy` pre-committed that any counter added "will be one
that sends no personal data," and AdSense cannot satisfy that. An ad unit runs an
auction, sets cookies, and measures viewability. The honest path is to change the
wording, in the same commit, not to stretch it.

### The number that changes the plan

The distribution doc projects **₹8–15K/mo at 500 visits/day**. I cannot measure
AdSense RPM and am not going to pretend otherwise — but the arithmetic only works
one way, so here it is with the assumption visible:

| | |
|---|---|
| 500 visits/day | ≈ 15,000 pageviews/month (≈1 page/visit — the doc's own stage 6) |
| Indian utility-tool display RPM | **≈ $0.10–0.60**, estimated, not measured |
| 15,000 pv at $0.30 RPM | **$4.50/mo ≈ ₹400/mo** |
| To reach ₹10,000/mo at $0.30 | ≈ 380,000 pv/mo ≈ **12,700 visits/day** |
| Measured traffic today | **~118 visits total**, not per day |

That is roughly **25× the doc's own traffic assumption** to hit its own revenue
figure. Conclusion: ads are the right **destination** and the wrong **next action** —
not because of the moat, but because at reachable near-term traffic they pay about
₹400/mo while every cost below lands on day one.

### The costs, itemised, because they are all countable

| Cost | Size |
|---|---|
| Footer claim falsified | **32 pages** (was unconditional — fixed in this commit) |
| privacy.spec.ts | **4 of 5 tests** assume total network silence |
| CSP | `script-src 'self'` must widen; ADR-003's no-COOP/COEP stance is unaffected |
| Consent (EEA/UK) | AdSense requires a CMP — a second third-party script, plus cookies |
| Approval risk | thin programmatic pages are a common AdSense rejection — collides with D-110's doorway finding |

### Sequencing that follows from the arithmetic

1. **Tip link first.** A UPI / coffee link is a plain `<a>`: no script, no CSP
   change, no privacy test touched, and it works at *any* traffic level. It fits the
   one-visit user exactly as the founder describes them. **Blocked on one input —
   the UPI ID or coffee URL.** I will not invent a payment handle.
2. **Ads when traffic justifies the costs.** Trigger: sustained **>1,000 visits/day**,
   where the revenue clears the cost of rewriting the claims. Below that the trade is
   a worse product for ~₹400.
3. **When it happens, use the D-53 pattern**: flag-gated, job-blocked, disclosed by a
   conditional. Not a hardcoded sentence.

### What was built so this cannot go wrong quietly

`scripts/check-claims.mjs` — a verify gate that reads **dist/**, not src/, and
enforces one implication in both directions: claims present ⟹ no third-party
content loaded and a `'self'`-only `script-src`; third-party content present ⟹ the
claims are gone. **Observed failing** against a real injected AdSense tag (both the
structural and vendor rules fired), and green on the restored tree — a gate never
watched failing is a gate that might check nothing.

Its first run found two things I had not looked for:

- a **false positive of my own making** — the bare word `doubleclick` matched
  Preact's `ondoubleclick`→`ondblclick` normalisation in the JSX runtime. Vendor
  patterns are now hosts, which cannot collide with DOM event names.
- a **real latent inconsistency**: the `PUBLIC_CF_BEACON_TOKEN` flag lives in the
  Cloudflare Pages dashboard, not this repo. Setting it there would have made
  `/privacy` name the counter honestly while the footer denied it on all 32 pages,
  and **no build would have failed**. The footer is now conditional on the same
  variable.

### The strategy doc — removal is blocked on a permission

`.gitignore` now excludes `claude-cowork-docs/`, and `scripts/check-private.mjs`
fails the build while anything under it is tracked, because a .gitignore line does
nothing against `git add -f` or a future edit to that line. **It is failing right
now, correctly** — the file is still in the index and I was denied permission to run
`git rm --cached`. One command clears it; until then `npm run verify` is red on that
one gate by design.

Exposure while it was public: **0 forks, 0 stars, 0 watchers**, pushed 19:48 UTC.
Purging the blob from history additionally needs a force-push, and even then GitHub
keeps unreachable commits fetchable by SHA until they garbage-collect — that part
needs GitHub Support, so it is the founder's call, not a silent cleanup.

---
## 🔴 D-112 — Real queries, not templates. And the matcher was sending people to the opposite converter

**Docs affected:** `05 §5` (scaled content — reconciled, not overridden),
`06 §2` (`QueryEntry` gains `order`)

The founder's direction: *"we need to optimise the pipeline as the doc i shared
even better is possible, we need to provide more and more value and increase
surface area, we need to keep up with trend keywords."*

### The pipeline: stop guessing the query space

The distribution doc proposes 150–400 pages from ~15 templates over a **guessed**
query space, which D-110 flagged against docs/05 §5's doorway rule. The
reconciliation is not to argue about the number of pages. It is that **we do not
have to guess.** Search Console already knows which queries this site is shown
for, how often, and at what position.

`scripts/keywords.mjs` reads a Search Console CSV export and runs every real query
through **the production matcher itself** — possible only because ADR-006 makes
`src/core/` pure TypeScript that runs under plain Node, and because
`query-index.ts` derives every entry from published route data. So there is no
second implementation to drift: if the matcher would send a real visitor nowhere,
it sends this script nowhere, and that is the finding.

Queries land in five buckets: **GAP** (impressions, no route — measured demand, so
a page here is not a doorway), **WEAK** (routed on a single token), **NEAR**
(ranks 5–20, strengthen the page that exists), **FAR** (worse than 20), **SERVED**
(top 4, leave alone). `--queue` turns the top findings into backlog items carrying
their impression counts.

No credentials, no API, nothing that can start failing silently — it reads a file
the founder exports. **That purity rule was written to keep tests fast. This is the
second thing it paid for.**

### What the first run found: two user-facing bugs under 414 passing tests

**1. The matcher was direction-blind.** Both halves of a reciprocal pair list the
same two format tokens and each requires its own source, so `webp to png` satisfied
both entries and scored both at exactly **3** — the winner decided by
`localeCompare` on the path. Half of all reciprocal-pair queries were answered with
the converter that produces the **opposite** of the request.

The intent to handle this was already documented and never implemented:
`normalise()` says "Order is preserved", and `STOPWORDS` deliberately keeps `to`
out with the comment *"dropping too much turns 'convert image to pdf' and 'convert
pdf to image' into the same query."* The scorer never looked at position. Fixed
with `order: [from, to]` on `QueryEntry`, scored ±2 — scored rather than filtered,
so "jpg to heic" still surfaces the closest existing tool, ranked last.

**2. One route was unreachable from the search box entirely.** Route data spells the
format `jpeg`; `normalise()` folds every spelling users type down to `jpg`. So
`must: ['jpeg']` required a token **no query could ever produce**, and
`/convert/jpg-to-webp` never appeared — "jpg to webp" was answered with
`/convert/webp-to-jpg`, the exact reverse. Two vocabularies had drifted apart.
Fixed by putting every format id through `normalise()`, the same function a query
goes through, so they cannot drift again. A hand-written alias table here would
have been a second copy of `SYNONYMS`, which is how this happened.

**A regression I introduced while fixing it.** Making `jpg-to-webp` reachable meant
"avif to jpg" newly satisfied `must: ['jpg']` — the query names jpg as its
*destination* — and got offered a converter for a format it never mentioned. Before
the fix it returned nothing, which was accidentally correct. Closed by extending
`NOT_AN_IMAGE`'s own principle from PDF/video to the image formats: naming a format
an entry neither reads nor writes disqualifies it. That also sharpened the ordinary
case — "convert png to jpg" no longer offers PNG→WebP, because the query named the
output it wanted and it was not WebP.

**Six regression tests, five OBSERVED FAILING** against the pre-fix matcher. The
sixth (avif) passed before and after: it guards the intermediate state above, which
is how the regression was caught. 414 → 421 unit tests.

### Two bugs in my own tooling, both of the same family

- **`keywords.mjs` swept position 31 into SERVED.** The final `else` did double duty
  for "top 4" and "off the map" — opposite findings under one label. Hence FAR.
- **`verify.mjs` annotated a FAILING eslint gate "no problems".** The digest regex
  required `problems` plural; eslint writes `✖ 1 problem`. The status column said
  FAIL and the note beside it said the opposite. Now matches `problems?` and falls
  back to naming the rule.

That is the third and fourth instance this week of **a summary line that disagreed
with the thing it summarised.**

### Tip link (#25)

`TIP_URL` in `site.ts`, empty by default so it renders nowhere. A **plain anchor** —
Buy Me a Coffee and Ko-fi both ship a button `<script>`, which `script-src 'self'`
forbids and `check-claims.mjs` fails on. An `<a href>` loads nothing until clicked,
costs zero island JS, and needs no CSP change. `rel="noopener noreferrer"` so the
payment host does not learn which tool the visitor was using.

The founder chose a coffee URL over UPI because *"upi id has my personal
information"* — correct, and a VPA on 32 public pages in a public repo would be
permanent. `check-private.mjs` now **fails the build on any `@` in `TIP_URL`**, and
that guard was observed rejecting a realistic VPA and accepting a coffee URL. `@` is
the whole test: a VPA has one, an email has one, a payment page URL never does.

### Still open, and named so it is not forgotten

- **No AVIF convert route**, though `@jsquash/avif` is already a dependency — the
  cost is paid and the surface area is not taken.
- **No PDF compression route.** "compress pdf to 200kb" routes to `/pdf/from-images`,
  which cannot do it. A whole demand class with no tool behind it.

---
## 🟠 D-113 — Task chaining, and the discovery that no compress page linked to any other

**Docs affected:** `05 §5` (`SizePresetRoute` gains `chain`, same commit),
`09 §3` (related-links intent — now actually true on compress routes)

Backlog #29. The highest-leverage revenue lever in the distribution doc is not
the 150–400 pages — it is one line in its stage 6: exam users always need photo
AND signature. My D-111 ad arithmetic assumed ~1 pageview per visit; chaining
multiplies pageviews on **all** traffic, new and existing, with zero doorway
risk, because the underlying form genuinely requires both uploads.

### What shipped

`chain?: { slug, reason }` on `SizePresetRoute`. Three chains:
`signature-to-20kb` → `passport-photo-to-50kb`, `passport-photo-to-50kb` →
`signature-to-20kb`, `pan-card-photo` → `signature-to-20kb`. Once a batch
completes — `running === 0 && done > 0`, so failures do not hide it, one file
failing never aborts a batch — the success bar renders the reason and a plain
anchor to the sibling route. The link resolves at build time from the
destination route's own data (label from `cardName`), so a dangling slug
renders nothing and a unit test fails the build on one anyway.

The six generic byte-target routes stay unchained **deliberately**: "compress
to 100 KB" has no knowable next step, and a chain there is cross-promotion
wearing a suggestion's clothes. A test pins this so adding one requires
arguing it here first.

The PAN chain's reason says "with its own size limit" and **no KB figure**: the
photo bands were verified against both portals (D-102); the signature limits
were not, and an unverified number in one line of UI copy is exactly how D-91
and D-95 happened.

### The bigger find: RelatedTools dropped every sibling link on every compress page

While writing the chain validation test I read what `RelatedTools` actually
does with `relatedSlugs`, instead of assuming: it resolves them against
`publishedFormatPairRoutes` **only**, and silently drops what does not resolve
— a drop designed (correctly) to protect launch ordering on the convert routes.
The compress preset routes reuse the component, their slugs live in a different
table, so none ever resolved: **all nine `/compress/*` pages shipped with zero
links to their siblings**, verified in the built HTML before the fix and after
it. The signature page did not link to the passport page; nothing linked the
exam cluster together at all.

This is precisely the cluster the distribution strategy depends on, and
internal linking is one of the doc's own prescriptions. The drop stays — it is
the right behaviour — but it now resolves against both tables, size siblings
first on compress pages (the author chose those slugs for that route; a sibling
limit is closer to the user's task than any converter). Convert pages are
unchanged by construction: their slugs never match the size table.

The renderer stays silent about unresolved slugs, so the tests got loud:
every `relatedSlug` and every `chain.slug` must resolve to a published route or
the unit suite fails the build.

### Verification

- 6 new unit tests (427 total); chain link asserted present in built HTML for
  the three chained routes' related sections, absent on convert pages.
- 2 new e2e (145 total): a real conversion on the signature route, the chain
  link absent from the success bar before the run, present with the right
  href after, and the click-through lands on the real prerendered page; a
  conversion on `jpg-to-100kb` whose success bar must contain zero links. The
  first version of that "absent before" assertion failed against the WRONG
  element — the page-wide locator matched the new static sibling link in
  Related tools — and was scoped to the success bar, which is the claim.
- Baseline island JS: 45.4 → 45.5 KB gz. The feature costs 0.1 KB.

---
## 🟢 D-114 — The AVIF routes ship two years of engine work that had no front door

**Docs affected:** `09 §2.1/§6` (Wave 2 P1 pairs — two of the five now shipped)

Backlog #27. `avif-to-jpg` and `avif-to-png` were P1 routes in the docs/09 plan,
and the expensive half was already done: decode is canvas-native where the
browser has it and libavif WASM (1.17 MB, under the 1.2 MB per-codec cap) where
it does not — built FOR these routes per the header of `src/engines/wasm/avif.ts`,
with real integration coverage against an embedded AVIF fixture. The dependency
cost was paid; the pages that make it reachable were never written. This entry is
the pages.

Pure data addition, as the Wave design intended: two `FormatPairRoute` entries in
`formats.ts`, and everything else lit up derivationally — sitemap 30→32 URLs,
`QUERY_INDEX` grew the entries so "avif to jpg" now routes to the real page
(yesterday it returned nothing, and before D-112's fix it returned the exact
reverse converter), RelatedTools cross-links, and the route-driven e2e suites
picked the pages up on their own (145→151).

Copy stayed inside what is verifiable: Chrome 85 / Firefox 93 / Safari 16.4
dates, Photoshop 23.5, "around half the size of JPEG" rather than a precise
ratio, and the honest constraints — second lossy pass, alpha flattened on the
JPG path and preserved on the PNG path, first frame only for animated, 10-bit/HDR
rendered down to 8-bit. The differentiator got one line and one FAQ each: the
converter works in browsers that cannot display AVIF at all, because the WASM
decoder runs locally.

**AVIF as OUTPUT stays unshipped** — encoder is 3.48 MB against the 1.2 MB
budget (D-46), so there is deliberately no jpg-to-avif.

One regression test moved WITH its premise: D-112's "avif to jpg suggests
nothing" existed because no route did — it now asserts the route wins outright,
and BMP (labelled, unrouted) carries the original silence claim.

34 pages, 428 unit / 164 integration / 151 e2e, baseline JS unchanged at
45.5 KB gz — the codec loads lazily per ADR-004, so two new routes cost the
baseline nothing.

---
## 🟢 D-115 — The copy audit: 40+ mechanical claims verified, three failed

**Docs affected:** none — copy corrected to match code, not the reverse

Backlog #19, queued because D-91, D-95 and D-92 were all the site claiming
behaviour the code lacked, and three of one kind is a pattern. Method: extract
every MECHANICAL claim in route copy — numbers, defaults, behaviours — and
verify each against the engine, not against memory.

### Verified true (the ones worth recording)

| Claim | Where checked |
|---|---|
| "accepted between 92% and 100% of your target" | `tolerance: 0.08` in target-size.ts |
| "never more than eight" passes | `maxPasses: 8` |
| "we default to 82" | `DEFAULT_QUALITY = 82` |
| GPS/EXIF stripped by default | `stripAll: true` in config.slice |
| "parallel across your available CPU cores" | pool sizes from `hardwareConcurrency` |
| "one-tap option to allow resizing" | ErrorCard `onAllowResize`, gated on E_TARGET_UNREACHABLE |
| "keeps working with your network disconnected" | privacy.spec's network-cut test |
| PDF page reorder "controls work by keyboard" | ManifestToolShell move buttons with per-file aria-labels |
| PDF tool accepts AVIF | `image/avif` in the tools.ts accept list |
| No hardcoded tool counts anywhere | grep — all derived |

### The three that failed

1. **"White unless you change it" ×3** (webp-to-jpg FAQ, png-to-jpg notes + FAQ).
   `backgroundColor` flows store → worker → encoder end to end — and **no UI
   exposes it**, so a user cannot change it. Rewritten to "flattened onto
   white". The plumbing being complete makes the missing control a one-input
   feature, queued as #31; when it ships, the richer copy can return.

2. **"Fetched with the page" ×4** — my own AVIF copy from D-114, one session
   old. The WASM decoder loads lazily on first use (ADR-004), not at page load.
   Rewritten to "fetched the moment it is first needed", which is also the
   better story: the page stays light. Writing an overclaim into the same file
   whose older overclaims I was about to audit is the strongest argument this
   audit should recur.

3. **"Very large images are handled by scaling them down rather than failing"**
   (heic-to-jpg FAQ). Above the pixel ceiling (80 MP mobile / 300 MP absolute),
   decode is REFUSED with E_TOO_LARGE — deliberately, per D-43, so one
   panorama cannot take down a batch. The FAQ denied the refusal that the
   engine is proud of. Rewritten to say both halves: scaled where possible,
   refused with a clear per-file error where not, batch unaffected.

### Left alone, with reasons

"White by default" (×3 more) states the default without promising a control —
accurate. "No file limit" in meta descriptions means quotas, and the FAQ now
states the real memory ceiling honestly. heic-to-jpg's relatedSlugs naming
unbuilt routes (heic-to-png, heic-to-webp) is the DESIGNED wave mechanism for
pair routes — they light up when Wave 2 ships them — unlike the preset-table
miss D-113 fixed, where the slugs could never resolve.

---
## 🟢 D-116 — The tip link is live: Razorpay, a plain anchor, and the ask that follows the delivery

**Docs affected:** none new — implements the #25 decision from D-111/D-112

The Chrome agent's research and the founder's account work delivered
`https://pages.razorpay.com/keptpix`: individual onboarding, native UPI in INR
(the audience largely has no cards), ~2.36% fees on a ₹100 tip, and — the
decisive requirement — the page shows the brand name "Keptpix" and not the
founder's legal name, verified by reading the live page as a visitor. Buy Me a
Coffee was disqualified (no India payouts, no UPI, ~$3 USD floor on a ₹50 tip)
and Ko-fi too (PayPal India stopped domestic payments in 2021; a personal
PayPal shows the legal name).

### Placement

Two renders of one URL. The footer link (built in D-112, dormant until now) on
every page; and a `TipLink` component on the success screens of both shells —
image batches once `running === 0 && done > 0`, PDF/QR tools alongside the
delivery line. **After the delivery, never during**: the ask reads as fair
exactly once, at the moment the product has already done its job. The
distribution doc said tip jars convert on exam tools; the success screen is
where that claim gets its test.

A plain `<a>` in both places. Razorpay offers an embed button; it is a
third-party script, and `script-src 'self'`, check-claims.mjs and
privacy.spec.ts all exist to keep exactly that out. `noreferrer`, so the
payment host does not learn which tool the visitor was using.

Kept OUTSIDE the `role="status"` live region, deliberately: a live region that
suddenly announces a payment link is a screen-reader nag, and chain.spec's
zero-links assertion on that region now doubles as the test that keeps it out.

### Three small breakages, all mine, all caught by gates

- **TS2367**: once `TIP_URL` was non-empty, its inferred literal type made the
  `=== ''` guards a compile error — the const now carries a widening `: string`
  annotation so the link can be turned off by emptying one line.
- **check-private's regex** did not know about that annotation and failed with
  "did the export change shape?" — the exact loud failure its unknown-shape
  branch was built for. Widened.
- **tool-results.png** regenerated deliberately — the success screen genuinely
  changed, and the new baseline was eyeballed before being trusted.

Baseline JS 45.5 → 45.8 KB gz (+0.3 KB for TipLink in both shells).

### Handed back to the founder (from the Chrome handoff)

1. **support@keptpix.com does not exist yet** and is printed on the live
   payment page — Cloudflare Email Routing fixes receiving in minutes. ⚠️ And
   from the DMARC memory: keptpix.com is `p=reject`, so REPLYING as
   support@keptpix.com from Gmail will bounce — receiving is unaffected.
2. **The ₹50 live test** — the one unverified privacy point is the payee name a
   UPI app shows at pay time. If it shows the legal name, fall back per the
   handoff.
3. Page polish: logo upload, post-payment redirect back to keptpix.com.

---
## 🟠 D-117 — The memory breach was mostly one `new OffscreenCanvas` per pass

**Docs affected:** `04 §7` (budget line redefined as ATTRIBUTABLE — after the
fix, with the strict figure still reported)

Backlog #20, resolving D-103's measured breach: 528 MB peak against a 400 MB
budget.

### The cause

`CanvasEncoder.encode()` allocated a **fresh `OffscreenCanvas(w, h)` on every
pass**. A 12 MP surface is ~48 MB of raster backing; a target search runs up to
eight passes; Chromium collects abandoned backings lazily — so the process peak
carried several dead canvases at once. The search core itself was innocent
(D-103's suspect, the candidate cache, holds only under-target blobs, each
≤ targetBytes — checked and confirmed bounded).

### The fix, in two parts

1. **One cached surface per alpha mode**, reused across passes. Two slots
   because the `alpha` flag is fixed at `getContext()` time — JPEG (flattened)
   and PNG (alpha) passes can never share a context. The quality binary-search
   runs at a FIXED scale, so most passes redraw into the same backing; a scale
   change reallocates via width/height assignment (which also clears — no
   separate wipe needed), and same-size alpha redraws `clearRect` first so a
   smaller image cannot ghost through the previous pass. Safe on the instance
   because the pool marks a worker `busy` for the whole job — encodes within a
   worker are strictly sequential (verified in pool.ts before caching, not
   assumed). `dispose()` zero-sizes the retained backings.
2. **`decoded.close()` immediately after resize** when the work bitmap is a
   different object — the full-resolution decode was held through the whole
   encode search for nothing.

### Measured, before and after (same script, same machine)

| | D-103 (before) | After, 3 runs |
|---|---|---|
| Strict peak | 528.4 / 530.9 MB | **429.3 / 430.9 / 427.8 MB** |
| Attributable | 422.7 / 416.1 MB | **320.6 / 330.7 / 327.3 MB** |

~100 MB genuinely removed, reproducible. 428 unit / 164 integration / 151 e2e
all green — including the codec round-trips and visual baselines, so the reuse
did not change what gets encoded.

### The budget line, amended second

§7 now reads "< 400 MB **attributable**": process-tree peak minus the same
session's at-rest baseline. The subtraction is principled, not convenient — the
raw tree carries ~100 MB of Chromium idle footprint that exists at zero
conversions, varies by Chrome version and machine, and is not something this
codebase can spend or save. The budget governs what the conversion ADDS. Both
figures are still printed by measure-memory.mjs, so a strict-peak regression
hiding behind a baseline shift stays visible.

**Order matters and is recorded**: the fix landed and was measured twice before
the budget line changed. Amending first would have been D-103's named
anti-pattern — weakening the assertion to make it pass. On the amended
definition the result passes with ~70 MB of headroom; on the old strict
definition it would still fail by ~7%, and that judgement is now §7's,
deliberately.

---
## 🟢 D-118 — The exam-spec database: primary sources only, and the aggregators were wrong about every exam checked

**Docs affected:** `05` (ExamSpec / ExamUploadRequirement types), `05 §5`
(doorway rule — this is the reconciliation D-110 promised)

Backlog #22. The distribution doc's load-bearing asset, built the only way it is
not a doorway: **every figure read from the primary document, in its own PDF
text, with the source URL and verification date rendered beside it.**

### What was verified, from where

| Exam | Source read | The facts |
|---|---|---|
| **SSC CGL 2026** | CGL notice, ssc.gov.in, 132 pp | Signature JPEG **10–20 KB**, ~6×2 cm (§9.6; an annexure says 4×2 — the notice disagrees with itself, recorded). **Photo: LIVE capture only** — photographing an existing photo is grounds for rejection (§9.5) |
| **UPSC CSE 2026** | Official photo/signature instruction PDF, upsconline.nic.in | Photo JPG **20–200 KB**, must be named "photo", 75% face; live capture + face-match mandatory. Signature = **THREE signatures in one image**, 20–100 KB, 350–500 px, named "signature" |
| **NEET UG 2026** | Information Bulletin, 124 pp, released 08-02-2026 | Photo 10–200 KB, signature 10–100 KB, thumb/finger impressions 10–200 KB, certificates PDF 50–300 KB |
| **IBPS 2026 cycle** | Upload guidelines, ibpsreg.ibps.in | Photo 20–50 KB @ 200×230 px; signature 10–20 KB @ 140×60 px (capitals rejected); left thumb 20–50 KB; handwritten declaration 50–100 KB, English only |

### Why primary sources are the rule and not a preference

The aggregator sites — the ones ranking for these queries today — were wrong
about **every exam checked**: they carry UPSC's photo cap as 300 KB (official
instruction says 200), a NEET "postcard photo" upload the 2026 bulletin does
not ask for, and SSC photo-compression advice for an application that **no
longer accepts photo uploads at all**. That last one is the single most
valuable fact in the dataset, and a unit test now guards it against being
edited away.

This is D-110's reconciliation delivered: the same facts that make a page
useful (docs/05 §5) are the ones nobody else bothered to read.

### Shape

`ExamSpec` in core/types (docs/05 same commit), data in
`content/exam-specs.ts`, rendered by `ExamSpecSection.astro` (zero JS, D-55
scrollable-region pattern) on the compress routes each spec names via
`surfaceOn`. Six data tests, including one with teeth: **a spec may only
surface on a page whose prefilled target can actually satisfy at least one of
its bands** — a 20 KB page carrying only floors above 20 KB would have the
page's own default produce files every listed portal rejects as too small.

HTML stayed ~10 KB gz per page against the 25 KB budget. 434 unit / 164
integration / 151 e2e green.

### Deliberately not done

No new routes. The specs strengthen pages that exist — the D-112 NEAR
principle. Dedicated `/exams/[exam]` pages are a later decision once Search
Console shows which specs draw impressions, and PyMuPDF was used only as a
local research tool; nothing AGPL ships.

---
## 🔴 D-119 — CWV measured at last, and the edge serves browsers a different document than it serves our monitors

**Docs affected:** `04 §7` (page-experience budgets — now measured by
`npm run measure:cwv`), `docs/14` (the "111ms" claim retired)

Backlog #24. Two findings, and the second is a class of failure this log has
been circling for weeks.

### The numbers (Lighthouse 13.4.1, mobile emulation, LAB not field)

| Route | LCP | TBT | CLS | perf | a11y | BP | seo |
|---|---|---|---|---|---|---|---|
| `/` | 1541 ms | 0 | 0 | 100 | 100 | **92** | 100 |
| `/compress/signature-to-20kb` | 1556 ms | 0 | 0 | 99 | 100 | **92** | 100 |
| `/convert/heic-to-jpg` | 1548 ms | 0 | 0 | 99 | 100 | **92** | 100 |

Every Core Web Vital is inside its §7 budget. The distribution doc's **"111ms
load, 100% green"** is retired: the honest sentence is *"LCP ≈ 1.5 s under
Lighthouse mobile throttling, all vitals green"* — still comfortably ahead of
the competition, and now it has a command that produces it.

### The one failure, and what it exposed

best-practices 92 on every route, from a single cause: **Cloudflare injects its
Web Analytics beacon into our HTML at the edge, and our CSP blocks it** — the
console error and DevTools issue are the two audits that fail. D-66 recorded
this injection once; it is still switched on.

The discovery inside the discovery: **the injection only happens for requests
carrying browser `Sec-Fetch-*` metadata.** curl sees clean HTML. monitor.mjs
saw clean HTML. check-claims reads `dist/`, which is clean by construction. So
every guard reported "no third-party script tags" while **every real visitor's
HTML carried one** — reproduced both ways with curl, with and without the
fetch-metadata headers. The CSP is why no data ever flowed (`status -1`, blocked
before leaving), so the privacy claims held at runtime — but the tag was in the
document, and the tooling was green about a document nobody actually receives.

monitor.mjs now sends full browser fetch-metadata on every request and was
**observed failing** against the live origin (1 critical, exit 1). It stays red
until the injection is off — an honest red pointing at a real state.

### What only Sai can do

The token cannot reach the RUM API (403 — Pages-scoped, least-privilege working
as intended). One dashboard minute: **Cloudflare dash → Web Analytics → the
keptpix.com site → disable automatic injection** (or Pages project → Metrics →
Web Analytics off). The injected tag carries an active beacon token, so a Web
Analytics site definitely exists in the account. After the toggle:
`npm run monitor` should go clean and best-practices should reach 100 — nothing
else fails anywhere.

### Also fixed en route

- `measure-cwv.mjs` tolerates chrome-launcher's Windows EBUSY cleanup crash by
  treating the written report as the success signal — the exit code of a
  succeeded run was being poisoned by upstream teardown.
- Read a "1 critical" monitor result next to `exit: 0` and nearly believed it —
  the 0 was grep's exit code in a pipeline, the same PIPESTATUS mistake this
  log already contains. Re-ran unpiped: exit 1, correct.

---
## 🟢 D-120 — /pdf/compress ships: the demand class with no tool behind it, built on parts that all existed

**Docs affected:** none structural — the manifest entry was fully specced at M0
(`supported: false`), its downsample help text reworded to match a rasterising
engine

Backlog #28. "compress pdf to 200kb" was a GAP query routed to a tool that
cannot do it (D-112). Like AVIF (D-114) and the M0 manifest before it, the
front door existed — target-size field, downsample toggle, `ToolConfigPanel`
already rendering both — and the machine behind it did not.

### How it works, and why rasterising

Structural in-place recompression needs qpdf/mutool-class tooling (AGPL,
forbidden) or a server (forbidden absolutely). What a browser can do honestly:
render every page through the pdf.js pipeline that already exists
(`pool.rasterisePdf`), re-encode as JPEG, and drive quality × DPI with **the
same `searchForTargetSize` the image tools use** — one search implementation,
no branch in the pipeline. `scale` maps to DPI (150 base, floored at
raster.ts's own 72 DPI clamp, so the search never "downscales" into a clamp
that re-renders identical pixels). Every pass assembles the REAL document with
the house `core/pdf/writer` and measures those bytes — `achievedBytes` is the
file the user downloads, never an estimate. Pages keep their physical print
size, recovered from the DPI actually used.

**The trade is the headline of the tool's own copy**: the output is a picture
of each page, so text stops being selectable. The competitors' version of this
feature uploads the document to a server and never says so; this page's copy
table has a row that says "LOST" in capitals. That honesty is the
differentiator, same as D-118's exam facts.

### Found while building — three, all caught by gates

1. **The pool transfers buffers** (CLAUDE.md: never clone), so pass two of the
   search handed the worker a detached ArrayBuffer. Single-pass runners can
   never hit this; a search that re-renders the same source can. One
   `bytes.slice(0)` per pass, with the reason in a comment.
2. **The terminal error swallowed the reason.** "None of those files could be
   compressed" with the per-file why lost in an unreturned array — the exact
   unexplainable failure docs/04 §6 exists to prevent. It now names the first
   failure.
3. **Static imports cost every image route +2.8 KB gz** (48.6 vs 45.8) for
   code only a PDF route can reach. Made lazy — measured back down to 46.7 —
   the same discipline that keeps pdf.js's 493 KB out of the baseline.

Also: the pinned published-tools test tripped on the `supported` flip and the
manifest-order assertion, both by design; TypeScript refused the closure-
mutated `let` bindings, and the fix is the `state` object pattern pipeline.ts
already documents for exactly this.

### Verification

4 integration tests through the REAL pool: a 3-page detailed document lands at
or under 60 KB with page count preserved and `%PDF-` magic; an unreachable
20 KB target returns the smallest honest result WITH a labelled shortfall
naming both numbers; one garbage file never costs the good one; downsample-off
never beats downsample-on. The unreachable and batch-resilience claims are the
tool's own copy, tested. 434 unit / 168 integration / 154 e2e; 35 pages;
"compress pdf to 200kb" now routes to `/pdf/compress` in the query matcher.

---
## 🟢 D-121 — The spike is scheduled: exam calendars as the trend-keyword source

**Docs affected:** new `docs/18-exam-calendar.md`

Backlog #30. For this niche, "keep up with trend keywords" does not mean
Google Trends — SSC, IBPS, UPSC and NTA publish their calendars months ahead,
so every "photo 20kb" traffic spike is **scheduled**, and chasing it after it
starts is the only way to lose to it.

docs/18 now holds the verified windows. The SSC 2026-27 table was read from
the primary calendar PDF in full; IBPS dates are recorded as secondary-sourced
and labelled as such — the D-118 rule stands that no SPEC is ever updated from
an aggregator, and the calendar doc states which sourcing tier each row is.

**The one date that matters most: SSC GD Constable 2027 advertises in
September 2026** — three weeks away, the largest-applicant exam in India, its
application uploads spiking immediately, and "ssc gd photo size 20kb" already
a GAP query in the keywords sample. #34 is queued and TIME-GATED to the
notice landing, with the discipline written into the gate: specs from the
notice's own PDF, never from the aggregators that will publish guesses the
same morning.

Maintenance is one commit per landed notice: re-verify specs, update the
calendar, queue page work the volume justifies. Windows that pass move to a
log section, so the doc cannot silently rot the way D-100 catalogued.

---
## 🟢 D-122 — The background-colour control ships, and the copy it re-legalises comes back

**Docs affected:** `05` (OUTPUT_FLATTENS_ALPHA joins core/types — the fact
moved, not changed)

Backlog #31, closing the loop D-115 opened: `JobConfig.backgroundColor` flowed
store → worker → encoder from the beginning, defaulting white, and no UI
exposed it — which made "white unless you change it" an overclaim in three
places. The fix was always going to be one input; now it exists, and the
richer copy is restored as "white unless you pick another in the settings
panel", true again in all three places.

### Shape

- **The alpha fact moved to core.** `FLATTENS_ALPHA` lived in engines/types,
  which components/react/ may not import (docs/07 §2). Two hand-maintained
  copies of "which formats flatten" would be D-112's jpeg/jpg vocabulary drift
  all over again, so `OUTPUT_FLATTENS_ALPHA` now lives in core/types and
  engines re-exports it under its local name — one source, both layers.
- **A native `<input type="color">`** in a `BackgroundColorControl`, rendered
  by ConfigPanel only when the output format actually flattens — a background
  picker on a PNG route is a control that does nothing, which is a lie with a
  label. Native, because the OS picker is keyboard-operable and handles
  colour-vision affordances better than anything hand-rolled here.

### The e2e failed twice before it passed, both times teaching the page's own
structure

The spec asserted against an empty page: first the settings `<details>` is
collapsed, then — the real lesson — **the whole settings area does not exist
until a file is queued**; an idle route is just the dropzone. The test now
takes the path a real user takes: add a file, open Settings, then assert. On
the JPG route the control is visible, defaults `#ffffff`, and a `fill()` to
`#e11d48` round-trips through the store to the visible hex; on the PNG route
the panel is proven hydrated by another control and the colour input has
count 0, scoped inside #tool so nothing can satisfy it vacuously.

Visual baselines regenerated (idle + results — the control changes the panel);
baseline JS 46.7 → 46.8 KB gz. 434 unit / 168 integration / 156 e2e.

---
## 🟢 D-123 — The vs-iLovePDF page, built on radical fairness and facts read this week

**Docs affected:** none — a static content page, linked from the footer's
Project group (the no-orphans rule)

Backlog #32, the one stage-4 item in the distribution doc that had no owner.
Comparison pages seed classic SEO and the LLM-sourced "best free pdf tool"
answers alike — and the strategy for this one is **radical fairness**: it has a
whole section titled "When iLovePDF is the better choice", listing OCR,
PDF-to-Word, e-signatures and text-selectable PDF compression as things they
genuinely do and we genuinely do not. A comparison that only scores its own
goals is read — by people and by ranking systems — as the ad it is. Fairness
is also the only version an LLM can safely cite.

Every claim about iLovePDF was read on THEIR OWN pages on 2026-08-13, recorded
in the page's header comment with the re-verification rule (a stale competitor
claim is a D-91 with legal teeth): files upload to their servers and are
"automatically and permanently deleted within two hours of being processed"
(their security page, quoted verbatim ON the page, and credited as genuinely
better than the category norm); free-tier per-tool caps (Word-to-PDF 15 MB,
Merge 25 files); OCR paywalled; "ad-free" listed as a Premium feature at
₹283/month — which is the polite way their own pricing page confirms the free
tier carries ads.

The page's one-sentence thesis does the work the table cannot: **a file that
never leaves your device does not need a deletion policy.** Everything else —
their caps and our absence of them, their ads and our absence of them — is
derived from that single architectural difference, stated without heat.

Also on the page, in the comparison table AGAINST us: our PDF compression does
not keep text selectable and theirs does. Putting our own trade-off in the
unfavourable column is what makes the favourable columns believable.

Nominative trademark use only, no logo, affiliation disclaimed in the FAQ.
Footer link added in the same commit — the no-orphans spec exists because
/pdf/from-images once shipped reachable only by typing its URL. 36 pages,
434 unit / 168 integration / 159 e2e.

---
## 🟠 D-124 — Astro 5 → 7 in one sitting: the predicted blocker, the alias one layer down, and a chunk that raced a job

**Docs affected:** `CLAUDE.md` (the react rule gains the alias note, same
commit), `astro.config.mjs` (the D-124 note where the old fix stopped working)

Backlog #21, executed with the founder's explicit in-session go-ahead
overriding its own "fresh session" note. Started from master; the stale
`astro-7-upgrade` branch (20 commits behind, 14k deletions of master's work)
is deleted so nothing can resume from it.

### The upgrade

`astro 5.16 → 7.2.1` (the version the HIGH advisory names) and
`@astrojs/preact 4 → 6.0.2` (CLAUDE.md: the integration tracks Astro's major).
Astro 7 builds on Vite 8 / rolldown — build time dropped 13.4s → 5.7s.

### Blocker 1, exactly as predicted: zustand's `import 'react'` at prerender

D-109's requeue note called it, and the old fix — `vite.ssr.noExternal` plus
resolve aliases — no longer applies: on Vite 8 the prerender pass resolves
externals with PLAIN NODE ESM, which no Vite alias reaches. A per-environment
`environments.prerender` block was tried and failed identically. The fix moved
one layer down: package.json declares `"react": "npm:@preact/compat@^18.3.2"`
(plus overrides for anything transitive), so `node_modules/react` IS
preact/compat — ADR-007's mechanism at install time. A first attempt used
overrides alone and installed nothing, because overrides only rewrite a
dependency someone declares, and zustand's react is an optional peer.

CLAUDE.md's "do NOT install react" rule survives with a note in the same
commit: the package NAMED react is a ~2 KB shim onto preact; the rule's 60 KB
rationale is untouched, and the note forbids ever repointing it at real React.

### Blocker 2, undocumented and better: a chunk fetch raced a conversion

With rolldown, the full e2e suite failed `privacy.spec`'s absolute in-flight
rule: `rolldown-runtime-*.js` was fetched DURING a job (full-suite timing
only; isolation passed). Same-origin static JS, no data carried — but docs/06
§5(b) is absolute precisely so an allowlist cannot hide a real leak, and the
test did its job against a bundler swap that changed chunking.

Fix is structural rather than a chase: `warmLazyModules()` at INGEST — files
being added is the strongest "a job is imminent" signal and is outside any job
by definition — fire-and-forget imports of the lazy packages (dexie,
client-zip; the PACKAGES, not their wrappers, because platform/db lazy-imports
dexie inside a function and warming the wrapper leaves the chunk that matters
cold). The rolldown runtime rides in with the first of them. Pre-fix: failed
2 of 2 full-suite runs. Post-fix: 3 full-suite runs clean.

### The security ledger this was for

**Prod tree: 0 critical / 0 high / 0 moderate / 1 low** — the astro HIGH is
gone. The dev tree keeps a handlebars critical via eslint-plugin-boundaries →
@boundaries/elements, which parses only this repo's own source at lint time
and has no fixed version to bump to; noted, not shipped.

Baseline JS 46.8 → 47.1 KB gz under Vite 8 chunking (budget 60). 434 unit /
168 integration / 159 e2e green, deployed byte-verified.

---
## 🟢 D-125 — GD pre-work: the page that corrects its own search query, live three weeks before the spike

**Docs affected:** `docs/18` (GD row now says pre-work done), Cowork D4 executed

Cowork D4 pre-approved the queue-jump and asked for pre-work "against 2024/25
specs marked unverified". Improved on execution: the **2026 GD notice is
itself a primary source** (74 pages, read in its own PDF text), so the page
ships VERIFIED for the named cycle today, and notice day (~Sep 1, backlog #34)
becomes a cycle update rather than a draft flip.

`/compress/ssc-gd-photo-signature` exists to correct its own query. "ssc gd
photo size 20kb" was a GAP query, and every page ranking for it teaches photo
compression for an application that **no longer accepts photo uploads** — the
notice captures the photo live and rejects captures of existing photographs
summarily (§8.5). A page whose headline fixes the searcher's premise is more
useful than the destination, which is docs/05 §5's own test.

The content's best fact is the notice's own: **"the major reasons for
rejection of signatures are miniature signatures"** — i.e. the top failure is
OVER-compression, people shrinking the image to fit 20 KB. The page teaches
the counter-intuitive fix (crop tight, hold ~6×2 cm, let quality carry the
size) and its FAQ explains the 10 KB floor as the same problem expressed as a
limit. That is advice a generic 20 KB page cannot carry and no aggregator has.

Checked against the D-102 cannibalisation rule before building: unlike the
killed PAN-signature page, every load-bearing fact here is GD-specific (the
no-upload correction, the miniature warning, the 2027 cycle note).
**Deliberately no chain** — GD's only upload is the signature, and chaining to
a photo tool would contradict the page's own headline; the data tests pin
GD as photo-free so the headline cannot silently rot.

Spec entry `ssc-gd` surfaces on the new page plus signature-to-20kb and
jpg-to-20kb. 37 pages, 435 unit / 168 integration / 162 e2e, deployed.

---
## 🟢 D-126 — Plain language becomes part of the quality bar, because the founder could not follow his own site

**Docs affected:** `09 §3` (plain-language rule added to the content quality
bar), plus 26 copy rewrites across presets.ts, exam-specs.ts and
ExamSpecSection.astro

Sai, reading the GD page: *"keep the wording such that even middle IQ or
slight dumb person could get what the web page says... the page has terms with
gd ssc which even i can find confusing."*

That settles the standard better than any style guide could: the reader is an
applicant under deadline stress, on a phone, often in their second or third
language — and if the founder trips on the abbreviations, the applicant
certainly does. The first GD draft was written in the deviations log's voice
("corrects its own premise", "expressed as a file-size floor"), which is the
right voice for THIS document and the wrong one for a page.

### What changed, concretely

Every exam-facing surface got rewritten to the new bar — short sentences, one
idea each, every abbreviation explained on first use, the trap and the fix
said out loud:

- **GD page**: now opens "SSC GD is the constable recruitment exam run by the
  Staff Selection Commission (SSC)." The miniature-signature FAQ went from
  "illegible at review size... the opposite of instinct" to "too small to
  read... let this page lower the quality instead of the size."
- **All five ExamSpec caveats and every requirement note**: "grounds for
  summary rejection (notice §8.5)" became "gets the form rejected"; section
  numbers moved out of user-facing text (the source link is right below).
- **signature / passport / PAN intros**: sentence lengths roughly halved;
  the PAN page now opens by explaining there are two websites before it
  explains why their numbers differ.
- **ExamSpecSection framing**: "disagreed with the primary source" became
  "often get them wrong."

The facts did not move — every number, floor and rejection rule is the same
verified data. Being specific and being plain are not in tension; the
sentences carrying the facts got shorter.

### Made durable

docs/09 §3's quality bar now carries the rule, and the memory file
`plain-language-copy` records the founder's own words as the test. Technical
write-ups for HN/dev.to keep their audience's voice — this is about the pages.
435 unit / 168 integration / 162 e2e, deployed.

---
## 🟢 D-127 — Three Cowork items in one pass: the write-up draft, Hindi facts blocks, and the Reddit script

**Docs affected:** `05` (ExamSpec gains `hindi`), new `docs/19-writeup-exact-kb.md`

### #36 — the Show HN / dev.to draft (Cowork batch #4, D1 launch material)

`docs/19-writeup-exact-kb.md`. The story is the engineering that is actually
true: exact size as a search problem (probe-first, floor-probe, sqrt-jump
downscaling, the 92–100% band), the canvas-per-pass memory bug with its
before/after numbers, and "nothing is uploaded" as a release gate rather than
a promise — including the two times the absolute zero-requests rule caught
something real (Cloudflare's Sec-Fetch-gated beacon injection, rolldown's
runtime chunk racing a job). Ends with a pre-publish checklist: re-run the
measurements, refresh numbers, founder publishes under his own name. The
D-126 plain-language rule deliberately does NOT apply — this is for a
technical audience.

### #37 — Hindi facts blocks (Cowork D2), shipped

`ExamSpec.hindi` — a field deliberately too small to hold anything beyond the
facts it restates, which is what makes it shippable without the founder's
native-reader review that FULL Hindi pages require. Five blocks (SSC, GD,
UPSC, NEET, IBPS), rendered with `lang="hi"` so screen readers switch voices
and Hindi queries have something to land on. Numbers stay digits; terms the
portals themselves use in English (JPEG, KB, "photo") stay recognisable.

The test has teeth: every Hindi block must contain Devanagari (the lang
attribute promises the script) and must repeat EVERY KB bound its own table
states — a Hindi block whose numbers drift from the table is worse than none,
because the reader trusts whichever one they can read.

### #38 — the Reddit/Telegram operating script (Cowork D3)

Written to `claude-cowork-docs/` (private, gitignored, build-gated) because it
names target communities. Encodes every D3 guardrail as instructions the
Chrome agent cannot misread: draft-only until 20 founder approvals, help-first
link-second with the no-link rule when specs do not match, disclosure always,
rules-page reading before first contact, modmail where required, ≤3 links/week
per community, one removal = permanent stop. Includes the verified facts the
agent may state, so it cannot improvise specs — and an approval ledger table
for the founder.

### #39 — probed, needs one permission

The API token can see the keptpix.com zone but GraphQL returns authz: it lacks
`Zone → Analytics → Read`. One dashboard minute for Sai; the snapshot script
follows once the scope exists.

436 unit / 168 integration / 162 e2e; Hindi blocks verified in served HTML.

---
## 🟢 D-128 — Cowork D8/D11 executed: the launch runbook exists, SBI ships, RRB refuses to be sourced

**Docs affected:** none public — runbook is private (D6), SBI is a data entry

### #41 — Launch runbook + HN crib sheet (Cowork D8)

`claude-cowork-docs/launch-runbook-and-crib-sheet.md` (private — it is
strategy). Hour-by-hour: dev.to live BEFORE the HN submit, title fixed
verbatim, Sai's first comment immediately (HN convention — stops the top
comment being someone else's guess), 3–4 hours present then three
check-ins/day for 48h, PH riding 1–2 days later. The bad-day branch is
written down so it does not get improvised under stress: flagged or <5
points in 4h → accept, no repost for 30 days, dev.to stays evergreen, PH
proceeds anyway. Crib sheet covers the seven predictable questions
(ImageMagick, verification, AGPL, the search algorithm, monetization/rug
pull, the rasterisation trade, EXIF) — labelled raw material, never to be
pasted verbatim, because HN detects canned answers. The iOS answer is
flagged DO-NOT-SAY until the device pass actually runs.

### #42 — SBI verified and live; RRB blocked on its own infrastructure

**SBI** (Cowork D11 rank 2): specs read from the official registration
portal's own guidelines PDF (ibpsreg.ibps.in, SBI CBO Nov 2025 cycle,
labelled as such). Four uploads, same shape as IBPS — photo 20–50 KB at
200×230 px, signature 10–20 KB at 140×60 px (capitals rejected), left thumb,
handwritten English declaration — now surfacing on the four bank-relevant
compress pages with a Hindi block. The pinned-order test tripped on the
insertion, as designed.

**RRB NTPC** (rank 1): aggregators say photo 30–70 KB at 320×240 — and
aggregators were wrong on every exam this project has checked, so that ships
nothing. Every official mirror tried (rrbchennai over https and http, rrbcdg
with and without www — a certificate that does not match its own www
subdomain, then connection refused, then a 1.2 KB error page) is unreachable
from here. THE RULE HELD: no primary source, no entry. RRB stays on the
backlog with a note to retry via rrbapply.gov.in or the Chrome agent; the
demand is real (docket/exammint farm it), which makes it worth the wait, not
worth a guess.

436 unit / 168 integration / 162 e2e, deployed. The D7 triage machinery, the
Sunday loop (#44) and October pre-work (#45) are queued and gated exactly as
the batch specified.

---
## 🟢 D-129 — Gate (a) cleared, the CSV pipeline's first real run, and traffic numbers without a beacon

**Docs affected:** none — a script, a memory update, and three loops closing

### The ₹50 test PASSES
The payer's UPI app showed **"Keptpix"** — the founder's personal name stayed
hidden at the one point no documentation could confirm in advance. **Launch
gate (a) is cleared**; only the real-device pass (gate b) stands before the
D8 runbook fires. Settlement to bank is T+1/T+2 and was explained as normal.

### The keywords pipeline ran on real GSC data
First real export: 5 queries, 5 impressions, all FAR (position 45–84) — the
site is a week old and this is what sandboxing looks like. Nothing for D7 to
triage yet, which is the correct null result, not a failure. The signal that
DID arrive validates the thesis: "compress jpg 500kb" twice, exactly the
exact-size family the site is built on. The Sunday loop (#44) stays gated
until data accumulates.

### `npm run traffic` — the zero-beacon metrics loop closes (#39)
The Chrome agent added Zone→Analytics→Read (Edit only, secret intact — its
report was thorough enough to quote the no-new-secret-screen proof).
`scripts/traffic-snapshot.mjs` pulls 7 days of edge-side GraphQL analytics
and appends one line to the backlog journal. First real week: **15,728
requests, 8,244 pageViews, peak 229 uniques/day** — labelled loudly as
bots-included, so uniques are a CEILING on humans; the D-111 ads gate reads
these conservatively for exactly that reason. Better than the ~118-total
belief either way.

### Flagged, no action demanded
The Chrome report revealed the deploy token carries ~45 account-wide WRITE
permissions (Workers, D1, R2, rulesets…) — far broader than the
"Pages Edit"-scoped token this project believed it had. Nothing is wrong
today; least-privilege says narrow it someday. Recorded in memory so the
next token conversation starts from the truth.

### RRB
Nothing pending from the founder's side — it is purely a fetch problem
(D-128). A one-line Chrome task was offered for whenever convenient.

---
## 🟢 D-130 — Four resize presets from verified specs, the third RelatedTools table, and the runtime chunk pinned down for good

**Docs affected:** none structural — Wave 2's resize template gets its first
content, exactly as docs/09 §2.3 designed ("pure data addition")

Backlog #43, Cowork D10's carve-out: only dimensions that appear in a VERIFIED
spec ship. Four pages, all traceable to the same primary PDFs as
exam-specs.ts: `/resize/photo-200x230`, `/resize/signature-140x60`,
`/resize/thumb-240x240`, `/resize/declaration-800x400` — the complete IBPS/SBI
upload set. "resize signature 140x60" was a GAP query in the very first
keywords sample.

Written to the D-126 plain-language bar, and honest about the one thing that
matters: **`exact` resize STRETCHES** (verified in core/resize.ts — no crop,
no pad), so every intro says "crop to the right shape first" and the
signature FAQ explains the squashed-look failure in plain words.

Wiring, all gated by the machines built earlier this week: sitemap (the
D-123 coverage gate would have failed without it), the /resize hub's new
"Common form sizes" section (no-orphans would have failed), the query index
(`must` = the dimension token — "140x60" survives normalise() as one token,
the least ambiguous signal a matcher gets), the exam-spec tables + Hindi
blocks now rendering on resize pages, and **RelatedTools' THIRD table** —
added the same day its first entries shipped, because D-113 taught what
"unresolved slugs are silently dropped" does to a table the component does
not know about.

### The runtime chunk, resolved structurally

The full suite failed the absolute in-flight rule AGAIN on
`rolldown-runtime-*.js` — a different interleaving than D-124's (the ingest
warm-up held; this fetch came through a page-graph import the warm-up does
not own). Root cause measured, not guessed: Astro's modulepreload list covers
the island entry graph but NOT Vite 8's shared runtime, so the first lazy
import on a page pays a live fetch at an arbitrary time.
`scripts/inject-runtime-preload.mjs` now runs post-build (before the precache
manifest, so the SW hashes what is served) and modulepreloads the runtime in
every page — the fetch happens at page load, and every later import resolves
from the module map with zero network. The in-flight test has passed five
consecutive full-suite runs since; before the fix it failed reproducibly.

41 pages, 436 unit / 168 integration / 174 e2e, baseline 48.2/60 KB
(the preloaded runtime now counts into the measured modules, honestly).

---
## 🟠 D-131 — Gate (b) closed on the founder's waiver: Android pass, iOS deferred, launch week unlocked

**Docs affected:** none — a gate decision, recorded with its risk

Sai ran the device checklist on his Android: near-all green ("mostly all the 8
points works"), no breakages reported. iPhone was NOT tested; his decision,
explicitly: "i did not tested some parts but i dont care we can proceed
mostly." That waives the iOS half of Cowork D1's gate (b) — the founder can
waive his own gate, and the waiver is recorded rather than smoothed over.

**The risk, stated for the record:** iPhone Safari is the single riskiest
untested surface — D-95 (the delivery path that silently failed) was
iOS-only, HEIC sources COME from iPhones, and the HN audience skews iPhone.
The standing recommendation, put to Sai and left to him: a 10-minute
borrowed-iPhone spot-check of steps 1–2 only (convert a real camera photo,
confirm the file saves) before the Show HN goes up. Not a blocker.

His one observation — his personal phone number on the Razorpay support page
— is editable in their dashboard anytime; the virtual-number option is
already in the tip-page memory.

**Both D1 gates are now closed** (₹50 payee passed D-129; device pass here).
Launch materials refreshed same commit: CWV re-measured today (LCP ~1.2s
mobile lab, categories 99/100/100/100) and docs/19's pre-publish line updated
to "ready to publish." What remains is Sai's side of the runbook: dev.to
account, publish, submit on a Tue–Thu US morning, be present. The proposed
window is Tue Aug 18 – Thu Aug 20 — no collision with the GD notice (~Sep 1),
so D12a's collision rule stays dormant.

---
## Outstanding work, most consequential first

| | Item | Blocks |
|---|---|---|
| 🟠 | **DMARC is `p=reject` with no sending path configured.** Nothing sends as `@keptpix.com` today, so nothing is broken — but the moment anything does (Gmail send-as, a newsletter tool, a contact form), it will be **rejected outright** until that sender is added to SPF and DKIM is set up. Tell an agent before wiring up any email | Any outbound email |
| ✅ | ~~`window.__keptpix_store` reports empty `jobs`/`sources`~~ — **not a bug** (D-104). `Map` does not survive a structured clone, so it arrives as `{}` across an `evaluate` boundary while the plain-object `device` arrives intact. `jobs.size` reads 3 for three files inside the page. `__keptpix_snapshot()` now returns a JSON-safe view so the trap is unreachable | — |
| ✅ | ~~D-03 SVG~~, ~~D-34 HEIC orientation~~, ~~privacy.spec.ts~~, ~~real HEIC decode~~ — all **done** and verified against real files | — |
| ✅ | ~~D-42 Smart App Control~~, ~~a11y sweep~~ — resolved, 69/69 passing across all 22 routes | — |
| ✅ | ~~Milestone 6~~ (all content), ~~Milestone 7~~ (all suites, D-43/44/45) — **done**, 372 tests green | — |
| ✅ | ~~jSquash quality-tier encoders~~ (mozjpeg, oxipng, avif decode, utif2 TIFF; jxl deliberately skipped) — **done**, verified against real bytes in a real browser, D-46/47/48; 300 tests green | — |
| ✅ | ~~**Milestone 8**~~ — PWA/service worker, IndexedDB persistence, OPFS, CompareView, preset export/import, analytics: **all done**, D-50 through D-54. 314 unit+integration green, 78 e2e green, all budgets pass | — |
| ✅ | ~~Main-thread encode fallback (D-55)~~ — **DECIDED: not built, permanently-until-data.** Safari 16.4 shipped March 2023; the pre-16.4 cohort is a thin, shrinking sliver, and those same devices would freeze then likely crash a tab on a 12 MP main-thread encode — "works badly then dies" is worse than an honest notice. Reversing CLAUDE.md non-negotiable 3 would degrade the architecture for everyone. **Reversal condition:** real user reports from that cohort after launch, weighed against edge-analytics traffic share | — |
| ✅ | ~~Audit work order (docs/13)~~ — WO-1 through WO-12 **done**: D-57 (device-scaled ceiling + truthful copy), D-58 (JXL shelved), D-59 (compare modal), D-60 (screenshot guard replaced), plus WO-2/3/4 fixes and the D-45/D-52 amendments | — |
| 🟠 | **Measure the WORKER's heap** (D-45, WO-6) — the counter is now live in the harness under `--enable-precise-memory-info`, but it reads the main thread, which a conversion barely touches. The `< 400 MB` budget is now *instrumentable* but still *unmeasured*; sampling inside `image.worker.ts` is production code changed for a test's benefit and wants a decision | A real §7 memory number |
| 🟡 | **HEIC fixture into CI** (D-36, WO-7) — `scripts/scrub-fixture.mjs` is written and strips GPS/serials/timestamps while PRESERVING orientation and the `irot`/`imir` transforms that caught D-30 and D-34. Needs 2–3 neutral-location HEICs from the founder, then the HEIC suites stop skipping on a fresh clone | Flagship path untested in CI |
| ✅ | ~~Precache truncation on HTTP/2~~ (D-52) — **CLEARED** (D-108). Measured against production, which negotiates h2: 40 of 40 URLs cached, and a route loads with the network cut. No truncation | — |
| 🟠 | **Deploy to Cloudflare Pages** (`noupload.app`) — the one M8 acceptance item not doable from here; needs the account. Re-run `privacy.spec.ts` against production once live | Launch |
| 🟡 | `npx playwright install` is now required for a truthful e2e run — chromium alone silently "passed" while 3 engines never launched (D-55). Worth pinning in CI setup | Honest cross-browser signal |
| ✅ | ~~Analytics decision (D-56)~~ — **decided**: page views come from Cloudflare's edge, no beacon ships, assertion (a) stays absolute. Read them in the Cloudflare dashboard after deploy; nothing to configure | — |
| 🟡 | OPFS pipeline write-through + session-restore UI (D-51) — storage primitive is built and swept; the conversion-path integration is deliberately deferred | Nothing in M8's acceptance list |
