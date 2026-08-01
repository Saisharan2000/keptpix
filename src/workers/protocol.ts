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

  /** Cooperative cancellation — the pipeline checks between passes. */
  cancel(jobId: string): Promise<void>;

  /** Free codec instances and buffers. Called before termination. */
  teardown(): Promise<void>;
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
