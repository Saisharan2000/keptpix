/**
 * docs/12 D-61 — size reporting must be honest when a conversion GROWS a file.
 *
 * Found on a real iPhone during the launch-gate test: a 2.2 MB HEIC converted
 * to a 3.4 MB JPEG, and the UI reported "0% ↓" in success green. The growth is
 * expected (HEVC intra-coding is ~2x more efficient than JPEG, so the same
 * picture genuinely costs more bytes as a JPEG) — the defect was claiming a
 * reduction that did not happen.
 *
 * The clamp lived in `summarise`, which meant NO consumer could tell the truth
 * even if it wanted to. These lock the sign in at the source.
 */
import { describe, it, expect } from 'vitest';
import { summarise, type JobView } from '../../src/state/selectors';
import type { Job, JobResult, SourceImage } from '../../src/core/types';

function view(inputBytes: number, outputBytes: number): JobView {
  const source = {
    id: 's1',
    name: 'photo.heic',
    sizeBytes: inputBytes,
    detectedFormat: 'heic',
    declaredMime: 'image/heic',
    dimensions: null,
    metadata: null,
    addedAt: 1,
  } as unknown as SourceImage;

  const result = {
    sizeBytes: outputBytes,
    format: 'jpeg',
    dimensions: { width: 100, height: 100 },
  } as unknown as JobResult;

  const job = {
    id: 'j1',
    sourceId: 's1',
    status: 'done',
    progress: 1,
    phase: null,
    passesUsed: 1,
    result,
    error: null,
    startedAt: 1,
    finishedAt: 2,
  } as unknown as Job;

  return { job, source };
}

describe('summarise — size delta is SIGNED (docs/12 D-61)', () => {
  it('reports a real reduction as positive', () => {
    const s = summarise([view(1000, 400)]);
    expect(s.savedBytes).toBe(600);
    expect(s.savedPercent).toBeCloseTo(60, 5);
  });

  it('reports GROWTH as negative rather than clamping it to zero', () => {
    // The real case: 2.2 MB HEIC -> 3.4 MB JPEG.
    const s = summarise([view(2_200_000, 3_400_000)]);
    expect(s.savedBytes).toBeLessThan(0);
    expect(s.savedPercent).toBeLessThan(0);
    // The specific lie this replaces: "saved 0%".
    expect(s.savedPercent).not.toBe(0);
    expect(s.savedPercent).toBeCloseTo(-54.5, 0);
  });

  it('reports no change as exactly zero', () => {
    const s = summarise([view(1000, 1000)]);
    expect(s.savedBytes).toBe(0);
    expect(s.savedPercent).toBe(0);
  });
});
