/**
 * Milestone 3 acceptance — docs/10-build-plan.md.
 *
 * Runs in a REAL browser (vitest browser mode, Playwright/chromium). Canvas,
 * OffscreenCanvas, ImageBitmap and Workers have no faithful fake; a mocked
 * version of this suite would prove nothing about what actually ships.
 *
 * The 4 MP JPEG is generated in-browser rather than committed as a fixture, so
 * there is no binary blob in the repo and the input is regenerated identically
 * on every run.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { WorkerPool } from '../../src/workers/pool';
import type { JobProgressEvent, ProcessRequest } from '../../src/workers/protocol';
import type { DeviceProfile, JobConfig } from '../../src/core/types';
import { resolveDeviceProfile } from '../../src/core/capabilities';

/* ── fixtures ──────────────────────────────────────────────────────────── */

/** Deterministic PRNG so the generated image is identical every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A real JPEG with real photographic-ish detail. A flat colour would compress
 * to a few hundred bytes and make every size assertion meaningless.
 */
async function makeJpegBytes(
  width: number,
  height: number,
  seed = 42,
  /**
   * Encode quality of the SOURCE. Defaults to 0.95 to match every existing
   * caller. It is a parameter because the D-91 case needs a source compressed
   * HARDER than the search's maxQuality — a q95 source re-encodes at q95 to
   * roughly the same size, so it cannot demonstrate inflation at all.
   */
  quality = 0.95,
): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#4f46e5');
  gradient.addColorStop(0.5, '#0f8a5f');
  gradient.addColorStop(1, '#b45309');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const rand = mulberry32(seed);
  for (let i = 0; i < 1200; i += 1) {
    const r = Math.floor(rand() * 256);
    const g = Math.floor(rand() * 256);
    const b = Math.floor(rand() * 256);
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.55)';
    ctx.fillRect(rand() * width, rand() * height, rand() * 90 + 4, rand() * 90 + 4);
  }

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return blob.arrayBuffer();
}

function makeConfig(overrides: Partial<JobConfig> = {}): JobConfig {
  return {
    outputFormat: 'jpeg',
    sizeMode: { kind: 'quality', quality: 82 },
    resize: { kind: 'none' },
    metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
    encoderPreference: 'auto',
    backgroundColor: '#ffffff',
    ...overrides,
  };
}

function makeRequest(
  jobId: string,
  bytes: ArrayBuffer,
  config: JobConfig = makeConfig(),
): ProcessRequest {
  return { jobId, bytes, sourceFormat: 'jpeg', sourceName: jobId + '.jpg', config };
}

const pools: WorkerPool[] = [];
function newPool(size = 1, device?: DeviceProfile): WorkerPool {
  const pool = new WorkerPool(device === undefined ? { size } : { size, device });
  pools.push(pool);
  return pool;
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.dispose()));
});

const FOUR_MP = 2000;

/* ── tests ─────────────────────────────────────────────────────────────── */

