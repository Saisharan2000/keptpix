/**
 * src/engines/svg.ts — SVG support (feature M-17).
 *
 * There is no Decoder class here, and that is the point.
 *
 * Measured in Chromium: `createImageBitmap` cannot decode an SVG blob at all,
 * on the main thread or in a worker. The portable route is HTMLImageElement +
 * drawImage — exactly what docs/07 §1 prescribes ("Image + canvas, no WASM") —
 * and HTMLImageElement is a DOM API, which a Web Worker does not have.
 *
 * So rasterisation happens on the MAIN THREAD in platform/raster.ts, as a
 * documented exception to docs/07 §4 non-negotiable 3, and the worker receives
 * an ordinary PNG. See docs/12 D-03.
 *
 * The pure sizing maths lives in core/resize.ts so that platform/ can reach it
 * without crossing the docs/07 §2 boundary. It is re-exported here so this
 * module remains the place you look for "how does SVG work".
 */
export {
  computeRasterSize,
  readSvgSize,
  DEFAULT_RASTER_SIZE,
} from '../core/resize';
