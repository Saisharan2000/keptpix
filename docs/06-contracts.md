# 06 — Interface Contracts

There is no REST API in v1 — the app has no backend. The contracts that matter are **internal**: the worker message protocol and the engine interfaces. Those are specified with the same rigour an OpenAPI spec would get, because they are the seams Claude Code must not improvise across.

§4 contains the one genuine HTTP contract: the optional Phase-4 license Worker.

---

## 1. Engine interfaces

`src/engines/types.ts` — every codec adapter implements one of these. New formats are added by writing an adapter, never by editing the pipeline.

```ts
export interface DecodeInput {
  bytes: ArrayBuffer;
  format: InputFormat;
  /** Optional pre-downscale during decode, for memory-constrained devices. */
  maxPixels?: number;
}

export interface DecodeOutput {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  hasAlpha: boolean;
  decoderUsed: DecoderId;
}

export interface Decoder {
  readonly id: DecoderId;
  readonly formats: readonly InputFormat[];
  /** Cheap sync check — must not fetch WASM. */
  canHandle(format: InputFormat): boolean;
  /** Idempotent; loads WASM on first call, no-ops after. */
  init(): Promise<void>;
  decode(input: DecodeInput): Promise<DecodeOutput>;
  dispose(): void;
}

export interface EncodeInput {
  bitmap: ImageBitmap;
  format: OutputFormat;
  quality: number;               // 1-100; ignored when lossless
  lossless?: boolean;
  backgroundColor?: string;      // flatten alpha for JPEG
  effort?: number;               // codec-specific speed/size tradeoff
}

export interface EncodeOutput {
  blob: Blob;
  sizeBytes: number;
  encoderUsed: EncoderId;
}

export interface Encoder {
  readonly id: EncoderId;
  readonly formats: readonly OutputFormat[];
  readonly isNative: boolean;    // true = canvas, no WASM download
  canHandle(format: OutputFormat): boolean;
  init(): Promise<void>;
  encode(input: EncodeInput): Promise<EncodeOutput>;
  dispose(): void;
}
```

**Registry resolution order** (`src/engines/registry.ts`):

```ts
export function resolveEncoder(
  format: OutputFormat,
  preference: 'auto' | 'native' | 'best-quality',
  support: CodecSupport,
): Encoder;

export function resolveDecoder(
  format: InputFormat,
  support: CodecSupport,
): Decoder;
```

**Decoder resolution table** (no preference parameter — there is only ever one sensible decoder per format):

| Input format | Decoder |
|---|---|
| jpeg, png, webp, gif, bmp | `canvas` |
| avif | `canvas` if `support.decode.avif`, else `libavif` |
| heic, heif | `libheif` |
| jxl | `libjxl` |
| tiff | `utif` |
| svg | `svg` (rasterize via `Image` + canvas draw) |

Throws `E_UNSUPPORTED_FORMAT` if no decoder matches.

| preference | Behaviour |
|---|---|
| `native` | Canvas only. Throw `E_ENCODE_FAILED` if canvas can't do the format. |
| `auto` (default) | Canvas if `support.nativeEncode[format]`, else WASM. |
| `best-quality` | mozjpeg for JPEG, oxipng for PNG, libavif for AVIF, libjxl for JXL. Canvas only as last resort. |

Resolution must be **pure and synchronous** — no `await` inside `resolveEncoder`. WASM loading happens in `init()`, called by the pipeline after resolution.

---

## 2. Worker message protocol

Transport is **Comlink** over `postMessage`. Progress flows back through a Comlink-proxied callback rather than raw events, so the types stay checked end to end.

