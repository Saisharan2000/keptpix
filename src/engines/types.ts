/**
 * src/engines/types.ts
 *
 * Contract: docs/06-contracts.md §1, verbatim.
 *
 * Every codec adapter implements one of these. New format support means a NEW
 * ADAPTER — never a conditional branch inside the pipeline (docs/07 §4).
 */
import type { DecoderId, EncoderId, InputFormat, OutputFormat } from '../core/types';

export interface DecodeInput {
  bytes: ArrayBuffer;
  format: InputFormat;
  /** Optional pre-downscale during decode, for memory-constrained devices. */
  maxPixels?: number;
  /**
   * EXIF orientation 1-8, read on the main thread before dispatch.
   *
   * Decoders that apply orientation themselves (canvas, via
   * imageOrientation: 'from-image') ignore this. Decoders that hand back raw
   * pixels (libheif) need it, and must not re-parse EXIF inside the worker to
   * get it — see docs/12 D-33.
   */
  orientation?: number;
}

export interface DecodeOutput {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  hasAlpha: boolean;
  decoderUsed: DecoderId;
}

export interface Decoder {
  readonly id: DecoderId;
  readonly formats: readonly InputFormat[];
  /**
   * True when this decoder already bakes EXIF/container orientation into the
   * pixels it returns, so the pipeline must NOT rotate again.
   *
   * Added after a real iPhone HEIC converted landscape (docs/12 D-34). Both
   * current decoders self-orient — canvas via imageOrientation:'from-image',
   * libheif via the HEIF irot/imir transform properties — and assuming
   * otherwise double-rotated a correct image. Guessing per decoder is exactly
   * how that bug happened, so it is declared rather than inferred.
   */
  readonly appliesOrientation: boolean;
  /** Cheap sync check — must not fetch WASM. */
  canHandle(format: InputFormat): boolean;
  /** Idempotent; loads WASM on first call, no-ops after. */
  init(): Promise<void>;
  decode(input: DecodeInput): Promise<DecodeOutput>;
  dispose(): void;
}

export interface EncodeInput {
  bitmap: ImageBitmap;
  format: OutputFormat;
  quality: number;               // 1-100; ignored when lossless
  lossless?: boolean;
  backgroundColor?: string;      // flatten alpha for JPEG
  effort?: number;               // codec-specific speed/size tradeoff
}

export interface EncodeOutput {
  blob: Blob;
  sizeBytes: number;
  encoderUsed: EncoderId;
}

export interface Encoder {
  readonly id: EncoderId;
  readonly formats: readonly OutputFormat[];
  readonly isNative: boolean;    // true = canvas, no WASM download
  canHandle(format: OutputFormat): boolean;
  init(): Promise<void>;
  encode(input: EncodeInput): Promise<EncodeOutput>;
  dispose(): void;
}

/** MIME types, shared by the canvas decoder and encoder. */
export const INPUT_MIME: Record<InputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  jxl: 'image/jxl',
  svg: 'image/svg+xml',
};

export const OUTPUT_MIME: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
};

/**
 * Formats with no alpha channel — the source must be flattened first.
 * Re-exported from core under the engine-local name so the encoder's call
 * sites read naturally; the single source of truth moved to core in D-122
 * because the config UI needs the same fact and cannot import engines/.
 */
export { OUTPUT_FLATTENS_ALPHA as FLATTENS_ALPHA } from '../core/types';
