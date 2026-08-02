import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobConfig } from '../../core/types';
import { ingestFiles, QueueController, type RejectedFile } from '../../state/queue';
import { completedResults, isWarning, joinJobs, summarise } from '../../state/selectors';
import { useStore } from '../../state/store';
import { BatchSummary } from './BatchSummary';
import { CompareView } from './CompareView';
import { ConfigPanel } from './ConfigPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { Dropzone } from './Dropzone';
import { ErrorCard } from './ErrorCard';
import { FileGrid } from './FileGrid';
import { InstallPrompt } from './InstallPrompt';
import { MetadataPanel } from './MetadataPanel';
import { PrivacyIndicator } from './PrivacyIndicator';
import { Button } from './primitives';

interface Props {
  /**
   * Route slug defaults, e.g. HEIC -> JPG. The Milestone 6 size-preset routes
   * feed this SAME prop, so they need no component changes here.
   */
  defaultConfig?: Partial<JobConfig>;
  /** Source format label for the dropzone copy, e.g. "HEIC". */
  fromLabel?: string;
}

/**
 * The ONE client:visible component on the page (docs/08 §3).
 *
 * Everything else on a tool route — the FAQ, the spec table, related tools — is
 * static Astro markup shipping zero JavaScript, so it is fully present in the
 * HTML that AI crawlers receive without rendering.
 */
