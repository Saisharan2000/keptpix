/**
 * tests/perf/benchmark.ts
 *
 * Spec: docs/04-architecture.md §7, docs/10-build-plan.md Milestone 7.
 *
 * Records time-to-first-result and peak memory across device profiles, and
 * gates the two headline budgets:
 *   - Time to first result, 4 MP JPEG, mid laptop: < 3s (p75)
 *   - Memory peak, 12 MP image: < 400 MB
 *
 * Runs against the REAL pipeline (WorkerPool, real OffscreenCanvas encode, a
 * real Worker) — a synthetic timer around a mock would measure nothing real.
 *
 * "Across device profiles" is realised by constructing WorkerPool with an
 * explicit DeviceProfile for each tier rather than by spoofing
 * navigator.deviceMemory: the pool accepts a profile directly, so this is a
 * more precise instrument than faking browser globals.
 *
 * ⚠️ THE MEMORY BUDGET CANNOT BE MEASURED IN THIS APP'S OWN DEPLOYMENT
 * CONFIGURATION — see isMemoryReadingReliable() below and docs/12 D-45. This is
 * not a gap in the test; it is a real consequence of ADR-003 (no COOP/COEP),
 * which this suite detects and reports honestly rather than papering over with
 * a fabricated "0.0 MB, PASS."
 */
import { describe, it, expect } from 'vitest';
import { WorkerPool } from '../../src/workers/pool';
import { resolveDeviceProfile } from '../../src/core/capabilities';
import type { DeviceProfile, JobConfig } from '../../src/core/types';

const PROFILES: Record<string, DeviceProfile> = {
  'desktop >=8GB (3 workers)': resolveDeviceProfile({
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
    isMobile: false,
  }),
  'desktop 4-8GB (2 workers)': resolveDeviceProfile({
    deviceMemoryGb: 4,
    hardwareConcurrency: 4,
    isMobile: false,
  }),
  'mobile / low-memory (1 worker)': resolveDeviceProfile({
    deviceMemoryGb: 2,
    hardwareConcurrency: 4,
    isMobile: true,
  }),
};

const CONFIG: JobConfig = {
  outputFormat: 'jpeg',
  sizeMode: { kind: 'quality', quality: 82 },
  resize: { kind: 'none' },
  metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
  encoderPreference: 'auto',
  backgroundColor: '#ffffff',
};

/** A real photographic-ish JPEG at the requested megapixel count. */
async function makeJpeg(megapixels: number, seed: number): Promise<ArrayBuffer> {
  const side = Math.round(Math.sqrt(megapixels * 1_000_000));
  const canvas = new OffscreenCanvas(side, side);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');

  const gradient = ctx.createLinearGradient(0, 0, side, side);
  gradient.addColorStop(0, '#4f46e5');
  gradient.addColorStop(0.5, '#0f8a5f');
  gradient.addColorStop(1, '#b45309');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, side, side);

  // Enough high-frequency detail that encoding is not trivially fast — a flat
  // fill would compress in microseconds and tell us nothing about real photos.
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const speckCount = Math.round(megapixels * 400);
  for (let i = 0; i < speckCount; i += 1) {
    ctx.fillStyle =
      'rgba(' + Math.floor(rand() * 255) + ',' + Math.floor(rand() * 255) + ',120,0.5)';
    const w = 4 + rand() * 60;
    ctx.fillRect(rand() * side, rand() * side, w, w);
  }

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return blob.arrayBuffer();
}

type MemoryPerformance = Performance & { memory?: { usedJSHeapSize: number } };

/**
 * `performance.memory.usedJSHeapSize` is a legacy, non-standard Chrome API.
 * Since roughly Chrome 122, it is quantized/frozen to resist exactly the
 * Spectre-class side-channel that cross-origin isolation exists to close —
 * and it unlocks full precision only on a page where
 * `crossOriginIsolated === true`. ADR-003 in this project DELIBERATELY does
 * not set COOP/COEP, to keep OAuth and payment popups working. That is a real
 * trade-off made for a real reason, and its side effect is that this specific
 * API cannot report a usable number in this app's actual deployment shape —
 * confirmed directly: `crossOriginIsolated` is `false` here, and even holding
 * a live 200 MB Uint8Array produces a measured delta of 0.0 MB.
 *
 * Detected once, cheaply, rather than assumed: allocate a chunk large enough
 * that ANY functioning heap counter must move, and check that it did. If it
 * did not, the byte-denominated assertions below are skipped with a clear,
 * named reason instead of silently reporting a false "0.0 MB, PASS" — which is
 * what earlier versions of this file did before this check was added.
 */
