/**
 * src/core/pdf/writer.ts
 *
 * A minimal PDF 1.7 writer that places already-encoded image streams onto
 * pages. Pure TypeScript, no DOM, no dependency — ADR-006 holds, so the whole
 * thing is testable under plain Node.
 *
 * WHY THIS EXISTS RATHER THAN `@cantoo/pdf-lib` (docs/12 D-75)
 *
 * docs/kepttools/03 §2 specifies `@cantoo/pdf-lib` for the PDF engine, and for
 * merge / split / rotate / compress that is correct — those parse an existing
 * document, which is a genuinely hard problem nobody should re-solve.
 *
 * `images-to-pdf` does not parse anything. It WRITES, and what it writes is the
 * simplest document PDF can express: one image per page, no fonts, no
 * transparency, no annotations. The library costs ~130 KB gz to use maybe 3% of
 * its surface. This file is under 300 lines and adds nothing to any bundle
 * beyond itself.
 *
 * THE PART THAT MATTERS MORE THAN THE BYTES: a JPEG is *already* a PDF image
 * stream. `/DCTDecode` takes the raw JPEG bytes verbatim, so a JPEG in becomes
 * the same JPEG in the PDF — no decode, no re-encode, no generational loss, and
 * near-instant for a 40 MP photo. Any route through a general library that
 * rasterises first would be strictly worse output.
 *
 * WHAT THIS DELIBERATELY CANNOT DO: read a PDF, edit one, embed fonts, or draw
 * text. When those are needed, add the library for those tools. This is not a
 * PDF implementation and must never grow into one.
 */

// ─── Public shapes ─────────────────────────────────────────────────────────

/**
 * PDF-native compression filters. Both take bytes we already have:
 * `DCTDecode` is literally a JPEG file, `FlateDecode` is zlib-wrapped raw
 * samples. Neither is computed here — see src/engines/pdf/.
 */
export type PdfFilter = 'DCTDecode' | 'FlateDecode';

export type PdfColorSpace = 'DeviceRGB' | 'DeviceGray';

export interface PdfImageStream {
  /** Stream data exactly as it will be written. Never re-encoded here. */
  readonly bytes: Uint8Array;
  readonly filter: PdfFilter;
  /** Pixel dimensions OF THE STORED DATA, before any orientation correction. */
  readonly width: number;
  readonly height: number;
  readonly colorSpace: PdfColorSpace;
  readonly bitsPerComponent: number;
  /**
   * EXIF orientation 1-8 of the stored data. Applied through the placement
   * matrix rather than by rotating pixels, which keeps `DCTDecode` passthrough
   * lossless even for a sideways phone photo. PDF itself has no concept of
   * EXIF, so an uncorrected orientation would render visibly rotated.
   */
  readonly orientation: number;
}

/** One page: a media box, and one image placed in it. Points throughout. */
export interface PdfPage {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly image: PdfImageStream;
  /** Placement rect, PDF coordinates — origin bottom-left, y grows upward. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PdfDocOptions {
  /**
   * Written to /Producer. No /CreationDate or /ModDate is ever emitted: a
   * timestamp is metadata about the user, and this product strips metadata
   * everywhere else. Omitting them also makes output byte-deterministic, which
   * is what lets the tests assert on whole documents.
   */
  readonly producer?: string;
}

const DEFAULT_PRODUCER = 'KeptPix';

// ─── Number and string formatting ──────────────────────────────────────────

/**
 * PDF has no exponent notation — `1e-7` in a content stream is a syntax error
 * that most viewers swallow by rendering nothing, which is the worst failure
 * mode available. Fixed notation, four decimals, trailing zeros trimmed.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(4);
  const trimmed = fixed.replace(/\.?0+$/, '');
  // `-0` is valid PDF but reads as a bug in test output and diffs.
  return trimmed === '-0' || trimmed === '' ? '0' : trimmed;
}

/** Escapes a PDF literal string: backslash, both parens. */
function pdfString(value: string): string {
  return '(' + value.replace(/[\\()]/g, (c) => '\\' + c) + ')';
}

const encoder = new TextEncoder();
const ascii = (s: string): Uint8Array => encoder.encode(s);

// ─── Orientation → placement matrix ────────────────────────────────────────

/**
 * A PDF image XObject is always drawn into the unit square, with the image's
 * top-left pixel at (0,1). The `cm` matrix maps that square wherever we want,
 * so EXIF correction is just a different mapping — free, and lossless.
 *
 * Returned as PDF `cm` operands [a b c d e f], where
 *   deviceX = a·s + c·t + e
 *   deviceY = b·s + d·t + f
 * for stored-image unit coordinates (s,t).
 *
 * `x, y, w, h` describe the rect the CORRECTED image should occupy; for
 * orientations 5-8 the caller has already swapped w and h (see layout.ts).
 */
export function placementMatrix(
  orientation: number,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2: // mirror horizontal
      return [-w, 0, 0, h, x + w, y];
    case 3: // rotate 180
      return [-w, 0, 0, -h, x + w, y + h];
    case 4: // mirror vertical
      return [w, 0, 0, -h, x, y + h];
    // 5 and 7 are easy to swap by accident. PDF's origin is bottom-left, so
    // the line s = t runs bottom-left to top-right — which is the image's
    // ANTI-diagonal, not its main one. Derived from where EXIF places stored
    // row 0 and column 0, and asserted corner by corner in the unit tests.
    case 5: // transpose (mirror across the main diagonal)
      return [0, -h, -w, 0, x + w, y + h];
    case 6: // rotate 90° clockwise
      return [0, -h, w, 0, x, y + h];
    case 7: // transverse (mirror across the anti-diagonal)
      return [0, h, w, 0, x, y];
    case 8: // rotate 90° counter-clockwise
      return [0, h, -w, 0, x + w, y];
    case 1:
    default:
      return [w, 0, 0, h, x, y];
  }
}

