/**
 * src/engines/wasm/tiff.ts — TIFF decode via utif2.
 *
 * Named tiff.ts per docs/07 §1, but there is no WASM here at all: utif2 is a
 * from-scratch pure-JS decoder (its one dependency, pako, is pure JS too), so
 * none of the docs/04 §7 WASM budget applies and there is no lazy-fetch step —
 * it is bundled like any other JS dependency.
 *
 * Decode only. docs/09 §2.1's matrix lists TIFF only as a source row
 * (tiff-to-jpg, tiff-to-png); no route encodes TO tiff.
 */
import UTIF from 'utif2';
import type { InputFormat } from '../../core/types';
import { createJobError } from '../../core/errors';
import type { DecodeInput, DecodeOutput, Decoder } from '../types';

const FORMATS: readonly InputFormat[] = ['tiff'];

export class TiffDecoder implements Decoder {
  readonly id = 'utif' as const;
  readonly formats = FORMATS;
  /** utif2 hands back raw RGBA with no orientation transform applied. */
  readonly appliesOrientation = false;

  canHandle(format: InputFormat): boolean {
    return FORMATS.includes(format);
  }

  async init(): Promise<void> {
    // Nothing to load — utif2 is plain JS, already in the module graph.
  }

  async decode(input: DecodeInput): Promise<DecodeOutput> {
    // One try/catch around the whole untrusted-bytes-to-pixels path, not just
    // the UTIF calls: a truncated/garbage file can make utif2 hand back an IFD
    // with NaN width/height rather than throwing (NaN fails no `<= 0` check),
    // and without this the ImageData constructor below throws a raw
    // DOMException that reaches the UI as an uncaught error instead of the
    // clean E_CORRUPT_FILE docs/04 §6 requires. Caught while writing this
    // adapter's first real integration test against garbage bytes.
    let imageData: ImageData;
    try {
      const ifds = UTIF.decode(input.bytes);
      const ifd = ifds[0];
      if (ifd === undefined) throw new Error('no image directory found');
      UTIF.decodeImage(input.bytes, ifd);
      if (!Number.isFinite(ifd.width) || !Number.isFinite(ifd.height) || ifd.width <= 0 || ifd.height <= 0) {
        throw new Error('TIFF has no valid image data');
      }

      const rgba = UTIF.toRGBA8(ifd);
      // new Uint8ClampedArray(rgba) COPIES into a fresh, plain-ArrayBuffer-backed
      // array — rgba.buffer's type is too loose for ImageData's constructor
      // (ArrayBufferLike admits SharedArrayBuffer, which ImageData rejects),
      // and a copy here is cheap next to the decode that just happened.
      imageData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
    } catch (cause) {
      throw createJobError('E_CORRUPT_FILE', {
        detail: cause instanceof Error ? cause.message : String(cause),
      });
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
      decoderUsed: 'utif',
    };
  }

  dispose(): void {
    // No retained resources.
  }
}

export const tiffDecoder = new TiffDecoder();
