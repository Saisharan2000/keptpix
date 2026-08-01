/**
 * docs/04-architecture.md §4 (worker + concurrency model) and docs/05 §1
 * (DeviceProfile, CodecSupport).
 *
 * These run in plain Node precisely BECAUSE src/core/capabilities.ts holds only
 * the policy. The browser reading that feeds it lives in workers/pool.ts, so
 * the decision table is testable without a browser (ADR-006).
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_INPUT_FORMATS,
  ALL_OUTPUT_FORMATS,
  BASELINE_NATIVE_ENCODE,
  DEFAULT_DEVICE_MEMORY_GB,
  withEncodeBaseline,
  resolveCodecSupport,
  resolveDeviceProfile,
  resolveMaxDecodedPixels,
  resolveMaxWorkers,
} from '../../src/core/capabilities';
import { MOBILE_MAX_PIXELS } from '../../src/core/guards';
import { resolveEncoder } from '../../src/engines/registry';

describe('resolveMaxWorkers — the docs/04 §4 table', () => {
  it('gives 3 workers to a desktop with >= 8 GB and >= 8 cores', () => {
    expect(resolveMaxWorkers(8, 8, false)).toBe(3);
    expect(resolveMaxWorkers(16, 16, false)).toBe(3);
  });

  it('gives 2 workers to a 4-8 GB desktop', () => {
    expect(resolveMaxWorkers(4, 4, false)).toBe(2);
    expect(resolveMaxWorkers(6, 8, false)).toBe(2);
    // 8 GB but only 4 cores does not qualify for 3.
    expect(resolveMaxWorkers(8, 4, false)).toBe(2);
  });

  it('gives exactly 1 worker to mobile or low memory — strictly sequential', () => {
    expect(resolveMaxWorkers(2, 8, false)).toBe(1);
    expect(resolveMaxWorkers(3.9, 16, false)).toBe(1);
    // Mobile is capped at 1 no matter how capable it claims to be.
    expect(resolveMaxWorkers(16, 16, true)).toBe(1);
  });

  it('never returns a value outside 1-3', () => {
    for (const gb of [0, 1, 2, 4, 8, 16, 64]) {
      for (const cores of [1, 2, 4, 8, 32]) {
        for (const mobile of [true, false]) {
          expect([1, 2, 3]).toContain(resolveMaxWorkers(gb, cores, mobile));
        }
      }
    }
  });
});

describe('resolveMaxDecodedPixels', () => {
  it('scales with reported memory', () => {
    expect(resolveMaxDecodedPixels(8, false)).toBeGreaterThan(resolveMaxDecodedPixels(4, false));
  });

  it('applies the 80 MP mobile ceiling even on a roomy device', () => {
    expect(resolveMaxDecodedPixels(16, true)).toBe(MOBILE_MAX_PIXELS);
    expect(resolveMaxDecodedPixels(16, false)).toBeGreaterThan(MOBILE_MAX_PIXELS);
  });

  it('leaves a low-memory mobile bound by memory, not by the ceiling', () => {
    expect(resolveMaxDecodedPixels(2, true)).toBeLessThan(MOBILE_MAX_PIXELS);
  });
});

describe('resolveDeviceProfile', () => {
  it('defaults deviceMemory to 4 GB when absent, per docs/05 §1', () => {
    // Firefox and Safari do not expose navigator.deviceMemory at all.
    const profile = resolveDeviceProfile({ hardwareConcurrency: 8 });
    expect(profile.deviceMemoryGb).toBe(DEFAULT_DEVICE_MEMORY_GB);
    expect(profile.maxWorkers).toBe(2);
  });

  it('produces a complete profile from an empty signal set', () => {
    const profile = resolveDeviceProfile();
    expect(profile.deviceMemoryGb).toBe(4);
    expect(profile.maxWorkers).toBe(2);
    expect(profile.maxDecodedPixels).toBeGreaterThan(0);
    expect(profile.isMobile).toBe(false);
    expect(profile.hasOffscreenCanvas).toBe(false);
    expect(profile.hasOpfs).toBe(false);
  });

  it('ignores nonsense values rather than propagating them', () => {
    const profile = resolveDeviceProfile({ deviceMemoryGb: 0, hardwareConcurrency: -4 });
    expect(profile.deviceMemoryGb).toBe(4);
    expect(profile.hardwareConcurrency).toBeGreaterThan(0);
  });

  it('carries capability flags through verbatim', () => {
    const profile = resolveDeviceProfile({
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      hasOffscreenCanvas: true,
      hasFileSystemAccess: true,
      hasWebGpu: true,
      hasOpfs: true,
    });
    expect(profile.hasOffscreenCanvas).toBe(true);
    expect(profile.hasFileSystemAccess).toBe(true);
    expect(profile.hasWebGpu).toBe(true);
    expect(profile.hasOpfs).toBe(true);
    expect(profile.maxWorkers).toBe(3);
  });

  it('treats a coarse pointer as mobile and drops to one worker', () => {
    const profile = resolveDeviceProfile({
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      isMobile: true,
    });
    expect(profile.maxWorkers).toBe(1);
    expect(profile.maxDecodedPixels).toBeLessThanOrEqual(MOBILE_MAX_PIXELS);
  });
});

describe('withEncodeBaseline — a failed probe must not disable the tool', () => {
  it('falls back to the universal baseline when the probe returns nothing', () => {
    // Regression guard. An OffscreenCanvas whose 2d context was never obtained
    // returns nothing from convertToBlob, which read as "no formats supported"
    // and made every conversion fail with E_ENCODE_FAILED.
    expect(withEncodeBaseline([], true)).toEqual([...BASELINE_NATIVE_ENCODE]);
    expect(withEncodeBaseline([], true)).toContain('jpeg');
    expect(withEncodeBaseline([], true)).toContain('png');
  });

  it('trusts a non-empty probe verbatim', () => {
    expect(withEncodeBaseline(['jpeg', 'png', 'webp', 'avif'], true)).toEqual([
      'jpeg',
      'png',
      'webp',
      'avif',
    ]);
    // A browser genuinely limited to PNG is reported as such, not widened.
    expect(withEncodeBaseline(['png'], true)).toEqual(['png']);
  });

  it('returns a fresh array, so the shared constant cannot be mutated', () => {
    const a = withEncodeBaseline([], true);
    a.push('avif');
    expect(BASELINE_NATIVE_ENCODE).not.toContain('avif');
  });

  it('keeps every format encodable after the fallback', () => {
    const support = resolveCodecSupport({
      nativeEncode: withEncodeBaseline([], true),
      nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
    });
    expect(support.nativeEncode.jpeg).toBe(true);
    expect(support.encode.jpeg).toBe(true);
  });
});

describe('WO-2 — no OffscreenCanvas means the encode set is honestly EMPTY (docs/12 D-55)', () => {
  it('does NOT substitute the baseline when there is no OffscreenCanvas at all', () => {
    // The D-10 heuristic ("an empty probe means the probe broke") is only valid
    // where an OffscreenCanvas exists to have broken. Here the empty probe is
    // the literal truth, and claiming JPEG/PNG/WebP work is how a user got one
    // "try a different output format" per file — advice that could never work.
    expect(withEncodeBaseline([], false)).toEqual([]);
    // Even a non-empty probe cannot be trusted without the canvas to run it.
    expect(withEncodeBaseline(['jpeg', 'png'], false)).toEqual([]);
  });

  it('yields an all-false encode matrix, so no UI-layer special-casing is needed', () => {
    const support = resolveCodecSupport({
      nativeEncode: withEncodeBaseline([], false),
      nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
    });
    for (const f of ALL_OUTPUT_FORMATS) {
      expect(support.encode[f], f).toBe(false);
      expect(support.nativeEncode[f], f).toBe(false);
    }
  });

  it('makes resolveEncoder throw E_ENCODE_FAILED for every format, at every preference', () => {
    const support = resolveCodecSupport({
      nativeEncode: withEncodeBaseline([], false),
      nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
    });
    for (const format of ALL_OUTPUT_FORMATS) {
      for (const preference of ['auto', 'native', 'best-quality'] as const) {
        expect(() => resolveEncoder(format, preference, support), format + '/' + preference)
          .toThrowError(expect.objectContaining({ code: 'E_ENCODE_FAILED' }));
      }
    }
  });

  it('the SAME empty probe still falls back to the baseline WITH OffscreenCanvas', () => {
    // The two worlds must stay distinguishable — this is the D-10 case, intact.
    const support = resolveCodecSupport({
      nativeEncode: withEncodeBaseline([], true),
      nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
    });
    expect(support.encode.jpeg).toBe(true);
    expect(() => resolveEncoder('jpeg', 'auto', support)).not.toThrow();
  });
});

describe('resolveCodecSupport', () => {
  it('reports every format as unsupported when nothing is available', () => {
    const support = resolveCodecSupport({ nativeEncode: [], nativeDecode: [] });
    for (const f of ALL_INPUT_FORMATS) expect(support.decode[f]).toBe(false);
    for (const f of ALL_OUTPUT_FORMATS) {
      expect(support.encode[f]).toBe(false);
      expect(support.nativeEncode[f]).toBe(false);
    }
  });

  it('reflects the canvas baseline every modern browser has', () => {
    const support = resolveCodecSupport({
      nativeEncode: ['jpeg', 'png', 'webp'],
      nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
    });
    expect(support.decode.jpeg).toBe(true);
    expect(support.decode.heic).toBe(false);
    expect(support.encode.jpeg).toBe(true);
    expect(support.nativeEncode.jpeg).toBe(true);
    expect(support.encode.avif).toBe(false);
  });

  it('keeps nativeEncode separate from encode, which ADR-004 depends on', () => {
    // AVIF encodable only via WASM: supported, but NOT native — so 'auto' must
    // not pick canvas for it.
    const support = resolveCodecSupport({
      nativeEncode: ['jpeg', 'png', 'webp'],
      nativeDecode: ['jpeg', 'png'],
      wasmEncode: ['avif'],
    });
    expect(support.encode.avif).toBe(true);
    expect(support.nativeEncode.avif).toBe(false);
  });

  it('unions canvas and WASM decode support', () => {
    const support = resolveCodecSupport({
      nativeEncode: [],
      nativeDecode: ['jpeg', 'png'],
      wasmDecode: ['heic', 'heif', 'jxl'],
    });
    expect(support.decode.jpeg).toBe(true);
    expect(support.decode.heic).toBe(true);
    expect(support.decode.jxl).toBe(true);
    expect(support.decode.tiff).toBe(false);
  });

  it(
    'keeps nativeDecode separate from decode, symmetric with nativeEncode ' +
      '(docs/12 D-46 — this is the field that was missing)',
    () => {
      // AVIF decodable only via WASM: supported, but NOT native — so the
      // decoder table's AVIF preference must not pick canvas for it.
      const support = resolveCodecSupport({
        nativeEncode: [],
        nativeDecode: ['jpeg', 'png'],
        wasmDecode: ['avif'],
      });
      expect(support.decode.avif).toBe(true);
      expect(support.nativeDecode.avif).toBe(false);
      // And a format canvas genuinely decodes natively reports true on both.
      expect(support.decode.jpeg).toBe(true);
      expect(support.nativeDecode.jpeg).toBe(true);
    },
  );

  it('returns a fully populated record, never a sparse one', () => {
    const support = resolveCodecSupport({ nativeEncode: ['png'], nativeDecode: ['png'] });
    expect(Object.keys(support.decode).sort()).toEqual([...ALL_INPUT_FORMATS].sort());
    expect(Object.keys(support.encode).sort()).toEqual([...ALL_OUTPUT_FORMATS].sort());
    expect(Object.keys(support.nativeEncode).sort()).toEqual([...ALL_OUTPUT_FORMATS].sort());
    expect(Object.keys(support.nativeDecode).sort()).toEqual([...ALL_INPUT_FORMATS].sort());
  });
});
