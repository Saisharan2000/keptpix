# 04 — Routes & Query Matching

Two halves: the prerendered route matrix (KeptPix doc 09 rules inherited), and the **query-mirroring requirement** — the operator's explicit ask that users who type a specific phrase find a link in exactly those words.

---

## 1. The query-mirroring requirement, stated precisely

**Requirement (from the operator):** when users search a specific phrase — "compress pdf to 200kb", "compress video for discord", "merge pdf files into one" — the site should surface a result whose visible text *is that phrase*, so relevance is instant and the click frictionless.

This is implemented at **three layers**, all client-side, all inherited-architecture-compatible:

### Layer 1 — Exact-phrase prerendered routes (Google-facing)

Every distinct high-intent phrasing gets its own static route whose `<title>`, `<h1>`, and meta description **mirror the query verbatim**:

- `/pdf/compress-to-200kb` → h1 "Compress PDF to 200KB"
- `/video/compress-for-discord` → h1 "Compress Video for Discord (Under 8MB)"
- `/pdf/merge-files-into-one` → h1 "Merge PDF Files Into One"

Exact-match titles win the long tail because Google bolds query matches and users pattern-match the SERP line to what they typed — the mechanic the operator observed. Each variant route prefills the tool from its slug (KeptPix pattern) and carries its own genuinely distinct 400+ words.

**The guardrail that keeps this legal with Google** (spam policy, verified in KeptPix research): a variant route must differ in *intent served*, not just words. "compress-to-100kb" vs "compress-to-200kb" = different prefilled targets → legitimate. "merge-pdf" vs "merge-pdf-files" vs "combine-pdf" = same intent → **one canonical route** (`/pdf/merge`) with the variant phrasings as: the h1's supporting line, FAQ entries phrased as the variant queries ("How do I combine PDF files into one?"), and `alternateName` in JSON-LD. Never three near-identical pages — that's the doorway pattern that gets sites deindexed.

### Layer 2 — The on-site query matcher (user-facing, the direct analog)

The homepage's primary element is a **search box that maps free text to prefilled tool deep-links**, client-side:

- An index of `{phrase, toolId, prefill}` triples built at compile time from the route matrix + variant phrasing lists (several hundred entries, a few KB gzipped).
- Fuzzy match + **parameter extraction**: "pdf under 150 kb" → Compress PDF, target prefilled to **150 KB** (a value with no dedicated route — extracted by pattern, not looked up). "video for whatsapp" → video compress, 16 MB preset. Number+unit parsing is a pure `core/` function with unit tests.
- Results render as links **in the user's own words**: type "compress pdf to 150kb" → the top result's text is "Compress PDF to 150 KB →". That is the Pornhub-style mirror, produced dynamically.
- Zero network: the index ships with the page; typing sends nothing anywhere (privacy posture preserved; the matcher is also the `Cmd+K` palette on every tool page).

### Layer 3 — Query-driven route expansion (the feedback loop)

Monthly, Google Search Console's query report (owner-exported CSV, processed locally) is scanned for queries where the site got impressions with no exact-match route and meaningful volume. Those become the next wave's routes — the site grows toward what users actually type, which is exactly how the incumbents' long-tail footprints formed. This closes the loop the operator asked for: observed phrasing → mirrored page.

---

## 2. Route matrix at launch (~60 routes, waves inherited from KeptPix doc 09 §6 rules)

### PDF (34)
- 7 canonical tool routes: `/pdf/merge`, `/pdf/compress`, `/pdf/split`, `/pdf/rotate`, `/pdf/to-images`, `/pdf/from-images`, `/pdf/sign`
- 8 compress-to-size variants: 50/100/150/200/300/500KB/1MB/2MB (the Adobe-validated cluster)
- 12 format-pair phrasings with distinct intent: `/pdf/jpg-to-pdf`, `/pdf/png-to-pdf`, `/pdf/heic-to-pdf` (cross-sell from KeptPix), `/pdf/pdf-to-jpg`, `/pdf/pdf-to-png`, etc.
- 7 task phrasings with distinct prefills: `/pdf/split-by-range`, `/pdf/extract-pages`, `/pdf/merge-two-pdfs`, etc. — each a real config difference

### Video (14)
- 5 canonical: `/video/compress`, `/video/trim`, `/video/to-gif`, `/video/extract-audio`, `/video/mp4-to-webm`
- 6 platform-preset variants: `/video/compress-for-discord`, `-for-whatsapp`, `-for-email`, `/video/compress-to-8mb`, `-to-16mb`, `-to-25mb`
- 3 phrasing-distinct: `/video/mp4-to-gif`, `/video/gif-from-video`, `/video/mute-video`

### QR (5)
`/qr/generate`, `/qr/wifi`, `/qr/vcard`, `/qr/url`, `/qr/batch` (pro)

### Content (7)
`/`, `/how-it-works` (shared verification page, adapted), `/privacy`, `/about`, `/all-tools`, `/limits` (the honest-limits page — itself a trust differentiator), `/404`

**Every route obeys:** `supported: true` hard gate · 400+ genuinely specific words · five-block content spec from KeptPix doc 09 §3 · FAQ absorbing variant phrasings · JSON-LD `WebApplication` + `FAQPage` with `alternateName` variants.

## 3. Sitemap & internal linking

- Per-category `RelatedTools` blocks (PDF tools link PDF tools + the one relevant KeptPix cross-link).
- The compress-to-size variants interlink as a ladder (100KB page links 50/150/200KB) — mirrors how users adjust when a portal rejects their file.
- KeptPix ↔ KeptTools cross-links are one per page, contextual, never a link farm.

## 4. What is explicitly forbidden

- Publishing variant routes whose only difference is synonyms (doorway pattern).
- Any route for an operation the engine can't perform (`supported` gate).
- Auto-generating routes from search data without the 400-word human-quality bar — Layer 3 feeds the *queue*, not the publish button.
- The query matcher logging or transmitting queries anywhere. It runs and stays on-device.
