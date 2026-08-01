/**
 * docs/12 D-49 — the store's device/codec fields must reflect the REAL
 * browser, not the generic construction-time defaults forever.
 *
 * Runs in a real browser deliberately: `hydrateEnvironment()`'s whole job is
 * to read real navigator signals and real canvas feature probes, neither of
 * which exist under plain Node.
 */
import { describe, it, expect } from 'vitest';
import { useStore } from '../../src/state/store';
import { DEFAULT_CONCURRENCY, DEFAULT_DEVICE_MEMORY_GB } from '../../src/core/capabilities';

describe('hydrateEnvironment (docs/12 D-49)', () => {
  it('replaces the generic defaults with this browser\'s real, measured profile', async () => {
    // Sanity on the PRE-hydration state: the store starts from the same
    // generic constants resolveDeviceProfile() falls back to when no signals
    // are given at all — proving there is something real to replace here.
    const before = useStore.getState().device;
    expect(before.deviceMemoryGb).toBe(DEFAULT_DEVICE_MEMORY_GB);
    expect(before.hardwareConcurrency).toBe(DEFAULT_CONCURRENCY);

    await useStore.getState().hydrateEnvironment();

    const device = useStore.getState().device;
    const codecs = useStore.getState().codecs;

    // The real signal, not the fallback — this is the regression this test
    // exists to catch: QueueController reads store.getState().device to size
    // its WorkerPool, and before this fix that value never left the fallback.
    expect(device.hardwareConcurrency).toBe(navigator.hardwareConcurrency);
    expect(device.maxWorkers).toBeGreaterThanOrEqual(1);
    expect(device.maxWorkers).toBeLessThanOrEqual(3);

    // The universal canvas baseline, real feature-detected rather than assumed.
    expect(codecs.nativeEncode.jpeg).toBe(true);
    expect(codecs.nativeEncode.png).toBe(true);
    expect(codecs.nativeEncode.webp).toBe(true);
    expect(codecs.decode.jpeg).toBe(true);

    // This Chromium decodes AVIF natively (confirmed directly against a real
    // fixture in codecs.test.ts) — proving probeCodecSupport() actually wires
    // probeNativeDecodeFormats() through, not just the encode-side probe.
    expect(codecs.nativeDecode.avif).toBe(true);
  }, 30_000);
});
