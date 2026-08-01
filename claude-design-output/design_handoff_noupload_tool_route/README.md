# Handoff: NoUpload — `/convert/[pair]` tool route

## Overview

The complete design for NoUpload's core surface: a prerendered `/convert/[pair]` page whose only interactive island is the conversion tool. Covers all nine states — idle, dragover, loading, processing, results, results with partial failure, mobile three-step flow, compare modal, metadata drawer — in light and dark.

The design is derived directly from `docs/08-design-system.md` (§2 tokens verbatim, §3 component tree, §4 wireframes, §5 component specs, §6 accessibility), `docs/03-feature-map.md` §3/§4/§6, `docs/02-prd.md` §3–4 and `docs/09-seo-content-plan.md` §3. **`08` remains the source of truth.** Nothing here introduces a colour, spacing value, radius or font size that is not in §2. If you find a conflict, `08` wins — and tell the designer so `08` is updated and re-handed to both sides.

## About the design files

The files in `design-reference/` and `components/` are **design references written in HTML/JSX** — prototypes that show intended look and behaviour. They are **not production code**. Do not merge them.

They deliberately do not respect the constraints your implementation must satisfy: the 60 KB baseline-JS budget (`04` §7), the islands architecture, the zero-third-party-script rule, or the copy-in shadcn/ui + Radix approach in `07`. The task is to **rebuild these designs inside the target codebase** — Astro + React islands per `07-folder-structure.md`, styled with Tailwind classes bound to the `tokens.css` custom properties — using the component names from `08` §3.

Three things are worth extracting verbatim: **layout structure and proportions**, **spacing rhythm**, and **the state coverage** (particularly the failure states, which are usually where an implementation improvises).

## Fidelity

**High-fidelity.** Final colours, type scale, spacing, radii, shadows, motion, copy and real data values. Every value comes from the token set; recreate it exactly, but with your own markup.

One caveat: icons are rendered as CSS masks over the `lucide-static` CDN so the prototype stays a single file set. **In production, install `lucide-react` (or vendor the SVGs) — no CDN request.**

---

## Design tokens

Copy `tokens/` (or the equivalent `src/styles/tokens.css` you already have from `08` §2 — they are identical). Files:

| File | Contents |
|---|---|
| `tokens/color.css` | Light `:root` + `[data-theme="dark"]` scope, all colour and focus tokens |
| `tokens/typography.css` | Font stacks, `--text-*` sizes with paired `--leading-*`, weights, tracking |
| `tokens/space.css` | `--space-1..9`, radii, shadows, durations, easing, containers, breakpoints, the global reduced-motion block |
| `tokens/fonts.css` | `local()`-only `@font-face` bindings for the named system families — no download; safe to drop if your build objects |
| `tokens/base.css` | Element resets, link colours, focus-visible ring, `.nu-num` (mono + tabular), `.nu-skip` skip-link |

Key values you will type most often:

- Accent `#4f46e5` / hover `#4338ca` / active `#3730a3` / subtle `#eef2ff`; dark accent `#8b83f7`
- Text `#12161c` · muted `#5a6472` · subtle `#838c99`; surfaces `#ffffff` / `#f7f8fa` / `#eef0f4`; borders `#e2e5ea` / `#c8cdd6`
- Radii 4 / 8 / 12 / 16 / full · shadows sm / md / lg · durations 120 / 200 / 320ms on `cubic-bezier(0.16, 1, 0.3, 1)`
- Breakpoints sm 640 · md 768 · lg 1024 (three-pane activates) · xl 1280

Two rules that are easy to get wrong:

1. **Accent is for the primary action and active state only.** Never a heading colour, never a background wash, never decoration. The one exception is the focus ring.
2. **`--color-border` is 1.4:1 and decorative only.** Any border that conveys state — focus, selection, error, the dropzone outline — must use `--color-border-strong` or a semantic colour.

And the numeric rule: **every** file size, dimension, percentage, quality number and pass counter renders in `--font-mono` with `font-variant-numeric: tabular-nums` (the `.nu-num` helper), so digits do not jitter as the binary search updates.

---

## Screens / views

All screens sit inside `BaseLayout` → `Header` (56px) → content → `Footer`. The desktop tool region is `100vh` minus the header.

### 1. Idle — desktop 1440 (`design-reference/idle.html`)

