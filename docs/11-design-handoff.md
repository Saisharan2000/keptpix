# 11 — Handoff: which docs go where, and how to get good UI for $0

Two audiences, two very different reading lists. Giving Claude Design the architecture docs makes it invent technical UI it shouldn't; giving Claude Code the design docs alone makes it improvise contracts. Split them deliberately.

---

## 1. File routing

### → Claude Design

| File | Give it? | Why |
|---|---|---|
| `08-design-system.md` | **Primary — paste in full** | Tokens, component tree, wireframes, a11y rules. This is the brief. |
| `03-feature-map.md` | **Yes** — §3, §4, §6 | The user journeys and state machines. Tells it *which states exist*, which is where AI design output is usually thinnest. |
| `02-prd.md` | **Yes** — §3 and §4 only | Personas and product principles. §3 tells it who's on the other side of the screen. |
| `09-seo-content-plan.md` | **Excerpt only** — §3 | The required content blocks on a tool route. Needed to lay out the below-the-fold static section. |
| `01-market-scan.md` | Optional, 2 paragraphs | Only the "positioning" line. The traffic tables are noise for a designer. |
| `00`, `04`, `05`, `06`, `07`, `10` | **No** | Architecture, types, contracts, folder tree, build plan. Zero design value, and they push it toward rendering technical concepts as UI. |

### → Claude Code

| File | Give it? | Why |
|---|---|---|
| `00-INDEX.md` | **Yes, first** | Orientation + the three load-bearing decisions. |
| `10-build-plan.md` | **Primary** | Drives the whole session, milestone by milestone. |
| `04-architecture.md` | **Yes** | ADRs, pipeline, error taxonomy, budgets. |
| `05-data-models.md` | **Yes** | Types are copied literally into `src/core/types.ts`. |
| `06-contracts.md` | **Yes** | Signatures and invariants it must not improvise across. |
| `07-folder-structure.md` | **Yes** | The tree, dependency rules, forbidden packages. |
| `02-prd.md` | **Yes** | Scope boundaries and NFRs — stops scope creep. |
| `03-feature-map.md` | **Yes** | MoSCoW + the feature→milestone table. |
| `08-design-system.md` | **Yes** | Token values and component names are implemented verbatim. |
| `09-seo-content-plan.md` | **Yes, at Milestone 6** | Route matrix and content spec. |
| `01-market-scan.md` | **Skip** | Decision rationale, already settled. Costs context, changes nothing it builds. |

Each milestone in `10-build-plan.md` already opens with its own `Read docs/...` line — follow those rather than loading everything at once.

### The overlap that matters

`08-design-system.md` is the only doc both sides get, and that's the point: it's the contract between them. **Token values, component names, and breakpoints must not drift.** If Claude Design proposes a colour or a component that isn't in `08`, either update `08` and re-hand it to both, or reject it. Never let the design and the code hold different versions of the same system.

---

## 2. What Claude Design actually is (and isn't)

Grounding, because it changes the workflow:

