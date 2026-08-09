/**
 * src/engines/pdf/raster.ts
 *
 * Rendering PDF pages to images. The one operation here that needs a full PDF
 * renderer rather than a parser.
 *
 * Spec: docs/kepttools/03 §2. Uses `pdfjs-dist` (Apache-2.0), which is the only
 * credible option: `mupdf` is AGPL and forbidden by docs/07 §3, and a PDF
 * rasteriser is not something to write by hand — unlike the WRITER in
 * core/pdf/writer.ts, which is 300 lines because writing one image per page is
 * genuinely simple (docs/12 D-75).
 *
 * MEASURED COST, because the last estimate was wrong by 2x: 171 KB gz for the
 * API and 464 KB gz for the renderer, so ~635 KB total, all lazy. That is the
 * largest dependency in the project — bigger than @cantoo/pdf-lib's 269 KB and
 * smaller than the 1.12 MB AVIF decoder already shipping. Only /pdf/to-images
 * pays it.
 *
 * THREE THINGS THAT WOULD OTHERWISE BREAK, handled below rather than discovered
 * in production: eval is unavailable under our CSP, high DPI on a large page
 * exhausts memory, and JPEG has no alpha channel.
 */
import { createJobError } from '../../core/errors';
import { canvasEncoder } from '../canvas/encoder';
import type { OutputFormat } from '../../core/types';
// Type-only, so it is erased at compile time and the library still arrives
// solely via the dynamic import in loadPdfJs(). Same reasoning as document.ts.
import type * as PdfJsModule from 'pdfjs-dist';

type PdfJs = typeof PdfJsModule;

let pending: Promise<PdfJs> | null = null;

/**
 * Loads pdf.js and gives it a worker.
 *
 * A NESTED worker: this module already runs inside `image.worker.ts`, and
 * pdf.js requires a `Worker` for its renderer — there is no supported in-thread
 * mode in v6. Workers spawning workers is supported on everything this product
 * targets (Safari 16.4+ is already the floor, per the OffscreenCanvas gate in
 * docs/12 D-55), and the CSP permits it: `worker-src 'self' blob:`.
 *
 * The alternative would be running the renderer on the main thread, which
 * CLAUDE.md non-negotiable 3 forbids and which would freeze the tab on any
 * document worth converting.
 */
async function loadPdfJs(): Promise<PdfJs> {
  pending ??= (async () => {
    try {
      const [lib, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.mjs?worker'),
      ]);
      // Set once. Reassigning would orphan the previous worker.
      lib.GlobalWorkerOptions.workerPort ??= new worker.default();
      return lib;
    } catch (cause) {
      pending = null;
      throw createJobError('E_CODEC_LOAD_FAILED', {
        params: { format: 'PDF' },
        detail: String(cause),
      });
    }
  })();
  return pending;
}

/**
 * The most pixels one rendered page may occupy.
 *
 * 600 DPI is offered by the manifest and an A3 page at 600 DPI is about 70
 * megapixels — 280 MB of canvas for ONE page, before the encoder makes a copy.
 * The DPI the user asked for is honoured until it crosses this, then the scale
 * is reduced and the real figure is reported back, which is the same bargain
 * the image pipeline strikes with its own ceiling (docs/12 D-43).
 *
 * 30 MP is roughly A4 at 500 DPI: past any plausible screen use, comfortably
 * inside print quality, and survivable on a phone.
 */
const MAX_PAGE_PIXELS = 30_000_000;

/** PDF user space is 72 units per inch, by definition. */
const PDF_DPI = 72;

export interface RasterOptions {
  readonly format: OutputFormat;
  readonly dpi: number;
  /** Zero-based page indices, in the order they should be rendered. */
  readonly indices: readonly number[];
  readonly quality?: number;
}

export interface RasterPage {
  /** Zero-based index in the source document. */
  readonly index: number;
  readonly bytes: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  /** The DPI actually used, which is lower than asked for if it was clamped. */
  readonly dpi: number;
}

/** Page count, so a range can be validated before any rendering happens. */
export async function countPdfPages(bytes: ArrayBuffer): Promise<number> {
  const pdfjs = await loadPdfJs();
  // `destroy` is on the loading TASK, not on the document proxy — the proxy
  // exposes only `numPages` and the getters. Holding the task is the only way
  // to release the worker's copy of the document.
  const task = pdfjs.getDocument(rasterDocumentOptions(bytes));
  try {
    const doc = await task.promise;
    return doc.numPages;
  } catch (cause) {
    throw asJobError(cause);
  } finally {
    await task.destroy();
  }
}

