/**
 * docs/05-data-models.md §1 — toJobResult().
 *
 * The doc states this is the ONLY place a SerializableResult becomes a
 * JobResult, so it is also the only place the two shapes can drift apart.
 * docs/06 §5's contract checklist asks specifically for: round-trip every
 * field, correct compressionRatio, and collision-safe outputName.
 */
import { describe, it, expect } from 'vitest';
import { toJobResult } from '../../src/state/jobs.slice';
import type { SourceImage, JobConfig } from '../../src/core/types';
import type { SerializableResult } from '../../src/workers/protocol';

const CONFIG: JobConfig = {
  outputFormat: 'jpeg',
  sizeMode: { kind: 'quality', quality: 82 },
  resize: { kind: 'none' },
  metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
  encoderPreference: 'auto',
  backgroundColor: '#ffffff',
};

function source(overrides: Partial<SourceImage> = {}): SourceImage {
  return {
    id: 'src-1',
    file: new File([new Uint8Array(8)], 'IMG_0001.HEIC'),
    name: 'IMG_0001.HEIC',
    sizeBytes: 4_200_000,
    detectedFormat: 'heic',
    declaredMime: 'image/heic',
    dimensions: null,
    metadata: null,
    addedAt: 1,
    ...overrides,
  };
}

function serializable(overrides: Partial<SerializableResult> = {}): SerializableResult {
  return {
    blob: new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }),
    format: 'jpeg',
    sizeBytes: 98_000,
    width: 3024,
    height: 4032,
    qualityUsed: 71,
    scaleApplied: 1,
    encoderUsed: 'canvas',
    durationMs: 812,
    passesUsed: 8,
    targetMet: true,
    ...overrides,
  };
}

describe('toJobResult', () => {
  it('populates every JobResult field', () => {
    const result = toJobResult(serializable(), source(), CONFIG);

    expect(result.format).toBe('jpeg');
    expect(result.sizeBytes).toBe(98_000);
    expect(result.dimensions).toEqual({ width: 3024, height: 4032 });
    expect(result.qualityUsed).toBe(71);
    expect(result.scaleApplied).toBe(1);
    expect(result.encoderUsed).toBe('canvas');
    expect(result.durationMs).toBe(812);
    expect(result.targetMet).toBe(true);
    expect(result.outputName).toBe('IMG_0001.jpg');
    expect(result.blob).toBeInstanceOf(Blob);

    // No field left undefined — a missing one would render as blank in the UI.
    for (const [key, value] of Object.entries(result)) {
      expect(value, key).not.toBeUndefined();
    }
  });

  it('computes compressionRatio as original / output', () => {
    const result = toJobResult(serializable({ sizeBytes: 100_000 }), source({ sizeBytes: 400_000 }), CONFIG);
    expect(result.compressionRatio).toBe(4);
  });

  it('does not divide by zero on an empty output', () => {
    const result = toJobResult(serializable({ sizeBytes: 0 }), source(), CONFIG);
    expect(Number.isFinite(result.compressionRatio)).toBe(true);
  });

  it('does NOT copy passesUsed onto the JobResult', () => {
    // docs/05 §1: passesUsed describes the work done, not the artifact, so it
    // belongs on Job — the reducer sets it there.
    const result = toJobResult(serializable({ passesUsed: 8 }), source(), CONFIG);
    expect('passesUsed' in result).toBe(false);
  });

  it('renames to the output format extension', () => {
    expect(toJobResult(serializable(), source(), CONFIG).outputName).toBe('IMG_0001.jpg');
    expect(
      toJobResult(serializable({ format: 'webp' }), source(), CONFIG).outputName,
    ).toBe('IMG_0001.webp');
  });

  it('resolves output name collisions instead of overwriting', () => {
    // IMG_1.heic and IMG_1.png both converting to JPG would otherwise produce
    // two files called IMG_1.jpg, and the second would clobber the first.
    const taken = new Set(['IMG_1.jpg']);
    const result = toJobResult(serializable(), source({ name: 'IMG_1.heic' }), CONFIG, taken);
    expect(result.outputName).toBe('IMG_1 (2).jpg');
  });

  it('carries targetMet: false through for an unreachable target', () => {
    const result = toJobResult(serializable({ targetMet: false }), source(), CONFIG);
    expect(result.targetMet).toBe(false);
    // Still a usable artifact — this is the soft-failure case in docs/04 §6.
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('carries a null targetMet for quality mode', () => {
    expect(toJobResult(serializable({ targetMet: null }), source(), CONFIG).targetMet).toBeNull();
  });
});