```ts
// src/workers/protocol.ts

export interface WorkerApi {
  /** Called once per worker at pool startup. */
  configure(profile: DeviceProfile): Promise<void>;

  /** Probe a file's dimensions + metadata without a full decode. */
  probe(bytes: ArrayBuffer, format: InputFormat): Promise<ProbeResult>;

  /** The main pipeline entry point. */
  process(
    req: ProcessRequest,
    onProgress: (p: JobProgressEvent) => void,   // Comlink.proxy()
  ): Promise<ProcessResponse>;

  /** Cooperative cancellation — the pipeline checks between passes. */
  cancel(jobId: string): Promise<void>;

  /** Free codec instances and buffers. Called before termination. */
  teardown(): Promise<void>;
}

export interface ProbeResult {
  width: number;
  height: number;
  metadata: ImageMetadata;
  estimatedDecodedBytes: number;   // width * height * 4
}

export interface ProcessRequest {
  jobId: string;
  bytes: ArrayBuffer;              // TRANSFERRED, not cloned
  sourceFormat: InputFormat;
  sourceName: string;
  config: JobConfig;
}

/** Named JobProgressEvent, not ProgressEvent — the latter shadows a DOM global. */
export type JobProgressEvent =
  | { jobId: string; phase: 'decoding'; progress: number }
  | { jobId: string; phase: 'resizing'; progress: number }
  | { jobId: string; phase: 'encoding'; progress: number;
      pass: number; maxPasses: number; currentBytes: number | null }
  | { jobId: string; phase: 'finalising'; progress: number };

export type ProcessResponse =
  | { ok: true;  jobId: string; result: SerializableResult }
  | { ok: false; jobId: string; error: JobError };

/** Blob is structured-cloneable; ImageBitmap is NOT returned to the main thread. */
export interface SerializableResult {
  blob: Blob;
  format: OutputFormat;
  sizeBytes: number;
  width: number;
  height: number;
  qualityUsed: number | null;
  scaleApplied: number;
  encoderUsed: EncoderId;
  durationMs: number;
  passesUsed: number;
  targetMet: boolean | null;
}
```

**Hard rules for Claude Code:**

1. `ProcessRequest.bytes` **must** be passed in the Comlink transfer list. Cloning a 50 MB buffer per job is a correctness-adjacent performance bug.
2. `ImageBitmap` never crosses back to the main thread. Close it inside the worker in a `finally` block.
3. `onProgress` must be wrapped in `Comlink.proxy()` at the call site or it will not survive the boundary.
4. Every worker method must be safe to call concurrently with `cancel`.

---

## 3. Domain function contracts

These are the pure, testable functions in `src/core/`. Signatures are fixed; implementations must satisfy the stated invariants.

### 3.1 Target-size search — the wedge feature

```ts
// src/core/target-size.ts

export type EncodeFn = (quality: number, scale: number) => Promise<number>;
// returns resulting byte length; injected so this is testable without a browser

export interface TargetSearchOptions {
  targetBytes: number;
  tolerance?: number;        // default 0.08 → accept 92-100% of target
  minQuality?: number;       // default 20 — below this, output is visibly bad
  maxQuality?: number;       // default 95
  maxPasses?: number;        // default 8
  allowDownscale?: boolean;  // default true
  minScale?: number;         // default 0.25
  scaleStep?: number;        // default 0.85
  signal?: AbortSignal;
}
// Every field but targetBytes is optional so the documented defaults are
// actually reachable; they are exported as DEFAULT_TARGET_SEARCH_OPTIONS.
// Widening only — a caller passing the full object still type-checks.

export interface TargetSearchResult {
  quality: number;
  scale: number;
  achievedBytes: number;
  passes: number;
  targetMet: boolean;
}

export async function searchForTargetSize(
  encode: EncodeFn,
  opts: TargetSearchOptions,
): Promise<TargetSearchResult>;
```

**Invariants — enforced by unit tests, non-negotiable:**

