# Design brief: KeptPix

You are redesigning the interface of a working, deployed website. Everything
described here already exists and functions. **Nothing about the engineering
needs to change — this is purely about making it obvious to use.**

Read the constraints section carefully. It is not decoration; several of the
constraints will invalidate an otherwise good design, and I would rather you
design within them than produce something that cannot ship.

---

## 1. What the product is

**KeptPix** (keptpix.com) is a set of free browser-based image and PDF tools.

The single differentiating fact, which everything else follows from: **files are
never uploaded.** There is no server and no backend. Every conversion runs
inside the visitor's own browser tab using their own processor. You can
disconnect from the internet and the tools still work. This is architectural,
not a policy promise, and it is verifiable in about a minute.

That matters because the competition — iLovePDF, Smallpdf, TinyPNG, ILoveIMG —
all upload your files to their servers. For a holiday photo nobody cares. For a
signed contract, a scanned passport, a bank statement or a medical letter, it is
the whole decision.

**Audience:** ordinary people with a specific one-off problem. "This form only
accepts photos under 100 KB." "I need these eleven receipts as one PDF." "My
iPhone photos are HEIC and the website won't take them." They arrive from a
search engine, they are mildly stressed, they want to be finished. They will not
read an explanation and they will not create an account.

**Tone:** plain, honest, quietly confident. Never salesy, never cute. The product
tells people what it cannot do as readily as what it can.

---

## 2. Hard constraints — a design that breaks these cannot ship

| Constraint | Detail |
|---|---|
| **JavaScript budget** | 60 KB gzipped for all interactive code on a page. Currently at 44.5 KB, so roughly **15 KB of headroom**. This is enforced by a build gate. |
| **No new dependencies** | No icon library, no animation library, no component library, no fonts. Icons must be **inline SVG**. Fonts must be the system stack already in use. |
| **CSS framework** | Tailwind CSS v4, already installed, using the design tokens in section 6. Do not introduce new colour values — use the token names. |
| **Rendering** | Static HTML generated at build time (Astro). Interactive parts are small Preact islands. Most of each page is plain HTML and must work with JavaScript disabled. |
| **Accessibility is a release gate** | Every page is scanned by axe against WCAG 2.2 AA in **both light and dark themes**. Violations fail the build. Every control must be keyboard operable and have an accessible name. Touch targets ≥ 44 px. |
| **Both themes** | Light and dark are equally supported and follow the OS by default, with a manual toggle. Any design must work in both. |
| **No network at runtime** | No external fonts, no CDN assets, no tracking, no analytics that transmit. A strict Content Security Policy blocks all of it. Everything must be self-contained. |
| **Mobile first** | A large share of visitors are on phones with an iPhone photo problem. 390 px wide is the design target, not an afterthought. |

---

## 3. Every route that exists (29)

**Homepage** — `/`

**Image conversion** — `/convert` (hub) plus seven pairs:
`heic-to-jpg`, `png-to-jpg`, `webp-to-jpg`, `jpg-to-webp`, `png-to-webp`,
`webp-to-png`, `svg-to-png`

**Image compression to an exact size** — `/compress` (hub) plus six presets:
`jpg-to-20kb`, `jpg-to-50kb`, `jpg-to-100kb`, `jpg-to-200kb`, `jpg-to-500kb`,
`jpg-to-1mb`

**Image utilities** — `/resize`, `/metadata` (view and strip EXIF/GPS)

**PDF tools** — five:
`/pdf/from-images` (photos into one PDF), `/pdf/merge`, `/pdf/split`,
`/pdf/rotate`, `/pdf/to-images` (pages to JPG/PNG)

**Content** — `/all-tools`, `/how-it-works`, `/privacy`, `/about`

Eleven further tools are declared but not built (PDF compress, PDF sign, four
video tools, QR codes). They must not appear as if available. `/all-tools`
currently names them honestly as "not built yet".

---

## 4. The three page types that need designing

### A. The homepage

Someone arrives with a task in their own words. Today they get a heading, a
search box, and then **lists of text links under section headings**. It requires
reading to find anything.

There is a working search box that maps natural language to tools entirely
on-device — type "convert my iphone photos to jpg" and it returns
"HEIC to JPG →"; type "compress a photo under 137kb" and it returns
"Compress an image to 137 KB →" with the value pre-filled. Keep this. It is
genuinely good and it is a differentiator. The question is how it sits alongside
a way to *browse*.

### B. A tool page (the important one)

The same layout serves all 20 tool routes. Currently:

