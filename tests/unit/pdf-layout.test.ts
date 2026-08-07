/**
 * tests/unit/pdf-layout.test.ts
 *
 * Geometry is where an image-to-PDF tool quietly ruins someone's document:
 * a stretched photo, a cropped edge, a sideways page. All of it is arithmetic,
 * so all of it is checkable here rather than by opening a file and squinting.
 *
 * Two properties matter more than any individual case and are asserted across
 * a matrix at the bottom: the aspect ratio is never altered, and the image
 * never extends outside its page.
 */
import { describe, it, expect } from 'vitest';
import {
  A4_PT,
  FIT_MAX_EDGE_PT,
  LETTER_PT,
  MM_TO_PT,
  layoutPage,
  type PdfLayoutOptions,
} from '../../src/core/pdf/layout';

const FIT: PdfLayoutOptions = { pageSize: 'fit', orientation: 'auto', marginMm: 0 };

const close = (a: number, b: number, tolerance = 0.001): boolean => Math.abs(a - b) < tolerance;

describe('fit — a page shaped exactly like the image', () => {
  it('matches a small image exactly, without blowing it up to fill a page', () => {
    const g = layoutPage({ width: 200, height: 150, orientation: 1 }, FIT);
    expect(g.widthPt).toBe(200);
    expect(g.heightPt).toBe(150);
    expect(g.x).toBe(0);
    expect(g.y).toBe(0);
    expect(g.w).toBe(200);
    expect(g.h).toBe(150);
  });

  it('caps a 12 MP photo at a printable size instead of a 55-inch page', () => {
    const g = layoutPage({ width: 4032, height: 3024, orientation: 1 }, FIT);
    expect(Math.max(g.widthPt, g.heightPt)).toBeCloseTo(FIT_MAX_EDGE_PT, 4);
    // Aspect survives the cap.
    expect(g.widthPt / g.heightPt).toBeCloseTo(4032 / 3024, 6);
    // And it is a size a human would recognise: under 12 inches on the long edge.
    expect(Math.max(g.widthPt, g.heightPt) / 72).toBeLessThan(12);
  });

  it('adds the margin around the image rather than eating into it', () => {
    const g = layoutPage({ width: 200, height: 100, orientation: 1 }, { ...FIT, marginMm: 10 });
    const m = 10 * MM_TO_PT;
    expect(g.widthPt).toBeCloseTo(200 + m * 2, 4);
    expect(g.heightPt).toBeCloseTo(100 + m * 2, 4);
    expect(g.x).toBeCloseTo(m, 4);
    expect(g.y).toBeCloseTo(m, 4);
    expect(g.w).toBeCloseTo(200, 4);
    expect(g.h).toBeCloseTo(100, 4);
  });

  it('turns the paper, not the photo, when an orientation is forced', () => {
    // A landscape image on a forced-portrait fit page: the page becomes
    // portrait and the image is centred in it. The image is never rotated —
    // the user asked about paper, not about their photo.
    const g = layoutPage(
      { width: 400, height: 200, orientation: 1 },
      { pageSize: 'fit', orientation: 'portrait', marginMm: 0 },
    );
    expect(g.heightPt).toBeGreaterThan(g.widthPt);
    expect(g.w / g.h).toBeCloseTo(2, 6);
    expect(g.w).toBeLessThanOrEqual(g.widthPt + 0.001);
  });

  it('leaves an already-correct orientation alone', () => {
    const g = layoutPage(
      { width: 400, height: 200, orientation: 1 },
      { pageSize: 'fit', orientation: 'landscape', marginMm: 0 },
    );
    expect(g.widthPt).toBe(400);
    expect(g.heightPt).toBe(200);
  });
});

describe('fixed page sizes', () => {
  it('uses A4 portrait for a portrait image', () => {
    const g = layoutPage(
      { width: 600, height: 800, orientation: 1 },
      { pageSize: 'a4', orientation: 'auto', marginMm: 0 },
    );
    expect(g.widthPt).toBeCloseTo(A4_PT[0], 4);
    expect(g.heightPt).toBeCloseTo(A4_PT[1], 4);
  });

  it('turns A4 landscape for a landscape image', () => {
    const g = layoutPage(
      { width: 800, height: 600, orientation: 1 },
      { pageSize: 'a4', orientation: 'auto', marginMm: 0 },
    );
    expect(g.widthPt).toBeCloseTo(A4_PT[1], 4);
    expect(g.heightPt).toBeCloseTo(A4_PT[0], 4);
  });

  it('honours a forced orientation over the image shape', () => {
    const g = layoutPage(
      { width: 800, height: 600, orientation: 1 },
      { pageSize: 'a4', orientation: 'portrait', marginMm: 0 },
    );
    expect(g.widthPt).toBeCloseTo(A4_PT[0], 4);
    // Fitted by width, so there is white space above and below — not a crop.
    expect(g.w).toBeCloseTo(A4_PT[0], 4);
    expect(g.h).toBeCloseTo((A4_PT[0] * 600) / 800, 4);
    expect(g.y).toBeGreaterThan(0);
  });

  it('uses US Letter dimensions when asked', () => {
    const g = layoutPage(
      { width: 600, height: 800, orientation: 1 },
      { pageSize: 'letter', orientation: 'auto', marginMm: 0 },
    );
    expect(g.widthPt).toBe(LETTER_PT[0]);
    expect(g.heightPt).toBe(LETTER_PT[1]);
  });

  it('centres the image inside the margins', () => {
    const g = layoutPage(
      { width: 1000, height: 1000, orientation: 1 },
      { pageSize: 'a4', orientation: 'portrait', marginMm: 20 },
    );
    const m = 20 * MM_TO_PT;
    expect(g.x).toBeCloseTo(m, 4);
    expect(g.w).toBeCloseTo(A4_PT[0] - m * 2, 4);
    // Square image on portrait paper: equal bands top and bottom.
    expect(g.y - m).toBeCloseTo(A4_PT[1] - m - (g.y + g.h), 4);
  });
});