describe('full pipeline round-trip — 4 MP JPEG', () => {
  it('converts in quality mode and returns a decodable image', async () => {
    const bytes = await makeJpegBytes(FOUR_MP, FOUR_MP);
    const pool = newPool();

    const response = await pool.process(makeRequest('quality-1', bytes));

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const { result } = response;
    expect(result.format).toBe('jpeg');
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.width).toBe(FOUR_MP);
    expect(result.height).toBe(FOUR_MP);
    expect(result.qualityUsed).toBe(82);
    expect(result.scaleApplied).toBe(1);
    expect(result.encoderUsed).toBe('canvas');
    expect(result.passesUsed).toBe(1);
    expect(result.targetMet).toBeNull();
    expect(result.sizeBytes).toBeGreaterThan(0);

    // The output is a real image, not just bytes with the right MIME type.
    const bitmap = await createImageBitmap(result.blob);
    try {
      expect(bitmap.width).toBe(FOUR_MP);
      expect(bitmap.height).toBe(FOUR_MP);
    } finally {
      bitmap.close();
    }
  });

  it('converts in target-size mode, at or under target, within the pass budget', async () => {
    const bytes = await makeJpegBytes(FOUR_MP, FOUR_MP);
    const pool = newPool();
    const targetBytes = 100_000;

    const response = await pool.process(
      makeRequest('target-1', bytes, makeConfig({ sizeMode: { kind: 'target', targetBytes } })),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const { result } = response;
    // I-1, through the whole stack rather than against a synthetic encoder.
    expect(result.sizeBytes).toBeLessThanOrEqual(targetBytes);
    expect(result.targetMet).toBe(true);
    expect(result.passesUsed).toBeLessThanOrEqual(8);
    expect(result.blob.size).toBe(result.sizeBytes);

    // The reported dimensions match the actual output, including any downscale
    // the search applied to reach the target.
    const bitmap = await createImageBitmap(result.blob);
    try {
      expect(bitmap.width).toBe(result.width);
      expect(bitmap.height).toBe(result.height);
    } finally {
      bitmap.close();
    }
  });

  it('converts JPEG to PNG and to WebP through the same pipeline', async () => {
    const bytes1 = await makeJpegBytes(600, 400);
    const bytes2 = await makeJpegBytes(600, 400);
    const pool = newPool();

    const png = await pool.process(
      makeRequest('to-png', bytes1, makeConfig({ outputFormat: 'png' })),
    );
    const webp = await pool.process(
      makeRequest('to-webp', bytes2, makeConfig({ outputFormat: 'webp' })),
    );

    expect(png.ok && png.result.blob.type).toBe('image/png');
    expect(webp.ok && webp.result.blob.type).toBe('image/webp');
  });

  it('applies a resize spec', async () => {
    const bytes = await makeJpegBytes(FOUR_MP, FOUR_MP);
    const pool = newPool();

    const response = await pool.process(
      makeRequest(
        'resize-1',
        bytes,
        makeConfig({ resize: { kind: 'maxDimension', max: 800 } }),
      ),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.result.width).toBe(800);
    expect(response.result.height).toBe(800);
  });
});

describe('ArrayBuffers are transferred, never cloned', () => {
  it('detaches the source buffer — byteLength is 0 after process()', async () => {
    const bytes = await makeJpegBytes(1200, 900);
    const originalLength = bytes.byteLength;
    expect(originalLength).toBeGreaterThan(1000);

    const pool = newPool();
    const response = await pool.process(makeRequest('transfer-1', bytes));

    expect(response.ok).toBe(true);
    // THE assertion from docs/06 §2 rule 1. A clone would leave byteLength
    // untouched; only a real transfer detaches the buffer.
    expect(bytes.byteLength).toBe(0);
    expect(bytes.byteLength).not.toBe(originalLength);
  });
});

describe('progress reporting is honest', () => {
  it('reports the real pass number during a target-size search', async () => {
    const bytes = await makeJpegBytes(FOUR_MP, FOUR_MP);
    const pool = newPool();
    const events: JobProgressEvent[] = [];

    await pool.process(
      makeRequest(
        'progress-1',
        bytes,
        makeConfig({ sizeMode: { kind: 'target', targetBytes: 80_000 } }),
      ),
      (event) => events.push(event),
    );

    const phases = events.map((e) => e.phase);
    expect(phases).toContain('decoding');
    expect(phases).toContain('resizing');
    expect(phases).toContain('encoding');
    expect(phases).toContain('finalising');

    const encoding = events.filter((e) => e.phase === 'encoding');
    expect(encoding.length).toBeGreaterThan(1);

    for (const event of encoding) {
      if (event.phase !== 'encoding') continue;
      // "pass 4/8 · 112 KB" — every field the UI shows must be real.
      expect(event.pass).toBeGreaterThan(0);
      expect(event.maxPasses).toBe(8);
      expect(event.currentBytes).toBeGreaterThan(0);
    }

    // Pass numbers strictly increase; a fake bar would not.
    const passNumbers = encoding.map((e) => (e.phase === 'encoding' ? e.pass : 0));
    for (let i = 1; i < passNumbers.length; i += 1) {
      expect(passNumbers[i]).toBeGreaterThan(passNumbers[i - 1] as number);
    }
  });
});

