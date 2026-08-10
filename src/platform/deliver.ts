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
  /*
   * ON iOS, HAND SAFARI SOMETHING IT CANNOT RENDER.
   *
   * Safari displays a PDF inline because it is able to — that is why the finished
   * document opened in a viewer and saved nothing (docs/12 D-95). Retyping the
   * same bytes as `application/octet-stream` removes that option, so Safari's
   * download manager takes it instead, and a download manager writes to
   * Files → Downloads with NO location picker. Which is what Sai asked for: the
   * share sheet saves reliably but makes the user choose a folder every time.
   *
   * The bytes are untouched; only the Blob's declared type differs, and the
   * filename still carries the real extension so the file opens correctly.
   * Everywhere else the original type is kept, because everywhere else the
   * anchor already worked and a correct MIME type is better.
   */
  const deliverable =
    usesShareSheet() && blob.type !== '' && blob.type !== 'application/octet-stream'
      ? new Blob([blob], { type: 'application/octet-stream' })
      : blob;
  const url = URL.createObjectURL(deliverable);
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

/**
 * Is this an iOS device, where `<a download>` does not save?
 *
 * PLATFORM DETECTION, DELIBERATELY, and it is the right tool here. iOS Safari
 * HAS `download` on HTMLAnchorElement and simply ignores it for `blob:` URLs —
 * it navigates to the blob instead. There is no feature to detect: the property
 * is present and the behaviour is wrong, so `'download' in a` is true on exactly
 * the platform where it means nothing.
 *
 * Reported from a real iPhone (docs/12 D-95): images-to-PDF opened the finished
 * PDF in Safari's viewer, saved nothing, and the UI said "Saved images.pdf".
 * iPadOS 13+ reports itself as Macintosh, so touch points are what separate an
 * iPad from a Mac.
 */
export function usesShareSheet(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isIOS && typeof navigator.share === 'function';
}

/**
 * What actually happened, so the UI can stop asserting a download occurred.
 *
 *   saved      the browser confirmed it, or the user completed a share sheet
 *   downloads  handed to iOS Safari's download manager — Files → Downloads.
 *              A page cannot observe whether that succeeded, so the copy says
 *              where to look rather than claiming success outright
 *   cancelled  the user dismissed the share sheet, which is a choice
 */
export type DeliveryOutcome = 'saved' | 'downloads' | 'cancelled';

/**
 * Put a file where the user can keep it, by whatever route this platform has.
 *
 * On iOS that is the share sheet, which is the ONLY way a web page can hand a
 * file to the Files app. It requires user activation, so an automatic call after
 * a conversion finishes cannot use it — that returns `needs-tap` and the caller
 * must render a button rather than pretend something was saved. Falling back to
 * the anchor there would be worse than doing nothing: it navigates the user away
 * to a PDF viewer, which is exactly the reported bug.
 */
export async function deliverBlob(
  blob: Blob,
  filename: string,
  /**
   * True when a tap is driving this call.
   *
   * It decides what happens if the share sheet refuses. Automatically, after a
   * conversion, there is no user activation and share MUST fail — falling back
   * to the anchor there is the reported bug, navigating the user to a PDF viewer
   * and saving nothing. But on their tap, a share failure would otherwise leave
   * them with no file at all, which is worse than the viewer. So the fallback is
   * allowed exactly once the user has asked for it.
   */
  fromUserGesture = false,
): Promise<DeliveryOutcome> {
  if (!usesShareSheet()) {
    downloadBlob(blob, filename);
    return 'saved';
  }

  /*
   * iOS, automatic: the download manager, NOT the share sheet.
   *
   * Both save the file. The difference is that the share sheet makes the user
   * pick a folder every single time, and Sai's note after testing was that the
   * picker is the confusing part. The download manager needs no user activation
   * and no picker — it just writes to Files → Downloads — so it is the better
   * default now that `downloadBlob` retypes the blob so Safari cannot render it
   * inline instead.
   */
  if (!fromUserGesture) {
    downloadBlob(blob, filename);
    return 'downloads';
  }

  /*
   * iOS, on a tap: the share sheet, offered as the deliberate alternative for
   * when the download did not appear or belongs somewhere specific — a folder,
   * Books, another app. Requires the activation a tap provides.
   */
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] }) !== true) {
    downloadBlob(blob, filename);
    return 'downloads';
  }
  try {
    await navigator.share({ files: [file] });
    return 'saved';
  } catch (cause) {
    if (isAbortLike(cause)) return 'cancelled';
    // Never leave a tap with nothing to show for it.
    downloadBlob(blob, filename);
    return 'downloads';
  }
}

/** Save a single result via the picker, falling back to a normal download. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  // The share sheet outranks the picker on iOS, which has no picker at all.
  if (usesShareSheet()) {
    await deliverBlob(blob, filename);
    return;
  }
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
