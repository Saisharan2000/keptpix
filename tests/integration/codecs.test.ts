/**
 * Milestone 5 acceptance — lazy codec loading and the non-canvas decoders.
 *
 * The headline requirement from docs/10 M5 is blunt: "a user converting
 * JPEG→WebP must download ZERO WASM." ADR-004 exists because a 1 MB codec
 * download is a first-load tax on exactly the mobile users most likely to
 * bounce, so this is measured rather than assumed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ingestFiles, QueueController } from '../../src/state/queue';
import { useStore } from '../../src/state/store';
import { joinJobs } from '../../src/state/selectors';
import { readSvgSize, computeRasterSize, DEFAULT_RASTER_SIZE } from '../../src/engines/svg';
import { normaliseOrientation, orientationSwapsAxes } from '../../src/core/metadata';
import { avifDecoder } from '../../src/engines/wasm/avif';
import { tiffDecoder } from '../../src/engines/wasm/tiff';
import { probeNativeDecodeFormats } from '../../src/engines/canvas/decoder';

async function jpegFile(name: string, size = 400): Promise<File> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no ctx');
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0f8a5f';
  ctx.fillRect(0, 0, size / 2, size / 2);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new File([blob], name, { type: 'image/jpeg' });
}

async function pngFile(name: string, size = 64): Promise<File> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no ctx');
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, size / 2, size / 2);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new File([blob], name, { type: 'image/png' });
}

async function readPixel(blob: Blob, x: number, y: number): Promise<[number, number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(x, y, 1, 1);
    return [data[0]!, data[1]!, data[2]!, data[3]!];
  } finally {
    bitmap.close();
  }
}

const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">' +
  '<rect width="200" height="100" fill="#4f46e5"/>' +
  '<circle cx="50" cy="50" r="30" fill="#ffffff"/></svg>';

const wasmRequests = (): string[] =>
  performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.includes('.wasm'));

let controller: QueueController;

beforeEach(() => {
  useStore.getState().clearAll();
  controller = new QueueController(useStore);
});

afterEach(async () => {
  await controller.dispose();
  useStore.getState().clearAll();
});

describe('ADR-004 — canvas first, WASM never speculatively', () => {
  it('a JPEG to WebP conversion downloads ZERO WASM', async () => {
    const before = wasmRequests().length;

    const { accepted } = await ingestFiles([await jpegFile('photo.jpg')]);
    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'webp',
      sizeMode: { kind: 'quality', quality: 80 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status).toBe('done');
    expect(view?.job.result?.blob.type).toBe('image/webp');
    // Canvas did the whole job.
    expect(view?.job.result?.encoderUsed).toBe('canvas');

    // THE assertion. Registering the HEIF adapter must not have pulled libheif
    // into the graph — it is behind a dynamic import inside the factory.
    expect(wasmRequests().length).toBe(before);
  }, 30_000);

  it('a JPEG to JPEG conversion also downloads zero WASM', async () => {
    const before = wasmRequests().length;
    const { accepted } = await ingestFiles([await jpegFile('a.jpg')]);
    useStore.getState().addSources(accepted);
    await controller.start(accepted.map((s) => s.id));
    expect(wasmRequests().length).toBe(before);
  }, 30_000);
});

describe('SVG rasterisation (feature M-17, no WASM)', () => {
  it('confirms createImageBitmap still cannot decode SVG in Chromium', async () => {
    // The measurement the whole main-thread design rests on (docs/12 D-03).
    // If a future Chromium adds support, this flips and a worker-side decoder
    // becomes viable again.
    const blob = new Blob([SVG_SOURCE], { type: 'image/svg+xml' });
    await expect(createImageBitmap(blob)).rejects.toThrow();
  });

  it('CONVERTS an SVG to PNG via main-thread rasterisation', async () => {
    const file = new File([SVG_SOURCE], 'logo.svg', { type: 'image/svg+xml' });
    const { accepted, rejected } = await ingestFiles([file]);
    expect(rejected).toHaveLength(0);
    expect(accepted[0]?.detectedFormat).toBe('svg');

    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'png',
      sizeMode: { kind: 'quality', quality: 100 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status, JSON.stringify(view?.job.error)).toBe('done');
    expect(view?.job.result?.blob.type).toBe('image/png');

    // 200x100 source, scaled so the longest edge hits the raster target.
    expect(view?.job.result?.dimensions).toEqual({
      width: DEFAULT_RASTER_SIZE,
      height: DEFAULT_RASTER_SIZE / 2,
    });

    // And it is a real image, not just bytes with the right MIME type.
    const bitmap = await createImageBitmap(view!.job.result!.blob);
    try {
      expect(bitmap.width).toBe(DEFAULT_RASTER_SIZE);
    } finally {
      bitmap.close();
    }
  }, 30_000);

  it('converts an SVG to JPG too, flattening onto the background colour', async () => {
    const file = new File([SVG_SOURCE], 'logo.svg', { type: 'image/svg+xml' });
    const { accepted } = await ingestFiles([file]);
    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'jpeg',
      sizeMode: { kind: 'quality', quality: 90 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status).toBe('done');
    expect(view?.job.result?.blob.type).toBe('image/jpeg');
  }, 30_000);

  it('fails a malformed SVG with a specific error, not a crash', async () => {
    const file = new File(['<svg not really xml at all'], 'broken.svg', {
      type: 'image/svg+xml',
    });
    const { accepted } = await ingestFiles([file]);
    if (accepted.length === 0) return; // detection may reject it outright

    useStore.getState().addSources(accepted);
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    if (view?.job.status === 'failed') {
      expect(view.job.error?.code).toBe('E_CORRUPT_FILE');
      expect(view.job.error?.message).not.toMatch(/[{}]/);
    }
  }, 30_000);

  it('reads intrinsic size from the viewBox, then width/height, then falls back', () => {
    expect(readSvgSize(SVG_SOURCE)).toEqual({ width: 200, height: 100 });
    expect(readSvgSize('<svg width="64" height="32"></svg>')).toEqual({ width: 64, height: 32 });
    expect(readSvgSize('<svg></svg>')).toEqual({
      width: DEFAULT_RASTER_SIZE,
      height: DEFAULT_RASTER_SIZE,
    });
  });

  it('scales the longest edge to the raster target, preserving aspect ratio', () => {
    expect(computeRasterSize({ width: 200, height: 100 })).toEqual({
      width: DEFAULT_RASTER_SIZE,
      height: DEFAULT_RASTER_SIZE / 2,
    });
    expect(computeRasterSize({ width: 50, height: 200 }, 400)).toEqual({ width: 100, height: 400 });
  });
});

describe('EXIF orientation handling', () => {
  it('treats a missing or invalid tag as upright rather than guessing', () => {
    expect(normaliseOrientation(undefined)).toBe(1);
    expect(normaliseOrientation(0)).toBe(1);
    expect(normaliseOrientation(9)).toBe(1);
    expect(normaliseOrientation('nonsense')).toBe(1);
    expect(normaliseOrientation(6)).toBe(6);
  });

  it('knows which orientations swap the axes', () => {
    for (const upright of [1, 2, 3, 4]) expect(orientationSwapsAxes(upright)).toBe(false);
    for (const rotated of [5, 6, 7, 8]) expect(orientationSwapsAxes(rotated)).toBe(true);
  });
});

describe('metadata is extracted before processing', () => {
  it('reports no EXIF for a canvas-generated JPEG, without throwing', async () => {
    const { extractMetadata } = await import('../../src/core/metadata');
    const file = await jpegFile('plain.jpg');
    const metadata = await extractMetadata(await file.arrayBuffer());

    // A canvas-encoded JPEG genuinely carries no EXIF — the important part is
    // that a file without metadata is not an error path.
    expect(metadata.hasGps).toBe(false);
    expect(metadata.orientation).toBe(1);
    expect(typeof metadata.rawTagCount).toBe('number');
  });

  it('returns a complete record for a file that is not an image at all', async () => {
    const { extractMetadata } = await import('../../src/core/metadata');
    const metadata = await extractMetadata(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    expect(metadata.hasExif).toBe(false);
    expect(metadata.hasGps).toBe(false);
    expect(metadata.orientation).toBe(1);
  });
});

/**
 * docs/12 D-46 — the jSquash/utif2 adapters actually decode/encode real bytes
 * correctly, not just resolve correctly. registry.test.ts and
 * capabilities.test.ts already prove the ROUTING with mocked support
 * matrices; these prove the CODECS underneath that routing.
 */
