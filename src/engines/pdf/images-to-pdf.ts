/**
 * src/engines/pdf/images-to-pdf.ts
 *
 * The browser half of images-to-pdf. Everything that needs a canvas, an
 * ImageBitmap or a codec lives here; all the arithmetic and byte assembly is
 * in `core/pdf/` where it can be tested under Node (ADR-006, docs/12 D-75).
 *
 * TWO PATHS, and the fast one is the common one:
 *
 *   passthrough  The file is already a baseline JPEG, so its bytes go into the
 *                PDF untouched as a /DCTDecode stream. No decode, no canvas, no
 *                re-encode, no quality loss. A 40 MP photo costs a header parse.
 *
 *   re-encode    Anything else — HEIC, PNG, WebP, progressive or CMYK JPEG —
 *                is decoded through the existing registry and encoded to JPEG
 *                by the existing canvas encoder. No new codec is introduced by
 *                this tool.
 *
 * Which path a file takes is decided by its BYTES, never its name or MIME type
 * (the fixtures include a JPEG called `.png` for exactly this reason).
 */
import { createJobError } from '../../core/errors';
import { parseJpegFrame, passthroughSpec } from '../../core/pdf/jpeg';
import { layoutPage, type PdfLayoutOptions } from '../../core/pdf/layout';
import type { PdfSourceImage, PreparedPdfImage } from '../../core/pdf/types';
import { buildPdf, type PdfPage } from '../../core/pdf/writer';
import type { CodecSupport } from '../../core/types';
import { resolveDecoder } from '../registry';

export type { PdfSourceImage, PreparedPdfImage };

/**
 * Quality for the re-encode path.
 *
 * Deliberately NOT a manifest config field. It would apply to some files in a
 * batch and silently not others — the JPEGs pass through untouched — which is
 * an unexplainable control. High enough that a re-encoded page is
 * indistinguishable in a document; `/pdf/compress` is the tool for making the
 * result smaller, and it can see the whole document when it does.
 */
const REENCODE_QUALITY = 0.92;

/**
 * Prepares one image. Runs inside the worker — one call per file, so the pool
 * parallelises them and one failure cannot take down a batch.
 */
export async function prepareImageForPdf(
  source: PdfSourceImage,
  support: CodecSupport,
): Promise<PreparedPdfImage> {
  const view = new Uint8Array(source.bytes);

  // ── Fast path ────────────────────────────────────────────────────────────
  const frame = parseJpegFrame(view);
  if (frame !== null) {
    const spec = passthroughSpec(frame);
    if (spec !== null) {
      return {
        bytes: source.bytes,
        width: frame.width,
        height: frame.height,
        colorSpace: spec.colorSpace,
        bitsPerComponent: spec.bitsPerComponent,
        // PDF has no notion of EXIF, so an uncorrected sideways photo would be
        // written sideways. The matrix fixes it without touching the pixels.
        orientation: source.orientation,
        reencoded: false,
      };
    }
  }

  // ── Re-encode path ───────────────────────────────────────────────────────
  const decoder = resolveDecoder(source.format, support);
  await decoder.init();

  const decoded = await decoder.decode({
    bytes: source.bytes,
    format: source.format,
    orientation: source.orientation,
  });

  let jpegBytes: ArrayBuffer;
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw createJobError('E_ENCODE_FAILED', { params: { format: 'PDF' } });
    }
    const canvas = new OffscreenCanvas(decoded.width, decoded.height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw createJobError('E_ENCODE_FAILED', { params: { format: 'PDF' } });

    ctx.drawImage(decoded.bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: REENCODE_QUALITY });
    jpegBytes = await blob.arrayBuffer();
  } finally {
    // CLAUDE.md: close every ImageBitmap in a finally.
    decoded.bitmap.close();
  }

  // Read the dimensions back off what the browser actually produced rather
  // than trusting the bitmap: they must agree with the stream the PDF will
  // carry, and a mismatch renders as a squashed page.
  const written = parseJpegFrame(new Uint8Array(jpegBytes));
  if (written === null) {
    throw createJobError('E_ENCODE_FAILED', { params: { format: 'PDF' } });
  }

  return {
    bytes: jpegBytes,
    width: written.width,
    height: written.height,
    colorSpace: written.components === 1 ? 'DeviceGray' : 'DeviceRGB',
    bitsPerComponent: 8,
    // A decoder that bakes orientation into its pixels has already corrected
    // it; one that hands back raw pixels has not, and the matrix must. Asking
    // the adapter is what docs/12 D-34 exists to enforce — guessing here is
    // how an upright photo gets rotated twice.
    orientation: decoder.appliesOrientation ? 1 : source.orientation,
    reencoded: true,
  };
}

/**
 * Assembles prepared images into one document. Pure byte work — no decoding —
 * but it runs in a worker anyway, because concatenating several hundred
 * megabytes on the main thread is a visible freeze.
 */
export function assemblePdf(
  images: readonly PreparedPdfImage[],
  options: PdfLayoutOptions,
): Uint8Array {
  if (images.length === 0) {
    throw createJobError('E_CORRUPT_FILE');
  }

  const pages: PdfPage[] = images.map((image) => {
    const geometry = layoutPage(image, options);
    return {
      ...geometry,
      image: {
        bytes: new Uint8Array(image.bytes),
        filter: 'DCTDecode',
        width: image.width,
        height: image.height,
        colorSpace: image.colorSpace,
        bitsPerComponent: image.bitsPerComponent,
        orientation: image.orientation,
      },
    };
  });

  return buildPdf(pages);
}