export default function ToolShell({ defaultConfig, fromLabel = 'image' }: Props) {
  const store = useStore;
  const sources = useStore((s) => s.sources);
  const jobs = useStore((s) => s.jobs);
  const config = useStore((s) => s.config);
  const codecs = useStore((s) => s.codecs);
  const device = useStore((s) => s.device);
  const ui = useStore((s) => s.ui);
  const presets = useStore((s) => s.presets);

  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [busy, setBusy] = useState(false);
  // Which job's compare modal is open, by job id. Held as an ID rather than a
  // JobView so the modal always reflects the CURRENT store state — a snapshot
  // would keep rendering a stale result if the job were retried while open.
  const [compareJobId, setCompareJobId] = useState<string | null>(null);
  // Which source's metadata drawer is open (WO-10). Held by id for the same
  // reason as compareJobId: the panel must follow live store state.
  const [metadataSourceId, setMetadataSourceId] = useState<string | null>(null);
  // The construction-time DeviceProfile defaults hasOffscreenCanvas to false,
  // so the unsupported notice below must not render until the REAL probe has
  // run — otherwise every browser flashes it for a frame on first paint.
  const [envReady, setEnvReady] = useState(false);
  const queueRef = useRef<QueueController | null>(null);

  // One controller for the island's lifetime. It owns the worker pool, so
  // disposing on unmount is what stops workers leaking across navigations.
  useEffect(() => {
    const controller = new QueueController(store);
    queueRef.current = controller;
    // Replaces the generic construction-time device/codec defaults with this
    // browser's real, measured profile (docs/12 D-49) BEFORE the pool is ever
    // lazily created, so the very first WorkerPool this session spawns is
    // already sized off the real device, not the fallback.
    /**
     * A read handle on the store, for diagnostics and for the D-49 regression
     * test in tests/e2e/smoke.spec.ts (WO-3).
     *
     * Deliberately unconditional rather than DEV-only: the e2e suite runs the
     * REAL production build, so a DEV-gated handle would be absent exactly
     * where the wiring most needs verifying — and D-49 (device/codecs never
     * leaving their construction-time defaults) is precisely the class of bug
     * that hid behind having nothing to assert against.
     *
     * It exposes no new information and no new risk: this is the user's own
     * in-memory state, in their own tab, in an app that never transmits it.
     */
    (window as unknown as { __noupload_store?: typeof store }).__noupload_store = store;

    void store
      .getState()
      .hydrateEnvironment()
      .finally(() => setEnvReady(true));
    // Settings + presets from IndexedDB (docs/05 §2), seeding built-ins on
    // first run. Safe to race with everything else on mount — nothing here
    // blocks the dropzone from accepting files immediately.
    void store.getState().hydratePersistence();
    // Housekeeping only (docs/05 §3): deletes abandoned OPFS sessions from a
    // prior visit more than 24h old. Nothing in THIS session writes to OPFS
    // yet (docs/12 D-51), but the sweep runs regardless so it is never skipped.
    void store.getState().purgeStaleOpfsSessions();
    return () => {
      queueRef.current = null;
      void controller.dispose();
    };
  }, [store]);

  // The route slug preconfigures the store, once.
  useEffect(() => {
    if (defaultConfig !== undefined) store.getState().applyRouteDefaults(defaultConfig);
  }, [store, defaultConfig]);

  /**
   * docs/10 M8: pageview beacon loaded only AFTER this island mounts, and
   * hard-blocked while any job runs. Inert entirely unless a build set
   * PUBLIC_CF_BEACON_TOKEN (docs/12 D-53), so dev/CI inject nothing.
   *
   * Depends on `busy` so that if the island happens to mount mid-conversion,
   * the attempt is simply retried once the batch finishes rather than dropped.
   */
  useEffect(() => {
    store.getState().maybeLoadAnalytics();
  }, [store, busy]);

  const views = useMemo(() => joinJobs(jobs, sources), [jobs, sources]);
  const summary = useMemo(() => summarise(views), [views]);
  const running = views.filter((v) => v.job.status === 'running').length;
  const warnings = views.filter((v) => isWarning(v.job)).length;
  const hasFiles = sources.size > 0;

  const lastAchieved = useMemo(() => {
    const done = completedResults(views);
    const last = done[done.length - 1];
    return last?.job.result?.sizeBytes ?? null;
  }, [views]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const { accepted, rejected: bad } = await ingestFiles(files);
      setRejected((prev) => [...prev, ...bad].slice(-5));
      if (accepted.length === 0) return;

      const state = store.getState();
      state.addSources(accepted);
      // Create the job immediately so the card renders in its 'queued' state.
      // Without this the grid reads "Files (0)" until conversion starts, and
      // the Convert button — gated on the view count — never appears at all.
      for (const source of accepted) {
        state.createJob(source.id, state.configFor(source.id));
      }
    },
    [store],
  );

  const convert = useCallback(async () => {
    const controller = queueRef.current;
    if (controller === null) return;
    setBusy(true);
    try {
      // start() reuses the queued jobs created at add time.
      await controller.start();
    } finally {
      setBusy(false);
    }
  }, [store]);

  const downloadAll = useCallback(() => {
    void store.getState().downloadAllResults();
  }, [store]);

  const saveOne = useCallback(
    (jobId: string) => void store.getState().saveResult(jobId),
    [store],
  );

  const compareOne = useCallback((jobId: string) => setCompareJobId(jobId), []);

  const inspectMetadata = useCallback(
    (sourceId: string) => setMetadataSourceId((current) => (current === sourceId ? null : sourceId)),
    [],
  );

  /**
   * Resolved from live state, so removing a file closes its drawer rather than
   * leaving it showing a file that is gone.
   *
   * `metadata` is populated at INGEST (docs/12 D-33), not at conversion time —
   * which is what lets this show GPS presence BEFORE anything is processed,
   * the ordering docs/02 §5 actually asks for.
   */
  const metadataTarget = useMemo(() => {
    if (metadataSourceId === null) return null;
    return sources.get(metadataSourceId) ?? null;
  }, [metadataSourceId, sources]);

  // Resolved from live state every render, so a retry, a removal or a Clear
  // while the modal is open closes it rather than leaving it on dead blobs.
  const compareTarget = useMemo(() => {
    if (compareJobId === null) return null;
    const view = views.find((v) => v.job.id === compareJobId);
    if (view?.job.result == null) return null;
    return { source: view.source, result: view.job.result };
  }, [compareJobId, views]);

  /**
   * docs/08 §5's one-tap fix for E_TARGET_UNREACHABLE.
   *
   * The search already downscales as far as minScale, so "allow resizing" means
   * shrinking the image itself. Setting a real resize override and re-running
   * achieves that with the existing JobConfig fields — no contract change.
   */
  const allowResize = useCallback(
    (jobId: string) => {
      const state = store.getState();
      const job = state.jobs.get(jobId);
      if (job === undefined) return;
      const dims = job.result?.dimensions ?? job.error?.bestEffort?.dimensions;
      if (dims === undefined) return;
      const longest = Math.max(dims.width, dims.height);
      state.setOverride(job.sourceId, {
        resize: { kind: 'maxDimension', max: Math.max(64, Math.round(longest * 0.6)) },
      });
      void queueRef.current?.retry(jobId);
    },
    [store],
  );

  const retry = useCallback((jobId: string) => {
    void queueRef.current?.retry(jobId);
  }, []);

  const remove = useCallback(
    (sourceId: string) => store.getState().removeSource(sourceId),
    [store],
  );

  const clear = useCallback(() => {
    queueRef.current?.cancelAll();
    store.getState().clearAll();
    setRejected([]);
    setCompareJobId(null);
    setMetadataSourceId(null);
  }, [store]);

  const applyPreset = useCallback(
    (id: string) => {
      const config = store.getState().applyPresetConfig(id);
      if (config !== null) store.getState().setConfig(config);
    },
    [store],
  );

  const saveCurrentAsPreset = useCallback(
    (name: string) => void store.getState().savePreset(name, store.getState().config),
    [store],
  );

  const deletePresetById = useCallback(
    (id: string) => void store.getState().deletePreset(id),
    [store],
  );

  const exportPresets = useCallback(() => store.getState().downloadPresetsExport(), [store]);

  const importPresets = useCallback(
    (file: File) => {
      void file.text().then((json) => store.getState().importPresetsJson(json));
    },
    [store],
  );

  const step = ui.mobileStep;
  const setStep = store.getState().setMobileStep;

  /* ── unsupported engine ───────────────────────────────────────────── */
  /**
   * Every codec path in this app encodes through OffscreenCanvas inside a
   * worker (CLAUDE.md non-negotiable 3), so an engine without it cannot
   * convert anything at all — Safari below 16.4, and Playwright's own WebKit
   * build (docs/12 D-55).
   *
   * Saying so ONCE, up front, is the honest behaviour. Without this the user
   * can add twenty files, convert, and get twenty E_ENCODE_FAILED cards whose
   * message — "Try a different output format" — is advice that cannot work,
   * because no output format will.
   */
  if (envReady && !device.hasOffscreenCanvas) {
    return (
      <div
        role="alert"
        class="rounded-lg border border-warning bg-surface p-6 text-center"
      >
        <h2 class="m-0 text-lg font-semibold text-text">
          This browser can’t run the converter
        </h2>
        <p class="mx-auto mt-3 mb-0 max-w-[60ch] text-sm text-text-muted">
          NoUpload converts images entirely on your device, which needs a
          browser feature called <code>OffscreenCanvas</code>. This browser
          doesn’t have it, so conversion would fail on every file rather than
          work partially.
        </p>
        <p class="mx-auto mt-3 mb-0 max-w-[60ch] text-sm text-text-muted">
          It’s available in Safari 16.4 and later, and in current Chrome, Edge
          and Firefox. Updating your browser, or opening this page in another
          one, will fix it. Nothing you do here is ever uploaded either way.
        </p>
      </div>
    );
  }

  /* ── idle ─────────────────────────────────────────────────────────── */
  if (!hasFiles) {
    return (
      <div class="flex flex-col gap-4">
        <Dropzone fromLabel={fromLabel} compact={false} onFiles={(files) => void addFiles(files)} />
        <RejectedList rejected={rejected} onDismiss={() => setRejected([])} />
        <PrivacyIndicator processed={0} total={0} />
      </div>
    );
  }

  /* ── working ──────────────────────────────────────────────────────── */
  // Below lg this is a step flow, never the desktop layout squeezed down
  // (docs/08 §4.3). At lg and up every pane is visible at once.
  const showConfig = step === 'configure';
  const pendingCount = views.filter(
    (v) => v.job.status === 'queued' || v.job.status === 'running',
  ).length;

  return (
    <div class="overflow-hidden rounded-lg border border-border bg-surface">
      <div class="flex gap-1 border-b border-border p-2 lg:hidden">
        <Button
          size="sm"
          variant={showConfig ? 'ghost' : 'primary'}
          onClick={() => setStep('results')}
        >
          Files ({views.length})
        </Button>
        <Button
          size="sm"
          variant={showConfig ? 'primary' : 'ghost'}
          onClick={() => setStep('configure')}
        >
          Settings
        </Button>
      </div>

      <div class="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch">
        <aside
          class={
            'border-border bg-bg-subtle lg:block lg:border-r ' + (showConfig ? 'block' : 'hidden')
          }
          aria-label="Settings"
        >
          <ConfigPanel
            config={config}
            codecs={codecs}
            achievedBytes={lastAchieved}
            onChange={(patch) => store.getState().setConfig(patch)}
            presets={presets}
            onApplyPreset={applyPreset}
            onSavePreset={saveCurrentAsPreset}
            onDeletePreset={deletePresetById}
            onExportPresets={exportPresets}
            onImportPresets={importPresets}
          />
        </aside>

        <div class={'min-w-0 flex-col ' + (showConfig ? 'hidden lg:flex' : 'flex')}>
          <div class="border-b border-border p-4">
            <Dropzone fromLabel={fromLabel} compact onFiles={(files) => void addFiles(files)} />
          </div>

          <RejectedList rejected={rejected} onDismiss={() => setRejected([])} />

          <FileGrid
            views={views}
            selectedSourceId={ui.selectedSourceId}
            onRetry={retry}
            onSave={saveOne}
            onCompare={compareOne}
            onRemove={remove}
            onAllowResize={allowResize}
            onSelect={(id) => store.getState().selectSource(id)}
            onInspect={inspectMetadata}
            onAddMore={() => setStep('results')}
          />

          <div class="mt-auto">
            {pendingCount > 0 && (
              <div class="border-t border-border p-4">
                <Button variant="primary" onClick={() => void convert()} disabled={busy}>
                  {busy ? 'Converting…' : 'Convert ' + pendingCount + ' files'}
                </Button>
              </div>
            )}

            <BatchSummary
              summary={summary}
              running={running}
              warnings={warnings}
              busy={busy}
              onClear={clear}
              onDownloadAll={downloadAll}
            />
            <InstallPrompt eligible={summary.done > 0} />
            <PrivacyIndicator processed={summary.done} total={views.length} />
            {import.meta.env.DEV && <DiagnosticsPanel device={device} views={views} />}
          </div>
        </div>
      </div>

      {metadataTarget !== null && (
        <div class="fixed inset-y-0 right-0 z-40 flex max-w-full">
          <MetadataPanel
            filename={metadataTarget.name}
            detectedFormat={metadataTarget.detectedFormat}
            declaredMime={metadataTarget.declaredMime}
            metadata={metadataTarget.metadata}
            // metadata is extracted synchronously during ingestFiles (D-33),
            // so by the time a card exists the read has already happened —
            // null here means "this file has none", not "still loading".
            loaded={true}
            onClose={() => setMetadataSourceId(null)}
          />
        </div>
      )}

      {compareTarget !== null && (
        <CompareView
          originalBlob={compareTarget.source.file}
          outputBlob={compareTarget.result.blob}
          filename={compareTarget.source.name}
          onClose={() => setCompareJobId(null)}
        />
      )}
    </div>
  );
}

function RejectedList({
  rejected,
  onDismiss,
}: {
  rejected: readonly RejectedFile[];
  onDismiss: () => void;
}) {
  if (rejected.length === 0) return null;
  return (
    <div class="flex flex-col gap-2 p-4" role="alert">
      {rejected.map((item) => (
        <div key={item.name}>
          <p class="m-0 truncate text-xs font-medium text-text">{item.name}</p>
          <ErrorCard error={item.error} onRemove={onDismiss} />
        </div>
      ))}
    </div>
  );
}
