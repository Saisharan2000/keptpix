import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolManifestEntry } from '../../core/tools';
import type { JobConfig } from '../../core/types';
import { ManifestToolShell } from './ManifestToolShell';
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
  /**
   * A ToolManifestEntry, for the PDF/video/QR routes. When present the shell
   * renders itself entirely from the manifest and the image pipeline below is
   * not involved at all.
   *
   * The two paths coexist because they are genuinely different tools sharing
   * one entry point: the image path is the original, still driving every
   * `/convert/*`, `/compress/*` and `/resize/*` route; the manifest path is
   * everything added since. This is a fork in the ROUTER, not a branch in a
   * pipeline — no tool-specific logic sits on either side of it.
   */
  tool?: ToolManifestEntry;
}

/**
 * The ONE client:visible component on the page (docs/08 §3).
 *
 * Everything else on a tool route — the FAQ, the spec table, related tools — is
 * static Astro markup shipping zero JavaScript, so it is fully present in the
 * HTML that AI crawlers receive without rendering.
 */
export default function ToolShell({ defaultConfig, fromLabel = 'image', tool }: Props) {
  // A dispatcher, not a branch inside the component body: the image shell below
  // calls a dozen hooks before its first return, so choosing between the two
  // paths mid-body would make hook order depend on a prop.
  if (tool !== undefined) return <ManifestToolShell tool={tool} />;
  return <ImageToolShell defaultConfig={defaultConfig} fromLabel={fromLabel} />;
}

/** The original image tool, unchanged, still serving every image route. */
function ImageToolShell({
  defaultConfig,
  fromLabel = 'image',
}: {
  defaultConfig?: Partial<JobConfig>;
  fromLabel?: string;
}) {
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
    (window as unknown as { __keptpix_store?: typeof store }).__keptpix_store = store;

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

  /*
   * `ui.mobileStep` is no longer read here.
   *
   * It drove the Files / Settings tab pair that the single-column layout
   * replaced. The store field and its action stay — persistence and the store
   * tests reference them, and removing a slice field is a wider change than
   * this one — but nothing in the shell branches on it any more.
   */

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
          KeptPix converts images entirely on your device, which needs a
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
  const pendingCount = views.filter(
    (v) => v.job.status === 'queued' || v.job.status === 'running',
  ).length;

  return (
    <div class="overflow-hidden rounded-lg border border-border bg-surface">
      {/*
        SINGLE COLUMN, and the settings are folded away.

        This was a 260px settings rail beside the work area, plus a Files /
        Settings tab pair below `lg`. Two problems, one cause. On desktop the
        rail put Output, Mode, Quality, Resize, Metadata and Presets in front of
        someone who had not yet chosen a file — a wall of controls competing
        with the only thing they needed to do. On mobile the tabs meant settings
        and files could never be seen together.

        Now: dropzone, then files, then a COLLAPSED disclosure, then the sticky
        action. The defaults are genuinely good, so the summary says so and most
        people never open it. Anyone who wants quality 82 and no EXIF stripping
        is one click away, and their choice persists in the store as before.

        `<details>` is native — it opens with no JavaScript, is keyboard
        operable for free, and adds nothing to the island bundle. The `<aside>`
        wrapper keeps the `complementary` role and the "Settings" accessible
        name that smoke.spec's WO-4 check looks for.
      */}
      <div class="flex flex-col">
        <div class="border-b border-border p-4">
          <Dropzone
            fromLabel={fromLabel}
            compact={views.length > 0}
            onFiles={(files) => void addFiles(files)}
          />
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
          />

        <aside aria-label="Settings" class="border-t border-border bg-bg-subtle">
          <details class="group">
            <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-text">
              <span>
                Settings
                <span class="ml-2 font-normal text-text-muted">the defaults are fine</span>
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="shrink-0 text-text-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
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
          </details>
        </aside>

          <div class="mt-auto">
            {/*
              STICKY once there are files to act on.
              
              It used to sit in normal flow after the settings rail and the file
              grid, which on a 1280px desktop put it BELOW THE FOLD — the one
              action the page exists for was something you had to scroll to
              find. Sticking it to the bottom means the next step is always
              visible, whatever the file count or how far down the settings the
              user has wandered.

              `bottom-0` with a top border and a solid background, so it reads
              as a bar rather than floating over the content it covers. It is
              inside the normal flow when there is nothing to do, because a
              permanently visible empty bar is just chrome.
            */}
            {pendingCount > 0 && (
              <div class="sticky bottom-0 z-20 border-t border-border bg-bg p-4">
                <Button variant="primary" onClick={() => void convert()} disabled={busy}>
                  {busy
                    ? 'Converting…'
                    : 'Convert ' + pendingCount + (pendingCount === 1 ? ' file' : ' files')}
                </Button>
                <p class="mt-2 mb-0 text-xs text-text-muted">
                  {pendingCount === 1 ? '1 file' : pendingCount + ' files'} · nothing is uploaded
                </p>
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
