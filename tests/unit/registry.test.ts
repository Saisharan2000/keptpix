/**
 * docs/06-contracts.md §1 — the two resolution tables, and §5's contract
 * checklist:
 *
 *   resolveEncoder | 3 preferences x 5 formats x 2 support matrices
 *   resolveDecoder | all 11 input formats x 2 support matrices; unsupported
 *                    format throws E_UNSUPPORTED_FORMAT
 *
 * Runs in plain Node. Resolution is PURE AND SYNCHRONOUS by contract — no
 * await, no WASM fetch — which is exactly what makes "which codec" testable
 * without a browser.
 */
import { describe, it, expect } from 'vitest';
import {
  registeredDecoderIds,
  registeredEncoderIds,
  resolveDecoder,
  resolveDecoderId,
  resolveEncoder,
} from '../../src/engines/registry';
import { canvasDecoder } from '../../src/engines/canvas/decoder';
import { resolveCodecSupport, ALL_INPUT_FORMATS } from '../../src/core/capabilities';
import type { InputFormat, JobErrorCode, OutputFormat } from '../../src/core/types';

/** Matrix A — the canvas baseline: no WASM adapter's capability asserted. */
const CANVAS_ONLY = resolveCodecSupport({
  nativeEncode: ['jpeg', 'png', 'webp'],
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
});

/** Matrix B — a browser that also decodes AND encodes AVIF natively. */
const WITH_NATIVE_AVIF = resolveCodecSupport({
  nativeEncode: ['jpeg', 'png', 'webp', 'avif'],
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'],
});

/**
 * Matrix C — the exact shape that exposed docs/12 D-46: a browser with NO
 * native AVIF decode, but the libavif WASM adapter genuinely registered and
 * capable. `decode.avif` is true here (something can handle it); `nativeDecode
 * .avif` is false. Neither of the other two matrices exercises this: A never
 * asserts AVIF is decodable by anything, B asserts it is decodable NATIVELY.
 * Only this one asserts "decodable, but not by canvas" — which is precisely
 * the distinction `nativeDecode` exists to preserve.
 */
const WASM_AVIF_ONLY = resolveCodecSupport({
  nativeEncode: ['jpeg', 'png', 'webp'],
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  wasmDecode: ['avif'],
});

const MATRICES = [
  ['canvas only', CANVAS_ONLY],
  ['native AVIF', WITH_NATIVE_AVIF],
] as const;

function codeOf(thrown: unknown): JobErrorCode | undefined {
  return typeof thrown === 'object' && thrown !== null && 'code' in thrown
    ? (thrown as { code: JobErrorCode }).code
    : undefined;
}

describe('resolution is pure and synchronous', () => {
  it('returns without awaiting anything', () => {
    // If resolution were async this would be a Promise, and the pipeline's
    // "resolve then init()" ordering would be a lie.
    const encoder = resolveEncoder('jpeg', 'auto', CANVAS_ONLY);
    expect(encoder).not.toBeInstanceOf(Promise);
    expect(typeof encoder.encode).toBe('function');
    expect(typeof encoder.init).toBe('function');
  });

  it('registers every adapter that actually exists', () => {
    // SVG cannot be registered: it needs HTMLImageElement, which a worker does
    // not have (engines/svg.ts). JXL is deliberately absent, encode and
    // decode: its smallest encoder build is over the docs/04 §7 WASM budget,
    // and no route needs JXL decode (docs/12 D-46). AVIF is decode-only for
    // the same budget reason — its encoder alone is 3.48 MB.
    expect([...registeredDecoderIds()].sort()).toEqual(['canvas', 'libavif', 'libheif', 'utif']);
    expect([...registeredEncoderIds()].sort()).toEqual(['canvas', 'mozjpeg', 'oxipng']);
  });
});

