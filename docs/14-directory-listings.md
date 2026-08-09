# 14 — Directory and aggregator listings

Paste-ready submissions. These are founder-only: every one of them needs an
account, and several ban submissions from anyone but the maker.

Why these first, ahead of any content work: the site currently has **zero pages
indexed**. Directories are the one lever that does not depend on Google — they
send referral traffic directly, and they hand out the followed inbound links that
get a new domain crawled in the first place. Content written before anything links
to the site is content nobody will find.

---

## The one claim that is actually ours

Every competitor says "secure" and "private". Two things separate KeptPix from
that, and both are checkable by a stranger in under a minute. Lead with them:

1. **The site cannot phone home, and you can verify it.** The Content-Security-
   Policy is `connect-src 'self' blob:` — no external origin is reachable, so
   there is no destination a file could be sent to. Open devtools, watch the
   network tab, convert something. `tests/e2e/privacy.spec.ts` asserts zero
   bodied requests against the real build and blocks release when it fails.
2. **No analytics at all.** Not "privacy-respecting analytics" — none. Cloudflare
   tried to inject its own RUM beacon at the edge; the CSP refused it (D-66).

Everything else — free, no account, no upload limit, works offline — is table
stakes that some competitor also claims.

---

## Facts sheet

Keep every submission consistent with this. All verified against production on
9 Aug 2026, not recalled.

| | |
|---|---|
| URL | `https://keptpix.com` |
| Licence | AGPL-3.0-only |
| Tool routes | **20** — 7 converters, 6 exact-size compressors, 5 PDF tools, metadata viewer, resize |
| Total pages | 27 |
| Platforms | Any modern browser — Chrome, Firefox, Safari, Edge, mobile |
| Offline | Yes, after first visit (service worker precaches 37 URLs) |
| Account | None. No email, no sign-in |
| Price | Free |
| Server | None. Static files only; no backend exists |
| Tracking | None. CSP-enforced |

Converters: HEIC→JPG, JPG→WebP, PNG→JPG, PNG→WebP, SVG→PNG, WebP→JPG, WebP→PNG.
Compressors: JPG to 20/50/100/200/500 KB and 1 MB.
PDF: merge, split, rotate, images→PDF, PDF→images.

**Do not claim:** video tools, QR generation, or PDF compression. They exist in
the manifest but are not built, and `/all-tools` says so openly. Claiming them
is the fastest way to get delisted.

---

## 1. awesome-privacy — highest value, needs the public repo

**Blocked until the repo is public.** The list's whole premise is reviewable code;
submitting with a dead GitHub link wastes the one shot.

Worth the wait: there is a real gap. The list has **no Squoosh, no ImageOptim, no
PDF tools at all**, and its image section is almost entirely desktop and Android
apps. A browser-based option that needs no install is genuinely missing.

Route: open an **issue** first (they have a template for it), not a PR. PRs go out
in monthly batches; an issue gets a maintainer's read sooner and they will ask for
the PR if they want it.

Title: `Add KeptPix`

```markdown
### KeptPix

* [KeptPix](https://github.com/<user>/keptpix) - Convert, compress and resize images and edit PDFs entirely in the browser; a replacement for iLovePDF, Smallpdf and TinyPNG.
* **License**: AGPL-3.0
* **Why do you think this helps users privacy?**: Files are never uploaded — every conversion runs in a Web Worker on the user's own device, and there is no backend to receive anything. This is enforced rather than promised: the site's CSP sets `connect-src 'self' blob:`, so no external origin is reachable and there is no destination a file could be sent to. A Playwright suite asserts zero bodied requests against the real build and blocks release on failure. There is no analytics of any kind — Cloudflare injected its own RUM beacon at the edge and the CSP refused it. Anyone can confirm all of this from devtools in under a minute, or read the code.
* **Under what section should this service be listed?**: Photo Editing and Management. The EXIF/GPS metadata viewer would also fit Cloaking → Images if you would rather split it.
* **Additional comments / info**: 20 tools, no account, no file-size limit, works offline after first visit. Not self-hostable in the usual sense because there is nothing to host — it is static files, so a fork can deploy the built output anywhere.
```

