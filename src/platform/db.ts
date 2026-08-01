/**
 * src/platform/db.ts
 *
 * Spec: docs/05-data-models.md §2 — Dexie schema
 * Implemented in: Milestone 8
 *
 * Settings and presets ONLY. User images are NEVER written here (ADR-005).
 *
 * Migration policy: every stored record carries schemaVersion. On mismatch,
 * this module attempts nothing clever — it resets to defaults rather than
 * crash. A settings blob is never worth an error screen (docs/05 §2).
 *
 * `dexie` is imported dynamically inside getDb(), never at module top level
 * (docs/12 D-52). A static `import Dexie from 'dexie'` bundles the whole
 * library into whatever eagerly imports this file — which, transitively
 * through state/store.ts, is every tool page's hydration bundle — and pushed
 * the baseline island past the 60 KB budget in docs/04 §7 the first time this
 * was written the obvious way. Same reasoning as client-zip in deliver.ts.
 */
import type { Table } from 'dexie';
import type { StoredLicense, StoredPreset, StoredSettings } from '../core/types';

export const SCHEMA_VERSION = 1;

// Re-exported so existing call sites that import these shapes from here
// (state/store.ts, etc.) do not need to change — only components/react/,
// which core/types.ts's own boundary reasoning explains, needed the move.
export type { StoredSettings, StoredPreset, StoredLicense };

interface NoUploadDb {
  settings: Table<StoredSettings, string>;
  presets: Table<StoredPreset, string>;
  license: Table<StoredLicense, string>;
}

let instance: NoUploadDb | null = null;

async function getDb(): Promise<NoUploadDb> {
  if (instance !== null) return instance;
  const { default: Dexie } = await import('dexie');

  class Impl extends Dexie implements NoUploadDb {
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

  instance = new Impl();
  return instance;
}

/** IndexedDB throws in Safari private browsing rather than just failing open. */
function isStorageUnavailable(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    ((cause as { name?: string }).name === 'InvalidStateError' ||
      (cause as { name?: string }).name === 'SecurityError')
  );
}

export async function loadSettings(): Promise<StoredSettings | null> {
  try {
    const db = await getDb();
    const row = await db.settings.get('settings');
    if (row === undefined) return null;
    // A settings blob from an older schemaVersion is not trusted blindly —
    // docs/05 §2 calls for forward migration or a reset, and there is only
    // ever one version so far, so "not current" reduces to "reset".
    if (row.schemaVersion !== SCHEMA_VERSION) return null;
    return row;
  } catch (cause) {
    if (isStorageUnavailable(cause)) return null;
    return null;
  }
}

export async function saveSettings(settings: Omit<StoredSettings, 'key' | 'schemaVersion'>): Promise<void> {
  try {
    const db = await getDb();
    await db.settings.put({ ...settings, key: 'settings', schemaVersion: SCHEMA_VERSION });
  } catch {
    // A settings write that cannot land (quota, private browsing) degrades to
    // "this session only" rather than an error the user has to act on.
  }
}

export async function loadPresets(): Promise<StoredPreset[]> {
  try {
    const db = await getDb();
    return await db.presets.toArray();
  } catch (cause) {
    if (isStorageUnavailable(cause)) return [];
    return [];
  }
}

export async function putPreset(preset: StoredPreset): Promise<void> {
  try {
    const db = await getDb();
    await db.presets.put(preset);
  } catch {
    // Same reasoning as saveSettings: a preset that cannot be saved is a
    // this-session-only preset, not a crash.
  }
}

export async function deletePreset(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.presets.delete(id);
  } catch {
    /* nothing to roll back — the row either goes or it was never durable */
  }
}

export async function incrementPresetUsage(id: string): Promise<void> {
  try {
    const db = await getDb();
    const current = await db.presets.get(id);
    if (current === undefined) return;
    await db.presets.update(id, { usageCount: current.usageCount + 1 });
  } catch {
    /* usage count is a hint for sorting, never load-bearing */
  }
}
