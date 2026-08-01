/**
 * Milestone 7 — target-size realism, run against REAL photos.
 *
 * docs/10 M7 asks for real sample photos spanning 1-20 MP against 20/50/100 KB
 * targets, asserting: 100% of outputs at or under target, p95 passes <= 8, and
 * zero silent failures.
 *
 * The 500-case property test in Milestone 2 provides the breadth against
 * synthetic encoder curves; this provides the realism against an actual JPEG
 * encoder and actual photographic content. docs/03 §6 requires both.
 *
 * Source material: tests/fixtures/images/ — real camera-roll files. They are
 * ~3 MP natively, so larger sizes are produced by resampling the same real
 * content rather than by generating synthetic noise, which would compress
 * nothing like a photograph.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, hasFixture } from './fixtures';
import { ingestFiles, QueueController } from '../../src/state/queue';
import { useStore } from '../../src/state/store';
import { joinJobs } from '../../src/state/selectors';

const TARGETS = [20_000, 50_000, 100_000];
const MEGAPIXELS = [1, 3, 8, 12];

const FIXTURES = ['IMG_4474.png', 'IMG_4475.png'];

/** Git-ignored: real photos carry GPS. See tests/fixtures/images/README.md. */
const available = (await Promise.all(FIXTURES.map(hasFixture))).every(Boolean);

/** Resample a real photo to approximately `mp` megapixels, keeping its content. */
async function resample(fixtureName: string, mp: number, name: string): Promise<File> {
  const blob = (await loadFixture(fixtureName)) as Blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const ratio = Math.sqrt((mp * 1_000_000) / (bitmap.width * bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    return new File([out], name, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

let controller: QueueController;

beforeEach(() => {
  useStore.getState().clearAll();
  controller = new QueueController(useStore);
});

afterEach(async () => {
  await controller.dispose();
  useStore.getState().clearAll();
});

describe.skipIf(!available)('target-size against real photos', () => {
  it(
    'never overshoots, never fails silently, and stays inside the pass budget',
    async () => {
      const failures: string[] = [];
      const passCounts: number[] = [];
      let met = 0;
      let unreachable = 0;

      for (const [index, fixture] of FIXTURES.entries()) {
        for (const mp of MEGAPIXELS) {
          const file = await resample(fixture, mp, 'photo-' + index + '-' + mp + 'mp.jpg');

          for (const targetBytes of TARGETS) {
            useStore.getState().clearAll();
            const { accepted } = await ingestFiles([file]);
            useStore.getState().addSources(accepted);
            useStore.getState().setConfig({
              outputFormat: 'jpeg',
              sizeMode: { kind: 'target', targetBytes },
            });

            await controller.start(accepted.map((s) => s.id));

            const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
            const label = 'photo' + index + ' ' + mp + 'MP -> ' + targetBytes;

            if (view === undefined) {
              failures.push(label + ': no job produced');
              continue;
            }
            const { job } = view;

            // Zero silent failures: every run ends in a terminal state with
            // either a result or a coded error, never nothing.
            if (job.status !== 'done' && job.status !== 'failed') {
              failures.push(label + ': ended in status ' + job.status);
              continue;
            }

            if (job.result === null) {
              failures.push(label + ': no result attached');
              continue;
            }

            passCounts.push(job.passesUsed);

            if (job.error?.code === 'E_TARGET_UNREACHABLE') {
              unreachable += 1;
              // A miss must still hand back a usable, downloadable file.
              if (job.result.blob.size <= 0) {
                failures.push(label + ': unreachable with no best-effort file');
              }
              if (job.error.bestEffort === undefined) {
                failures.push(label + ': unreachable without bestEffort attached');
              }
              continue;
            }

            met += 1;
            // THE assertion — an output claimed as met is never over target.
            if (job.result.sizeBytes > targetBytes) {
              failures.push(
                label + ': OVERSHOOT ' + job.result.sizeBytes + ' > ' + targetBytes,
              );
            }
            if (job.result.targetMet !== true) {
              failures.push(label + ': targetMet was ' + String(job.result.targetMet));
            }
          }
        }
      }

      expect(failures).toEqual([]);

      // p95 passes <= 8
      const sorted = [...passCounts].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      expect(p95, 'p95 passes').toBeLessThanOrEqual(8);
      expect(Math.max(...passCounts), 'max passes').toBeLessThanOrEqual(8);

      // Sanity: the suite would be meaningless if nothing ever succeeded, and
      // the unreachable count is reported so a regression that quietly turns
      // successes into soft failures is visible.
      expect(met + unreachable).toBe(MEGAPIXELS.length * TARGETS.length * 2);
      expect(met).toBeGreaterThan(0);
      console.log('target-size: ' + met + ' met, ' + unreachable + ' unreachable, p95 ' + p95 + ' passes');
    },
    240_000,
  );
});
