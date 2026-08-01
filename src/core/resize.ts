/**
 * src/core/resize.ts
 *
 * Contract: docs/06-contracts.md §3.3.
 */
import type { Dimensions, ResizeSpec } from './types';

/** Dimensions are whole pixels and never collapse to zero. */
const px = (n: number): number => Math.max(1, Math.round(n));

/**
 * Resolve a ResizeSpec against a source size.
 *
 * 'fit' and 'maxDimension' only ever shrink. Upscaling a photo to fill a box
 * invents detail that was never captured, so a source already inside the bound
 * is returned untouched.
 */
export function computeTargetDimensions(source: Dimensions, spec: ResizeSpec): Dimensions {
  const w = Math.max(1, source.width);
  const h = Math.max(1, source.height);

  switch (spec.kind) {
    case 'none':
      return { width: w, height: h };

    case 'exact':
      return { width: px(spec.width), height: px(spec.height) };

    case 'scale': {
      const factor = Math.min(1, Math.max(0, spec.factor));
      return { width: px(w * factor), height: px(h * factor) };
    }

    case 'fit': {
      const ratio = Math.min(spec.maxWidth / w, spec.maxHeight / h, 1);
      return { width: px(w * ratio), height: px(h * ratio) };
    }

    case 'maxDimension': {
      const longest = Math.max(w, h);
      const ratio = Math.min(spec.max / longest, 1);
      return { width: px(w * ratio), height: px(h * ratio) };
    }
  }
}

/**
 * Plan a stepped downscale from one size to another.
 *
 * A single large-ratio drawImage aliases badly; halving repeatedly and
 * finishing with the remainder looks markedly better and costs almost nothing.
 * NO STEP MAY REDUCE EITHER AXIS BY MORE THAN 2x — that is the invariant the
 * unit tests assert.
 *
 * Returns the sequence of sizes to draw through, always ending at `to`.
 * Returns [] when the sizes already match, and [to] for any upscale or
 * small enough downscale.
 */
export function planDownscaleSteps(from: Dimensions, to: Dimensions): Dimensions[] {
  const target = { width: px(to.width), height: px(to.height) };
  let current = { width: px(from.width), height: px(from.height) };

  if (current.width === target.width && current.height === target.height) return [];

  const steps: Dimensions[] = [];
  // Guard against a pathological input producing an unbounded plan.
  const maxSteps = 64;

  while (
    steps.length < maxSteps &&
    (current.width > target.width * 2 || current.height > target.height * 2)
  ) {
    current = {
      width: Math.max(target.width, px(current.width / 2)),
      height: Math.max(target.height, px(current.height / 2)),
    };
    steps.push(current);
  }

  const last = steps[steps.length - 1];
  if (last === undefined || last.width !== target.width || last.height !== target.height) {
    steps.push(target);
  }

  return steps;
}

/* ── Vector sizing ───────────────────────────────────────────────────────
 * An SVG has no intrinsic pixel size, so rasterising one always needs a target.
 * This is pure string parsing plus arithmetic, so it belongs here rather than in
 * engines/: platform/raster.ts needs it, and docs/07 §2 lets platform/ import
 * core/ but not engines/.
 */

/** An SVG rasterised smaller than this is a blurry thumbnail of a vector. */
export const DEFAULT_RASTER_SIZE = 1024;

/**
 * Read an SVG's intrinsic size so the aspect ratio survives rasterisation.
 * Prefers the viewBox, falls back to width/height, then to a square default.
 */
export function readSvgSize(source: string): Dimensions {
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(source);
  if (viewBox !== null) {
    const w = Number(viewBox[1]);
    const h = Number(viewBox[2]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  const width = /\bwidth\s*=\s*["']([\d.]+)/i.exec(source);
  const height = /\bheight\s*=\s*["']([\d.]+)/i.exec(source);
  const w = width === null ? 0 : Number(width[1]);
  const h = height === null ? 0 : Number(height[1]);
  if (w > 0 && h > 0) return { width: w, height: h };
  return { width: DEFAULT_RASTER_SIZE, height: DEFAULT_RASTER_SIZE };
}

/** Scale an intrinsic size so its longest edge meets the raster target. */
export function computeRasterSize(
  intrinsic: Dimensions,
  target: number = DEFAULT_RASTER_SIZE,
): Dimensions {
  const longest = Math.max(intrinsic.width, intrinsic.height);
  const scale = longest > 0 ? target / longest : 1;
  return {
    width: Math.max(1, Math.round(intrinsic.width * scale)),
    height: Math.max(1, Math.round(intrinsic.height * scale)),
  };
}
