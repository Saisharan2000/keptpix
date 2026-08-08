/**
 * src/workers/protocol.ts
 *
 * Contract: docs/06-contracts.md §2, verbatim.
 *
 * Four hard rules live with these types:
 *  1. ProcessRequest.bytes MUST be in the Comlink transfer list.
 *  2. ImageBitmap never crosses back to the main thread.
 *  3. onProgress must be wrapped in Comlink.proxy() at the call site.
 *  4. Every method must be safe to call concurrently with cancel().
 */
import type { PdfLayoutOptions } from '../core/pdf/layout';
import type { PdfSourceImage, PreparedPdfImage } from '../core/pdf/types';
import type { PdfProbe } from '../engines/pdf/document';
import type {
  DeviceProfile,
  EncoderId,
  ImageMetadata,
  InputFormat,
  JobConfig,
  JobError,
  OutputFormat,
} from '../core/types';

export interface WorkerApi {
  /** Called once per worker at pool startup. */
  configure(profile: DeviceProfile): Promise<void>;

  /** Probe a file's dimensions + metadata without a full decode. */
  probe(bytes: ArrayBuffer, format: InputFormat): Promise<ProbeResult>;

  /** The main pipeline entry point. */
  process(
    req: ProcessRequest,
    onProgress: (p: JobProgressEvent) => void, // Comlink.proxy()
  ): Promise<ProcessResponse>;

  /**
   * Prepare one image for embedding in a PDF (docs/06 §2.1, docs/12 D-75).
   *
   * Separate from `process` because the shape differs: images-to-pdf is N
   * files in and ONE file out, where `process` is one-to-one. Splitting it
   * per-image is what lets the pool parallelise the batch and keeps a single
   * bad file from taking the document down with it.
   *
   * The returned `bytes` must be in the transfer list — for the passthrough
   * case they ARE the input buffer.
   */
  prepareForPdf(source: PdfSourceImage): Promise<PreparedPdfImage>;

  /**
   * Assemble prepared images into one document.
   *
   * Pure byte work with no decoding, but it runs here rather than on the main
   * thread because concatenating several hundred megabytes is a visible
   * freeze. Every input buffer and the result are transferred, never cloned.
   */
  assemblePdf(
    images: readonly PreparedPdfImage[],
    options: PdfLayoutOptions,
  ): Promise<ArrayBuffer>;

  /**
   * The PDF document operations (docs/06 §2.2, docs/kepttools/03 §2).
   *
   * All four run in the worker because @cantoo/pdf-lib parses and re-serialises
   * the whole document — on a 200-page scan that is seconds of synchronous
   * work, and on the main thread it would freeze the tab (CLAUDE.md
   * non-negotiable 3). The library is dynamically imported inside the engine,
   * so a worker that only ever converts images never downloads it.
   *
   * Every ArrayBuffer in and out is transferred, never cloned.
   */
  probePdf(bytes: ArrayBuffer): Promise<PdfProbe>;

  mergePdfs(sources: readonly ArrayBuffer[]): Promise<ArrayBuffer>;

  /** Each group of page indices becomes its own document. */
  splitPdf(
    bytes: ArrayBuffer,
    groups: readonly (readonly number[])[],
  ): Promise<SerializableSplitPart[]>;

  rotatePdf(
    bytes: ArrayBuffer,
    indices: readonly number[],
    angle: number,
  ): Promise<ArrayBuffer>;

  /** Cooperative cancellation — the pipeline checks between passes. */
  cancel(jobId: string): Promise<void>;

  /** Free codec instances and buffers. Called before termination. */
  teardown(): Promise<void>;
}

/**
 * A split result on its way back across the boundary.
 *
 * `SplitPart` in the engine carries a `Uint8Array`; this carries the underlying
 * `ArrayBuffer` so it can go in a Comlink transfer list rather than being
 * structured-cloned, which for a hundred-page document matters.
 */
export interface SerializableSplitPart {
  readonly indices: readonly number[];
  readonly bytes: ArrayBuffer;
}

export interface ProbeResult {
  width: number;
  height: number;
  metadata: ImageMetadata;
  estimatedDecodedBytes: number; // width * height * 4
}

export interface ProcessRequest {
  jobId: string;
  bytes: ArrayBuffer; // TRANSFERRED, not cloned
  sourceFormat: InputFormat;
  sourceName: string;
  config: JobConfig;
  /**
   * Metadata already extracted on the main thread at ingest time.
   *
   * Added during Milestone 5 (docs/12 D-33). The UI needs it before processing
   * anyway ("show EXIF/GPS presence BEFORE processing"), so parsing it a second
   * time inside the worker was both wasteful and — for HEIC — unreliable.
   */
  sourceMetadata?: ImageMetadata;
}

/** Named JobProgressEvent, not ProgressEvent — the latter shadows a DOM global. */
export type JobProgressEvent =
  | { jobId: string; phase: 'decoding'; progress: number }
  | { jobId: string; phase: 'resizing'; progress: number }
  | {
      jobId: string;
      phase: 'encoding';
      progress: number;
      pass: number;
      maxPasses: number;
      currentBytes: number | null;
    }
  | { jobId: string; phase: 'finalising'; progress: number };

export type ProcessResponse =
  | { ok: true; jobId: string; result: SerializableResult }
  | { ok: false; jobId: string; error: JobError };

/** Blob is structured-cloneable; ImageBitmap is NOT returned to the main thread. */
export interface SerializableResult {
  blob: Blob;
  format: OutputFormat;
  sizeBytes: number;
  width: number;
  height: number;
  qualityUsed: number | null;
  scaleApplied: number;
  encoderUsed: EncoderId;
  durationMs: number;
  passesUsed: number;
  targetMet: boolean | null;
}

/** Neutral metadata, used until exifr lands in Milestone 5. */
export const EMPTY_METADATA: ImageMetadata = {
  hasExif: false,
  hasGps: false,
  orientation: 1,
  colorProfile: null,
  cameraMake: null,
  cameraModel: null,
  dateTaken: null,
  rawTagCount: 0,
};
