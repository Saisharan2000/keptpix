/**
 * src/state/tool-runner.ts
 *
 * Where a manifest tool's actual work is looked up.
 *
 * `ManifestToolShell` must never branch on `tool.id` — docs/kepttools/03 §1
 * makes "adding a tool is a manifest edit and nothing else" a tested property.
 * A registry keeps that true while still letting each tool do something
 * genuinely different: the shell asks for a runner by id and calls it, and a
 * new tool adds an entry here rather than a branch there.
 *
 * A tool with no runner is not a broken tool — it is an unbuilt one, and its
 * manifest entry is still `supported: false`, so no route exists for it to be
 * reached through.
 */
import { detectFormat, MIN_DETECT_BYTES } from '../core/detect';
import { parsePageSelection, resolvePageIndices, selectedIndicesOrAll } from '../core/pdf/pages';
import { assessPdfBudget, formatBytes } from '../core/pdf/budget';
import { extractMetadata } from '../core/metadata';
import type { PdfLayoutOptions, PdfPageOrientation, PdfPageSize } from '../core/pdf/layout';
import type { PreparedPdfImage } from '../core/pdf/types';
import { sanitiseBaseName } from '../core/naming';
import type { ToolConfig, ToolId } from '../core/tools';
import { deliverBlob, downloadAllAsZip } from '../platform/deliver';
import type { DeliveryOutcome } from '../platform/deliver';

/**
 * Re-exported so components can name the outcome. docs/07 §2 does not grant
 * `components/react/` access to `platform/`, and eslint-plugin-boundaries
 * enforces it — the view may know WHAT happened, not how to make it happen.
 */
export type { DeliveryOutcome };
import { WorkerPool } from '../workers/pool';

export interface ToolRunProgress {
  /** Files finished, successfully or not. */
  readonly done: number;
  readonly total: number;
  readonly phase: 'reading' | 'assembling';
}

export interface ToolRunInput {
  readonly files: readonly File[];
  readonly config: ToolConfig;
  readonly pool: WorkerPool;
  readonly onProgress: (progress: ToolRunProgress) => void;
  readonly signal: AbortSignal;
}

/**
 * The pool lives here rather than in the component.
 *
 * docs/07 §2 does not grant `components/react/` access to `workers/pool`, and
 * eslint-plugin-boundaries enforced that the moment it was tried. It is the
 * right rule: worker lifecycle is state, not view, and a component that spawns
 * threads in an effect leaks them the first time a re-render is mistimed.
 *
 * Lazy, because a page nobody uses should cost zero threads, and long-lived,
 * because spawning discards the WASM instantiation the next file would reuse.
 */
let sharedPool: WorkerPool | null = null;

function getPool(): WorkerPool {
  sharedPool ??= new WorkerPool();
  return sharedPool;
}

/** Called when the island unmounts — three idle workers is three idle threads. */
export async function disposeToolPool(): Promise<void> {
  const pool = sharedPool;
  sharedPool = null;
  await pool?.dispose();
}

export interface ToolRunFailure {
  readonly name: string;
  readonly reason: string;
}

export interface ToolRunResult {
  readonly blob: Blob;
  readonly filename: string;
  /** Files that could not be included. The rest of the batch still ran. */
  readonly failures: readonly ToolRunFailure[];
}

export type ToolRunner = (input: ToolRunInput) => Promise<ToolRunResult>;

/** Cancellation raised between files; the caller treats it as "not an error". */
export class ToolRunAborted extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ToolRunAborted';
  }
}

