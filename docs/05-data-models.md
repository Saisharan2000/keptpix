# 05 — Data Models

There is no server and no relational database. The "data model" is (a) in-memory TypeScript domain types, (b) a small IndexedDB schema for settings only, and (c) OPFS for large session-scoped blobs.

All types below go in `src/core/types.ts` and are the single source of truth. Claude Code must not invent parallel shapes.

---

## 1. Core domain types

```ts
// ─── Formats ──────────────────────────────────────────────────────────────

export type InputFormat =
  | 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'tiff'
  | 'heic' | 'heif' | 'avif' | 'jxl' | 'svg';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl';

export type EncoderId =
  | 'canvas'      // native convertToBlob
  | 'mozjpeg'     // WASM, better quality-per-byte
  | 'oxipng'      // WASM, lossless PNG optimisation
  | 'libavif'     // WASM
  | 'libjxl';     // WASM

export type DecoderId = 'canvas' | 'libheif' | 'libavif' | 'libjxl' | 'utif' | 'svg';

// ─── Source file ──────────────────────────────────────────────────────────

export interface SourceImage {
  id: string;                    // crypto.randomUUID()
  file: File;
  name: string;                  // original filename incl. extension
  sizeBytes: number;
  detectedFormat: InputFormat;   // from magic bytes, NOT the extension
  declaredMime: string;          // what the browser claimed — kept for diagnostics
  dimensions: Dimensions | null; // null until probed
  metadata: ImageMetadata | null;
  addedAt: number;               // epoch ms
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface ImageMetadata {
  hasExif: boolean;
  hasGps: boolean;               // drives the privacy-warning badge
  orientation: number;           // EXIF orientation 1-8, default 1
  colorProfile: string | null;   // ICC profile name if present
  cameraMake: string | null;
  cameraModel: string | null;
  dateTaken: string | null;      // ISO 8601
  rawTagCount: number;           // for the "N metadata fields found" UI
}

// ─── Job configuration ────────────────────────────────────────────────────

export type SizeMode =
  | { kind: 'quality'; quality: number }              // 1-100
  | { kind: 'target'; targetBytes: number;
      tolerance?: number }                            // default 0.08 (92-100% band)
  | { kind: 'lossless' };                             // PNG/WebP/JXL only

export type ResizeSpec =
  | { kind: 'none' }
  | { kind: 'exact'; width: number; height: number }
  | { kind: 'scale'; factor: number }                 // 0 < factor <= 1
  | { kind: 'fit'; maxWidth: number; maxHeight: number }
  | { kind: 'maxDimension'; max: number };

export interface MetadataPolicy {
  stripAll: boolean;             // default true
  preserveOrientation: boolean;  // default true — applied to pixels, then stripped
  preserveColorProfile: boolean; // default false
}

export interface JobConfig {
  outputFormat: OutputFormat;
  sizeMode: SizeMode;
  resize: ResizeSpec;
  metadata: MetadataPolicy;
  encoderPreference: 'auto' | 'native' | 'best-quality';
  backgroundColor: string;       // hex, for flattening alpha into JPEG
}

// ─── Jobs ─────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** Sub-phase within `running`. Mirrors JobProgressEvent.phase in 06-contracts §2. */
export type JobPhase = 'decoding' | 'resizing' | 'encoding' | 'finalising';

export interface Job {
  id: string;
  sourceId: string;              // -> SourceImage.id
  config: JobConfig;
  status: JobStatus;
  phase: JobPhase | null;        // non-null only while status === 'running'
  progress: number;              // 0-1
  passesUsed: number;            // encode passes; matters for target-size mode
  result: JobResult | null;
  error: JobError | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface JobResult {
  blob: Blob;
  format: OutputFormat;
  sizeBytes: number;
  dimensions: Dimensions;
  qualityUsed: number | null;    // null for lossless
  scaleApplied: number;          // 1 = no downscale; < 1 if target forced a resize
  encoderUsed: EncoderId;
  compressionRatio: number;      // original / output
  durationMs: number;
  targetMet: boolean | null;     // null unless sizeMode.kind === 'target'
  outputName: string;            // e.g. "photo.jpg"
}

export type JobErrorCode =
  | 'E_UNSUPPORTED_FORMAT' | 'E_CORRUPT_FILE' | 'E_TOO_LARGE' | 'E_OOM'
  | 'E_TARGET_UNREACHABLE' | 'E_CODEC_LOAD_FAILED' | 'E_WORKER_CRASHED'
  | 'E_ENCODE_FAILED';

export interface JobError {
  code: JobErrorCode;
  message: string;               // user-facing, already localised
  detail?: string;               // technical, for the diagnostics panel only
  recoverable: boolean;          // drives whether Retry is offered
  /**
   * Only ever set for E_TARGET_UNREACHABLE. Crosses the worker boundary as a
   * SerializableResult and is mapped by toJobResult() before landing here.
   */
  bestEffort?: JobResult;
}

// ─── Licensing (Phase 4) ──────────────────────────────────────────────────

export type LicenseStatus =
  | { valid: true;  keyId: string; email: string;
      product: 'noupload-pro'; expiresAt: string | null }
  | { valid: false;
      reason: 'malformed' | 'bad-signature' | 'expired' | 'revoked' | 'absent' };

// ─── Batch ────────────────────────────────────────────────────────────────

/**
 * Maps the worker's SerializableResult (06-contracts §2) onto the main-thread
 * JobResult. This is the ONLY place the two shapes meet — implement it in
 * src/state/jobs.slice.ts and nowhere else.
 */
export function toJobResult(
  s: SerializableResult,
  source: SourceImage,
  config: JobConfig,
): JobResult {
  return {
    blob: s.blob,
    format: s.format,
    sizeBytes: s.sizeBytes,
    dimensions: { width: s.width, height: s.height },
    qualityUsed: s.qualityUsed,
    scaleApplied: s.scaleApplied,
    encoderUsed: s.encoderUsed,
    compressionRatio: source.sizeBytes / s.sizeBytes,
    durationMs: s.durationMs,
    targetMet: s.targetMet,
    outputName: makeOutputName(source.name, s.format), // core/naming.ts
  };
}

/**
 * `SerializableResult.passesUsed` is written to `Job.passesUsed`, not to
 * `JobResult` — it describes the work done, not the artifact. Set it in the
 * same reducer that calls toJobResult().
 */

export interface Batch {
  id: string;
  jobIds: string[];
  createdAt: number;
  concurrency: number;           // resolved from DeviceProfile
}

export interface BatchSummary {
  total: number;
  done: number;
  failed: number;
  totalInputBytes: number;
  totalOutputBytes: number;
  savedBytes: number;
  savedPercent: number;
  elapsedMs: number;
}

// ─── Capability + device ──────────────────────────────────────────────────

export interface DeviceProfile {
  deviceMemoryGb: number;        // navigator.deviceMemory, default 4 if absent
  hardwareConcurrency: number;
  isMobile: boolean;
  maxWorkers: 1 | 2 | 3;
  maxDecodedPixels: number;      // memory guard threshold
  hasOffscreenCanvas: boolean;
  hasFileSystemAccess: boolean;  // ~28% global — Chrome desktop only
  hasWebGpu: boolean;            // Phase 3 only
  hasOpfs: boolean;
}

export interface CodecSupport {
  decode: Record<InputFormat, boolean>;
  encode: Record<OutputFormat, boolean>;
  nativeEncode: Record<OutputFormat, boolean>; // canvas can do it without WASM
  nativeDecode: Record<InputFormat, boolean>;  // canvas can DECODE it without WASM
}
```

