# 05 — Build Plan (fork-based)

Estimated: **2–3 weeks** to Wave 1 live, because Milestone 0 starts at KeptPix HEAD, not zero. Same rules as KeptPix doc 10: copy-paste prompts, hard acceptance criteria, do not advance until green, deviations log from day one.

---

## M0 — Fork & strip (1 day)

```
Fork the KeptPix repo to a new `kepttools` repo. Read kepttools/00-INDEX.md
inheritance rules and kepttools/03-engines-contracts.md.

Strip: image-pair content routes and their content entries. KEEP: the entire
core/, workers/, state/, platform/, styles/, test infrastructure, budget
scripts, service-worker build, boundary lint, CLAUDE.md (update product name
and add the new forbidden/allowed libraries).

Add: src/core/tools.ts (ToolManifest per doc 03 §1) with the 12 ToolIds
declared, all supported:false initially. Parameterize ToolShell to render
from a manifest entry (engine, accept, config fields, output mode). The
image engine remains registered — KeptPix's converters stay importable for
the PDF compress EncodeFn.

SITE_URL placeholder https://kepttools.com. Brand strings "KeptTools".
```

**Accept:** build green, all inherited unit/integration suites still pass, boundary lint clean, manifest-driven shell renders a stub tool end-to-end, budgets pass.

## M1 — PDF engine core: merge, split, rotate, to/from images (3–4 days)

```
Implement engines/pdf/ per doc 03 §2 with pdfjs-dist + @cantoo/pdf-lib
(⛔ never pdf-lib, never mupdf). pdf.worker.ts on the existing Comlink
protocol; bytes transferred, never cloned. Page-thumbnail rendering for the
reorder UI via pdfjs. E_PDF_ENCRYPTED with passphrase path; E_PDF_MALFORMED.
Wire manifest entries pdf-merge, pdf-split, pdf-rotate, images-to-pdf,
pdf-to-images with real config panels. ZIP output reuses platform/deliver.
```

**Accept:** merge 5 real PDFs preserving order · split-by-ranges → correct ZIP · a 50-page PDF renders thumbnails without main-thread jank · encrypted fixture round-trips with passphrase, fails honestly without · batch with one malformed file completes per the KeptPix batch rule · privacy suite green.

## M2 — ⭐ Compress PDF to target KB (2–3 days)

```
The wedge. Implement PdfCompressOpts/compress per doc 03 §2, injecting the
image-re-encode EncodeFn into the EXISTING core/target-size.ts. All I-1..I-8
invariants; E_TARGET_UNREACHABLE soft-fail with the honest text-floor message
from doc 02 §4. Real progress (pass counter). Property tests: KeptPix's
target-size suite parameterized with the PDF encoder.
```

**Accept:** a 20 MB scan-heavy PDF hits 200 KB ≤ 8 passes · a text-only PDF soft-fails with best-achieved + explanation · never overshoots across the property matrix · fixture set includes scanned, text-only, mixed, and image-XObject-heavy PDFs.

## M3 — Wave 1 content + query matcher (3–4 days)

```
Write the Wave 1 routes (canonical PDF tools + the 8 compress-to-size
variants + content pages) per doc 04 §2 and the KeptPix 400-word bar — FAQ
entries absorb variant phrasings; no synonym doorway routes.

Build the query matcher (doc 04 §1 Layer 2): compile-time phrase index,
fuzzy match, number+unit parameter extraction as a pure core/ function with
exhaustive unit tests ("150 kb", "1.5mb", "under 200KB", "8 mb discord").
Homepage = directory + matcher; Cmd+K palette on tool pages. Zero network
on input — assert in the privacy suite.
```

**Accept:** ~30 routes build static with full raw-HTML content · matcher maps 25 canonical test phrases to correct tool+prefill including 5 with no dedicated route · prose-overlap check <20% across compress-variant pages · Lighthouse bar inherited (95s, SEO/a11y 100).

## M4 — Video engine: compress-to-MB, trim, MP4→GIF (4–5 days)

```
engines/video/ per doc 03 §3 on mediabunny; gifenc for GIF. Two-pass bitrate
targeting, ≤3 passes, never overshoot, resolution ladder, STREAMING I/O
(peak memory independent of file size — assert with a 500 MB fixture
generated locally). Capability probe drives per-browser pre-flight notices
(D-55 pattern). Platform preset routes from doc 04. E_CODEC_UNSUPPORTED_HERE,
E_VIDEO_TOO_LONG.
```

**Accept:** a 100 MB 1080p clip compresses to ≤8 MB, correct rung reported, in ≤3 passes · trim without re-encode is bit-identical within the trimmed range · mp4→gif matches ezgif output quality on the fixture · WebKit/Firefox runs produce honest notices where codecs are absent, never failing buttons · privacy suite with a 100 MB file: zero bodied requests.

## M5 — Verification gate + QR + launch (2–3 days)

```
Full inherited gate: privacy (absolute), a11y all routes both themes,
keyboard flows, budgets, smoke on all four engines. Add QR generator
(SVG-first, payload builders in core/, print-size presets) — one day.
Deploy to kepttools.com. Cross-links live on both properties. Re-run
privacy suite against production.
```

**Accept:** all suites green on all four browser engines · QR scans correctly from a printed test · production privacy run clean · Search Console verified for the query-expansion loop (doc 04 Layer 3).

---

## Standing rules (inherited + new)

All KeptPix doc 10 standing rules apply. Additions:
1. **A new tool that needs shell surgery is a design failure** — fix the manifest abstraction, not the tool.
2. **Video work is streaming or it doesn't ship.**
3. Layer-3 route expansion feeds a queue for human-quality writing — never auto-publish.
4. The operator's physical-world list: buy kepttools.com (same-sitting RDAP re-check), Search Console access, and — still outstanding from KeptPix — the real-iPhone Safari test and the HN launch, which remain the highest-leverage free-traffic actions on the calendar.