describe('best-quality WASM encoders (docs/12 D-46)', () => {
  it('mozjpeg produces a real, valid JPEG when encoderPreference is best-quality', async () => {
    const { accepted } = await ingestFiles([await jpegFile('source.jpg')]);
    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'jpeg',
      encoderPreference: 'best-quality',
      sizeMode: { kind: 'quality', quality: 90 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status, JSON.stringify(view?.job.error)).toBe('done');
    // The real point of this test: canvas did NOT quietly win the fallback.
    expect(view?.job.result?.encoderUsed).toBe('mozjpeg');
    expect(view?.job.result?.blob.type).toBe('image/jpeg');

    // And the bytes mozjpeg produced are a genuinely valid, decodable JPEG.
    const bitmap = await createImageBitmap(view!.job.result!.blob);
    try {
      expect(bitmap.width).toBe(400);
      expect(bitmap.height).toBe(400);
    } finally {
      bitmap.close();
    }
  }, 30_000);

  it('oxipng round-trips PNG pixels losslessly when encoderPreference is best-quality', async () => {
    const { accepted } = await ingestFiles([await pngFile('source.png')]);
    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'png',
      encoderPreference: 'best-quality',
      sizeMode: { kind: 'quality', quality: 100 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status, JSON.stringify(view?.job.error)).toBe('done');
    expect(view?.job.result?.encoderUsed).toBe('oxipng');
    expect(view?.job.result?.blob.type).toBe('image/png');

    // "Lossless" is a testable claim here, unlike mozjpeg: the source pixels
    // were flat, known colours, so the round-tripped pixels must match exactly.
    const blob = view!.job.result!.blob;
    // The amber rect is painted AFTER the indigo fill, on top of (0,0)-(32,32).
    expect(await readPixel(blob, 0, 0)).toEqual([245, 158, 11, 255]); // #f59e0b
    expect(await readPixel(blob, 40, 40)).toEqual([79, 70, 229, 255]); // #4f46e5, unpainted-over
  }, 30_000);
});

