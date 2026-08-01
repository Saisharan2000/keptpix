/**
 * Milestone 5 acceptance, against REAL iPhone HEIC files.
 *
 * docs/10 M5: "HEIC files from a real iPhone convert correctly, orientation
 * applied", "HEIC→JPG downloads only libheif", and "metadata panel correctly
 * flags GPS-tagged photos".
 *
 * None of that is provable with a synthetic fixture: HEIC cannot be produced in
 * a browser, and a generated image carries no EXIF to get wrong. These files are
 * straight off the device — 12 MP, 81 EXIF tags, Orientation 6, GPS present.
 *
 * This is also the pair that makes /convert/heic-to-jpg honest: docs/09 §3 makes
 * `supported: true` a hard gate, and until this suite passed, that flag rested
 * on wiring rather than on a decode.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fixtureFile as loadFixtureFile, hasFixture } from './fixtures';
import { ingestFiles, QueueController } from '../../src/state/queue';
import { useStore } from '../../src/state/store';
import { joinJobs } from '../../src/state/selectors';
import { extractMetadata } from '../../src/core/metadata';
import { detectFormat } from '../../src/core/detect';

/** Stored 4032x3024 landscape with Orientation 6, so upright is portrait. */
const UPRIGHT = { width: 3024, height: 4032 };

/** iOS often supplies no MIME type at all, which is why detection matters. */
const heicFile = (name = 'IMG_4650.HEIC'): Promise<File> =>
  loadFixtureFile('IMG_4650.HEIC', name, '');

/** Git-ignored: real photos carry GPS. See tests/fixtures/images/README.md. */
const available = await hasFixture('IMG_4650.HEIC');

let controller: QueueController;

beforeEach(() => {
  useStore.getState().clearAll();
  controller = new QueueController(useStore);
});

afterEach(async () => {
  await controller.dispose();
  useStore.getState().clearAll();
});

describe.skipIf(!available)('real iPhone HEIC', () => {
  it('is identified from magic bytes, with no MIME type and a misleading name', async () => {
    const bytes = await (await heicFile('photo.jpg')).arrayBuffer();
    // ftyp at offset 4, brand "heic" at offset 8 (docs/06 §3.2).
    expect(detectFormat(new Uint8Array(bytes.slice(0, 1024)))).toBe('heic');
  });

  it('exposes the GPS and camera data the photo is actually carrying', async () => {
    const metadata = await extractMetadata(await (await heicFile()).arrayBuffer());

    // The privacy demonstration: showing someone the location already inside
    // their photo is more convincing than any claim about removing it.
    expect(metadata.hasGps).toBe(true);
    expect(metadata.hasExif).toBe(true);
    expect(metadata.cameraMake).toBe('Apple');
    expect(metadata.cameraModel).toContain('iPhone');
    expect(metadata.dateTaken).not.toBeNull();
    expect(metadata.rawTagCount).toBeGreaterThan(50);

    // Orientation must survive as a NUMBER despite exifr's string labels.
    expect(metadata.orientation).toBe(6);
  });

  it('CONVERTS to JPG through libheif, and strips GPS', async () => {
    const { accepted, rejected } = await ingestFiles([await heicFile()]);
    expect(rejected).toHaveLength(0);
    expect(accepted[0]?.detectedFormat).toBe('heic');

    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'jpeg',
      sizeMode: { kind: 'quality', quality: 85 },
      resize: { kind: 'none' },
    });

    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status, JSON.stringify(view?.job.error)).toBe('done');

    const result = view?.job.result;
    expect(result).toBeTruthy();
    if (result === undefined || result === null) return;

    expect(result.format).toBe('jpeg');
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.sizeBytes).toBeGreaterThan(0);

    // Upright, and the reported dimensions match the real pixels.
    expect(result.dimensions).toEqual(UPRIGHT);
    const bitmap = await createImageBitmap(result.blob);
    try {
      expect(bitmap.width).toBe(result.dimensions.width);
      expect(bitmap.height).toBe(result.dimensions.height);
      expect(bitmap.width * bitmap.height).toBe(UPRIGHT.width * UPRIGHT.height);
    } finally {
      bitmap.close();
    }

    // And the location is GONE — the product's actual promise.
    const outMeta = await extractMetadata(await result.blob.arrayBuffer());
    expect(outMeta.hasGps).toBe(false);
    expect(outMeta.cameraMake).toBeNull();
    expect(outMeta.cameraModel).toBeNull();
  }, 120_000);

  it('applies EXIF orientation — a portrait HEIC stays portrait', async () => {
    // docs/12 D-34. libheif honours the HEIF container's own rotation, so the
    // pixels arrive upright; the pipeline must NOT rotate them again.
    const { accepted } = await ingestFiles([await heicFile()]);
    useStore.getState().addSources(accepted);
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.result?.dimensions).toEqual(UPRIGHT);

    const bitmap = await createImageBitmap(view!.job.result!.blob);
    try {
      expect(bitmap.height).toBeGreaterThan(bitmap.width);
    } finally {
      bitmap.close();
    }
  }, 120_000);

  it('hits an exact target size from a real 12 MP HEIC', async () => {
    const { accepted } = await ingestFiles([await heicFile()]);
    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'jpeg',
      sizeMode: { kind: 'target', targetBytes: 100_000 },
    });

    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status).toBe('done');
    expect(view?.job.result?.sizeBytes).toBeLessThanOrEqual(100_000);
    expect(view?.job.result?.targetMet).toBe(true);
    expect(view?.job.passesUsed).toBeLessThanOrEqual(8);
  }, 120_000);
});
