/**
 * src/core/metadata.ts
 *
 * EXIF/GPS parsing via exifr. PURE: it takes an ArrayBuffer, never a File and
 * never a URL, so it runs under plain Node (ADR-006) and can be unit-tested
 * without a browser.
 *
 * This doubles as the privacy demonstration (docs/10 M5): showing a user the
 * GPS coordinates already inside their photo is far more convincing than any
 * claim we could write about removing them.
 */
import type { ImageMetadata } from './types';

const blank = (): ImageMetadata => ({
  hasExif: false,
  hasGps: false,
  orientation: 1,
  colorProfile: null,
  cameraMake: null,
  cameraModel: null,
  dateTaken: null,
  rawTagCount: 0,
});

interface RawTags {
  Orientation?: unknown;
  Make?: unknown;
  Model?: unknown;
  DateTimeOriginal?: unknown;
  CreateDate?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  GPSLatitude?: unknown;
  GPSLongitude?: unknown;
  ColorSpace?: unknown;
  [key: string]: unknown;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * exifr TRANSLATES enum values to human-readable strings by default, so
 * Orientation arrives as 'Rotate 90 CW' rather than 6. Number() of that is NaN,
 * which silently fell through to 1 — meaning orientation was ignored on every
 * real photo, the exact defect that turns portrait phone shots sideways.
 *
 * Both forms are accepted so this holds regardless of exifr's options.
 */
const ORIENTATION_LABELS: Record<string, number> = {
  'horizontal (normal)': 1,
  'mirror horizontal': 2,
  'rotate 180': 3,
  'mirror vertical': 4,
  'mirror horizontal and rotate 270 cw': 5,
  'rotate 90 cw': 6,
  'mirror horizontal and rotate 90 cw': 7,
  'rotate 270 cw': 8,
};

/**
 * EXIF orientation is 1-8. Anything unrecognised (including a missing tag)
 * means "upright" — guessing would rotate correctly-oriented photos.
 */
export function normaliseOrientation(value: unknown): number {
  if (typeof value === 'string') {
    const mapped = ORIENTATION_LABELS[value.trim().toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 1;
}

/** True when the orientation tag implies the axes swap. */
export const orientationSwapsAxes = (orientation: number): boolean =>
  orientation >= 5 && orientation <= 8;

export async function extractMetadata(bytes: ArrayBuffer): Promise<ImageMetadata> {
  let tags: RawTags | undefined;
  try {
    // exifr is imported DYNAMICALLY. It is roughly 78 KB raw, and metadata is
    // only needed once a user actually adds a file — pulling it into the
    // hydration bundle pushed the island from 27 KB to 53 KB gz against the
    // 60 KB budget in docs/04 §7. Nothing about first paint needs EXIF.
    const { default: exifr } = await import('exifr');

    // `true` means parse every segment. exifr types the per-block flags as
    // FormatOptions rather than boolean, so the granular form does not compile.
    tags = (await exifr.parse(bytes, true)) as RawTags | undefined;
  } catch {
    // A file with no EXIF at all is the common case, not an error.
    return blank();
  }

  if (tags === undefined || tags === null) return blank();

  const keys = Object.keys(tags);
  const hasGps =
    tags.latitude !== undefined ||
    tags.longitude !== undefined ||
    tags.GPSLatitude !== undefined ||
    tags.GPSLongitude !== undefined;

  const date = tags.DateTimeOriginal ?? tags.CreateDate;
  const dateTaken =
    date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : str(date);

  return {
    hasExif: keys.length > 0,
    hasGps,
    orientation: normaliseOrientation(tags.Orientation),
    colorProfile: str(tags.ColorSpace) ?? (tags.ColorSpace === 1 ? 'sRGB' : null),
    cameraMake: str(tags.Make),
    cameraModel: str(tags.Model),
    dateTaken,
    rawTagCount: keys.length,
  };
}
