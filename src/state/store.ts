/**
 * src/state/store.ts — the Zustand root, shaped per docs/05-data-models.md §4.
 *
 * Invariants this store must preserve (docs/05 §4):
 *  1. Job.result.blob is the only long-lived reference to output bytes.
 *  2. SourceImage.file holds the original File — bytes are never copied in.
 *  3. ImageBitmap is NEVER stored here; it lives and dies inside the worker.
 *  4. Status moves one direction only, except failed -> queued on retry.
 *  5. result xor error, with ONE documented exception: E_TARGET_UNREACHABLE
 *     sets status 'done' AND error.bestEffort, and renders as a result.
 *  6. Job.phase is non-null only while status === 'running'.
 */
import { create } from 'zustand';
import type {
  CodecSupport,
  DeviceProfile,
  Job,
  JobConfig,
  JobError,
  SourceImage,
  StoredPreset,
} from '../core/types';
import { resolveCodecSupport, resolveDeviceProfile } from '../core/capabilities';
import { newId } from '../core/id';
import { downloadAllAsZip, downloadBlob, saveBlob } from '../platform/deliver';
import { probeCodecSupport, readDeviceSignals } from '../workers/pool';
import type { SerializableResult } from '../workers/protocol';
import { DEFAULT_CONFIG, mergeConfig, type ConfigSlice } from './config.slice';
import { isTerminal, toJobResult, type JobsSlice } from './jobs.slice';
import { INITIAL_UI, type UiSlice } from './ui.slice';
import {
  DEFAULT_SETTINGS,
  looksLikeStoredPreset,
  seedBuiltIns,
  type PersistenceSlice,
} from './persistence.slice';
import {
  deletePreset as dbDeletePreset,
  incrementPresetUsage,
  loadPresets,
  loadSettings,
  putPreset,
  saveSettings,
} from '../platform/db';
import { purgeStaleSessions } from '../platform/opfs';
import { loadAnalytics } from '../platform/analytics';

export type AppStore = ConfigSlice &
  JobsSlice &
  UiSlice &
  PersistenceSlice & {
    device: DeviceProfile;
    codecs: CodecSupport;
    setEnvironment(device: DeviceProfile, codecs: CodecSupport): void;
    /**
     * Replaces the generic construction-time defaults with this browser's
     * real, measured profile (docs/12 D-49). Async by nature — a device-memory
     * read is synchronous but the codec probe is not — so callers fire it once
     * on mount and let the store patch in when it resolves, the same pattern
     * already used for codec probing inside the worker.
     */
    hydrateEnvironment(): Promise<void>;
    /**
     * Deletes any OPFS session directory older than 24h (docs/05 §3, docs/12
     * D-51). Fire-and-forget from the same mount effect as the other hydrate
     * calls — nothing in the UI depends on this having finished.
     */
    purgeStaleOpfsSessions(): Promise<void>;

    /**
     * docs/10 M8's pageview beacon. Goes through the store for the same reason
     * delivery does — components/react has no grant to platform/ (docs/07 §2)
     * — and the store is also the only place that can answer "is a job in
     * flight?" authoritatively, which is the condition the beacon is gated on.
     *
     * Returns whether a script was actually injected, so a test can assert the
     * gate rather than infer it from network activity.
     */
    maybeLoadAnalytics(): boolean;

    /**
     * Delivery lives here, not in the components.
     *
     * docs/07 §2 does not grant components/react access to platform/, and
     * docs/04 §2's layer diagram draws the arrow as JobStore -> deliver. Keeping
     * it that way is what lets the components stay "dumb, props-only".
     */
    saveResult(jobId: string): Promise<void>;
    downloadAllResults(zipName?: string): Promise<void>;
  };