// ─── A deterministic document ID ───────────────────────────────────────────

/**
 * /ID exists so a viewer can tell two revisions of a document apart. It is not
 * security-relevant and is not hashed cryptographically.
 *
 * It is derived from page geometry and stream LENGTHS rather than from the
 * image bytes: hashing 100 MB of photos in JS to produce 16 bytes nobody reads
 * would be a real cost for no gain. Same input, same ID — output stays
 * byte-deterministic.
 */
function documentId(pages: readonly PdfPage[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const mix = (v: number): void => {
    h1 = Math.imul(h1 ^ (v & 0xffff), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (v >>> 16), 0x85ebca6b) >>> 0;
  };
  mix(pages.length);
  for (const p of pages) {
    for (const v of [
      p.widthPt,
      p.heightPt,
      p.x,
      p.y,
      p.w,
      p.h,
      p.image.bytes.length,
      p.image.width,
      p.image.height,
      p.image.orientation,
    ]) {
      mix(Math.round(v * 100));
    }
  }
  const hex = (n: number): string => n.toString(16).padStart(8, '0');
  // 16 bytes, expressed as the 32 hex digits of a PDF hex string.
  return hex(h1) + hex(h2) + hex(Math.imul(h1 ^ h2, 0x27d4eb2d) >>> 0) + hex((h1 + h2) >>> 0);
}

// ─── The writer ────────────────────────────────────────────────────────────

/**
 * Assembles the document. Objects are laid out in a fixed order so byte
 * offsets can be recorded as we go, which is all an xref table is.
 *
 *   1        Catalog
 *   2        Pages
 *   3        Info
 *   4+3i     Page i
 *   5+3i     Page i content stream
 *   6+3i     Page i image XObject
 */
export function buildPdf(pages: readonly PdfPage[], options: PdfDocOptions = {}): Uint8Array {
  if (pages.length === 0) {
    throw new Error('buildPdf: a PDF must have at least one page');
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;
  /** Byte offset of each object, indexed by object number. */
  const offsets: number[] = [];

  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const write = (text: string): void => push(ascii(text));

  const beginObject = (id: number): void => {
    offsets[id] = offset;
    write(id + ' 0 obj\n');
  };
  const endObject = (): void => write('endobj\n');

  const pageId = (i: number): number => 4 + i * 3;
  const contentId = (i: number): number => 5 + i * 3;
  const imageId = (i: number): number => 6 + i * 3;

  // Header. The high-byte comment tells anything transferring this file that
  // it is binary; without it, a naive FTP-style tool may mangle line endings.
  write('%PDF-1.7\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1 — Catalog
  beginObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObject();

  // 2 — Page tree
  beginObject(2);
  const kids = pages.map((_, i) => pageId(i) + ' 0 R').join(' ');
  write('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + kids + '] >>\n');
  endObject();

  // 3 — Info
  beginObject(3);
  write('<< /Producer ' + pdfString(options.producer ?? DEFAULT_PRODUCER) + ' >>\n');
  endObject();

  pages.forEach((page, i) => {
    // Page dictionary
    beginObject(pageId(i));
    write(
      '<< /Type /Page /Parent 2 0 R' +
        ' /MediaBox [0 0 ' +
        num(page.widthPt) +
        ' ' +
        num(page.heightPt) +
        ']' +
        ' /Resources << /XObject << /Im0 ' +
        imageId(i) +
        ' 0 R >> /ProcSet [/PDF /ImageC /ImageB] >>' +
        ' /Contents ' +
        contentId(i) +
        ' 0 R >>\n',
    );
    endObject();

    // Content stream: save state, position the unit square, draw, restore.
    const m = placementMatrix(page.image.orientation, page.x, page.y, page.w, page.h);
    const content = 'q\n' + m.map(num).join(' ') + ' cm\n/Im0 Do\nQ\n';
    const contentBytes = ascii(content);

    beginObject(contentId(i));
    write('<< /Length ' + contentBytes.length + ' >>\nstream\n');
    push(contentBytes);
    write('endstream\n');
    endObject();

    // Image XObject — the source bytes, verbatim.
    const img = page.image;
    beginObject(imageId(i));
    write(
      '<< /Type /XObject /Subtype /Image' +
        ' /Width ' +
        img.width +
        ' /Height ' +
        img.height +
        ' /ColorSpace /' +
        img.colorSpace +
        ' /BitsPerComponent ' +
        img.bitsPerComponent +
        ' /Filter /' +
        img.filter +
        ' /Length ' +
        img.bytes.length +
        ' >>\nstream\n',
    );
    push(img.bytes);
    write('\nendstream\n');
    endObject();
  });

  // Cross-reference table. Every entry is exactly 20 bytes; a viewer seeks by
  // multiplying, so a single byte off here breaks the whole document.
  const objectCount = 3 + pages.length * 3;
  const xrefOffset = offset;
  write('xref\n0 ' + (objectCount + 1) + '\n');
  write('0000000000 65535 f \n');
  for (let id = 1; id <= objectCount; id += 1) {
    write(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
  }

  const id = documentId(pages);
  write(
    'trailer\n<< /Size ' +
      (objectCount + 1) +
      ' /Root 1 0 R /Info 3 0 R /ID [<' +
      id +
      '> <' +
      id +
      '>] >>\n' +
      'startxref\n' +
      xrefOffset +
      '\n%%EOF\n',
  );

  // One allocation rather than repeated concatenation — these documents run to
  // hundreds of megabytes and intermediate copies are what trigger E_OOM.
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}
