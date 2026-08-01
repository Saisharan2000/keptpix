/**
 * ⭐ The wedge feature's proof. docs/06-contracts.md §3.1, invariants I-1..I-8.
 *
 * Plain Node, no jsdom, no browser API. If this suite ever needs one, a layer
 * boundary has been violated and the CODE is wrong, not the test.
 */
import { describe, it, expect } from 'vitest';
import {
  searchForTargetSize,
  DEFAULT_TARGET_SEARCH_OPTIONS,
  type EncodeFn,
} from '../../src/core/target-size';
import {
  monotonicEncoder,
  noisyMonotonicEncoder,
  stepEncoder,
  pathologicalEncoder,
  recording,
  mulberry32,
} from './encoders';

const D = DEFAULT_TARGET_SEARCH_OPTIONS;

const CURVES: Array<[string, EncodeFn]> = [
  ['perfectly monotonic', monotonicEncoder()],
  ['noisy monotonic', noisyMonotonicEncoder()],
  ['step function', stepEncoder()],
  ['pathological non-monotonic', pathologicalEncoder()],
];

describe('searchForTargetSize — invariants across every curve shape', () => {
  for (const [name, encode] of CURVES) {
    describe(name, () => {
      // 4 MP-ish curve peaks at 4 MB; these targets span easy to impossible.
      for (const targetBytes of [20_000, 100_000, 500_000, 2_000_000, 3_900_000]) {
        it('holds I-1, I-2 and I-8 at target ' + targetBytes, async () => {
          const rec = recording(encode);
          const result = await searchForTargetSize(rec, { targetBytes });

          // I-2 — pass budget is never exceeded, downscale retries included.
          expect(result.passes).toBeLessThanOrEqual(D.maxPasses);
          expect(rec.calls.length).toBe(result.passes);

          // I-1 — a met target NEVER overshoots.
          if (result.targetMet) expect(result.achievedBytes).toBeLessThanOrEqual(targetBytes);

          // I-8 — the returned pair really produced achievedBytes.
          const reencoded = await encode(result.quality, result.scale);
          expect(reencoded).toBe(result.achievedBytes);

          // Returned knobs stay inside their configured ranges.
          expect(result.quality).toBeGreaterThanOrEqual(D.minQuality);
          expect(result.quality).toBeLessThanOrEqual(D.maxQuality);
          expect(result.scale).toBeGreaterThan(0);
          expect(result.scale).toBeLessThanOrEqual(1);
        });
      }
    });
  }
});

describe('I-7 — the easy case must not burn the pass budget', () => {
  it('resolves an oversized target in ONE pass, not eight', async () => {
    const rec = recording(monotonicEncoder({ maxBytes: 4_000_000 }));
    const result = await searchForTargetSize(rec, { targetBytes: 10_000_000 });

    expect(result.passes).toBe(1);
    expect(result.passes).toBeLessThanOrEqual(2);
    expect(result.targetMet).toBe(true);
    expect(result.quality).toBe(D.maxQuality);
    expect(result.scale).toBe(1);
    expect(rec.calls).toEqual([[D.maxQuality, 1]]);
  });

  it('probes at maxQuality first, before any binary search', async () => {
    const rec = recording(monotonicEncoder());
    await searchForTargetSize(rec, { targetBytes: 100_000 });
    expect(rec.calls[0]).toEqual([D.maxQuality, 1]);
  });
});

