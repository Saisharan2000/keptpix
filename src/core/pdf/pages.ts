/**
 * src/core/pdf/pages.ts
 *
 * Parsing the page selections people type: "1-3, 7, 9-12".
 *
 * Spec: docs/kepttools/03 §1 — the `pageRange` config field is declared as
 * "Parsed in core/", so this is that parser. Pure, so every awkward input below
 * is a unit test rather than something discovered by a user losing pages.
 *
 * ONE-BASED, because that is what the field says and what a person means. The
 * conversion to zero-based indices happens once, on the way out, in
 * `resolvePageIndices` — doing it anywhere else is how a document ends up
 * missing its first page or its last.
 */

export interface PageRange {
  /** One-based, inclusive. */
  readonly start: number;
  readonly end: number;
}

export interface PageSelection {
  readonly ranges: readonly PageRange[];
  /**
   * Fragments that could not be understood, verbatim.
   *
   * Reported rather than silently dropped: "1-3, foo, 7" quietly becoming
   * pages 1-3 and 7 is a document that is wrong in a way the user cannot see.
   * The UI can say what it ignored.
   */
  readonly invalid: readonly string[];
}

/**
 * Parses a selection against a document of `pageCount` pages.
 *
 * Empty input yields no ranges, which callers treat as "everything" — that is
 * what the manifest's help text promises for rotate ("Leave empty to rotate
 * every page"), and it must not be confused with "nothing".
 */
export function parsePageSelection(input: string, pageCount: number): PageSelection {
  const ranges: PageRange[] = [];
  const invalid: string[] = [];

  const max = Math.max(0, Math.floor(pageCount));
  if (max === 0) return { ranges: [], invalid: [] };

  for (const rawPart of input.split(',')) {
    const part = rawPart.trim();
    if (part.length === 0) continue; // trailing comma, double comma: not an error

    // "5" or "2-7". Also accepts the en dash people paste from documents, and
    // "3-" / "-3" as open-ended, which is what someone means by "3 onwards".
    const match = /^(\d*)\s*(?:[-–—]\s*(\d*))?$/.exec(part);
    if (match === null) {
      invalid.push(part);
      continue;
    }

    const [, rawStart = '', rawEnd] = match;
    const hasDash = rawEnd !== undefined;

    // A bare dash, or a dash with nothing either side, says nothing at all.
    if (rawStart.length === 0 && (rawEnd === undefined || rawEnd.length === 0)) {
      invalid.push(part);
      continue;
    }

    let start = rawStart.length > 0 ? Number(rawStart) : 1;
    let end = hasDash ? (rawEnd.length > 0 ? Number(rawEnd) : max) : start;

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      invalid.push(part);
      continue;
    }
    // Page 0 does not exist. Rejected rather than nudged to 1, because "0-5"
    // is more likely a misunderstanding than a typo, and silently widening a
    // selection is worse than saying it was not understood.
    if (start < 1 || end < 1) {
      invalid.push(part);
      continue;
    }
    // "7-3" is accepted as 3-7. People type ranges backwards, and the
    // intent is unambiguous.
    if (start > end) [start, end] = [end, start];

    // Beyond the document: clamp rather than reject. "1-100" on a 12-page PDF
    // plainly means "all of it", and refusing that would be pedantry.
    if (start > max) {
      invalid.push(part);
      continue;
    }
    ranges.push({ start, end: Math.min(end, max) });
  }

  return { ranges, invalid };
}

/**
 * Flattens a selection to sorted, de-duplicated ZERO-BASED indices.
 *
 * Overlaps collapse: "1-5, 3-7" is pages 1 to 7, each once. A document with a
 * page repeated because the user typed overlapping ranges is not what they
 * asked for.
 */
export function resolvePageIndices(selection: PageSelection): number[] {
  const seen = new Set<number>();
  for (const range of selection.ranges) {
    for (let page = range.start; page <= range.end; page += 1) seen.add(page - 1);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Every page, zero-based — what an empty selection means. */
export function allPageIndices(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(pageCount)) }, (_, i) => i);
}

/**
 * The indices a tool should act on, given what was typed.
 *
 * Empty selection means every page. This is the single place that rule lives,
 * so `rotate` and `split` cannot disagree about it.
 */
export function selectedIndicesOrAll(input: string, pageCount: number): {
  readonly indices: number[];
  readonly invalid: readonly string[];
} {
  const selection = parsePageSelection(input, pageCount);
  const indices =
    selection.ranges.length === 0 ? allPageIndices(pageCount) : resolvePageIndices(selection);
  return { indices, invalid: selection.invalid };
}

/** PDF stores rotation as a multiple of 90, normalised to 0-270. */
export function normaliseAngle(value: unknown): 0 | 90 | 180 | 270 {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 90;
  // Negative and over-360 values both occur: "-90" from a user, and existing
  // page rotations that were already rotated.
  const wrapped = ((Math.round(n / 90) * 90) % 360 + 360) % 360;
  return wrapped as 0 | 90 | 180 | 270;
}

/** Human summary of a selection, for the UI to echo back before committing. */
export function describeSelection(indices: readonly number[], pageCount: number): string {
  if (indices.length === 0) return 'no pages';
  if (indices.length === pageCount) return 'all ' + pageCount + ' pages';
  if (indices.length === 1) return 'page ' + ((indices[0] ?? 0) + 1);
  return indices.length + ' pages';
}