function messageFor(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause as { message: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'This file could not be read.';
}

/** Narrows a free-form config value to a known page size. */
function pageSizeFrom(value: unknown): PdfPageSize {
  return value === 'a4' || value === 'letter' ? value : 'fit';
}

function orientationFrom(value: unknown): PdfPageOrientation {
  return value === 'portrait' || value === 'landscape' ? value : 'auto';
}

function marginFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The output name.
 *
 * One image gives its own name to the document, which is what someone
 * converting a single scan expects. Several fall back to a generic name rather
 * than picking one file's name arbitrarily and implying the rest are inside it
 * as an afterthought.
 */
function pdfNameFor(files: readonly File[]): string {
  if (files.length === 1 && files[0] !== undefined) {
    return sanitiseBaseName(files[0].name) + '.pdf';
  }
  return 'images.pdf';
}

const imagesToPdf: ToolRunner = async ({ files, config, pool, onProgress, signal }) => {
  const options: PdfLayoutOptions = {
    pageSize: pageSizeFrom(config.pageSize),
    orientation: orientationFrom(config.orientation),
    marginMm: marginFrom(config.marginMm),
  };

  /**
   * Refuse before doing any work, rather than crashing the tab after minutes.
   *
   * One document means every page's bytes live at once plus the finished file —
   * peak is roughly double the input and arrives all together. Converting the
   * same forty photos one at a time is fine; assembling them into one file is
   * not, and the difference is invisible to the person doing it.
   *
   * The message names how many WOULD fit, because "no" is not actionable and
   * "the first 23 of these 40 fit" is.
   */
  const budget = assessPdfBudget(
    files.map((file) => file.size),
    pool.device,
  );
  if (!budget.withinBudget) {
    throw new Error(
      'That is ' +
        formatBytes(budget.totalBytes) +
        ' of images, and this device can safely build about ' +
        formatBytes(budget.budgetBytes) +
        ' into one PDF. ' +
        (budget.fittingCount > 0
          ? 'The first ' +
            budget.fittingCount +
            ' of these ' +
            files.length +
            ' would fit — remove the rest, or make two PDFs.'
          : 'Try a smaller image, or fewer at a time.'),
    );
  }

  const prepared: PreparedPdfImage[] = [];
  const failures: ToolRunFailure[] = [];

  // Sequential on purpose. The pool would happily run these in parallel, but
  // every prepared image stays in memory until the document is assembled, so
  // parallelism here buys a little wall-clock time in exchange for a much
  // higher peak — and this is the tool most likely to be handed forty photos
  // on a phone.
  for (let index = 0; index < files.length; index += 1) {
    if (signal.aborted) throw new ToolRunAborted();

    const file = files[index];
    if (file === undefined) continue;

    onProgress({ done: index, total: files.length, phase: 'reading' });

    try {
      const bytes = await file.arrayBuffer();

      const format = detectFormat(new Uint8Array(bytes.slice(0, MIN_DETECT_BYTES)));
      if (format === null) {
        failures.push({ name: file.name, reason: 'Not an image we can read.' });
        continue;
      }

      // Read on the main thread, per docs/12 D-33 — the worker must not
      // re-parse EXIF, and for HEIC it cannot do so reliably anyway.
      const metadata = await extractMetadata(bytes);

      prepared.push(
        await pool.prepareForPdf({ bytes, format, orientation: metadata.orientation }),
      );
    } catch (cause) {
      // One unreadable file must never cost the user the other thirty-nine.
      failures.push({ name: file.name, reason: messageFor(cause) });
    }
  }

  if (signal.aborted) throw new ToolRunAborted();
  if (prepared.length === 0) {
    throw new Error(
      failures.length > 0
        ? 'None of those files could be read, so there is no document to make.'
        : 'Add at least one image first.',
    );
  }

  onProgress({ done: files.length, total: files.length, phase: 'assembling' });
  const document = await pool.assemblePdf(prepared, options);

  return {
    blob: new Blob([document], { type: 'application/pdf' }),
    filename: pdfNameFor(files),
    failures,
  };
};

/** Reads a File, or records why it could not be used. */
async function readPdf(
  file: File,
  failures: ToolRunFailure[],
): Promise<ArrayBuffer | null> {
  try {
    const bytes = await file.arrayBuffer();
    // Content, not extension — the same discipline as the image tools. A .pdf
    // that is actually a Word document must fail here, not deep inside a parser.
    const head = new Uint8Array(bytes.slice(0, 5));
    if (String.fromCharCode(...head) !== '%PDF-') {
      failures.push({ name: file.name, reason: 'This is not a PDF.' });
      return null;
    }
    return bytes;
  } catch (cause) {
    failures.push({ name: file.name, reason: messageFor(cause) });
    return null;
  }
}

const mergePdf: ToolRunner = async ({ files, pool, onProgress, signal }) => {
  const failures: ToolRunFailure[] = [];
  const sources: ArrayBuffer[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (signal.aborted) throw new ToolRunAborted();
    const file = files[index];
    if (file === undefined) continue;
    onProgress({ done: index, total: files.length, phase: 'reading' });
    const bytes = await readPdf(file, failures);
    if (bytes !== null) sources.push(bytes);
  }

  if (signal.aborted) throw new ToolRunAborted();
  if (sources.length === 0) {
    throw new Error('None of those files could be read as a PDF.');
  }
  if (sources.length === 1) {
    // Merging one file is a copy, and saying so beats silently handing back
    // the same document as if work had been done.
    throw new Error('Add a second PDF — merging one file would just copy it.');
  }

  onProgress({ done: files.length, total: files.length, phase: 'assembling' });
  const merged = await pool.mergePdfs(sources);

  return {
    blob: new Blob([merged], { type: 'application/pdf' }),
    filename: 'merged.pdf',
    failures,
  };
};

const splitPdfRunner: ToolRunner = async ({ files, config, pool, onProgress, signal }) => {
  const failures: ToolRunFailure[] = [];
  const file = files[0];
  if (file === undefined) throw new Error('Add a PDF first.');

  onProgress({ done: 0, total: 1, phase: 'reading' });
  const bytes = await readPdf(file, failures);
  if (bytes === null) throw new Error('That file could not be read as a PDF.');
  if (signal.aborted) throw new ToolRunAborted();

  // Probe first so the range is validated against the real page count. Doing
  // this before the split means "1-40" on a 12-page file is answered rather
  // than silently clamped.
  const { pageCount } = await pool.probePdf(bytes.slice(0));
  const raw = typeof config.ranges === 'string' ? config.ranges : '';
  const selection = parsePageSelection(raw, pageCount);

  if (selection.ranges.length === 0) {
    throw new Error(
      'Enter the pages to extract, like "1-3, 7". This PDF has ' + pageCount + ' pages.',
    );
  }
  for (const fragment of selection.invalid) {
    failures.push({ name: fragment, reason: 'Not a page range we could read.' });
  }

  // GROUPS, not a flat list: each range must become its own file, which is what
  // the manifest's help text promises.
  const groups = selection.ranges.map((range) =>
    resolvePageIndices({ ranges: [range], invalid: [] }),
  );

  onProgress({ done: 1, total: 1, phase: 'assembling' });
  const parts = await pool.splitPdf(bytes, groups);

  const base = sanitiseBaseName(file.name);
  const entries = parts.map((part) => {
    const first = (part.indices[0] ?? 0) + 1;
    const last = (part.indices[part.indices.length - 1] ?? 0) + 1;
    const label = first === last ? String(first) : first + '-' + last;
    return {
      name: base + '-pages-' + label + '.pdf',
      blob: new Blob([part.bytes], { type: 'application/pdf' }),
    };
  });

  await downloadAllAsZip(entries, base + '-split.zip');

  // The ZIP has already been delivered, so the returned blob is the archive's
  // stand-in for the UI's "download again" affordance.
  return {
    blob: new Blob([], { type: 'application/zip' }),
    filename: base + '-split.zip',
    failures,
  };
};

const rotatePdfRunner: ToolRunner = async ({ files, config, pool, onProgress, signal }) => {
  const failures: ToolRunFailure[] = [];
  const file = files[0];
  if (file === undefined) throw new Error('Add a PDF first.');

  onProgress({ done: 0, total: 1, phase: 'reading' });
  const bytes = await readPdf(file, failures);
  if (bytes === null) throw new Error('That file could not be read as a PDF.');
  if (signal.aborted) throw new ToolRunAborted();

  const { pageCount } = await pool.probePdf(bytes.slice(0));
  const raw = typeof config.pages === 'string' ? config.pages : '';
  // Empty means every page — the manifest's help text says so, and
  // selectedIndicesOrAll is the single place that rule lives.
  const { indices, invalid } = selectedIndicesOrAll(raw, pageCount);
  for (const fragment of invalid) {
    failures.push({ name: fragment, reason: 'Not a page range we could read.' });
  }
  if (indices.length === 0) {
    throw new Error('No pages matched. This PDF has ' + pageCount + ' pages.');
  }

  const angle = Number(config.angle ?? 90);

  onProgress({ done: 1, total: 1, phase: 'assembling' });
  const rotated = await pool.rotatePdf(bytes, indices, angle);

  return {
    blob: new Blob([rotated], { type: 'application/pdf' }),
    filename: sanitiseBaseName(file.name) + '-rotated.pdf',
    failures,
  };
};


const pdfToImages: ToolRunner = async ({ files, config, pool, onProgress, signal }) => {
  const failures: ToolRunFailure[] = [];
  const file = files[0];
  if (file === undefined) throw new Error('Add a PDF first.');

  onProgress({ done: 0, total: 1, phase: 'reading' });
  const bytes = await readPdf(file, failures);
  if (bytes === null) throw new Error('That file could not be read as a PDF.');
  if (signal.aborted) throw new ToolRunAborted();

  // countPdfPages, not probePdf: this route needs pdf.js anyway, and probePdf
  // would pull @cantoo/pdf-lib as well for a number we can already get.
  const pageCount = await pool.countPdfPages(bytes.slice(0));
  const raw = typeof config.pages === 'string' ? config.pages : '';
  const { indices, invalid } = selectedIndicesOrAll(raw, pageCount);
  for (const fragment of invalid) {
    failures.push({ name: fragment, reason: 'Not a page range we could read.' });
  }
  if (indices.length === 0) {
    throw new Error('No pages matched. This PDF has ' + pageCount + ' pages.');
  }

  const format = config.format === 'png' ? 'png' : 'jpeg';
  const dpi = typeof config.dpi === 'number' && Number.isFinite(config.dpi) ? config.dpi : 150;

  const pages = await pool.rasterisePdf(
    bytes,
    { format, dpi, indices },
    // Rendering is the slow part and it is per page, so progress here is real
    // rather than a spinner: a 40-page scan at 150 DPI takes visible seconds.
    (done, total) => onProgress({ done, total, phase: 'assembling' }),
  );

  const base = sanitiseBaseName(file.name);
  const ext = format === 'png' ? 'png' : 'jpg';
  const width = String(pageCount).length;
  const entries = pages.map((page) => ({
    // Zero-padded so a 12-page document sorts 01..12 rather than 1, 10, 11, 2.
    name: base + '-page-' + String(page.index + 1).padStart(width, '0') + '.' + ext,
    blob: new Blob([page.bytes], { type: format === 'png' ? 'image/png' : 'image/jpeg' }),
  }));

  // If any page was clamped below the requested DPI, say so rather than letting
  // the user wonder why 600 DPI produced something smaller.
  const clamped = pages.filter((page) => page.dpi < dpi);
  if (clamped.length > 0) {
    const lowest = Math.min(...clamped.map((page) => page.dpi));
    failures.push({
      name: clamped.length + (clamped.length === 1 ? ' page' : ' pages'),
      reason:
        'Rendered at ' + lowest + ' DPI instead of ' + dpi +
        ' — any higher would have exhausted this device on a page that size.',
    });
  }

  await downloadAllAsZip(entries, base + '-pages.zip');

  return {
    blob: new Blob([], { type: 'application/zip' }),
    filename: base + '-pages.zip',
    failures,
  };
};

const RUNNERS: Partial<Record<ToolId, ToolRunner>> = {
  'images-to-pdf': imagesToPdf,
  'pdf-merge': mergePdf,
  'pdf-split': splitPdfRunner,
  'pdf-rotate': rotatePdfRunner,
  'pdf-to-images': pdfToImages,
};

/** Whether a tool has an implementation behind it, for the shell's gate. */
export function hasToolRunner(id: ToolId): boolean {
  return RUNNERS[id] !== undefined;
}

/**
 * Run a tool. The pool is supplied here so no caller has to know one exists.
 */
export async function runTool(
  id: ToolId,
  input: Omit<ToolRunInput, 'pool'>,
): Promise<ToolRunResult> {
  const runner = RUNNERS[id];
  if (runner === undefined) {
    throw new Error('No runner is registered for ' + id + '.');
  }
  return runner({ ...input, pool: getPool() });
}

/**
 * Hands the finished document to the browser.
 *
 * Re-exported through state/ because docs/07 §2 does not grant
 * `components/react/` access to `platform/`, and rightly so — a component
 * should not be reaching for the filesystem. `downloadBlob` owns the object-URL
 * revoke that docs/05 §4 invariant 1 requires.
 */
export async function deliverToolResult(
  result: ToolRunResult,
  fromUserGesture = false,
): Promise<DeliveryOutcome> {
  return deliverBlob(result.blob, result.filename, fromUserGesture);
}