describe('EXIF orientation changes the shape of the page', () => {
  it('lays out a sideways phone photo as the portrait image it displays as', () => {
    // Stored 4032x3024 (landscape) with orientation 6 displays as 3024x4032.
    const g = layoutPage(
      { width: 4032, height: 3024, orientation: 6 },
      { pageSize: 'a4', orientation: 'auto', marginMm: 0 },
    );
    expect(g.heightPt).toBeGreaterThan(g.widthPt);
    expect(g.widthPt).toBeCloseTo(A4_PT[0], 4);
  });

  it('gives a fit page the displayed aspect, not the stored one', () => {
    const g = layoutPage({ width: 400, height: 200, orientation: 8 }, FIT);
    expect(g.widthPt).toBe(200);
    expect(g.heightPt).toBe(400);
  });

  it('treats orientations 1-4 as leaving the axes alone', () => {
    for (const o of [1, 2, 3, 4]) {
      const g = layoutPage({ width: 400, height: 200, orientation: o }, FIT);
      expect(g.widthPt, `orientation ${o}`).toBe(400);
    }
  });
});

describe('degenerate input never produces a broken page', () => {
  it('clamps a margin larger than the page rather than inverting the box', () => {
    const g = layoutPage(
      { width: 100, height: 100, orientation: 1 },
      { pageSize: 'a4', orientation: 'portrait', marginMm: 500 },
    );
    expect(g.w).toBeGreaterThan(0);
    expect(g.h).toBeGreaterThan(0);
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
  });

  it('ignores a negative margin', () => {
    const g = layoutPage({ width: 200, height: 100, orientation: 1 }, { ...FIT, marginMm: -50 });
    expect(g.widthPt).toBe(200);
    expect(g.x).toBe(0);
  });

  it('survives a zero-dimension image without producing NaN', () => {
    const g = layoutPage({ width: 0, height: 0, orientation: 1 }, FIT);
    for (const v of [g.widthPt, g.heightPt, g.x, g.y, g.w, g.h]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(g.w).toBeGreaterThan(0);
  });
});

describe('the two properties that must hold for every combination', () => {
  const sizes = ['fit', 'a4', 'letter'] as const;
  const orientations = ['auto', 'portrait', 'landscape'] as const;
  const margins = [0, 5, 25];
  const images = [
    { width: 4032, height: 3024, orientation: 1 },
    { width: 3024, height: 4032, orientation: 1 },
    { width: 4032, height: 3024, orientation: 6 },
    { width: 1000, height: 1000, orientation: 3 },
    { width: 200, height: 150, orientation: 8 },
    { width: 6000, height: 1000, orientation: 1 },
  ];

  it('never distorts the image', () => {
    for (const image of images) {
      const swapped = image.orientation >= 5 && image.orientation <= 8;
      const displayW = swapped ? image.height : image.width;
      const displayH = swapped ? image.width : image.height;
      const wanted = displayW / displayH;

      for (const pageSize of sizes) {
        for (const orientation of orientations) {
          for (const marginMm of margins) {
            const g = layoutPage(image, { pageSize, orientation, marginMm });
            const got = g.w / g.h;
            expect(
              close(got, wanted, 0.0001),
              `${pageSize}/${orientation}/${marginMm}mm on ${image.width}x${image.height}@${image.orientation}: aspect ${got} != ${wanted}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('never places the image outside its page', () => {
    for (const image of images) {
      for (const pageSize of sizes) {
        for (const orientation of orientations) {
          for (const marginMm of margins) {
            const g = layoutPage(image, { pageSize, orientation, marginMm });
            const label = `${pageSize}/${orientation}/${marginMm}mm`;
            expect(g.x, label).toBeGreaterThanOrEqual(-0.001);
            expect(g.y, label).toBeGreaterThanOrEqual(-0.001);
            expect(g.x + g.w, label).toBeLessThanOrEqual(g.widthPt + 0.001);
            expect(g.y + g.h, label).toBeLessThanOrEqual(g.heightPt + 0.001);
            expect(g.w, label).toBeGreaterThan(0);
            expect(g.h, label).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});