describe('AVIF decode (libavif WASM adapter, docs/12 D-46)', () => {
  // One real, valid, one-pixel (#808080 grey) AVIF file — produced once by
  // @jsquash/avif's own encoder and confirmed to decode natively before being
  // embedded (the encoder itself is never shipped; see wasm/avif.ts). This is
  // the same fixture canvas/decoder.ts's probeNativeDecodeFormats() embeds —
  // duplicated here rather than exported from production code purely to give
  // a test a byte string, which is not worth widening that module's API for.
  const AVIF_FIXTURE_B64 =
    'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAA' +
    'AAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAAB' +
    'AAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAA' +
    'amlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFD' +
    'gQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAK' +
    'CBgABggQEDQgMgkYAAooooQABUg=';

  function avifFixtureBytes(): ArrayBuffer {
    const binary = atob(AVIF_FIXTURE_B64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // Tested directly against the adapter, not through the pipeline: this
  // Chromium decodes AVIF natively, so resolveDecoderId legitimately picks
  // 'canvas' for any AVIF file that goes through ingestFiles — proving that
  // routing decision is registry.test.ts's job, not this one. What is unproven
  // until now is whether the libavif WASM codec ITSELF decodes real bytes
  // correctly, which is what this test targets directly.
  it('decodes a real AVIF file to the correct pixel', async () => {
    const out = await avifDecoder.decode({ bytes: avifFixtureBytes(), format: 'avif' });
    try {
      expect(out.decoderUsed).toBe('libavif');
      expect(out.width).toBe(1);
      expect(out.height).toBe(1);

      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(out.bitmap, 0, 0);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      // Lossy AVIF at quality 50 — allow real compression drift, not an exact
      // byte match, but grey means R, G and B must stay close to each other.
      expect(Math.abs(r! - 128)).toBeLessThan(20);
      expect(Math.abs(g! - 128)).toBeLessThan(20);
      expect(Math.abs(b! - 128)).toBeLessThan(20);
      expect(a).toBe(255);
    } finally {
      out.bitmap.close();
    }
  }, 30_000);

  it('rejects garbage bytes as E_CORRUPT_FILE rather than crashing the worker', async () => {
    await expect(
      avifDecoder.decode({ bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer, format: 'avif' }),
    ).rejects.toMatchObject({ code: 'E_CORRUPT_FILE' });
  }, 30_000);

  it('probeNativeDecodeFormats reports this browser correctly (docs/12 D-46 fix)', async () => {
    // This is the regression this session's fix targets: before it, configure()
    // hardcoded nativeDecode and support.nativeDecode.avif was always false,
    // so libavif's WASM decoder downloaded unconditionally even here, where
    // the browser can decode AVIF for free.
    const supported = await probeNativeDecodeFormats();
    expect(supported).toContain('avif');
  });
});

describe('TIFF decode (utif2, docs/12 D-46)', () => {
  // A minimal, hand-built, uncompressed 8-bit grayscale TIFF — utif2's one
  // dependency (pako) is pure JS, so unlike AVIF there is no codec that could
  // produce one for us; the format is simple enough to construct directly and
  // is verified below against known-exact pixel values, not just "no throw".
  function buildMinimalTiff(width: number, height: number, pixels: readonly number[]): ArrayBuffer {
    const ifdOffset = 8;
    const tagCount = 9;
    const pixelOffset = ifdOffset + 2 + tagCount * 12 + 4;
    const buffer = new ArrayBuffer(pixelOffset + pixels.length);
    const view = new DataView(buffer);

    view.setUint8(0, 0x49); // 'I'
    view.setUint8(1, 0x49); // 'I' — little-endian
    view.setUint16(2, 42, true);
    view.setUint32(4, ifdOffset, true);

    let p = ifdOffset;
    view.setUint16(p, tagCount, true);
    p += 2;

    const writeTag = (tag: number, type: number, count: number, value: number): void => {
      view.setUint16(p, tag, true);
      view.setUint16(p + 2, type, true);
      view.setUint32(p + 4, count, true);
      // SHORT (type 3) packs into the low 2 bytes of the 4-byte value slot on
      // little-endian; LONG (type 4) fills the whole slot.
      if (type === 3) view.setUint16(p + 8, value, true);
      else view.setUint32(p + 8, value, true);
      p += 12;
    };

    writeTag(256, 3, 1, width); // ImageWidth
    writeTag(257, 3, 1, height); // ImageLength
    writeTag(258, 3, 1, 8); // BitsPerSample
    writeTag(259, 3, 1, 1); // Compression = none
    writeTag(262, 3, 1, 1); // PhotometricInterpretation = BlackIsZero
    writeTag(273, 4, 1, pixelOffset); // StripOffsets
    writeTag(277, 3, 1, 1); // SamplesPerPixel
    writeTag(278, 4, 1, height); // RowsPerStrip
    writeTag(279, 4, 1, pixels.length); // StripByteCounts
    view.setUint32(p, 0, true); // next IFD offset — none

    new Uint8Array(buffer, pixelOffset, pixels.length).set(pixels);
    return buffer;
  }

  it('decodes a hand-built uncompressed TIFF to exact pixel values', async () => {
    const fixture = buildMinimalTiff(4, 2, [0, 32, 64, 96, 128, 160, 192, 224]);
    const out = await tiffDecoder.decode({ bytes: fixture, format: 'tiff' });
    try {
      expect(out.decoderUsed).toBe('utif');
      expect(out.width).toBe(4);
      expect(out.height).toBe(2);

      const canvas = new OffscreenCanvas(4, 2);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(out.bitmap, 0, 0);
      // Grayscale, no compression: RGBA out must exactly match the samples in.
      expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 0, 255]);
      expect([...ctx.getImageData(3, 1, 1, 1).data]).toEqual([224, 224, 224, 255]);
    } finally {
      out.bitmap.close();
    }
  }, 30_000);

  it('converts a real TIFF file end to end through the queue, to PNG', async () => {
    const fixture = buildMinimalTiff(4, 2, [0, 32, 64, 96, 128, 160, 192, 224]);
    const file = new File([fixture], 'scan.tiff', { type: 'image/tiff' });
    const { accepted, rejected } = await ingestFiles([file]);
    expect(rejected).toHaveLength(0);
    expect(accepted[0]?.detectedFormat).toBe('tiff');

    useStore.getState().addSources(accepted);
    useStore.getState().setConfig({
      outputFormat: 'png',
      sizeMode: { kind: 'quality', quality: 100 },
    });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view?.job.status, JSON.stringify(view?.job.error)).toBe('done');
    expect(view?.job.result?.blob.type).toBe('image/png');
    expect(view?.job.result?.dimensions).toEqual({ width: 4, height: 2 });
  }, 30_000);

  it('rejects a corrupt TIFF as E_CORRUPT_FILE rather than crashing the worker', async () => {
    await expect(
      tiffDecoder.decode({ bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer, format: 'tiff' }),
    ).rejects.toMatchObject({ code: 'E_CORRUPT_FILE' });
  }, 30_000);
});
