/**
 * src/core/query-match.ts
 *
 * Maps what someone actually types onto a tool route, on-device.
 *
 * Spec: docs/kepttools/04 §1 layer 2.
 *
 * People do not search "keptpix heic to jpg". They search "how do I convert my
 * iphone photos to jpeg" and "make this pdf smaller than 2mb". This turns that
 * into a ranked list of real routes, with the top result phrased close to what
 * they typed and its settings already filled in.
 *
 * ZERO NETWORK, and that is not a detail — it is the reason this is a pure
 * `core/` module rather than an API call. Sending a search box's contents to a
 * server would be a bodied request to a non-`self` origin, which fails the
 * release gate in docs/06 §5, is blocked by the deployed CSP, and would mean a
 * privacy tool quietly transmitting what its users type. The index ships with
 * the page; typing sends nothing anywhere.
 *
 * It also cannot help SEO, which is worth stating because it is the intuitive
 * reason to want a server here: Google's crawler fetches a URL and never sends
 * a query, so a title generated from one is a title no crawler ever sees. The
 * search-result line comes from crawled HTML. Ranking is layers 1 and 3;
 * this layer is for the person already on the page.
 */

// ─── Normalisation ─────────────────────────────────────────────────────────

/**
 * Words people use for the same thing.
 *
 * Deliberately small and hand-checked. A big generated synonym table is how a
 * matcher starts confidently returning the wrong tool — every entry here has
 * to be one a real person would type.
 */
const SYNONYMS: Record<string, string> = {
  // Formats and the names people actually use for them.
  jpeg: 'jpg',
  jpe: 'jpg',
  iphone: 'heic',
  ios: 'heic',
  apple: 'heic',
  heif: 'heic',
  tif: 'tiff',
  photograph: 'photo',
  photos: 'photo',
  photoes: 'photo',
  pics: 'photo',
  pic: 'photo',
  picture: 'photo',
  pictures: 'photo',
  images: 'image',
  img: 'image',
  imgs: 'image',
  screenshots: 'screenshot',
  scans: 'scan',
  scanned: 'scan',
  documents: 'document',
  docs: 'document',
  doc: 'document',
  pdfs: 'pdf',

  // Actions.
  convert: 'convert',
  converting: 'convert',
  change: 'convert',
  changing: 'convert',
  turn: 'convert',
  transform: 'convert',
  export: 'convert',
  save: 'convert',
  compress: 'compress',
  compressing: 'compress',
  compressed: 'compress',
  shrink: 'compress',
  shrinking: 'compress',
  reduce: 'compress',
  reducing: 'compress',
  smaller: 'compress',
  optimise: 'compress',
  optimize: 'compress',
  squeeze: 'compress',
  resize: 'resize',
  resizing: 'resize',
  scale: 'resize',
  dimensions: 'resize',
  crop: 'resize',
  combine: 'merge',
  combining: 'merge',
  merging: 'merge',
  join: 'merge',
  joining: 'merge',
  together: 'merge',
  metadata: 'metadata',
  exif: 'metadata',
  gps: 'metadata',
  location: 'metadata',
  strip: 'metadata',
  remove: 'metadata',
};

/**
 * Words carrying no signal. Kept short on purpose: dropping too much turns
 * "convert image to pdf" and "convert pdf to image" into the same query.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'i', 'my', 'me', 'we', 'you', 'your', 'is', 'are', 'am',
  'do', 'does', 'how', 'can', 'want', 'need', 'please', 'help', 'online',
  'free', 'best', 'app', 'tool', 'website', 'site', 'this', 'these', 'it',
  'of', 'on', 'in', 'at', 'with', 'for', 'and', 'or', 'be', 'get', 'make',
  'file', 'files', 'without', 'losing', 'quality', 'fast', 'quick', 'easy',
]);

/** Lowercase, split, drop noise, apply synonyms. Order is preserved. */
export function normalise(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0)
    // A trailing dot from "e.g." or a sentence end is not part of the word.
    .map((word) => word.replace(/\.+$/, ''))
    .filter((word) => word.length > 0 && !STOPWORDS.has(word))
    .map((word) => SYNONYMS[word] ?? word);
}

// ─── Size extraction ───────────────────────────────────────────────────────

const KB = 1024;
const MB = 1024 * 1024;

/** Below this, a "size" is almost certainly something else — a year, a count. */
const MIN_PLAUSIBLE_BYTES = 1024;
/** Above this, nothing in the product can target it. */
const MAX_PLAUSIBLE_BYTES = 100 * MB;