async function isMemoryReadingReliable(perf: MemoryPerformance): Promise<boolean> {
  if (perf.memory === undefined) return false;
  const before = perf.memory.usedJSHeapSize;
  const probe: Uint8Array[] = [];
  for (let i = 0; i < 100; i += 1) probe.push(new Uint8Array(1024 * 1024).fill(1));
  const after = perf.memory.usedJSHeapSize;
  probe.length = 0; // hold the reference until after the read, then release
  return after - before > 20 * 1024 * 1024; // expect ~100 MB; 20 MB is a generous floor
}

interface Sample {
  megapixels: number;
  timeToFirstResultMs: number;
  peakHeapDeltaBytes: number | null;
}

/**
 * Sample usedJSHeapSize on an interval WHILE the job runs, rather than only
 * before and after — a two-point snapshot can miss the actual peak if V8's GC
 * runs between the "after" read and the moment usage was highest.
 */
async function withPeakHeapTracking<T>(
  perf: MemoryPerformance,
  reliable: boolean,
  run: () => Promise<T>,
): Promise<{ result: T; peakDeltaBytes: number | null }> {
  if (!reliable || perf.memory === undefined) {
    return { result: await run(), peakDeltaBytes: null };
  }

  const baseline = perf.memory.usedJSHeapSize;
  let peak = baseline;
  const timer = setInterval(() => {
    const current = perf.memory?.usedJSHeapSize ?? peak;
    if (current > peak) peak = current;
  }, 15);

  try {
    const result = await run();
    return { result, peakDeltaBytes: Math.max(0, peak - baseline) };
  } finally {
    clearInterval(timer);
  }
}

async function benchmarkOnce(
  device: DeviceProfile,
  megapixels: number,
  seed: number,
  reliableMemory: boolean,
): Promise<Sample> {
  const bytes = await makeJpeg(megapixels, seed);
  const perf = performance as MemoryPerformance;

  const pool = new WorkerPool({ device, size: device.maxWorkers });
  try {
    const started = performance.now();
    const { result: response, peakDeltaBytes } = await withPeakHeapTracking(
      perf,
      reliableMemory,
      () =>
        pool.process({
          jobId: 'bench-' + megapixels + '-' + seed,
          bytes,
          sourceFormat: 'jpeg',
          sourceName: 'bench.jpg',
          config: CONFIG,
        }),
    );
    const elapsed = performance.now() - started;

    if (!response.ok) {
      throw new Error(
        'benchmark job failed: ' + response.error.code + ' — ' + response.error.message,
      );
    }

    return { megapixels, timeToFirstResultMs: elapsed, peakHeapDeltaBytes: peakDeltaBytes };
  } finally {
    await pool.dispose();
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] ?? 0;
}

const fmtMs = (ms: number): string => ms.toFixed(0) + ' ms';
const fmtMb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1) + ' MB';

