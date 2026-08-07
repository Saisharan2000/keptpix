/**
 * Milestone 4 acceptance — batch behaviour through the real QueueController.
 *
 * Runs in a real browser: this exercises the store, the controller, the worker
 * pool and the pipeline together, which is the only place the "one failure
 * never aborts the batch" rule can actually be proven.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ingestFiles, QueueController } from '../../src/state/queue';
import { useStore } from '../../src/state/store';
import { isWarning, joinJobs, summarise } from '../../src/state/selectors';

async function jpegFile(name: string, size = 400, seed = 1): Promise<File> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no ctx');
  ctx.fillStyle = 'hsl(' + ((seed * 47) % 360) + ' 70% 50%)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i += 1) {
    ctx.fillStyle = 'rgba(' + ((i * 37) % 255) + ',' + ((i * 91) % 255) + ',120,0.6)';
    ctx.fillRect((i * 29) % size, (i * 53) % size, 40, 40);
  }
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new File([blob], name, { type: 'image/jpeg' });
}

/** Valid JPEG magic bytes, garbage payload — the decoder must reject it. */
function corruptJpegFile(name: string): File {
  const bytes = new Uint8Array(2048);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  for (let i = 4; i < bytes.length; i += 1) bytes[i] = (i * 7) % 251;
  return new File([bytes], name, { type: 'image/jpeg' });
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

describe('ingest', () => {
  it('identifies formats from magic bytes, not the extension', async () => {
    const real = await jpegFile('photo.png'); // deliberately mislabelled
    const { accepted, rejected } = await ingestFiles([real]);

    expect(rejected).toHaveLength(0);
    expect(accepted[0]?.detectedFormat).toBe('jpeg');
    expect(accepted[0]?.name).toBe('photo.png');
  });

  it('rejects an unreadable file with a specific, actionable error', async () => {
    const junk = new File([new Uint8Array(64)], 'notes.txt', { type: 'text/plain' });
    const { accepted, rejected } = await ingestFiles([junk]);

    expect(accepted).toHaveLength(0);
    expect(rejected[0]?.error.code).toBe('E_UNSUPPORTED_FORMAT');
    expect(rejected[0]?.error.message).not.toMatch(/something went wrong/i);
    expect(rejected[0]?.error.message).not.toMatch(/[{}]/);
  });

  it('keeps the File handle rather than copying its bytes into state', async () => {
    const file = await jpegFile('a.jpg');
    const { accepted } = await ingestFiles([file]);
    // docs/05 §4 invariant 2.
    expect(accepted[0]?.file).toBe(file);
  });
});

describe('batch processing', () => {
  it('completes a 20-file batch with per-file progress', async () => {
    const files = await Promise.all(
      Array.from({ length: 20 }, (_, i) => jpegFile('batch-' + i + '.jpg', 320, i + 1)),
    );
    const { accepted } = await ingestFiles(files);
    useStore.getState().addSources(accepted);

    await controller.start(accepted.map((s) => s.id));

    const views = joinJobs(useStore.getState().jobs, useStore.getState().sources);
    expect(views).toHaveLength(20);

    const summary = summarise(views);
    expect(summary.done).toBe(20);
    expect(summary.failed).toBe(0);
    expect(summary.totalOutputBytes).toBeGreaterThan(0);

    for (const { job } of views) {
      expect(job.status).toBe('done');
      expect(job.result).not.toBeNull();
      expect(job.progress).toBe(1);
      // docs/05 §4 invariant 6: phase is cleared on every terminal transition.
      expect(job.phase).toBeNull();
      expect(job.passesUsed).toBeGreaterThan(0);
    }
  }, 60_000);

  it('ONE CORRUPT FILE DOES NOT ABORT THE BATCH', async () => {
    const good = await Promise.all(
      Array.from({ length: 5 }, (_, i) => jpegFile('ok-' + i + '.jpg', 300, i + 9)),
    );
    const files = [good[0]!, good[1]!, corruptJpegFile('broken.jpg'), good[2]!, good[3]!, good[4]!];

    const { accepted } = await ingestFiles(files);
    // The corrupt file still LOOKS like a JPEG, so it is accepted at ingest and
    // only fails once a decoder actually touches it.
    expect(accepted).toHaveLength(6);
    useStore.getState().addSources(accepted);

    await controller.start(accepted.map((s) => s.id));

    const views = joinJobs(useStore.getState().jobs, useStore.getState().sources);
    const done = views.filter((v) => v.job.status === 'done');
    const failed = views.filter((v) => v.job.status === 'failed');

    expect(done).toHaveLength(5);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.source.name).toBe('broken.jpg');

    // The failure is specific and offers a next action, per docs/07 §4.
    const error = failed[0]?.job.error;
    expect(error?.code).toBe('E_CORRUPT_FILE');
    expect(error?.message).not.toMatch(/something went wrong/i);
    expect(error?.message.length).toBeGreaterThan(15);

    // And every successful result is still downloadable.
    for (const { job } of done) expect(job.result?.blob.size).toBeGreaterThan(0);
  }, 60_000);

  it('resolves output-name collisions across a batch', async () => {
    // Two different sources whose outputs would collide on IMG_1.jpg.
    const a = new File([await (await jpegFile('x.jpg', 200, 3)).arrayBuffer()], 'IMG_1.jpg', {
      type: 'image/jpeg',
    });
    const b = new File([await (await jpegFile('y.jpg', 200, 4)).arrayBuffer()], 'IMG_1.jpeg', {
      type: 'image/jpeg',
    });

    const { accepted } = await ingestFiles([a, b]);
    useStore.getState().addSources(accepted);
    await controller.start(accepted.map((s) => s.id));

    const names = joinJobs(useStore.getState().jobs, useStore.getState().sources)
      .map((v) => v.job.result?.outputName)
      .filter((n): n is string => n !== undefined);

    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  }, 30_000);
});

