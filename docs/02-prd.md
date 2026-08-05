# 02 — Product Requirements: KeptPix

**Status:** approved for build
**Owner:** Sai
**Version:** 1.0 (2026-07-28)

---

## 1. Problem statement

People convert and compress images constantly — for job applications, government portals, exam registrations, marketplace listings, email attachments, and websites. The tools they use today force an unnecessary trade:

- **Upload-based tools** (iLoveIMG, TinyPNG, CloudConvert, FreeConvert) send private photos — ID scans, medical documents, family pictures with GPS EXIF — to someone else's server. In March 2025 the FBI publicly warned that free converter sites were delivering malware and harvesting data. Users have no way to verify what happens to their file.
- **Local tools** (Squoosh) are private but handle one image at a time, with no batch mode and no way to say "make this exactly 100 KB."

Neither solves the highest-intent, most-repeated job: *"I have 40 photos and each must be under 100 KB and in JPG, and I'd rather not hand them to a stranger."*

## 2. Solution

A static web app where every operation runs in the user's own browser. No account, no upload, no server, no file size cap imposed by us, no watermark, no daily quota. Provably local — the user can open DevTools' Network tab and see zero outbound requests.

**Positioning line:** *Your images never leave your device. Check the network tab.*

## 3. Target users

| Persona | Job to be done | Volume signal | Why they pick us |
|---|---|---|---|
| **Form Filer** (student, job applicant, visa applicant) | "Photo must be JPG, 20–100 KB, under 200×230 px" | The "compress to 50KB/100KB" cluster; drives much of iLoveIMG's India/Indonesia traffic | Exact target size in one click, no quota, works on a slow connection after first load |
| **iPhone Owner** | "My HEIC photos won't open on Windows / won't attach" | "webp to jpg" alone = 220.2K visits/mo to iLoveIMG | Batch HEIC→JPG, EXIF preserved or stripped by choice, photos stay private |
| **Web Developer / Designer** | "Ship AVIF and WebP at the right quality, in bulk" | Squoosh's 1.9M visits, 6m05s sessions, 4.84 pages/visit | Batch + per-codec quality control + side-by-side preview; Squoosh's power without its one-at-a-time limit |
| **Privacy-Sensitive Professional** (lawyer, clinician, HR, journalist) | "Strip metadata / resize a sensitive image without it touching a server" | FBI warning, 2024 PDF leak incidents, Stirling-PDF's 81.3k★ | The only tool where "it never left my machine" is verifiable |

**Explicitly not our user (v1):** anyone needing real-time collaboration, cloud storage, team accounts, or an API. Those all require a backend.

## 4. Product principles

1. **Zero upload, always.** If a feature cannot run locally, it does not ship. No exceptions, no "just this one endpoint."
2. **No artificial scarcity.** No daily limits, no watermarks, no resolution downgrade on free. Our marginal cost is zero, so gating usage would be theatre. We charge for *convenience and specialist features*, never for access.
3. **Honest about limits.** We publicly state what we can't do (e.g. no PDF→Word, hard file-size ceilings on low-memory devices) rather than failing silently. This is a trust product.
4. **Fast to first result.** Time from landing to a downloaded converted file is the north-star UX metric. Target: under 15 seconds on a mid-range laptop, first visit included.
5. **Works offline after first load.** Installable PWA. The engines are already on the device — there's no reason to need a network.
6. **Every route is real HTML.** Prerendered at build time, because AI crawlers don't run JavaScript.

## 5. Scope — v1.0 (Phase 1 + 2)

### In scope

**Convert**
- Input decode: JPEG, PNG, WebP, AVIF, GIF (first frame), BMP, TIFF, **HEIC/HEIF**, JPEG XL, SVG (rasterize)
- Output encode: JPEG, PNG, WebP, AVIF, **JPEG XL**
- Batch: drop a folder or multi-select, unlimited count on free tier
- Per-file and global settings; ZIP download for batches

**Compress**
- **Target-size mode:** "make this ≤ 100 KB" — binary search over quality until the size constraint is met, per file
- Quality-slider mode with live size estimate and side-by-side visual diff
- Presets: 20 KB, 50 KB, 100 KB, 200 KB, 500 KB, 1 MB, custom

**Resize**
- By pixels, percentage, max-dimension fit, or exact crop
- Preset dimension packs (passport-ish sizes, common social/web sizes)

**Metadata**
- Strip all EXIF/GPS/IPTC (default ON for output) or preserve orientation-only
- Show what metadata a file contains *before* processing — this doubles as a privacy demo

**Platform**
- Prerendered landing page per format pair and per size preset (see `09-seo-content-plan.md`)
- PWA, installable, offline-capable
- Light/dark, keyboard accessible, WCAG 2.2 AA
- Zero analytics that transmit file data; privacy-respecting pageview counting only (Cloudflare Web Analytics)

**Scope tiering.** Everything above ships inside v1.0 (Milestones 0–8). Items marked SHOULD in `03-feature-map.md` §2 — AVIF/JXL codecs, TIFF decode, compare view, metadata inspector, PWA, size-preset routes — are v1.0 targets but are **not launch-gate blockers**: if Milestone 7 passes without them, v1.0 can ship and they follow. The MUST list in `03` §2 is the actual hard gate.

### Out of scope for v1.0