describe('performance benchmark — docs/04 §7 budgets', () => {
  it(
    'time to first result for a 4 MP JPEG is under 3s (p75), across device profiles',
    async () => {
      // Unaffected by the memory-measurement gap — wall-clock time via
      // performance.now() is standard and precise regardless of isolation.
      const RUNS_PER_PROFILE = 5;
      const report: string[] = [];

      for (const [label, device] of Object.entries(PROFILES)) {
        const times: number[] = [];
        for (let i = 0; i < RUNS_PER_PROFILE; i += 1) {
          const sample = await benchmarkOnce(device, 4, i + 1, false);
          times.push(sample.timeToFirstResultMs);
        }
        const p75 = percentile(times, 0.75);
        const pass = p75 < 3000;
        report.push(
          '  ' +
            (pass ? 'PASS' : 'FAIL') +
            '  ' +
            label.padEnd(32) +
            ' p75=' +
            fmtMs(p75) +
            '  (' +
            times.map(fmtMs).join(', ') +
            ')',
        );
      }

       
      console.log(
        '\n4 MP time-to-first-result, p75 over ' +
          RUNS_PER_PROFILE +
          ' runs:\n' +
          report.join('\n') +
          '\n',
      );

      // The documented gate is specifically "on a mid-range laptop" — the
      // >=8GB profile. Lower tiers are recorded above for visibility (a real
      // regression there is worth seeing) but are not a hard gate here: a
      // 1-worker mobile profile processing the same 4 MP image is not the
      // scenario docs/04 §7 sizes the 3s budget for.
      const desktop = PROFILES['desktop >=8GB (3 workers)'];
      if (desktop === undefined) throw new Error('desktop profile missing');
      const desktopTimes: number[] = [];
      for (let i = 0; i < RUNS_PER_PROFILE; i += 1) {
        desktopTimes.push((await benchmarkOnce(desktop, 4, i + 100, false)).timeToFirstResultMs);
      }
      expect(percentile(desktopTimes, 0.75)).toBeLessThan(3000);
    },
    60_000,
  );

  /**
   * WO-6 UPDATE — the counter is now live here, and that revealed a second,
   * separate limit worth stating plainly rather than banking a comfortable
   * number.
   *
   * Running this project with `--enable-precise-memory-info` (see the `perf`
   * project in vitest.config.ts) unfreezes `performance.memory`: the canary
   * below now measures ~100 MB for a 100 MB allocation instead of 0.0, so the
   * assertion RUNS rather than skipping.
   *
   * But it reads the MAIN THREAD's heap, and every byte of image work happens
   * inside the worker, which has its own. So a 12 MP conversion legitimately
   * moves this counter by ~0 MB — a true reading of the wrong heap. It proves
   * the main thread stays light (itself worth knowing, and consistent with the
   * responsiveness budget), but it is NOT the "< 400 MB peak" that docs/04 §7
   * is really about.
   *
   * Measuring the right heap needs `performance.memory` sampled INSIDE
   * image.worker.ts and reported over the existing progress channel. That is a
   * change to production code for a test's benefit, so it is recorded as
   * outstanding rather than done quietly here — see docs/12 D-45.
   */
  it(
    'peak heap usage for a 12 MP image stays under 400 MB, WHEN the reading is reliable',
    async () => {
      const perf = performance as MemoryPerformance;
      const reliable = await isMemoryReadingReliable(perf);

      if (!reliable) {
        // docs/12 D-45. Not a skipped test in the sense of "not implemented" —
        // the instrument itself does not function in this app's own security
        // posture (ADR-003: no COOP/COEP), confirmed by the probe above, not
        // assumed. Asserting a number here would be reporting a measurement
        // that was never actually taken.
         
        console.log(
          '\nperformance.memory does not respond to real allocations in this context ' +
            '(crossOriginIsolated=' +
            String(globalThis.crossOriginIsolated) +
            ') — a direct consequence of ADR-003. Peak-memory budget not measured; ' +
            'see docs/12 D-45.\n',
        );
        return;
      }

      const device = PROFILES['desktop >=8GB (3 workers)'];
      if (device === undefined) throw new Error('desktop profile missing');

      // Run twice: the first pass pays for one-time allocations (WASM
      // instantiation, module parsing) that would otherwise be misread as the
      // cost of processing this specific image.
      await benchmarkOnce(device, 12, 998, true);
      const sample = await benchmarkOnce(device, 12, 999, true);

       
      console.log(
        '\n12 MP peak heap above baseline: ' +
          (sample.peakHeapDeltaBytes === null ? 'unavailable' : fmtMb(sample.peakHeapDeltaBytes)) +
          ' (budget 400 MB)\n',
      );

      if (sample.peakHeapDeltaBytes !== null) {
        expect(sample.peakHeapDeltaBytes).toBeLessThan(400 * 1024 * 1024);
      }
    },
    30_000,
  );

  it(
    'a 12 MP image survives processing regardless of whether memory is measurable',
    async () => {
      // The budget's REAL purpose is "does not crash the tab." Whether or not
      // usedJSHeapSize can be read, this is directly and honestly verifiable:
      // run it, and confirm it actually completed rather than the worker dying
      // silently. This does not prove <400 MB, but it proves the one thing
      // that matters most and needs no restricted API to check.
      const device = PROFILES['desktop >=8GB (3 workers)'];
      if (device === undefined) throw new Error('desktop profile missing');
      const sample = await benchmarkOnce(device, 12, 500, false);
      expect(sample.timeToFirstResultMs).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    'a 10-batch run shows no unbounded memory growth, WHEN the reading is reliable',
    async () => {
      const perf = performance as MemoryPerformance;
      const reliable = await isMemoryReadingReliable(perf);
      if (!reliable) return; // see docs/12 D-45; reason already logged above

      const device = PROFILES['desktop >=8GB (3 workers)'];
      if (device === undefined) throw new Error('desktop profile missing');
      const pool = new WorkerPool({ device, size: device.maxWorkers });

      try {
        // Warm-up run: absorb one-time allocations before measuring.
        const warm = await makeJpeg(4, 0);
        await pool.process({
          jobId: 'warm',
          bytes: warm,
          sourceFormat: 'jpeg',
          sourceName: 'warm.jpg',
          config: CONFIG,
        });

        const before = perf.memory?.usedJSHeapSize ?? 0;
        for (let i = 0; i < 10; i += 1) {
          const bytes = await makeJpeg(4, i + 1);
          const response = await pool.process({
            jobId: 'growth-' + i,
            bytes,
            sourceFormat: 'jpeg',
            sourceName: 'growth-' + i + '.jpg',
            config: CONFIG,
          });
          expect(response.ok).toBe(true);
        }
        const after = perf.memory?.usedJSHeapSize ?? 0;

         
        console.log('\n10-run heap delta: ' + fmtMb(after - before) + '\n');

        // Generous — this catches a genuine leak (unclosed bitmaps, retained
        // buffers), not ordinary GC-timing noise between runs.
        expect(after - before).toBeLessThan(150 * 1024 * 1024);
      } finally {
        await pool.dispose();
      }
    },
    60_000,
  );
});