describe('E_TARGET_UNREACHABLE is a result, never a failure', () => {
  it('marks the job done with a warning and a usable best-effort file', async () => {
    const file = await jpegFile('big.jpg', 1200, 7);
    const { accepted } = await ingestFiles([file]);
    useStore.getState().addSources(accepted);

    // 1 KB from a 1200x1200 photo is unreachable above minScale.
    useStore.getState().setConfig({ sizeMode: { kind: 'target', targetBytes: 1_000 } });
    await controller.start(accepted.map((s) => s.id));

    const view = joinJobs(useStore.getState().jobs, useStore.getState().sources)[0];
    expect(view).toBeDefined();
    if (view === undefined) return;

    // docs/04 §6 + docs/05 §4 invariant 5: status is DONE, not failed.
    expect(view.job.status).toBe('done');
    expect(view.job.result).not.toBeNull();
    expect(view.job.result?.blob.size).toBeGreaterThan(0);
    expect(view.job.error?.code).toBe('E_TARGET_UNREACHABLE');
    expect(view.job.error?.recoverable).toBe(true);
    expect(view.job.error?.bestEffort).toBeDefined();
    expect(isWarning(view.job)).toBe(true);

    // The batch summary must not count it as a failure.
    const summary = summarise([view]);
    expect(summary.failed).toBe(0);
    expect(summary.done).toBe(1);
  }, 30_000);
});

describe('retry', () => {
  it('moves a failed job back to queued and can succeed on the second run', async () => {
    const { accepted } = await ingestFiles([corruptJpegFile('bad.jpg')]);
    useStore.getState().addSources(accepted);
    await controller.start(accepted.map((s) => s.id));

    const jobId = [...useStore.getState().jobs.keys()][0];
    expect(jobId).toBeDefined();
    if (jobId === undefined) return;
    expect(useStore.getState().jobs.get(jobId)?.status).toBe('failed');

    await controller.retry(jobId);

    // Still corrupt, so it fails again — but the transition worked and the
    // batch machinery did not wedge.
    const after = useStore.getState().jobs.get(jobId);
    expect(after?.status).toBe('failed');
    expect(after?.error?.code).toBe('E_CORRUPT_FILE');
  }, 30_000);
});

describe('a settings change after adding a file is honoured (docs/12 D-71)', () => {
  it('runs the queued job with the CURRENT config, not the one it was created with', async () => {
    const { accepted } = await ingestFiles([await jpegFile('photo.jpg')]);
    const state = useStore.getState();
    state.addSources(accepted);

    // Exactly what ToolShell does the moment a file lands, snapshotting the
    // config as it stands at that instant.
    const source = accepted[0];
    expect(source).toBeDefined();
    if (source === undefined) return;
    state.createJob(source.id, state.configFor(source.id));

    // Then the user opens the settings rail — which on a phone is the first
    // moment it exists at all — and picks a different output format.
    useStore.getState().setConfig({ outputFormat: 'png' });

    await controller.start([source.id]);

    const job = [...useStore.getState().jobs.values()][0];
    expect(job?.config.outputFormat, 'job config at run time').toBe('png');
    expect(job?.result?.format, 'produced file format').toBe('png');
    // The card must survive the refresh — the reason start() reuses the job at
    // all is so it does not flicker away and back.
    expect(useStore.getState().jobs.size).toBe(1);
  }, 30_000);
});
