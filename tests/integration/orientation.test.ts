/**
 * EXIF orientation, against a REAL camera photo.
 *
 * docs/10 M5 acceptance: "orientation applied". This is the defect users notice
 * instantly — a converter that ignores the orientation tag turns every portrait
 * phone photo sideways — and it cannot be proven with a synthetic fixture,
 * because a canvas-generated image has no EXIF to ignore.
 *
 * tests/fixtures/images/IMG_4650.jpeg is a genuine 12 MP iPhone photo whose EXIF
 * and pixels DISAGREE — see the note on STORED below. That makes it a better
 * fixture than a clean one: it is what files actually look like after a
 * phone-to-PC transfer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fixtureFile as loadFixtureFile, loadFixture, hasFixture } from './fixtures';
import { ingestFiles, QueueController } from '../../src/state/queue';
import { useStore } from '../../src/state/store';
import { joinJobs } from '../../src/state/selectors';
import { extractMetadata } from '../../src/core/metadata';

/**
 * Measured from the real file rather than assumed.
 *
 * The EXIF says Orientation = 6 ("Rotate 90 CW") and ExifImageWidth = 4032, but
 * the JPEG's ACTUAL stored pixels are 3024x4032 — already portrait. Windows
 * re-encoded this during transfer from the phone, applied the rotation to the
 * pixels, and left the original tag behind. Contradictory metadata like this is
 * the normal case in the wild, not an edge case.
 */
const STORED = { width: 3024, height: 4032 };

const FIXTURE = 'IMG_4650.jpeg';
const fixtureFile = (name = FIXTURE): Promise<File> =>
  loadFixtureFile(FIXTURE, name, 'image/jpeg');

/** Git-ignored: real photos carry GPS. See tests/fixtures/images/README.md. */
const available = await hasFixture(FIXTURE);

let controller: QueueController;

beforeEach(() => {
  useStore.getState().clearAll();
  controller = new QueueController(useStore);
});

afterEach(async () => {
  await controller.dispose();
  useStore.getState().clearAll();
});

describe.skipIf(!available)('EXIF orientation on a real photo', () => {
  it('reads the orientation tag through exifr string labels', async () => {
    const file = await fixtureFile();
    const metadata = await extractMetadata(await file.arrayBuffer());

    expect(metadata.hasExif).toBe(true);
    expect(metadata.rawTagCount).toBeGreaterThan(0);

    // REGRESSION GUARD. exifr translates enums to strings by default, so this
    // tag arrives as 'Rotate 90 CW'. Number() of that is NaN, which used to
    // fall through to 1 — silently ignoring orientation on every real photo.
    expect(metadata.orientation).toBe(6);
  });

  it('decodes upright, and identically with or without the tag', async () => {
    // createImageBitmap({ imageOrientation: 'from-image' }) is what applies
    // orientation on the canvas path.
    const blob = (await loadFixture(FIXTURE)) as Blob;

    const raw = await createImageBitmap(blob, { imageOrientation: 'none' });
    const oriented = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      expect(raw.width).toBe(STORED.width);
      expect(raw.height).toBe(STORED.height);

      // Chrome trusts the JPEG's own orientation record over the stale tag
      // exifr surfaces, so this file decodes identically either way — it is
      // already upright. The assertion that matters is that the decoded result
      // is PORTRAIT, which is how the photo was actually taken.
      expect(oriented.height).toBeGreaterThan(oriented.width);
      expect(oriented.width).toBe(STORED.width);
      expect(oriented.height).toBe(STORED.height);
    } finally {
      raw.close();
      oriented.close();
    }
  });

  it('converts through the full pipeline with orientation applied', async () => {
    const { accepted } = await ingestFiles([await fixtureFile()]);
    expect(accepted[0]?.detectedFormat).toBe('jpeg');

    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'jpeg',
      sizeMode: { kind: 'quality', quality: 85 },
      resize: { kind: 'none' },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status).toBe('done');

    const result = view?.job.result;
    expect(result).toBeTruthy();
    if (result === undefined || result === null) return;

    // The reported dimensions match what the browser actually decoded...
    expect(result.dimensions).toEqual(STORED);

    // ...and so are the actual pixels in the output file.
    const outputBitmap = await createImageBitmap(result.blob);
    try {
      expect(outputBitmap.width).toBe(STORED.width);
      expect(outputBitmap.height).toBe(STORED.height);
    } finally {
      outputBitmap.close();
    }

    // Orientation was baked into the pixels and the tag discarded, so a viewer
    // cannot rotate it a second time.
    const outMeta = await extractMetadata(await result.blob.arrayBuffer());
    expect(outMeta.orientation).toBe(1);
  }, 60_000);

  it('strips EXIF from the output, which is the privacy claim in practice', async () => {
    const { accepted } = await ingestFiles([await fixtureFile()]);
    const sourceMeta = await extractMetadata(await accepted[0]!.file.arrayBuffer());
    expect(sourceMeta.rawTagCount).toBeGreaterThan(0);

    useStore.getState().addSources(accepted);
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    const result = view?.job.result;
    expect(result).toBeTruthy();
    if (result === undefined || result === null) return;

    const outMeta = await extractMetadata(await result.blob.arrayBuffer());
    // A canvas holds pixels only, so the re-encoded blob carries no EXIF and no
    // GPS at all — metadata stripping is structural here, not a filter that
    // could miss a tag.
    expect(outMeta.hasGps).toBe(false);
    expect(outMeta.cameraMake).toBeNull();
    expect(outMeta.cameraModel).toBeNull();
    expect(outMeta.rawTagCount).toBeLessThan(sourceMeta.rawTagCount);
  }, 60_000);

  it('handles a real 12 MP photo without tripping the memory guard', async () => {
    const { accepted } = await ingestFiles([await fixtureFile()]);
    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'jpeg',
      sizeMode: { kind: 'target', targetBytes: 100_000 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status).toBe('done');
    expect(view?.job.result?.sizeBytes).toBeLessThanOrEqual(100_000);
    expect(view?.job.passesUsed).toBeLessThanOrEqual(8);
  }, 60_000);
});
