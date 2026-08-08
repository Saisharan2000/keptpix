/**
 * src/core/pdf/budget.ts
 *
 * How large a document this device can be asked to build.
 *
 * Building ONE file out of many is structurally different from converting them
 * one at a time. The image pipeline peaks at a single decoded bitmap and can
 * process fifty files in sequence on a phone, because each one is released
 * before the next begins. A PDF cannot: every page's bytes must be live at the
 * moment the document is assembled, and the finished document is roughly their
 * sum again. Peak is about twice the input, and it arrives all at once.
 *
 * Without a limit, forty photos on a phone is not a slow conversion — it is a
 * tab that disappears, with no error, after the user has waited. That is the
 * worst failure this product can produce, so it is refused up front with a
 * number the user can act on.
 *
 * Pure — ADR-006. `core/guards.ts` owns the same job for single images; this is
 * deliberately a separate function rather than an extra branch in it, because
 * the quantity being bounded is different (bytes held simultaneously, not
 * pixels decoded).
 */
import type { DeviceProfile } from '../types';

/**
 * Share of device memory a document may occupy.
 *
 * Lower than `MEMORY_BUDGET_FRACTION` (0.25) in guards.ts, for two reasons that
 * compound: the peak is about 2x the input rather than 1x, and it is reached
 * with every buffer simultaneously live, so the allocator has no opportunity to
 * reuse anything. 0.15 of reported memory therefore describes a real ceiling of
 * roughly 0.3 while assembling.
 */
export const PDF_BUDGET_FRACTION = 0.15;

/**
 * Floor for the budget, in bytes.
 *
 * `navigator.deviceMemory` is coarse, capped at 8 on many browsers, and absent
 * entirely on others — Safari reports nothing. A device that under-reports
 * must not end up unable to make a two-page PDF, so the budget never falls
 * below this regardless of what the profile claims.
 */
export const PDF_MIN_BUDGET_BYTES = 64 * 1024 * 1024;

/** Ceiling regardless of reported memory — beyond this, browsers fail anyway. */
export const PDF_MAX_BUDGET_BYTES = 1_500 * 1024 * 1024;

/** Bytes of source images this device may be asked to assemble into one file. */
export function pdfInputBudgetBytes(device: DeviceProfile): number {
  // `Math.max(0, NaN)` is NaN, and NaN propagates through the clamp to give a
  // NaN budget — which compares false against everything, so every job would
  // be accepted and the guard would silently not exist. `deviceMemoryGb` comes
  // from `navigator.deviceMemory`, which is absent on Safari.
  const raw = device.deviceMemoryGb;
  const gb = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const scaled = gb * 1024 ** 3 * PDF_BUDGET_FRACTION;
  return Math.min(PDF_MAX_BUDGET_BYTES, Math.max(PDF_MIN_BUDGET_BYTES, Math.floor(scaled)));
}

export interface PdfBudgetAssessment {
  readonly withinBudget: boolean;
  readonly totalBytes: number;
  readonly budgetBytes: number;
  /**
   * How many of the given files, in order, DO fit.
   *
   * Present so the message can say "the first 23 of these 40 would fit" rather
   * than only refusing. A user who is told what would work can act; one who is
   * told no cannot.
   */
  readonly fittingCount: number;
}

/**
 * Whether these files can be assembled here.
 *
 * Takes sizes rather than files so it stays pure and trivially testable.
 */
export function assessPdfBudget(
  sizes: readonly number[],
  device: DeviceProfile,
): PdfBudgetAssessment {
  const budgetBytes = pdfInputBudgetBytes(device);

  let totalBytes = 0;
  let fittingCount = 0;
  let running = 0;
  // A PREFIX, not a subset. The message this feeds says "the first N would
  // fit", and files are pages in the order given — so counting must stop at the
  // first one that does not fit rather than skipping it and continuing with
  // whatever smaller files come after. Otherwise "the first 2 would fit" can
  // describe files 2 and 3, and following the advice loses a page.
  let stopped = false;
  for (const size of sizes) {
    const bytes = Number.isFinite(size) ? Math.max(0, size) : 0;
    totalBytes += bytes;
    if (stopped) continue;
    if (running + bytes <= budgetBytes) {
      running += bytes;
      fittingCount += 1;
    } else {
      stopped = true;
    }
  }

  return {
    withinBudget: totalBytes <= budgetBytes,
    totalBytes,
    budgetBytes,
    fittingCount,
  };
}

/** Human-readable size, matching the units used elsewhere in the UI. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  if (bytes >= 1024 ** 2) return Math.round(bytes / 1024 ** 2) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
