/**
 * src/workers/pool.ts
 *
 * Main-thread worker pool. Worker count comes from DeviceProfile per the table
 * in docs/04-architecture.md §4.
 *
 * Workers are LONG-LIVED and reused across jobs: spinning one up per job throws
 * away the WASM instantiation cost that Milestone 5 will start paying.
 */
import * as Comlink from 'comlink';
import type { PdfLayoutOptions } from '../core/pdf/layout';
import type { PdfSourceImage, PreparedPdfImage } from '../core/pdf/types';
import type { CodecSupport, DeviceProfile } from '../core/types';
import {
  resolveCodecSupport,
  resolveDeviceProfile,
  withEncodeBaseline,
  WASM_DECODE_FORMATS,
  type RawDeviceSignals,
} from '../core/capabilities';
import { probeNativeEncodeFormats } from '../engines/canvas/encoder';
import { probeNativeDecodeFormats } from '../engines/canvas/decoder';
import type { PdfProbe } from '../engines/pdf/document';
import type { RasterOptions, RasterPage } from '../engines/pdf/raster';
import type {
  JobProgressEvent,
  ProcessRequest,
  ProcessResponse,
  SerializableSplitPart,
  WorkerApi,
} from './protocol';

/**
 * Read the platform signals. This is the main thread, so browser globals are
 * legal here — core/capabilities.ts turns them into policy (ADR-006).
 */
export function readDeviceSignals(): RawDeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarsePointer =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  return {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    isMobile: coarsePointer,
    hasOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    hasFileSystemAccess: 'showSaveFilePicker' in globalThis,
    hasWebGpu: 'gpu' in navigator,
    hasOpfs: typeof navigator.storage?.getDirectory === 'function',
  };
}

/**
 * The real codec support matrix, for the main thread's OWN use (docs/12
 * D-49): `useStore`'s `codecs` field feeds ConfigPanel's format picker, so a
 * hardcoded baseline there means the UI can offer a format the browser
 * cannot actually produce, or hide one it can. This mirrors exactly what
 * `image.worker.ts`'s `configure()` does inside the worker — both probe the
 * same real browser, once each, for two independent, legitimate reasons: the
 * worker needs it to pick the right adapter, the UI needs it to render the
 * right options.
 *
 * Lives here rather than in state/store.ts because `state/` is not allowed to
 * import `engines/` directly (docs/07 §2's boundary table) — only
 * `workers/pool.ts` may cross both, and `state/` is already granted access to
 * this specific file.
 */
export async function probeCodecSupport(): Promise<CodecSupport> {
  const [nativeEncodeProbe, nativeDecodeProbe] = await Promise.all([
    probeNativeEncodeFormats(),
    probeNativeDecodeFormats(),
  ]);
  return resolveCodecSupport({
    // docs/12 D-55 (WO-2): an engine with no OffscreenCanvas genuinely cannot
    // encode, and the D-10 empty-probe fallback must not claim otherwise.
    nativeEncode: withEncodeBaseline(nativeEncodeProbe, typeof OffscreenCanvas !== 'undefined'),
    nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp', ...nativeDecodeProbe],
    wasmDecode: WASM_DECODE_FORMATS,
  });
}

interface Slot {
  worker: Worker;
  api: Comlink.Remote<WorkerApi>;
  busy: boolean;
  /** A worker that throws twice in a row is replaced (docs/04 §4). */
  consecutiveFailures: number;
}

const MAX_CONSECUTIVE_FAILURES = 2;

export interface PoolOptions {
  device?: DeviceProfile;
  /** Override the worker count; otherwise DeviceProfile.maxWorkers decides. */
  size?: number;
}

export class WorkerPool {
  readonly device: DeviceProfile;
  #slots: Slot[] = [];
  #waiting: Array<(slot: Slot) => void> = [];
  #disposed = false;

  constructor(options: PoolOptions = {}) {
    this.device = options.device ?? resolveDeviceProfile(readDeviceSignals());
    const size = Math.max(1, options.size ?? this.device.maxWorkers);
    for (let i = 0; i < size; i += 1) this.#slots.push(this.#spawn());
  }

  get size(): number {
    return this.#slots.length;
  }