**Purpose:** the user lands from Google and drops files without configuring anything.

**Layout:** single column, `max-width: var(--container-lg)` (72rem), centred, `padding: 48px 24px 64px`, `gap: 48px` between blocks.

- **H1** `--text-4xl` / `--leading-4xl` / `--tracking-tight` / weight 700 — "Convert HEIC to JPG". Exactly one h1.
- **Lede** `--text-lg` / `--leading-lg`, `--color-text-muted`, max 62ch — "Free, unlimited, and 100% in your browser. Your photos are never uploaded."
- **Dropzone** — the largest, highest-contrast element above the fold. `min-height: 280px`, `border: 2px dashed var(--color-border-strong)`, `--radius-lg`, background `--color-bg-subtle`, centred column with `gap: 8px`: 32px upload glyph, title "Drop HEIC files here" (`--text-xl`, weight 600), sub "or click to browse · or paste from clipboard" (`--text-sm`, muted), then a 12px-gap constraints line "No file size limit · No sign-up · No upload" (`--text-sm`, `--color-text-subtle`). `role="button"`, `tabIndex=0`, `aria-label="Choose images to convert"`, `aria-describedby` pointing at the constraints line; Enter/Space opens the picker.
- **Privacy line** immediately below, bare (no strip background): 13px lock glyph + "Processing locally · 0 bytes sent" + right-aligned "How to verify this →" link in accent. **A line of text — not a badge, shield or seal.**
- **Below the fold, all static HTML, zero JS:** "What is a HEIC file?" (120 words, HEIC-specific), `FormatSpecTable` (5 rows, real values), `FaqSection` (4 pair-specific Q&As, `<details>`, 44px summary rows, JSON-LD in production), `RelatedTools` (5 links), `PrivacyBanner`.

### 2. Dragover (`index.html` → Dragover)

Identical to idle with the dropzone in its active state: border → `--color-accent`, background → `--color-accent-subtle`, `transform: scale(1.005)`, 120ms, title becomes "Release to add HEIC files".

### 3. Loading (`index.html` → Loading)

Three-pane shell, all 12 cards `queued` (thumb at 55% opacity, "Queued" badge, original size only). Batch bar reads `0 done · 0 running · 0 failed`, `46.1 MB → —`. Privacy line appends "Reading 12 files on this device". Only place an indeterminate progress bar is legitimate is a codec download — never encode passes.

### 4. Working / processing — desktop 1440 (`design-reference/index.html`, the locked screen)

**Layout:** CSS grid, `grid-template-columns: 260px minmax(0,1fr) 320px`, `grid-template-rows: minmax(0,1fr) auto`.

- **Left rail** spans both rows: `ConfigPanel` (scrolls) above, `PrivacyIndicator` strip pinned below. Background `--color-bg-subtle`, 1px right border, 16px padding, 24px between fields. Fields in order: Output (select) · Mode (two radios: Target size / Quality) · Target size (number + KB/MB select + six preset chips, 3 columns) · Resize (select + hint) · Metadata (two checkboxes with hints) · "Advanced ▸" pinned to the bottom of the panel.
  Field labels are `--text-xs`, uppercase, 0.02em tracking, `--color-text-muted`.
- **Centre** `FileGrid`: 16px padding; header row "FILES (12)" (uppercase, `--text-sm`, semibold, muted) with the collapsed "+ Add more files" bar right-aligned (44px tall, 1px dashed); then `grid-template-columns: repeat(auto-fill, minmax(168px, 1fr))`, 12px gap, scrolls.
- **Right** `PreviewPane`, 320px, `--color-bg-subtle`, 1px left border: "PREVIEW" label, a 212px split original|output stage with a centre knob, then label/value rows (values mono, right-aligned): Size `4.2 MB → 98 KB`, Saved `76% ↓`, Quality `71`, Dimensions `3024×4032 (kept)`, Passes `8`; full-width "Compare full size" secondary button.
- **Bottom bar** spans centre + right: counts line "10 done · 1 running · 1 failed" (`--text-sm`, muted) above the mono stat `46.1 MB → 1.1 MB saved 97.6%` (savings in `--color-success`); right side "Clear" (ghost) + "Download all (ZIP)" (primary — the only accent fill on screen). `role="status" aria-live="polite"`.

