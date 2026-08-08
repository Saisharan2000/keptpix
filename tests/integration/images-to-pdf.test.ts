/**
 * tests/integration/images-to-pdf.test.ts
 *
 * The unit tests prove the writer emits well-formed bytes. They cannot prove
 * the bytes are a document a renderer will accept, because there is no
 * renderer in Node.
 *
 * This runs in a real browser against real photos, and closes that gap without
 * pulling in a PDF library just to check our own work: it extracts each image
 * stream back OUT of the finished document and hands it to `createImageBitmap`.
 * If the browser decodes it at the expected dimensions, the stream is genuinely
 * valid image data placed in a genuinely locatable position — which is the part
 * a hand-written writer can plausibly get wrong.
 *
 * The passthrough assertion is the one with teeth: byte-for-byte identity
 * between the input file and the embedded stream is the whole quality claim.
 */
import { describe, it, expect } from 'vitest';
import { parseJpegFrame } from '../../src/core/pdf/jpeg';
import type { PdfLayoutOptions } from '../../src/core/pdf/layout';
import { assemblePdf, prepareImageForPdf } from '../../src/engines/pdf/images-to-pdf';
import { resolveCodecSupport } from '../../src/core/capabilities';
import type { CodecSupport } from '../../src/core/types';
import { loadFixture } from './fixtures';

const FIT: PdfLayoutOptions = { pageSize: 'fit', orientation: 'auto', marginMm: 0 };

const support: CodecSupport = resolveCodecSupport({
  nativeEncode: ['jpeg', 'png', 'webp'],
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  wasmDecode: [],
});

/**
 * `Uint8Array<ArrayBufferLike>` is not a `BlobPart` under the current lib
 * types, and every array here is a fresh `slice` that owns its buffer.
 */
const asBlob = (bytes: Uint8Array, type: string): Blob => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer as ArrayBuffer], { type });
};

/**
 * Byte equality without vitest's deep-equal.
 *
 * These are 2.6 MB camera photos, and `toEqual` on typed arrays that size took
 * long enough that the multi-page test blew a 15s timeout doing two of them.
 * A loop is orders of magnitude faster and reports the first differing index,
 * which is more useful than a truncated diff of two million bytes.
 */
function expectSameBytes(actual: Uint8Array | undefined, expected: Uint8Array, label: string): void {
  expect(actual, label + ': missing').toBeDefined();
  expect(actual!.length, label + ': length').toBe(expected.length);
  let firstDiff = -1;
  for (let i = 0; i < expected.length; i += 1) {
    if (actual![i] !== expected[i]) {
      firstDiff = i;
      break;
    }
  }
  expect(firstDiff, label + ': first differing byte index').toBe(-1);
}

function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

/**
 * Pulls every image stream out of a finished document by following its own
 * dictionaries — the same route a viewer takes, rather than searching for
 * bytes we happen to know are in there.
 */
function extractImageStreams(pdf: Uint8Array): Uint8Array[] {
  const text = latin1(pdf);
  const streams: Uint8Array[] = [];
  const dict = /\/Subtype \/Image[^>]*?\/Length (\d+) >>\nstream\n/g;

  let match = dict.exec(text);
  while (match !== null) {
    const length = Number(match[1]);
    const start = match.index + match[0].length;
    streams.push(pdf.slice(start, start + length));
    match = dict.exec(text);
  }
  return streams;
}

async function sourceFrom(name: string, format: 'jpeg' | 'heic' | 'png') {
  const blob = await loadFixture(name);
  if (blob === null) return null;
  return { bytes: await blob.arrayBuffer(), format, orientation: 1 } as const;
}