  #spawn(): Slot {
    const worker = new Worker(new URL('./image.worker.ts', import.meta.url), {
      type: 'module',
    });
    const api = Comlink.wrap<WorkerApi>(worker);
    const slot: Slot = { worker, api, busy: false, consecutiveFailures: 0 };
    // Fire-and-forget: configure races nothing, because acquire() only hands
    // out a slot after construction and Comlink queues calls in order.
    void api.configure(this.device);
    return slot;
  }

  #replace(slot: Slot): void {
    const index = this.#slots.indexOf(slot);
    try {
      slot.worker.terminate();
    } catch {
      /* already gone */
    }
    if (index === -1 || this.#disposed) return;
    this.#slots[index] = this.#spawn();
  }

  async #acquire(): Promise<Slot> {
    const free = this.#slots.find((s) => !s.busy);
    if (free !== undefined) {
      free.busy = true;
      return free;
    }
    return new Promise<Slot>((resolve) => {
      this.#waiting.push((slot) => {
        slot.busy = true;
        resolve(slot);
      });
    });
  }

  #release(slot: Slot): void {
    slot.busy = false;
    const next = this.#waiting.shift();
    if (next !== undefined) next(slot);
  }

  /**
   * Run one job. `req.bytes` is TRANSFERRED, not cloned — after this resolves
   * the caller's ArrayBuffer has byteLength 0, which the integration test
   * asserts as proof (docs/06 §2 rule 1).
   */
  async process(
    req: ProcessRequest,
    onProgress?: (event: JobProgressEvent) => void,
  ): Promise<ProcessResponse> {
    const slot = await this.#acquire();
    try {
      const callback: (event: JobProgressEvent) => void = onProgress ?? (() => {});
      const response = await slot.api.process(
        Comlink.transfer(req, [req.bytes]),
        Comlink.proxy(callback),
      );
      slot.consecutiveFailures = 0;
      return response;
    } catch (cause) {
      slot.consecutiveFailures += 1;
      if (slot.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // Guards against a corrupted worker poisoning the rest of the batch.
        this.#replace(slot);
      }
      throw cause;
    } finally {
      this.#release(slot);
    }
  }

  /**
   * Prepare one image for a PDF (docs/06 §2.1).
   *
   * Same slot discipline as `process`, so a batch spreads across the pool and
   * the caller can simply fire one of these per file. `bytes` is transferred
   * in both directions: on the passthrough path it is the user's original
   * photo, and copying it would make the fast path the expensive one.
   */
  async prepareForPdf(source: PdfSourceImage): Promise<PreparedPdfImage> {
    const slot = await this.#acquire();
    try {
      const prepared = await slot.api.prepareForPdf(
        Comlink.transfer(source, [source.bytes]),
      );
      slot.consecutiveFailures = 0;
      return prepared;
    } catch (cause) {
      slot.consecutiveFailures += 1;
      if (slot.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) this.#replace(slot);
      throw cause;
    } finally {
      this.#release(slot);
    }
  }

  /** Assemble prepared images into one document (docs/06 §2.1). */
  async assemblePdf(
    images: readonly PreparedPdfImage[],
    options: PdfLayoutOptions,
  ): Promise<ArrayBuffer> {
    const slot = await this.#acquire();
    try {
      return await slot.api.assemblePdf(
        Comlink.transfer(images, images.map((image) => image.bytes)),
        options,
      );
    } finally {
      this.#release(slot);
    }
  }

  /**
   * The PDF document operations (docs/06 §2.2).
   *
   * One slot each, same discipline as everything else here. `probePdf` is
   * separate so the UI can validate a page range against a real page count
   * before the user commits to anything.
   */
  async probePdf(bytes: ArrayBuffer): Promise<PdfProbe> {
    const slot = await this.#acquire();
    try {
      return await slot.api.probePdf(Comlink.transfer(bytes, [bytes]));
    } finally {
      this.#release(slot);
    }
  }

  async mergePdfs(sources: readonly ArrayBuffer[]): Promise<ArrayBuffer> {
    const slot = await this.#acquire();
    try {
      return await slot.api.mergePdfs(Comlink.transfer(sources, [...sources]));
    } finally {
      this.#release(slot);
    }
  }

  async splitPdf(
    bytes: ArrayBuffer,
    groups: readonly (readonly number[])[],
  ): Promise<SerializableSplitPart[]> {
    const slot = await this.#acquire();
    try {
      return await slot.api.splitPdf(Comlink.transfer(bytes, [bytes]), groups);
    } finally {
      this.#release(slot);
    }
  }

  async rotatePdf(
    bytes: ArrayBuffer,
    indices: readonly number[],
    angle: number,
  ): Promise<ArrayBuffer> {
    const slot = await this.#acquire();
    try {
      return await slot.api.rotatePdf(Comlink.transfer(bytes, [bytes]), indices, angle);
    } finally {
      this.#release(slot);
    }
  }

  /** Page count via the renderer (docs/06 §2.2). */
  async countPdfPages(bytes: ArrayBuffer): Promise<number> {
    const slot = await this.#acquire();
    try {
      return await slot.api.countPdfPages(Comlink.transfer(bytes, [bytes]));
    } finally {
      this.#release(slot);
    }
  }

  async rasterisePdf(
    bytes: ArrayBuffer,
    options: RasterOptions,
    onPage?: (done: number, total: number) => void,
  ): Promise<RasterPage[]> {
    const slot = await this.#acquire();
    try {
      // Comlink.proxy, or the callback does not survive the boundary
      // (docs/06 §2 rule 3).
      return await slot.api.rasterisePdf(
        Comlink.transfer(bytes, [bytes]),
        options,
        Comlink.proxy(onPage ?? (() => {})),
      );
    } finally {
      this.#release(slot);
    }
  }

  /** Cooperative cancellation; the pipeline checks between encode passes. */
  async cancel(jobId: string): Promise<void> {
    await Promise.all(this.#slots.map((s) => s.api.cancel(jobId).catch(() => undefined)));
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await Promise.all(this.#slots.map((s) => s.api.teardown().catch(() => undefined)));
    for (const slot of this.#slots) slot.worker.terminate();
    this.#slots = [];
    this.#waiting = [];
  }
}
