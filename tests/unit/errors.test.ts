/**
 * docs/04-architecture.md §6 — the error taxonomy.
 *
 * "Silent failure is a defect." So is a generic message, and so is a message
 * that leaks an unfilled {placeholder} into the UI.
 */
import { describe, it, expect } from 'vitest';
import { createJobError, isRecoverable, JOB_ERROR_CODES } from '../../src/core/errors';
import type { JobErrorCode } from '../../src/core/types';

const ALL: JobErrorCode[] = [
  'E_UNSUPPORTED_FORMAT',
  'E_CORRUPT_FILE',
  'E_TOO_LARGE',
  'E_OOM',
  'E_TARGET_UNREACHABLE',
  'E_CODEC_LOAD_FAILED',
  'E_WORKER_CRASHED',
  'E_ENCODE_FAILED',
];

describe('the taxonomy is complete and closed', () => {
  it('covers exactly the eight codes in docs/04 §6', () => {
    expect([...JOB_ERROR_CODES].sort()).toEqual([...ALL].sort());
  });

  it('produces a specific, non-generic message for every code', () => {
    for (const code of ALL) {
      const err = createJobError(code, {
        params: {
          detected: 'RAW',
          supported: 'JPG, PNG, WebP',
          width: 8000,
          height: 6000,
          target: '100 KB',
          actual: '118 KB',
          format: 'AVIF',
        },
      });
      expect(err.code).toBe(code);
      expect(err.message.length).toBeGreaterThan(15);
      expect(err.message).not.toMatch(/something went wrong/i);
      expect(typeof err.recoverable).toBe('boolean');
    }
  });
});

describe('message interpolation', () => {
  it('fills placeholders with the supplied values', () => {
    const err = createJobError('E_TOO_LARGE', { params: { width: 8000, height: 6000 } });
    expect(err.message).toContain('8000x6000');
  });

  it('never leaks an unfilled placeholder into a user-facing message', () => {
    for (const code of ALL) {
      const err = createJobError(code); // deliberately no params
      expect(err.message, code).not.toMatch(/[{}]/);
      expect(err.message.length).toBeGreaterThan(10);
    }
  });

  it('interpolates the E_TARGET_UNREACHABLE case the UI actually shows', () => {
    const err = createJobError('E_TARGET_UNREACHABLE', {
      params: { target: '100 KB', width: 2400, height: 1600, actual: '118 KB' },
    });
    expect(err.message).toContain('100 KB');
    expect(err.message).toContain('2400x1600');
    expect(err.message).toContain('118 KB');
  });
});

describe('recoverability drives whether Retry is offered', () => {
  it('marks E_TARGET_UNREACHABLE recoverable, per docs/04 §6', () => {
    expect(isRecoverable('E_TARGET_UNREACHABLE')).toBe(true);
    expect(createJobError('E_TARGET_UNREACHABLE').recoverable).toBe(true);
  });

  it('marks unsupported and corrupt input unrecoverable — retrying cannot help', () => {
    expect(isRecoverable('E_UNSUPPORTED_FORMAT')).toBe(false);
    expect(isRecoverable('E_CORRUPT_FILE')).toBe(false);
  });

  it('marks transient failures recoverable', () => {
    for (const code of ['E_OOM', 'E_CODEC_LOAD_FAILED', 'E_WORKER_CRASHED', 'E_ENCODE_FAILED'] as const) {
      expect(isRecoverable(code), code).toBe(true);
    }
  });
});

describe('optional fields', () => {
  it('omits detail and bestEffort unless supplied', () => {
    const err = createJobError('E_OOM');
    expect('detail' in err).toBe(false);
    expect('bestEffort' in err).toBe(false);
  });

  it('carries technical detail for the diagnostics panel', () => {
    const err = createJobError('E_CORRUPT_FILE', { detail: 'libheif: box parse failed at 0x40' });
    expect(err.detail).toContain('libheif');
    // ...but the user-facing message stays clean.
    expect(err.message).not.toContain('libheif');
  });
});