| # | Invariant |
|---|---|
| I-1 | If `targetMet === true`, then `achievedBytes <= targetBytes`. **Never overshoot.** |
| I-2 | `passes <= maxPasses` in every path, including the downscale retries. |
| I-3 | Monotonic assumption: the search assumes bytes increase with quality at fixed scale. Non-monotonic encoders must still terminate — bound by pass count, not by convergence. |
| I-4 | When `minQuality` at `scale = 1` still exceeds target and `allowDownscale`, multiply scale by `scaleStep` and restart the quality search. Stop at `minScale`. |
| I-5 | If the target is unreachable at `minScale`/`minQuality`, return `targetMet: false` with the **closest under-target result if one exists**, else the smallest achieved. Never throw. |
| I-6 | `signal.aborted` is checked before every encode pass. |
| I-7 | For `targetBytes` larger than the max achievable, return `maxQuality` at scale 1 in ≤ 2 passes — don't burn 8 passes on an easy case. Implemented by the **probe-at-maxQuality first** step in the algorithm below. |
| I-8 | The returned `quality` and `scale` are exactly the pair that produced `achievedBytes` — the caller re-encodes with them and must get the same result. Never return an unverified combination. |

**Reference algorithm:**

```
scale = 1

# Step 0 — easy-case probe. Satisfies I-7 in a single pass.
bytes = await encode(maxQuality, 1); passes = 1
if bytes <= targetBytes:
    return {quality: maxQuality, scale: 1, achievedBytes: bytes,
            passes, targetMet: true}

# Step 1 — per scale: probe the quality floor, then search upward from it.
while scale >= minScale and passes < maxPasses:

    # Step 1a — FLOOR PROBE. By the monotonic assumption (I-3), if minQuality
    # already overshoots at this scale then no quality here can fit, so skip
    # the scale entirely instead of binary-searching it.
    floorBytes = await encode(minQuality, scale); passes++
    if floorBytes > targetBytes:
        if not allowDownscale or passes >= maxPasses: break
        # Encoded size tracks pixel count, which goes as scale², so this
        # estimates the scale that lands on target in ONE jump. Bounded above
        # by scaleStep (never shrink less than documented), below by minScale.
        estimate = scale * sqrt(targetBytes / floorBytes)
        next = min(scale * scaleStep, max(estimate, minScale))
        if next >= scale: break
        scale = next
        continue

    # The floor fits, so it is a guaranteed-valid result to fall back on.
    best = {minQuality, scale, floorBytes}
    if floorBytes >= targetBytes * (1 - tolerance): return best

    # Step 1b — binary search UPWARD, buying back quality the target allows.
    hiBound = (maxQuality - 1) if scale == 1 else maxQuality
    lo = minQuality + 1, hi = hiBound
    while lo <= hi and passes < maxPasses:
        q = floor((lo + hi) / 2)
        bytes = await encode(q, scale); passes++
        if bytes <= targetBytes:
            best = {q, scale, bytes}
            if bytes >= targetBytes * (1 - tolerance): return best  // in band
            lo = q + 1
        else:
            hi = q - 1
    return best

return closestUnderTarget ?? smallestAchieved   // targetMet: false
```

> **Amended during Milestone 2 — why the floor probe and the proportional jump.**
>
> The original Step 1 searched each scale from the midpoint and only discovered
> the scale was hopeless after the search collapsed. Measured on a realistic
> 12 MP photo (quality 95 ≈ 6 MB) targeting 100 KB, that spent **6 of the 8
> passes** proving scale 1 could not work, got one pass at scale 0.85, and
> returned `targetMet: false`. The same held for 50 KB and 20 KB — exactly the
> Form Filer targets in `09-seo-content-plan.md` §2.2, and exactly the case
> `04-architecture.md` §3 calls out as the one competitors handle badly. It
> would have failed the Milestone 7 acceptance outright.
>
> Probing `minQuality` first turns "is this scale viable?" into one pass instead
> of six, and the `sqrt(target/achieved)` jump replaces a linear 0.85 walk with
> a direct estimate. Same pass budget, same invariants, same signature:
>
> | 12 MP → target | before | after |
> |---|---|---|
> | 100 KB | unmet, 8 passes | **met, 3 passes**, 100.0% of target |
> | 50 KB | unmet, 8 passes | **met, 3 passes**, 100.0% of target |
> | 20 KB | unmet, 8 passes | **met, 3 passes**, 100.0% of target |
>
> Targets needing a scale below `minScale` (20 KB from 16 MP needs 0.2375) are
> still correctly unmet — that is a constraint binding, not a search failure,
> and it surfaces as the soft `E_TARGET_UNREACHABLE` with the "Allow resizing to
> reach target" action in `08-design-system.md` §5.

