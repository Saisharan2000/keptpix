/**
 * src/engines/canvas/encoder.ts
 *
 * ADR-004: OffscreenCanvas.convertToBlob before any WASM codec. Most users
 * complete a JPEG or WebP conversion having downloaded zero WASM.
 */
import type { OutputFormat } from '../../core/types';
import {
  FLATTENS_ALPHA,
  OUTPUT_MIME,
  type EncodeInput,
  type EncodeOutput,
  type Encoder,
} from '../types';

/** AVIF encode support is browser-dependent, so it is feature-detected. */
const BASE_FORMATS: readonly OutputFormat[] = ['jpeg', 'png', 'webp'];

/**
 * Ask the browser what convertToBlob actually produces.
 *
 * A browser that cannot encode a format silently falls back to PNG rather than
 * failing, so the returned blob's TYPE is the only trustworthy signal.
 */
export async function probeNativeEncodeFormats(): Promise<OutputFormat[]> {
  if (typeof OffscreenCanvas === 'undefined') return [];

  const canvas = new OffscreenCanvas(1, 1);
  // The context is NOT optional. convertToBlob on a canvas that has never had
  // one produces nothing, which would report every format as unsupported and
  // silently disable the whole tool.
  const ctx = canvas.getContext('2d');
  if (ctx === null) return [];
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1, 1);

  const supported: OutputFormat[] = [];
  for (const format of ['jpeg', 'png', 'webp', 'avif', 'jxl'] as OutputFormat[]) {
    try {
      const blob = await canvas.convertToBlob({ type: OUTPUT_MIME[format] });
      // A browser that cannot encode a type silently falls back to PNG rather
      // than failing, so the returned blob's TYPE is the only honest signal.
      if (blob.type === OUTPUT_MIME[format]) supported.push(format);
    } catch {
      // Unsupported type throws in some engines and substitutes in others;
      // both mean "no".
    }
  }
  return supported;
}

export class CanvasEncoder implements Encoder {
  readonly id = 'canvas' as const;
  readonly isNative = true;

  /** Widened by probeNativeEncodeFormats() at pool startup. */
  #formats: OutputFormat[] = [...BASE_FORMATS];

  get formats(): readonly OutputFormat[] {
    return this.#formats;
  }

  setSupportedFormats(formats: readonly OutputFormat[]): void {
    this.#formats = formats.length > 0 ? [...formats] : [...BASE_FORMATS];
  }

  canHandle(format: OutputFormat): boolean {
    return this.#formats.includes(format);
  }

  async init(): Promise<void> {
    // Nothing to load.
  }

  async encode(input: EncodeInput): Promise<EncodeOutput> {
    const { bitmap, format, quality, backgroundColor } = input;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { alpha: !FLATTENS_ALPHA.has(format) });
    if (ctx === null) {
      throw new Error('OffscreenCanvas 2d context unavailable');
    }

    // JPEG has no alpha, so transparent pixels must be flattened onto a colour
    // or they render as black (docs/05 §1 JobConfig.backgroundColor).
    if (FLATTENS_ALPHA.has(format)) {
      ctx.fillStyle = backgroundColor ?? '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);

    const blob = await canvas.convertToBlob({
      type: OUTPUT_MIME[format],
      // convertToBlob takes 0-1; JobConfig carries 1-100.
      quality: Math.min(1, Math.max(0, quality / 100)),
    });

    return { blob, sizeBytes: blob.size, encoderUsed: 'canvas' };
  }

  dispose(): void {
    // No retained resources.
  }
}

export const canvasEncoder = new CanvasEncoder();