describe('I-4 — downscale fallback when quality alone cannot reach', () => {
  it('shrinks scale by at least scaleStep each time, never below minScale', async () => {
    // Peak 40 MB against a 20 KB target: even quality 20 at scale 1 is far over.
    const rec = recording(monotonicEncoder({ maxBytes: 40_000_000 }));
    const result = await searchForTargetSize(rec, { targetBytes: 20_000 });

    expect(result.scale).toBeLessThan(1);
    const scales = [...new Set(rec.calls.map(([, s]) => s))];
    expect(scales.length).toBeGreaterThan(1);
    for (let i = 1; i < scales.length; i += 1) {
      const prev = scales[i - 1] as number;
      const next = scales[i] as number;
      // scaleStep is the documented MAXIMUM step; the proportional jump may
      // shrink further in one go, but never less than the doc promises.
      expect(next).toBeLessThanOrEqual(prev * D.scaleStep + 1e-12);
      expect(next).toBeGreaterThanOrEqual(D.minScale);
    }
    expect(result.passes).toBeLessThanOrEqual(D.maxPasses);
  });

  it('probes the quality floor before binary-searching a scale', async () => {
    // Nothing at scale 1 can fit, so the very next pass after the Step 0 probe
    // must be minQuality — not a midpoint. This is what stops the search
    // burning its whole budget proving a hopeless scale is hopeless.
    const rec = recording(monotonicEncoder({ maxBytes: 40_000_000 }));
    await searchForTargetSize(rec, { targetBytes: 20_000 });
    expect(rec.calls[0]).toEqual([D.maxQuality, 1]);
    expect(rec.calls[1]).toEqual([D.minQuality, 1]);
  });

  it('never scales below minScale', async () => {
    const rec = recording(monotonicEncoder({ maxBytes: 900_000_000 }));
    const result = await searchForTargetSize(rec, { targetBytes: 1_000, maxPasses: 40 });
    for (const [, s] of rec.calls) expect(s).toBeGreaterThanOrEqual(D.minScale);
    expect(result.scale).toBeGreaterThanOrEqual(D.minScale);
  });

  it('does not downscale when allowDownscale is false', async () => {
    const rec = recording(monotonicEncoder({ maxBytes: 40_000_000 }));
    const result = await searchForTargetSize(rec, {
      targetBytes: 20_000,
      allowDownscale: false,
    });
    for (const [, s] of rec.calls) expect(s).toBe(1);
    expect(result.scale).toBe(1);
    expect(result.targetMet).toBe(false);
  });
});

describe('I-5 — unreachable targets are a soft failure, never a throw', () => {
  it('returns the smallest achieved result rather than throwing', async () => {
    const encode = monotonicEncoder({ maxBytes: 900_000_000 });
    const result = await searchForTargetSize(encode, { targetBytes: 1 });

    expect(result.targetMet).toBe(false);
    expect(result.achievedBytes).toBeGreaterThan(1);
    // Still a usable, verifiable result — this is what the UI offers the user.
    expect(await encode(result.quality, result.scale)).toBe(result.achievedBytes);
  });

  it('reports targetMet false but keeps passes within budget', async () => {
    const rec = recording(monotonicEncoder({ maxBytes: 900_000_000 }));
    const result = await searchForTargetSize(rec, { targetBytes: 1 });
    expect(result.passes).toBeLessThanOrEqual(D.maxPasses);
  });
});

describe('I-6 — abort is checked before every encode pass', () => {
  it('rejects when the signal is already aborted, without encoding', async () => {
    const rec = recording(monotonicEncoder());
    const controller = new AbortController();
    controller.abort();

    await expect(
      searchForTargetSize(rec, { targetBytes: 100_000, signal: controller.signal }),
    ).rejects.toThrow();
    expect(rec.calls.length).toBe(0);
  });

  it('stops within one pass of being aborted mid-search', async () => {
    const controller = new AbortController();
    let calls = 0;
    const encode: EncodeFn = async (q, s) => {
      calls += 1;
      if (calls === 2) controller.abort();
      return Math.round(4_000_000 * s * s * Math.pow(q / 100, 2));
    };

    await expect(
      searchForTargetSize(encode, { targetBytes: 100_000, signal: controller.signal }),
    ).rejects.toThrow();
    // The abort landed during pass 2, so pass 3 must never have run.
    expect(calls).toBe(2);
  });
});

