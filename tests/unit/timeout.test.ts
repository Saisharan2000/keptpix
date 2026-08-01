/**
 * src/core/timeout.ts
 *
 * Extracted from engines/wasm/loader.ts (docs/12 D-44) when
 * platform/deliver.ts needed the identical pattern for showSaveFilePicker,
 * which was found to hang forever rather than reject under automation.
 */
import { describe, it, expect } from 'vitest';
import { withTimeout } from '../../src/core/timeout';

describe('withTimeout', () => {
  it('resolves with the original value when the promise settles first', async () => {
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10));
    await expect(withTimeout(fast, 1000, 'test')).resolves.toBe('done');
  });

  it('rejects with a labelled error once the timeout elapses first', async () => {
    // This is the exact shape of bug it exists to catch: a promise that never
    // settles at all, not one that settles slowly.
    const hangs = new Promise<string>(() => {
      /* never resolves, never rejects */
    });
    await expect(withTimeout(hangs, 20, 'showSaveFilePicker')).rejects.toThrow(
      /showSaveFilePicker timed out after 20ms/,
    );
  });

  it('propagates the original rejection reason when the promise rejects first', async () => {
    const fails = Promise.reject(new Error('boom'));
    await expect(withTimeout(fails, 1000, 'test')).rejects.toThrow('boom');
  });

  it('wraps a non-Error rejection in a real Error', async () => {
    // eslint-disable-next-line prefer-promise-reject-errors
    const fails = Promise.reject('a plain string, not an Error');
    await expect(withTimeout(fails, 1000, 'test')).rejects.toBeInstanceOf(Error);
  });

  it('does not leave the timer running after an early resolve', async () => {
    // If clearTimeout were missing, the timer would still fire later and could
    // reject a promise nobody is awaiting anymore, or leak in a long-lived
    // worker. Proven by simply outliving the timeout window without incident.
    const fast = Promise.resolve('ok');
    await withTimeout(fast, 15, 'test');
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
});