**FileCard — fixed 212px tall in every state.** This is load-bearing: the grid must not reflow as jobs finish. 104px thumbnail area (`--color-bg-muted`) with the status badge overlaid top-left at 8px; body 12px padding, `gap: 4px`; filename `--text-xs`, single line, ellipsis (the prototype truncates from the left with `direction: rtl` so extensions stay visible — decide this consciously, filenames run to 47 chars); then per state:

| State | Body |
|---|---|
| `queued` | Original size, mono, muted; thumb at 55% opacity |
| `processing` | 4px progress bar + caption `pass 4/8 · 112 KB` (mono, tabular) |
| `done` | `4.2 MB → 98 KB` (`--text-sm`, mono), then `76% ↓ · quality 71 · 3024×4032` (`--text-xs`, savings in success green); actions Save / Compare (ghost, sm) |
| `warning` | Border `--color-warning`; error code + sentence; one-tap fix button "Allow resizing" |
| `failed` | Border `--color-danger`; error code + sentence; Retry / Remove |

### 5. Results with partial failure (`design-reference/partial-failure.html`) — the important one

10 done · 1 warning · 1 error. Successful results are **never** discarded.

- Warning card — `DSC_0891.heic`: `E_TARGET_UNREACHABLE — Couldn't reach 100 KB without going below 2400×1600. Best achieved: 118 KB.` with an **Allow resizing** button. Preview pane shows Target `100 KB`, Best achieved `118 KB`, Quality `20 (floor)`, Passes `8 of 8`.
- Error card — `panorama_balcony_stitched.png`: `E_TOO_LARGE — 184 MP exceeds this device's memory budget. Resize below 100 MP and retry.` with Retry / Remove.
- Batch bar: `10 done · 0 running · 1 failed`, `46.1 MB → 1.2 MB saved 97.4%`; Download all still enabled.

Errors are **icon + code + sentence + next action**, never colour alone, never "Something went wrong."

### 6. Mobile — 390px, three steps (`design-reference/mobile.html`)

Sequential flow, never the desktop layout squeezed.

- **Step 1 choose:** header, h1 `--text-2xl`, lede `--text-sm`, dropzone (same component, shorter constraint copy), privacy line, then the static content blocks.
- **Step 2 configure:** back bar + "Settings"; the same rail fields stacked at full width on `--color-bg-subtle`, preset chips **4 across**; sticky bottom bar with a 48px full-width primary "Convert 12 files" — always thumb-reachable.
- **Step 3 results:** back bar + "Results" + a done badge; mono batch stat; 2-column card grid; sticky bottom bar with "Download all (ZIP)" (primary) above "Start over" (ghost).

All targets ≥ 44×44 on mobile.

### 7. Compare view modal (`index.html` → Compare modal)

Scrim `rgb(16 22 28 / .55)`, no blur. Panel `min(1040px, 100%)`, `--radius-lg`, `--shadow-lg`. Header: filename (semibold, `--text-sm`) + "Save output" + "Close". Stage 420px with a draggable 2px `--color-border-strong` divider and a 32px round knob. **A keyboard-operable range input underneath is mandatory** (WCAG 2.5.7 — everything achievable by drag must be achievable without it). Footer: two mono readouts, Original `4.2 MB · 3024×4032`, Output `98 KB · quality 71`.

### 8. Metadata drawer (`index.html` → Metadata drawer)

Right drawer, `min(420px, 100%)`, full height, 1px left border, `--shadow-lg`. Header "Metadata" + Close. Rows are a `132px 1fr` grid, 1px bottom border, key muted / value mono; fields that stripping will remove render struck-through with "· removed" (Make, Model, DateTimeOriginal, GPSLatitude, GPSLongitude, LensModel), retained fields plain (Orientation, ColorSpace, PixelDimensions). Footer: "Strip all metadata" (secondary, block) + "Copy" (ghost).

### 9. Dark (`design-reference/working-dark.html`, `idle-dark.html`)

Set `data-theme="dark"` on `<html>`. No component changes — every alias remaps. Accent lightens to `#8b83f7` with dark accent-text so the contrast ratio rises to 11.2:1.

---

## Interactions & behaviour

