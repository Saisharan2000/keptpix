/**
 * tests/unit/pdf-jpeg.test.ts
 *
 * The parser's job is to be RIGHT about when passthrough is safe, and the cost
 * of the two errors is wildly asymmetric:
 *
 *   - a false negative re-encodes a file that did not need it (a little
 *     quality, some time)
 *   - a false positive writes a stream the viewer cannot decode, and the user
 *     gets a blank page with no error anywhere
 *
 * So the rejection cases below matter more than the acceptance ones.
 *
 * Synthetic frame headers are used for the variants — a real 12-bit arithmetic
 * JPEG is hard to come by, and hand-built bytes state the case exactly. One
 * real camera photo from the fixtures anchors it to reality.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseJpegFrame, passthroughSpec } from '../../src/core/pdf/jpeg';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('../fixtures/images/' + name, import.meta.url))));

/** A JFIF APP0 segment, so the tests exercise real segment skipping. */
const APP0 = [
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00,
];

interface FrameOpts {
  marker?: number;
  precision?: number;
  width?: number;
  height?: number;
  components?: number;
  prefix?: number[];
}

/** Builds a JPEG containing nothing but a frame header. */
function jpeg({
  marker = 0xc0,
  precision = 8,
  width = 100,
  height = 50,
  components = 3,
  prefix = APP0,
}: FrameOpts = {}): Uint8Array {
  const segLen = 8 + components * 3;
  const bytes = [
    0xff, 0xd8,
    ...prefix,
    0xff, marker,
    (segLen >> 8) & 0xff, segLen & 0xff,
    precision,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    components,
  ];
  for (let i = 0; i < components; i += 1) bytes.push(i + 1, 0x11, 0x00);
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes);
}

describe('parseJpegFrame — reading the frame header', () => {
  it('reads dimensions from a real camera JPEG', () => {
    const info = parseJpegFrame(fixture('IMG_4650.jpeg'));
    expect(info).not.toBeNull();
    expect(info?.width).toBeGreaterThan(1000);
    expect(info?.height).toBeGreaterThan(1000);
    expect(info?.components).toBe(3);
    expect(info?.precision).toBe(8);
  });

  it('reads a synthetic baseline frame exactly', () => {
    const info = parseJpegFrame(jpeg({ width: 640, height: 480 }));
    expect(info).toMatchObject({
      width: 640,
      height: 480,
      precision: 8,
      components: 3,
      progressive: false,
      arithmetic: false,
      frameMarker: 0xc0,
    });
  });

  it('skips over preceding segments to find the frame', () => {
    // A comment segment between APP0 and SOF0 must not confuse the walk.
    const comment = [0xff, 0xfe, 0x00, 0x05, 0x68, 0x69, 0x21];
    const info = parseJpegFrame(jpeg({ prefix: [...APP0, ...comment] }));
    expect(info?.width).toBe(100);
  });

  it('tolerates fill bytes before a marker', () => {
    const info = parseJpegFrame(jpeg({ prefix: [...APP0, 0xff, 0xff, 0xff] }));
    expect(info?.width).toBe(100);
  });

  it('classifies progressive and arithmetic frames', () => {
    expect(parseJpegFrame(jpeg({ marker: 0xc2 }))?.progressive).toBe(true);
    expect(parseJpegFrame(jpeg({ marker: 0xc9 }))?.arithmetic).toBe(true);
    expect(parseJpegFrame(jpeg({ marker: 0xca }))).toMatchObject({
      progressive: true,
      arithmetic: true,
    });
  });

  it('does not mistake DHT, DAC or JPG for a frame marker', () => {
    // 0xC4/0xC8/0xCC sit inside the C0-CF range but are not start-of-frame;
    // reading one as a frame yields convincing nonsense dimensions.
    for (const marker of [0xc4, 0xc8, 0xcc]) {
      expect(parseJpegFrame(jpeg({ marker })), `marker ${marker.toString(16)}`).toBeNull();
    }
  });
});

