/**
 * src/state/jobs.slice.ts
 *
 * Owns toJobResult() — docs/05-data-models.md §1 states this is the ONLY place
 * a SerializableResult becomes a JobResult, so the two shapes meet here and
 * nowhere else.
 */
import type {
  Job,
  JobConfig,
  JobError,
  JobResult,
  JobStatus,
  SourceImage,
} from '../core/types';
import { makeUniqueOutputName } from '../core/naming';
import type { SerializableResult } from '../workers/protocol';

/**
 * Maps the worker's SerializableResult onto the main-thread JobResult.
 *
 * `taken` carries the output names already used by this batch so two sources
 * converging on one name cannot silently overwrite each other in the user's
 * downloads folder.
 *
 * NOTE: SerializableResult.passesUsed is written to Job.passesUsed, NOT to
 * JobResult — it describes the work done, not the artifact. The reducer that
 * calls this sets it (docs/05 §1).
 */
export function toJobResult(
  s: SerializableResult,
  source: SourceImage,
  _config: JobConfig,
  taken: ReadonlySet<string> = new Set(),
): JobResult {
  return {
    blob: s.blob,
    format: s.format,
    sizeBytes: s.sizeBytes,
    dimensions: { width: s.width, height: s.height },
    qualityUsed: s.qualityUsed,
    scaleApplied: s.scaleApplied,
    encoderUsed: s.encoderUsed,
    compressionRatio: s.sizeBytes > 0 ? source.sizeBytes / s.sizeBytes : 0,
    durationMs: s.durationMs,
    targetMet: s.targetMet,
    outputName: makeUniqueOutputName(source.name, s.format, taken),
  };
}

export interface JobsSlice {
  sources: Map<string, SourceImage>;
  jobs: Map<string, Job>;
  addSources(sources: SourceImage[]): void;
  removeSource(sourceId: string): void;
  clearAll(): void;
  createJob(sourceId: string, config: JobConfig): Job;
  patchJob(jobId: string, patch: Partial<Job>): void;
  /** Applies the SerializableResult -> JobResult mapping and marks the job done. */
  completeJob(jobId: string, serializable: SerializableResult): void;
  failJob(jobId: string, error: JobError): void;
  resetJobForRetry(jobId: string): void;
}

/** docs/05 §4 invariant 4: status moves one way, except failed -> queued. */
const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(['done', 'failed', 'cancelled']);
export const isTerminal = (status: JobStatus): boolean => TERMINAL.has(status);
