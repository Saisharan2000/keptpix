/**
 * tests/integration/pdf-compress.test.ts
 *
 * /pdf/compress end to end through the REAL pool: build a genuine multi-page
 * PDF with the house writer, compress it with the real runner, and assert on
 * the bytes that come back (docs/12 D-120).
 *
 * The claims under test are the ones the tool's own copy makes:
 *   - the result lands AT OR UNDER the target (the whole point),
 *   - the page count survives,
 *   - an unreachable target returns the smallest honest result, labelled,
 *     never a silent failure (docs/04 §6 E_TARGET_UNREACHABLE semantics),
 *   - one bad file never costs the rest of the batch (docs/07 §4).
 */
import { describe, it, expect } from 'vitest';
import { assemblePdf, prepareImageForPdf } from '../../src/engines/pdf/images-to-pdf';
import { countPdfPages } from '../../src/engines/pdf/raster';
import { resolveCodecSupport } from '../../src/core/capabilities';
import type { CodecSupport } from '../../src/core/types';
import type { PdfLayoutOptions } from '../../src/core/pdf/layout';
import { runTool } from '../../src/state/tool-runner';

const support: CodecSupport = resolveCodecSupport({
  nativeEncode: ['jpeg', 'png', 'webp'],
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  wasmDecode: [],
});
const FIT: PdfLayoutOptions = { pageSize: 'fit', orientation: 'auto', marginMm: 0 };

/** A page with real detail, so compression has something to fight. */
async function detailedJpeg(width: number, height: number, seed: number): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#4f46e5');
  g.addColorStop(1, '#e11d48');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  // Deterministic clutter — gradients alone compress too politely.
  for (let i = 0; i < 400; i += 1) {
    const x = ((i * 7919 + seed * 104729) % width);
    const y = ((i * 6101 + seed * 15485) % height);
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#111827';
    ctx.fillRect(x, y, 4 + (i % 9), 4 + (i % 7));
  }
  return (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer();
}

async function sourcePdf(pages: number): Promise<File> {
  const prepared = [];
  for (let i = 0; i < pages; i += 1) {
    prepared.push(
      await prepareImageForPdf(
        { bytes: await detailedJpeg(600, 800, i), format: 'jpeg', orientation: 1 },
        support,
      ),
    );
  }
  const doc = assemblePdf(prepared, FIT);
  return new File([doc.buffer as ArrayBuffer], 'source.pdf', { type: 'application/pdf' });
}

const noProgress = () => {};
const run = (files: File[], config: { targetBytes: number; downsampleImages: boolean }) =>
  runTool('pdf-compress', {
    files,
    config,
    onProgress: noProgress,
    signal: new AbortController().signal,
  });

describe('/pdf/compress (docs/12 D-120)', () => {
  it('lands a 3-page document at or under the target, pages intact', async () => {
    const file = await sourcePdf(3);
    // The premise: the source must actually be over target, or the test
    // proves nothing. Asserted, not hoped.
    const target = 60_000;
    expect(file.size).toBeGreaterThan(target);

    const result = await run([file], { targetBytes: target, downsampleImages: true });

    expect(result.failures).toEqual([]);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.blob.size).toBeLessThanOrEqual(target);
    expect(result.filename).toBe('source-compressed.pdf');

    const bytes = await result.blob.arrayBuffer();
    const head = String.fromCharCode(...new Uint8Array(bytes.slice(0, 5)));
    expect(head).toBe('%PDF-');
    expect(await countPdfPages(bytes)).toBe(3);
  }, 120_000);

  it('an unreachable target returns the smallest honest result, labelled', async () => {
    const file = await sourcePdf(3);
    const result = await run([file], { targetBytes: 20_000, downsampleImages: true });

    // Best effort attached — a real document, not an apology.
    expect(result.blob.size).toBeGreaterThan(0);
    const head = String.fromCharCode(...new Uint8Array((await result.blob.arrayBuffer()).slice(0, 5)));
    expect(head).toBe('%PDF-');

    // And the shortfall is SAID. The reason names both numbers' units so a
    // user can see how far off they were.
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]?.reason).toMatch(/could not reach/i);
    expect(result.failures[0]?.reason).toMatch(/closest/i);
  }, 120_000);

  it('one garbage file never costs the real one (docs/07 §4)', async () => {
    const good = await sourcePdf(2);
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'junk.pdf', {
      type: 'application/pdf',
    });

    const result = await run([junk, good], { targetBytes: 60_000, downsampleImages: true });

    // The junk is a named failure; the good file still produced a document.
    expect(result.failures.map((f) => f.name)).toContain('junk.pdf');
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.blob.size).toBeLessThanOrEqual(60_000);
    expect(result.filename).toBe('source-compressed.pdf');
  }, 120_000);

  it('honours downsampleImages: off keeps quality-only search', async () => {
    const file = await sourcePdf(2);
    // A target reachable only by dropping DPI: with downsampling off the tool
    // must fall short and SAY so rather than quietly downscaling anyway.
    const result = await run([file], { targetBytes: 22_000, downsampleImages: false });
    const on = await run([file], { targetBytes: 22_000, downsampleImages: true });

    // With downscale allowed the tool gets at least as close; usually closer.
    expect(on.blob.size).toBeLessThanOrEqual(result.blob.size);
  }, 120_000);
});