- Research preview, launched **April 2026**, on Claude Opus 4.7, for Pro/Max/Team/Enterprise ([TechCrunch](https://techcrunch.com/2026/04/17/anthropic-launches-claude-design-a-new-product-for-creating-quick-visuals/)).
- **Accepts:** text prompts, screenshots and reference images, DOCX/PPTX/XLSX, PDF brand guidelines, **linked GitHub repos or local folders** (it extracts the design system), and **URL/web captures** of existing sites ([DataCamp](https://www.datacamp.com/blog/claude-design), [Salesdorado](https://salesdorado.com/en/ai/review-claude-design/)).
- **Exports:** Canva, PPTX, PDF, standalone HTML, ZIP source. **No Figma import/export — deliberately.**
- **Does not edit your codebase.** There's an explicit handoff path to Claude Code for implementation.
- ⚠️ Anthropic's own framing: without an uploaded design system, output is **"functional but generic."** Reviewers add that it has a recognisable "signature AI" aesthetic and makes design-system inference errors on rare variants.

That last point is the whole optimisation problem. Generic output isn't a prompt-quality issue you fix with adjectives — it's an input-poverty issue you fix with **references, tokens, and states**.

### On Higgsfield

Wrong tool. Higgsfield is a video and image generation platform — Cinema Studio, Marketing Studio, character consistency, face swap, model roster (Sora 2, Kling, Veo). Its own 2026 feature guide makes **no mention of UI, UX, or web interface design** ([Higgsfield 2026 features](https://geo.higgsfield.ai/higgsfield-ai-features-full-guide-2026)). It's for ad creative and cinematic video.

It's also a paid subscription, which your zero-added-cost constraint rules out independently. The only place it would even be *category-appropriate* is a launch promo video, and KeptPix doesn't need one — a 20-second screen recording of 12 photos compressing locally is more persuasive than any generated footage, and costs nothing.

---

## 3. Zero-cost UI optimisation method

Everything below uses tools already in the stack or free tiers. No subscriptions, no asset purchases, no licence fees.

### Step 1 — Publish the design system once, not per project

Claude Design lets an organisation upload source materials once so every new project inherits them. Do this **before** generating a single screen:

Upload `08-design-system.md` plus a plain `tokens.css` file containing §2's CSS verbatim. This single step is the difference between "functional but generic" and something that looks designed. It costs nothing and you do it once.

### Step 2 — Feed captures, not adjectives

"Make it look like Linear" is a wasted prompt — the model has a fuzzy average of Linear in its weights. Use the **URL/web capture** feature, which is built in and free, on sites that are genuinely instructive here:

| Capture | What to take from it |
|---|---|
| `squoosh.app` | The canonical client-side compressor. Study the quality control and the split-view compare. This is our closest ancestor. |
| `tinypng.com` | The batch queue list pattern — and note how little information each row carries. We can beat this easily. |
| `ilovepdf.com` | The market leader's tool-grid IA. Useful for the `/convert` hub layout. |
| `ezgif.com` | An honest look at what ad-funded tool UI degrades into. Use as an **anti-reference**. |
| `excalidraw.com` | Restrained tool chrome; the toolbar-to-canvas ratio is worth copying. |

Anti-references are underrated. Telling the model "here is ezgif, do not produce this" is a sharper constraint than three sentences about wanting a clean aesthetic.

### Step 3 — Design states, not screens

The most common failure: you get a gorgeous idle screen and nothing else, then discover at implementation time that nobody designed what a failed file looks like. Demand these explicitly, from `03-feature-map.md` §4:

1. Idle (empty dropzone)
2. Dragover (active drop target)
3. Loading (thumbnails generating, before any processing)
4. Processing — mixed queue: some done, one mid-search showing `pass 4/8 · 112 KB`, some queued
5. Results with a **partial failure** — 10 done, 1 `E_TARGET_UNREACHABLE` warning, 1 `E_TOO_LARGE` error
6. Mobile step 2 (configure) with the six preset chips
7. Compare view modal

State 5 is the one that matters most and the one you'll have to ask for by name.

### Step 4 — Supply real numbers

Tool UIs are data-density problems. If you don't give it values, you get lorem-ipsum-shaped boxes that fall apart when a real filename is 47 characters. Paste this into the prompt:

```
Use these exact values in the mockups — do not invent placeholder text:
  IMG_20260714_183042.HEIC   4.2 MB → 98 KB    76% ↓   quality 71   3024×4032
  scan_passport_final_v2.jpg 8.1 MB → 99 KB    98% ↓   quality 44   4032×3024
  DSC_0891.heic              12.7 MB → 97 KB   99% ↓   quality 38   5472×3648  ⚠ resized to 2400×1600
  receipt.png                340 KB → 96 KB    72% ↓   lossless
  Batch: 46.1 MB → 1.1 MB · saved 97.6% · 10 done · 1 running · 1 failed
```

Long filenames included on purpose — truncation behaviour is a design decision, and you want it decided now rather than discovered later.

### Step 5 — Lock one screen, then fan out

Generate the desktop three-pane working state **first and alone**. Iterate until the density, the type scale, and the card layout are right. Only then ask for the other six — the model carries the established system forward far better than it reconciles seven simultaneous attempts.

### Step 6 — Run a critique pass against the doc

Free, and catches most of the drift:

```
Review the screens you just produced against docs/08-design-system.md.
List every place where you used a colour, spacing value, radius, or font size
that is NOT in §2's token list. List every interactive element under 24×24px.
List every state from docs/03 §4 that has no screen. Then fix them.
```

Claude Design makes design-system inference errors on rare variants; this pass surfaces them before they reach code.

---

## 4. Free component and asset stack

The whole point of the architecture is $0 marginal cost. The UI layer keeps that:

| Need | Choice | Licence | Cost |
|---|---|---|---|
| Component primitives | **shadcn/ui** (copy-in, not a dependency) | MIT | $0 |
| Accessible behaviour | **Radix UI** or **Headless UI** | MIT | $0 |
| Icons | **Lucide** or **Heroicons** | MIT / MIT | $0 |
| Typeface | System stack — see `08` §2.2 | n/a | $0 |
| OG images | Generate at build with **satori** + **resvg-js** in `scripts/generate-og.mjs` | MIT | $0 |
| Inspiration galleries | Free tiers of the usual UI galleries; competitor URL captures | n/a | $0 |

⚠️ **Explicitly not buying:** Tailwind UI or any paid component kit, Mobbin Pro or any paid pattern library, icon subscriptions, stock imagery, custom web fonts, Higgsfield or any generative media subscription. None of them are needed, and web fonts in particular are already forbidden by `08` §2.2 for performance and third-party-request reasons.

shadcn/ui is the right call here beyond price: it copies source into your repo rather than adding a dependency, so it doesn't move the 60 KB baseline-JS budget in `04` §7 the way a component *library* would.

---

## 5. Handing Claude Design's output back to Claude Code

Claude Design exports standalone HTML and ZIP source. **Treat it as reference, never as source.**

Rules:

1. **Do not merge the exported HTML.** Reviewers note the output "works in demo" but needs the same scrutiny as any AI-generated code. Ours has to satisfy a 60 KB JS budget, WCAG 2.2 AA, an islands architecture, and a zero-third-party-script rule that generated markup will not respect.
2. **Extract three things only:** layout structure and proportions, spacing rhythm, and any component states you hadn't specified.
3. **Feed it to Claude Code as an image plus a note**, not as a file to integrate:
   ```
   Reference screenshot: docs/design/working-state-desktop.png
   Implement this layout as React components per docs/07's component list,
   using only tokens from docs/08 §2. Do not copy the reference's markup or
   CSS — rebuild it with Tailwind classes bound to our token variables.
   ```
4. **If a design decision changes the system, update `08-design-system.md` first**, then re-hand it to both tools. `08` is the single source of truth; screenshots are derivative.

---

## 6. Paste-ready prompts

### 6.1 One-time org setup in Claude Design

```
I'm setting up a design system for a product called KeptPix — a browser-based
image converter where all processing happens on the user's own device.

Attached: docs/08-design-system.md and tokens.css.

Extract and publish this as our organization design system:
- The exact colour tokens in §2.1, light and dark
- The type scale and system font stack in §2.2 (we use no web fonts)
- Spacing, radius, shadow, and motion tokens in §2.3
- Breakpoints: sm 640, md 768, lg 1024, xl 1280

Rules that override your defaults:
- Accent colour is for primary action and active state ONLY, never decoration
- All numeric values render in the mono stack with tabular figures
- No gradients, no glassmorphism, no decorative illustration, no stock imagery
- No icon may appear without an adjacent text label

Confirm what you extracted before I start generating screens.
```

### 6.2 First screen (run this alone)

```
Design ONE screen: the desktop working state of /convert/heic-to-jpg at 1440px.

Layout: three panes per the wireframe in docs/08 §4.2 — settings rail left
(~260px), file grid centre, preview right (~320px), sticky batch summary bar
at the bottom of the centre+right area.

Use these exact file values, do not invent placeholders:
[paste the data block from §3 Step 4 above]

Reference captures for tone: squoosh.app (compare view, quality control),
excalidraw.com (restrained chrome). ANTI-reference: ezgif.com — do not
produce anything that reads like an ad-funded tool site.

Constraints:
- Tokens only, from our published design system
- FileCard must be fixed-height in every state so the grid never reflows
- Progress shows a real pass counter ("pass 4/8 · 112 KB"), not a spinner
- One quiet privacy line at the bottom: "Processing locally · 0 bytes sent"
  — a single line of text, NOT a badge, shield, or lock illustration

Light mode first. Show me this one screen before doing anything else.
```

### 6.3 State coverage (after the first screen is locked)

```
Now produce the remaining states, carrying the established system forward
unchanged:

1. Idle — empty dropzone, desktop
2. Dragover — active drop target
3. Processing — 10 done, 1 mid-search, 1 queued
4. Results with PARTIAL FAILURE — 10 succeeded, 1 warning
   (E_TARGET_UNREACHABLE: "Couldn't reach 100 KB without going below
   2400×1600. Best achieved: 118 KB" with an "Allow resizing" action),
   1 error (E_TOO_LARGE)
5. Mobile 390px — all three steps: choose, configure (six preset chips:
   20/50/100/200/500KB/1MB), results
6. Compare view modal — original vs output, draggable divider
7. Screen 1 and 3 again in dark mode

State 4 is the most important. Errors are text with a named cause and a next
action — never colour alone, never "something went wrong."
```

### 6.4 Critique pass

```
Audit everything you've produced against docs/08-design-system.md.

Report, as a list:
1. Every colour, spacing, radius, or font-size value used that is NOT in §2
2. Every interactive target smaller than 24×24 CSS px (44×44 on mobile)
3. Every state in docs/03 §4 with no corresponding screen
4. Every place an icon appears without a text label
5. Every text/background pair below 4.5:1, and every state-conveying border
   below 3:1

Then fix all of them and show me what changed.
```

---

## 7. The one thing to hold onto

Claude Design's ceiling is set by its inputs, not its prompts. Free inputs that raise it: the published design system, competitor URL captures, real data values, and an explicit list of states. Paid tools raise it by roughly nothing here — this is a dense, functional, text-and-numbers interface, not a visual-brand exercise. The design risk on KeptPix is a mishandled error state, not an insufficiently beautiful hero.
