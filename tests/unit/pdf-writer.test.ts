/**
 * tests/unit/pdf-writer.test.ts
 *
 * The writer emits a binary format with self-referential byte offsets. Two
 * things can go wrong that no amount of "it produced a file" will catch:
 *
 *   1. An xref offset that does not point at its object. Viewers seek by that
 *      table; a wrong number gives a document that opens blank or not at all.
 *   2. An orientation matrix that maps the image somewhere plausible but wrong
 *      — a photo rendered upside down still renders.
 *
 * So the structural tests parse the output back and verify the offsets against
 * the bytes, and the orientation tests check where the image's corners
 * actually land rather than comparing matrices to hard-coded numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPdf,
  num,
  placementMatrix,
  type PdfImageStream,
  type PdfPage,
} from '../../src/core/pdf/writer';

/** Byte-preserving decode — the output is binary and TextDecoder would mangle it. */
function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function image(overrides: Partial<PdfImageStream> = {}): PdfImageStream {
  return {
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    filter: 'DCTDecode',
    width: 800,
    height: 600,
    colorSpace: 'DeviceRGB',
    bitsPerComponent: 8,
    orientation: 1,
    ...overrides,
  };
}

function page(overrides: Partial<PdfPage> = {}): PdfPage {
  return {
    widthPt: 800,
    heightPt: 600,
    image: image(),
    x: 0,
    y: 0,
    w: 800,
    h: 600,
    ...overrides,
  };
}

