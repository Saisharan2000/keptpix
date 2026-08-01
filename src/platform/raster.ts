/**
 * src/platform/raster.ts — main-thread vector rasterisation.
 *
 * ⚠️ THIS FILE IS A DOCUMENTED EXCEPTION to docs/07 §4 non-negotiable 3, "All
 * image processing happens inside a Web Worker". See docs/12 D-03.
 *
 * Why it has to be here:
 *   - Measured in Chromium, `createImageBitmap` cannot decode an SVG blob at
 *     all — it rejects with "The source image could not be decoded".
 *   - The portable route is HTMLImageElement + drawImage, which is exactly what
 *     docs/07 §1 prescribes for svg.ts ("Image + canvas, no WASM").
 *   - HTMLImageElement is a DOM API, and a Web Worker has no DOM.
 *
 * The exception is kept as narrow as possible. Only the vector→pixels step runs
 * here, and it is a single drawImage. Everything expensive — the encode, the
 * target-size search, the resize plan — still happens in the worker, because
 * what gets handed across is an ordinary raster PNG.
 *
 * It lives in platform/ rather than engines/ because state/ is permitted to
 * import platform/ but NOT engines/ (docs/07 §2), and the queue is what needs
 * to call it. engines/svg.ts keeps the pure size maths.
 */
import { computeRasterSize, readSvgSize, DEFAULT_RASTER_SIZE } from '../core/resize';

/** False in a worker, and in any environment without a DOM. */
export function canRasteriseVectors(): boolean {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}

export interface RasterResult {
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

/**
 * Rasterise an SVG to PNG bytes at `target` pixels on its longest edge.
 *
 * PNG rather than JPEG on purpose: vectors are overwhelmingly logos and icons
 * with flat colour and hard edges, which JPEG renders badly and PNG compresses
 * well. The worker re-encodes to whatever the user actually asked for.
 */
export async function rasteriseSvg(
  bytes: ArrayBuffer,
  target: number = DEFAULT_RASTER_SIZE,
): Promise<RasterResult> {
  if (!canRasteriseVectors()) {
    throw new Error('vector rasterisation requires a DOM');
  }

  const source = new TextDecoder().decode(bytes);
  const { width, height } = computeRasterSize(readSvgSize(source), target);

  // The blob URL is same-origin and never leaves the device; it is revoked in
  // the finally below so it cannot pin the SVG in memory.
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    // An SVG can reference external resources; this keeps it from reaching out.
    image.crossOrigin = 'anonymous';
    image.decoding = 'sync';

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG could not be parsed'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('2d context unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (blob === null) throw new Error('rasterisation produced no output');

    return { bytes: await blob.arrayBuffer(), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
