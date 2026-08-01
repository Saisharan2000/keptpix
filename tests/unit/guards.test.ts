/**
 * docs/06-contracts.md §3.4 — assessMemoryRisk.
 * Boundary matrix: 2/4/8/16 GB x 1/12/50/100 megapixels.
 */
import { describe, it, expect } from 'vitest';
import {
  assessMemoryRisk,
  MOBILE_MAX_PIXELS,
  ABSOLUTE_MAX_PIXELS,
  resolveHardPixelCeiling,
  MEMORY_BUDGET_FRACTION,
  BYTES_PER_PIXEL_FACTOR,
} from '../../src/core/guards';
import type { DeviceProfile } from '../../src/core/types';

function device(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
    isMobile: false,
    maxWorkers: 3,
    maxDecodedPixels: 0,
    hasOffscreenCanvas: true,
    hasFileSystemAccess: false,
    hasWebGpu: false,
    hasOpfs: true,
    ...overrides,
  };
}

/** Square image of roughly N megapixels. */
const mp = (n: number) => {
  const side = Math.round(Math.sqrt(n * 1_000_000));
  return { width: side, height: side };
};

const GB = [2, 4, 8, 16];
const MP = [1, 12, 50, 100];

describe('assessMemoryRisk — the 2/4/8/16 GB x 1/12/50/100 MP matrix', () => {
  it('agrees with the documented budget formula in every cell', () => {
    for (const gb of GB) {
      for (const n of MP) {
        const dims = mp(n);
        const result = assessMemoryRisk(dims, device({ deviceMemoryGb: gb }));

        const budgetPixels = Math.floor(
          (gb * 1024 ** 3 * MEMORY_BUDGET_FRACTION) / BYTES_PER_PIXEL_FACTOR,
        );
        // The hard ceiling binds alongside the memory budget as of WO-1, and on
        // a low-memory DESKTOP it is now the tighter of the two: at 4 GB the
        // budget alone would permit ~122 MP, but 80 MP is the measured crash
        // line and applies below 8 GB regardless of form factor.
        const limit = Math.min(
          budgetPixels,
          resolveHardPixelCeiling(device({ deviceMemoryGb: gb })),
        );
        const expectedSafe = dims.width * dims.height <= limit;

        expect(result.safe, gb + 'GB / ' + n + 'MP').toBe(expectedSafe);
        if (!expectedSafe) {
          expect(result.reason).toBe('E_TOO_LARGE');
          expect(result.suggestedMaxPixels).toBeGreaterThan(0);
        } else {
          expect(result.suggestedMaxPixels).toBeNull();
          expect(result.reason).toBeUndefined();
        }
      }
    }
  });

  it('passes a 12 MP photo on every desktop tier', () => {
    for (const gb of GB) {
      expect(assessMemoryRisk(mp(12), device({ deviceMemoryGb: gb })).safe).toBe(true);
    }
  });

  it('rejects a 100 MP image on a 2 GB device', () => {
    const r = assessMemoryRisk(mp(100), device({ deviceMemoryGb: 2 }));
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('E_TOO_LARGE');
  });
});

describe('assessMemoryRisk — mobile ceiling', () => {
  it('applies the 80 MP hard ceiling regardless of reported memory', () => {
    // 16 GB of RAM would otherwise permit far more than 80 MP.
    const roomy = device({ deviceMemoryGb: 16, isMobile: true });
    expect(assessMemoryRisk(mp(50), roomy).safe).toBe(true);

    const over = assessMemoryRisk({ width: 10_000, height: 9_000 }, roomy); // 90 MP
    expect(over.safe).toBe(false);
    expect(over.suggestedMaxPixels).toBe(MOBILE_MAX_PIXELS);
  });

  it('does not apply the mobile ceiling to desktop', () => {
    const desktop = device({ deviceMemoryGb: 16, isMobile: false });
    expect(assessMemoryRisk({ width: 10_000, height: 9_000 }, desktop).safe).toBe(true);
  });
});

describe('resolveHardPixelCeiling — device-scaled, not one number (WO-1, docs/12 D-57)', () => {
  it('keeps 80 MP exactly where it was measured: mobile, at any memory', () => {
    // The figure in docs/06 §3.4 is mobile Safari's empirical crash line, so a
    // 16 GB phone does not get to raise it.
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 4, isMobile: true }))).toBe(
      MOBILE_MAX_PIXELS,
    );
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 16, isMobile: true }))).toBe(
      MOBILE_MAX_PIXELS,
    );
  });

  it('keeps 80 MP on any desktop under 8 GB', () => {
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 4 }))).toBe(MOBILE_MAX_PIXELS);
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 7.9 }))).toBe(MOBILE_MAX_PIXELS);
  });

  it('scales with real memory above 8 GB', () => {
    // The regression WO-1 exists to fix: a capable desktop refusing a panorama
    // it could handle, while the site advertised no such cap.
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 8 }))).toBe(160_000_000);
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 16 }))).toBeGreaterThan(
      MOBILE_MAX_PIXELS,
    );
  });

  it('never exceeds the absolute cap, however much memory is claimed', () => {
    // Past this the failure stops being "slow" and becomes a tab dying with no
    // catchable error, which is worse than an honest refusal.
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 64 }))).toBe(ABSOLUTE_MAX_PIXELS);
    expect(resolveHardPixelCeiling(device({ deviceMemoryGb: 1024 }))).toBe(ABSOLUTE_MAX_PIXELS);
  });

  it('a 90 MP image is refused at 4 GB and allowed at 16 GB — the WO-1 case', () => {
    const ninetyMp = 90_000_000;
    expect(ninetyMp).toBeGreaterThan(resolveHardPixelCeiling(device({ deviceMemoryGb: 4 })));
    expect(ninetyMp).toBeLessThan(resolveHardPixelCeiling(device({ deviceMemoryGb: 16 })));
  });
});

describe('assessMemoryRisk — explicit profile ceiling', () => {
  it('honours maxDecodedPixels when it binds first', () => {
    const capped = device({ deviceMemoryGb: 16, maxDecodedPixels: 4_000_000 });
    const r = assessMemoryRisk(mp(12), capped);
    expect(r.safe).toBe(false);
    expect(r.suggestedMaxPixels).toBe(4_000_000);
  });

  it('ignores a zero maxDecodedPixels rather than rejecting everything', () => {
    expect(assessMemoryRisk(mp(1), device({ maxDecodedPixels: 0 })).safe).toBe(true);
  });

  it('treats a zero-area image as safe', () => {
    expect(assessMemoryRisk({ width: 0, height: 0 }, device()).safe).toBe(true);
  });
});