> Amended during Milestone 5 (docs/12 D-46) to add `nativeDecode`, symmetric with
> the pre-existing `nativeEncode`. The decoder table in `06-contracts.md` §1 has
> exactly one preference-driven case — AVIF: canvas if native, else libavif — and
> it needs to know "can canvas *itself* do this" as distinct from "is this format
> decodable by *something*" (`decode.avif`, true once any adapter, native or
> WASM, is registered). Without the split, registering the libavif fallback made
> `decode.avif` true everywhere and made that same fallback unreachable on
> exactly the browsers it exists for.

---

## 2. Persisted schema — IndexedDB (Dexie)

**Rule: user images are never written here.** Settings and presets only. See ADR-005.

```ts
// src/platform/db.ts
import Dexie, { type Table } from 'dexie';

export interface StoredSettings {
  key: 'settings';               // singleton row
  theme: 'light' | 'dark' | 'system';
  defaultConfig: JobConfig;
  showMetadataWarnings: boolean;
  keepFilesForSession: boolean;  // opt-in OPFS retention
  locale: string;
  schemaVersion: number;
}

export interface StoredPreset {
  id: string;
  name: string;                  // "Passport 100KB", "Web hero AVIF"
  config: JobConfig;
  isBuiltIn: boolean;
  usageCount: number;
  createdAt: number;
}

export interface StoredLicense {          // Phase 4
  key: 'license';
  token: string;                 // base64url Ed25519-signed payload
  email: string;
  validatedAt: number;
}

export class NoUploadDB extends Dexie {
  settings!: Table<StoredSettings, string>;
  presets!: Table<StoredPreset, string>;
  license!: Table<StoredLicense, string>;

  constructor() {
    super('noupload');
    this.version(1).stores({
      settings: 'key',
      presets: 'id, name, usageCount',
      license: 'key',
    });
  }
}
```

**Migration policy:** every stored record carries `schemaVersion`. On mismatch, attempt forward migration; on failure, reset to defaults rather than crash. A settings blob is never worth an error screen.

