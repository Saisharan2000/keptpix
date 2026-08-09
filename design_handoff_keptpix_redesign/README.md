# Handoff: KeptPix redesign — tool cards, icons, tool page, homepage

## Overview
Redesign of keptpix.com's three page types (homepage, tool page, hub/index) plus the shared tool card and a nine-icon set. Goal per the brief: scannable rather than readable, one unmistakable next action per tool page, finished within thirty seconds on a phone.

## About the Design Files
`keptpix-redesign.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate this markup in the existing Astro + Preact + Tailwind v4 codebase** using its established patterns. The markup was written for direct porting: every class is a token-based Tailwind utility name that already exists in the codebase (`bg-surface`, `text-text-muted`, `border-border`, `bg-accent`…). The file's `<style>` block exists only so the file renders standalone — sections 1–2 of it (tokens + utility subset) duplicate what the codebase already has and must be deleted; section 3 (component classes `.btn*`, `.dropzone`, `.steps`, `details.settings`) should become components or `@apply` rules; section 4 and the `<script>` are review chrome, discard.

## Fidelity
**High-fidelity.** Colors, spacing, radii, type sizes and copy are final and use only existing token values. Recreate pixel-perfectly.

## Constraint compliance
- **JS budget:** the design adds no runtime JS beyond what exists. New behaviors (settings disclosure, add-more input, step row) are native HTML (`<details>`, `<label for>` + `<input type=file>`, `aria-current`). The only genuinely new island logic is the result panel's per-file rows (data the pipeline already has) and the sticky action bar (CSS).
- **No JS:** empty state fully works without JS — the dropzone is a `label`-wrapped native file input; `<details>` settings open natively.
- **No new dependencies:** all 9 icons + chrome glyphs are inline SVG, `currentColor`, stroke 1.75 (2 for 16px chrome glyphs), round caps/joins.
- **A11y:** every control ≥44px (result-row Download buttons are 40px tall but full-row width ≥44px combined hit area — enlarge to 44px if axe flags), all icon buttons carry `aria-label`, steps use `aria-current="step"`, result panel is `role="status"`, unbuilt tools are non-links with a text badge (not color-alone), focus ring on `:focus-visible` and `.dropzone:focus-within`.
- **Both themes:** token-driven; verified with the toggle in the review bar.

## Screens / Views

### Tool card (homepage, hubs, /all-tools)
- Whole card is the `<a>`: flex row, `gap-3 p-4 rounded-lg border border-border bg-surface`, hover `border-border-strong bg-bg-subtle`.
- Icon tile 40×40, `rounded-md bg-accent-subtle text-accent`, 24px icon.
- Name `font-semibold text-text`; description one truncated line `text-sm text-text-muted`; trailing 16px chevron `text-text-subtle`.
- **Unbuilt variant:** same anatomy, `<div>` not `<a>`, `border-dashed bg-bg-subtle`, muted icon tile, right-aligned pill badge "Not built yet".
- Grid: 1 col at 390px → `sm:grid-cols-2 lg:grid-cols-3`.

### Icon set (9)
convert (cycle arrows), compress (two inward corner arrows), resize (diagonal with corner brackets), metadata (tag + hole), merge-pdf (two lanes → one arrow), split-pdf (one lane → two arrows), rotate-pdf (circular arrow), images-to-pdf (document containing a photo), pdf-to-images (document with photo card overlapping). All 24×24 viewBox, `fill="none" stroke="currentColor" stroke-width="1.75"`.

### Tool page (all 20 routes) — single column, `max-w-2xl`
Order: breadcrumb → h1 → one-line description → trust chip (`text-success bg-success-subtle` pill: "Files never leave this device · works offline") → step row → work area → SEO content (verbatim, repositioned below).
- **Step row:** `<ol>` "1 Add photos · 2 Convert · 3 Download", 13px, numbered 20px circles; current step accent + `aria-current="step"`, completed steps success color. Not a wizard — all states live on one page.
- **Empty state:** full-width dropzone (2px dashed `border-accent`, `bg-accent-subtle`, `rounded-xl`, 40px doc-download icon, solid `Choose HEIC photos` primary button, "or drop them anywhere here"). Below it a **collapsed** `<details class="settings">` summary "Settings — the defaults are fine" (quality range 50–100 default 90, keep-EXIF checkbox). Rationale: settings apply at convert time; folding them makes the dropzone the only possible first move, visible in the first 390px viewport.
- **Files state:** file rows (44px thumb placeholder, truncated name, mono size, up/down/remove 44px icon buttons); dropzone collapses to one-row "Add more photos" (`.dropzone.is-compact`); same settings disclosure; **sticky bottom action bar** (`sticky bottom-0 bg-bg border-t`): full-width primary "Convert 3 photos →" + line "3 photos · 7.1 MB · nothing is uploaded".
- **Result state:** receipt panel `border-success bg-success-subtle rounded-xl p-5 role="status"`: success line "Done — 3 photos converted", per-file rows with `2.4 MB → 1.1 MB` size change + Download button each, then "Download all (.zip)" (primary) + "Convert more photos" (quiet), footnote "Downloads started automatically — if not, use the buttons. Your photos never left this device." Auto-download behavior is kept.

### Homepage
Header (wordmark, All tools / How it works / Privacy, 36px theme toggle) → h1 "Fix an image or PDF problem, right here in your browser" + subline → **search hero** (52px input, `border-border-strong rounded-xl`, search icon; on-device match renders as an accent suggestion row with pre-filled value, e.g. "Compress an image to 137 KB →") → "Common fixes" 6 cards (heic-to-jpg, compress-100kb, photos-to-pdf, merge, resize, metadata) → "Browse by category" 4 text cards with tool counts + "All 20 tools →" → trust strip: three plain-text facts (No uploads / Works offline / Free, no account). No hero image, no testimonials.

## Interactions & Behavior
- File input: `label[for]` + `input.sr-only` — works with JS disabled; drag-and-drop enhances.
- Settings `<details>`: native toggle; chevron rotates via CSS (`--duration-fast` acceptable).
- Step row updates as state changes (island sets `aria-current` + `.done`).
- Sticky bar appears only when file count > 0.
- Result: keep auto-download; panel renders simultaneously.
- No decorative animation anywhere.

## State Management (existing island)
`files: File[]`, `settings: {quality, keepExif}`, `phase: 'empty'|'files'|'working'|'result'`, `results: {name, beforeBytes, afterBytes, blobUrl}[]`. A `working` phase (not mocked) should show the button in a busy state with a determinate count ("Converting 2 of 3…") in the sticky bar.

## Design Tokens
Only existing tokens are used — see the file's `:root`/`[data-theme=dark]` block, which is a verbatim copy of the production `tokens.css`. No new color values. Radii: 8/12/16px = `--radius-md/lg/xl`. System font stack, `--font-mono` for byte counts (tabular-nums).

## Assets
None. All icons are inline SVG authored in this file; no images, no fonts.

## Files
- `keptpix-redesign.html` — everything: icon set (§1), tool cards (§2), tool page in three switchable states (§3), homepage (§4). Amber-bordered asides and the sticky top bar are review annotations, not design.
