/**
 * src/core/errors.ts
 *
 * The error taxonomy from docs/04-architecture.md §6.
 *
 * Every failure in the product maps to a code here and produces a specific,
 * actionable message. Silent failure is a defect; so is "Something went wrong."
 */
import type { JobError, JobErrorCode, JobResult } from './types';

/** Placeholder values interpolated into a message template. */
export type ErrorParams = Record<string, string | number>;

interface ErrorSpec {
  /** Template with {placeholder} slots, from docs/04 §6. */
  template: string;
  /** Drives whether the UI offers Retry. */
  recoverable: boolean;
}

const SPECS: Record<JobErrorCode, ErrorSpec> = {
  E_UNSUPPORTED_FORMAT: {
    template: "We can't read {detected} files yet. Supported: {supported}.",
    recoverable: false,
  },
  E_CORRUPT_FILE: {
    template: "This file appears to be damaged and couldn't be opened.",
    recoverable: false,
  },
  E_TOO_LARGE: {
    template:
      "This image is {width}x{height} — too large for this device's memory. Try resizing first.",
    recoverable: true,
  },
  E_OOM: {
    template: 'Ran out of memory. Close other tabs, or process fewer files at once.',
    recoverable: true,
  },
  E_TARGET_UNREACHABLE: {
    template:
      "Couldn't reach {target} without going below {width}x{height}. Best achieved: {actual}.",
    recoverable: true,
  },
  E_CODEC_LOAD_FAILED: {
    template: "Couldn't load the {format} engine. Check your connection and retry.",
    recoverable: true,
  },
  E_WORKER_CRASHED: {
    template: 'Processing stopped unexpectedly. Retrying…',
    recoverable: true,
  },
  E_ENCODE_FAILED: {
    template: "Couldn't save as {format}. Try a different output format.",
    recoverable: true,
  },
};

/** Any {placeholder} left unfilled would leak into the UI, so it is stripped. */
function interpolate(template: string, params: ErrorParams): string {
  return template
    .replace(/\{(\w+)\}/g, (whole, key: string) =>
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
    )
    .replace(/\s*\{[^}]*\}/g, '')
    .trim();
}

export interface CreateJobErrorOptions {
  params?: ErrorParams;
  /** Technical detail for the diagnostics panel only — never shown inline. */
  detail?: string;
  /** Only ever set for E_TARGET_UNREACHABLE (docs/05 §4 invariant 5). */
  bestEffort?: JobResult;
}

export function createJobError(
  code: JobErrorCode,
  options: CreateJobErrorOptions = {},
): JobError {
  const spec = SPECS[code];
  const error: JobError = {
    code,
    message: interpolate(spec.template, options.params ?? {}),
    recoverable: spec.recoverable,
  };
  if (options.detail !== undefined) error.detail = options.detail;
  if (options.bestEffort !== undefined) error.bestEffort = options.bestEffort;
  return error;
}

export function isRecoverable(code: JobErrorCode): boolean {
  return SPECS[code].recoverable;
}

/** All codes in the taxonomy, for exhaustiveness tests. */
export const JOB_ERROR_CODES = Object.keys(SPECS) as JobErrorCode[];