/**
 * Pulls a target size out of free text, or null.
 *
 * "under 150kb", "to 2 MB", "1.5mb", "100 k" all work. Deliberately requires a
 * UNIT: bare numbers are dimensions, page counts and years far more often than
 * they are sizes, and guessing wrong prefills a target the user never asked
 * for — worse than not prefilling at all.
 */
export function parseSize(input: string): number | null {
  // Skip anything that looks like a dimension pair first: 1920x1080 contains
  // no unit, but "resize to 1920x1080 under 500kb" must still find the 500kb.
  const withoutDimensions = input.toLowerCase().replace(/\d+\s*[x×]\s*\d+/g, ' ');

  const match = /(\d+(?:\.\d+)?)\s*(kb|kib|mb|mib|gb|gib|k|m|g)\b/.exec(withoutDimensions);
  if (match === null) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] ?? '';
  const multiplier = unit.startsWith('g') ? MB * 1024 : unit.startsWith('m') ? MB : KB;
  const bytes = Math.round(value * multiplier);

  if (bytes < MIN_PLAUSIBLE_BYTES || bytes > MAX_PLAUSIBLE_BYTES) return null;
  return bytes;
}

/** Renders bytes the way the query probably said it. */
export function formatSize(bytes: number): string {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return (Number.isInteger(mb) ? String(mb) : mb.toFixed(1)) + ' MB';
  }
  return Math.round(bytes / KB) + ' KB';
}

// ─── The index and matching ────────────────────────────────────────────────

export interface QueryEntry {
  /** Route path. Must be a route that actually builds (docs/12 D-79). */
  readonly path: string;
  /** Label template. `{size}` is filled when the query names one. */
  readonly label: string;
  /** Tokens that describe this entry. Matching any of them scores. */
  readonly terms: readonly string[];
  /**
   * Tokens that MUST all be present.
   *
   * This is what stops "compress pdf" matching the image compressor: without
   * a required token, a query scores on the action alone and the wrong tool
   * wins on term count.
   */
  readonly must?: readonly string[];
  /**
   * Tokens that DISQUALIFY this entry outright.
   *
   * Required tokens alone are not enough. "compress my pdf to 200kb" contains
   * every token the image compressor wants — the verb, the units, a size — and
   * nothing it requires is missing, so it scored top and offered a tool that
   * physically cannot compress a PDF. Naming a format an entry cannot handle
   * has to remove it from consideration, not merely fail to boost it.
   *
   * This is what stops the image tools answering video and PDF queries as the
   * manifest grows, rather than one special case per new family.
   */
  readonly excludes?: readonly string[];
  /** Whether a detected size should be offered as a prefill. */
  readonly takesSize?: boolean;
}

export interface QueryResult {
  readonly path: string;
  /** Already interpolated — safe to render directly. */
  readonly label: string;
  readonly score: number;
  /** Appended to `path` when the query named a size this route can use. */
  readonly search?: string;
}

/** Ignore anything this weak — a stray token match is not a suggestion. */
const MIN_SCORE = 1;

/**
 * Ranks entries against a query.
 *
 * Scoring is deliberately simple and explainable: one point per distinct
 * matched term, one bonus for a matched required token, one bonus when the
 * query names a size an entry can use. A learned ranker would be better on
 * paper and impossible to debug when it confidently sends someone to the wrong
 * tool, which is the only failure that matters here.
 */
export function matchQuery(
  input: string,
  entries: readonly QueryEntry[],
  limit = 5,
): QueryResult[] {
  const tokens = normalise(input);
  if (tokens.length === 0) return [];

  const present = new Set(tokens);
  const size = parseSize(input);

  const scored: QueryResult[] = [];
  for (const entry of entries) {
    if (entry.excludes?.some((token) => present.has(token)) === true) continue;
    if (entry.must !== undefined && !entry.must.every((token) => present.has(token))) continue;

    let score = 0;
    for (const term of new Set(entry.terms)) {
      if (present.has(term)) score += 1;
    }
    if (score === 0) continue;

    if (entry.must !== undefined) score += entry.must.length;
    if (size !== null && entry.takesSize === true) score += 2;

    if (score < MIN_SCORE) continue;

    const usesSize = size !== null && entry.takesSize === true;
    scored.push({
      path: entry.path,
      label: entry.label.replace('{size}', usesSize ? formatSize(size) : '').replace(/\s+/g, ' ').trim(),
      score,
      ...(usesSize ? { search: '?target=' + size } : {}),
    });
  }

  return scored
    .sort((a, b) => (b.score - a.score) || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, limit));
}
