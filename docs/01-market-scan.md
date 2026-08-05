# 01 — Market Scan: Six Candidate Apps

Research window: July 2026. All traffic figures are **modeled estimates**, not analytics-verified. Two different metrics appear below and must not be compared directly:

- **Organic/mo** = estimated organic-search visits (Ahrefs-derived, via ahrefstop.com)
- **Total/mo** = estimated total visits, all channels (Similarweb)

---

## The market context you are entering

Three facts frame every idea below.

**1. The SEO channel for utility tools is contracting.** Most sampled incumbents show month-over-month organic decline in mid-2026: iLovePDF −2.5M, Smallpdf −677K, Omni Calculator −1M (−14%), calculator.net −2.3M, wordcounter −724K, tldraw −17.6% MoM. Roughly 60–65% of US Google searches now end without a click, rising to 83% when AI Overviews are present. **But transactional queries are only ~31% zero-click versus 74% for informational.** "Convert heic to jpg" is transactional — you have to *do* something, and Google cannot do it inline. Tools survive this shift far better than content sites. ([zero-click data](https://www.omnibound.ai/blog/zero-click-search-statistics))

**2. There is a category-level trust wedge that incumbents structurally cannot copy.** In March 2025 the FBI's Denver field office publicly warned that free online file-converter sites were delivering malware and harvesting uploaded data ([FBI](https://www.fbi.gov/contact-us/field-offices/denver/news/fbi-denver-warns-of-online-file-converter-scam), corroborated by [BleepingComputer](https://www.bleepingcomputer.com/news/security/fbi-warnings-are-true-fake-file-converters-do-push-malware/), [Malwarebytes](https://www.malwarebytes.com/blog/news/2025/03/warning-over-free-online-file-converters-that-actually-install-malware), [Forbes](https://www.forbes.com/sites/zakdoffman/2025/03/18/fbi-warns-chrome-safari-and-edge-users-do-not-use-these-websites/)). Separately, two PDF tools leaked thousands of passports and contracts in July 2024. An incumbent whose entire cost structure is server processing **cannot** answer "nothing leaves your device" without rewriting their product. The corroborating demand signal: Stirling-PDF, a self-hosted "no external services" PDF suite, has **81.3k GitHub stars**.

**3. Client-side is weakest exactly where the incumbents' traffic is.** iLovePDF is 28.1% India; remove.bg 43.5% India + 13.1% Indonesia; iLoveIMG 24.5% India + 21.4% Indonesia. Low-end Android is the worst environment for WASM. **Do not plan to out-scale iLovePDF.** Plan to win desktop, Western, and privacy-motivated users — who also carry 10–20× the ad RPM and far higher willingness to pay.

---

## Candidate 1 — KeptPix Image Toolkit ⭐ WINNER

**Convert between image formats and compress to an exact target file size, in batch, 100% locally.**

| Signal | Evidence |
|---|---|
| Demand | iLoveIMG **13.3M organic/mo**, $549.5K/mo traffic value; ranks #1 for "jpg compress" (220.4K visits) and "webp to jpg" (220.2K). CloudConvert 10M organic, #1 for "webp to png" (62.7K). FreeConvert 11M organic and **growing +243K MoM**. |
| Benchmark for a *pure* client-side compressor | Squoosh ~1.9M total/mo, 28% bounce, **6m05s avg session, 4.84 pages/visit** — versus TinyPNG's 68% bounce and 1.56 pages. Client-side tools produce dramatically better engagement. |
| Timed catalyst | **JPEG XL returned to Chrome 145 in Feb 2026** behind a flag, expected on-by-default in H2 2026, taking support from ~16% (Safari only) to ~85–90% ([source](https://reezo.ai/blog/jpeg-xl-returns-to-chrome-what-it-means-for-web-images)). Format transitions reliably generate multi-year conversion-query waves. This one starts now. |
| The gap | TinyPNG uploads your files. Squoosh is one-image-at-a-time with no batch and no target-size mode. **Batch + "hit exactly 100 KB" + provably local is an unserved combination.** The "compress to 20KB / 50KB / 100KB" cluster is driven by government form and exam portal upload caps — high-intent, recurring, globally distributed. |
| Client-side feasibility | **Perfect.** Canvas API natively encodes JPEG/PNG/WebP (and increasingly AVIF); jSquash WASM covers mozjpeg/oxipng/avif/jxl and HEIC decode via libheif. No threads needed, no COOP/COEP, no ML models. |
| Build effort | **Lowest of all six.** No model downloads, no video memory ceilings, no license-compliance questions. |

**Why it wins:** it is the only candidate that is simultaneously top-tier on demand, fastest to build, zero technical risk, structurally impossible to serve well from a server (that's the wedge), and sitting on a dated 2026 catalyst. It also produces genuinely distinct programmatic SEO pages — `/convert/heic-to-jpg` actually *does* a different thing than `/convert/webp-to-png`, which is the defensible side of Google's scaled-content line.

---

## Candidate 2 — On-Device Background Remover (unlimited, full resolution, free)

| Signal | Evidence |
|---|---|
| Demand | remove.bg **49M organic/mo**, $2.2M/mo traffic value, global rank #109, **growing +1.2M MoM**. PhotoRoom 9M organic; "background remover" alone sends 207.3K visits at rank #3. |
| The gap | Every incumbent cripples free output resolution and meters credits — because **they pay GPU cost per image**. You pay $0. You can offer unlimited full-resolution output free, permanently. That is not a feature they can match without destroying their unit economics. |
| Feasibility | **Proven.** RMBG-1.4 via Transformers.js runs fully in-browser, WASM with WebGPU acceleration ([addyosmani/bg-remove, 984★](https://github.com/addyosmani/bg-remove)). Transformers.js v4 (Feb 2026) rewrote the WebGPU runtime in C++. |
| Risk | **Model download is 40–180 MB one-time.** That's your Cloudflare bandwidth and the user's patience. Cloudflare Pages caps single assets at **25 MiB** — weights must be served from R2 or the HF Hub. Quality trails remove.bg on hair/fur edges. |

**Verdict:** highest-upside differentiation in the set, and the economics genuinely invert against the market leader. Held as **Phase 3 of the winner** rather than a separate product — it slots into the same image toolkit, same audience, same domain authority.

---

## Candidate 3 — Local PDF Toolkit (scoped honestly)

| Signal | Evidence |
|---|---|
| Demand | iLovePDF **281.3M total/mo** (global #112), 163.3M organic, $8.2M/mo traffic value. Smallpdf 51.5M organic, **$8.3M ARR with 75 staff, bootstrapped**. pdf24.org 12.3M organic and growing +1.5M MoM. Smallpdf self-reports 20M MAU. |
| Pain | Smallpdf's free tier is reportedly 2 tasks/hour with watermarks; iLovePDF caps at 200MB/file. Capterra's 981 Smallpdf reviews cluster negatives on size limits, cost, and surprise auto-renewals. |
| Feasibility | **~80% yes.** pdfjs-dist + `@cantoo/pdf-lib` handle merge, split, rotate, reorder, watermark, redact, form-fill, sign, render-to-image locally. **PDF→Word with layout fidelity is a hard no** — and that is Smallpdf's #3 keyword. |
| Risk | ⚠️ `pdf-lib` itself has **not published since 2021** despite 10M weekly downloads — use the `@cantoo` fork. `mupdf-wasm` is AGPL-3.0/commercial dual-licensed; clear it before shipping paid. |

**Verdict:** biggest raw market, but heavier build, a licensing minefield, and you must publicly refuse the single most-searched operation. Strong **second product** once the image toolkit has domain authority and a shared engine layer.

---

## Candidate 4 — ID / Passport Photo Maker

| Signal | Evidence |
|---|---|
| Demand | ⚠️ **No traffic data found — genuine evidence gap.** SERP is dense with dedicated players, which implies monetizable volume but proves nothing. Validate keyword volume before committing. |
| Differentiation | **Maximum.** Uploading your face plus passport details to an unknown server is the strongest privacy pitch available. Recurring, seasonal, globally universal, and people pay for it. |
| Feasibility | Yes — MediaPipe face detection (WASM), RMBG background replacement, per-country crop specs, print-sheet layout. All local. |

**Verdict:** best monetization instinct in the set, but demand is unmeasured. Excellent **Phase 4 premium feature** inside the image toolkit — it reuses the exact same segmentation model as Candidate 2.

---

## Candidate 5 — Privacy-First Developer Toolbox

| Signal | Evidence |
|---|---|
| Demand | jsonformatter.org ~2.6M total/mo; diffchecker.com 655.1K organic (DR 74); **regex101.com only 207.4K organic despite DR 84** — that last number is the reality check on ceiling. it-tools (client-side dev toolbox) has 40k★. |
| Pain | Pasting production JSON, JWTs, or secrets into a site that POSTs them to a server is a live security concern in every engineering org. |
| Feasibility | Trivially 100% client-side. |
| Problem | **Commoditized and crowded.** it-tools already exists, free and open source. Absolute ceilings are modest. |

**Verdict:** best audience quality per visit (devs, US/EU, high RPM, will share on HN), weakest ceiling. Good traffic-diversification side project, weak as a primary bet.

---

## Candidate 6 — CSV / Spreadsheet Cleaner on DuckDB-WASM

| Signal | Evidence |
|---|---|
| Demand | ⚠️ **No traffic data found at all.** The most under-measured item in this scan. |
| Differentiation | Strong. CSVs are disproportionately likely to hold customer PII or financials, so "never uploaded" carries real enterprise weight. DuckDB-WASM handles files far larger than a naive JS parser. No dominant incumbent found. |
| Feasibility | Yes — SheetJS + DuckDB-WASM for CSV↔XLSX↔JSON, dedupe, join, SQL-over-CSV. |
| Risk | ⚠️ DuckDB-WASM's npm `latest` tag currently points at a **dev build** (`1.33.1-dev57.0`); pin carefully. And you would be building on zero demand evidence. |

**Verdict:** highest B2B willingness-to-pay potential, but **do not build on faith**. Validate with keyword research and a landing-page smoke test first.

---

## Scoring matrix

Weights reflect the stated constraints: high demand, fast dev cycle, no server, low ops cost, competition acceptable.

| Criterion | Weight |
|---|---|
| Proven demand (evidence-backed, not inferred) | 30 |
| Differentiation the incumbent cannot copy | 20 |
| Build speed / time to first shippable version | 15 |
| Zero-server fit (no infra, no marginal cost) | 15 |
| Monetization path | 10 |
| Low technical risk | 10 |

| # | Idea | Demand /30 | Diff /20 | Speed /15 | Server fit /15 | Money /10 | Low risk /10 | **Total** |
|---|---|---|---|---|---|---|---|---|
| **1** | **KeptPix Image Toolkit** | **30** | **16** | **15** | **15** | **6** | **10** | **92** |
| 2 | On-device background remover | 30 | 20 | 12 | 12 | 6 | 6 | **86** |
| 3 | Local PDF toolkit | 30 | 16 | 9 | 12 | 8 | 6 | **81** |
| 4 | ID / passport photo maker | 18 | 20 | 9 | 15 | 8 | 6 | **76** |
| 5 | Privacy-first dev toolbox | 18 | 8 | 15 | 15 | 4 | 10 | **70** |
| 6 | CSV / spreadsheet cleaner | 12 | 16 | 9 | 15 | 8 | 6 | **66** |

---

## The recommended sequence

The top two ideas are not competitors — **#2 is the natural Phase 3 of #1**. Same users, same domain, same file-handling engine, same trust story. Build one property, compound its authority.

```
Phase 1+2 (Weeks 1–4)  Milestones 0–8 in 10-build-plan.md:
                       convert + compress-to-target-size, batch, Wave 1 routes,
                       PWA/offline. This is v1.0.
Phase 2b  (Weeks 5–10) Content waves 2–4: remaining routes, JPEG XL push.
                       Ongoing content work, not an engineering milestone.
Phase 3   (Weeks 8–12) On-device background removal (Candidate 2 folded in)
Phase 4   (Weeks 12+)  ID photo maker (Candidate 4) + license keys — first revenue
Later                  Local PDF toolkit (Candidate 3) as a sibling property
```

Engineering timeline (Milestones 0–8) is 3–4 weeks; content waves run in parallel and past it.

## Monetization reality — read this before planning revenue

- **AdSense RPM by geography:** US/Canada $12–40, Western Europe $8–22, **Tier-3 (India/Philippines) $0.50–3.50** ([2026 benchmarks](https://adstimate.com/blog/adsense-rpm-by-country.html)). Journey by Mediavine needs 1,000 monthly sessions minimum, 70/30 split, reported average RPM $11.15.
- ⚠️ **No published RPM figure exists specifically for tool/utility sites.** Inference, flagged as inference: tool sites are the *worst* case for ads — one pageview per session, near-zero dwell after the tool runs, Tier-3-skewed traffic. Plan on **$1–5 RPM**, i.e. 100k monthly pageviews ≈ $100–500/mo.
- **Therefore: converting 0.2% of users to a $9 one-time license beats ads outright.** The plan is a free unlimited core, with **specialist features** behind an Ed25519-signed offline license key: ID-photo country presets, background removal, saved preset libraries, bulk rename. ⚠️ **Never gate volume** — no "paid above N files." That would violate product principle 2 in `02-prd.md` §4 and contradict the "no file count limit" claim we publish in structured data. See `06-contracts.md` §4.
- Note the constraint interaction: ads require *not* being cross-origin isolated. Since we've already chosen single-threaded WASM (ADR-003), both paths stay open.

---

## Sources

[ahrefstop iLoveIMG](https://ahrefstop.com/websites/iloveimg.com) · [ahrefstop CloudConvert](https://ahrefstop.com/websites/cloudconvert.com) · [ahrefstop FreeConvert](https://ahrefstop.com/websites/freeconvert.com) · [ahrefstop iLovePDF](https://ahrefstop.com/websites/ilovepdf.com) · [ahrefstop Smallpdf](https://ahrefstop.com/websites/smallpdf.com) · [ahrefstop pdf24](https://ahrefstop.com/websites/pdf24.org) · [ahrefstop remove.bg](https://ahrefstop.com/websites/remove.bg) · [ahrefstop PhotoRoom](https://ahrefstop.com/websites/photoroom.com) · [ahrefstop regex101](https://ahrefstop.com/websites/regex101.com) · [ahrefstop diffchecker](https://ahrefstop.com/websites/diffchecker.com) · [Similarweb Squoosh](https://www.similarweb.com/website/squoosh.app/) · [Similarweb TinyPNG](https://www.similarweb.com/website/tinypng.com/) · [Similarweb iLovePDF](https://www.similarweb.com/website/ilovepdf.com/) · [Similarweb jsonformatter](https://www.similarweb.com/website/jsonformatter.org/) · [FBI Denver warning](https://www.fbi.gov/contact-us/field-offices/denver/news/fbi-denver-warns-of-online-file-converter-scam) · [BleepingComputer](https://www.bleepingcomputer.com/news/security/fbi-warnings-are-true-fake-file-converters-do-push-malware/) · [Malwarebytes](https://www.malwarebytes.com/blog/news/2025/03/warning-over-free-online-file-converters-that-actually-install-malware) · [Forbes](https://www.forbes.com/sites/zakdoffman/2025/03/18/fbi-warns-chrome-safari-and-edge-users-do-not-use-these-websites/) · [Capterra Smallpdf reviews](https://www.capterra.com/p/172606/Smallpdf/reviews/) · [GetLatka Smallpdf](https://getlatka.com/companies/smallpdf.com) · [Smallpdf statistics](https://smallpdf.com/pdf-statistics) · [Stirling-PDF](https://github.com/Stirling-Tools/stirling-pdf) · [it-tools](https://github.com/corentinth/it-tools) · [addyosmani/bg-remove](https://github.com/addyosmani/bg-remove) · [JPEG XL in Chrome](https://reezo.ai/blog/jpeg-xl-returns-to-chrome-what-it-means-for-web-images) · [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) · [Zero-click search stats](https://www.omnibound.ai/blog/zero-click-search-statistics) · [AdSense RPM by country](https://adstimate.com/blog/adsense-rpm-by-country.html) · [Journey by Mediavine](https://www.productiveblogging.com/everything-you-need-to-know-about-journey-by-mediavine/)
