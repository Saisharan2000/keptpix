# 09 — SEO & Content Plan

The acquisition strategy is prerendered, genuinely-functional tool routes. This document specifies exactly which routes exist, what goes on them, and where the line is that must not be crossed.

---

## 1. The two constraints that shape everything

### 1.1 AI crawlers do not execute JavaScript

GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, and PerplexityBot fetch JavaScript files but **never run them**. ClaudeBot fetched JS in ~23.84% of requests and executed none. Googlebot is the only major crawler that renders — and Google still explicitly recommends prerendering because rendering is queued and can be delayed.

**Consequence:** if the page content only exists after hydration, every AI answer engine sees an empty document. Given how much discovery now routes through assistants, this is a larger risk than classic ranking. It is resolved architecturally by Astro (ADR-001), not by tactics.

### 1.2 Google's scaled-content and doorway policies

Google's spam policies (last updated 2026-05-15) define **scaled content abuse** as generating many pages "for the primary purpose of manipulating search rankings and not helping users," explicitly including using generative AI "to generate many pages without adding value." **Doorway abuse** covers pages "created to rank for specific, similar search queries" that funnel to a destination more useful than the doorway itself.

**Where the line falls for tool pages:**

| ✅ Safe | ❌ Unsafe |
|---|---|
| `/convert/heic-to-jpg` that actually performs HEIC→JPG, with HEIC-specific UI, real constraints, and copy about that specific pair | 5,000 routes differing only by a noun in a spun paragraph, all funnelling to one generic uploader |
| Content that is useful to a visitor who never searched for it | Content whose only purpose is to exist for a query |
| Only pairs the engine genuinely supports | Every permutation the format list can produce |

Tool pages have a defence most programmatic SEO lacks: **the page genuinely does a different thing.** Lean on that and generate only what you can actually perform.

⚠️ **Note on a common claim:** several SEO blogs market a "March 2026 scaled content ban." Search Engine Land's update library does not attribute the March 2026 core/spam updates to scaled content specifically, and Google's policy language on scaled content dates to March 2024 and is unchanged in substance. Treat the "ban" framing as unverified blog narrative; the policy text above is authoritative.

---

## 2. Route matrix

