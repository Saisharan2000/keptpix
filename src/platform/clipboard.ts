/**
 * src/platform/clipboard.ts
 *
 * Paste support for the Dropzone (docs/08 §5). Screenshot-to-convert is a
 * genuinely common path and costs almost nothing to support.
 */

/** Extract image Files from a paste event, if any. */
export function filesFromClipboard(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (data === null) return [];

  const files: File[] = [];
  for (const item of data.items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file !== null && file.type.startsWith('image/')) files.push(file);
  }
  return files;
}
