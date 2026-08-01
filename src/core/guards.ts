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

/**
 * Memory at or below which the mobile crash line is used unchanged.
 * Above it the ceiling scales — see resolveHardPixelCeiling.
 */
export const SCALED_CEILING_MIN_GB = 8;
/** Nothing above this is attempted on any device, however much RAM it claims. */
export const ABSOLUTE_MAX_PIXELS = 300_000_000;

/**
 * The hard rejection ceiling: above this, no prescale is attempted and the
 * decode is refused outright with E_TOO_LARGE (docs/12 D-43, WO-1).
 *
 * 80 MP is `06 §3.4`'s "empirical crash line", but that figure was measured on
 * MOBILE SAFARI. D-43 promoted it to a universal backstop, which over-corrected:
 * it left a 32 GB workstation refusing a 100 MP panorama it could handle
 * comfortably, while the homepage advertised no such cap. A crash line is not
 * mobile-only, but neither is it memory-independent.
 *
 * So: keep 80 MP exactly where it was measured — mobile, or under 8 GB — and
 * scale it with real memory above that, capped at 300 MP. The cap is deliberate;
 * beyond it the failure mode stops being "slow" and starts being a browser tab
 * dying with no error anyone can catch, which is worse than an honest refusal.
 *
 * This is the ONLY definition of the ceiling. The pipeline imports it rather
 * than re-deriving it — the previous version hardcoded MOBILE_MAX_PIXELS at the
 * call site, which is how the desktop case went unnoticed.
 */
export function resolveHardPixelCeiling(device: DeviceProfile): number {
  const gb = Math.max(0, device.deviceMemoryGb);
  if (device.isMobile || gb < SCALED_CEILING_MIN_GB) return MOBILE_MAX_PIXELS;
  const scaled = Math.floor(MOBILE_MAX_PIXELS * (gb / 4));
  return Math.min(scaled, ABSOLUTE_MAX_PIXELS);
}

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
  const ceilings = [budgetPixels, resolveHardPixelCeiling(device)];
  if (device.maxDecodedPixels > 0) ceilings.push(device.maxDecodedPixels);
  const limit = Math.min(...ceilings);

  if (pixels > limit) {
    return { safe: false, suggestedMaxPixels: limit, reason: 'E_TOO_LARGE' };
  }
  return { safe: true, suggestedMaxPixels: null };
}