**Eviction reality (Safari ITP):** origins with no user interaction for 7 days lose script-created storage. Consequence for us: presets can silently vanish for infrequent users. Mitigation — export/import presets as a JSON file, and never treat IndexedDB as authoritative for anything the user would mourn.

**Quota reference:** Chrome/Edge ~60% of disk; Firefox min(10% of disk, 10 GiB) best-effort, up to 50% with `navigator.storage.persist()`; Safari ~60% for the browser app. `localStorage` is capped at 10 MiB everywhere — **never use it for anything but the theme flag**.

---

## 3. OPFS layout — session-scoped large blobs

Used only when `keepFilesForSession` is on, or when an intermediate exceeds ~50 MB and should leave the JS heap.

```
/opfs
  /session-{sessionId}/
    /sources/{sourceId}.bin      original bytes
    /results/{jobId}.bin         encoded output
    manifest.json                { sessionId, createdAt, entries[] }
```

Rules:
- Written from **inside a worker** using `FileSystemSyncAccessHandle` (worker-only API; baseline since March 2023).
- Purged on `beforeunload` and on next app start for any session older than 24 hours.
- ⚠️ **Safari private browsing has no OPFS at all.** Feature-detect and fall back to in-memory with a lowered file-count guard.

---

## 4. State shape (Zustand, in memory)

```ts
export interface AppState {
  sources: Map<string, SourceImage>;
  jobs: Map<string, Job>;
  batches: Map<string, Batch>;
  activeBatchId: string | null;

  config: JobConfig;              // the working config, applied to new jobs
  perFileOverrides: Map<string, Partial<JobConfig>>;

  device: DeviceProfile;
  codecs: CodecSupport;

  ui: {
    view: 'idle' | 'configuring' | 'processing' | 'results';
    selectedSourceId: string | null;
    compareMode: boolean;
    diagnosticsOpen: boolean;
  };
}
```

**Invariants Claude Code must preserve:**

1. `Job.result.blob` is the *only* long-lived reference to output bytes. Revoke every object URL on unmount — leaked URLs are the top memory-leak source in this class of app.
2. `SourceImage.file` holds the original `File` handle; never copy its bytes into state.
3. `ImageBitmap` objects are **never** stored in Zustand. They live inside the worker and are `.close()`d immediately after encode.
4. A `Job` transitions status in one direction only, except `failed → queued` on explicit retry.
5. `Job.result` and `Job.error` are mutually exclusive — **with exactly one documented exception**: `E_TARGET_UNREACHABLE` sets `status: 'done'`, `error.code: 'E_TARGET_UNREACHABLE'`, and `error.bestEffort` to a usable result. See `04-architecture.md` §6. The UI renders that case as a result with a warning, never as a failure.
6. `Job.phase` is non-null only while `status === 'running'`; it is cleared on every terminal transition.

**Amended during Milestone 8 (docs/12 D-50):** the real store also carries `settings: PersistedSettings` and `presets: StoredPreset[]` (§2), hydrated from IndexedDB in `state/persistence.slice.ts`. Additive only — every field and invariant above is unchanged. Omitted from the interface above because it predates Milestone 8; not reproduced in full here since §2 already gives the persisted shape verbatim.

---

## 5. Route data model (build-time, drives prerendering)

```ts
// src/content/formats.ts — hand-curated, NOT generated permutations
export interface FormatPairRoute {
  slug: string;                  // "heic-to-jpg"
  from: InputFormat;
  to: OutputFormat;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;                 // 80-150 words, genuinely specific to this pair
  whyConvert: string[];          // 3-5 bullets, pair-specific
  technicalNotes: string;        // real constraints: lossy->lossy, alpha loss, etc.
  /** The format comparison table required by 09-seo-content-plan §3. */
  comparison: ComparisonTable;
  faq: Array<{ q: string; a: string }>;   // >= 4, pair-specific
  defaultConfig: Partial<JobConfig>;
  relatedSlugs: string[];
  tier: 'star' | 'p1' | 'p2';    // publishing wave, see 09 §6
  supported: boolean;            // NEVER prerender a route we can't perform
}

export interface ComparisonTable {
  /** Row label, then the value for the `from` format and the `to` format. */
  rows: Array<{ label: string; from: string; to: string }>;
  // Required labels: "Compression", "Support", "Transparency",
  //                  "Metadata", "Typical size"
}

export interface SizePresetRoute {
  slug: string;                  // "jpg-to-100kb"
  format: OutputFormat;
  targetBytes: number;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  useCases: string[];            // "government form uploads", "exam portals"
  faq: Array<{ q: string; a: string }>;
  relatedSlugs: string[];
  supported: boolean;            // same hard gate as FormatPairRoute
}
```

⚠️ **The `supported` flag is a hard gate.** Google's spam policy defines scaled content abuse as generating many pages "without adding value" and doorway abuse as pages built to rank that are less useful than the destination. A route that loads a page but can't perform the conversion is precisely that. Only ship routes the engine genuinely handles. See `09-seo-content-plan.md`.