describe('resolveDecoderId — the docs/06 §1 decoder table', () => {
  const EXPECTED: Record<InputFormat, string> = {
    jpeg: 'canvas',
    png: 'canvas',
    webp: 'canvas',
    gif: 'canvas',
    bmp: 'canvas',
    avif: 'libavif', // canvas only when support.nativeDecode.avif
    heic: 'libheif',
    heif: 'libheif',
    jxl: 'libjxl',
    tiff: 'utif',
    svg: 'svg',
  };

  for (const format of ALL_INPUT_FORMATS) {
    it('maps ' + format + ' to the documented decoder', () => {
      expect(resolveDecoderId(format, CANVAS_ONLY)).toBe(EXPECTED[format]);
    });
  }

  it('prefers canvas for AVIF when the browser decodes it NATIVELY', () => {
    expect(resolveDecoderId('avif', CANVAS_ONLY)).toBe('libavif');
    expect(resolveDecoderId('avif', WITH_NATIVE_AVIF)).toBe('canvas');
  });

  it(
    'REGRESSION (docs/12 D-46): a WASM-only AVIF decoder must still resolve to libavif, ' +
      'not canvas, even though decode.avif is true',
    () => {
      expect(WASM_AVIF_ONLY.decode.avif).toBe(true); // something can handle it
      expect(WASM_AVIF_ONLY.nativeDecode.avif).toBe(false); // but not canvas
      expect(resolveDecoderId('avif', WASM_AVIF_ONLY)).toBe('libavif');

      const decoder = resolveDecoder('avif', WASM_AVIF_ONLY);
      expect(decoder.id).toBe('libavif');
    },
  );
});