### 3.2 Format detection

```ts
// src/core/detect.ts
export function detectFormat(head: Uint8Array): InputFormat | null;
```

Magic-byte table Claude Code must implement (never trust the extension or the browser MIME):

| Format | Signature |
|---|---|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| GIF | `47 49 46 38` (`GIF8`) |
| BMP | `42 4D` (`BM`) |
| WebP | `52 49 46 46` at 0, `57 45 42 50` at 8 |
| TIFF | `49 49 2A 00` or `4D 4D 00 2A` |
| HEIC/HEIF | `66 74 79 70` at offset 4, brand at 8 ∈ {`heic`,`heix`,`hevc`,`mif1`,`msf1`,`heim`,`heis`} |
| AVIF | `66 74 79 70` at offset 4, brand at 8 ∈ {`avif`,`avis`} |
| JXL | `FF 0A` (raw codestream) or `00 00 00 0C 4A 58 4C 20 0D 0A 87 0A` (container) |
| SVG | UTF-8 text containing `<svg` in the first 1024 bytes |

Requires at least 16 bytes; return `null` on short reads.

### 3.3 Resize

```ts
export function computeTargetDimensions(
  source: Dimensions,
  spec: ResizeSpec,
): Dimensions;

export function planDownscaleSteps(
  from: Dimensions,
  to: Dimensions,
): Dimensions[];   // no step reduces by more than 2× per axis
```

Stepped downscaling exists because a single large-ratio `drawImage` produces visible aliasing. Halving repeatedly then finishing with the remainder is markedly better and costs almost nothing.

### 3.4 Memory guard

```ts
export function assessMemoryRisk(
  dims: Dimensions,
  device: DeviceProfile,
): { safe: boolean; suggestedMaxPixels: number | null; reason?: JobErrorCode };
```

Budget: `deviceMemoryGb * 1024^3 * 0.25`, decoded cost estimated at `w * h * 4 * 2.2` (bitmap + working copies + encoder scratch). Mobile Safari gets an additional hard ceiling of **80 megapixels total in flight**, which is the empirical crash line.

---

## 4. HTTP contract — Phase 4 license Worker (optional)

The **only** sanctioned network endpoint, and it never touches user files. Deployed as a Cloudflare Worker on the free tier (100k req/day, 10 ms CPU, $0).

```yaml
openapi: 3.1.0
info:
  title: NoUpload License Service
  version: 1.0.0
  description: >
    Issues Ed25519-signed offline license tokens on a verified purchase webhook.
    Handles no user content of any kind. Phase 4 only — the app is fully
    functional without it.
servers:
  - url: https://license.noupload.app

paths:
  /webhook/purchase:
    post:
      summary: Payment-provider webhook; issues and emails a license token
      description: >
        Verifies the provider signature, mints an Ed25519-signed token, and
        emails it to the purchaser. Called by the provider, never by the browser.
      security: [{ providerSignature: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PurchaseEvent' }
      responses:
        '200': { description: Token issued }
        '401': { description: Invalid provider signature }
        '429': { description: Rate limited }

  /revoked.json:
    get:
      summary: Static revocation list, served from the CDN
      description: >
        Fetched by the client at most once every 24h. A leaked key can be
        revoked without any server-side verification.
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                required: [version, revokedKeyIds, updatedAt]
                properties:
                  version: { type: integer }
                  revokedKeyIds:
                    type: array
                    items: { type: string }
                  updatedAt: { type: string, format: date-time }

components:
  securitySchemes:
    providerSignature:
      type: apiKey
      in: header
      name: X-Signature
  schemas:
    PurchaseEvent:
      type: object
      required: [eventId, email, productId, purchasedAt]
      properties:
        eventId:    { type: string }
        email:      { type: string, format: email }
        productId:  { type: string }
        purchasedAt:{ type: string, format: date-time }
    LicensePayload:
      type: object
      description: The signed payload; base64url-encoded alongside its signature.
      required: [keyId, email, product, issuedAt, version]
      properties:
        keyId:    { type: string, description: UUID, appears in revoked.json }
        email:    { type: string, format: email }
        product:  { type: string, enum: [noupload-pro] }
        issuedAt: { type: string, format: date-time }
        expiresAt:{ type: [string, 'null'], format: date-time }
        version:  { type: integer, const: 1 }
```

