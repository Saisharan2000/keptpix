# 01 — Market Brief (condensed from the Aug 2026 research sweep)

Full agent report lives in the session log; this is the decision-grade summary. Traffic figures are ahrefstop (Ahrefs mirror) / Similarweb estimates, ±30%, mostly top-country-skewed (India). VERIFIED = fetched and seen; volumes marked ⚠️ could not be verified.

## Why PDF first

| Incumbent | Organic/mo | Signal |
|---|---|---|
| ilovepdf.com | 163.3M | $8.2M/mo traffic value |
| smallpdf.com | 51.5M | "pdf to jpg" 190K US #1, "jpg to pdf" 168K #1 |
| pdf24.org | 12.3M, growing | Top-5 keywords: merge 1.7M, compress 1.6M, image→pdf 896K, split 336K (India vols) |

- **≈227M combined organic visits/mo** — one to two orders of magnitude above every other candidate niche examined.
- pdf24's entire visible top-5 is 100% client-side feasible (pdfjs-dist + @cantoo/pdf-lib).
- **The wedge transplants:** Adobe maintains dedicated "compress PDF to 100KB" / "to 200KB" landing pages on its India subdomain — the same government-form target-size cluster KeptPix serves for images. KeptPix's binary-search engine reuses directly.
- Stirling-PDF at **78.8k GitHub stars** (Aug 2026) validates "PDF tools without uploading" demand.
- All major incumbents are upload-based with subscription gates. The "instant, in-browser, no upload" tier is unclaimed at scale.
- **Honestly excluded:** PDF→Word (not client-side feasible with fidelity; Smallpdf's #3 keyword — we publicly say no, as KeptPix's trust posture requires). True content-stream redaction (hard; rasterize-rebuild fallback must be labeled).

## Why video second

- ezgif.com: 2M organic/mo on a 2010s server-upload architecture; "mp4 to gif" 116K US #1.
- "video compressor" 58K US; **8mb.video sustains ~113K visits/mo as a standalone site** doing only compress-to-8MB — proof the Discord/WhatsApp target-size cluster supports products. ⚠️ exact "compress video to 8mb" volume unverified.
- veed/freeconvert (11M/mo) monetize via watermarks, signup walls, 1 GB caps — every one a pain point "$9 once, no upload, no watermark" attacks.
- **Technical timing:** mediabunny (6.5k stars, v1.46 June 2026, pure TS, zero deps) makes trim-without-reencode, audio extraction, MP4↔WebM, and two-pass compress-to-target-MB real in evergreen browsers via hardware WebCodecs. No COOP/COEP needed — consistent with ADR-003.
- **Highest AI-resilience of any category:** no answer engine transcodes a 300 MB local file inline, and skipping the upload is a *speed* win, not just privacy.

## QR as the cheap win

- qrcode-monkey 1.7M/mo growing; "qr code generator" 538K US.
- Market leader has a **1.5/5 Trustpilot**; the category's signature scandal is free "dynamic" QRs that die after trial, killing printed materials. A locally-generated static QR **cannot expire** — the pitch writes itself. ~2 days of work.

## Rejected as foundations (with evidence)

- **Dev toolbox / text utilities:** being eaten by AI inline answers in real time — wordcounter.net lost 724K visits in one month (-17% MoM). it-tools is free-and-beloved (39k stars) with only ~108K/mo web traffic; nothing to win.
- **CSV/data tools:** category leaders at 130–200K/mo (~100× smaller than PDF) and chat code-interpreters absorb the use case. Earns 1–2 cheap routes later (CSV↔XLSX↔JSON), never the foundation.
- **Invoice generator** (discovered): highest per-visit value found (~$2.00/visit vs ~$0.05 for iLovePDF), 510K/mo, client-side feasible — flagged as a future route, not a foundation.

## Tool priority (build order = doc 05 milestone order)

| # | Tool | Head terms (best available evidence) |
|---|---|---|
| 1 | Merge PDF | "merge pdf" 1.7M India ⚠️US unverified |
| 2 | **Compress PDF to target KB** | "compress pdf" 1.6M India + the 100KB/200KB cluster (Adobe-validated) |
| 3 | Images → PDF | "jpg to pdf" 168K US #1-contested + 4.8M India |
| 4 | PDF → Images | "pdf to jpg" 190K US |
| 5 | Split / rotate / reorder | "split pdf" 336K India |
| 6 | **Compress video to target MB** | "video compressor" 58K US; Discord/WhatsApp presets |
| 7 | MP4 → GIF (+trim) | "mp4 to gif" 116K + "video to gif" 79K US |
| 8 | Sign PDF | ⚠️ est. 50–150K US; first license-tier candidate |
| 9 | QR generator (+ batch from CSV) | "qr code generator" 538K US |
| 10+ | CSV↔XLSX↔JSON, invoice generator | cheap adjacencies |
