/**
 * src/core/detect.ts
 *
 * Contract: docs/06-contracts.md §3.2 — the magic-byte table.
 *
 * NEVER trust the file extension or the browser-reported MIME type. Both are
 * routinely wrong: iOS shares HEIC as .jpg, and Windows hands over
 * application/octet-stream for anything it does not recognise.
 */
import type { InputFormat } from './types';

/** docs/06 §3.2: "Requires at least 16 bytes; return null on short reads." */
export const MIN_DETECT_BYTES = 16;

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

function matchesAt(head: Uint8Array, offset: number, sig: readonly number[]): boolean {
  if (offset + sig.length > head.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (head[offset + i] !== sig[i]) return false;
  }
  return true;
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = ascii('GIF8');
const BMP = ascii('BM');
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a];
const FTYP = ascii('ftyp');
const JXL_RAW = [0xff, 0x0a];
const JXL_BOX = [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];

/** ISO-BMFF brands at offset 8. mif1/msf1 are the generic HEIF brands. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const brandAt8 = (head: Uint8Array): string =>
  String.fromCharCode(...head.subarray(8, 12));

/** SVG is text, so it is sniffed rather than matched (docs/06 §3.2). */
function looksLikeSvg(head: Uint8Array): boolean {
  const window = head.subarray(0, Math.min(head.length, 1024));
  let text = '';
  for (const byte of window) {
    // Reject binary early: a NUL byte means this is not an XML document.
    if (byte === 0x00) return false;
    text += String.fromCharCode(byte);
  }
  return text.includes('<svg');
}

/**
 * Identify a format from its leading bytes, or null if nothing matches.
 *
 * Order matters. BMP's signature is only two bytes ("BM") and would otherwise
 * shadow longer, more specific signatures, so the weak ones are tested last.
 */
export function detectFormat(head: Uint8Array): InputFormat | null {
  if (head.length < MIN_DETECT_BYTES) return null;

  if (matchesAt(head, 0, PNG)) return 'png';
  if (matchesAt(head, 0, JXL_BOX)) return 'jxl';
  if (matchesAt(head, 0, JPEG)) return 'jpeg';
  if (matchesAt(head, 0, GIF)) return 'gif';

  if (matchesAt(head, 0, RIFF) && matchesAt(head, 8, WEBP)) return 'webp';

  if (matchesAt(head, 4, FTYP)) {
    const brand = brandAt8(head);
    if (AVIF_BRANDS.has(brand)) return 'avif';
    if (HEIC_BRANDS.has(brand)) return 'heic';
    if (HEIF_BRANDS.has(brand)) return 'heif';
    return null;
  }

  if (matchesAt(head, 0, TIFF_LE) || matchesAt(head, 0, TIFF_BE)) return 'tiff';
  if (matchesAt(head, 0, JXL_RAW)) return 'jxl';
  if (matchesAt(head, 0, BMP)) return 'bmp';

  if (looksLikeSvg(head)) return 'svg';

  return null;
}
