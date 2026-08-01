/**
 * src/state/queue.ts — QueueController, feature M-10.
 *
 * Owns scheduling, concurrency, retry and cancellation. docs/10 Milestone 4 is
 * explicit that this must NOT be folded into a component: it is the piece that
 * makes batching work, and a component that unmounts mid-batch would take the
 * scheduler with it.
 *
 * The load-bearing rule, from docs/07 §4: ONE FILE'S FAILURE NEVER ABORTS THE
 * BATCH. Every per-job path below is wrapped so a rejection becomes a flagged
 * file, never a dead queue.
 */
import type { StoreApi } from 'zustand';
import { detectFormat, MIN_DETECT_BYTES } from '../core/detect';
import { filesFromClipboard } from '../platform/clipboard';
import { canRasteriseVectors, rasteriseSvg } from '../platform/raster';
import { createJobError } from '../core/errors';
import { extractMetadata } from '../core/metadata';
import type { ImageMetadata, InputFormat, JobError, SourceImage } from '../core/types';
import { WorkerPool } from '../workers/pool';
import type { JobProgressEvent } from '../workers/protocol';
import type { AppStore } from './store';
import { newId } from './store';

/**
 * Read enough of the head to identify the format from MAGIC BYTES.
 * The extension and the browser-reported MIME are both routinely wrong — iOS
 * shares HEIC named .jpg, and Windows sends application/octet-stream.
 */
export async function detectFileFormat(file: File): Promise<InputFormat | null> {
  const head = await file.slice(0, Math.max(MIN_DETECT_BYTES, 1024)).arrayBuffer();
  return detectFormat(new Uint8Array(head));
}

export interface RejectedFile {
  name: string;
  error: JobError;
}

export interface IngestResult {
  accepted: SourceImage[];
  rejected: RejectedFile[];
}

/**
 * Turn dropped Files into SourceImages. Never copies the bytes into state —
 * SourceImage holds the File handle itself (docs/05 §4 invariant 2).
 */
export async function ingestFiles(files: readonly File[]): Promise<IngestResult> {
  const accepted: SourceImage[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    let detected: InputFormat | null = null;
    try {
      detected = await detectFileFormat(file);
    } catch {
      detected = null;
    }

    if (detected === null) {
      rejected.push({
        name: file.name,
        error: createJobError('E_UNSUPPORTED_FORMAT', {
          params: {
            detected: file.name.split('.').pop()?.toUpperCase() ?? 'unknown',
            supported: 'JPG, PNG, WebP, GIF, BMP',
          },
        }),
      });
      continue;
    }

    // Read EXIF once, here. docs/10 M5 requires showing GPS presence BEFORE
    // processing, and the worker needs the orientation — one parse serves both.
    let metadata: ImageMetadata | null = null;
    try {
      metadata = await extractMetadata(await file.arrayBuffer());
    } catch {
      metadata = null;
    }

    accepted.push({
      id: newId(),
      file,
      name: file.name,
      sizeBytes: file.size,
      detectedFormat: detected,
      declaredMime: file.type,
      dimensions: null,
      metadata,
      addedAt: Date.now(),
    });
  }

  return { accepted, rejected };
}

const isAbort = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { name?: string }).name === 'AbortError';

export class QueueController {
  readonly #store: StoreApi<AppStore>;
  #pool: WorkerPool | null = null;
  #pending: string[] = [];
  #running = new Set<string>();
  #cancelled = new Set<string>();
  #draining = false;

  constructor(store: StoreApi<AppStore>) {
    this.#store = store;
  }

