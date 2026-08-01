/**
 * src/state/config.slice.ts
 *
 * The working JobConfig applied to new jobs, plus per-file overrides.
 * Route slugs preconfigure this via applyRouteDefaults (docs/10 M4).
 */
import type { JobConfig } from '../core/types';

export const DEFAULT_CONFIG: JobConfig = {
  outputFormat: 'jpeg',
  sizeMode: { kind: 'quality', quality: 82 },
  resize: { kind: 'none' },
  metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
  encoderPreference: 'auto',
  backgroundColor: '#ffffff',
};

export interface ConfigSlice {
  config: JobConfig;
  perFileOverrides: Map<string, Partial<JobConfig>>;
  setConfig(patch: Partial<JobConfig>): void;
  /**
   * Applied once on mount from the route slug. Kept separate from setConfig so
   * a size-preset route in Milestone 6 plugs into the SAME mechanism with no
   * component changes.
   */
  applyRouteDefaults(defaults: Partial<JobConfig>): void;
  setOverride(sourceId: string, patch: Partial<JobConfig>): void;
  configFor(sourceId: string): JobConfig;
}

export function mergeConfig(base: JobConfig, patch: Partial<JobConfig>): JobConfig {
  return {
    ...base,
    ...patch,
    metadata: { ...base.metadata, ...(patch.metadata ?? {}) },
  };
}
