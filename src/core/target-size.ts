/**
 * src/core/target-size.ts — ⭐ THE WEDGE FEATURE
 *
 * Contract: docs/06-contracts.md §3.1, invariants I-1 through I-8.
 *
 * Pure. The encoder is INJECTED as an EncodeFn, so the whole search is provable
 * in plain Node against synthetic encoder curves — no browser, no canvas, no
 * WASM (ADR-006). This is the feature the product lives or dies on, so it is
 * built and property-tested before any UI exists.
 */

/** Returns the resulting byte length for a given quality and scale. */
export type EncodeFn = (quality: number, scale: number) => Promise<number>;

export interface TargetSearchOptions {
  targetBytes: number;
  /** Accept results within this fraction below target. Default 0.08 -> 92-100%. */
  tolerance?: number;
  /** Below this, output is visibly bad. Default 20. */
  minQuality?: number;
  /** Default 95. */
  maxQuality?: number;
  /** Hard bound on encode passes, including downscale retries. Default 8. */
  maxPasses?: number;
  /** Default true. */
  allowDownscale?: boolean;
  /** Default 0.25. */
  minScale?: number;
  /** Default 0.85. */
  scaleStep?: number;
  signal?: AbortSignal;
}

export interface TargetSearchResult {
  quality: number;
  scale: number;
  achievedBytes: number;
  passes: number;
  targetMet: boolean;
}

/** docs/06 §3.1 documents a default for every option; this is that set. */
export const DEFAULT_TARGET_SEARCH_OPTIONS = Object.freeze({
  tolerance: 0.08,
  minQuality: 20,
  maxQuality: 95,
  maxPasses: 8,
  allowDownscale: true,
  minScale: 0.25,
  scaleStep: 0.85,
});