- **Dropzone:** drop, click-to-browse, clipboard paste, folder drop (`webkitGetAsEntry`). Enter/Space on focus opens the picker. Collapses to the slim "+ Add more files" bar once files exist.
- **Mode switch** swaps `TargetSizeControl` for `QualityControl` in place; the rest of the rail is unchanged.
- **Preset chips** set the numeric input and mark themselves `aria-pressed`.
- **Target validation:** below 5 KB, an inline warning — "Below 5 KB, output quality will suffer badly." After a run, `98 KB / 100 KB ✓` appears under the control.
- **Progress:** honest per-pass reporting, `pass n/8 · <achieved>`; never a spinner, never a fake bar. Announce batch status via `aria-live="polite"` at start, 50% and completion only — per-file announcements flood a screen reader.
- **Re-run:** originals are retained after processing, so changing settings and re-running must not require re-dropping files.
- **Compare** opens from the preview pane button and from a card's Compare action.
- **Motion:** only three animations exist — dropzone dragover (120ms), progress fill width (200ms), indeterminate bar during codec download. Everything collapses to 0.01ms under `prefers-reduced-motion` (already in `tokens/space.css`).
- **Hover:** ghost → `--color-bg-muted`; secondary → `--color-bg-subtle`; primary → `--color-accent-hover`. Nothing lifts or scales except the dropzone. **Press:** primary → `--color-accent-active`. **Focus:** 2px `--color-focus-ring` at 2px offset, never removed. **Disabled:** `opacity: .5`, `cursor: not-allowed`.

## State management

Per-file: `id`, `name`, `bytesIn`, `state ∈ {queued, processing, done, warning, failed}`, `pass`, `passTotal`, `bytesOut`, `quality`, `dimensions`, `resized`, `errorCode`, `errorMessage`. Per-batch: `files[]`, `config {format, mode, targetBytes, unit, quality, resize, stripMetadata, keepRotation}`, `selectedFileId`, `compareOpen`, `metadataOpen`, `theme`. Derived: counts, `bytesInTotal`, `bytesOutTotal`, savings percentage.

Transitions follow `03` §4: `Idle → Loaded → Configuring ⇄ Previewing → Processing → Review`, with `Processing → PartialFailure → Review` preserving every successful result. The worker pool, binary search (quality 20–95, ≤ 8 passes, tolerance 92–100% of target, progressive downscale fallback) and error taxonomy come from `04`/`06`, not from this design.

## Assets

- **Icons:** Lucide (MIT). The prototype masks `lucide-static@0.544.0` from jsDelivr; **install the package in production**. Glyphs used: `upload`, `plus`, `download`, `columns-2`, `maximize-2`, `rotate-ccw`, `trash-2`, `lock`, `check`, `alert-triangle`, `x`, `clock`, `loader`, `chevron-down`, `chevron-right`, `chevron-left`, `arrow-right`, `sun`, `moon`, `eraser`, `copy`, `image`.
  **Rule: no icon may appear without an adjacent text label.** Every `Icon` is `aria-hidden`; it is never the accessible name.
- **Fonts:** none. System stacks only.
- **Images:** none. The only images in the product are the user's own thumbnails.
- **Logo:** none was supplied. The wordmark is "NoUpload" set in the system sans at weight 700, `--tracking-tight`.

## Files

```
README.md                                     this document
design-reference/
  noupload-tool-route-all-states.html         every state in one offline file — open it and
                                              use the switcher bar at the top (review-only,
                                              not part of the design). Works with no network.
components-reference.md                       every component's props contract (.d.ts) and
                                              reference implementation, grouped as
                                              primitives / tool / config / content / chrome
tokens/ + styles.css                          the token set, identical to 08 §2
```

States in the switcher, in order: Working (12 files) · Idle · Dragover · Loading · Partial failure ·
Mobile — 3 steps · Compare modal · Metadata drawer. The theme button in the page header switches
light/dark on any of them.

Each component ships a `.d.ts` next to it — that is the props contract to mirror in your TypeScript.

## Accessibility acceptance

Full keyboard flow (add → configure → process → download) · focus ring never removed · targets ≥24×24 desktop, ≥44×44 mobile · `aria-live="polite"` batch status, `assertive` reserved for errors · `ProgressBar` maintains `aria-valuenow/min/max` · errors as icon + text + action · skip link (`.nu-skip`) first in tab order · `lang` on `<html>` · drag has a keyboard equivalent everywhere. Gate with `@axe-core/playwright` on every route, zero violations.
