/**
 * src/engines/canvas/decoder.ts
 *
 * ADR-004: createImageBitmap is native, needs zero WASM, and is hardware
 * accelerated. It is tried before any codec download.
 */
import type { InputFormat } from '../../core/types';
import { INPUT_MIME, type DecodeInput, type DecodeOutput, type Decoder } from '../types';

/** Formats every modern browser decodes natively. */
const CANVAS_FORMATS: readonly InputFormat[] = ['jpeg', 'png', 'webp', 'gif', 'bmp'];

/**
 * A genuinely valid, one-pixel AVIF file (305 B), produced once by a real
 * encoder (@jsquash/avif) and confirmed to round-trip through
 * createImageBitmap before being embedded. Feature-detecting AVIF decode has
 * no cheaper API than "try to decode a real AVIF and see if it throws" — there
 * is no capabilities.avif flag — and unlike the encode probe, decode failure
 * throws reliably, so no PNG-substitution trap applies here (docs/12 D-46).
 */
const AVIF_PROBE_B64 =
  'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAA' +
  'AAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAAB' +
  'AAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAA' +
  'amlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFD' +
  'gQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAK' +
  'CBgABggQEDQgMgkYAAooooQABUg=';

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Ask the browser whether it can decode AVIF without any WASM. This is the
 * decode-side sibling of probeNativeEncodeFormats() in canvas/encoder.ts —
 * without it, resolveDecoderId's avif branch (docs/06 §1) can never observe a
 * real "yes", so libavif's 1.17 MB WASM decoder downloads unconditionally even
 * on browsers that decode AVIF for free, which is exactly what ADR-004 exists
 * to prevent.
 */
export async function probeNativeDecodeFormats(): Promise<InputFormat[]> {
  const supported: InputFormat[] = [];
  try {
    const blob = new Blob([base64ToBytes(AVIF_PROBE_B64)], { type: 'image/avif' });
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    supported.push('avif');
  } catch {
    // No native AVIF decode on this browser. libavif is the documented
    // fallback (wasm/avif.ts) — nothing further to detect here.
  }
  return supported;
}

/** Formats that can carry an alpha channel. JPEG and BMP cannot. */
const ALPHA_CAPABLE: ReadonlySet<InputFormat> = new Set<InputFormat>([
  'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'jxl', 'svg', 'tiff',
]);

export class CanvasDecoder implements Decoder {
  readonly id = 'canvas' as const;
  /** createImageBitmap({ imageOrientation: 'from-image' }) applies it. */
  readonly appliesOrientation = true;

  /**
   * Widened at configure() time from the resolved CodecSupport. A browser that
   * decodes AVIF natively can use this same adapter for it (docs/06 §1), so the
   * list cannot be a hardcoded constant without the adapter and the support
   * matrix drifting apart.
   */
  #formats: InputFormat[] = [...CANVAS_FORMATS];

  get formats(): readonly InputFormat[] {
    return this.#formats;
  }

  setSupportedFormats(formats: readonly InputFormat[]): void {
    // The universal five are always in: every browser createImageBitmap
    // supports them, and an empty probe result must not disable the tool.
    const merged = new Set<InputFormat>([...CANVAS_FORMATS, ...formats]);
    this.#formats = [...merged];
  }

  canHandle(format: InputFormat): boolean {
    return this.#formats.includes(format);
  }

  async init(): Promise<void> {
    // Nothing to load — that is the entire point of the canvas path.
  }

  async decode(input: DecodeInput): Promise<DecodeOutput> {
    const blob = new Blob([input.bytes], { type: INPUT_MIME[input.format] });

    // imageOrientation: 'from-image' applies EXIF orientation to the PIXELS
    // during decode. Without it, iPhone photos come out sideways — the single
    // most common defect in this class of tool.
    let bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });

    const maxPixels = input.maxPixels;
    if (maxPixels !== undefined && maxPixels > 0 && bitmap.width * bitmap.height > maxPixels) {
      // Re-decode straight to a safe size rather than allocating the full
      // bitmap and shrinking it — the whole point is not to hold that much.
      const ratio = Math.sqrt(maxPixels / (bitmap.width * bitmap.height));
      const resizeWidth = Math.max(1, Math.floor(bitmap.width * ratio));
      const resizeHeight = Math.max(1, Math.floor(bitmap.height * ratio));
      const original = bitmap;
      try {
        bitmap = await createImageBitmap(blob, {
          imageOrientation: 'from-image',
          resizeWidth,
          resizeHeight,
          resizeQuality: 'high',
        });
      } finally {
        original.close();
      }
    }

    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: ALPHA_CAPABLE.has(input.format),
      decoderUsed: 'canvas',
    };
  }

  dispose(): void {
    // No retained resources.
  }
}

export const canvasDecoder = new CanvasDecoder();
