/**
 * src/core/pdf/layout.ts
 *
 * Page geometry for images-to-pdf. Pure arithmetic — no DOM, no image data,
 * nothing but numbers in and numbers out, so every case below is a unit test
 * rather than something you have to open a PDF to check.
 *
 * PDF's unit is the point: 1 pt = 1/72 inch, origin bottom-left, y upward.
 */
import { orientationSwapsAxes } from '../metadata';

export type PdfPageSize = 'fit' | 'a4' | 'letter';
export type PdfPageOrientation = 'auto' | 'portrait' | 'landscape';

export interface PdfLayoutOptions {
  readonly pageSize: PdfPageSize;
  readonly orientation: PdfPageOrientation;
  readonly marginMm: number;
}

/** Just the parts of an image the geometry depends on. */
export interface LayoutInput {
  /** Stored pixel dimensions, BEFORE orientation correction. */
  readonly width: number;
  readonly height: number;
  /** EXIF 1-8. 5-8 swap the axes, which changes the page shape. */
  readonly orientation: number;
}

/** A media box plus the rect the image occupies inside it. All points. */
export interface PageGeometry {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const MM_TO_PT = 72 / 25.4;

/** ISO 216 A4: 210 × 297 mm. */
export const A4_PT: readonly [number, number] = [210 * MM_TO_PT, 297 * MM_TO_PT];
/** US Letter: 8.5 × 11 in. */
export const LETTER_PT: readonly [number, number] = [612, 792];

/**
 * The longest edge a `fit` page may have, in points (= A4's long edge).
 *
 * The obvious reading of "fit to image" is a page of exactly the image's pixel
 * dimensions at 72 dpi. Taken literally that turns an ordinary 12 MP phone
 * photo into a 55 × 42 INCH page — technically the right aspect ratio, and an
 * alarming thing to find in a document's properties. Print dialogs rescue it
 * by scaling to fit, so the bug is invisible until someone checks.
 *
 * So `fit` means "a page shaped exactly like the image, at a size you can
 * actually print": aspect preserved to the pixel, long edge capped here.
 * Images already smaller than this are left at their natural 72 dpi size
 * rather than being blown up to fill a page they were never meant to fill.
 */
export const FIT_MAX_EDGE_PT = A4_PT[1];

/** Guards against a margin that would leave no room for the image at all. */
function usableMargin(marginPt: number, widthPt: number, heightPt: number): number {
  const limit = Math.min(widthPt, heightPt) / 2;
  // Leave at least a hairline of content; a zero-area rect renders as nothing
  // and would look like a failed conversion rather than a bad setting.
  return Math.max(0, Math.min(marginPt, Math.max(0, limit - 1)));
}

function applyOrientation(
  size: readonly [number, number],
  orientation: PdfPageOrientation,
  imageIsLandscape: boolean,
): [number, number] {
  const [shortEdge, longEdge] = size;
  const wantLandscape =
    orientation === 'landscape' || (orientation === 'auto' && imageIsLandscape);
  return wantLandscape ? [longEdge, shortEdge] : [shortEdge, longEdge];
}

/**
 * Places one image on one page.
 *
 * The image is always scaled to fit inside the margins with its aspect ratio
 * preserved, and centred. It is never cropped and never stretched — a tool
 * that silently distorts someone's photo to fill a page is worse than one that
 * leaves white space.
 */
export function layoutPage(image: LayoutInput, options: PdfLayoutOptions): PageGeometry {
  // Everything below works in DISPLAY dimensions. A photo shot sideways is
  // stored landscape with orientation 6; it must be laid out as the portrait
  // image the viewer will actually see.
  const swap = orientationSwapsAxes(image.orientation);
  const displayW = Math.max(1, swap ? image.height : image.width);
  const displayH = Math.max(1, swap ? image.width : image.height);
  const imageIsLandscape = displayW >= displayH;

  const marginPt = Math.max(0, options.marginMm) * MM_TO_PT;

  let pageW: number;
  let pageH: number;

  if (options.pageSize === 'fit') {
    // Scale down to the printable cap; never up.
    const longest = Math.max(displayW, displayH);
    const scale = longest > FIT_MAX_EDGE_PT ? FIT_MAX_EDGE_PT / longest : 1;
    let contentW = displayW * scale;
    let contentH = displayH * scale;

    // A forced orientation on a `fit` page cannot change the image's shape, so
    // it changes the paper's: the page becomes the requested way round and the
    // image is centred in it, with white space. Predictable beats clever.
    if (
      (options.orientation === 'portrait' && contentW > contentH) ||
      (options.orientation === 'landscape' && contentH > contentW)
    ) {
      [contentW, contentH] = [contentH, contentW];
    }

    pageW = contentW + marginPt * 2;
    pageH = contentH + marginPt * 2;
  } else {
    const base = options.pageSize === 'a4' ? A4_PT : LETTER_PT;
    [pageW, pageH] = applyOrientation(base, options.orientation, imageIsLandscape);
  }

  const margin = usableMargin(marginPt, pageW, pageH);
  const boxW = pageW - margin * 2;
  const boxH = pageH - margin * 2;

  // Contain, not cover.
  const scale = Math.min(boxW / displayW, boxH / displayH);
  const w = displayW * scale;
  const h = displayH * scale;

  return {
    widthPt: pageW,
    heightPt: pageH,
    x: margin + (boxW - w) / 2,
    y: margin + (boxH - h) / 2,
    w,
    h,
  };
}
