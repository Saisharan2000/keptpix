# 13 — Audit Work Order (post-deviations-log review)

Input: independent review of `docs/12` (the deviations log), 2026-08-01.
Executed 2026-08-01. Every item cites the D-entry it addresses.

**STATUS: WO-1 … WO-12 complete.** Outcomes and evidence are recorded in
`docs/12-deviations.md` as D-57 through D-60, plus amendments to D-45, D-52 and
D-55. What follows is the work order as received, annotated with the result of
each item so the two can be read against each other.

| Item | Outcome |
|---|---|
| WO-1 | ✅ Device-scaled ceiling + truthful copy — **D-57** |
| WO-2 | ✅ Capability layer honest without OffscreenCanvas — **D-55 amended** |
| WO-3 | ✅ `@smoke` suite, project-coverage reporter, CI workflow, D-49 regression |
| WO-4 | ✅ No dead control; DOM assertion added |
| WO-5 | ✅ Truncation **does not reproduce** — **D-52 amended** |
| WO-6 | ✅ Counter live in harness; measures the wrong heap — **D-45 amended** |
| WO-7 | ✅ `scripts/scrub-fixture.mjs` written; accept blocked on founder photos |
| WO-8 | ✅ JXL Wave 4 shelved — **D-58**, `09 §6` amended |
| WO-9 | ✅ Constraint recorded in `06 §5.1` |
| WO-10 | ✅ MetadataPanel wired; baseline 32.7 → 33.5 KB gz |
| WO-11 | ✅ `08 §4.2` amended to two-pane + modal — **D-59** |
| WO-12 | ⚠️ Specified guard **measured ineffective**; replaced + kept — **D-60** |

**Three items did not go as specified, and each is documented with its
evidence** — WO-5 (the bug being root-caused does not exist), WO-6 (the
measurement works but reads the wrong heap), and WO-12 (the prescribed
instrument cannot detect its own target bug). Under CLAUDE.md Rule 0 those are
deviations backed by measurement, not preference.

---

## P0 — before deploy

### WO-1 ✅ DECIDED — Reconcile the 80 MP hard ceiling with the "No file size limit" claim (D-43)

The universal 80 MP backstop was lifted from a figure that was empirically
*mobile Safari's* crash line and applied to all devices. A capable desktop now
hard-rejects a 100 MP panorama while the homepage and the `WebApplication`
JSON-LD say "No file size limit."

- Implement a device-scaled backstop in `core/guards.ts`: keep 80 MP where
  `deviceMemoryGb < 8` or `isMobile`; scale upward with memory above that
  (e.g. `min(80 * (deviceMemoryGb / 4), 300)` MP — tune against the existing
  72/90 MP regression tests and add cases at 16 GB).
- Behind it, keep the soft-budget PRESCALE tier exactly as is.
- Update the two regression tests in `tests/integration/pipeline.test.ts` to
  the tiered behaviour.
