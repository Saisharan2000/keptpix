/**
 * src/engines/wasm/loader.ts
 *
 * Lazy fetch, instantiate, cache PER WORKER, with a timeout and a clear
 * E_CODEC_LOAD_FAILED path (docs/10 M5).
 *
 * Caching per worker matters: a worker that has decoded one HEIC keeps libheif
 * warm for the rest of the batch (docs/04 §4). Every codec is served
 * same-origin — docs/04 §1 makes that the property the privacy test asserts.
 */
import { createJobError } from '../../core/errors';
import { withTimeout } from '../../core/timeout';

/** A codec that never resolves would hang the batch with no error to show. */
export const CODEC_LOAD_TIMEOUT_MS = 30_000;

const cache = new Map<string, Promise<unknown>>();

/**
 * Load a codec once per worker.
 *
 * A failed load is NOT cached: the usual cause is a flaky network, and the
 * error card offers Retry, which would be a lie if the rejection were sticky.
 */
export async function loadCodec<T>(
  id: string,
  format: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(id) as Promise<T> | undefined;
  if (existing !== undefined) return existing;

  const pending = withTimeout(factory(), CODEC_LOAD_TIMEOUT_MS, 'codec ' + id).catch(
    (cause: unknown) => {
      cache.delete(id);
      throw createJobError('E_CODEC_LOAD_FAILED', {
        params: { format: format.toUpperCase() },
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    },
  );

  cache.set(id, pending);
  return pending;
}

/** Test seam; also used by teardown() so a terminated worker frees its codecs. */
export function resetCodecCache(): void {
  cache.clear();
}
