/**
 * src/engines/registry.ts
 *
 * Contract: docs/06-contracts.md §1 — the two resolution tables.
 *
 * BOTH functions are PURE AND SYNCHRONOUS. No await, ever. WASM loading happens
 * in init(), which the pipeline calls AFTER resolution — that separation is
 * what keeps "which codec" a decision the tests can make without a network.
 */
import type { CodecSupport, DecoderId, EncoderId, InputFormat, OutputFormat } from '../core/types';
import { createJobError } from '../core/errors';
import type { Decoder, Encoder } from './types';
import { canvasDecoder } from './canvas/decoder';
import { canvasEncoder } from './canvas/encoder';
import { heifDecoder } from './wasm/heif';
import { avifDecoder } from './wasm/avif';
import { tiffDecoder } from './wasm/tiff';
import { mozjpegEncoder } from './wasm/mozjpeg';
import { oxipngEncoder } from './wasm/oxipng';

/**
 * Registered adapters.
 *
 * SVG is deliberately ABSENT: rasterising it needs HTMLImageElement, which does
 * not exist in a worker. See the note in engines/svg.ts.
 *
 * JXL is deliberately ABSENT, encode and decode: @jsquash/jxl's smallest
 * encoder build is 1.36 MB, over the docs/04 §7 1.2 MB ceiling, and no route
 * currently needs JXL decode. See the note in wasm/jxl.ts and docs/12 D-46.
 *
 * AVIF is registered for DECODE only — its own encoder binary is 3.48 MB, far
 * over budget. See the note in wasm/avif.ts and docs/12 D-46.
 *
 * Every WASM adapter here loads its actual codec through a DYNAMIC import
 * inside its own factory, so the bytes are fetched only when a file that
 * actually needs them arrives. A static import of the wasm itself (as opposed
 * to the small JS class below) would put every codec in every visitor's
 * hydration bundle and break ADR-004.
 */
const decoders = new Map<DecoderId, Decoder>([
  ['canvas', canvasDecoder],
  ['libheif', heifDecoder],
  ['libavif', avifDecoder],
  ['utif', tiffDecoder],
]);
const encoders = new Map<EncoderId, Encoder>([
  ['canvas', canvasEncoder],
  ['mozjpeg', mozjpegEncoder],
  ['oxipng', oxipngEncoder],
]);

export function registerDecoder(decoder: Decoder): void {
  decoders.set(decoder.id, decoder);
}
export function registerEncoder(encoder: Encoder): void {
  encoders.set(encoder.id, encoder);
}
export function registeredDecoderIds(): DecoderId[] {
  return [...decoders.keys()];
}
export function registeredEncoderIds(): EncoderId[] {
  return [...encoders.keys()];
}

/**
 * docs/06 §1 decoder table. No preference parameter — there is only ever one
 * sensible decoder per input format.
 */
export function resolveDecoderId(format: InputFormat, support: CodecSupport): DecoderId | null {
  switch (format) {
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'gif':
    case 'bmp':
      return 'canvas';
    case 'avif':
      // nativeDecode specifically, not decode: docs/12 D-46. `decode.avif` is
      // true once ANY adapter can handle it, native or WASM, and would have
      // made this always route to 'canvas' the moment libavif was registered
      // — including on browsers canvas genuinely cannot decode AVIF on.
      return support.nativeDecode.avif ? 'canvas' : 'libavif';
    case 'heic':
    case 'heif':
      return 'libheif';
    case 'jxl':
      return 'libjxl';
    case 'tiff':
      return 'utif';
    case 'svg':
      return 'svg';
    default:
      return null;
  }
}

export function resolveDecoder(format: InputFormat, support: CodecSupport): Decoder {
  const id = resolveDecoderId(format, support);
  const decoder = id === null ? undefined : decoders.get(id);
  if (decoder === undefined) {
    // Either nothing handles this format, or the adapter that would is not
    // registered yet. Both are honestly "we cannot read this" to the user.
    throw createJobError('E_UNSUPPORTED_FORMAT', {
      params: { detected: format.toUpperCase(), supported: supportedInputList() },
      detail: id === null ? 'no decoder for ' + format : 'decoder ' + id + ' not registered',
    });
  }
  return decoder;
}

function supportedInputList(): string {
  const formats = new Set<string>();
  for (const decoder of decoders.values()) {
    for (const f of decoder.formats) formats.add(f.toUpperCase());
  }
  return [...formats].sort().join(', ');
}

/** docs/06 §1 encoder preference table. */
const BEST_QUALITY: Partial<Record<OutputFormat, EncoderId>> = {
  jpeg: 'mozjpeg',
  png: 'oxipng',
  avif: 'libavif',
  jxl: 'libjxl',
};

const WASM_FALLBACK: Partial<Record<OutputFormat, EncoderId>> = {
  avif: 'libavif',
  jxl: 'libjxl',
};

export function resolveEncoder(
  format: OutputFormat,
  preference: 'auto' | 'native' | 'best-quality',
  support: CodecSupport,
): Encoder {
  const canvas = encoders.get('canvas');
  // The CodecSupport matrix is the single authority on what canvas can encode.
  // The adapter also keeps its own list, but consulting BOTH would mean two
  // sources of truth for one fact, and they can only ever disagree by being
  // wrong. docs/06 §1 frames the 'auto' rule as support.nativeEncode[format].
  const canvasCan = canvas !== undefined && support.nativeEncode[format] === true;

  if (preference === 'native') {
    // Canvas only. Throw if canvas cannot do the format.
    if (!canvasCan) {
      throw createJobError('E_ENCODE_FAILED', {
        params: { format: format.toUpperCase() },
        detail: 'preference=native but canvas cannot encode ' + format,
      });
    }
    return canvas;
  }

  if (preference === 'best-quality') {
    const preferred = BEST_QUALITY[format];
    const wasm = preferred === undefined ? undefined : encoders.get(preferred);
    if (wasm !== undefined && wasm.canHandle(format)) return wasm;
    // Canvas as last resort — the documented fallback.
    if (canvasCan) return canvas;
    throw encodeUnavailable(format);
  }

  // 'auto' — canvas when it can do it natively (ADR-004), else WASM.
  if (canvasCan) return canvas;

  const fallbackId = WASM_FALLBACK[format];
  const wasm = fallbackId === undefined ? undefined : encoders.get(fallbackId);
  if (wasm !== undefined && wasm.canHandle(format)) return wasm;
  if (canvasCan) return canvas;
  throw encodeUnavailable(format);
}

function encodeUnavailable(format: OutputFormat) {
  return createJobError('E_ENCODE_FAILED', {
    params: { format: format.toUpperCase() },
    detail: 'no registered encoder for ' + format,
  });
}