describe('parseJpegFrame — input that is not a usable JPEG', () => {
  it('returns null for a real PNG', () => {
    // Built here rather than taken from the fixtures: every `.png` in that
    // folder is deliberately a JPEG with the wrong extension (see its README),
    // which is a fixture for magic-byte detection, not a PNG.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(parseJpegFrame(png)).toBeNull();
  });

  it('returns null for a HEIC', () => {
    expect(parseJpegFrame(fixture('portrait-scrubbed.HEIC'))).toBeNull();
  });

  it('goes by content, not by extension', () => {
    // IMG_4474.png IS a JPEG. Trusting the name would send it down the
    // re-encode path for no reason — the passthrough is decided on bytes.
    const info = parseJpegFrame(fixture('IMG_4474.png'));
    expect(info).not.toBeNull();
    expect(passthroughSpec(info!)).not.toBeNull();
  });

  it('returns null without a SOI marker', () => {
    expect(parseJpegFrame(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('returns null for empty and truncated input', () => {
    expect(parseJpegFrame(new Uint8Array(0))).toBeNull();
    expect(parseJpegFrame(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // SOI plus a frame marker whose payload is cut off mid-header.
    expect(parseJpegFrame(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]))).toBeNull();
  });

  it('returns null when the scan starts before any frame header', () => {
    expect(parseJpegFrame(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0]))).toBeNull();
  });

  it('returns null at end of image with no frame', () => {
    expect(parseJpegFrame(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it('rejects a malformed segment length rather than looping', () => {
    expect(parseJpegFrame(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x00]))).toBeNull();
  });

  it('rejects a zero dimension, which JPEG allows and PDF cannot use', () => {
    // Height 0 is legal — a DNL marker defines it later — and useless here.
    expect(parseJpegFrame(jpeg({ height: 0 }))).toBeNull();
    expect(parseJpegFrame(jpeg({ components: 0 }))).toBeNull();
  });

  it('skips standalone markers that carry no length field', () => {
    // RST markers and TEM would desynchronise the walk if treated as segments.
    const info = parseJpegFrame(jpeg({ prefix: [0xff, 0x01, 0xff, 0xd0, ...APP0] }));
    expect(info?.width).toBe(100);
  });
});

describe('passthroughSpec — when the bytes can go in untouched', () => {
  it('accepts baseline 3-component as DeviceRGB', () => {
    const info = parseJpegFrame(jpeg({ marker: 0xc0 }));
    expect(passthroughSpec(info!)).toEqual({ colorSpace: 'DeviceRGB', bitsPerComponent: 8 });
  });

  it('accepts baseline greyscale as DeviceGray', () => {
    const info = parseJpegFrame(jpeg({ marker: 0xc0, components: 1 }));
    expect(passthroughSpec(info!)).toEqual({ colorSpace: 'DeviceGray', bitsPerComponent: 8 });
  });

  it('accepts extended sequential (SOF1), which is still baseline Huffman', () => {
    const info = parseJpegFrame(jpeg({ marker: 0xc1 }));
    expect(passthroughSpec(info!)).not.toBeNull();
  });

  it('accepts a real camera photo — the case that matters most', () => {
    const info = parseJpegFrame(fixture('IMG_4650.jpeg'));
    expect(passthroughSpec(info!)).toEqual({ colorSpace: 'DeviceRGB', bitsPerComponent: 8 });
  });

  it('refuses progressive, however well viewers usually cope', () => {
    expect(passthroughSpec(parseJpegFrame(jpeg({ marker: 0xc2 }))!)).toBeNull();
  });

  it('refuses arithmetic coding', () => {
    expect(passthroughSpec(parseJpegFrame(jpeg({ marker: 0xc9 }))!)).toBeNull();
  });

  it('refuses 12-bit samples', () => {
    expect(passthroughSpec(parseJpegFrame(jpeg({ precision: 12 }))!)).toBeNull();
  });

  it('refuses CMYK, where guessing the inversion wrong gives a negative', () => {
    expect(passthroughSpec(parseJpegFrame(jpeg({ components: 4 }))!)).toBeNull();
    expect(passthroughSpec(parseJpegFrame(jpeg({ components: 2 }))!)).toBeNull();
  });
});
