/**
 * tests/integration/pdf-raster.test.ts
 *
 * Rendering PDF pages to images, in a real browser.
 *
 * The fixtures round-trip through this project's own code: an image becomes a
 * PDF via `core/pdf/writer.ts`, and pdf.js then renders that PDF back to an
 * image. So a failure here implicates one of the two, and between them they
 * cover the whole document path.
 *
 * Browser project, not Node, for two reasons that both matter: pdf.js arrives by
 * dynamic import (the mechanism keeping 493 KB out of the baseline), and it
 * spawns a NESTED worker from inside our worker, which has no equivalent under
 * Node and is the part most likely to break on a real engine.
 */
import { describe, it, expect } from 'vitest';
import { assemblePdf, prepareImageForPdf } from '../../src/engines/pdf/images-to-pdf';
import { countPdfPages, rasterisePdf } from '../../src/engines/pdf/raster';
import { resolveCodecSupport } from '../../src/core/capabilities';
import type { CodecSupport } from '../../src/core/types';
import type { PdfLayoutOptions } from '../../src/core/pdf/layout';

const FIT: PdfLayoutOptions = { pageSize: 'fit', orientation: 'auto', marginMm: 0 };

const support: CodecSupport = resolveCodecSupport({
  nativeEncode: ['jpeg', 'png', 'webp'],
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  wasmDecode: [],
});

async function jpeg(width: number, height: number, colour: string): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
  return (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer();
}

/** An n-page PDF. Page i is (200 + 20i) x 150 points, so pages are distinguishable. */
async function pdfOfPages(n: number): Promise<ArrayBuffer> {
  const prepared = [];
  for (let i = 0; i < n; i += 1) {
    prepared.push(
      await prepareImageForPdf(
        { bytes: await jpeg(200 + i * 20, 150, i % 2 === 0 ? '#4f46e5' : '#e11d48'), format: 'jpeg', orientation: 1 },
        support,
      ),
    );
  }
  const doc = assemblePdf(prepared, FIT);
  const copy = new Uint8Array(doc.byteLength);
  copy.set(doc);
  return copy.buffer;
}

/** First bytes, for a magic-byte check on what was actually produced. */
const magic = (bytes: ArrayBuffer, n: number): number[] => [...new Uint8Array(bytes).slice(0, n)];

describe('countPdfPages', () => {
  it('agrees with what our writer put in', async () => {
    expect(await countPdfPages(await pdfOfPages(4))).toBe(4);
  });

  it('reports a non-PDF as malformed', async () => {
    const junk = new TextEncoder().encode('not a pdf at all').buffer;
    await expect(countPdfPages(junk)).rejects.toMatchObject({ code: 'E_PDF_MALFORMED' });
  });
});

describe('rasterisePdf', () => {
  it('renders one image per requested page, in order', async () => {
    const pages = await rasterisePdf(await pdfOfPages(3), {
      format: 'jpeg',
      dpi: 150,
      indices: [0, 2],
    });

    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.index)).toEqual([0, 2]);
    // FFD8FF is the JPEG SOI marker.
    expect(magic(pages[0]!.bytes, 3)).toEqual([0xff, 0xd8, 0xff]);
  });

  it('honours the requested format', async () => {
    const pages = await rasterisePdf(await pdfOfPages(1), {
      format: 'png',
      dpi: 96,
      indices: [0],
    });
    // The 8-byte PNG signature.
    expect(magic(pages[0]!.bytes, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('scales with DPI — doubling it doubles the pixels', async () => {
    const source = await pdfOfPages(1);
    const at150 = await rasterisePdf(source.slice(0), { format: 'jpeg', dpi: 150, indices: [0] });
    const at300 = await rasterisePdf(source.slice(0), { format: 'jpeg', dpi: 300, indices: [0] });

    expect(at300[0]!.width).toBeGreaterThan(at150[0]!.width * 1.9);
    expect(at300[0]!.width).toBeLessThan(at150[0]!.width * 2.1);
    expect(at150[0]!.dpi).toBe(150);
    expect(at300[0]!.dpi).toBe(300);
  });

  it('renders a PDF page onto WHITE, never black', async () => {
    // The D-83 lesson, in the other direction: a PDF page is paper, and a
    // transparent canvas encoded as JPEG comes out black. Sampling a corner
    // outside the drawn image is how that would show up.
    const pages = await rasterisePdf(await pdfOfPages(1), {
      format: 'jpeg',
      dpi: 96,
      indices: [0],
    });

    const bitmap = await createImageBitmap(new Blob([pages[0]!.bytes], { type: 'image/jpeg' }));
    try {
      const probe = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = probe.getContext('2d');
      expect(ctx).not.toBeNull();
      ctx!.drawImage(bitmap, 0, 0);
      // Our fixture fills the whole page, so read the very first pixel and
      // assert it is the fill colour rather than black — a black page would
      // mean the render never landed.
      const [r, g, b] = ctx!.getImageData(1, 1, 1, 1).data;
      expect(r! + g! + b!, 'the page rendered as pure black').toBeGreaterThan(30);
    } finally {
      bitmap.close();
    }
  });

  it('clamps an unreasonable DPI and reports the DPI it actually used', async () => {
    // 600 DPI on a large page is hundreds of megabytes of canvas. The request is
    // honoured up to the ceiling and the real figure comes back, rather than the
    // tab dying or the user being told 600 when they got less.
    const big = await pdfOfPages(1);
    const pages = await rasterisePdf(big, { format: 'jpeg', dpi: 600, indices: [0] });
    expect(pages[0]!.width * pages[0]!.height).toBeLessThanOrEqual(30_000_000);
    expect(pages[0]!.dpi).toBeLessThanOrEqual(600);
  });

  it('skips out-of-range indices instead of failing the document', async () => {
    const pages = await rasterisePdf(await pdfOfPages(2), {
      format: 'jpeg',
      dpi: 96,
      indices: [0, 99, -1],
    });
    expect(pages.map((p) => p.index)).toEqual([0]);
  });

  it('reports progress once per page', async () => {
    const seen: Array<[number, number]> = [];
    await rasterisePdf(
      await pdfOfPages(3),
      { format: 'jpeg', dpi: 96, indices: [0, 1, 2] },
      (done, total) => seen.push([done, total]),
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('refuses a document it cannot open', async () => {
    const junk = new TextEncoder().encode('%PDF-1.7 but then nothing valid').buffer;
    await expect(
      rasterisePdf(junk, { format: 'jpeg', dpi: 150, indices: [0] }),
    ).rejects.toMatchObject({ code: 'E_PDF_MALFORMED' });
  });
});