For the PR line, if they ask:

```markdown
* [KeptPix](https://github.com/<user>/keptpix) - Convert, compress and resize images and edit PDFs fully in-browser, no uploads. Alternative to iLovePDF and TinyPNG. `AGPL-3.0` `Web`
```

**Also worth submitting once public**, same substance, different tone:
Privacy Guides (forum thread first — they reject cold PRs), and the
`awesome-selfhosted`-adjacent lists are **not** a fit: they require software you
run on your own server, and KeptPix has no server to run.

---

## 2. AlternativeTo — most referral traffic, no open-source requirement

Submittable today. People arrive here having already decided to leave a
competitor, which is the highest-intent traffic any directory sends.

- **Name:** KeptPix
- **URL:** `https://keptpix.com`
- **Licence:** Open Source / Free
- **Platforms:** Web, Chrome, Firefox, Safari, Edge, Android, iPhone (self-hosted: no)
- **Alternative to:** iLovePDF, Smallpdf, ILoveIMG, TinyPNG, PDF24, CloudConvert, Squoosh
- **Tags:** `image-converter` `image-compression` `pdf-editor` `privacy` `no-upload` `heic-converter` `exif` `offline` `webapp`

Description:

> KeptPix converts, compresses and resizes images and edits PDFs without
> uploading anything. Everything runs in your browser on your own device — there
> is no server to send files to, which you can confirm in devtools by watching
> the network tab stay empty while a conversion runs.
>
> 20 tools: HEIC to JPG, PNG/WebP/SVG conversion, compression to an exact target
> size (the "under 100 KB" that job applications and government forms demand),
> resizing, and an EXIF viewer that shows the GPS coordinates and camera serial
> number your photos are carrying. For PDFs: merge, split, rotate, build one from
> photos, and export pages back to images.
>
> No account, no email, no file-size limit, no watermark, no queue. Works offline
> after the first visit. Free, and open source under AGPL-3.0.

---

## 3. Product Hunt — one shot, spend it after the repo is public

Do not launch until the repo is public and the listing can link to it. "Open
source" is doing real work in this pitch and a private repo undercuts it.

Launch Tuesday–Thursday, 00:01 PT.

**Tagline** (60 char max): `Image and PDF tools that never upload your files`

**Description:**

> Every free image converter asks you to upload your photos to a stranger's
> server. Then you read the privacy policy and find out how long they keep them.
>
> KeptPix does the same work without the upload. Conversion, compression to an
> exact file size, resizing, and PDF merge/split/rotate all run in your browser
> on your own device. There is no backend — the site is static files, and its
> Content-Security-Policy blocks every external connection, so there is nowhere
> a file could go. Watch the network tab while you convert something.
>
> No account, no size limit, no watermark. Works offline. Free and open source.

**Maker's first comment:**

> I built this because I needed to send a passport photo under 100 KB and every
> tool I found wanted me to upload it first.
>
> The part I care about is that you do not have to believe me. "We delete your
> files after an hour" is unfalsifiable — you cannot check it. So the site is
> built so that sending a file is impossible rather than merely unintended: no
> server exists, and the CSP allows no external origin at all. Open devtools,
> convert a photo, watch nothing leave.
>
> Hardest part was compressing to an exact target size. Quality 80 tells you
> nothing about the resulting bytes, so it searches quality and dimensions
> together until the file genuinely fits under your number.
>
> It is AGPL-3.0 — happy to answer anything about how it works.

---

## 4. SaaSHub — low effort, decent domain authority

- **Categories:** Image Conversion, PDF Tools, Privacy
- **Pricing:** Free
- **Alternatives to:** iLovePDF, Smallpdf, TinyPNG, CloudConvert

> Browser-based image and PDF tools that never upload your files. Convert HEIC,
> PNG, WebP and SVG, compress to an exact target size, strip EXIF and GPS data,
> and merge, split or rotate PDFs — all on your own device. No account, no size
> limit, works offline. Open source, AGPL-3.0.