describe('cancellation', () => {
  it('stops a target-size search within one pass of being cancelled', async () => {
    const bytes = await makeJpegBytes(FOUR_MP, FOUR_MP);
    const pool = newPool();
    const encodingPasses: number[] = [];

    let cancelled = false;
    const pending = pool.process(
      makeRequest(
        'cancel-1',
        bytes,
        makeConfig({ sizeMode: { kind: 'target', targetBytes: 40_000 } }),
      ),
      (event) => {
        if (event.phase !== 'encoding') return;
        encodingPasses.push(event.pass);
        if (!cancelled) {
          cancelled = true;
          void pool.cancel('cancel-1');
        }
      },
    );

    await expect(pending).rejects.toThrow();

    const passesAtCancel = encodingPasses[0] ?? 0;
    const finalPass = encodingPasses[encodingPasses.length - 1] ?? 0;
    // The signal is checked before EVERY encode pass (I-6), so at most one
    // more pass can complete after cancel() lands.
    expect(finalPass - passesAtCancel).toBeLessThanOrEqual(1);
    expect(finalPass).toBeLessThan(8);
  });
});

describe('batch behaviour', () => {
  it('completes a 10-file batch across a multi-worker pool', async () => {
    const pool = newPool(2);
    const inputs = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeJpegBytes(900, 700, i + 1)),
    );

    const responses = await Promise.all(
      inputs.map((bytes, i) =>
        pool.process(
          makeRequest(
            'batch-' + i,
            bytes,
            makeConfig({ sizeMode: { kind: 'target', targetBytes: 60_000 } }),
          ),
        ),
      ),
    );

    expect(responses).toHaveLength(10);
    for (const response of responses) {
      expect(response.ok).toBe(true);
      if (response.ok) expect(response.result.sizeBytes).toBeLessThanOrEqual(60_000);
    }
    // Every source buffer was transferred, not copied.
    for (const bytes of inputs) expect(bytes.byteLength).toBe(0);
  });

  it('does not grow the heap across repeated runs', async () => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    if (perf.memory === undefined) {
      // Chrome-only API; the assertion is meaningless elsewhere and a fake
      // pass would be worse than an honest skip.
      expect(true).toBe(true);
      return;
    }

    const pool = newPool(1);
    // Warm up so one-time allocations are not counted as growth.
    for (let i = 0; i < 3; i += 1) {
      await pool.process(makeRequest('warm-' + i, await makeJpegBytes(1200, 900, i)));
    }
    const before = perf.memory.usedJSHeapSize;

    for (let i = 0; i < 10; i += 1) {
      await pool.process(makeRequest('mem-' + i, await makeJpegBytes(1200, 900, i + 50)));
    }
    const after = perf.memory.usedJSHeapSize;

    // Bitmaps are closed in a finally block, so growth should be bounded by GC
    // timing rather than by leaked pixel buffers. 10 x 1.08 MP would be ~43 MB
    // of leaked bitmaps; 25 MB catches that with room for ordinary churn.
    expect(after - before).toBeLessThan(25 * 1024 * 1024);
  });
});

