/**
 * src/engines/wasm/oxipng.ts — lossless PNG optimisation (docs/10 M5).
 *
 * ADR-004: canvas PNG encode is the default; oxipng is the "optimize" tier a
 * user opts into for real, lossless byte savings the browser's own encoder
 * leaves on the table (better DEFLATE settings, filter selection).
 *
 * Same explicit same-origin ?url loading pattern as heif.ts / mozjpeg.ts
 * (docs/12 D-22). Budget: squoosh_oxipng_bg.wasm (single-threaded build,
 * required by ADR-003) is ~164 KB — comfortably under the 1.2 MB ceiling.
 */
import type { OutputFormat } from '../../core/types';
import { createJobError } from '../../core/errors';
import type { EncodeInput, EncodeOutput, Encoder } from '../types';
import { loadCodec } from './loader';

const FORMATS: readonly OutputFormat[] = ['png'];

interface OxipngModule {
  optimise(data: ImageData, options?: Record<string, unknown>): Promise<ArrayBuffer>;
}

/**
 * ADR-003 forbids SharedArrayBuffer, so this always takes the single-threaded
 * build — never codec/pkg-parallel, which needs cross-origin isolation this
 * app deliberately does not have.
 */
async function instantiate(): Promise<OxipngModule> {
  const [optimiseModule, { default: wasmUrl }] = await Promise.all([
    import('@jsquash/oxipng/optimise.js'),
    import('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url'),
  ]);
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const wasmModule = await WebAssembly.compile(bytes);
  await optimiseModule.init(wasmModule);
  return { optimise: (data, options) => optimiseModule.default(data, options) };
}

function toImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export class OxipngEncoder implements Encoder {
  readonly id = 'oxipng' as const;
  readonly formats = FORMATS;
  readonly isNative = false;

  canHandle(format: OutputFormat): boolean {
    return FORMATS.includes(format);
  }

  async init(): Promise<void> {
    await loadCodec('oxipng', 'PNG', instantiate);
  }

  async encode(input: EncodeInput): Promise<EncodeOutput> {
    const codec = await loadCodec('oxipng', 'PNG', instantiate);
    const imageData = toImageData(input.bitmap);

    let buffer: ArrayBuffer;
    try {
      // level 2 is oxipng's own "reasonable default" — higher levels trade
      // real CPU time for a few more percent, not worth it inside a batch.
      buffer = await codec.optimise(imageData, { level: 2, interlace: false });
    } catch (cause) {
      throw createJobError('E_ENCODE_FAILED', {
        params: { format: 'PNG' },
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }

    const blob = new Blob([buffer], { type: 'image/png' });
    return { blob, sizeBytes: blob.size, encoderUsed: 'oxipng' };
  }

  dispose(): void {
    // The module is cached per worker and freed by teardown().
  }
}

export const oxipngEncoder = new OxipngEncoder();
