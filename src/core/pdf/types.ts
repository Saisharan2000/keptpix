/**
 * src/core/pdf/types.ts
 *
 * The shapes that cross the worker boundary for images-to-pdf.
 *
 * They live in core/ rather than in the engine because docs/05 §1 makes
 * core/types.ts the single source of truth and forbids parallel shapes: the
 * worker protocol, the engine and the store all name these, and a protocol
 * that imports its own vocabulary from an engine has the dependency backwards.
 *
 * Both carry `ArrayBuffer` rather than `Uint8Array` so they can go in a Comlink
 * transfer list — CLAUDE.md: transfer, never clone.
 */
import type { InputFormat } from '../types';
import type { PdfColorSpace } from './writer';

/** One source file on its way in, with the metadata ingest already read. */
export interface PdfSourceImage {
  readonly bytes: ArrayBuffer;
  readonly format: InputFormat;
  /** EXIF orientation 1-8, read on the main thread (docs/12 D-33). */
  readonly orientation: number;
}

/**
 * An image ready to be written into a document as a `/DCTDecode` stream.
 *
 * `reencoded: false` means these are the ORIGINAL file's bytes, untouched —
 * the case worth optimising for, and the reason this tool loses no quality on
 * the JPEGs most people feed it.
 */
export interface PreparedPdfImage {
  readonly bytes: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: PdfColorSpace;
  readonly bitsPerComponent: number;
  /** Applied through the placement matrix, so it survives passthrough. */
  readonly orientation: number;
  readonly reencoded: boolean;
}
