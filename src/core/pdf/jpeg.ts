/**
 * src/core/pdf/jpeg.ts
 *
 * Just enough JPEG parsing to answer one question: can these exact bytes be
 * dropped into a PDF as a `/DCTDecode` stream, unmodified?
 *
 * When the answer is yes, images-to-pdf does no image work at all — no decode,
 * no re-encode, no generational loss, and a 40 MP photo costs a memory copy
 * rather than a rasterise. When the answer is no, the caller re-encodes
 * through the existing canvas encoder and pays for it once.
 *
 * This reads the frame header only. It never touches entropy-coded data, so
 * cost is a few hundred bytes regardless of file size. Pure — ADR-006.
 */

export interface JpegFrameInfo {
  readonly width: number;
  readonly height: number;
  /** Bits per sample. 8 for everything ordinary; 12 exists and PDF hates it. */
  readonly precision: number;
  /** 1 = greyscale, 3 = YCbCr, 4 = CMYK/YCCK. */
  readonly components: number;
  readonly progressive: boolean;
  readonly arithmetic: boolean;
  /** The SOFn marker byte that was found, for diagnostics. */
  readonly frameMarker: number;
}

/**
 * `noUncheckedIndexedAccess` types every `bytes[i]` as possibly undefined.
 * Every read below is already bounds-checked, so this states that rather than
 * scattering non-null assertions — which would also silence a real mistake.
 */
const at = (bytes: Uint8Array, index: number): number => bytes[index] ?? 0;

/** Markers in C0-CF that are NOT start-of-frame. */
const NOT_A_FRAME = new Set([0xc4 /* DHT */, 0xc8 /* JPG */, 0xcc /* DAC */]);

const isFrameMarker = (m: number): boolean => m >= 0xc0 && m <= 0xcf && !NOT_A_FRAME.has(m);

/** SOF2, SOF6, SOF10, SOF14 are the progressive modes. */
const PROGRESSIVE = new Set([0xc2, 0xc6, 0xca, 0xce]);
/** SOF9-SOF11 and SOF13-SOF15 use arithmetic coding rather than Huffman. */
const ARITHMETIC = new Set([0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * Returns the frame header, or null when the bytes are not a JPEG we can
 * describe. Null is not an error — it means "re-encode this one".
 */
export function parseJpegFrame(bytes: Uint8Array): JpegFrameInfo | null {
  if (bytes.length < 4 || at(bytes, 0) !== 0xff || at(bytes, 1) !== 0xd8) return null; // no SOI

  let pos = 2;
  while (pos < bytes.length) {
    // Markers may be preceded by any number of 0xFF fill bytes.
    if (at(bytes, pos) !== 0xff) {
      pos += 1;
      continue;
    }
    while (pos < bytes.length && at(bytes, pos) === 0xff) pos += 1;
    if (pos >= bytes.length) return null;

    const marker = at(bytes, pos);
    pos += 1;

    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) return null; // EOI before any frame header

    if (pos + 1 >= bytes.length) return null;
    const segmentLength = (at(bytes, pos) << 8) | at(bytes, pos + 1);
    if (segmentLength < 2) return null; // malformed

    if (isFrameMarker(marker)) {
      // SOFn payload: length(2) precision(1) height(2) width(2) components(1)
      if (pos + 7 >= bytes.length) return null;
      const precision = at(bytes, pos + 2);
      const height = (at(bytes, pos + 3) << 8) | at(bytes, pos + 4);
      const width = (at(bytes, pos + 5) << 8) | at(bytes, pos + 6);
      const components = at(bytes, pos + 7);

      // A height of 0 is legal in JPEG (defined later by a DNL marker) and
      // useless to us — we need the real number for the page box.
      if (width <= 0 || height <= 0 || components <= 0) return null;

      return {
        width,
        height,
        precision,
        components,
        progressive: PROGRESSIVE.has(marker),
        arithmetic: ARITHMETIC.has(marker),
        frameMarker: marker,
      };
    }

    // Start of scan: entropy data follows and there is no frame header to find.
    if (marker === 0xda) return null;

    pos += segmentLength;
  }
  return null;
}

export interface PassthroughSpec {
  readonly colorSpace: 'DeviceRGB' | 'DeviceGray';
  readonly bitsPerComponent: number;
}

/**
 * Whether a frame may be embedded verbatim, and as what.
 *
 * The bar is deliberately conservative, because the failure mode is silent:
 * a stream a viewer cannot decode renders as a BLANK PAGE, with no error
 * anywhere. Nobody checks every page of a PDF they just made. Re-encoding
 * costs a little quality on a minority of inputs; guessing wrong costs
 * someone their document without telling them.
 *
 * Rejected, and why:
 *   - progressive — PDF's DCTDecode is specified against baseline JPEG. Real
 *     viewers mostly cope, "mostly" is not good enough for a silent failure.
 *   - arithmetic coding — patent-encumbered for decades, so decoder support is
 *     genuinely rare.
 *   - 12-bit — outside what DCTDecode is specified to carry.
 *   - 4 components — CMYK JPEGs written by Adobe are stored INVERTED, which is
 *     only detectable from an APP14 marker, and getting it wrong produces a
 *     photographic negative. Not worth it for how rare they are.
 */
export function passthroughSpec(info: JpegFrameInfo): PassthroughSpec | null {
  if (info.progressive || info.arithmetic) return null;
  if (info.precision !== 8) return null;
  if (info.components === 1) return { colorSpace: 'DeviceGray', bitsPerComponent: 8 };
  if (info.components === 3) return { colorSpace: 'DeviceRGB', bitsPerComponent: 8 };
  return null;
}
