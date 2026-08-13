# Compressing an image to exactly 20 KB, in the browser, without uploading it

*Draft for Show HN / dev.to (docs/12 D-127, Cowork D1 launch material). Voice:
technical audience — the D-126 plain-language rule applies to the site's pages,
not to this. Facts checked against the codebase at draft time; re-verify the
numbers against `master` before publishing.*

---

Millions of people in India have the same bad afternoon every year: a
government exam portal rejects their photo upload with "file must be 10–20 KB",
and nothing on their phone can produce a file of an exact size. The tools that
rank for this problem upload your identity documents to someone's server, show
you three ad units, and give you a quality slider — which is the wrong control,
because the user doesn't have a quality requirement. They have a *byte*
requirement.

I built [KeptPix](https://keptpix.com) to do this entirely in the browser:
exact-target-size compression where 20 KB means *at most* 20 KB, and the file
never leaves the device. Here's the engineering that turned out to be
interesting.

## Exact size is a search problem

JPEG encoders take a quality parameter, not a byte budget, and the mapping
between them depends entirely on the image. So you search:

1. **Probe the easy case first.** Encode once at max quality. If it already
   fits, you're done in one pass instead of burning the budget proving a
   foregone conclusion.
2. **Probe the floor before searching.** At a fixed scale, if even minimum
   quality overshoots the target, no quality at that scale can fit — skip the
   binary search entirely and downscale instead. Before this ordering existed,
   a 12 MP photo targeting 100 KB spent six of its eight passes proving that
   full resolution was hopeless.
3. **Jump, don't walk, when downscaling.** Encoded size tracks pixel count,
   which is proportional to scale², so `scale × sqrt(target / achieved)`
   estimates the scale that lands on target in one hop rather than shrinking
   by a fixed step and re-measuring.
4. **Binary-search quality upward** from the known-good floor, and accept
   anything in the 92–100% band of the target. Chasing the exact byte wastes
   passes; being slightly under is what upload forms want anyway.

Hard bound of eight encode passes; in practice most images land in about
three. The result the user downloads is the file that was measured — never an
estimate.

Two details the search taught us: some portals have *floors* as well as
ceilings (NSDL rejects a PAN photo under 20 KB), so "compress as hard as
possible" is genuinely wrong advice. And the SSC's own notice says the number
one reason signatures get rejected is that they're *too small* — people crush
the image to fit the limit. Exact-size search means you never have to
overshoot downward.

## The memory bug that a fresh canvas per pass gives you

Our first encoder allocated a new `OffscreenCanvas` per encode pass. A 12 MP
surface is ~48 MB of raster backing; eight passes make eight of them; Chromium
collects abandoned backings lazily. Measured process peak: **528 MB** for one
conversion, against a 400 MB budget.

The fix is one cached canvas per alpha mode (the `alpha` flag is fixed at
`getContext()` time, so JPEG and PNG passes can't share), redrawn across
passes — the quality binary-search runs at a fixed scale, so most passes reuse
the same backing byte-for-byte. Measured after: **430 MB peak, ~100 MB less**,
reproducible across runs.

Measuring this at all was its own story: `performance.memory` doesn't exist
inside a Worker, and CDP's heap APIs aren't available on worker targets — so
we measure the browser's whole process tree from outside and treat it as an
upper bound. A conservative bound that passes is a stronger claim than an
exact number.

## "Nothing is uploaded" as a test, not a promise

Every tool in this category says files are private. The claim is usually a
retention policy — "deleted within two hours" — which is a thing you trust,
not a thing you verify.

We made it a release gate instead. A Playwright suite converts real files
while recording *every* network request, and fails the build if a conversion
run makes **any** request at all — not "no request with a body", not "no
cross-origin request": zero requests of any kind while a job is in flight.
The absolutism paid for itself twice:

- Cloudflare started injecting its Web Analytics beacon into our HTML at the
  edge — only for requests carrying browser `Sec-Fetch-*` headers, so `curl`
  and our uptime monitor saw clean HTML while every real visitor got the
  script tag. Our CSP (`script-src 'self'`) blocked it from executing, and
  Lighthouse's console-error audit is what finally surfaced it.
- Upgrading to a bundler that emits a shared runtime chunk made that chunk
  lazy-load *during* a conversion — same-origin static JS, harmless in
  substance, but the test doesn't do carve-outs, so it failed the build until
  every lazy module was pre-fetched at file-drop time. An allowlist would have
  hidden a real leak someday; a hard zero can't.

There's also the test users can run themselves: open the network tab and
convert something, or turn off Wi-Fi entirely — the site is a PWA and keeps
working, because there is no server for it to need.

## Assorted things that bit us

- **Transfer, don't clone**: `ArrayBuffer`s move to the worker with
  `postMessage` transfer lists. A target-size search that re-renders the same
  source discovers on pass two that its buffer is detached — one
  `.slice(0)` per pass is the price of the zero-copy fast path everywhere else.
- **JPEG needs a canvas decoder fallback ladder**: HEIC decodes via libheif
  WASM, AVIF via libavif *only when* the browser can't do it natively —
  canvas-first keeps most conversions at zero WASM downloaded. The AVIF
  encoder binary is 3.48 MB against our 1.2 MB per-codec budget, so AVIF is
  input-only, and the site says so instead of shipping it anyway.
- **The bundle budget is a moral constraint**: the whole reason islands run
  Preact via `preact/compat` is that React's runtime alone is ~59 KB gz
  against a 60 KB budget for *everything*. When a framework upgrade needed a
  package literally named `react` for Node-side resolution, we aliased it to
  `@preact/compat` — a 2 KB shim — rather than let the real thing in.

## Why in-browser at all

Because for this use case the architecture *is* the feature. The documents
are Aadhaar cards, PAN applications, medical records. A file that never
leaves the device doesn't need a deletion policy, a privacy policy, or trust.
And economically: our costs don't scale with usage, which is why there are no
file caps, no daily quotas, no account, and no ads — the free tiers of
upload-based tools aren't stingy, they're just paying their server bills.

Everything is open source (AGPL): https://github.com/Saisharan2000/keptpix

---

*Pre-publish checklist: re-run `npm run measure:memory` and `npm run
measure:cwv` and refresh any numbers; confirm pass counts against
`core/target-size.ts` defaults; Sai creates the dev.to/Hashnode account and
publishes under his name; the HN title should be plain — "Show HN: Exact-size
image compression that runs entirely in the browser".*
