/**
 * src/core/timeout.ts
 *
 * A generic promise timeout. `setTimeout` is a standard JS/Node global, not a
 * DOM API, so this is pure under ADR-006 and both `engines/` and `platform/`
 * are allowed to import `core/`.
 *
 * Extracted from engines/wasm/loader.ts (docs/12 D-44) when platform/deliver.ts
 * needed the exact same pattern for showSaveFilePicker: a promise that can hang
 * forever with no rejection needs a hard ceiling, or the caller hangs with it.
 */

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label + ' timed out after ' + ms + 'ms'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}
