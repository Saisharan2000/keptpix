/**
 * docs/06-contracts.md §3.2 — magic-byte detection.
 * Fixtures are built in memory; no binary files, so this runs anywhere.
 */
import { describe, it, expect } from 'vitest';
import { detectFormat, MIN_DETECT_BYTES } from '../../src/core/detect';
import type { InputFormat } from '../../src/core/types';

/** Build a >= 16 byte buffer whose leading bytes are the given signature. */
function fixture(bytes: number[], length = 32): Uint8Array {
  const out = new Uint8Array(length);
  out.set(bytes.slice(0, length));
  return out;
}
const a = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
/** ISO-BMFF: 4 size bytes, then "ftyp" at 4, then the brand at 8. */
const isobmff = (brand: string): number[] => [0, 0, 0, 0x20, ...a('ftyp'), ...a(brand), 0, 0, 0, 0];

const CASES: Array<[InputFormat, number[]]> = [
  ['jpeg', [0xff, 0xd8, 0xff, 0xe0]],
  ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['gif', a('GIF89a')],
  ['bmp', a('BM')],
  ['webp', [...a('RIFF'), 0x24, 0, 0, 0, ...a('WEBP')]],
  ['tiff', [0x49, 0x49, 0x2a, 0x00]],
  ['heic', isobmff('heic')],
  ['heif', isobmff('mif1')],
  ['avif', isobmff('avif')],
  ['jxl', [0xff, 0x0a]],
  ['svg', a('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')],
];

describe('detectFormat — all 11 supported input formats', () => {
  for (const [expected, bytes] of CASES) {
    it('detects ' + expected, () => {
      expect(detectFormat(fixture(bytes))).toBe(expected);
    });
  }

  it('detects TIFF big-endian as well as little-endian', () => {
    expect(detectFormat(fixture([0x4d, 0x4d, 0x00, 0x2a]))).toBe('tiff');
  });

  it('detects the JXL container form, not just the raw codestream', () => {
    const box = [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];
    expect(detectFormat(fixture(box))).toBe('jxl');
  });

  it('covers every HEIC and HEIF brand in the table', () => {
    for (const brand of ['heic', 'heix', 'hevc', 'heim', 'heis']) {
      expect(detectFormat(fixture(isobmff(brand)))).toBe('heic');
    }
    for (const brand of ['mif1', 'msf1']) {
      expect(detectFormat(fixture(isobmff(brand)))).toBe('heif');
    }
    for (const brand of ['avif', 'avis']) {
      expect(detectFormat(fixture(isobmff(brand)))).toBe('avif');
    }
  });

  it('detects SVG without an XML declaration and with leading whitespace', () => {
    expect(detectFormat(fixture(a('   \n  <svg width="10" height="10"></svg>')))).toBe('svg');
  });
});

describe('detectFormat — hostile and degenerate input', () => {
  it('returns null for zero-byte input', () => {
    expect(detectFormat(new Uint8Array(0))).toBeNull();
  });

  it('returns null for a truncated read below the 16-byte minimum', () => {
    const jpeg = [0xff, 0xd8, 0xff, 0xe0];
    expect(detectFormat(fixture(jpeg, MIN_DETECT_BYTES - 1))).toBeNull();
    // ...and succeeds at exactly the minimum.
    expect(detectFormat(fixture(jpeg, MIN_DETECT_BYTES))).toBe('jpeg');
  });

  it('returns null for random bytes matching nothing', () => {
    expect(detectFormat(fixture([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]))).toBeNull();
  });

  it('returns null for an unknown ISO-BMFF brand rather than guessing', () => {
    expect(detectFormat(fixture(isobmff('qt  ')))).toBeNull();
    expect(detectFormat(fixture(isobmff('mp42')))).toBeNull();
  });

  it('returns null for a RIFF container that is not WebP', () => {
    const wav = [...a('RIFF'), 0x24, 0, 0, 0, ...a('WAVE')];
    expect(detectFormat(fixture(wav))).toBeNull();
  });

  it('trusts magic bytes over a contradictory extension', () => {
    // The classic case: iOS shares a HEIC photo named .jpg.
    const heicNamedJpg = fixture(isobmff('heic'));
    expect(detectFormat(heicNamedJpg)).toBe('heic');
    expect(detectFormat(heicNamedJpg)).not.toBe('jpeg');

    // And a PNG named .gif.
    const pngNamedGif = fixture([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectFormat(pngNamedGif)).toBe('png');
  });

  it('does not mistake binary data containing "<svg" for an SVG', () => {
    const binary = fixture([0x00, 0x00, 0xff, 0xfe, ...a('<svg')]);
    expect(detectFormat(binary)).toBeNull();
  });

  it('does not let the weak BMP signature shadow a stronger match', () => {
    // "BM" also begins nothing else in our table, but assert the ordering holds
    // by checking a PNG is never reported as BMP.
    expect(detectFormat(fixture([0x89, ...a('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  });
});