- Page heading and a sentence
- A **settings panel on the left** (desktop) — visible before any file exists
- A dropzone to the right of it
- Below: a list of added files with reorder and remove controls
- Below that: the action button, e.g. "Convert 3 files"
- Then several hundred words of genuinely useful explanation, a comparison
  table, use cases, and an FAQ — this content matters for search traffic and
  must remain on the page

**The problem:** on arrival the eye has no obvious target. Settings compete with
the dropzone, and the primary action is at the bottom. Compare iLovePDF, where a
single enormous button is the only thing you can see and settings appear only
after you have chosen files.

**The flow is genuinely:** add files → adjust settings (often none needed, the
defaults are good) → press the button → get a file back.

### C. The hub and index pages

`/convert`, `/compress`, `/all-tools` list related tools. Currently text links in
a grid of bordered boxes. No icons, nothing to scan.

---

## 5. What I am asking for

Make the site **scannable rather than readable**, and make each tool page have
one unmistakable next action.

Specifically I would like proposals for:

1. **A tool card**, used on the homepage, hubs, and `/all-tools`. Needs an icon,
   a name, and a one-line description. Must work at 390 px and on desktop.
2. **An icon set** — one per tool concept: convert, compress, resize, metadata,
   merge PDF, split PDF, rotate PDF, images to PDF, PDF to images. Simple line
   icons, inline SVG, `currentColor`, one consistent stroke width. They must be
   distinguishable at 24 px and legible in both themes.
3. **The tool page layout**, resolving the settings-versus-dropzone conflict.
   My instinct is that settings should be de-emphasised or revealed after files
   are added, but I would rather see your reasoning than dictate it.
4. **The step progression** — how someone knows where they are between choosing
   files and getting a result, without it feeling like a wizard.
5. **The homepage**, balancing the search box against browsable cards.
6. **The result state** — what someone sees when their file is ready. Currently
   it downloads automatically and shows a line of text, which feels abrupt.

---

## 6. Design tokens that already exist

Use these names. Do not introduce new colour values.

**Colour:** `--color-bg`, `--color-bg-subtle`, `--color-bg-muted`,
`--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`,
`--color-text-subtle`, `--color-border`, `--color-border-strong`,
`--color-accent`, `--color-accent-hover`, `--color-accent-active`,
`--color-accent-subtle`, `--color-accent-text`, `--color-success`,
`--color-success-subtle`, `--color-warning`, `--color-warning-subtle`,
`--color-danger`, `--color-danger-subtle`, `--color-info`, `--color-info-subtle`,
`--color-focus-ring`

The accent is indigo `#4f46e5`. Dark background is `#0b0e13`, dark text
`#eef1f6`. Light is white on `#12161c`.

**Type:** `--text-xs` through `--text-4xl`, `--font-sans` (system stack),
`--font-mono`
**Other:** `--radius-sm` through `--radius-xl`, `--space-1` through `--space-7`,
`--duration-fast`/`base`/`slow`, `--focus-ring-width`, `--focus-ring-offset`

In Tailwind these are available as utilities: `bg-bg`, `bg-surface`, `text-text`,
`text-text-muted`, `border-border`, `bg-accent`, and so on.

---

## 7. What I need back, and in what form

**Working HTML with Tailwind classes**, using the token-based utility names
above. Not images, not a Figma file, not a description — markup I can port
directly into components.

A single self-contained HTML file demonstrating the proposed components and
layouts is ideal. Include:

- The tool card, shown in a grid
- The icon set as inline SVG
- A tool page layout in its three states: empty, files added, result ready
- The homepage arrangement
- Both light and dark, so I can see they both work

Annotate anything non-obvious with a sentence on *why*.

---

## 8. Please do not

- **Clone iLovePDF.** I referenced it because it is easy to use, not because I
  want to look like it. It is also visually loud in a way that would undercut a
  product whose pitch is trustworthiness.
- Add gradients, glassmorphism, heavy shadows, or decorative animation. This is a
  utility people use once under mild stress.
- Propose anything requiring a JavaScript library, a webfont, or a network
  request.
- Remove the explanatory content from tool pages. It is several hundred words per
  page and it is what search engines rank. It can be repositioned, never cut.
- Design a marketing homepage with a hero image and testimonials. There are no
  testimonials and it is not that kind of product.
- Use colour alone to convey meaning, or drop focus indicators.

---

## 9. The thing worth optimising for

Someone lands on `/convert/heic-to-jpg` from a search, on a phone, mildly
annoyed that their photos will not upload somewhere. They should understand what
to do **within one second and without reading a sentence**, and they should be
finished within thirty.

Everything else, including how it looks, is secondary to that.
