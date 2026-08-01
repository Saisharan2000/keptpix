/**
 * src/state/persistence.slice.ts
 *
 * Settings + presets, backed by src/platform/db.ts (docs/05 §2). Not part of
 * the AppState shape docs/05 §4 specifies — that doc predates Milestone 8 and
 * lists only the in-memory conversion state. Presets/settings are an
 * additive extension of the same store, not a change to any existing field
 * (docs/12 D-50).
 *
 * Matches the jobs.slice.ts / config.slice.ts convention: this file holds
 * only the shape and pure helpers. Every action that touches `set`/`get`
 * lives in store.ts's own initializer, same as every other slice.
 *
 * The built-in presets used to be a hardcoded array inside PresetPicker.tsx.
 * docs/05 §2 gives StoredPreset an `isBuiltIn` flag specifically so built-ins
 * are ordinary rows a user can still see in one list — so they are seeded
 * into Dexie once, on first run, rather than living outside the schema.
 */
import type { JobConfig, StoredPreset, StoredSettings } from '../core/types';
import { DEFAULT_CONFIG, mergeConfig } from './config.slice';

export type PersistedSettings = Omit<StoredSettings, 'key' | 'schemaVersion'>;

export const DEFAULT_SETTINGS: PersistedSettings = {
  theme: 'system',
  defaultConfig: DEFAULT_CONFIG,
  showMetadataWarnings: true,
  keepFilesForSession: false,
  locale: 'en',
};

const BUILT_IN_SEEDS: Array<{ id: string; name: string; config: Partial<JobConfig> }> = [
  {
    id: 'web',
    name: 'Web (WebP, quality 80)',
    config: { outputFormat: 'webp', sizeMode: { kind: 'quality', quality: 80 } },
  },
  {
    id: 'passport',
    name: 'Form upload (JPG, 100 KB)',
    config: { outputFormat: 'jpeg', sizeMode: { kind: 'target', targetBytes: 100_000 } },
  },
  {
    id: 'archive',
    name: 'Archive (PNG, lossless)',
    config: { outputFormat: 'png', sizeMode: { kind: 'lossless' } },
  },
];

/**
 * platform/db.ts cannot hold this: `07 §2` grants platform/ only core/, and
 * turning a partial built-in into a full JobConfig needs config.slice.ts's
 * DEFAULT_CONFIG. That merge is policy, not storage, so it lives here.
 */
export function seedBuiltIns(): StoredPreset[] {
  const now = Date.now();
  return BUILT_IN_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    config: mergeConfig(DEFAULT_CONFIG, seed.config),
    isBuiltIn: true,
    usageCount: 0,
    createdAt: now,
  }));
}

/** A defensive structural check — this is user-supplied file content, a real boundary. */
export function looksLikeStoredPreset(value: unknown): value is Pick<StoredPreset, 'name' | 'config'> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') return false;
  if (typeof candidate.config !== 'object' || candidate.config === null) return false;
  const config = candidate.config as Record<string, unknown>;
  return typeof config.outputFormat === 'string' && typeof config.sizeMode === 'object';
}

export interface PersistenceSlice {
  settings: PersistedSettings;
  presets: StoredPreset[];
  /** Loads settings + presets once at startup, seeding built-ins on first run. */
  hydratePersistence(): Promise<void>;
  updateSettings(patch: Partial<PersistedSettings>): void;
  savePreset(name: string, config: JobConfig): Promise<void>;
  /** Returns the preset's config so the caller can apply it, or null if unknown. */
  applyPresetConfig(id: string): JobConfig | null;
  deletePreset(id: string): Promise<void>;
  /** Non-built-in presets only — built-ins are always re-seeded, exporting them is noise. */
  exportPresetsJson(): string;
  /** Triggers a real file download of exportPresetsJson() — the durability story
   * docs/05 §2 calls for, given IndexedDB is not durable under Safari's 7-day
   * ITP eviction. Lives here, not in the component, so platform/deliver stays
   * an import only state/ makes (docs/07 §2). */
  downloadPresetsExport(): void;
  /** Returns how many presets were actually imported, for the caller to report. */
  importPresetsJson(json: string): Promise<number>;
}
