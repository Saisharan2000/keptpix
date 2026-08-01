/**
 * src/workers/pipeline.ts
 *
 * The processing flowchart from docs/04-architecture.md §3:
 *   detect -> guard -> decode -> orient -> resize -> encode -> strip -> emit
 *
 * Runs INSIDE the worker. Every ImageBitmap allocated here is closed in a
 * finally block; none is ever returned to the main thread (docs/06 §2 rule 2).
 */
import type { CodecSupport, DeviceProfile, Dimensions, JobError, OutputFormat } from '../core/types';
import { createJobError } from '../core/errors';
import { computeTargetDimensions, planDownscaleSteps } from '../core/resize';
import { orientationSwapsAxes } from '../core/metadata';
import { resolveHardPixelCeiling } from '../core/guards';
import { DEFAULT_TARGET_SEARCH_OPTIONS, searchForTargetSize } from '../core/target-size';
import { resolveDecoder, resolveEncoder } from '../engines/registry';
import type {
  JobProgressEvent,
  ProcessRequest,
  ProcessResponse,
  SerializableResult,
} from './protocol';

export interface PipelineContext {
  device: DeviceProfile;
  support: CodecSupport;
  signal?: AbortSignal | undefined;
}

interface LastEncode {
  quality: number;
  scale: number;
  blob: Blob;
}

/**
 * Draw `source` down to `to`, stepping so no single draw reduces an axis by
 * more than 2x (docs/06 §3.3) — one large-ratio drawImage aliases badly.
 *
 * Returns `source` unchanged when no resize is needed, so the CALLER must
 * compare identity before closing.
 */
