/**
 * src/core/guards.ts
 *
 * Contract: docs/06-contracts.md §3.4.
 *
 * Budget: deviceMemoryGb * 1024^3 * 0.25.
 * Decoded cost: w * h * 4 * 2.2 (bitmap + working copies + encoder scratch).
 * Mobile gets an extra hard ceiling of 80 megapixels in flight, which is the
 * empirical mobile-Safari crash line.
 */
import type { Dimensions, DeviceProfile, JobErrorCode } from './types';

/** Fraction of device RAM we are willing to hold in decoded pixels. */
export const MEMORY_BUDGET_FRACTION = 0.25;
/** 4 bytes per pixel, times 2.2 for working copies and encoder scratch. */
export const BYTES_PER_PIXEL_FACTOR = 4 * 2.2;
/** docs/06 §3.4 — the empirical mobile-Safari crash line. */
export const MOBILE_MAX_PIXELS = 80_000_000;

export interface MemoryAssessment {
  safe: boolean;
  suggestedMaxPixels: number | null;
  reason?: JobErrorCode;
}

export function assessMemoryRisk(
  dims: Dimensions,
  device: DeviceProfile,
): MemoryAssessment {
  const pixels = Math.max(0, dims.width) * Math.max(0, dims.height);

  const budgetBytes = Math.max(0, device.deviceMemoryGb) * 1024 ** 3 * MEMORY_BUDGET_FRACTION;
  const budgetPixels = Math.floor(budgetBytes / BYTES_PER_PIXEL_FACTOR);

  // A profile may carry its own explicit ceiling; take whichever binds first.
  const ceilings = [budgetPixels];
  if (device.maxDecodedPixels > 0) ceilings.push(device.maxDecodedPixels);
  if (device.isMobile) ceilings.push(MOBILE_MAX_PIXELS);
  const limit = Math.min(...ceilings);

  if (pixels > limit) {
    return { safe: false, suggestedMaxPixels: limit, reason: 'E_TOO_LARGE' };
  }
  return { safe: true, suggestedMaxPixels: null };
}