| Excluded | Why |
|---|---|
| User accounts, cloud storage, sync | Requires a backend; violates principle 1 |
| Real-time collaboration | Requires a server |
| Video conversion | Memory-bound in WASM; would tank mobile UX. Consider later via Mediabunny/WebCodecs |
| Background removal | Phase 3 — needs a 40–180 MB model download, different loading UX |
| PDF operations | Separate product later; different engine layer |
| Image editing (layers, filters, drawing) | Photopea owns this; not our job |
| Native mobile apps | PWA covers it at a fraction of the cost |
| Any AI "enhancement" / upscaling | Model size vs. value doesn't justify it in v1 |

## 6. Success metrics

| Metric | Definition | 90-day target | Why it matters |
|---|---|---|---|
| **Task completion rate** | Sessions with ≥1 file successfully downloaded ÷ sessions with ≥1 file added | ≥ 80% | The only metric that says the engine actually works on real devices |
| **Time to first result** | p75, file-added → download-ready, 4 MP JPEG, mid-range laptop | **≤ 3s** (matches the budget in `04-architecture.md` §7 and the Milestone 7 gate) | Direct driver of bounce |
| **Batch adoption** | % of sessions processing ≥ 2 files | ≥ 35% | Batch is our wedge vs. Squoosh |
| **Pages per session** | — | ≥ 3.0 | Squoosh hits 4.84; TinyPNG 1.56. Proves the client-side engagement effect |
| **Indexed tool routes** | Prerendered routes in Google's index | ≥ 90% of published | Validates the Astro/prerender bet |
| **Engine failure rate** | Jobs ending in error ÷ total jobs, by device class | < 2% desktop, < 5% mobile | Mobile Safari memory is the known risk |
| **Cost per 1,000 users** | Infra spend ÷ users | ≈ $0 | The thesis |

Deliberately *not* a v1 metric: revenue. Phase 1–2 is an audience-building exercise; monetization lands in Phase 4.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Lighthouse ≥ 95 across all four categories on every prerendered route; **SEO and Accessibility must be 100** (they are deterministic and there is no excuse for less). Initial JS payload < 60 KB gzipped before any codec loads. Codecs lazy-load per format actually used. |
| **Memory** | Must process a 12 MP image on a device with 2 GB RAM without crashing. Sequential (not parallel) processing on mobile; explicit per-file memory release. |
| **Browser support** | Chrome/Edge 120+, Firefox 120+, Safari 17+, iOS Safari 17+, Chrome Android 120+. Graceful degradation, never a blank page. |
| **Offline** | Full functionality after first visit for formats whose codecs are cached. |
| **Privacy** | Zero outbound requests carrying user data — ever. Testable, and enforced by an automated test (Milestone 7 in `10-build-plan.md`). **Precise rule:** no request may have a non-empty body, and no request may occur during processing at all. One exception is permitted — Cloudflare Web Analytics, which sends pageview beacons only, is loaded *after* the tool island mounts, and is blocked outright while any job is in flight. No other third-party script may run on a page that handles files. |
| **Accessibility** | WCAG 2.2 AA. Full keyboard operation. Screen-reader announcements for job progress. Respects `prefers-reduced-motion`. |
| **i18n readiness** | All strings in a message catalog from day one; English only at launch, but structured for Hindi/Indonesian/Portuguese later given the audience geography. |
| **Licensing** | All bundled libraries must be MIT/Apache/BSD/MPL. ⚠️ Explicitly reject AGPL dependencies (e.g. mupdf-wasm) unless a commercial license is purchased. |

## 8. Key risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Mobile Safari OOM on large images** | High | Hard input-size guard with a clear message; downscale-before-encode path; sequential processing; test on real iOS device before launch |
| **Slow first load kills conversion** (WASM codec payload) | High | Canvas-native encode path first (no WASM at all for JPEG/PNG/WebP); WASM lazy-loaded only for HEIC decode, AVIF, JXL, and quality-tuned mozjpeg |
| **Google treats programmatic tool pages as doorway/scaled-content spam** | Medium | Only generate routes we genuinely support, each with format-specific UI, real constraints, and unique substantive copy. Never permutations we can't perform. See `09-seo-content-plan.md` |
| **AI answer engines never see the content** | Medium | Astro prerender — resolved architecturally, not by tactics |
| **Category is crowded; "privacy-first" is no longer novel** | Medium | Differentiate on the *combination*: batch + exact target size + zero limits + offline. Privacy is table stakes, not the pitch |
| **Search demand declines across the whole category** | Medium | Bias toward transactional queries (31% zero-click) over informational (74%). Build direct/PWA return traffic — Squoosh is 78.6% direct, TinyPNG 71.9% |
| **Safari's 7-day script-storage eviction wipes settings** | Low | Settings only; no user files persisted by default. Export/import of presets available |

## 9. Open questions for the operator

1. **Domain — decided, confirm availability.** `keptpix.com` is canonical across every doc, the sitemap, JSON-LD, and the Phase-4 Worker (`license.keptpix.com`). A brandable name plus programmatic subpaths beats an exact-match keyword domain here, because the subpaths already carry the keywords. If `keptpix.com` is taken, pick the replacement before Milestone 6 — it is baked into 21 routes' canonical URLs.
2. **Ads or no ads, ever.** Ads on a privacy-positioned tool site are a credibility tax and, per `01-market-scan.md` §Monetization reality, only worth ~$1–5 RPM. Recommend **no ads**, monetize via Phase-4 license keys.
3. **Open source the engine?** It would make the "provably local" claim verifiable and could earn the Stirling-PDF/it-tools style GitHub distribution. Also invites clones. Recommend open-sourcing the engine core, keeping the SEO content and premium presets closed.
