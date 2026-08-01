/**
 * src/engines/wasm/mozjpeg.ts — best-quality JPEG encode (docs/10 M5).
 *
 * ADR-004: canvas JPEG encode is the default; mozjpeg is the "best quality"
 * tier a user opts into explicitly (encoderPreference: 'best-quality'), for
 * genuinely better quality-per-byte than the browser's own encoder.
 *
 * Same loading pattern as heif.ts (docs/12 D-22): the compiled glue is
 * imported directly and handed a same-origin `?url` asset, rather than relying
 * on Emscripten's own relative-path wasm resolution under Vite's bundler. That
 * keeps the same-origin guarantee explicit and provable (docs/04 §1) instead
 * of depending on the bundler rewriting a relative fetch correctly.
 *
 * Budget check: mozjpeg_enc.wasm is ~246 KB — comfortably under the 1.2 MB
 * ceiling in docs/04 §7.
 */
import type { OutputFormat } from '../../core/types';
import { createJobError } from '../../core/errors';
import type { EncodeInput, EncodeOutput, Encoder } from '../types';
import { loadCodec } from './loader';

const FORMATS: readonly OutputFormat[] = ['jpeg'];

interface MozjpegModule {
  encode(data: ImageData, options?: Record<string, unknown>): Promise<ArrayBuffer>;
}

async function instantiate(): Promise<MozjpegModule> {
  const [encodeModule, { default: wasmUrl }] = await Promise.all([
    import('@jsquash/jpeg/encode.js'),
    import('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url'),
  ]);
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const wasmModule = await WebAssembly.compile(bytes);
  await encodeModule.init(wasmModule);
  return { encode: (data, options) => encodeModule.default(data, options) };
}

/** Read an ImageBitmap's pixels into an ImageData — jSquash's own currency. */
function toImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export class MozjpegEncoder implements Encoder {
  readonly id = 'mozjpeg' as const;
  readonly formats = FORMATS;
  readonly isNative = false;

  canHandle(format: OutputFormat): boolean {
    return FORMATS.includes(format);
  }

  async init(): Promise<void> {
    await loadCodec('mozjpeg', 'JPEG', instantiate);
  }

  async encode(input: EncodeInput): Promise<EncodeOutput> {
    const codec = await loadCodec('mozjpeg', 'JPEG', instantiate);
    const imageData = toImageData(input.bitmap);

    let buffer: ArrayBuffer;
    try {
      buffer = await codec.encode(imageData, { quality: input.quality });
    } catch (cause) {
      throw createJobError('E_ENCODE_FAILED', {
        params: { format: 'JPEG' },
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }

    const blob = new Blob([buffer], { type: 'image/jpeg' });
    return { blob, sizeBytes: blob.size, encoderUsed: 'mozjpeg' };
  }

  dispose(): void {
    // The module is cached per worker and freed by teardown().
  }
}

export const mozjpegEncoder = new MozjpegEncoder();
