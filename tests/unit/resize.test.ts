/**
 * docs/06-contracts.md §3.3 — computeTargetDimensions and planDownscaleSteps.
 */
import { describe, it, expect } from 'vitest';
import {
  computeTargetDimensions,
  planDownscaleSteps,
  readSvgSize,
  computeRasterSize,
  DEFAULT_RASTER_SIZE,
} from '../../src/core/resize';
import type { Dimensions } from '../../src/core/types';

const dim = (width: number, height: number): Dimensions => ({ width, height });
const PHOTO = dim(4032, 3024); // a 12 MP iPhone photo, portrait sensor landscape

describe('computeTargetDimensions', () => {
  it('kind: none returns the source untouched', () => {
    expect(computeTargetDimensions(PHOTO, { kind: 'none' })).toEqual(PHOTO);
  });

  it('kind: exact returns exactly what was asked, aspect ratio be damned', () => {
    expect(computeTargetDimensions(PHOTO, { kind: 'exact', width: 800, height: 800 })).toEqual(
      dim(800, 800),
    );
  });

  it('kind: scale multiplies both axes', () => {
    expect(computeTargetDimensions(PHOTO, { kind: 'scale', factor: 0.5 })).toEqual(dim(2016, 1512));
  });

  it('kind: fit contains within the box and preserves aspect ratio', () => {
    const out = computeTargetDimensions(PHOTO, { kind: 'fit', maxWidth: 1920, maxHeight: 1920 });
    expect(out.width).toBeLessThanOrEqual(1920);
    expect(out.height).toBeLessThanOrEqual(1920);
    expect(out.width / out.height).toBeCloseTo(PHOTO.width / PHOTO.height, 2);
    expect(out).toEqual(dim(1920, 1440));
  });

  it('kind: maxDimension bounds the longest edge', () => {
    expect(computeTargetDimensions(PHOTO, { kind: 'maxDimension', max: 2016 })).toEqual(
      dim(2016, 1512),
    );
    // Portrait source: the longest edge is the height.
    expect(computeTargetDimensions(dim(3024, 4032), { kind: 'maxDimension', max: 2016 })).toEqual(
      dim(1512, 2016),
    );
  });

  it('never upscales for fit or maxDimension', () => {
    const small = dim(320, 240);
    expect(computeTargetDimensions(small, { kind: 'fit', maxWidth: 4000, maxHeight: 4000 })).toEqual(
      small,
    );
    expect(computeTargetDimensions(small, { kind: 'maxDimension', max: 4000 })).toEqual(small);
    expect(computeTargetDimensions(small, { kind: 'scale', factor: 4 })).toEqual(small);
  });

  it('never returns a zero or negative axis', () => {
    for (const spec of [
      { kind: 'scale', factor: 0 },
      { kind: 'scale', factor: -1 },
      { kind: 'exact', width: 0, height: 0 },
      { kind: 'fit', maxWidth: 0, maxHeight: 0 },
      { kind: 'maxDimension', max: 0 },
    ] as const) {
      const out = computeTargetDimensions(PHOTO, spec);
      expect(out.width).toBeGreaterThanOrEqual(1);
      expect(out.height).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns whole pixels', () => {
    const out = computeTargetDimensions(dim(1001, 667), { kind: 'scale', factor: 0.333 });
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});

describe('planDownscaleSteps', () => {
  it('returns no steps when the sizes already match', () => {
    expect(planDownscaleSteps(PHOTO, PHOTO)).toEqual([]);
  });

  it('always ends exactly at the requested size', () => {
    for (const to of [dim(2016, 1512), dim(400, 300), dim(64, 48), dim(1, 1)]) {
      const steps = planDownscaleSteps(PHOTO, to);
      expect(steps[steps.length - 1]).toEqual(to);
    }
  });

  it('NEVER reduces either axis by more than 2x in one step', () => {
    const sources = [PHOTO, dim(8000, 6000), dim(1920, 1080), dim(5000, 200)];
    const targets = [dim(1, 1), dim(16, 16), dim(64, 48), dim(320, 240), dim(1600, 1200)];

    for (const from of sources) {
      for (const to of targets) {
        const steps = planDownscaleSteps(from, to);
        let current = from;
        for (const step of steps) {
          expect(step.width).toBeGreaterThanOrEqual(current.width / 2);
          expect(step.height).toBeGreaterThanOrEqual(current.height / 2);
          current = step;
        }
      }
    }
  });

  it('uses a single step when the reduction is under 2x', () => {
    expect(planDownscaleSteps(PHOTO, dim(3000, 2250))).toEqual([dim(3000, 2250)]);
  });

  it('uses several halving steps for a large reduction', () => {
    const steps = planDownscaleSteps(PHOTO, dim(126, 95));
    expect(steps.length).toBeGreaterThan(3);
    expect(steps[steps.length - 1]).toEqual(dim(126, 95));
  });

  it('handles an upscale request as a single step', () => {
    expect(planDownscaleSteps(dim(320, 240), dim(1920, 1080))).toEqual([dim(1920, 1080)]);
  });

  it('terminates on extreme ratios', () => {
    const steps = planDownscaleSteps(dim(30000, 30000), dim(1, 1));
    expect(steps.length).toBeLessThan(64);
    expect(steps[steps.length - 1]).toEqual(dim(1, 1));
  });
});

describe('vector sizing (SVG rasterisation targets)', () => {
  it('reads intrinsic size from the viewBox first', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="20" height="10"/>';
    // viewBox wins: width/height may be a CSS size in any unit, while the
    // viewBox is always the true coordinate space.
    expect(readSvgSize(svg)).toEqual(dim(200, 100));
  });

  it('falls back to width/height when there is no viewBox', () => {
    expect(readSvgSize('<svg width="64" height="32"></svg>')).toEqual(dim(64, 32));
    expect(readSvgSize("<svg width='128' height='256'></svg>")).toEqual(dim(128, 256));
  });

  it('falls back to a square default when a vector declares no size at all', () => {
    // A vector with no intrinsic size could be rendered at any scale; guessing
    // small would produce a blurry raster of something infinitely sharp.
    for (const svg of ['<svg></svg>', '<svg viewBox="0 0 0 0"></svg>', 'not svg']) {
      expect(readSvgSize(svg)).toEqual(dim(DEFAULT_RASTER_SIZE, DEFAULT_RASTER_SIZE));
    }
  });

  it('handles a negative-origin viewBox', () => {
    expect(readSvgSize('<svg viewBox="-50 -25 300 150"></svg>')).toEqual(dim(300, 150));
  });

  it('scales the longest edge to the target, preserving aspect ratio', () => {
    expect(computeRasterSize(dim(200, 100))).toEqual(dim(DEFAULT_RASTER_SIZE, DEFAULT_RASTER_SIZE / 2));
    expect(computeRasterSize(dim(100, 200))).toEqual(dim(DEFAULT_RASTER_SIZE / 2, DEFAULT_RASTER_SIZE));
    expect(computeRasterSize(dim(50, 200), 400)).toEqual(dim(100, 400));
    expect(computeRasterSize(dim(64, 64), 256)).toEqual(dim(256, 256));
  });

  it('never returns a zero axis for an extreme aspect ratio', () => {
    const out = computeRasterSize(dim(10000, 1), 1024);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it('avoids a division by zero for a zero-area intrinsic size', () => {
    // longest === 0 -> scale defaults to 1 rather than dividing by zero, and
    // the 1-pixel floor still applies, so this is never a zero-size raster.
    expect(computeRasterSize(dim(0, 0))).toEqual(dim(1, 1));
  });
});