---

## What to skip

**Bulk "submit to 200 directories" services and link lists.** They are link farms.
Google has discounted them for a decade, and the ones that still pass any signal
pass a negative one. The four above are worth more than two hundred of those.

**Anything that wants payment for a listing** on a site this new. Pay for
distribution once you know a channel converts, not before.

---

---

## What the SERPs actually say — and why the plan changed

Measured 9 Aug 2026, by searching the money queries and reading what ranks.
Three findings, in increasing order of how much they change the plan.

### 1. There are no threads to answer. Growth #2 has almost no targets.

The plan was "answer on existing threads that already rank." For
`compress jpg to 100kb`, the entire first page is **competitor tool pages** —
imageonline, cloudinary, smalljpg, zamzar, 11zon, pi7, hicompress. Not one
forum, Reddit, Quora or Stack Exchange thread. Same for
`is it safe to upload passport photo to online compressor`: tool pages and SEO
blog posts, no discussions.

Compounding it: **Reddit blocks our crawler outright**, so those threads cannot
even be found from here, let alone assessed. Growth #2 is not impossible, but it
is founder-only manual work with no evidence yet that the threads exist.

### 2. "Nothing is uploaded" is a crowded position, not a wedge.

This is the uncomfortable one, and it contradicts what the drafts above lean on.
Competitors already make the same claim, in the same words:

- `hicompress.com` — "100% private; all the compression happens in the browser"
- `imageonline.co` — "does not upload any JPEG images to a server"
- `pixelbatch.io/compress-image-for-visa` — literally titled "(No Uploads)"
- `epassport-photo.com/compress-image` — "Free, No Upload"

So the sentence does not distinguish us. What might: **whether it can be
checked**. Ours is CSP-enforced, asserted by a release-blocking test, and about
to be open source. Theirs is a sentence on a page.

### 3. The measurable difference is adtech, not uploads.

I put one synthetic 60 KB JPEG through `hicompress` and `imageonline` with a
request listener attached — the same technique as `privacy.spec.ts`, pointed
outward. Findings, stated at the strength they deserve:

- **No image-sized upload was observed.** Every bodied request went to
  `pagead2.googlesyndication.com/pagead/ping` at 4–12 KB, far too small to be
  the file and addressed to an ad network, not their API. **Not conclusive**: I
  added the file but did not confirm their conversion ran, so if their flow
  needs a button press, no upload would have fired either way.
- **What IS conclusive: both pages POST repeatedly to Google's ad network.**
  hicompress fired five, imageonline one, within seconds of a file being added.

That is the honest differentiator, and it is stronger than the upload claim:
*they process locally and still let an ad network watch you do it.* We cannot
serve an ad or a tracker at all — `connect-src 'self'` forbids the request and
the release gate fails if one appears.

### The revised order, and why

Evidence points at **growth #4, not #2**. The competitors winning these queries
are doing it with **use-case-named routes**, not size-named ones:
`/compress-image-for-visa`, `/passport-photo-compressor`,
`/passport-photo-size-reducer`. We have the *content* — `jpg-to-50kb`'s intro is
already about passport and visa limits — but no URL or H1 that matches how people
actually search. `src/content/presets.ts` makes a new route pure content, no
engine work.

This does not need the 12 Aug Search Console data. That data would tell us what
*we* already rank for; the SERP tells us what the market rewards, and it is
unambiguous. Waiting three days for weaker evidence would be the wrong call.

**Revised: 1 → 4 → 3 → 2.** Directories first (unchanged, in flight), then
use-case routes, then communities, and threads last since we have no proof the
threads exist.

## Order of operations

1. **AlternativeTo** — today, no dependency on anything.
2. **SaaSHub** — today, ten minutes.
3. Founder decides what stays private, then **flips the repo public**.
4. **awesome-privacy** issue — immediately after step 3.
5. **Product Hunt** — after step 3, on a Tuesday.