describe('the main thread stays responsive', () => {
  it('never blocks for more than 50 ms during a 4 MP conversion', async () => {
    // Build the input BEFORE measuring — generating it is main-thread work and
    // is not what this test is about.
    const bytes = await makeJpegBytes(FOUR_MP, FOUR_MP);
    const pool = newPool();
    // Let the worker spin up so startup is not counted either.
    await pool.process(makeRequest('warmup', await makeJpegBytes(200, 200)));

    /** Samples how late a 5 ms interval actually fires while `work` runs. */
    const sampleGaps = async (work: () => Promise<unknown>): Promise<number[]> => {
      const gaps: number[] = [];
      let previous = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        gaps.push(now - previous);
        previous = now;
      }, 5);
      try {
        await work();
      } finally {
        clearInterval(timer);
      }
      return gaps;
    };

    /**
     * A CONTROL RUN, measuring the same timer with no conversion happening.
     *
     * This test used to assert an absolute `max(gap) < 50ms`, which conflated
     * two different things: whether OUR work blocks the main thread, and whether
     * the machine is busy. It passed alone and failed at 114 ms when run right
     * after the other gates — a flake that arrived the moment
     * `scripts/verify.mjs` started running everything back to back (docs/12
     * D-93). A gate that reports failure because a build finished thirty seconds
     * earlier is worse than no gate: an agent cannot act on its verdict.
     *
     * Timer starvation under load hits the control exactly as hard as the real
     * run, so the DELTA isolates the claim this test actually makes.
     */
    const baseline = await sampleGaps(
      () => new Promise((resolve) => setTimeout(resolve, 600)),
    );

    const gaps = await sampleGaps(() =>
      pool.process(
        makeRequest(
          'responsive-1',
          bytes,
          makeConfig({ sizeMode: { kind: 'target', targetBytes: 90_000 } }),
        ),
      ),
    );

    expect(gaps.length).toBeGreaterThan(3);
    expect(baseline.length).toBeGreaterThan(3);

    /**
     * A SECOND control, after the conversion.
     *
     * One baseline taken before is not enough: machine load drifts over a run,
     * so a quiet baseline followed by a busy conversion still produced an
     * intermittent failure under `verify`. Taking the control on both sides and
     * using the worse of the two makes the comparison robust to drift in either
     * direction, at the cost of 600 ms.
     */
    const baselineAfter = await sampleGaps(
      () => new Promise((resolve) => setTimeout(resolve, 600)),
    );

    const worstBaseline = Math.max(Math.max(...baseline), Math.max(...baselineAfter));
    const worstDuring = Math.max(...gaps);

    /**
     * All compute is in the worker by construction, so a 4 MP conversion should
     * cost the main thread nothing beyond servicing postMessage. 40 ms of
     * headroom over whatever this machine was already doing is generous for
     * that, and still catches the regression that matters — moving encode onto
     * the main thread would add hundreds of milliseconds, not tens.
     */
    expect(
      worstDuring,
      `worst gap during conversion ${worstDuring.toFixed(1)}ms vs idle baseline ` +
        `${worstBaseline.toFixed(1)}ms on this machine`,
    ).toBeLessThan(worstBaseline + 40);
  });
});

describe('E_TOO_LARGE — the memory guard, actually wired in (docs/12 D-43)', () => {
  /**
   * assessMemoryRisk and E_TOO_LARGE were both fully built and unit-tested in
   * Milestone 2, but nothing in the running pipeline ever called them — decode
   * only ever prescaled via maxPixels, so an oversized image always silently
   * succeeded at a smaller size instead of surfacing the documented error.
   * Milestone 7's batch acceptance ("one oversized, flagged with a specific
   * error") is what surfaced the gap, since it cannot be tested if the
   * behaviour does not exist.
   *
   * Resolution: below the per-device soft budget, the docs/04 §3 flowchart's
   * silent PRESCALE is unchanged. Above a hard ceiling, the decode is refused.
   *
   * That ceiling is DEVICE-SCALED as of docs/12 D-57 (WO-1). D-43 applied the
   * 80 MP figure from docs/06 §3.4 universally, but that number was measured on
   * mobile Safari — so a 32 GB workstation refused a 100 MP panorama it could
   * handle, while the site advertised no such cap. It now stays at 80 MP where
   * it was measured (mobile, or under 8 GB) and scales with real memory above
   * that, capped at 300 MP.
   */
  const lowMemoryDevice = resolveDeviceProfile({ deviceMemoryGb: 4, hardwareConcurrency: 4 });
  const highMemoryDevice = resolveDeviceProfile({ deviceMemoryGb: 16, hardwareConcurrency: 16 });

  async function ninetyMegapixelPng(): Promise<ArrayBuffer> {
    const canvas = new OffscreenCanvas(10_000, 9_000); // 90 MP
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, 10_000, 9_000);
    return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
  }

  it('hard-rejects a 90 MP image on a 4 GB device, naming the real dimensions', async () => {
    const bytes = await ninetyMegapixelPng();
    const pool = newPool(1, lowMemoryDevice);
    const response = await pool.process(makeRequest('oversized-1', bytes, makeConfig()));

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('E_TOO_LARGE');
    expect(response.error.message).toContain('10000');
    expect(response.error.message).toContain('9000');
    expect(response.error.message).not.toMatch(/[{}]/);
    expect(response.error.recoverable).toBe(true);
  }, 60_000);

  it(
    'WO-1: the SAME 90 MP image succeeds on a 16 GB device rather than being refused ' +
      'a limit that device does not have',
    async () => {
      const bytes = await ninetyMegapixelPng();
      const pool = newPool(1, highMemoryDevice);
      const response = await pool.process(makeRequest('oversized-hi', bytes, makeConfig()));

      // It may be PRESCALED by the soft budget — that is the docs/04 §3
      // flowchart working as designed. What it must NOT be is hard-refused.
      expect(response.ok, JSON.stringify(response.ok ? null : response.error)).toBe(true);
    },
    60_000,
  );

  it('leaves an image just under the ceiling completely unaffected', async () => {
    // 2400x2400 encodes small; well under any tier's ceiling.
    const bytes = await makeJpegBytes(2400, 2400);
    const pool = newPool();
    const response = await pool.process(makeRequest('normal-1', bytes, makeConfig()));
    expect(response.ok).toBe(true);
  }, 30_000);
});