Total: **74 prerendered routes** across all four publishing waves (blog posts excluded — they're written as needed). Well under Cloudflare Pages' 20,000-file cap, and small enough that every page can be genuinely written rather than spun.

| Group | Routes |
|---|---|
| Format pairs (§2.1) | 30 |
| Target-size presets (§2.2) | 13 |
| Task hubs + resize presets (§2.3) | 16 |
| Content + format reference (§2.4) | 15 |
| **Total** | **74** |

### 2.1 Format-pair routes — `/convert/[from]-to-[to]`

Only pairs the engine supports, and only pairs with plausible real demand.

| From ↓ To → | JPG | PNG | WebP | AVIF | JXL |
|---|---|---|---|---|---|
| **HEIC** | ★ P1 | ✓ P1 | ✓ P1 | ✓ P2 | — |
| **WebP** | ★ P1 | ★ P1 | — | ✓ P2 | — |
| **PNG** | ★ P1 | — | ★ P1 | ✓ P2 | ✓ P2 |
| **JPG** | — | ✓ P1 | ★ P1 | ✓ P2 | ✓ P2 |
| **AVIF** | ✓ P1 | ✓ P1 | ✓ P2 | — | — |
| **JXL** | ✓ P2 | ✓ P2 | ✓ P2 | — | — |
| **TIFF** | ✓ P2 | ✓ P2 | — | — | — |
| **BMP** | ✓ P2 | ✓ P2 | — | — | — |
| **GIF** | ✓ P2 | ✓ P2 | — | — | — |
| **SVG** | ✓ P2 | ★ P2 | ✓ P2 | — | — |

★ = highest-demand, write first · ✓ = ship · — = not supported, **do not create a route**

**30 pair routes: 7 ★, 11 P1 total (6 of which are also ★), 19 P2.** Row counts: HEIC 4, WebP 3, PNG 4, JPG 4, AVIF 3, JXL 3, TIFF 2, BMP 2, GIF 2, SVG 3.

The 7 ★ routes, explicitly: `heic-to-jpg`, `webp-to-jpg`, `webp-to-png`, `png-to-jpg`, `png-to-webp`, `jpg-to-webp`, `svg-to-png`.

Evidence anchors: "webp to jpg" sends 220.2K visits/mo to iLoveIMG; "webp to png" 62.7K to CloudConvert. HEIC has no single published volume figure, but the SERP density of dedicated HEIC sites indicates monetizable volume.

**JPEG XL is a timed bet.** JXL returned to Chrome 145 in Feb 2026 behind a flag and is expected on-by-default in H2 2026, moving support from ~16% to ~85–90%. Format transitions reliably produce multi-year conversion-query waves. Publish the JXL routes *before* the flag flips, so they're aged and indexed when volume arrives.

### 2.2 Target-size routes — `/compress/[format]-to-[size]`

The Form Filer persona's exact query. Driven by government portal and exam registration upload caps.

| Format | Sizes |
|---|---|
| JPG | 20 KB, 50 KB, 100 KB, 200 KB, 500 KB, 1 MB |
| PNG | 50 KB, 100 KB, 200 KB, 500 KB |
| WebP | 50 KB, 100 KB, 200 KB |

**13 routes.** Each prefills `sizeMode: { kind: 'target', targetBytes }` from the slug, so the user's first action is dropping files.

### 2.3 Task routes

`/compress` · `/convert` · `/resize` · `/metadata` (4 hub routes) · `/resize/[preset]` (12 dimension presets: 1920×1080, 1280×720, 1080×1080, 1200×630, 800×600, 640×480, 512×512, 256×256, 1024×1024, 1500×500, 851×315, 400×400)

**16 routes.**

### 2.4 Content routes

| Route | Purpose |
|---|---|
| `/` | Homepage — tool + positioning |
| `/how-it-works` | ⭐ **The trust page.** Step-by-step DevTools verification, architecture explanation, what we can and cannot do |
| `/privacy` | Short and true: we collect nothing because there is nowhere to send it |
| `/about` | Who built it and why |
| `/formats/[format]` | 11 reference pages, one per `InputFormat`: what it is, support matrix, when to use it |
| `/blog/*` | Sparse. Only publish when there's something real to say (e.g. "JPEG XL is coming to Chrome — what changes"). **Not counted in the 74** — written ad hoc, one planned for Wave 4 |

**15 routes** (4 content + 11 format references).

---

## 3. Per-route content specification

Every `/convert/[pair]` page must contain, **as static HTML present before any JavaScript runs**:

| Block | Requirement |
|---|---|
| `<h1>` | "Convert {FROM} to {TO}" — exactly one h1 |
| Lede | One sentence, ≤ 25 words, containing the privacy claim |
| Tool island | The `client:visible` `ToolShell`, preconfigured from the slug |
| "What is {FROM}?" | 80–150 words, **specific to this format** — history, who produces it, why the user has one |
| "Why convert to {TO}?" | 3–5 bullets, pair-specific and concrete |
| Format comparison table | Five rows — Compression, Support, Transparency, Metadata, Typical size — with real values, not filler. Stored in `FormatPairRoute.comparison` (`05-data-models.md` §5) |
| Technical notes | The honest bit: lossy→lossy recompression, alpha loss on JPEG, EXIF handling, quality guidance for this pair |
| FAQ | ≥ 4 questions, **pair-specific**, with `FAQPage` JSON-LD |
| Related tools | 4–6 genuinely related routes |
| Privacy line | The verifiable claim + link to `/how-it-works` |

**Minimum 400 words of substantive, pair-specific prose.** If you cannot write 400 non-generic words about a pair, that pair does not get a route.

### Anti-pattern examples

| ❌ Generic (fails the policy) | ✅ Specific (passes) |
|---|---|
| "HEIC is an image format. JPG is an image format. Converting is easy." | "HEIC uses HEVC intra-frame compression, producing files roughly half the size of an equivalent JPEG. Apple made it the iPhone default in iOS 11 (2017). Windows can open HEIC but requires a paid codec from the Microsoft Store, which is why most people converting HEIC are trying to open iPhone photos on a Windows PC or attach them to something that rejects the format." |
| "Q: Is it free? A: Yes, it's free." | "Q: Will converting HEIC to JPG lose quality? A: Yes, some. HEIC is already lossy, so re-encoding to JPEG is a second lossy pass. At quality 85+ the difference is not visible at normal viewing sizes, but if you plan to edit afterwards, convert to PNG instead and accept the larger file." |

---

## 4. Structured data

```jsonc
// Every tool route
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "HEIC to JPG Converter",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Any (web browser)",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "featureList": [
    "Converts HEIC to JPG entirely in the browser",
    "No upload — files never leave the device",
    "Batch conversion, no file count limit",
    "Removes EXIF and GPS metadata"
  ]
}
```

Plus `FAQPage` for the FAQ block, `BreadcrumbList` for navigation, and `HowTo` on `/how-it-works`. Emit all of it from `SeoHead.astro` at build time.

---

## 5. `robots.txt` — explicitly welcome AI crawlers

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: https://noupload.app/sitemap.xml
```

Canonical domain is `noupload.app` everywhere — sitemap, OG URLs, JSON-LD, and the Phase-4 Worker at `license.noupload.app`.

Rationale: there is no content to protect, and being cited by an assistant as "a browser-based converter that doesn't upload your files" is *exactly* the distribution this product wants. Since our pages are real HTML, we are one of the few tool sites these crawlers can actually read.

---

## 6. Publishing sequence

| Wave | When | Routes | Count | Rationale |
|---|---|---|---|---|
| **1** | Launch (Milestone 6) | `/`, `/how-it-works`, `/privacy`, `/about`, 4 task hubs (`/convert`, `/compress`, `/resize`, `/metadata`), **all 7 ★ pairs**, 6 JPG size routes | **21** | Small, hand-written, high quality. Establishes a baseline quality signal before scaling. |
| **2** | +3 weeks | Remaining 5 P1 pairs (`heic-to-png`, `heic-to-webp`, `jpg-to-png`, `avif-to-jpg`, `avif-to-png`), 7 PNG/WebP size routes | **12** | Publish only after Wave 1 shows indexing |
| **3** | +6 weeks | 13 P2 pairs (all except the 5 JXL pairs and `svg-to-png`), 11 `/formats/*` pages, 12 resize presets | **36** | |
| **4** | H2 2026, on the Chrome JXL flag flip | 5 JXL pair routes + 1 JXL explainer post | **5** (+1 blog) | The dated catalyst — publish before the flag flips so they're aged and indexed |

Waves 1–4 sum to 74 routes. `/404` is built in Wave 1 too but is excluded from every count — it is never indexed and carries no content. Waves 2–4 are **content operations, not engineering milestones** — Milestone 6 in `10-build-plan.md` builds Wave 1 and the templates; every later wave is data added to `src/content/formats.ts` and `presets.ts` with no code change.

**Do not publish all 74 routes on day one.** A brand-new domain dropping 74 near-identical tool pages is the exact fingerprint of scaled content abuse. Ramping demonstrates a real site being built.

---

## 7. Traffic expectations — realistic, not aspirational

The market context is honest: organic traffic across this category is **declining**. iLovePDF −2.5M MoM, Smallpdf −677K, wordcounter −724K, Squoosh −9.3%. Roughly 60–65% of US searches end without a click, and 83% when AI Overviews are present.

**What works in our favour:** transactional queries are only ~31% zero-click versus 74% for informational. Google cannot convert a file inline. And the client-side model produces dramatically better engagement — Squoosh runs 28% bounce, 6m05s sessions, 4.84 pages/visit against TinyPNG's 68% bounce and 1.56 pages.

**Therefore the plan is not "rank and harvest." It is:**

1. **Rank for transactional queries** where an answer box can't substitute for doing the work.
2. **Convert first-time visitors into direct/PWA return traffic.** Squoosh is 78.6% direct; TinyPNG 71.9%. Winning this category means being the thing people bookmark or install, not the thing they find. Prompt PWA install after a *successful* conversion, never before.
3. **Be citable by AI assistants** — real HTML, clear factual claims, a specific defensible differentiator.
4. **Earn distribution outside search.** The FBI file-converter warning, the 2024 PDF leak incidents, and Stirling-PDF's 81.3k stars all show a live audience for "tools that don't upload." Hacker News, r/privacy, r/degoogle, and privacy-tool directories are real acquisition channels for exactly this product.

**Milestones, stated as ranges because estimates in this space are soft:**

| Month | Indexed routes | Realistic monthly sessions |
|---|---|---|
| 1 | 21 | 200 – 1,000 |
| 3 | 33 | 2,000 – 8,000 |
| 6 | 69 | 10,000 – 40,000 |
| 12 | 74 + blog | 40,000 – 150,000 |

At the upper end, with ~30% direct traffic and a Pro conversion around 0.2%, that is a modest but real business on ~$1/month of infrastructure. It is not iLovePDF, and the plan does not pretend otherwise.