export const useStore = create<AppStore>()((set, get) => ({
  // ── environment ────────────────────────────────────────────────────
  device: resolveDeviceProfile(),
  codecs: resolveCodecSupport({
    nativeEncode: ['jpeg', 'png', 'webp'],
    nativeDecode: ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  }),
  setEnvironment: (device, codecs) => set({ device, codecs }),
  hydrateEnvironment: async () => {
    const device = resolveDeviceProfile(readDeviceSignals());
    const codecs = await probeCodecSupport();
    set({ device, codecs });
  },
  purgeStaleOpfsSessions: () => purgeStaleSessions(),

  maybeLoadAnalytics: () =>
    loadAnalytics(() => {
      // Read at injection time, never a snapshot: 'queued' counts as in flight
      // because start() may fire between this check and the script landing.
      for (const job of get().jobs.values()) {
        if (job.status === 'running' || job.status === 'queued') return true;
      }
      return false;
    }),

  saveResult: async (jobId) => {
    const result = get().jobs.get(jobId)?.result;
    if (result === null || result === undefined) return;
    await saveBlob(result.blob, result.outputName);
  },

  downloadAllResults: async (zipName = 'noupload.zip') => {
    const entries = [...get().jobs.values()]
      .map((job) => job.result)
      .filter((result) => result !== null)
      .map((result) => ({ name: result.outputName, blob: result.blob }));
    await downloadAllAsZip(entries, zipName);
  },

  // ── config ─────────────────────────────────────────────────────────
  config: DEFAULT_CONFIG,
  perFileOverrides: new Map(),

  setConfig: (patch) => set((s) => ({ config: mergeConfig(s.config, patch) })),
  applyRouteDefaults: (defaults) => set((s) => ({ config: mergeConfig(s.config, defaults) })),
  setOverride: (sourceId, patch) =>
    set((s) => {
      const next = new Map(s.perFileOverrides);
      next.set(sourceId, { ...(next.get(sourceId) ?? {}), ...patch });
      return { perFileOverrides: next };
    }),
  configFor: (sourceId) => {
    const s = get();
    const override = s.perFileOverrides.get(sourceId);
    return override === undefined ? s.config : mergeConfig(s.config, override);
  },

  // ── sources + jobs ─────────────────────────────────────────────────
  sources: new Map(),
  jobs: new Map(),

  addSources: (incoming) =>
    set((s) => {
      const sources = new Map(s.sources);
      for (const source of incoming) sources.set(source.id, source);
      return { sources, ui: { ...s.ui, view: s.ui.view === 'idle' ? 'configuring' : s.ui.view } };
    }),

  removeSource: (sourceId) =>
    set((s) => {
      const sources = new Map(s.sources);
      sources.delete(sourceId);
      const jobs = new Map(s.jobs);
      for (const [id, job] of jobs) if (job.sourceId === sourceId) jobs.delete(id);
      const overrides = new Map(s.perFileOverrides);
      overrides.delete(sourceId);
      return {
        sources,
        jobs,
        perFileOverrides: overrides,
        ui: {
          ...s.ui,
          view: sources.size === 0 ? 'idle' : s.ui.view,
          selectedSourceId: s.ui.selectedSourceId === sourceId ? null : s.ui.selectedSourceId,
        },
      };
    }),

  clearAll: () =>
    set(() => ({
      sources: new Map(),
      jobs: new Map(),
      perFileOverrides: new Map(),
      ui: { ...INITIAL_UI },
    })),

  createJob: (sourceId, config) => {
    const job: Job = {
      id: newId(),
      sourceId,
      config,
      status: 'queued',
      phase: null,
      progress: 0,
      passesUsed: 0,
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    };
    set((s) => {
      const jobs = new Map(s.jobs);
      jobs.set(job.id, job);
      return { jobs };
    });
    return job;
  },

  patchJob: (jobId, patch) =>
    set((s) => {
      const existing = s.jobs.get(jobId);
      if (existing === undefined) return {};
      const next: Job = { ...existing, ...patch };
      // Invariant 6: phase is meaningful only while running.
      if (next.status !== 'running') next.phase = null;
      const jobs = new Map(s.jobs);
      jobs.set(jobId, next);
      return { jobs };
    }),

  completeJob: (jobId, serializable) =>
    set((s) => {
      const job = s.jobs.get(jobId);
      if (job === undefined) return {};
      const source = s.sources.get(job.sourceId);
      if (source === undefined) return {};

      // Names already claimed by this batch, so collisions are resolved once,
      // here, rather than silently overwriting in the downloads folder.
      const taken = new Set<string>();
      for (const other of s.jobs.values()) {
        if (other.id !== jobId && other.result !== null) taken.add(other.result.outputName);
      }

      const result = toJobResult(serializable, source, job.config, taken);

      // Invariant 5, the one documented exception: an unmet target is a soft
      // failure. The file is DONE and usable; the warning rides along in
      // error.bestEffort so the UI can offer "Allow resizing to reach target".
      const unreachable = serializable.targetMet === false;
      const error: JobError | null = unreachable
        ? {
            code: 'E_TARGET_UNREACHABLE',
            message:
              'Could not reach the target size without going below ' +
              result.dimensions.width +
              'x' +
              result.dimensions.height +
              '.',
            recoverable: true,
            bestEffort: result,
          }
        : null;

      const jobs = new Map(s.jobs);
      jobs.set(jobId, {
        ...job,
        status: 'done',
        phase: null,
        progress: 1,
        // passesUsed belongs on the Job, not the JobResult (docs/05 §1).
        passesUsed: serializable.passesUsed,
        result,
        error,
        finishedAt: Date.now(),
      });
      return { jobs };
    }),

  failJob: (jobId, error) =>
    set((s) => {
      const job = s.jobs.get(jobId);
      if (job === undefined) return {};
      const jobs = new Map(s.jobs);
      jobs.set(jobId, {
        ...job,
        status: 'failed',
        phase: null,
        error,
        result: null,
        finishedAt: Date.now(),
      });
      return { jobs };
    }),

  resetJobForRetry: (jobId) =>
    set((s) => {
      const job = s.jobs.get(jobId);
      // Invariant 4: the ONLY backwards transition is failed -> queued.
      if (job === undefined || !isTerminal(job.status)) return {};
      const jobs = new Map(s.jobs);
      jobs.set(jobId, {
        ...job,
        status: 'queued',
        phase: null,
        progress: 0,
        passesUsed: 0,
        result: null,
        error: null,
        startedAt: null,
        finishedAt: null,
      });
      return { jobs };
    }),

  // ── ui ─────────────────────────────────────────────────────────────
  ui: { ...INITIAL_UI },
  setView: (view) => set((s) => ({ ui: { ...s.ui, view } })),
  selectSource: (selectedSourceId) => set((s) => ({ ui: { ...s.ui, selectedSourceId } })),
  setMobileStep: (mobileStep) => set((s) => ({ ui: { ...s.ui, mobileStep } })),
  toggleDiagnostics: () => set((s) => ({ ui: { ...s.ui, diagnosticsOpen: !s.ui.diagnosticsOpen } })),
  toggleMetadata: (open) =>
    set((s) => ({ ui: { ...s.ui, metadataOpen: open ?? !s.ui.metadataOpen } })),
  setCompareMode: (compareMode) => set((s) => ({ ui: { ...s.ui, compareMode } })),

  // ── persistence (settings + presets, docs/12 D-50) ────────────────────
  settings: DEFAULT_SETTINGS,
  presets: [],

  hydratePersistence: async () => {
    const [storedSettings, storedPresets] = await Promise.all([loadSettings(), loadPresets()]);
    const presets = storedPresets.length > 0 ? storedPresets : seedBuiltIns();
    if (storedPresets.length === 0) {
      // Fire-and-forget: the in-memory list above is already correct either
      // way, this only makes the NEXT launch skip re-seeding.
      void Promise.all(presets.map((preset) => putPreset(preset)));
    }
    set({ settings: storedSettings ?? DEFAULT_SETTINGS, presets });
  },

  updateSettings: (patch) =>
    set((s) => {
      const next = { ...s.settings, ...patch };
      void saveSettings(next);
      return { settings: next };
    }),

  savePreset: async (name, config) => {
    const preset: StoredPreset = {
      id: newId(),
      name,
      config,
      isBuiltIn: false,
      usageCount: 0,
      createdAt: Date.now(),
    };
    set((s) => ({ presets: [...s.presets, preset] }));
    await putPreset(preset);
  },

  applyPresetConfig: (id) => {
    const preset = get().presets.find((p) => p.id === id);
    if (preset === undefined) return null;
    void incrementPresetUsage(id);
    set((s) => ({
      presets: s.presets.map((p) => (p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p)),
    }));
    return preset.config;
  },

  deletePreset: async (id) => {
    const preset = get().presets.find((p) => p.id === id);
    // Built-ins are not user data — nothing to delete, so this is a no-op,
    // not an error the caller has to check for first.
    if (preset === undefined || preset.isBuiltIn) return;
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
    await dbDeletePreset(id);
  },

  exportPresetsJson: () => {
    const exportable = get().presets.filter((p) => !p.isBuiltIn);
    return JSON.stringify({ schemaVersion: 1, presets: exportable }, null, 2);
  },

  downloadPresetsExport: () => {
    const json = get().exportPresetsJson();
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, 'noupload-presets.json');
  },

  importPresetsJson: async (json) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return 0;
    }
    const rawEntries =
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as { presets?: unknown }).presets)
        ? (parsed as { presets: unknown[] }).presets
        : Array.isArray(parsed)
          ? parsed
          : [];

    const imported: StoredPreset[] = [];
    for (const entry of rawEntries) {
      if (!looksLikeStoredPreset(entry)) continue;
      imported.push({
        id: newId(),
        name: entry.name,
        config: entry.config as JobConfig,
        isBuiltIn: false,
        usageCount: 0,
        createdAt: Date.now(),
      });
    }
    if (imported.length === 0) return 0;

    set((s) => ({ presets: [...s.presets, ...imported] }));
    await Promise.all(imported.map((preset) => putPreset(preset)));
    return imported.length;
  },
}));

export { newId };
export type { SerializableResult, JobConfig, SourceImage };
