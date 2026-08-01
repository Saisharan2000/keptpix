/**
 * src/engines/wasm/heif.ts — HEIC/HEIF decode via libheif.
 *
 * HIGHEST PRIORITY codec (docs/10 M5): no browser except Safari decodes HEIC,
 * which is the entire reason /convert/heic-to-jpg exists.
 *
 * The `?url` import makes Vite emit libheif.wasm as a SAME-ORIGIN asset
 * (docs/04 §1) fetched only when a HEIC actually arrives. The package's own
 * `libheif-js/wasm` entry is Node-only — it reads the binary with fs — so the
 * Emscripten glue is loaded directly and handed the bytes.
 */
import type { InputFormat } from '../../core/types';
import { createJobError } from '../../core/errors';
import type { DecodeInput, DecodeOutput, Decoder } from '../types';
import { loadCodec } from './loader';

const HEIF_FORMATS: readonly InputFormat[] = ['heic', 'heif'];

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(data: ImageData, done: (result: ImageData | null) => void): void;
  free?(): void;
}

interface HeifDecoderApi {
  decode(buffer: Uint8Array): HeifImage[];
}

interface LibheifModule {
  HeifDecoder: new () => HeifDecoderApi;
}

async function instantiate(): Promise<LibheifModule> {
  const [{ default: factory }, { default: wasmUrl }] = await Promise.all([
    import('libheif-js/libheif-wasm/libheif.js'),
    import('libheif-js/libheif-wasm/libheif.wasm?url'),
  ]);
  const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
  // The generated .d.ts describes MainModule and omits HeifDecoder.
  return (await factory({ wasmBinary })) as unknown as LibheifModule;
}

export class HeifDecoder implements Decoder {
  readonly id = 'libheif' as const;
  /**
   * libheif honours the HEIF container's own irot/imir transform properties, so
   * image.display() hands back DISPLAY-READY pixels. Verified against a real
   * iPhone HEIC: EXIF reports Orientation 6 and 4032x3024, and libheif returns
   * 3024x4032 already upright.
   */
  readonly appliesOrientation = true;
  readonly formats = HEIF_FORMATS;

  canHandle(format: InputFormat): boolean {
    return HEIF_FORMATS.includes(format);
  }

  /** Idempotent — loadCodec caches the instance for this worker's lifetime. */
  async init(): Promise<void> {
    await loadCodec('libheif', 'HEIC', instantiate);
  }

  async decode(input: DecodeInput): Promise<DecodeOutput> {
    const libheif = await loadCodec('libheif', 'HEIC', instantiate);

    const decoder = new libheif.HeifDecoder();
    let images: HeifImage[];
    try {
      images = decoder.decode(new Uint8Array(input.bytes));
    } catch (cause) {
      throw createJobError('E_CORRUPT_FILE', {
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }

    const first = images[0];
    if (first === undefined) {
      throw createJobError('E_CORRUPT_FILE', { detail: 'libheif returned no images' });
    }

    const width = first.get_width();
    const height = first.get_height();
    const imageData = new ImageData(width, height);

    await new Promise<void>((resolve, reject) => {
      first.display(imageData, (result) => {
        if (result === null) reject(new Error('libheif display() returned null'));
        else resolve();
      });
    });

    for (const image of images) image.free?.();

    let bitmap = await createImageBitmap(imageData);

    // Orientation is applied by the pipeline (docs/12 D-33), which is where the
    // main-thread metadata lands. Rotating here too would double-rotate.

    const maxPixels = input.maxPixels;
    if (maxPixels !== undefined && maxPixels > 0 && bitmap.width * bitmap.height > maxPixels) {
      const ratio = Math.sqrt(maxPixels / (bitmap.width * bitmap.height));
      const scaled = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.floor(bitmap.width * ratio)),
        resizeHeight: Math.max(1, Math.floor(bitmap.height * ratio)),
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = scaled;
    }

    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: true,
      decoderUsed: 'libheif',
    };
  }

  dispose(): void {
    // The module is cached per worker and freed by teardown().
  }
}

export const heifDecoder = new HeifDecoder();
