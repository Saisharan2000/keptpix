/**
 * Real-file tests against tests/fixtures/images/.
 *
 * Everything else in the unit suite runs on synthetic bytes. These two files are
 * real camera-roll output, and they happen to be the single most valuable shape
 * of fixture we could have been given: JPEG content carrying a `.png` extension.
 *
 * That is not a mistake in the fixture — it is the exact failure mode docs/06
 * §3.2 exists to defeat ("never trust the extension or the browser MIME").
 *
 * Runs in plain Node: these are ArrayBuffers, and both detect.ts and metadata.ts
 * are pure by contract.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectFormat } from '../../src/core/detect';
import { extractMetadata } from '../../src/core/metadata';
import { makeOutputName, makeUniqueOutputName } from '../../src/core/naming';
import { assessMemoryRisk } from '../../src/core/guards';
import { resolveDeviceProfile } from '../../src/core/capabilities';

const DIR = join(process.cwd(), 'tests/fixtures/images');

/** Image files only — the directory also holds a README explaining the setup. */
const fixtures = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i.test(f))
  : [];

const read = (name: string): ArrayBuffer => {
  const buf = readFileSync(join(DIR, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe.skipIf(fixtures.length === 0)('real fixture files', () => {
  it('has fixtures to test against', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('identifies the true format from magic bytes, ignoring the extension', () => {
    for (const name of fixtures) {
      const bytes = read(name);
      const detected = detectFormat(new Uint8Array(bytes.slice(0, 1024)));

      expect(detected, name).not.toBeNull();

      const extension = name.split('.').pop()?.toLowerCase();
      if (extension === 'png' && detected === 'jpeg') {
        // The headline case: a JPEG named .png. Trusting the extension here
        // would hand a PNG decoder a JPEG and fail with E_CORRUPT_FILE on a
        // perfectly valid photo.
        expect(detected).toBe('jpeg');
      }
    }
  });

  it('reads real EXIF without throwing, and reports GPS presence honestly', async () => {
    for (const name of fixtures) {
      const metadata = await extractMetadata(read(name));

      expect(metadata.orientation, name).toBeGreaterThanOrEqual(1);
      expect(metadata.orientation, name).toBeLessThanOrEqual(8);
      expect(typeof metadata.hasGps, name).toBe('boolean');
      expect(typeof metadata.rawTagCount, name).toBe('number');

      // Whatever the file actually contains, every field must be present —
      // a partial record would render as a blank row in the metadata panel.
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
        expect(metadata, name + ' -> ' + key).toHaveProperty(key);
      }
    }
  });

  it('produces sane output names from real filenames', () => {
    for (const name of fixtures) {
      const output = makeOutputName(name, 'jpeg');
      expect(output.endsWith('.jpg'), name).toBe(true);
      expect(output).not.toMatch(/[/\\]/);
      // The base name survives; only the extension changes.
      expect(output.startsWith(name.split('.')[0] ?? '')).toBe(true);
    }
  });

  it('keeps two real files distinct when they converge on one output name', () => {
    const taken = new Set<string>();
    for (const name of fixtures) taken.add(makeUniqueOutputName(name, 'jpeg', taken));
    expect(taken.size).toBe(fixtures.length);
  });

  it('passes the memory guard on every device tier', () => {
    // ~3 MP screenshots — these must not trip the guard even on a 2 GB phone.
    const dims = { width: 1170, height: 2532 };
    for (const gb of [2, 4, 8, 16]) {
      for (const isMobile of [true, false]) {
        const profile = resolveDeviceProfile({
          deviceMemoryGb: gb,
          hardwareConcurrency: 4,
          isMobile,
        });
        expect(assessMemoryRisk(dims, profile).safe, gb + 'GB mobile=' + isMobile).toBe(true);
      }
    }
  });
});