  /** Lazily created so merely loading the island does not spawn workers. */
  #getPool(): WorkerPool {
    if (this.#pool === null) {
      this.#pool = new WorkerPool({ device: this.#store.getState().device });
    }
    return this.#pool;
  }

  get activeCount(): number {
    return this.#running.size;
  }

  /**
   * Queue the given sources, then drain.
   *
   * Reuses an already-queued job for a source rather than creating a second
   * one: ToolShell creates a job the moment a file is added, so the card can
   * render in its 'queued' state instead of the grid reading "Files (0)".
   */
  async start(sourceIds?: readonly string[]): Promise<void> {
    const state = this.#store.getState();
    const ids = sourceIds ?? [...state.sources.keys()];

    const queuedBySource = new Map<string, string>();
    for (const job of state.jobs.values()) {
      if (job.status === 'queued') queuedBySource.set(job.sourceId, job.id);
    }

    for (const sourceId of ids) {
      const existing = queuedBySource.get(sourceId);
      const jobId = existing ?? state.createJob(sourceId, state.configFor(sourceId)).id;
      if (!this.#pending.includes(jobId)) this.#pending.push(jobId);
    }

    state.setView('processing');
    await this.#drain();
    const after = this.#store.getState();
    after.setView('results');
  }

  /**
   * N in flight, where N is the worker count from DeviceProfile (docs/04 §4).
   *
   * The controller — not the pool — decides how many files are READ at once.
   * Firing all 20 File.arrayBuffer() calls up front would hold 20 decoded
   * buffers in memory simultaneously, which is exactly the spike the Milestone
   * 4 acceptance forbids.
   */
  async #drain(): Promise<void> {
    if (this.#draining) return;
    this.#draining = true;
    try {
      const concurrency = Math.max(1, this.#store.getState().device.maxWorkers);
      const lanes = Array.from({ length: concurrency }, () => this.#lane());
      await Promise.all(lanes);
    } finally {
      this.#draining = false;
    }
  }

  async #lane(): Promise<void> {
    for (;;) {
      const jobId = this.#pending.shift();
      if (jobId === undefined) return;
      await this.#runOne(jobId);
    }
  }

  /** Never throws. A rejection here would strand the whole lane. */
  async #runOne(jobId: string): Promise<void> {
    const state = this.#store.getState();
    const job = state.jobs.get(jobId);
    if (job === undefined) return;

    if (this.#cancelled.has(jobId)) {
      state.patchJob(jobId, { status: 'cancelled', finishedAt: Date.now() });
      return;
    }

    const source = state.sources.get(job.sourceId);
    if (source === undefined) return;

    this.#running.add(jobId);
    state.patchJob(jobId, {
      status: 'running',
      phase: 'decoding',
      progress: 0,
      startedAt: Date.now(),
    });

    try {
      // Read fresh from the File every time, so a retry after a transfer has
      // detached the previous buffer still works.
      let bytes = await source.file.arrayBuffer();
      let sourceFormat = source.detectedFormat;

      // Vectors are rasterised HERE, on the main thread, because a worker has
      // no DOM and createImageBitmap cannot decode SVG (docs/12 D-03). What
      // crosses to the worker is an ordinary PNG, so every expensive step —
      // encode, target search, resize — still happens off the main thread.
      if (sourceFormat === 'svg') {
        if (!canRasteriseVectors()) {
          this.#store.getState().failJob(
            jobId,
            createJobError('E_UNSUPPORTED_FORMAT', {
              params: { detected: 'SVG', supported: 'JPG, PNG, WebP, GIF, BMP, HEIC' },
              detail: 'no DOM available to rasterise a vector',
            }),
          );
          return;
        }
        try {
          const raster = await rasteriseSvg(bytes);
          bytes = raster.bytes;
          sourceFormat = 'png';
        } catch (cause) {
          this.#store.getState().failJob(
            jobId,
            createJobError('E_CORRUPT_FILE', {
              detail: cause instanceof Error ? cause.message : String(cause),
            }),
          );
          return;
        }
      }

      const onProgress = (event: JobProgressEvent): void => {
        const current = this.#store.getState().jobs.get(jobId);
        if (current === undefined || current.status !== 'running') return;
        this.#store.getState().patchJob(jobId, {
          phase: event.phase,
          progress: event.progress,
          ...(event.phase === 'encoding' ? { passesUsed: event.pass } : {}),
        });
      };

      const response = await this.#getPool().process(
        {
          jobId,
          bytes,
          sourceFormat,
          sourceName: source.name,
          config: job.config,
          ...(source.metadata !== null ? { sourceMetadata: source.metadata } : {}),
        },
        onProgress,
      );

      if (response.ok) {
        this.#store.getState().completeJob(jobId, response.result);
      } else {
        this.#store.getState().failJob(jobId, response.error);
      }
    } catch (cause) {
      if (isAbort(cause) || this.#cancelled.has(jobId)) {
        this.#store.getState().patchJob(jobId, {
          status: 'cancelled',
          finishedAt: Date.now(),
        });
      } else {
        // A worker crash is recoverable and offers Retry; the batch continues.
        this.#store.getState().failJob(
          jobId,
          createJobError('E_WORKER_CRASHED', {
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
        );
      }
    } finally {
      this.#running.delete(jobId);
    }
  }

  cancel(jobId: string): void {
    this.#cancelled.add(jobId);
    this.#pending = this.#pending.filter((id) => id !== jobId);
    void this.#pool?.cancel(jobId);
  }

  cancelAll(): void {
    for (const id of [...this.#pending, ...this.#running]) this.cancel(id);
  }

  /** docs/05 §4 invariant 4: failed -> queued is the only backwards move. */
  async retry(jobId: string): Promise<void> {
    this.#cancelled.delete(jobId);
    this.#store.getState().resetJobForRetry(jobId);
    this.#pending.push(jobId);
    await this.#drain();
  }

  async dispose(): Promise<void> {
    this.cancelAll();
    await this.#pool?.dispose();
    this.#pool = null;
    this.#pending = [];
    this.#running.clear();
    this.#cancelled.clear();
  }
}

/**
 * Re-exported so components/react can reach it without importing platform/
 * directly, which docs/07 §2 does not permit. The extraction itself stays in
 * platform/clipboard.ts where the tree puts it.
 */
export { filesFromClipboard };
