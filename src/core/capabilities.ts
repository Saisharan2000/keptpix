/**
 * src/core/capabilities.ts
 *
 * PURE resolution only. ADR-006 forbids browser globals in src/core/, and
 * `navigator.deviceMemory` is a browser global — so this file takes already-read
 * signals and decides what they MEAN. The reading itself happens where the
 * globals legally live: workers/pool.ts for the device, engines/canvas for the
 * codec probes.
 *
 * That split is what lets the worker-count policy in docs/04 §4 and the codec
 * resolution tables in docs/06 §1 be unit-tested in plain Node.
 */
import type {
  CodecSupport,
  DeviceProfile,
  InputFormat,
  OutputFormat,
} from './types';
import { BYTES_PER_PIXEL_FACTOR, MEMORY_BUDGET_FRACTION, MOBILE_MAX_PIXELS } from './guards';

/** Raw values read from the platform, before any policy is applied. */
export interface RawDeviceSignals {
  /** navigator.deviceMemory — absent on Firefox and Safari. */
  deviceMemoryGb?: number | undefined;
  hardwareConcurrency?: number | undefined;
  /** Coarse pointer or a mobile UA. */
  isMobile?: boolean | undefined;
  hasOffscreenCanvas?: boolean | undefined;
  hasFileSystemAccess?: boolean | undefined;
  hasWebGpu?: boolean | undefined;
  hasOpfs?: boolean | undefined;
}

/** docs/05 §1: "navigator.deviceMemory, default 4 if absent". */
export const DEFAULT_DEVICE_MEMORY_GB = 4;
export const DEFAULT_CONCURRENCY = 4;

/**
 * The worker-count policy, verbatim from docs/04 §4:
 *
 *   >= 8 GB and >= 8 cores -> 3 workers, parallel batch
 *   >= 4 GB               -> 2 workers, parallel batch
 *   mobile or < 4 GB      -> 1 worker,  strictly sequential
 */
export function resolveMaxWorkers(
  deviceMemoryGb: number,
  hardwareConcurrency: number,
  isMobile: boolean,
): 1 | 2 | 3 {
  if (isMobile || deviceMemoryGb < 4) return 1;
  if (deviceMemoryGb >= 8 && hardwareConcurrency >= 8) return 3;
  return 2;
}

/** Pixel ceiling implied by the memory budget, and by mobile's hard cap. */
export function resolveMaxDecodedPixels(deviceMemoryGb: number, isMobile: boolean): number {
  const budgetBytes = deviceMemoryGb * 1024 ** 3 * MEMORY_BUDGET_FRACTION;
  const fromBudget = Math.floor(budgetBytes / BYTES_PER_PIXEL_FACTOR);
  return isMobile ? Math.min(fromBudget, MOBILE_MAX_PIXELS) : fromBudget;
}

export function resolveDeviceProfile(raw: RawDeviceSignals = {}): DeviceProfile {
  const deviceMemoryGb =
    typeof raw.deviceMemoryGb === 'number' && raw.deviceMemoryGb > 0
      ? raw.deviceMemoryGb
      : DEFAULT_DEVICE_MEMORY_GB;
  const hardwareConcurrency =
    typeof raw.hardwareConcurrency === 'number' && raw.hardwareConcurrency > 0
      ? raw.hardwareConcurrency
      : DEFAULT_CONCURRENCY;
  const isMobile = raw.isMobile === true;

  return {
    deviceMemoryGb,
    hardwareConcurrency,
    isMobile,
    maxWorkers: resolveMaxWorkers(deviceMemoryGb, hardwareConcurrency, isMobile),
    maxDecodedPixels: resolveMaxDecodedPixels(deviceMemoryGb, isMobile),
    hasOffscreenCanvas: raw.hasOffscreenCanvas === true,
    hasFileSystemAccess: raw.hasFileSystemAccess === true,
    hasWebGpu: raw.hasWebGpu === true,
    hasOpfs: raw.hasOpfs === true,
  };
}

export const ALL_INPUT_FORMATS: readonly InputFormat[] = [
  'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'heic', 'heif', 'avif', 'jxl', 'svg',
];
export const ALL_OUTPUT_FORMATS: readonly OutputFormat[] = ['jpeg', 'png', 'webp', 'avif', 'jxl'];

/**
 * Formats every engine capable of running this code encodes natively (ADR-004).
 * Used as the floor when a feature probe comes back empty.
 */
export const BASELINE_NATIVE_ENCODE: readonly OutputFormat[] = ['jpeg', 'png', 'webp'];

/**
 * Formats a registered adapter handles without canvas (docs/12 D-46). Shared
 * by every caller that needs to populate a CodecProbe.wasmDecode, so there is
 * exactly one list to keep in step with src/engines/registry.ts — not one per
 * caller. jxl is absent — see wasm/jxl.ts.
 */
export const WASM_DECODE_FORMATS: readonly InputFormat[] = ['heic', 'heif', 'avif', 'tiff'];

/**
 * An empty probe result means the PROBE failed, not that the browser cannot
 * encode anything — no engine that reaches this code lacks JPEG and PNG.
 * Trusting an empty result would report every format unsupported and silently
 * disable the whole tool, so the baseline is the floor.
 *
 * This bit us for real: an OffscreenCanvas whose 2d context was never obtained
 * produces nothing from convertToBlob, which read as "no formats supported".
 */
export function withEncodeBaseline(probed: readonly OutputFormat[]): OutputFormat[] {
  return probed.length > 0 ? [...probed] : [...BASELINE_NATIVE_ENCODE];
}

export interface CodecProbe {
  /** Formats canvas can encode on this browser, from a real feature detect. */
  nativeEncode: readonly OutputFormat[];
  /** Formats canvas can decode on this browser. */
  nativeDecode: readonly InputFormat[];
  /** Formats a registered WASM adapter can decode. Empty until Milestone 5. */
  wasmDecode?: readonly InputFormat[] | undefined;
  /** Formats a registered WASM adapter can encode. Empty until Milestone 5. */
  wasmEncode?: readonly OutputFormat[] | undefined;
}

/**
 * Fold the probes into the CodecSupport matrix the registry resolves against.
 * A format is supported if EITHER canvas or a registered WASM adapter handles
 * it; nativeEncode stays separate because ADR-004 prefers canvas when it can.
 */
export function resolveCodecSupport(probe: CodecProbe): CodecSupport {
  const nativeEncode = new Set(probe.nativeEncode);
  const nativeDecode = new Set(probe.nativeDecode);
  const wasmDecode = new Set(probe.wasmDecode ?? []);
  const wasmEncode = new Set(probe.wasmEncode ?? []);

  const decode = {} as Record<InputFormat, boolean>;
  const nativeDecodeOut = {} as Record<InputFormat, boolean>;
  for (const f of ALL_INPUT_FORMATS) {
    nativeDecodeOut[f] = nativeDecode.has(f);
    decode[f] = nativeDecode.has(f) || wasmDecode.has(f);
  }

  const encode = {} as Record<OutputFormat, boolean>;
  const native = {} as Record<OutputFormat, boolean>;
  for (const f of ALL_OUTPUT_FORMATS) {
    native[f] = nativeEncode.has(f);
    encode[f] = nativeEncode.has(f) || wasmEncode.has(f);
  }

  return { decode, encode, nativeEncode: native, nativeDecode: nativeDecodeOut };
}
