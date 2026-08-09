/**
 * src/workers/image.worker.ts
 *
 * Comlink.expose(api). All image work happens here so the main thread never
 * blocks (docs/07 §4 non-negotiable 3).
 */
import * as Comlink from 'comlink';
import type { CodecSupport, DeviceProfile, InputFormat } from '../core/types';
import {
  BASELINE_NATIVE_ENCODE,
  resolveCodecSupport,
  resolveDeviceProfile,
  withEncodeBaseline,
  WASM_DECODE_FORMATS,
} from '../core/capabilities';
import type { PdfLayoutOptions } from '../core/pdf/layout';
import type { PdfSourceImage, PreparedPdfImage } from '../core/pdf/types';
import { canvasDecoder, probeNativeDecodeFormats } from '../engines/canvas/decoder';
import { canvasEncoder, probeNativeEncodeFormats } from '../engines/canvas/encoder';
import { assemblePdf, prepareImageForPdf } from '../engines/pdf/images-to-pdf';
import { mergePdfs, probePdf, rotatePdf, splitPdf, type PdfProbe } from '../engines/pdf/document';
import { countPdfPages, rasterisePdf, type RasterOptions, type RasterPage } from '../engines/pdf/raster';
import { resolveDecoder } from '../engines/registry';
import { runPipeline } from './pipeline';
import {
  EMPTY_METADATA,
  type ProbeResult,
  type ProcessRequest,
  type ProcessResponse,
  type JobProgressEvent,
  type SerializableSplitPart,
  type WorkerApi,
} from './protocol';

let device: DeviceProfile = resolveDeviceProfile();
let support: CodecSupport = resolveCodecSupport({
  nativeEncode: BASELINE_NATIVE_ENCODE,
  nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  wasmDecode: WASM_DECODE_FORMATS,
});

/** One controller per in-flight job, so cancel() can target a single file. */
const inFlight = new Map<string, AbortController>();

const api: WorkerApi = {
  async configure(profile: DeviceProfile): Promise<void> {
    device = profile;
    // Ask the browser what canvas can really encode, then let the pure
    // resolver in core/ decide what that means (ADR-004 + ADR-006).
    // withEncodeBaseline guards against a failed probe disabling everything —
    // EXCEPT where there is no OffscreenCanvas to have failed, in which case an
    // empty probe is the truth and must not be overwritten (docs/12 D-55, WO-2).
    // `self` is the worker global; this is the same check pool.ts makes.
    const nativeEncode = withEncodeBaseline(
      await probeNativeEncodeFormats(),
      typeof OffscreenCanvas !== 'undefined',
    );

    // Real feature detection (docs/12 D-46): a browser that decodes AVIF for
    // free must not be routed through libavif's WASM decoder (ADR-004).
    const nativeDecode: InputFormat[] = [
      'jpeg', 'png', 'webp', 'gif', 'bmp',
      ...(await probeNativeDecodeFormats()),
    ];

    support = resolveCodecSupport({ nativeEncode, nativeDecode, wasmDecode: WASM_DECODE_FORMATS });
    // Keep both adapters' own lists in step with the matrix, so canHandle()
    // never contradicts what resolution just decided.
    canvasEncoder.setSupportedFormats(nativeEncode);
    canvasDecoder.setSupportedFormats(nativeDecode);
  },

  async probe(bytes: ArrayBuffer, format: InputFormat): Promise<ProbeResult> {
    // Milestone 5 replaces this with a header-only parse via exifr. For now a
    // decode is the only way to learn the dimensions on the canvas path.
    const decoder = resolveDecoder(format, support);
    await decoder.init();
    const out = await decoder.decode({ bytes, format });
    try {
      return {
        width: out.width,
        height: out.height,
        metadata: EMPTY_METADATA,
        estimatedDecodedBytes: out.width * out.height * 4,
      };
    } finally {
      out.bitmap.close();
    }
  },

  async process(
    req: ProcessRequest,
    onProgress: (event: JobProgressEvent) => void,
  ): Promise<ProcessResponse> {
    const controller = new AbortController();
    inFlight.set(req.jobId, controller);
    try {
      return await runPipeline(req, { device, support, signal: controller.signal }, onProgress);
    } finally {
      inFlight.delete(req.jobId);
    }
  },

  async prepareForPdf(source: PdfSourceImage): Promise<PreparedPdfImage> {
    const prepared = await prepareImageForPdf(source, support);
    // Transfer rather than clone — for the passthrough case this buffer is the
    // original file, and copying a 40 MP photo back is the whole cost of the
    // operation (CLAUDE.md: transfer ArrayBuffers to workers, never clone).
    return Comlink.transfer(prepared, [prepared.bytes]);
  },

  async assemblePdf(
    images: readonly PreparedPdfImage[],
    options: PdfLayoutOptions,
  ): Promise<ArrayBuffer> {
    const document = assemblePdf(images, options);
    // `buildPdf` allocates exactly once and the view spans the whole buffer,
    // so the underlying ArrayBuffer can be handed over as-is.
    const buffer = document.buffer as ArrayBuffer;
    return Comlink.transfer(buffer, [buffer]);
  },

  async probePdf(bytes: ArrayBuffer): Promise<PdfProbe> {
    return probePdf(bytes);
  },

  async mergePdfs(sources: readonly ArrayBuffer[]): Promise<ArrayBuffer> {
    const merged = await mergePdfs(sources);
    const buffer = merged.buffer as ArrayBuffer;
    return Comlink.transfer(buffer, [buffer]);
  },

  async splitPdf(
    bytes: ArrayBuffer,
    groups: readonly (readonly number[])[],
  ): Promise<SerializableSplitPart[]> {
    const parts = await splitPdf(bytes, groups);
    const serialisable = parts.map((part) => ({
      indices: part.indices,
      bytes: part.bytes.buffer as ArrayBuffer,
    }));
    return Comlink.transfer(
      serialisable,
      serialisable.map((part) => part.bytes),
    );
  },

  async rotatePdf(
    bytes: ArrayBuffer,
    indices: readonly number[],
    angle: number,
  ): Promise<ArrayBuffer> {
    const rotated = await rotatePdf(bytes, indices, angle);
    const buffer = rotated.buffer as ArrayBuffer;
    return Comlink.transfer(buffer, [buffer]);
  },

  async countPdfPages(bytes: ArrayBuffer): Promise<number> {
    return countPdfPages(bytes);
  },

  async rasterisePdf(
    bytes: ArrayBuffer,
    options: RasterOptions,
    onPage: (done: number, total: number) => void,
  ): Promise<RasterPage[]> {
    const pages = await rasterisePdf(bytes, options, onPage);
    // Every rendered page is transferred rather than cloned; at 150 DPI a
    // 40-page document is tens of megabytes.
    return Comlink.transfer(
      pages,
      pages.map((page) => page.bytes),
    );
  },

  async cancel(jobId: string): Promise<void> {
    inFlight.get(jobId)?.abort();
  },

  async teardown(): Promise<void> {
    for (const controller of inFlight.values()) controller.abort();
    inFlight.clear();
    canvasEncoder.dispose();
  },
};

Comlink.expose(api);

export type { WorkerApi };