- **DECIDED — fix the copy too.** Replace every absolute size claim ("No file
  size limit") across homepage, route copy, dropzone, and JSON-LD
  `featureList` with claims true by construction:
  *"No upload caps, no quotas, no watermarks. Your device's memory is the only
  limit."* Keep "no file count limit" — that one is genuinely true.
  Rationale: this product must never publish an absolute claim its own code
  cannot keep (the D-56 principle). Reversal condition: none — truthful copy
  is not revisited.

**Accept:** 90 MP rejects on a 4 GB profile, converts (or prescales) on a
16 GB profile; grep for "file size limit" returns zero hits in `src/`;
docs `04 §6` and `06 §3.4` amended in the same commit.

> **DONE — D-57.** `resolveHardPixelCeiling(device)` is the single definition;
> the pipeline imports it instead of hardcoding the figure (hardcoding at the
> call site is how the desktop case went unnoticed). The same 90 MP PNG is
> refused at 4 GB and converts at 16 GB, asserted end to end. Copy replaced
> everywhere; grep is clean. `04 §6` and `06 §3.4` amended.
>
> **Side effect worth noting:** `tests/e2e/batch.spec.ts` broke, correctly —
> its 90 MP "oversized" fixture stopped failing on an 8 GB machine. Rather
> than grow the fixture to ~170 MP (~700 MB of canvas per run), the test pins
> a 4 GB profile via the store's own `setEnvironment` before converting, which
> keeps the "2 flagged with specific errors" acceptance intact and
> deterministic on any hardware.

### WO-2 Make the capability layer truthful when OffscreenCanvas is absent (D-10 + D-55)

`withEncodeBaseline([])` still substitutes the JPEG/PNG/WebP baseline on
engines that cannot encode at all; only the ToolShell pre-flight notice saves
the user. Any future caller of `CodecSupport` that doesn't also check
`hasOffscreenCanvas` reproduces the original failure.

- `withEncodeBaseline` (or its caller) must receive the OffscreenCanvas
  availability signal and return an honestly-empty encode set when the engine
  genuinely cannot encode — D-10's "empty probe = probe failure" heuristic
  applies only when `OffscreenCanvas` exists.
- Keep the ToolShell notice; it now reads from truthful data.
- Add a regression test: a support matrix built with `hasOffscreenCanvas:
  false` yields `encode` all-false and `resolveEncoder` throwing
  `E_ENCODE_FAILED` for every format — while the same probe result WITH
  OffscreenCanvas present still falls back to the baseline (the D-10 case).

**Accept:** both tests green; no UI-layer special-casing required for the
data to be correct.

> **DONE.** The signal is a **required** parameter, so the compiler found every
> call site rather than leaving the next one to chance. Both tests green.
>
> **It also exposed a second hole:** `'best-quality'` still resolved mozjpeg,
> which builds its `ImageData` through an `OffscreenCanvas` — so it would have
> failed identically, just later and after downloading a codec. `resolveEncoder`
> now consults `support.encode[format]` before returning any WASM encoder.

### WO-3 Standing smoke e2e, all engines, every run (D-26, D-49, D-55)

- Add `tests/e2e/smoke.spec.ts` tagged `@smoke`: load one tool route, drop one
  small JPEG fixture, convert, download, magic-byte-verify the output.
- It must run in ALL FOUR Playwright projects, and the suite must **fail loudly
  if any configured project cannot launch its browser**. Assert the number of
  executed projects equals the number configured.
- Wire `npx playwright install --with-deps` into the CI setup steps.
- Add an automated regression test for D-49.

**Accept:** smoke green on chromium/firefox/webkit/mobile-safari; deliberately
uninstalling one browser makes the run fail, not skip.

> **DONE**, and the guard is verified to fire rather than assumed to. A phantom
> project executing zero tests produced **"6 passed" with exit code 1** and a
> named `MISSING: phantom-engine`. There was no CI at all, so
> `.github/workflows/ci.yml` was created running the full gate.
>
> **Caveat found while verifying:** `--reporter=<x>` on the command line
> REPLACES the config's reporter list, silently disabling this guard. Use
> `npm run test:e2e`. Documented at the top of the reporter.

### WO-4 Confirm `keepFilesForSession` is not user-visible (D-51)

**Accept:** grep + a DOM assertion on the settings surface; no dead controls.

> **DONE.** It exists only as a type field and a default — no component
> references it. A DOM assertion now keeps it that way until the OPFS
> write-through lands.

---

## P1 — before announcing / first traffic push

### WO-5 Root-cause the precache truncation, timeboxed (D-52)

**Accept:** D-52 amended with the actual cause or a documented
non-reproduction on HTTP/2.

> **DONE — and the bug does not exist.** All three shapes cached 27/27,
> including `Promise.allSettled` inside a **real service-worker install**
> against the shipping build. The likely original cause is an observation-timing
> artifact — the same mistake D-55 later found in `pwa.spec.ts`, where the cache
> was read at `state === 'activated'` and showed 8 of 27 with all 27 landing
> ~500 ms later. "19 of 27" is the same shape of number obtained the same way.
>
> HTTP/2 remains **untested rather than cleared** (`wrangler` is not a
> dependency). Sequential loop kept, per the work order. What changed is what
> the log CLAIMS to know.

### WO-6 Measure the memory budget for real in the harness (D-45)

**Accept:** the canary probe passes under the flag and the 400 MB assertion
runs for real; skip-with-reason preserved in uninstrumented projects.

> **DONE, with a caveat that matters more than the item.** A new `perf` vitest
> project launches chromium with `--enable-precise-memory-info`; the canary now
> measures ~99.9 MB for a 100 MB allocation (0.00 MB without the flag), so the
> assertion runs instead of skipping.
>
> **But it reads the MAIN THREAD's heap**, and a 12 MP conversion moves it by
> ~0.0 MB — a true reading of the wrong heap, because all the work is in the
> worker. The budget is now *instrumentable* but still *unmeasured*. Sampling
> inside `image.worker.ts` is production code changed for a test's benefit;
> raised as outstanding rather than done quietly.
>
> **Gotcha:** `launchOptions` belongs on the provider — `playwright({ launchOptions })` —
> not on the browser instance, where it is silently ignored.

### WO-7 Scrubbed HEIC fixture into CI (D-29, D-36) — needs founder input

**Accept:** fresh clone runs the HEIC decode + orientation suites without
skips; `exifr.parse` on the committed fixture shows no GPS block.

> **SCRIPT DONE, ACCEPT BLOCKED** on the founder's photos.
> `scripts/scrub-fixture.mjs` removes GPS, serials, owner names and timestamps
> while **preserving** EXIF `Orientation` and the container `irot`/`imir`
> transforms — a blanket `-all=` would produce a fixture that protects nothing,
> since those are exactly what caught D-30 and D-34. It verifies its own output
> and fails if GPS survived.

### WO-8 ✅ DECIDED — JXL Wave 4 is shelved (D-46)

**Accept:** build output contains zero JXL-destination routes; sitemap clean;
doc 09 amended in the same commit.

> **DONE — D-58.** Nothing to unship: `content/formats.ts` defines no
> jxl-destination route, the build emits none, the sitemap has zero. `09 §6`
> carries the SHELVED marker and the reversal condition.

### WO-9 Future-proof the privacy constraint for the conversion counter (doc 12 §4)

**Accept:** both docs carry the constraint; no code change.

> **DONE.** `06 §5.1` now states the three rules (body-less GET, same-origin
> path, blocked in flight) with the measured 933-byte POST as the reason, and
> notes the 7 s observation window — since the beacon fired at ~5 s while the
> privacy test finished at ~3 s.

---

## P2 — quality follow-through

### WO-10 Wire MetadataPanel (S-06, D-24, D-33)

> **DONE.** Opened per file from an `Info` button on the card, in the QUEUED
> state — the point of D-33 was that metadata is read at ingest, so this shows
> GPS presence *before* processing, which is the demonstration `02 §5` asks
> for. The GPS row leads and is styled as a warning when present. Baseline
> island 32.7 → **33.5 KB gz** (56% of budget); the D-38 lesson was re-checked
> rather than assumed.

### WO-11 ✅ DECIDED — The modal stays; amend the spec (D-24 vs D-54)

> **DONE — D-59.** `08 §4.2` amended to two-pane + modal, with the reversal
> condition recorded. The wireframe's `[Compare full ⤢]` survives as the
> per-card `Compare` button.

### WO-12 Visual regression guard (D-27 class)

Add a minimal visual check: Playwright `toHaveScreenshot` on the idle tool
route and the results state, chromium only, loose threshold — enough to catch
encoding garbage and layout explosions, not pixel-perfection.

> **DONE DIFFERENTLY — D-60, and this one is a real disagreement with the work
> order, settled by measurement.** The D-27 defect was re-injected, rebuilt,
> and the screenshot suite run: **2 passed.** A few corrupted characters are far
> below a 2% `maxDiffPixelRatio`, and tightening it enough to catch them makes
> every run flaky on font antialiasing — which trains people to re-baseline
> without reading, worse than no check.
>
> A rendered-text scan for escape artefacts catches it exactly, with the
> offending string quoted, and needs no baseline. **Both ship**: screenshots for
> layout collapse, which they genuinely detect; the text scan for the D-27 class
> across four routes, extended to cover unrendered entities, mojibake, and
> `undefined` / `[object Object]` / `NaN` leaking into copy.

---

## Explicitly out of scope for this work order

- **Main-thread encode fallback for pre-16.4 Safari (D-55) — ✅ DECIDED: not
  built, permanently-until-data.** Recorded in D-55 with its reversal
  condition and removed from the outstanding-work 🔴 tier.
- OPFS pipeline write-through + session restore (D-51) — tracked, deferred.
- Deployment — requires the founder's Cloudflare account.
- Any change that weakens `privacy.spec.ts` assertions (a), (b), or (c).
  Assertion (c) is same-origin-only again as of D-56 and stays that way.

---

## Remaining with the founder (physical-world items, cannot be delegated)

1. **Real-device Safari test** — one hour on a real iPhone + Mac Safari:
   drop a real HEIC, hit a 100 KB target, download, verify orientation.
   Launch gate.
2. **HEIC source photos for WO-7** — 2–3 photos shot somewhere neutral with
   Settings → Photos → Transfer to Mac or PC → *Keep Originals*.
3. **Cloudflare Pages deploy** (`noupload.app`) + post-deploy production run
   of `privacy.spec.ts`; read pageview numbers in the Cloudflare dashboard
   (D-56's edge-analytics decision — nothing to configure client-side).
4. Re-enable **Smart App Control** once e2e runs in CI (WO-3).