interface Attempt {
  quality: number;
  scale: number;
  bytes: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface ResolvedOptions {
  targetBytes: number;
  tolerance: number;
  minQuality: number;
  maxQuality: number;
  maxPasses: number;
  allowDownscale: boolean;
  minScale: number;
  scaleStep: number;
  signal: AbortSignal | undefined;
}

/**
 * Defaults plus defensive clamping. The clamps are not cosmetic: scaleStep >= 1
 * would make the downscale loop never shrink, and minScale <= 0 or maxPasses < 1
 * would break the I-2 pass bound. A caller passing nonsense gets a degraded
 * search, never a hang.
 */
function resolveOptions(opts: TargetSearchOptions): ResolvedOptions {
  const d = DEFAULT_TARGET_SEARCH_OPTIONS;
  const minQuality = clamp(Math.floor(opts.minQuality ?? d.minQuality), 1, 100);
  const maxQuality = clamp(Math.floor(opts.maxQuality ?? d.maxQuality), minQuality, 100);
  return {
    targetBytes: Math.max(0, opts.targetBytes),
    tolerance: clamp(opts.tolerance ?? d.tolerance, 0, 1),
    minQuality,
    maxQuality,
    maxPasses: Math.max(1, Math.floor(opts.maxPasses ?? d.maxPasses)),
    allowDownscale: opts.allowDownscale ?? d.allowDownscale,
    minScale: clamp(opts.minScale ?? d.minScale, 0.01, 1),
    scaleStep: clamp(opts.scaleStep ?? d.scaleStep, 0.05, 0.99),
    signal: opts.signal,
  };
}

/**
 * Search for the highest quality whose encoded size fits under targetBytes,
 * downscaling when quality alone cannot get there.
 *
 * Never throws for an unreachable target (I-5) — it returns targetMet: false
 * with the best usable result, which the pipeline surfaces as a soft
 * E_TARGET_UNREACHABLE alongside a real, downloadable file (docs/04 §6).
 *
 * It DOES reject if `signal` is aborted (I-6). Cancellation is not a failure
 * and has no code in the docs/04 §6 taxonomy; it is a distinct outcome, and
 * rejecting is the only way the caller can tell "cancelled" from "finished".
 */
export async function searchForTargetSize(
  encode: EncodeFn,
  opts: TargetSearchOptions,
): Promise<TargetSearchResult> {
  const {
    targetBytes,
    tolerance,
    minQuality,
    maxQuality,
    maxPasses,
    allowDownscale,
    minScale,
    scaleStep,
    signal,
  } = resolveOptions(opts);

  let passes = 0;

  /**
   * Best-so-far across EVERY scale, for the I-5 fallback. Held in one object so
   * the bookkeeping cannot drift out of sync with the pass counter.
   */
  const seen: { closestUnder: Attempt | null; smallest: Attempt | null } = {
    closestUnder: null,
    smallest: null,
  };

  /** One encode pass. Every pass in the algorithm goes through here, so the
   *  abort check (I-6) and the I-8 bookkeeping cannot be forgotten. */
  const run = async (quality: number, scale: number): Promise<number> => {
    signal?.throwIfAborted();
    const bytes = await encode(quality, scale);
    passes += 1;
    const attempt: Attempt = { quality, scale, bytes };
    if (bytes <= targetBytes) {
      if (seen.closestUnder === null || bytes > seen.closestUnder.bytes) {
        seen.closestUnder = attempt;
      }
    }
    if (seen.smallest === null || bytes < seen.smallest.bytes) {
      seen.smallest = attempt;
    }
    return bytes;
  };

  const settle = (a: Attempt, met: boolean): TargetSearchResult => ({
    quality: a.quality,
    scale: a.scale,
    achievedBytes: a.bytes,
    passes,
    targetMet: met,
  });

  // ── Step 0 — easy-case probe (I-7). An oversized target resolves in ONE
  //    pass instead of burning the whole budget on a foregone conclusion.
  const probe = await run(maxQuality, 1);
  if (probe <= targetBytes) {
    return settle({ quality: maxQuality, scale: 1, bytes: probe }, true);
  }

  // ── Step 1 — per scale: probe the quality floor, then search upward (I-4).
  let scale = 1;
  while (scale >= minScale && passes < maxPasses) {
    // Step 1a — FLOOR PROBE. The search assumes bytes rise with quality at a
    // fixed scale (I-3), so if even minQuality overshoots here, no quality at
    // this scale can fit and binary-searching it is pure waste. See the note in
    // docs/06 §3.1 on why this probe replaced searching-then-discovering: on a
    // 12 MP photo targeting 100 KB the old order spent 6 of 8 passes proving
    // scale 1 was hopeless, then ran out before the downscale could help.
    const floorBytes = await run(minQuality, scale);

    if (floorBytes > targetBytes) {
      if (!allowDownscale || passes >= maxPasses) break;

      // Encoded size tracks pixel count, which is proportional to scale², so
      // sqrt(target / achieved) estimates the scale that would land on target
      // in one jump rather than walking down 0.85 at a time. Bounded ABOVE by
      // the documented scaleStep (never shrink less than the doc promises) and
      // BELOW by minScale.
      const estimate = scale * Math.sqrt(targetBytes / floorBytes);
      const next = Math.min(scale * scaleStep, Math.max(estimate, minScale));
      if (next >= scale) break;
      scale = next;
      continue;
    }

    // The floor fits, so it is a guaranteed-valid result to fall back on.
    let best: Attempt = { quality: minQuality, scale, bytes: floorBytes };
    if (floorBytes >= targetBytes * (1 - tolerance)) return settle(best, true);

    // Step 1b — binary search UPWARD from the known-good floor, buying back as
    // much quality as the target allows. maxQuality was probed at scale 1 in
    // Step 0, so exclude it only there.
    const hiBound = scale === 1 ? maxQuality - 1 : maxQuality;
    let lo = minQuality + 1;
    let hi = hiBound;

    while (lo <= hi && passes < maxPasses) {
      const q = Math.floor((lo + hi) / 2);
      const bytes = await run(q, scale);

      if (bytes <= targetBytes) {
        best = { quality: q, scale, bytes };
        // Inside the tolerance band: good enough, stop spending passes.
        if (bytes >= targetBytes * (1 - tolerance)) return settle(best, true);
        lo = q + 1;
      } else {
        hi = q - 1;
      }
    }

    return settle(best, true);
  }

  // ── I-5 — unreachable. Return the closest under-target result if any pass
  //    ever produced one, else the smallest thing we managed. Step 0 always
  //    runs, so at least one attempt exists and this is never null.
  const fallback = seen.closestUnder ?? seen.smallest;
  /* c8 ignore next */
  if (fallback === null) throw new Error('unreachable: no encode attempt recorded');
  return settle(fallback, seen.closestUnder !== null);
}
