/**
 * tests/unit/pdf-budget.test.ts
 *
 * The guard exists to turn "the tab vanished after four minutes" into a
 * sentence the user can act on, so the properties that matter are that it
 * never refuses something reasonable and never accepts something ruinous.
 */
import { describe, it, expect } from 'vitest';
import type { DeviceProfile } from '../../src/core/types';
import {
  PDF_BUDGET_FRACTION,
  PDF_MAX_BUDGET_BYTES,
  PDF_MIN_BUDGET_BYTES,
  assessPdfBudget,
  formatBytes,
  pdfInputBudgetBytes,
} from '../../src/core/pdf/budget';

const MB = 1024 * 1024;

function device(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
    isMobile: false,
    maxWorkers: 3,
    maxDecodedPixels: 0,
    hasOffscreenCanvas: true,
    hasFileSystemAccess: true,
    hasWebGpu: false,
    hasOpfs: true,
    ...overrides,
  } as DeviceProfile;
}

describe('pdfInputBudgetBytes', () => {
  it('scales with reported memory', () => {
    const small = pdfInputBudgetBytes(device({ deviceMemoryGb: 4 }));
    const large = pdfInputBudgetBytes(device({ deviceMemoryGb: 16 }));
    expect(large).toBeGreaterThan(small);
    expect(small).toBe(Math.floor(4 * 1024 ** 3 * PDF_BUDGET_FRACTION));
  });

  it('never drops below the floor, however little memory is reported', () => {
    // Safari reports nothing at all, and several browsers cap the figure.
    // 0.5 GB is deliberately NOT here: 0.5 x 0.15 GB is ~77 MB, which is above
    // the floor, so the floor correctly does not bind. Only values below it do.
    for (const gb of [0, 0.25, 0.4]) {
      expect(pdfInputBudgetBytes(device({ deviceMemoryGb: gb })), gb + 'GB').toBe(
        PDF_MIN_BUDGET_BYTES,
      );
    }
  });

  it('never exceeds the ceiling, however much memory is claimed', () => {
    expect(pdfInputBudgetBytes(device({ deviceMemoryGb: 512 }))).toBe(PDF_MAX_BUDGET_BYTES);
  });

  it('survives a negative or absurd figure without producing NaN', () => {
    for (const gb of [-1, Number.NaN]) {
      const budget = pdfInputBudgetBytes(device({ deviceMemoryGb: gb }));
      expect(Number.isFinite(budget), String(gb)).toBe(true);
      expect(budget).toBeGreaterThanOrEqual(PDF_MIN_BUDGET_BYTES);
    }
  });
});

describe('assessPdfBudget', () => {
  it('accepts an ordinary job without complaint', () => {
    // Twenty 4 MB phone photos on a 4 GB device — the common case, and it must
    // not be refused. A guard that fires on normal use is worse than none.
    const result = assessPdfBudget(Array.from({ length: 20 }, () => 4 * MB), device({ deviceMemoryGb: 4 }));
    expect(result.withinBudget).toBe(true);
    expect(result.fittingCount).toBe(20);
  });

  it('refuses a job that would exhaust the device', () => {
    const sizes = Array.from({ length: 400 }, () => 5 * MB); // 2 GB
    const result = assessPdfBudget(sizes, device({ deviceMemoryGb: 4 }));
    expect(result.withinBudget).toBe(false);
    expect(result.totalBytes).toBe(400 * 5 * MB);
  });

  it('reports how many files WOULD fit, so the message can be actionable', () => {
    const budget = pdfInputBudgetBytes(device({ deviceMemoryGb: 4 }));
    const each = 50 * MB;
    const expected = Math.floor(budget / each);

    const result = assessPdfBudget(Array.from({ length: 40 }, () => each), device({ deviceMemoryGb: 4 }));
    expect(result.withinBudget).toBe(false);
    expect(result.fittingCount).toBe(expected);
    expect(result.fittingCount).toBeGreaterThan(0);
    expect(result.fittingCount).toBeLessThan(40);
  });

  it('counts in the given order, because that is the page order', () => {
    // A huge first file means nothing after it fits, even if those are tiny.
    const result = assessPdfBudget([5_000 * MB, 1, 1], device({ deviceMemoryGb: 4 }));
    expect(result.fittingCount).toBe(0);
  });

  it('treats an empty list as within budget', () => {
    const result = assessPdfBudget([], device());
    expect(result.withinBudget).toBe(true);
    expect(result.totalBytes).toBe(0);
    expect(result.fittingCount).toBe(0);
  });

  it('ignores negative sizes rather than crediting them against the budget', () => {
    const result = assessPdfBudget([-100, 10], device());
    expect(result.totalBytes).toBe(10);
  });

  it('accepts a single file exactly at the budget', () => {
    const budget = pdfInputBudgetBytes(device({ deviceMemoryGb: 8 }));
    const result = assessPdfBudget([budget], device({ deviceMemoryGb: 8 }));
    expect(result.withinBudget).toBe(true);
    expect(result.fittingCount).toBe(1);
  });

  it('refuses one byte over', () => {
    const budget = pdfInputBudgetBytes(device({ deviceMemoryGb: 8 }));
    expect(assessPdfBudget([budget + 1], device({ deviceMemoryGb: 8 })).withinBudget).toBe(false);
  });
});

describe('formatBytes', () => {
  it('picks units a person reads without converting', () => {
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(5 * MB)).toBe('5 MB');
    expect(formatBytes(1024 * MB)).toBe('1.0 GB');
    expect(formatBytes(1536 * MB)).toBe('1.5 GB');
  });

  it('never reports a real file as 0', () => {
    expect(formatBytes(1)).toBe('1 KB');
  });
});
