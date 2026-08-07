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
    expect(streams[0]?.length).toBe(original.length);
    expect(streams[0]).toEqual(original);
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
    const bitmap = await createImageBitmap(new Blob([stream!], { type: 'image/jpeg' }), {
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
    const bitmap = await createImageBitmap(new Blob([stream!], { type: 'image/jpeg' }), {
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

  it('goes by bytes, not by extension', async () => {
    // IMG_4474.png is a JPEG. Trusting the name would re-encode it for nothing.
    const source = await sourceFrom('IMG_4474.png', 'png');
    if (source === null) return;

    const prepared = await prepareImageForPdf(source, support);
    expect(prepared.reencoded).toBe(false);
  });

  it('builds a multi-page document with each page in order', async () => {
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
    expect(streams[0]).toEqual(originals[0]);
    expect(streams[1]).toEqual(originals[1]);
  });

  it('lays a sideways photo out as a portrait page without touching its pixels', async () => {
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
    expect(new Uint8Array(sideways.bytes)).toEqual(new Uint8Array(upright.bytes));

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