### 4.1 Client-side verification

```ts
// src/platform/license.ts
export async function verifyLicense(token: string): Promise<LicenseStatus>;
```

`LicenseStatus` is defined in `05-data-models.md` §1 (Licensing section).

Ed25519 is now available in WebCrypto across all three engines (Chrome shipped it in M137, Aug 2025 — Firefox and Safari were already there). The public key is embedded in the bundle; verification is entirely offline:

```ts
const key = await crypto.subtle.importKey(
  'raw', PUBLIC_KEY_BYTES, { name: 'Ed25519' }, false, ['verify'],
);
const valid = await crypto.subtle.verify('Ed25519', key, sig, payloadBytes);
```

### 4.2 Stated honestly: what this does and doesn't do

**⚠️ Any license check performed in the client is bypassable.** DevTools, a patched bundle, a blocked network request, or a shared key all defeat it. This is *friction and an honesty prompt*, not enforcement.

What actually helps:
- A static `revoked.json` on the CDN — revokes leaked keys with zero server cost
- Binding the key to an email displayed in the UI — social friction
- Accepting ~15–30% leakage as the price of having no backend

Never gate anything with legal or safety consequences behind this.

### 4.3 Payment provider comparison (2026 rates)

| Provider | Fee | Merchant of record | Note |
|---|---|---|---|
| **Polar** Starter | 5% + $0.50 | Yes | Raised from 4% + $0.40 in 2026; +1.5% non-US cards, $15/chargeback |
| Paddle / Lemon Squeezy | ~5% + $0.50 | Yes | ⚠️ Lemon Squeezy was acquired by Stripe — verify status before building on it |
| **Stripe Payment Links** | ~2.9% + $0.30 (US) | **No** | Cheapest, but EU VAT / US sales tax becomes your problem |

**Recommendation:** Polar or Paddle as merchant of record — the tax handling is worth ~2% when you have no company infrastructure. Their hosted `validate` endpoints (Lemon Squeezy documents 60 req/min, no auth header) are an alternative to offline keys, but offline Ed25519 works with no network at all, which fits an offline-capable PWA far better.

---

## 5. Contract test checklist

| Contract | Test |
|---|---|
| `searchForTargetSize` | Property test: 500 synthetic encoders (monotonic, noisy, step-function) × targets → I-1 and I-2 hold in every case |
| `detectFormat` | Fixture files for all 11 formats + truncated + zero-byte + extension-mismatched |
| `resolveEncoder` | Table test across 3 preferences × 5 formats × 2 support matrices |
| Worker protocol | Round-trip a real 4 MP JPEG; assert bytes were transferred (source buffer `byteLength === 0` after send) |
| `assessMemoryRisk` | Boundary cases at 2/4/8/16 GB × 1/12/50/100 MP |
| License verify | Valid token, tampered payload, wrong key, revoked keyId, expired |
| **Privacy** | Playwright intercepting all network. Assert: (a) **zero** requests with a non-empty body, ever; (b) zero requests of **any** kind while a job is in flight; (c) every request's origin is in the allowlist — `self` only through Milestone 7; the Cloudflare Insights beacon is added in Milestone 8 and our R2 bucket in Phase 3. Nothing else, ever. |
| `toJobResult` | Round-trip a `SerializableResult` and assert every `JobResult` field is populated, `compressionRatio` is correct, and `outputName` handles collisions |
| `resolveDecoder` | Table test across all 11 input formats × 2 support matrices; unsupported format throws `E_UNSUPPORTED_FORMAT` |