describe('I-3 — non-monotonic encoders still terminate', () => {
  it('terminates on a hostile curve, bounded by pass count not convergence', async () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const rec = recording(pathologicalEncoder({ maxBytes: 1_000_000 + seed * 97_000 }));
      const result = await searchForTargetSize(rec, { targetBytes: 100_000 + seed * 1_000 });
      expect(result.passes).toBeLessThanOrEqual(D.maxPasses);
      expect(Number.isFinite(result.achievedBytes)).toBe(true);
    }
  });
});

describe('tolerance band', () => {
  it('stops early once inside the 92-100% band', async () => {
    const rec = recording(monotonicEncoder({ maxBytes: 4_000_000, gamma: 2 }));
    const target = 500_000;
    const result = await searchForTargetSize(rec, { targetBytes: target });
    if (result.targetMet && result.passes < D.maxPasses) {
      expect(result.achievedBytes).toBeGreaterThanOrEqual(target * (1 - D.tolerance));
      expect(result.achievedBytes).toBeLessThanOrEqual(target);
    }
  });
});

describe('option handling', () => {
  it('applies documented defaults when options are omitted', async () => {
    const rec = recording(monotonicEncoder());
    await searchForTargetSize(rec, { targetBytes: 1 });
    expect(rec.calls[0]).toEqual([D.maxQuality, 1]);
    expect(rec.calls.length).toBeLessThanOrEqual(D.maxPasses);
  });

  it('honours a custom maxPasses, including maxPasses = 1', async () => {
    for (const maxPasses of [1, 2, 3, 5, 12]) {
      const rec = recording(monotonicEncoder({ maxBytes: 40_000_000 }));
      const result = await searchForTargetSize(rec, { targetBytes: 20_000, maxPasses });
      expect(result.passes).toBeLessThanOrEqual(maxPasses);
    }
  });

  it('clamps hostile options instead of hanging', async () => {
    const rec = recording(monotonicEncoder({ maxBytes: 40_000_000 }));
    const result = await searchForTargetSize(rec, {
      targetBytes: 20_000,
      // scaleStep >= 1 would make the downscale loop never shrink.
      scaleStep: 5,
      minScale: -3,
      maxPasses: 0,
      minQuality: 900,
      maxQuality: -4,
    });
    expect(result.passes).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.achievedBytes)).toBe(true);
  });
});

