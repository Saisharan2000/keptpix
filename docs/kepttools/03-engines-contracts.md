# 03 — Engines & Contracts (delta to KeptPix docs 05/06)

KeptPix's type language, worker protocol, invariants, and error taxonomy carry over. This file adds the tool manifest, two new engine families, and their contracts.

## 1. ToolManifest — the scaling mechanic

```ts
// src/core/tools.ts — single source of truth for what exists
export type ToolId =
  | 'pdf-merge' | 'pdf-compress' | 'images-to-pdf' | 'pdf-to-images'
  | 'pdf-split' | 'pdf-rotate' | 'pdf-sign'
  | 'video-compress' | 'video-trim' | 'video-to-gif' | 'video-extract-audio'
  | 'qr-generate';

export interface ToolManifestEntry {
  id: ToolId;
  slug: string;                       // '/pdf/merge', '/video/compress'
  engine: 'pdf' | 'video' | 'qr';
  accept: string[];                   // MIME/extensions for the dropzone
  multiFile: boolean;
  output: 'single' | 'zip';
  configFields: ConfigFieldSpec[];    // drives the parameterized ConfigPanel
  defaultConfig: ToolConfig;
  targetSizeCapable: boolean;         // wires in core/target-size when true
  licenseTier: 'free' | 'pro';        // pro = gated behind kept-pro (Phase 4)
  supported: boolean;                 // the hard gate, same as KeptPix
}
```

Adding a manifest-only tool (e.g. pdf-rotate once pdf-split exists) must require **zero shell changes** — that property is asserted by a test that renders every manifest entry through the shell.

## 2. PDF engine — `src/engines/pdf/`

**Libraries:** `pdfjs-dist` (render/extract, same-origin worker asset) + `@cantoo/pdf-lib` (mutate/create). ⛔ `pdf-lib` itself and AGPL `mupdf` remain forbidden (KeptPix doc 07 §3 rules).

```ts
export interface PdfEngine {
  init(): Promise<void>;
  probe(bytes: ArrayBuffer): Promise<PdfProbe>;        // pages, encrypted?, sizes
  merge(docs: ArrayBuffer[], order: number[]): Promise<Blob>;
  split(doc: ArrayBuffer, ranges: PageRange[]): Promise<Blob[]>;   // → ZIP
  rotate(doc: ArrayBuffer, ops: RotateOp[]): Promise<Blob>;
  imagesToPdf(images: DecodedImage[], layout: PageLayout): Promise<Blob>;
  pdfToImages(doc: ArrayBuffer, opts: RasterOpts): Promise<Blob[]>; // → ZIP
  compress(doc: ArrayBuffer, opts: PdfCompressOpts,
           onProgress: (p: JobProgressEvent) => void): Promise<PdfCompressResult>;
  sign(doc: ArrayBuffer, sig: SignatureSpec): Promise<Blob>;
}
```

**`compress` contract — the wedge, reusing `searchForTargetSize`:**
- The injected `EncodeFn` re-encodes embedded images at quality *q* (via the existing KeptPix codec engines — direct reuse) and rebuilds the document; scale dimension = image downsampling factor.
- All KeptPix invariants I-1..I-8 hold. `E_TARGET_UNREACHABLE` soft-fail (result + warning) when the floor is text content that cannot shrink — with the honest message from doc 02 §4.
- Encrypted PDFs: `E_PDF_ENCRYPTED` (new code) with a passphrase prompt path via @cantoo's decrypt support; wrong passphrase → same code, `recoverable: true`.

**New error codes (extend KeptPix 04 §6 table):** `E_PDF_ENCRYPTED`, `E_PDF_MALFORMED` (distinct from `E_CORRUPT_FILE`: the file *is* a PDF but violates spec — pdf-lib throws; message names the page if known).

## 3. Video engine — `src/engines/video/`

**Library:** `mediabunny` (WebCodecs; pure TS; no COOP/COEP requirement — ADR-003 holds). GIF encode via `gifenc`.

```ts
export interface VideoEngine {
  init(): Promise<void>;
  probe(file: File): Promise<VideoProbe>;   // duration, dims, codecs, whether THIS browser can decode/encode them
  compressToSize(file: File, opts: VideoTargetOpts,
                 onProgress: (p: JobProgressEvent) => void): Promise<VideoResult>;
  trim(file: File, startMs: number, endMs: number,
       reencode: boolean): Promise<Blob>;      // reencode=false → lossless stream copy when container allows
  toGif(file: File, opts: GifOpts): Promise<Blob>;
  extractAudio(file: File, format: 'mp3' | 'aac' | 'wav'): Promise<Blob>;
}
```

**`compressToSize` contract — the KeptPix wedge at video scale:**
- **Two-pass bitrate targeting, not quality binary search**: target bitrate = (targetBytes × 8 − audioBudget) / durationSec, then one encode pass; verify; one corrective pass if >100% or <85% of target. Max 3 passes (video encodes are expensive — 8 passes is not acceptable here).
- Presets are first-class config: Discord 8 MB / Discord Nitro 500 MB / WhatsApp 16 MB / email 25 MB — these become routes (doc 04).
- Never overshoot (I-1 carries over). Resolution downscale (720p → 480p ladder) when even the bitrate floor overshoots — same spirit as KeptPix's scale ladder, with the applied rung reported.
- **Streaming mandatory**: input read and output written incrementally; peak working set independent of file size.
- Capability honesty: `probe` reports what this browser can encode; a tool whose output codec is unavailable renders the pre-flight notice (KeptPix D-55 pattern), never a failing convert button.

**New error codes:** `E_CODEC_UNSUPPORTED_HERE` (this browser lacks the decoder/encoder; message names the codec and suggests Chrome/Edge), `E_VIDEO_TOO_LONG` (duration × target implies bitrate below floor even at lowest rung).

## 4. QR engine — `src/engines/qr/`

`qr-code-styling` or equivalent, SVG-first output (print quality), PNG export via existing canvas encoder. Payload builders as pure `core/` functions: URL, WiFi (WPA/WEP/open), vCard, plain text. Batch-from-CSV (pro tier) reuses PapaParse + existing ZIP delivery. Trivial; no new error codes beyond `E_QR_PAYLOAD_TOO_LONG`.

## 5. Worker topology

One worker **per engine family** (pdf.worker, video.worker, image.worker retained from the template), same Comlink protocol, same transfer rules, same pool policy. Engines lazy-load per first use exactly like KeptPix codecs; a session that only merges PDFs downloads zero video code. Budgets: pdfjs worker asset and mediabunny chunk each count against the per-asset caps; `check:budgets` extends to them.

## 6. Contract test additions

| Contract | Test |
|---|---|
| Manifest completeness | Every `ToolManifestEntry` renders through the shell; every slug builds a route; `supported:false` builds nothing |
| PDF compress invariants | Property tests reusing the KeptPix I-1..I-8 suite with the PDF EncodeFn |
| Video two-pass targeting | Synthetic duration/bitrate matrix: never overshoot, ≤3 passes, correct rung reporting |
| Codec honesty | Mock probe with gaps → pre-flight notice renders, convert button absent |
| Encrypted PDF path | Right/wrong/absent passphrase → correct codes, batch never aborts |
| Privacy | The KeptPix suite verbatim, plus: a 100 MB video conversion produces zero requests with bodies (the headline claim at its most valuable) |
