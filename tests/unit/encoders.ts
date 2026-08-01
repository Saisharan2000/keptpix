/**
 * Synthetic encoder curves for the target-size search (docs/10 Milestone 2).
 *
 * Every curve is DETERMINISTIC: the same (quality, scale) always returns the
 * same byte count. That is not just convenience — invariant I-8 says the caller
 * must be able to re-encode with the returned pair and get the same result, and
 * a nondeterministic fixture could not prove it.
 */
import type { EncodeFn } from '../../src/core/target-size';

/** Deterministic value in [0,1) from two numbers. */
export function hash01(a: number, b: number): number {
  let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0x100000000;
}

const key = (q: number, s: number) => [q | 0, Math.round(s * 10000)] as const;

export interface CurveOptions {
  /** Bytes at quality 100, scale 1. */
  maxBytes?: number;
  /** Steepness of the quality->bytes curve. */
  gamma?: number;
}

/** Strictly increasing in quality, quadratic in scale. The ideal case. */
export function monotonicEncoder(o: CurveOptions = {}): EncodeFn {
  const { maxBytes = 4_000_000, gamma = 2 } = o;
  return async (q, s) => Math.round(maxBytes * s * s * Math.pow(q / 100, gamma));
}

/** Monotonic underneath, with deterministic jitter on top — a real encoder. */
export function noisyMonotonicEncoder(o: CurveOptions & { amplitude?: number } = {}): EncodeFn {
  const { maxBytes = 4_000_000, gamma = 2, amplitude = 0.08 } = o;
  return async (q, s) => {
    const [qi, si] = key(q, s);
    const base = maxBytes * s * s * Math.pow(q / 100, gamma);
    return Math.round(base * (1 + amplitude * (hash01(qi, si) - 0.5)));
  };
}

/** Quantised: whole bands of quality produce an identical size. */
export function stepEncoder(o: CurveOptions & { band?: number } = {}): EncodeFn {
  const { maxBytes = 4_000_000, gamma = 2, band = 10 } = o;
  return async (q, s) => {
    const stepped = Math.floor(q / band) * band + band / 2;
    return Math.round(maxBytes * s * s * Math.pow(stepped / 100, gamma));
  };
}

/** No monotonicity at all. The search must still TERMINATE (invariant I-3). */
export function pathologicalEncoder(o: CurveOptions = {}): EncodeFn {
  const { maxBytes = 4_000_000 } = o;
  return async (q, s) => {
    const [qi, si] = key(q, s);
    return Math.round(maxBytes * s * s * (0.15 + 0.85 * hash01(qi, si)));
  };
}

/** Wraps an encoder to record every call, for pass-count and abort assertions. */
export function recording(fn: EncodeFn): EncodeFn & { calls: Array<[number, number]> } {
  const calls: Array<[number, number]> = [];
  const wrapped = async (q: number, s: number) => {
    calls.push([q, s]);
    return fn(q, s);
  };
  return Object.assign(wrapped, { calls });
}

/** Reproducible PRNG so a property-test failure can be replayed exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