describe('Milestone 7 acceptance, modelled — real photo sizes x aggressive targets', () => {
  /**
   * docs/10 Milestone 7 requires 20 real photos spanning 1-20 MP against
   * 20/50/100 KB targets, with 100% of outputs at or under target and p95
   * passes <= 8. That suite needs a browser; this one models the same matrix
   * against realistic curves so a regression is caught here first, in Node.
   *
   * These targets are the Form Filer persona from docs/09 §2.2 — government
   * portals and exam registration caps — and they are the cases the docs/06
   * §3.1 reference algorithm could NOT reach before the floor probe was added.
   */
  const megapixels = [1, 2, 4, 8, 12, 16, 20];
  const targets = [20_000, 50_000, 100_000];

  /** A JPEG at quality 95 runs roughly 0.5 MB per megapixel. */
  const photo = (mp: number) => monotonicEncoder({ maxBytes: (mp * 500_000) / 0.95 ** 2, gamma: 2 });

  it('never overshoots, stays in budget, and returns a verifiable pair', async () => {
    const failures: string[] = [];
    const passCounts: number[] = [];

    for (const mp of megapixels) {
      for (const targetBytes of targets) {
        const encode = photo(mp);
        const r = await searchForTargetSize(encode, { targetBytes });
        passCounts.push(r.passes);
        const label = mp + ' MP -> ' + targetBytes;

        // I-1 — the headline assertion: an output is never over target.
        if (r.targetMet && r.achievedBytes > targetBytes) {
          failures.push(label + ': overshoot ' + r.achievedBytes);
        }
        // I-2
        if (r.passes > D.maxPasses) failures.push(label + ': ' + r.passes + ' passes');
        // I-5 — a miss is still a usable result, never a throw or an empty.
        if (!r.targetMet && !(r.achievedBytes > 0)) {
          failures.push(label + ': unmet with no best-effort result');
        }
        // I-8
        if ((await encode(r.quality, r.scale)) !== r.achievedBytes) {
          failures.push(label + ': unverifiable pair');
        }
      }
    }

    expect(failures).toEqual([]);

    const sorted = [...passCounts].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] as number;
    expect(p95).toBeLessThanOrEqual(D.maxPasses);
  });

  it('only misses where the target is unreachable above minScale', async () => {
    const missed: string[] = [];

    for (const mp of megapixels) {
      for (const targetBytes of targets) {
        const r = await searchForTargetSize(photo(mp), { targetBytes });
        if (!r.targetMet) missed.push(mp + 'MP/' + targetBytes);
      }
    }

    // 16 and 20 MP down to 20 KB need scale 0.2375 and 0.2124, both under the
    // 0.25 minScale default. That is a constraint binding, not a search
    // failure: docs/04 §6 makes it a soft E_TARGET_UNREACHABLE, and docs/08 §5
    // offers "Allow resizing to reach target" as the one-tap fix.
    expect(missed).toEqual(['16MP/20000', '20MP/20000']);
  });

  it('reaches 100% once minScale is relaxed, as the UI fix does', async () => {
    for (const mp of megapixels) {
      for (const targetBytes of targets) {
        const encode = photo(mp);
        const r = await searchForTargetSize(encode, { targetBytes, minScale: 0.15 });
        expect(r.targetMet, mp + ' MP -> ' + targetBytes).toBe(true);
        expect(r.achievedBytes).toBeLessThanOrEqual(targetBytes);
        expect(r.passes).toBeLessThanOrEqual(D.maxPasses);
      }
    }
  });
});

describe('property test — 500 randomised curves x targets', () => {
  it('shows zero I-1 and zero I-2 violations', async () => {
    const rand = mulberry32(0xc0ffee);
    const violations: string[] = [];
    let met = 0;

    for (let i = 0; i < 500; i += 1) {
      const shape = Math.floor(rand() * 4);
      const maxBytes = Math.round(200_000 + rand() * 40_000_000);
      const gamma = 0.5 + rand() * 3.5;
      const opts = { maxBytes, gamma };
      const encode: EncodeFn =
        shape === 0
          ? monotonicEncoder(opts)
          : shape === 1
            ? noisyMonotonicEncoder({ ...opts, amplitude: rand() * 0.3 })
            : shape === 2
              ? stepEncoder({ ...opts, band: 5 + Math.floor(rand() * 20) })
              : pathologicalEncoder(opts);

      // Targets from far-below-achievable to far-above.
      const targetBytes = Math.max(1, Math.round(maxBytes * (rand() * 1.4 - 0.15)));
      const maxPasses = 4 + Math.floor(rand() * 9);

      const rec = recording(encode);
      const r = await searchForTargetSize(rec, { targetBytes, maxPasses });

      if (r.targetMet) {
        met += 1;
        if (r.achievedBytes > targetBytes) {
          violations.push('I-1 case ' + i + ': ' + r.achievedBytes + ' > ' + targetBytes);
        }
      }
      if (r.passes > maxPasses) {
        violations.push('I-2 case ' + i + ': ' + r.passes + ' > ' + maxPasses);
      }
      if (rec.calls.length !== r.passes) {
        violations.push('pass count mismatch case ' + i);
      }
      // I-8 on every case, not just the interesting ones.
      const again = await encode(r.quality, r.scale);
      if (again !== r.achievedBytes) violations.push('I-8 case ' + i);
    }

    expect(violations).toEqual([]);
    // Sanity: the suite would be meaningless if nothing ever succeeded.
    expect(met).toBeGreaterThan(100);
  });
});
