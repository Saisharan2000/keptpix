# KeptPix — Blueprint Set

**Working codename:** KeptPix — canonical domain `keptpix.com` (verify availability; every doc, sitemap, and OpenAPI server URL uses this)
**One-line:** Batch image conversion and exact-target-size compression that runs 100% in your browser. Nothing is ever uploaded.
**Date:** 2026-07-28
**Constraint envelope:** zero backend, static hosting, ~$0/month ops, fast build cycle, entering an existing high-demand category on a defensible wedge.

---

## Read order

| # | File | Purpose | Who consumes it |
|---|---|---|---|
| 01 | [`01-market-scan.md`](./01-market-scan.md) | 6 candidate app ideas, evidence, scoring matrix, why #1 won | You (decision) |
| 02 | [`02-prd.md`](./02-prd.md) | Product requirements: users, jobs, scope, success metrics, non-goals | Claude Code + Claude Design |
| 03 | [`03-feature-map.md`](./03-feature-map.md) | MoSCoW matrix, user journeys, feature → module mapping | Claude Code |
| 04 | [`04-architecture.md`](./04-architecture.md) | System design, layer boundaries, worker model, data flow, ADRs | Claude Code |
| 05 | [`05-data-models.md`](./05-data-models.md) | TypeScript domain types, IndexedDB schema, persistence rules | Claude Code |
| 06 | [`06-contracts.md`](./06-contracts.md) | Worker message protocol, engine interfaces, OpenAPI for the optional license Worker | Claude Code |
| 07 | [`07-folder-structure.md`](./07-folder-structure.md) | Exact repo tree, file-by-file responsibilities | Claude Code |
| 08 | [`08-design-system.md`](./08-design-system.md) | Design tokens, component tree, wireframes, a11y rules | Claude Design |
| 09 | [`09-seo-content-plan.md`](./09-seo-content-plan.md) | Programmatic route matrix, per-page content spec, AI-crawler strategy | Claude Code + content |
| 10 | [`10-build-plan.md`](./10-build-plan.md) | Sequenced implementation prompts with acceptance criteria | Claude Code |
| 11 | [`11-design-handoff.md`](./11-design-handoff.md) | Which docs go to Claude Design vs Claude Code, zero-cost UI method, paste-ready prompts | You |

---

## How to feed this to Claude Code

Drop the whole `docs/` folder into the repo root, then open Claude Code and start with:

```
Read docs/00-INDEX.md, docs/02-prd.md, docs/04-architecture.md, docs/07-folder-structure.md.
Then execute Milestone 0 from docs/10-build-plan.md exactly as specified.
Do not deviate from the folder structure in 07 or the contracts in 06.
Stop after Milestone 0 and show me the tree.
```

Then proceed one milestone at a time. Each milestone in `10-build-plan.md` has explicit acceptance criteria — hold Claude Code to them before advancing.

## How to feed this to Claude Design

```
Read docs/08-design-system.md and docs/03-feature-map.md.
Produce high-fidelity screens for: Home (converter), Compress-to-size, Batch queue,
Results, and the /convert/[from]-to-[to] landing template.
Use the token values in 08 verbatim. Light and dark.
```

---

## The three decisions everything else hangs on

1. **Astro + prerendered HTML per route, React islands for the tool UI.** Not Next.js, not a pure SPA. Reason: GPTBot, ClaudeBot, and PerplexityBot do not execute JavaScript at all — a client-rendered tool page is invisible to every AI answer engine. Astro gives real HTML per route with near-zero baseline JS. See ADR-001 in `04-architecture.md`.
2. **No cross-origin isolation (no COOP/COEP headers).** That forecloses multi-threaded WASM, so every engine must work single-threaded. In exchange we keep third-party payment popups, OAuth, and any future ad tag working. See ADR-003.
3. **Canvas-native encoding first, WASM codecs only as fallback or for quality knobs.** Keeps the cold-load payload small enough that mobile users on slow networks actually complete a conversion. See ADR-004.

---

## Cost model at launch

| Item | Cost |
|---|---|
| Cloudflare Pages (static, unlimited bandwidth, commercial use permitted) | $0 |
| Domain | ~$12/yr |
| Cloudflare Worker for license signing (**Phase 4** only, 100k req/day free) | $0 |
| Compute for every user conversion | $0 — it runs on their device |
| **Total monthly, any traffic level** | **~$1** |

This is the entire point of the architecture: marginal cost per user is exactly zero, so the app cannot lose money on traffic.
