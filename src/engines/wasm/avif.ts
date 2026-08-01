/**
 * src/engines/wasm/avif.ts — AVIF DECODE only. See docs/12 D-46 for why encode
 * is deliberately not shipped here.
 *
 * docs/06 §1 decoder table: "avif -> canvas if support.decode.avif, else
 * libavif" — this is the fallback for a browser that cannot decode AVIF
 * natively (older Firefox, Safari < 16.4). Needed for the P1 avif-to-jpg and
 * avif-to-png routes in docs/09 §2.1.
 *
 * ⚠️ AVIF ENCODE IS NOT IMPLEMENTED HERE, on purpose. @jsquash/avif's own
 * encoder binary (avif_enc.wasm) is 3.48 MB — almost 3x the 1.2 MB per-codec
 * ceiling in docs/04 §7, and there is no smaller build available; the decoder
 * used below is a SEPARATE, smaller binary (avif_dec.wasm, 1.17 MB) that just
 * fits. Shipping the encoder would either blow the budget outright or require
 * loosening it specifically for this one file, which docs/04 §7 does not
 * offer a mechanism for and this decision does not take unilaterally.
 *
 * AVIF as an OUTPUT format therefore works only where the browser encodes it
 * NATIVELY (ADR-004's canvas-first policy, already feature-detected in
 * core/capabilities.ts) — Chrome and Firefox increasingly do. Where neither
 * canvas nor a registered WASM encoder can produce AVIF, resolveEncoder
 * already throws E_ENCODE_FAILED with a specific message (docs/06 §1); that
 * is the correct, honest behaviour here, not a gap to route around.
 */
import type { InputFormat } from '../../core/types';
import { createJobError } from '../../core/errors';
import type { DecodeInput, DecodeOutput, Decoder } from '../types';
import { loadCodec } from './loader';

const FORMATS: readonly InputFormat[] = ['avif'];

interface AvifDecodeModule {
  decode(buffer: ArrayBuffer): Promise<ImageData | null>;
}

async function instantiate(): Promise<AvifDecodeModule> {
  const [decodeModule, { default: wasmUrl }] = await Promise.all([
    import('@jsquash/avif/decode.js'),
    import('@jsquash/avif/codec/dec/avif_dec.wasm?url'),
  ]);
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const wasmModule = await WebAssembly.compile(bytes);
  await decodeModule.init(wasmModule);
  return { decode: (buffer) => decodeModule.default(buffer) };
}

export class AvifDecoder implements Decoder {
  readonly id = 'libavif' as const;
  readonly formats = FORMATS;
  /** libavif hands back plain ImageData with no orientation transform. */
  readonly appliesOrientation = false;

  canHandle(format: InputFormat): boolean {
    return FORMATS.includes(format);
  }

  async init(): Promise<void> {
    await loadCodec('libavif', 'AVIF', instantiate);
  }

  async decode(input: DecodeInput): Promise<DecodeOutput> {
    const codec = await loadCodec('libavif', 'AVIF', instantiate);

    let imageData: ImageData | null;
    try {
      imageData = await codec.decode(input.bytes);
    } catch (cause) {
      throw createJobError('E_CORRUPT_FILE', {
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    if (imageData === null) {
      throw createJobError('E_CORRUPT_FILE', { detail: 'libavif returned no image' });
    }

    let bitmap = await createImageBitmap(imageData);

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
      decoderUsed: 'libavif',
    };
  }

  dispose(): void {
    // The module is cached per worker and freed by teardown().
  }
}

export const avifDecoder = new AvifDecoder();
