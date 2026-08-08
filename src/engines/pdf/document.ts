/**
 * src/engines/pdf/document.ts
 *
 * Merge, split and rotate — the operations that need to READ an arbitrary PDF.
 *
 * Spec: docs/kepttools/03 §2. Uses `@cantoo/pdf-lib`, the maintained fork
 * (docs/07 §3 names it; plain `pdf-lib` has been unpublished since 2021-11-06
 * and is blocked by eslint).
 *
 * WHY A LIBRARY HERE AND NOT IN images-to-pdf. That tool WRITES the simplest
 * document PDF can express and needs no parser, which is why it has none
 * (docs/12 D-75). These three take a file someone else produced, with a
 * cross-reference table, object streams, inheritance, and two decades of
 * malformed-but-tolerated output behind it. That is a genuinely hard problem
 * and re-solving it would be reckless.
 *
 * LAZY, ALWAYS. The import is inside `loadPdfLib()` so the ~130 KB gz never
 * enters the baseline island budget (docs/04 §7, 60 KB). A visitor converting a
 * JPEG downloads none of it; only a PDF route does, and only once.
 */
import { createJobError } from '../../core/errors';
import { normaliseAngle } from '../../core/pdf/pages';
/**
 * Type-only, and that is the whole point: `import type` is erased at compile
 * time, so naming the module here costs nothing at runtime and the library
 * still arrives solely through the dynamic `import()` in `loadPdfLib()`.
 * A `typeof import(...)` annotation would say the same thing but is banned by
 * `consistent-type-imports`, which is right — the explicit form is clearer
 * about what does and does not ship.
 */
import type * as PdfLibModule from '@cantoo/pdf-lib';

type PdfLib = typeof PdfLibModule;

/**
 * One instance per worker, cached.
 *
 * The promise itself is cached rather than the module, so concurrent callers
 * share one download instead of racing to start several.
 */
let pending: Promise<PdfLib> | null = null;

async function loadPdfLib(): Promise<PdfLib> {
  pending ??= import('@cantoo/pdf-lib').catch((cause: unknown) => {
    // Reset so a transient network failure can be retried rather than the
    // rejected promise being cached forever.
    pending = null;
    throw createJobError('E_CODEC_LOAD_FAILED', {
      params: { format: 'PDF' },
      detail: String(cause),
    });
  });
  return pending;
}

/** Anything pdf-lib throws while parsing, mapped to our taxonomy. */
function asJobError(cause: unknown): never {
  const name = cause instanceof Error ? cause.name : '';
  const message = cause instanceof Error ? cause.message : String(cause);

  // pdf-lib throws EncryptedPDFError by name; the message check is a backstop
  // for minified builds where the class name may not survive.
  if (name === 'EncryptedPDFError' || /encrypt/i.test(message)) {
    throw createJobError('E_PDF_ENCRYPTED', { detail: message });
  }
  throw createJobError('E_PDF_MALFORMED', { detail: message });
}

/**
 * Opens a document.
 *
 * `ignoreEncryption` stays FALSE. Passing true lets pdf-lib open a
 * password-protected file and then produce subtly wrong output — pages that
 * render blank, or text that is still encrypted — which is worse than refusing,
 * because the user gets a file and believes it worked.
 */
async function open(bytes: ArrayBuffer) {
  const { PDFDocument } = await loadPdfLib();
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (cause) {
    asJobError(cause);
  }
}

export interface PdfProbe {
  readonly pageCount: number;
  readonly encrypted: boolean;
}

/**
 * Page count, without committing to an operation.
 *
 * The UI needs it to validate a page range before the user presses anything —
 * "1-40" on a 12-page document should be answerable without doing the work.
 */
export async function probePdf(bytes: ArrayBuffer): Promise<PdfProbe> {
  const doc = await open(bytes);
  return { pageCount: doc.getPageCount(), encrypted: doc.isEncrypted };
}

/** Metadata written on every document this engine produces. */
async function stamp(doc: Awaited<ReturnType<typeof open>>): Promise<void> {
  // Producer only, and no dates — the same reasoning as core/pdf/writer.ts: a
  // timestamp is metadata about the user, and this product strips metadata
  // everywhere else.
  doc.setProducer('KeptPix');
  doc.setCreator('KeptPix');
}

/**
 * Concatenates documents in the order given.
 *
 * BOOKMARKS ARE LOST, and the manifest no longer pretends otherwise (docs/12
 * D-83). `copyPages` carries page content, annotations and links, but the
 * outline tree lives at the document level and this library has no API for it.
 * The page says so rather than the settings rail implying a choice.
 */
export async function mergePdfs(sources: readonly ArrayBuffer[]): Promise<Uint8Array> {
  if (sources.length === 0) throw createJobError('E_CORRUPT_FILE');

  const { PDFDocument } = await loadPdfLib();
  const merged = await PDFDocument.create();

  for (const bytes of sources) {
    const doc = await open(bytes);
    try {
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch (cause) {
      asJobError(cause);
    }
  }

  await stamp(merged);
  return merged.save();
}

export interface SplitPart {
  /** Zero-based page indices, in order, that went into this part. */
  readonly indices: readonly number[];
  readonly bytes: Uint8Array;
}

/**
 * Extracts each group of pages into its own document.
 *
 * Takes groups rather than a flat list so "1-3, 7-9" yields TWO files, which is
 * what the manifest's help text promises ("Each range becomes its own PDF").
 * Flattening first would silently turn that into one six-page document.
 */
export async function splitPdf(
  bytes: ArrayBuffer,
  groups: readonly (readonly number[])[],
): Promise<SplitPart[]> {
  const source = await open(bytes);
  const { PDFDocument } = await loadPdfLib();
  const total = source.getPageCount();

  const parts: SplitPart[] = [];
  for (const group of groups) {
    // Guard here as well as in core/: a caller could hand us an index the
    // parser would have rejected, and pdf-lib's own error for that is opaque.
    const indices = group.filter((i) => Number.isInteger(i) && i >= 0 && i < total);
    if (indices.length === 0) continue;

    const out = await PDFDocument.create();
    try {
      const pages = await out.copyPages(source, [...indices]);
      for (const page of pages) out.addPage(page);
    } catch (cause) {
      asJobError(cause);
    }
    await stamp(out);
    parts.push({ indices, bytes: await out.save() });
  }

  if (parts.length === 0) throw createJobError('E_PDF_MALFORMED');
  return parts;
}

/**
 * Rotates the given pages, ADDING to whatever rotation they already carry.
 *
 * Adding rather than setting is the correct reading of the request: a page a
 * scanner already marked 90° that the user asks to rotate 90° should end up at
 * 180°, not back at 90°. Setting absolutely would silently un-rotate pages that
 * were already correct.
 */
export async function rotatePdf(
  bytes: ArrayBuffer,
  indices: readonly number[],
  angle: number,
): Promise<Uint8Array> {
  const doc = await open(bytes);
  const { degrees } = await loadPdfLib();
  const delta = normaliseAngle(angle);
  const total = doc.getPageCount();

  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= total) continue;
    const page = doc.getPage(index);
    const current = normaliseAngle(page.getRotation().angle);
    page.setRotation(degrees(normaliseAngle(current + delta)));
  }

  await stamp(doc);
  return doc.save();
}