function asJobError(cause: unknown): never {
  const name = cause instanceof Error ? cause.name : '';
  const message = cause instanceof Error ? cause.message : String(cause);
  if (name === 'PasswordException' || /password/i.test(message)) {
    throw createJobError('E_PDF_ENCRYPTED', { detail: message });
  }
  throw createJobError('E_PDF_MALFORMED', { detail: message });
}

/**
 * Document options, shared so the two entry points cannot drift apart.
 */
function rasterDocumentOptions(bytes: ArrayBuffer) {
  return {
    data: new Uint8Array(bytes),

    /**
     * `isEvalSupported: false` is REQUIRED here, not a hardening nicety.
     *
     * pdf.js compiles some font programs with `eval` when it is available. Our
     * CSP is `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` — note the
     * absence of `unsafe-eval` — so those calls would be blocked at runtime and
     * pages would render with missing glyphs. Turning it off up front takes the
     * slower, supported path instead of failing in a way only some documents
     * show.
     */
    isEvalSupported: false,

    /**
     * No cMap or standard-font URLs, deliberately.
     *
     * Supplying them means shipping over a megabyte of font and character-map
     * data to cover PDFs that reference fonts without embedding them — mostly
     * older CJK documents. The overwhelming majority of PDFs embed what they
     * use, and those render exactly right. This is a real limitation and the
     * page says so rather than the tool silently substituting glyphs.
     */
    useWorkerFetch: false,

    /** Nothing in a converted page should be able to fetch anything. */
    disableAutoFetch: true,
    disableStream: true,
  };
}

/**
 * Renders the given pages.
 *
 * Encoding goes through `canvasEncoder`, the same adapter the image pipeline
 * uses — so JPEG alpha flattening, quality handling and format probing are
 * shared rather than reimplemented. That is what stops this repeating the
 * transparency bug from D-83.
 */
export async function rasterisePdf(
  bytes: ArrayBuffer,
  options: RasterOptions,
  onPage?: (done: number, total: number) => void,
): Promise<RasterPage[]> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw createJobError('E_ENCODE_FAILED', { params: { format: options.format } });
  }

  const pdfjs = await loadPdfJs();
  await canvasEncoder.init();

  const task = pdfjs.getDocument(rasterDocumentOptions(bytes));
  let doc;
  try {
    doc = await task.promise;
  } catch (cause) {
    await task.destroy();
    throw asJobError(cause);
  }

  const out: RasterPage[] = [];
  try {
    const requested = Math.min(600, Math.max(PDF_DPI, Math.round(options.dpi) || 150));

    for (let i = 0; i < options.indices.length; i += 1) {
      const index = options.indices[i] ?? 0;
      if (index < 0 || index >= doc.numPages) continue;

      const page = await doc.getPage(index + 1);
      try {
        // Clamp the scale so one page cannot exhaust memory. `getViewport` at
        // scale 1 gives the page's size in PDF units, i.e. at 72 DPI.
        const base = page.getViewport({ scale: 1 });
        const wanted = requested / PDF_DPI;
        const pixelsAtWanted = base.width * wanted * base.height * wanted;
        const scale =
          pixelsAtWanted > MAX_PAGE_PIXELS
            ? wanted * Math.sqrt(MAX_PAGE_PIXELS / pixelsAtWanted)
            : wanted;

        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.floor(viewport.width));
        const height = Math.max(1, Math.floor(viewport.height));

        const canvas = new OffscreenCanvas(width, height);
        // `alpha: false` plus the white fill below: a PDF page is paper, and
        // JPEG has no alpha channel, so transparent areas would come out BLACK
        // exactly as they did in D-83. PNG keeps its alpha but paper is still
        // white, so both get the fill.
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx === null) {
          throw createJobError('E_ENCODE_FAILED', { params: { format: options.format } });
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        // Hand the pixels to the shared encoder rather than calling
        // convertToBlob here, so format support and quality stay in one place.
        const bitmap = canvas.transferToImageBitmap();
        try {
          const encoded = await canvasEncoder.encode({
            bitmap,
            format: options.format,
            quality: options.quality ?? 90,
            backgroundColor: '#ffffff',
          });
          out.push({
            index,
            bytes: await encoded.blob.arrayBuffer(),
            width,
            height,
            dpi: Math.round(scale * PDF_DPI),
          });
        } finally {
          bitmap.close();
        }
      } finally {
        page.cleanup();
      }

      onPage?.(i + 1, options.indices.length);
    }
  } finally {
    // Releases the document in the pdf.js worker too, not just this reference.
    await task.destroy();
  }

  if (out.length === 0) throw createJobError('E_PDF_MALFORMED');
  return out;
}
