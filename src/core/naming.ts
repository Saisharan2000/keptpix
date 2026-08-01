/**
 * src/core/naming.ts
 *
 * Output filename generation with collision handling.
 * Referenced by toJobResult() in docs/05-data-models.md §1.
 */
import type { OutputFormat } from './types';

export const OUTPUT_EXTENSION: Record<OutputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  jxl: 'jxl',
};

/**
 * Characters that are illegal in a filename on Windows, macOS, or Linux.
 *
 * The C0 control range is deliberate, not an oversight. A source filename comes
 * from a file the user was handed, not from us, and one carrying a newline or a
 * NUL is exactly what breaks a Content-Disposition header or truncates a path.
 * That is why no-control-regex is disabled on the next line rather than the
 * range being dropped.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Strip any directory component and anything the OS would reject.
 *
 * Folder drops hand back paths like "Camera Roll/IMG_0001.HEIC", and a
 * downloaded file named with a separator in it either fails or, worse,
 * escapes the download directory.
 */
export function sanitiseBaseName(name: string): string {
  const leaf = name.split(/[/\\]/).pop() ?? name;
  const withoutExt = leaf.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim();
  // Trailing dots and spaces are silently dropped by Windows.
  return cleaned.replace(/[. ]+$/, '') || 'image';
}

/** "IMG_0001.HEIC" + 'jpeg' -> "IMG_0001.jpg" */
export function makeOutputName(sourceName: string, format: OutputFormat): string {
  return sanitiseBaseName(sourceName) + '.' + OUTPUT_EXTENSION[format];
}

/**
 * As makeOutputName, but guarantees a name not already in `taken`.
 *
 * A batch converting IMG_1.heic and IMG_1.png both to JPG would otherwise
 * produce two files called IMG_1.jpg, and the second would silently overwrite
 * the first in the user's downloads folder.
 */
export function makeUniqueOutputName(
  sourceName: string,
  format: OutputFormat,
  taken: ReadonlySet<string>,
): string {
  const ext = OUTPUT_EXTENSION[format];
  const base = sanitiseBaseName(sourceName);
  let candidate = base + '.' + ext;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = base + ' (' + n + ').' + ext;
    n += 1;
  }
  return candidate;
}
