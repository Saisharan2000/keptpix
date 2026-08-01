/**
 * src/engines/wasm/jxl.ts
 *
 * ⚠️ NO WASM IS SHIPPED FROM THIS FILE. See docs/12 D-46.
 *
 * @jsquash/jxl's own encoder binary (jxl_enc.wasm) is 1.36 MB — 13% over the
 * 1.2 MB per-codec ceiling in docs/04 §7, and it is already the smallest
 * available build (the MT and MT+SIMD variants are larger still, and both are
 * irrelevant regardless: ADR-003 forbids the SharedArrayBuffer they need).
 * There is also no currently-planned route that needs JXL DECODE — docs/09
 * §2.1's matrix lists JXL only as a destination column (jpg-to-jxl,
 * png-to-jxl), never as a source row.
 *
 * docs/09 §2.1 itself frames JXL as "a timed bet": Chrome shipped it behind a
 * flag in Feb 2026 with on-by-default expected H2 2026 — which, as of this
 * writing, is now. That cuts against taking on a budget exception for a
 * stopgap that native support may already be closing: the honest, lower-risk
 * choice is to rely on ADR-004's feature-detection (support.nativeEncode.jxl)
 * and let JXL-output routes activate as browsers ship it, rather than bake in
 * an over-budget WASM fallback for a gap that is actively narrowing.
 *
 * Where neither canvas nor a registered WASM encoder can produce JXL,
 * resolveEncoder already throws E_ENCODE_FAILED with a specific message
 * (docs/06 §1) — the correct, honest behaviour, not a gap to route around.
 *
 * Revisit this file if: (a) Chrome's on-by-default flip slips well past H2
 * 2026, or (b) a smaller JXL encoder build becomes available.
 */

export {};