describe('resolveDecoder — all 11 formats x 2 support matrices', () => {
  /** Adapters that actually exist. libjxl and svg remain unregistered. */
  const REGISTERED = new Set(['canvas', 'libheif', 'libavif', 'utif']);

  for (const [label, support] of MATRICES) {
    describe(label, () => {
      for (const format of ALL_INPUT_FORMATS) {
        const expectedId = resolveDecoderId(format, support);
        const available = expectedId !== null && REGISTERED.has(expectedId);

        it(
          format +
            (available
              ? ' resolves to the ' + expectedId + ' decoder'
              : ' throws until its adapter lands'),
          () => {
            if (available) {
              const decoder = resolveDecoder(format, support);
              expect(decoder.id).toBe(expectedId);
            } else {
              // The table names an adapter that is not registered yet, which is
              // honestly "we cannot read this" to the user.
              let thrown: unknown;
              try {
                resolveDecoder(format, support);
              } catch (error) {
                thrown = error;
              }
              expect(codeOf(thrown)).toBe('E_UNSUPPORTED_FORMAT');
            }
          },
        );
      }
    });
  }

  it('routes HEIC and HEIF to libheif, which unblocks the star route', () => {
    // docs/09 §3's `supported` flag is a hard gate: /convert/heic-to-jpg may
    // only be prerendered because this now resolves.
    expect(resolveDecoder('heic', CANVAS_ONLY).id).toBe('libheif');
    expect(resolveDecoder('heif', CANVAS_ONLY).id).toBe('libheif');
  });

  it('routes AVIF and TIFF to their real, registered adapters', () => {
    // docs/09 §3's supported gate for avif-to-jpg/png (P1) and tiff-to-jpg/png
    // (P2) rests on these actually resolving, not just being named in a table.
    expect(resolveDecoder('avif', CANVAS_ONLY).id).toBe('libavif');
    expect(resolveDecoder('tiff', CANVAS_ONLY).id).toBe('utif');
  });

  it('widens the canvas adapter to match the support matrix', () => {
    // The adapter's own canHandle() must not contradict what resolution just
    // decided. configure() calls this with the probe result; here we assert the
    // widening works, then restore the universal baseline.
    expect(canvasDecoder.canHandle('avif')).toBe(false);
    canvasDecoder.setSupportedFormats(['jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);
    expect(canvasDecoder.canHandle('avif')).toBe(true);

    canvasDecoder.setSupportedFormats(['jpeg', 'png', 'webp', 'gif', 'bmp']);
    // The universal five can never be dropped, even by an empty probe.
    canvasDecoder.setSupportedFormats([]);
    expect(canvasDecoder.canHandle('jpeg')).toBe(true);
    expect(canvasDecoder.canHandle('avif')).toBe(false);
  });

  it('names the formats that DO work in the error message', () => {
    let thrown: unknown;
    try {
      // JXL still has no adapter, so it is the honest example of an
      // unsupported input today.
      resolveDecoder('jxl', CANVAS_ONLY);
    } catch (error) {
      thrown = error;
    }
    const message = (thrown as { message: string }).message;
    expect(message).toContain('JXL');
    expect(message).toContain('JPEG');
    // The supported list must name real, currently-working formats.
    expect(message).toContain('HEIC');
    expect(message).not.toMatch(/[{}]/);
  });
});

describe('resolveEncoder — 3 preferences x 5 formats x 2 matrices', () => {
  const FORMATS: OutputFormat[] = ['jpeg', 'png', 'webp', 'avif', 'jxl'];
  const PREFERENCES = ['auto', 'native', 'best-quality'] as const;

  /**
   * mozjpeg/oxipng are registered, so 'best-quality' now genuinely picks them
   * up for jpeg/png rather than falling back to canvas. avif/jxl have NO
   * registered encoder at all (docs/12 D-46), so every preference for them
   * still resolves to canvas-or-throw, same as before their adapters existed.
   */
  const BEST_QUALITY_ID: Partial<Record<OutputFormat, string>> = {
    jpeg: 'mozjpeg',
    png: 'oxipng',
  };

  for (const [label, support] of MATRICES) {
    for (const preference of PREFERENCES) {
      for (const format of FORMATS) {
        it(label + ' / ' + preference + ' / ' + format, () => {
          const canvasCan = support.nativeEncode[format];
          const bestQualityId = BEST_QUALITY_ID[format];

          if (preference === 'best-quality' && bestQualityId !== undefined) {
            expect(resolveEncoder(format, preference, support).id).toBe(bestQualityId);
            return;
          }

          if (canvasCan) {
            const encoder = resolveEncoder(format, preference, support);
            expect(encoder.id).toBe('canvas');
            expect(encoder.isNative).toBe(true);
            return;
          }

          // Canvas cannot do this format and no WASM adapter is registered.
          let thrown: unknown;
          try {
            resolveEncoder(format, preference, support);
          } catch (error) {
            thrown = error;
          }
          expect(codeOf(thrown)).toBe('E_ENCODE_FAILED');
        });
      }
    }
  }

  it("preference 'native' throws rather than silently downloading WASM", () => {
    let thrown: unknown;
    try {
      resolveEncoder('jxl', 'native', CANVAS_ONLY);
    } catch (error) {
      thrown = error;
    }
    expect(codeOf(thrown)).toBe('E_ENCODE_FAILED');
    expect((thrown as { detail?: string }).detail).toContain('native');
  });

  it("preference 'native' skips mozjpeg/oxipng too — canvas only means canvas only", () => {
    // 'native' is the one preference where being registered must NOT matter.
    expect(resolveEncoder('jpeg', 'native', CANVAS_ONLY).id).toBe('canvas');
    expect(resolveEncoder('png', 'native', CANVAS_ONLY).id).toBe('canvas');
  });

  it("preference 'auto' uses canvas whenever it can, per ADR-004", () => {
    for (const format of ['jpeg', 'png', 'webp'] as OutputFormat[]) {
      expect(resolveEncoder(format, 'auto', CANVAS_ONLY).isNative).toBe(true);
    }
    // AVIF becomes a canvas job only on a browser that natively encodes it.
    expect(resolveEncoder('avif', 'auto', WITH_NATIVE_AVIF).isNative).toBe(true);
  });

  it(
    'REGRESSION (docs/12 D-46): AVIF/JXL encode never silently succeeds via WASM — ' +
      'neither has a registered encoder, on purpose, over the 1.2 MB budget',
    () => {
      for (const format of ['avif', 'jxl'] as OutputFormat[]) {
        for (const preference of PREFERENCES) {
          let thrown: unknown;
          try {
            resolveEncoder(format, preference, CANVAS_ONLY);
          } catch (error) {
            thrown = error;
          }
          expect(codeOf(thrown), format + '/' + preference).toBe('E_ENCODE_FAILED');
        }
      }
    },
  );

  it("preference 'best-quality' genuinely resolves mozjpeg for JPEG and oxipng for PNG", () => {
    const jpegEncoder = resolveEncoder('jpeg', 'best-quality', CANVAS_ONLY);
    expect(jpegEncoder.id).toBe('mozjpeg');
    expect(jpegEncoder.isNative).toBe(false);

    const pngEncoder = resolveEncoder('png', 'best-quality', CANVAS_ONLY);
    expect(pngEncoder.id).toBe('oxipng');
    expect(pngEncoder.isNative).toBe(false);
  });

  it("preference 'best-quality' still falls back to canvas for formats with no WASM tier", () => {
    // webp has no best-quality WASM encoder in the docs/06 §1 table at all.
    expect(resolveEncoder('webp', 'best-quality', CANVAS_ONLY).id).toBe('canvas');
  });
});