describe('images-to-pdf — against real photos in a real browser', () => {
  it('embeds a baseline JPEG byte-for-byte, with no re-encode', async () => {
    const source = await sourceFrom('IMG_4650.jpeg', 'jpeg');
    if (source === null) return; // fixture absent on a fresh clone

    const original = new Uint8Array(source.bytes.slice(0));
    const prepared = await prepareImageForPdf(source, support);

    expect(prepared.reencoded).toBe(false);
    expect(prepared.colorSpace).toBe('DeviceRGB');

    const pdf = assemblePdf([prepared], FIT);
    const streams = extractImageStreams(pdf);
    expect(streams).toHaveLength(1);

    // The whole claim of the passthrough path, stated as bytes.
    expectSameBytes(streams[0], original, 'embedded stream vs original file');
  });

  it('produces a stream the browser can decode, at the page dimensions', async () => {
    const source = await sourceFrom('IMG_4650.jpeg', 'jpeg');
    if (source === null) return;

    const prepared = await prepareImageForPdf(source, support);
    const pdf = assemblePdf([prepared], FIT);
    const stream = extractImageStreams(pdf)[0];
    expect(stream).toBeDefined();

    // If this decodes, the offset arithmetic and /Length are right AND the
    // payload is real image data — the two failure modes of a hand-written
    // writer, checked by something that is not the writer.
    //
    // Compared as an unordered pair, deliberately.
    //
    // This fixture is a phone photo stored 4032x3024 with EXIF orientation 6.
    // Chromium hands back 3024x4032 — rotated — and passing
    // `imageOrientation: 'none'` does NOT stop it, which was measured here
    // rather than assumed. PDF has no concept of EXIF and needs the STORED
    // dimensions, with the rotation carried by the placement matrix instead
    // (verified separately by the sideways-page test below).
    //
    // So pinning the exact axis would be asserting Chromium's EXIF policy, not
    // our writer, and "fixing" the writer to satisfy it would emit a squashed
    // page. What this test is for is that the stream is real, decodable image
    // data of the right shape at the offset the document claims.
    const bitmap = await createImageBitmap(asBlob(stream!, 'image/jpeg'), {
      imageOrientation: 'none',
    });
    try {
      expect([bitmap.width, bitmap.height].sort()).toEqual(
        [prepared.width, prepared.height].sort(),
      );
    } finally {
      bitmap.close();
    }
  });

  it('re-encodes a HEIC and still writes a decodable page', async () => {
    const source = await sourceFrom('portrait-scrubbed.HEIC', 'heic');
    if (source === null) return;

    let prepared;
    try {
      prepared = await prepareImageForPdf(source, support);
    } catch {
      return; // no HEIC decoder in this engine; heic.test.ts owns that case
    }

    expect(prepared.reencoded).toBe(true);
    // The decoder applied orientation to the pixels, so the matrix must not
    // apply it a second time (docs/12 D-34).
    expect(prepared.orientation).toBe(1);

    const pdf = assemblePdf([prepared], FIT);
    const stream = extractImageStreams(pdf)[0];
    const bitmap = await createImageBitmap(asBlob(stream!, 'image/jpeg'), {
      imageOrientation: 'none',
    });
    try {
      // Re-encoded through canvas, so this one carries no EXIF and the axes
      // are unambiguous.
      expect(bitmap.width).toBe(prepared.width);
      expect(bitmap.height).toBe(prepared.height);
    } finally {
      bitmap.close();
    }
  });

  /**
   * A transparent PNG must land on WHITE, not black.
   *
   * JPEG has no alpha channel, so transparency has to be flattened onto some
   * colour on the way in. Draw onto a default canvas and the transparent
   * pixels come out BLACK — a screenshot with a transparent background becomes
   * a black rectangle with text you cannot read, and it looks deliberate
   * enough that nobody suspects a bug.
   *
   * `canvasEncoder` already gets this right (`{ alpha: false }` plus a white
   * fill). This tool re-encodes on its own canvas, so it has to get it right
   * on its own too — which it did not, until this test said so.
   */
  it('flattens PNG transparency onto white, not black', async () => {
    // Half opaque red, half fully transparent.
    const png = await (async () => {
      const canvas = new OffscreenCanvas(80, 40);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return null;
      ctx.clearRect(0, 0, 80, 40);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 40, 40);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return new Uint8Array(await blob.arrayBuffer());
    })();
    if (png === null) return;

    const prepared = await prepareImageForPdf(
      { bytes: png.buffer.slice(0) as ArrayBuffer, format: 'png', orientation: 1 },
      support,
    );
    expect(prepared.reencoded).toBe(true);

    // Sample the middle of the half that was transparent.
    const bitmap = await createImageBitmap(asBlob(new Uint8Array(prepared.bytes), 'image/jpeg'));
    try {
      const probe = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = probe.getContext('2d');
      expect(ctx).not.toBeNull();
      ctx!.drawImage(bitmap, 0, 0);
      const [r, g, b] = ctx!.getImageData(Math.floor(bitmap.width * 0.75), 20, 1, 1).data;

      // Near-white, allowing for JPEG's own noise around a hard edge.
      expect(r, 'red channel of the transparent region').toBeGreaterThan(230);
      expect(g, 'green channel of the transparent region').toBeGreaterThan(230);
      expect(b, 'blue channel of the transparent region').toBeGreaterThan(230);
    } finally {
      bitmap.close();
    }
  });

  it('goes by bytes, not by extension', async () => {
    // IMG_4474.png is a JPEG. Trusting the name would re-encode it for nothing.
    const source = await sourceFrom('IMG_4474.png', 'png');
    if (source === null) return;

    const prepared = await prepareImageForPdf(source, support);
    expect(prepared.reencoded).toBe(false);
  });

  // Two 2.6 MB photos through the full path, so the default 15s is genuinely
  // tight on a cold worker rather than hiding a performance regression.
  it('builds a multi-page document with each page in order', { timeout: 40_000 }, async () => {
    const a = await sourceFrom('IMG_4650.jpeg', 'jpeg');
    const b = await sourceFrom('IMG_4651.jpeg', 'jpeg');
    if (a === null || b === null) return;

    const originals = [new Uint8Array(a.bytes.slice(0)), new Uint8Array(b.bytes.slice(0))];
    const prepared = [
      await prepareImageForPdf(a, support),
      await prepareImageForPdf(b, support),
    ];

    const pdf = assemblePdf(prepared, FIT);
    const text = latin1(pdf);
    expect(text).toContain('/Type /Pages /Count 2');

    const streams = extractImageStreams(pdf);
    expect(streams).toHaveLength(2);
    expectSameBytes(streams[0], originals[0]!, 'page 1');
    expectSameBytes(streams[1], originals[1]!, 'page 2');
  });

  it('lays a sideways photo out as a portrait page without touching its pixels', { timeout: 40_000 }, async () => {
    const blob = await loadFixture('IMG_4650.jpeg');
    if (blob === null) return;
    const bytes = await blob.arrayBuffer();

    // Same file, declared as shot sideways.
    const upright = await prepareImageForPdf(
      { bytes: bytes.slice(0), format: 'jpeg', orientation: 1 },
      support,
    );
    const sideways = await prepareImageForPdf(
      { bytes: bytes.slice(0), format: 'jpeg', orientation: 6 },
      support,
    );

    // Neither was re-encoded, so the streams are identical...
    expect(sideways.reencoded).toBe(false);
    expectSameBytes(
      new Uint8Array(sideways.bytes),
      new Uint8Array(upright.bytes),
      'same file, different declared orientation',
    );

    // ...but the pages they produce are transposed.
    const uprightPage = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(
      latin1(assemblePdf([upright], FIT)),
    );
    const sidewaysPage = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(
      latin1(assemblePdf([sideways], FIT)),
    );
    expect(uprightPage?.[1]).toBe(sidewaysPage?.[2]);
    expect(uprightPage?.[2]).toBe(sidewaysPage?.[1]);
  });

  it('reads back the dimensions it wrote, for every prepared image', async () => {
    const source = await sourceFrom('IMG_4650.jpeg', 'jpeg');
    if (source === null) return;

    const prepared = await prepareImageForPdf(source, support);
    const frame = parseJpegFrame(new Uint8Array(prepared.bytes));
    expect(frame?.width).toBe(prepared.width);
    expect(frame?.height).toBe(prepared.height);
  });
});
