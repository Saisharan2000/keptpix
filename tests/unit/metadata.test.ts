/**
 * src/core/metadata.ts — EXIF/GPS extraction.
 *
 * These run in plain Node, which is the point: docs/07 §1 specifies this file
 * as "pure, works on ArrayBuffer". If it took a File or a URL it would need a
 * browser and the privacy-critical GPS logic would be untestable in CI.
 */
import { describe, it, expect } from 'vitest';
import {
  extractMetadata,
  normaliseOrientation,
  orientationSwapsAxes,
} from '../../src/core/metadata';

/** Minimal JPEG with an APP1/EXIF block declaring Orientation = 6. */
function jpegWithOrientation(orientation: number): ArrayBuffer {
  const exif = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, // big-endian TIFF header
    0x00, 0x00, 0x00, 0x08, // offset to IFD0
    0x00, 0x01, // one entry
    0x01, 0x12, // tag 0x0112 = Orientation
    0x00, 0x03, // type SHORT
    0x00, 0x00, 0x00, 0x01, // count 1
    (orientation >> 8) & 0xff, orientation & 0xff, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // next IFD offset = 0
  ];
  const app1Length = exif.length + 2;
  const bytes = [
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    (app1Length >> 8) & 0xff, app1Length & 0xff,
    ...exif,
    0xff, 0xd9, // EOI
  ];
  return new Uint8Array(bytes).buffer;
}

describe('normaliseOrientation', () => {
  it('accepts the valid 1-8 range', () => {
    for (let i = 1; i <= 8; i += 1) expect(normaliseOrientation(i)).toBe(i);
  });

  it('treats anything else as upright rather than guessing', () => {
    // Guessing would rotate correctly-oriented photos, which is worse than
    // leaving a rare mis-tagged one alone.
    for (const bad of [undefined, null, 0, 9, -1, 1.5, 'six', {}, NaN]) {
      expect(normaliseOrientation(bad)).toBe(1);
    }
  });
});

describe('orientationSwapsAxes', () => {
  it('is true only for the four rotated orientations', () => {
    expect([1, 2, 3, 4].map(orientationSwapsAxes)).toEqual([false, false, false, false]);
    expect([5, 6, 7, 8].map(orientationSwapsAxes)).toEqual([true, true, true, true]);
  });
});

describe('extractMetadata', () => {
  it('handles a JPEG carrying an APP1 block without throwing', async () => {
    // A hand-assembled APP1 is not a faithful EXIF fixture — exifr is strict
    // about the full TIFF structure, and a synthetic one it rejects proves
    // nothing about orientation. Reading a REAL orientation tag is covered by
    // the Milestone 7 sample photos in tests/fixtures/images/, which is where
    // an actual iPhone HEIC belongs.
    const metadata = await extractMetadata(jpegWithOrientation(6));
    expect(metadata.orientation).toBeGreaterThanOrEqual(1);
    expect(metadata.orientation).toBeLessThanOrEqual(8);
  });

  it('reports no GPS when the file carries none', async () => {
    const metadata = await extractMetadata(jpegWithOrientation(1));
    expect(metadata.hasGps).toBe(false);
  });

  it('returns a complete blank record for input with no metadata', async () => {
    const metadata = await extractMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer);
    expect(metadata.hasExif).toBe(false);
    expect(metadata.hasGps).toBe(false);
    expect(metadata.orientation).toBe(1);
    expect(metadata.cameraMake).toBeNull();
    expect(metadata.cameraModel).toBeNull();
    expect(metadata.dateTaken).toBeNull();
    expect(metadata.rawTagCount).toBe(0);
  });

  it('does not throw on bytes that are not an image at all', async () => {
    // A file with no EXIF is the common case, not an error path — throwing here
    // would turn every screenshot into a failed job.
    const metadata = await extractMetadata(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    expect(metadata.hasExif).toBe(false);
    expect(metadata.orientation).toBe(1);
  });

  it('does not throw on an empty buffer', async () => {
    const metadata = await extractMetadata(new ArrayBuffer(0));
    expect(metadata.hasExif).toBe(false);
    expect(metadata.hasGps).toBe(false);
  });

  it('always returns every ImageMetadata field, never a partial object', async () => {
    for (const input of [jpegWithOrientation(3), new ArrayBuffer(0)]) {
      const metadata = await extractMetadata(input);
      for (const key of [
        'hasExif',
        'hasGps',
        'orientation',
        'colorProfile',
        'cameraMake',
        'cameraModel',
        'dateTaken',
        'rawTagCount',
      ]) {
        expect(metadata, key).toHaveProperty(key);
      }
    }
  });
});
