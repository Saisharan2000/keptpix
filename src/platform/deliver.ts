/**
 * src/platform/deliver.ts — feature M-11.
 *
 * Single download, streaming ZIP, and save-in-place where the browser has the
 * File System Access API (Chrome desktop only, ~28% global — so it is a bonus
 * path, never the only one).
 */
import { withTimeout } from '../core/timeout';

export interface DeliverableEntry {
  name: string;
  blob: Blob;
  lastModified?: number;
}

/**
 * `showSaveFilePicker` opens a native OS dialog and has no cross-browser way
 * to detect "the dialog cannot actually appear here" from the page. Under
 * CDP-driven automation this was measured to HANG FOREVER rather than reject —
 * no dialog ever shows, and the promise just never settles (docs/12 D-44).
 *
 * `navigator.webdriver` is the precise signal for that case: Chrome sets it to
 * true under ANY CDP/Selenium/Playwright-driven session specifically so pages
 * can detect automation. Skipping the picker there costs nothing for a real
 * user and avoids the hang entirely rather than merely bounding it.
 */
export function hasFileSystemAccess(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    'showSaveFilePicker' in globalThis &&
    navigator.webdriver !== true
  );
}

/**
 * The webdriver check above is the precise fix; this is the backstop for
 * anything it misses — an embedded webview or another automation framework
 * that does not set navigator.webdriver but still cannot show a real dialog.
 *
 * Long and deliberately so: a real person choosing a folder in a real dialog
 * can legitimately take a long time, and firing the fallback while they are
 * still mid-dialog is confusing (a browser download appears underneath them).
 * This exists to recover from a genuinely broken picker eventually, not to
 * second-guess a slow human.
 */
const SAVE_PICKER_TIMEOUT_MS = 120_000;

/**
 * Trigger a download and revoke the object URL afterwards.
 *
 * Leaked object URLs are the top memory-leak source in this class of app
 * (docs/05 §4 invariant 1) — the blob behind a live URL can never be collected.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // A microtask is too early — the navigation has not started yet.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Stream a ZIP of every result.
 *
 * client-zip is imported DYNAMICALLY: a user who converts one file and clicks
 * Download should never pay for the archiver in the hydration bundle.
 */
export async function downloadAllAsZip(
  entries: readonly DeliverableEntry[],
  zipName = 'keptpix.zip',
): Promise<void> {
  if (entries.length === 0) return;

  const { downloadZip } = await import('client-zip');
  const response = downloadZip(
    entries.map((entry) => ({
      name: entry.name,
      input: entry.blob,
      lastModified: new Date(entry.lastModified ?? Date.now()),
    })),
  );

  // Where the picker exists, pipe straight to disk so the archive is never
  // fully materialised in memory.
  if (hasFileSystemAccess() && response.body !== null) {
    try {
      const handle = await withTimeout(
        showSaveFilePicker({
          suggestedName: zipName,
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        }),
        SAVE_PICKER_TIMEOUT_MS,
        'showSaveFilePicker',
      );
      const writable = await handle.createWritable();
      await response.body.pipeTo(writable);
      return;
    } catch (cause) {
      // The user dismissing the picker is not an error; fall through to the
      // ordinary download so the action still does something.
      if (isAbortLike(cause)) return;
    }
  }

  downloadBlob(await response.blob(), zipName);
}

/** Save a single result via the picker, falling back to a normal download. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (!hasFileSystemAccess()) {
    downloadBlob(blob, filename);
    return;
  }
  try {
    const handle = await withTimeout(
      showSaveFilePicker({ suggestedName: filename }),
      SAVE_PICKER_TIMEOUT_MS,
      'showSaveFilePicker',
    );
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (cause) {
    if (isAbortLike(cause)) return;
    downloadBlob(blob, filename);
  }
}

function isAbortLike(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { name?: string }).name === 'AbortError'
  );
}