describe('num — PDF has no exponent notation', () => {
  it('never emits an exponent, however small the value', () => {
    for (const v of [1e-7, 0.00000012, 1e-21]) {
      expect(num(v)).not.toMatch(/e/i);
    }
  });

  it('trims trailing zeros but keeps significant decimals', () => {
    expect(num(10)).toBe('10');
    expect(num(10.5)).toBe('10.5');
    expect(num(595.2756)).toBe('595.2756');
    expect(num(1.10000)).toBe('1.1');
  });

  it('normalises negative zero, which is valid PDF but reads as a bug', () => {
    expect(num(-0)).toBe('0');
    expect(num(-0.00001)).toBe('0');
  });

  it('survives non-finite input rather than emitting NaN into a content stream', () => {
    expect(num(Number.NaN)).toBe('0');
    expect(num(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('placementMatrix — where each EXIF orientation puts the image', () => {
  const X = 10;
  const Y = 20;
  const W = 100;
  const H = 50;

  /** Applies the cm matrix to stored-image unit coordinates. */
  function apply(
    m: readonly [number, number, number, number, number, number],
    s: number,
    t: number,
  ): [number, number] {
    const [a, b, c, d, e, f] = m;
    return [a * s + c * t + e, b * s + d * t + f];
  }

  const TOP_LEFT: [number, number] = [X, Y + H];
  const TOP_RIGHT: [number, number] = [X + W, Y + H];
  const BOTTOM_LEFT: [number, number] = [X, Y];
  const BOTTOM_RIGHT: [number, number] = [X + W, Y];

  /**
   * EXIF names the location of stored row 0 and column 0 in the CORRECTED
   * image, so stored pixel (0,0) — the top-left of the data — has one right
   * answer per orientation. Checking a second corner pins the full transform:
   * a pure rotation and a rotation-plus-flip agree on one corner and disagree
   * on the next.
   */
  const CASES: Array<{
    orientation: number;
    label: string;
    storedTopLeft: [number, number];
    storedTopRight: [number, number];
  }> = [
    { orientation: 1, label: 'normal', storedTopLeft: TOP_LEFT, storedTopRight: TOP_RIGHT },
    { orientation: 2, label: 'mirror h', storedTopLeft: TOP_RIGHT, storedTopRight: TOP_LEFT },
    { orientation: 3, label: 'rotate 180', storedTopLeft: BOTTOM_RIGHT, storedTopRight: BOTTOM_LEFT },
    { orientation: 4, label: 'mirror v', storedTopLeft: BOTTOM_LEFT, storedTopRight: BOTTOM_RIGHT },
    { orientation: 5, label: 'transpose', storedTopLeft: TOP_LEFT, storedTopRight: BOTTOM_LEFT },
    { orientation: 6, label: 'rotate 90 CW', storedTopLeft: TOP_RIGHT, storedTopRight: BOTTOM_RIGHT },
    { orientation: 7, label: 'transverse', storedTopLeft: BOTTOM_RIGHT, storedTopRight: TOP_RIGHT },
    { orientation: 8, label: 'rotate 90 CCW', storedTopLeft: BOTTOM_LEFT, storedTopRight: TOP_LEFT },
  ];

  for (const { orientation, label, storedTopLeft, storedTopRight } of CASES) {
    it(`orientation ${orientation} (${label}) lands both corners correctly`, () => {
      const m = placementMatrix(orientation, X, Y, W, H);
      // Stored top-left is (s=0, t=1): PDF draws the image's first row at t=1.
      expect(apply(m, 0, 1)).toEqual(storedTopLeft);
      expect(apply(m, 1, 1)).toEqual(storedTopRight);
    });
  }

  it('covers the whole rect and nothing outside it, for every orientation', () => {
    for (let o = 1; o <= 8; o += 1) {
      const m = placementMatrix(o, X, Y, W, H);
      const corners = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      expect(Math.min(...xs)).toBe(X);
      expect(Math.max(...xs)).toBe(X + W);
      expect(Math.min(...ys)).toBe(Y);
      expect(Math.max(...ys)).toBe(Y + H);
    }
  });

  it('treats an out-of-range orientation as normal rather than throwing', () => {
    // Real files carry 0, 9 and other nonsense. A malformed tag must not lose
    // someone their page.
    expect(placementMatrix(0, X, Y, W, H)).toEqual(placementMatrix(1, X, Y, W, H));
    expect(placementMatrix(99, X, Y, W, H)).toEqual(placementMatrix(1, X, Y, W, H));
  });
});

describe('buildPdf — structure', () => {
  it('refuses to build a document with no pages', () => {
    expect(() => buildPdf([])).toThrow(/at least one page/);
  });

  it('writes the header, the binary marker, and EOF', () => {
    const out = buildPdf([page()]);
    const text = latin1(out);
    expect(text.startsWith('%PDF-1.7\n')).toBe(true);
    // The high-byte comment marks the file as binary for anything transferring it.
    expect(out.slice(9, 15)).toEqual(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('every xref offset points at the object it claims', () => {
    const pages = [page(), page({ image: image({ orientation: 6 }) }), page()];
    const out = buildPdf(pages);
    const text = latin1(out);

    // Anchored on the leading newline: `startxref` also ends in "xref", and
    // matching that instead points the whole test at the wrong place.
    const header = /\nxref\n0 (\d+)\n/.exec(text);
    expect(header).not.toBeNull();
    const size = Number(header?.[1]);
    expect(size).toBe(3 + pages.length * 3 + 1);

    // Entries begin after the "xref\n0 N\n" line and are EXACTLY 20 bytes each.
    const entriesStart = (header?.index ?? 0) + (header?.[0].length ?? 0);
    for (let id = 1; id < size; id += 1) {
      const entry = text.slice(entriesStart + id * 20, entriesStart + (id + 1) * 20);
      expect(entry, `entry ${id} is not 20 bytes`).toHaveLength(20);
      expect(entry).toMatch(/^\d{10} 00000 n \n$/);
      const offset = Number(entry.slice(0, 10));
      expect(text.startsWith(`${id} 0 obj\n`, offset), `object ${id} is not at ${offset}`).toBe(
        true,
      );
    }

    // The free entry for object 0 is mandatory and has its own fixed shape.
    expect(text.slice(entriesStart, entriesStart + 20)).toBe('0000000000 65535 f \n');
  });

  it('startxref points at the xref table', () => {
    const out = buildPdf([page(), page()]);
    const text = latin1(out);
    const declared = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.startsWith('xref\n', declared)).toBe(true);
  });

  it('declares a /Length matching each stream body exactly', () => {
    const bytes = new Uint8Array(1024).fill(0x41);
    const out = buildPdf([page({ image: image({ bytes }) })]);
    const text = latin1(out);

    // The image stream is the last one written; find its dictionary.
    const dictAt = text.indexOf('/Subtype /Image');
    const length = Number(/\/Length (\d+) >>\nstream\n/.exec(text.slice(dictAt))?.[1]);
    expect(length).toBe(bytes.length);

    const streamAt = text.indexOf('stream\n', dictAt) + 'stream\n'.length;
    expect(out.slice(streamAt, streamAt + bytes.length)).toEqual(bytes);
  });

  it('embeds the source bytes verbatim — passthrough is the whole point', () => {
    // A byte run that would be corrupted by any text-mode handling.
    const bytes = new Uint8Array([0xff, 0xd8, 0x00, 0x0a, 0x0d, 0x1a, 0x80, 0xff, 0xd9]);
    const out = buildPdf([page({ image: image({ bytes }) })]);
    expect(latin1(out).includes(latin1(bytes))).toBe(true);
  });

  it('builds one page tree entry per page, in order', () => {
    const out = latin1(buildPdf([page(), page(), page()]));
    expect(out).toContain('/Type /Pages /Count 3 /Kids [4 0 R 7 0 R 10 0 R]');
  });

  it('carries the image dictionary through for both filters and colour spaces', () => {
    const grey = latin1(
      buildPdf([page({ image: image({ colorSpace: 'DeviceGray', filter: 'FlateDecode' }) })]),
    );
    expect(grey).toContain('/ColorSpace /DeviceGray');
    expect(grey).toContain('/Filter /FlateDecode');

    const rgb = latin1(buildPdf([page()]));
    expect(rgb).toContain('/ColorSpace /DeviceRGB');
    expect(rgb).toContain('/Filter /DCTDecode');
  });

  it('emits the media box and placement from the page geometry', () => {
    const out = latin1(
      buildPdf([page({ widthPt: 595.2756, heightPt: 841.8898, x: 10, y: 20, w: 500, h: 700 })]),
    );
    expect(out).toContain('/MediaBox [0 0 595.2756 841.8898]');
    expect(out).toContain('500 0 0 700 10 20 cm');
  });

  it('emits no date, so the output leaks nothing and is byte-deterministic', () => {
    const pages = [page(), page({ image: image({ orientation: 8 }) })];
    const first = buildPdf(pages);
    const second = buildPdf(pages);
    expect(first).toEqual(second);

    const text = latin1(first);
    expect(text).not.toContain('/CreationDate');
    expect(text).not.toContain('/ModDate');
    expect(text).toContain('/Producer (KeptPix)');
  });

  it('escapes the producer string rather than breaking the dictionary', () => {
    const out = latin1(buildPdf([page()], { producer: 'a(b)c\\d' }));
    expect(out).toContain('/Producer (a\\(b\\)c\\\\d)');
  });

  it('gives documents with different content different IDs', () => {
    const idOf = (bytes: Uint8Array): string =>
      /\/ID \[<([0-9a-f]+)>/.exec(latin1(bytes))?.[1] ?? '';
    const a = idOf(buildPdf([page()]));
    const b = idOf(buildPdf([page(), page()]));
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
  });
});