describe('a source already under target is never inflated (D-91)', () => {
  /**
   * Reported from outside: a 57 KB JPG with a 100 KB target came back at 89 KB,
   * labelled "56.9% larger". Step 0 of the search probes maxQuality, 89 KB is
   * genuinely under 100 KB, so it settled in one pass and called it a win.
   * Nobody asked whether re-encoding was worth doing.
   *
   * The output must still be a RE-ENCODE, not the original bytes passed through
   * — that is what strips EXIF and GPS, and quietly forwarding a smaller file
   * with the location intact would be the wrong trade for this product.
   */
  it('does not return a file larger than the source', async () => {
    /**
     * The source is encoded at q35 — deliberately HARDER than the search's
     * maxQuality of 95. That is what makes this reproduce: re-encoding an
     * already-squeezed JPEG at q95 costs MORE bytes than the original. My first
     * attempt at this test used the default q95 source and passed with the bug
     * still in place, which is worth more as a warning than the test is.
     */
    const bytes = await makeJpegBytes(1600, 1200, 42, 0.35);
    const sourceSize = bytes.byteLength;
    // A target the source ALREADY satisfies, by a wide margin.
    const targetBytes = sourceSize * 4;

    const pool = newPool();
    const response = await pool.process(
      makeRequest('under-target', bytes, makeConfig({ sizeMode: { kind: 'target', targetBytes } })),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const { result } = response;

    expect(result.sizeBytes).toBeLessThanOrEqual(targetBytes);
    // The actual regression: the output must not be bigger than what came in.
    expect(
      result.sizeBytes,
      `source ${sourceSize} B, target ${targetBytes} B, got ${result.sizeBytes} B`,
    ).toBeLessThanOrEqual(sourceSize);
    // The user's ceiling was met, so nothing may claim otherwise.
    expect(result.targetMet).toBe(true);

    // Still a real, decodable image rather than a copied buffer.
    const bitmap = await createImageBitmap(result.blob);
    try {
      expect(bitmap.width).toBe(1600);
      expect(bitmap.height).toBe(1200);
    } finally {
      bitmap.close();
    }
  }, 30_000);

  it('still reports success when the source cannot be beaten', async () => {
    /**
     * A tiny source is close to the floor of what JPEG can represent, so the
     * tightened target may be genuinely unreachable. The user asked for "under
     * N bytes" and has it either way — surfacing E_TARGET_UNREACHABLE here
     * would be a lie about a job that succeeded, which is why targetMet is
     * judged against the user's figure and not the tightened one.
     */
    const bytes = await makeJpegBytes(64, 64);
    const targetBytes = 500_000;

    const pool = newPool();
    const response = await pool.process(
      makeRequest('tiny-source', bytes, makeConfig({ sizeMode: { kind: 'target', targetBytes } })),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.result.sizeBytes).toBeLessThanOrEqual(targetBytes);
    expect(response.result.targetMet).toBe(true);
  }, 30_000);
});