async function scaleBitmap(source: ImageBitmap, to: Dimensions): Promise<ImageBitmap> {
  const from: Dimensions = { width: source.width, height: source.height };
  const steps = planDownscaleSteps(from, to);
  if (steps.length === 0) return source;

  let current = source;
  for (const step of steps) {
    const canvas = new OffscreenCanvas(step.width, step.height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('OffscreenCanvas 2d context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, step.width, step.height);
    const next = canvas.transferToImageBitmap();
    if (current !== source) current.close();
    current = next;
  }
  return current;
}

/**
 * Bake EXIF orientation into the pixels.
 *
 * Used ONLY for decoders whose `appliesOrientation` is false. Every decoder
 * registered today self-orients, so this currently never runs — it exists for
 * adapters like utif (TIFF), which hand back raw pixels.
 *
 * Applying it unconditionally is what made a correct portrait HEIC come out
 * landscape (docs/12 D-34): the image was already upright and got rotated twice.
 */
async function orientBitmap(bitmap: ImageBitmap, orientation: number): Promise<ImageBitmap> {
  if (orientation <= 1 || orientation > 8) return bitmap;

  const swap = orientationSwapsAxes(orientation);
  const width = swap ? bitmap.height : bitmap.width;
  const height = swap ? bitmap.width : bitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return bitmap;

  switch (orientation) {
    case 2: ctx.translate(width, 0); ctx.scale(-1, 1); break;
    case 3: ctx.translate(width, height); ctx.rotate(Math.PI); break;
    case 4: ctx.translate(0, height); ctx.scale(1, -1); break;
    case 5: ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break;
    case 6: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -width); break;
    case 7: ctx.rotate(0.5 * Math.PI); ctx.translate(height, -width); ctx.scale(-1, 1); break;
    case 8: ctx.rotate(-0.5 * Math.PI); ctx.translate(-height, 0); break;
    default: break;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.transferToImageBitmap();
}

const scaledDims = (d: Dimensions, scale: number): Dimensions => ({
  width: Math.max(1, Math.round(d.width * scale)),
  height: Math.max(1, Math.round(d.height * scale)),
});

export async function runPipeline(
  req: ProcessRequest,
  ctx: PipelineContext,
  onProgress: (event: JobProgressEvent) => void,
): Promise<ProcessResponse> {
  const started = Date.now();
  const { jobId, config } = req;
  const format: OutputFormat = config.outputFormat;

  /**
   * Everything the encode closure mutates lives here rather than in `let`
   * bindings: TypeScript cannot narrow a closure-assigned local, and a stale
   * narrowing on a bitmap handle is exactly how a leak gets shipped.
   */
  const state: {
    decoded: ImageBitmap | null;
    resized: ImageBitmap | null;
    searchBitmap: ImageBitmap | null;
    searchScale: number;
    passes: number;
    last: LastEncode | null;
    /**
     * Blobs a target search could still return, keyed by "quality:scale".
     *
     * Bounded deliberately: every blob at or under target (each by definition
     * <= targetBytes, and at most maxPasses of them) plus the single smallest
     * seen, which is what invariant I-5 returns when a target is unreachable.
     * Caching every pass instead would hold the maxQuality probe, which can be
     * several megabytes.
     */
    candidates: Map<string, Blob>;
    smallest: { key: string; bytes: number } | null;
  } = {
    decoded: null,
    resized: null,
    searchBitmap: null,
    searchScale: 1,
    passes: 0,
    last: null,
    candidates: new Map(),
    smallest: null,
  };

  const candidateKey = (quality: number, scale: number): string => quality + ':' + scale;

  try {
    // ── Decode ──────────────────────────────────────────────────────────
    onProgress({ jobId, phase: 'decoding', progress: 0 });
    const decoder = resolveDecoder(req.sourceFormat, ctx.support);
    await decoder.init();

    try {
      const out = await decoder.decode({
        bytes: req.bytes,
        format: req.sourceFormat,
        // The memory guard, applied where it costs nothing: the decoder
        // downscales WHILE decoding rather than allocating the full bitmap and
        // shrinking after (the PRESCALE branch in docs/04 §3).
        maxPixels: ctx.device.maxDecodedPixels,
        ...(req.sourceMetadata !== undefined
          ? { orientation: req.sourceMetadata.orientation }
          : {}),
      });
      // Only rotate for a decoder that declares it does NOT self-orient.
      // Testing the decoder id here instead is what produced docs/12 D-34.
      const orientation = req.sourceMetadata?.orientation ?? 1;
      state.decoded = decoder.appliesOrientation
        ? out.bitmap
        : await orientBitmap(out.bitmap, orientation);
    } catch (cause) {
      if (isJobError(cause)) throw cause;
      throw createJobError('E_CORRUPT_FILE', {
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    // EXIF orientation was applied to the pixels during decode.
    const decoded = state.decoded;

    /**
     * The hard ceiling — resolves a genuine inconsistency between docs/04 §3
     * (exceeding the per-device budget silently PRESCALEs) and docs/04 §6
     * (E_TOO_LARGE's own message reads as an outright rejection: "too large
     * for this device's memory. Try resizing first," not "we resized it for
     * you"). Both cannot be exactly true of the same threshold.
     *
     * Resolved as two tiers, docs/12 D-43: below the per-device soft budget,
     * behaviour is exactly the docs/04 §3 flowchart — the decoder above already
     * prescaled via maxPixels, silently and for free. Above the hard ceiling,
     * no prescale is attempted and the decode is refused outright.
     * This is also the only place E_TOO_LARGE was reachable at all — it was
     * fully defined in the taxonomy and fully unit-tested in guards.ts, but
     * nothing in the running pipeline ever threw it before this.
     *
     * The ceiling is now DEVICE-SCALED (docs/12 D-57, WO-1) and imported rather
     * than hardcoded here. D-43 hardcoded the 80 MP mobile figure at this call
     * site as a universal backstop, which made a 32 GB workstation refuse a
     * 100 MP panorama it could handle — while the site advertised no such cap.
     */
    if (decoded.width * decoded.height > resolveHardPixelCeiling(ctx.device)) {
      const dims = { width: decoded.width, height: decoded.height };
      decoded.close();
      state.decoded = null;
      throw createJobError('E_TOO_LARGE', { params: dims });
    }

    onProgress({ jobId, phase: 'decoding', progress: 1 });

    // ── Resize ──────────────────────────────────────────────────────────
    onProgress({ jobId, phase: 'resizing', progress: 0 });
    const sourceDims: Dimensions = { width: decoded.width, height: decoded.height };
    const targetDims = computeTargetDimensions(sourceDims, config.resize);
    state.resized = await scaleBitmap(decoded, targetDims);
    const work = state.resized;
    const workDims: Dimensions = { width: work.width, height: work.height };
    onProgress({ jobId, phase: 'resizing', progress: 1 });

    // ── Encode ──────────────────────────────────────────────────────────
    const encoder = resolveEncoder(format, config.encoderPreference, ctx.support);
    await encoder.init();

    const maxPasses =
      config.sizeMode.kind === 'target' ? DEFAULT_TARGET_SEARCH_OPTIONS.maxPasses : 1;

    const encodeAt = async (quality: number, scale: number): Promise<number> => {
      if (state.searchBitmap === null || scale !== state.searchScale) {
        if (state.searchBitmap !== null && state.searchBitmap !== work) {
          state.searchBitmap.close();
        }
        state.searchBitmap =
          scale === 1 ? work : await scaleBitmap(work, scaledDims(workDims, scale));
        state.searchScale = scale;
      }
      const out = await encoder.encode({
        bitmap: state.searchBitmap,
        format,
        quality,
        backgroundColor: config.backgroundColor,
      });
      state.passes += 1;
      state.last = { quality, scale, blob: out.blob };

      if (config.sizeMode.kind === 'target') {
        const key = candidateKey(quality, scale);
        if (out.sizeBytes <= config.sizeMode.targetBytes) {
          state.candidates.set(key, out.blob);
        }
        if (state.smallest === null || out.sizeBytes < state.smallest.bytes) {
          // Drop the previous smallest unless it is also an under-target
          // candidate, so at most one over-target blob is ever retained.
          if (state.smallest !== null && !state.candidates.has(state.smallest.key)) {
            state.candidates.delete(state.smallest.key);
          }
          state.smallest = { key, bytes: out.sizeBytes };
          state.candidates.set(key, out.blob);
        }
      }
      onProgress({
        jobId,
        phase: 'encoding',
        progress: Math.min(1, state.passes / maxPasses),
        pass: state.passes,
        maxPasses,
        currentBytes: out.sizeBytes,
      });
      return out.sizeBytes;
    };

    let qualityUsed: number | null;
    let scaleApplied = 1;
    let targetMet: boolean | null = null;
    let searchPasses: number | null = null;

    if (config.sizeMode.kind === 'target') {
      const search = await searchForTargetSize(encodeAt, {
        targetBytes: config.sizeMode.targetBytes,
        ...(config.sizeMode.tolerance !== undefined
          ? { tolerance: config.sizeMode.tolerance }
          : {}),
        ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
      });
      qualityUsed = search.quality;
      scaleApplied = search.scale;
      targetMet = search.targetMet;

      // I-8 guarantees the returned pair produced achievedBytes, so its blob was
      // already made during the search. Re-encoding it would spend a NINTH pass
      // and report passesUsed: 9 against a maxPasses of 8 — which is exactly
      // what the Milestone 7 realism suite caught.
      const winner = state.candidates.get(candidateKey(search.quality, search.scale));
      if (winner !== undefined) {
        state.last = { quality: search.quality, scale: search.scale, blob: winner };
      } else if (
        state.last === null ||
        state.last.quality !== search.quality ||
        state.last.scale !== search.scale
      ) {
        // Defensive only — the cache should always hold the winner.
        await encodeAt(search.quality, search.scale);
      }
      // passesUsed reports the SEARCH's pass count, which is the number the UI
      // shows as "pass n/8" and the number invariant I-2 bounds.
      searchPasses = search.passes;
    } else if (config.sizeMode.kind === 'lossless') {
      // Canvas PNG is inherently lossless; true lossless WebP needs the WASM
      // path in Milestone 5, so quality 100 is the honest approximation here.
      ctx.signal?.throwIfAborted();
      await encodeAt(100, 1);
      qualityUsed = null;
    } else {
      ctx.signal?.throwIfAborted();
      await encodeAt(config.sizeMode.quality, 1);
      qualityUsed = config.sizeMode.quality;
    }

    const finalEncode = state.last;
    if (finalEncode === null) {
      throw createJobError('E_ENCODE_FAILED', { params: { format: format.toUpperCase() } });
    }

    // ── Finalise ────────────────────────────────────────────────────────
    // Metadata stripping is implicit on the canvas path: a canvas holds pixels
    // only, so the re-encoded blob carries no EXIF and no GPS at all.
    // Milestone 5 adds the exifr inspector and the preserve-profile option.
    onProgress({ jobId, phase: 'finalising', progress: 1 });

    const outDims = scaledDims(workDims, finalEncode.scale);
    const result: SerializableResult = {
      blob: finalEncode.blob,
      format,
      sizeBytes: finalEncode.blob.size,
      width: outDims.width,
      height: outDims.height,
      qualityUsed,
      scaleApplied,
      encoderUsed: encoder.id,
      durationMs: Date.now() - started,
      passesUsed: searchPasses ?? state.passes,
      targetMet,
    };
    return { ok: true, jobId, result };
  } catch (cause) {
    if (isAbort(cause)) {
      // Cancellation is not a failure and has no code in docs/04 §6. It
      // propagates so the pool can map it to status 'cancelled' rather than
      // rendering an error card the user never caused.
      throw cause;
    }
    if (isJobError(cause)) return { ok: false, jobId, error: cause };
    return {
      ok: false,
      jobId,
      error: createJobError('E_ENCODE_FAILED', {
        params: { format: format.toUpperCase() },
        detail: cause instanceof Error ? cause.message : String(cause),
      }),
    };
  } finally {
    // docs/06 §2 rule 2: every bitmap closed, on every path, including throws.
    if (state.searchBitmap !== null && state.searchBitmap !== state.resized) {
      state.searchBitmap.close();
    }
    if (state.resized !== null && state.resized !== state.decoded) state.resized.close();
    if (state.decoded !== null) state.decoded.close();
    // The winning blob is referenced by the result; the rest can go.
    state.candidates.clear();
  }
}

function isJobError(value: unknown): value is JobError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string' &&
    (value as { code: string }).code.startsWith('E_')
  );
}

function isAbort(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    (value as { name: unknown }).name === 'AbortError'
  );
}
