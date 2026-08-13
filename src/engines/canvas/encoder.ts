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

  /**
   * ONE canvas per alpha mode, reused across encode passes (docs/12 D-117).
   *
   * A fresh `new OffscreenCanvas(w, h)` per pass was the main driver of the
   * D-103 budget breach: a 12 MP surface is ~48 MB of raster backing, a target
   * search runs up to eight passes, and Chromium collects abandoned backings
   * lazily — so the measured process peak carried several dead canvases at
   * once (528 MB against a 400 MB budget). The quality binary-search runs at a
   * FIXED scale, so most passes can redraw into the very same backing.
   *
   * Two cache slots, not one, because the `alpha` flag is fixed at
   * getContext() time and cannot be flipped afterwards — a JPEG (flattened)
   * pass and a PNG (alpha) pass can never share a context.
   *
   * Safe to hold on the instance: the pool marks a worker `busy` for the whole
   * job, so encode calls within one worker are strictly sequential.
   */
  #surfaces: Partial<
    Record<'alpha' | 'opaque', { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D }>
  > = {};

  #surface(width: number, height: number, wantsAlpha: boolean) {
    const key = wantsAlpha ? 'alpha' : 'opaque';
    let entry = this.#surfaces[key];
    if (entry === undefined) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { alpha: wantsAlpha });
      if (ctx === null) throw new Error('OffscreenCanvas 2d context unavailable');
      entry = { canvas, ctx };
      this.#surfaces[key] = entry;
    } else if (entry.canvas.width !== width || entry.canvas.height !== height) {
      // Assigning width/height reallocates the backing AND clears the surface,
      // so a dimension change needs no separate clear. Old backing becomes
      // garbage — but only on a scale change (2–3 per search), not every pass.
      entry.canvas.width = width;
      entry.canvas.height = height;
    } else if (wantsAlpha) {
      // Same-size redraw on an alpha surface: the previous pass's pixels are
      // still there, and a smaller draw would ghost through. Opaque formats
      // skip this — their background fillRect below covers everything anyway.
      entry.ctx.clearRect(0, 0, width, height);
    }
    return entry;
  }

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
    const flattens = FLATTENS_ALPHA.has(format);
    const { canvas, ctx } = this.#surface(bitmap.width, bitmap.height, !flattens);

    // JPEG has no alpha, so transparent pixels must be flattened onto a colour
    // or they render as black (docs/05 §1 JobConfig.backgroundColor).
    if (flattens) {
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
    // Release the retained raster backings — a 12 MP surface is ~48 MB, and a
    // torn-down worker must not pin one (docs/06 §2 rule 2's spirit applies to
    // canvases as much as bitmaps). Zero-sizing frees the backing without
    // waiting for the canvas object itself to be collected.
    for (const entry of Object.values(this.#surfaces)) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    this.#surfaces = {};
  }
}

export const canvasEncoder = new CanvasEncoder();
