/**
 * src/state/selectors.ts — derived views over AppState.
 */
import type { BatchSummary, Job, JobStatus, SourceImage } from '../core/types';

export interface JobView {
  job: Job;
  source: SourceImage;
}

export function joinJobs(
  jobs: ReadonlyMap<string, Job>,
  sources: ReadonlyMap<string, SourceImage>,
): JobView[] {
  const out: JobView[] = [];
  for (const job of jobs.values()) {
    const source = sources.get(job.sourceId);
    if (source !== undefined) out.push({ job, source });
  }
  return out.sort((a, b) => a.source.addedAt - b.source.addedAt);
}

/**
 * A job whose target was unreachable is DONE, not failed — it has a usable
 * result and a warning. Counting it as a failure would contradict docs/04 §6
 * and make the batch summary lie.
 */
export function isWarning(job: Job): boolean {
  return job.status === 'done' && job.error?.code === 'E_TARGET_UNREACHABLE';
}

export function countByStatus(jobs: Iterable<Job>): Record<JobStatus, number> {
  const counts: Record<JobStatus, number> = {
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const job of jobs) counts[job.status] += 1;
  return counts;
}

export function summarise(views: readonly JobView[]): BatchSummary {
  let done = 0;
  let failed = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;
  let earliest = Number.POSITIVE_INFINITY;
  let latest = 0;

  for (const { job, source } of views) {
    totalInputBytes += source.sizeBytes;
    if (job.status === 'done' && job.result !== null) {
      done += 1;
      totalOutputBytes += job.result.sizeBytes;
    } else if (job.status === 'failed') {
      failed += 1;
    }
    if (job.startedAt !== null) earliest = Math.min(earliest, job.startedAt);
    if (job.finishedAt !== null) latest = Math.max(latest, job.finishedAt);
  }

  /**
   * SIGNED. Negative means the batch grew, which is a real and expected
   * outcome converting from a more efficient format (HEIC → JPEG).
   *
   * This was `Math.max(0, ...)`, so a batch that grew reported "saved 0%" —
   * the same dishonesty the per-file badge had. Clamping here hid the sign
   * from every consumer at once, which is worse: the UI could not have told
   * the truth even if it wanted to.
   */
  const savedBytes = totalInputBytes - totalOutputBytes;
  return {
    total: views.length,
    done,
    failed,
    totalInputBytes,
    totalOutputBytes,
    savedBytes,
    savedPercent: totalInputBytes > 0 ? (savedBytes / totalInputBytes) * 100 : 0,
    elapsedMs: Number.isFinite(earliest) && latest > earliest ? latest - earliest : 0,
  };
}

/** All finished results, in display order, for "Download all". */
export function completedResults(views: readonly JobView[]): JobView[] {
  return views.filter((v) => v.job.status === 'done' && v.job.result !== null);
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};
