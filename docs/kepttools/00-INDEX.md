# KeptTools — Delta Blueprint Set

**Brand:** KeptTools · **Domain:** `kepttools.com` (RDAP-verified unregistered 2026-08-05; buy same-sitting) · **Sibling:** KeptPix (keptpix.com, live)
**One-line:** Every file tool in your browser. PDFs, videos, images — nothing is ever uploaded.
**Date:** 2026-08-05

---

## What this is

The second property in the "Kept" family: **one umbrella domain hosting many small file tools as routes** — PDF toolkit first, WebCodecs video tools second, QR generator as a quick win. Same architecture, same privacy guarantee, same monetization posture (free core + later $9 one-time license, no ads), same design system as KeptPix.

**This is a DELTA set, not a full 13-doc blueprint.** The KeptPix repo is the template. Everything not specified here — layer architecture, worker model, error taxonomy, design tokens, a11y bar, performance budgets, privacy test structure, deviations-log discipline, CLAUDE.md non-negotiables — is inherited from the KeptPix docs verbatim and applies unchanged. Claude Code starts by **forking the KeptPix repo**, not from scratch.

## Read order

| # | File | Purpose |
|---|---|---|
| 00 | this file | Orientation + inheritance rules |
| 01 | `01-market-brief.md` | Condensed evidence: why PDF-first, video-second; tool priorities |
| 02 | `02-prd-delta.md` | What differs from KeptPix's PRD: multi-tool shell, personas, metrics, honest limits |
| 03 | `03-engines-contracts.md` | PDF engine, video engine, QR engine — contracts in KeptPix's own type language |
| 04 | `04-routes-and-query-matching.md` | Route matrix + the **query-mirroring requirement** (exact-phrase long-tail capture) |
| 05 | `05-build-plan.md` | Fork-based milestones with acceptance criteria |

## Inheritance rules (Claude Code: these are binding)

1. **Fork, don't scaffold.** Start from the KeptPix repo at its current HEAD. Delete image-specific content routes; keep every piece of infrastructure: worker pool, `core/target-size.ts`, budget scripts, privacy/a11y/e2e suites, service-worker build step, boundary lint.
2. **KeptPix docs 04, 05, 06, 07, 08 apply unchanged** except where a numbered section of this set explicitly overrides them. Same 60 KB baseline budget, same no-COOP/COEP decision (ADR-003 — WebCodecs needs no threads), same asset-origin policy, same error codes extended per doc 03 here.
3. **The deviations-log discipline continues**: docs/12-style log from day one, same severity scheme, docs amended in the same commit.
4. **Privacy suite is identical and absolute**: zero non-empty request bodies ever, zero requests during processing, same-origin-only allowlist. Video files make this *more* valuable, not less — "your 300 MB video never uploads" is the headline.
5. Cross-link the siblings: KeptPix footer gains "More local tools → KeptTools"; KeptTools links back per-category. Separate domains, separate deploys, shared template updates flow by cherry-pick.

## Cost model

| Item | Cost |
|---|---|
| kepttools.com | ~$12/yr |
| Cloudflare Pages (second project, same account) | $0 |
| Everything else | $0 — same zero-marginal-cost model |

## The three bets this property makes

1. **PDF demand is the largest client-side-feasible pool on the web** (~227M combined incumbent organic visits/mo) and the top operations — merge, compress, split, image↔PDF — need no server.
2. **WebCodecs just made in-browser video tools real** (mediabunny matured in the last 18 months), incumbents are aging or upsell-infested, and "compress video to 8 MB for Discord" is KeptPix's target-size wedge with 10× the pain.
3. **Exact-phrase query mirroring** (doc 04) captures the long tail the giants ignore: a route exists for the precise words users type, and an on-site matcher turns free-text queries into prefilled tool deep-links.
