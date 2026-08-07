# 02 — PRD Delta (vs KeptPix's 02-prd.md)

Everything in KeptPix's PRD applies unless overridden here. This file lists only the differences.

## 1. Product shape: multi-tool shell, not single-tool site

KeptPix is one tool with many entry routes. KeptTools is **many tools behind one shell**:

- The homepage is a **tool directory + query matcher** (doc 04 §3), not a dropzone. Each tool route keeps the KeptPix pattern: dropzone-first, slug-preconfigured, static SEO content below.
- Tools are registered in a `ToolManifest` (doc 03 §1) — adding a tool is data + one engine adapter, never shell surgery. This is the property's core scaling mechanic.
- The `ToolShell` island is parameterized by manifest entry: which engine, which config panel fields, which accept-types, which output mode (single file / ZIP).

## 2. Personas (delta)

| Persona | Job | Which tools |
|---|---|---|
| **Form Filer** (carried over — same person as KeptPix's) | "PDF must be under 200 KB for the portal" | Compress-PDF-to-KB, merge, images→PDF |
| **Discord/WhatsApp sharer** (new) | "This video is 43 MB, the limit is 8/16 MB" | Compress-video-to-MB with platform presets |
| **Office admin** (new) | Merge scans, split chapters, sign and return | Merge, split, sign, PDF→images |
| **Small-business owner** (new) | Menu/poster QR that will never stop working | QR generator |

## 3. Success metrics (delta)

KeptPix's metrics apply per-tool. Property-level additions:

| Metric | Target (90 days post-launch) |
|---|---|
| Tools live | ≥ 8 |
| Cross-tool sessions (used ≥2 different tools) | ≥ 8% — measures the umbrella effect |
| Query-matcher usage → tool open | ≥ 25% of homepage sessions |
| Indexed routes | ≥ 90% of published |
| Marginal cost per additional tool | < 1 day for a manifest-only tool, < 4 days with a new engine capability |

## 4. Honest-limits page (extends KeptPix principle 3)

Must state publicly, per category:
- **No PDF→Word / PDF→Excel.** Layout-faithful conversion is not client-side feasible; we will not ship a bad version of it.
- **Redaction is rasterizing.** Our redact flattens pages to images to guarantee removal — searchable text is lost, and we say so before the user commits.
- **Video codec support varies by browser/OS.** HEVC/AAC encode may be unavailable; the tool detects and says exactly what this browser can produce before processing starts.
- **PDF compression has a floor.** A text-only PDF is already small; our compressor mostly re-encodes embedded images. If the target is unreachable we say so with the best achieved size (same `E_TARGET_UNREACHABLE` soft-fail contract as KeptPix).

## 5. Memory & size guards (video-specific override)

KeptPix's guard model (per-device budgets, hard backstop, honest errors) applies, with video additions:
- Video processing must be **streaming** (mediabunny reads/writes incrementally) — never load the whole file into memory.
- Input cap by device tier: 2 GB desktop-high / 1 GB desktop-low / 500 MB mobile (initial values; tune with real profiling in M5). Over-cap → `E_TOO_LARGE` with the actual numbers, never a crash.
- The 400 MB peak-memory budget applies to the *working set*, not the file size.

## 6. Monetization (confirmed identical posture)

Free, unlimited, no watermarks, no quotas — forever, for the core. Later, one $9 lifetime license shared across the **whole Kept family** (KeptPix + KeptTools; one Ed25519 key, product claim `kept-pro`): sign-PDF templates, batch QR from CSV, video preset packs, saved preset libraries. The shared license makes each property a sales channel for the other. No ads, ever — same credibility math as KeptPix.

## 7. New risk table entries

| Risk | Mitigation |
|---|---|
| PDF head terms are brutally competitive | Enter via the long tail + wedge (doc 04); head terms are a year-2 goal, not the plan |
| Browser codec fragmentation breaks video tools on some machines | Capability probe before UI enables a tool; per-browser honest messaging; `E_CODEC_LOAD_FAILED` family extended (doc 03 §5) |
| pdf-lib fork risk (upstream dead since 2021) | `@cantoo/pdf-lib` pinned; the fork is actively maintained (verified in KeptPix research); wrap all usage behind our own `engines/pdf/` interface so a library swap is one adapter |
| Google treats a 40-route site built in a week as scaled-content spam | Same wave-based publishing as KeptPix doc 09 §6; every route passes the 400-word genuinely-specific bar; `supported: true` hard gate |
| Two properties split the operator's attention | KeptPix is in a measurement window; its next scheduled work (Safari test, HN launch) is calendar-bound, not continuous. KeptTools is the active build. Revisit if KeptPix launch tasks slip. |
