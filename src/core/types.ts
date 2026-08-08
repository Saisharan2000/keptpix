/**
 * src/core/types.ts — the single source of truth for the domain model.
 *
 * Transcribed verbatim from docs/05-data-models.md §1. Claude Code must not
 * invent parallel shapes: if a shape is needed, it is added HERE and to
 * docs/05 §1 in the same commit.
 *
 * ADR-006: this file — and everything else in src/core/ — is pure TypeScript.
 * No DOM, no worker APIs, no browser globals. It must run under plain Node.
 * (`File` and `Blob` are used as types only and are Node 20+ globals.)
 */

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

// ─── Persisted schema (docs/05 §2) ─────────────────────────────────────────
//
// Defined here, not in platform/db.ts, so components/react/ can name these
// shapes (docs/12 D-50): `07 §2`'s boundary table does not grant
// components-react/ access to platform/, even for a type-only import, but
// core/ is the one layer everything may import. platform/db.ts imports these
// back from here rather than declaring its own copy.

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
  | 'E_ENCODE_FAILED'
  // PDF-specific, per docs/kepttools/03 §2. Both are distinct from
  // E_CORRUPT_FILE: the file IS a readable PDF, it just cannot be operated on.
  | 'E_PDF_ENCRYPTED' | 'E_PDF_MALFORMED';

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
      product: 'keptpix-pro'; expiresAt: string | null }
  | { valid: false;
      reason: 'malformed' | 'bad-signature' | 'expired' | 'revoked' | 'absent' };

// ─── Batch ────────────────────────────────────────────────────────────────

/**
 * NOTE — `toJobResult()` is specified in docs/05 §1 alongside these types, but
 * docs/05 §1 also states it must be implemented in `src/state/jobs.slice.ts`
 * "and nowhere else". It is therefore NOT defined here: its parameter type
 * `SerializableResult` lives in `src/workers/protocol.ts` (docs/06 §2), and
 * importing that into `src/core/` would violate the docs/07 §2 dependency
 * table. It lands in state/jobs.slice.ts at Milestone 4.
 *
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
  /**
   * SIGNED: input minus output. NEGATIVE means the batch grew, which is a
   * real and expected outcome when converting from a more efficient format
   * (HEIC → JPEG). Callers must not assume it is positive — it was clamped to
   * zero once, and the result was a UI that reported "saved 0%" for a batch
   * that had grown by half. See docs/12 D-61.
   */
  savedBytes: number;
  /** Signed, same convention as savedBytes. */
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
  /**
   * canvas can DECODE it without WASM. Added alongside nativeEncode (docs/12
   * D-46): the decoder resolution table in docs/06 §1 needs to distinguish
   * "canvas specifically can do this" from "decode.avif is true because a
   * WASM adapter is registered" for its one preference-driven case — avif,
   * canvas-if-native-else-libavif. Without this, `decode.avif` being true (any
   * capable path) got misread as "canvas can do it," which would have made
   * the libavif fallback unreachable on exactly the browsers it exists for.
   */
  nativeDecode: Record<InputFormat, boolean>;
}

// ─── Route data model (build-time, drives prerendering) ───────────────────
// docs/05 §5. Lives here because src/content/ is data, and core/ owns types.

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

/**
 * docs/09 §2.3 specifies 12 /resize/[preset] routes and §2.4 specifies 11
 * /formats/[format] reference pages, but docs/05 §5 only defines the types for
 * format pairs and size presets. These two are the missing shapes.
 *
 * They are declared now, with the templates built against them, so Waves 2-4
 * are the "pure data additions requiring no further code" that docs/09 §6
 * promises. See docs/12 D-41.
 */
export interface ResizePresetRoute {
  /** "1920x1080" */
  slug: string;
  width: number;
  height: number;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  useCases: string[];
  faq: Array<{ q: string; a: string }>;
  relatedSlugs: string[];
  supported: boolean;
}

export interface FormatReferenceRoute {
  /** "heic" */
  slug: string;
  format: InputFormat;
  title: string;
  h1: string;
  metaDescription: string;
  /** What it is, who made it, why you have one. */
  intro: string;
  /** Where it works and where it does not. */
  support: Array<{ platform: string; status: string }>;
  /** When this format is the right choice, and when it is not. */
  whenToUse: string[];
  whenNotToUse: string[];
  faq: Array<{ q: string; a: string }>;
  /** Conversions available from this format. */
  relatedSlugs: string[];
  supported: boolean;
}
