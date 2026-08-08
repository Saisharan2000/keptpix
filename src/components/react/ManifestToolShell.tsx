import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultsFromFields,
  isInputless,
  type ConfigValue,
  type ToolConfig,
  type ToolManifestEntry,
} from '../../core/tools';
import {
  deliverToolResult,
  disposeToolPool,
  hasToolRunner,
  runTool,
  ToolRunAborted,
  type ToolRunFailure,
  type ToolRunProgress,
  type ToolRunResult,
} from '../../state/tool-runner';
import { Dropzone } from './Dropzone';
import { PrivacyIndicator } from './PrivacyIndicator';
import { ProgressBar } from './ProgressBar';
import { ToolConfigPanel } from './ToolConfigPanel';
import { Button } from './primitives';

interface Props {
  tool: ToolManifestEntry;
}

type RunState =
  | { status: 'idle' }
  | { status: 'running'; progress: ToolRunProgress }
  | { status: 'done'; result: ToolRunResult }
  | { status: 'error'; message: string };

/** Files carry no id, so one is attached at ingest — names collide, order matters. */
interface Queued {
  readonly id: string;
  readonly file: File;
}

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return 'f' + counter;
};

/**
 * The manifest-driven shell (docs/kepttools/03 §1).
 *
 * Everything visible is derived from the ToolManifestEntry: whether there is a
 * dropzone at all, what it accepts, one file or many, which controls the
 * settings rail shows, and what the action is called. NOTHING branches on
 * `tool.id` — the work itself is looked up in the runner registry
 * (`state/tool-runner.ts`), so adding a tool is a manifest entry plus a runner,
 * and never an edit here. A test asserts that by rendering every entry.
 *
 * A tool with no runner is not broken, it is unbuilt: its manifest entry stays
 * `supported: false`, so no route is generated and there is nothing to reach.
 */
export function ManifestToolShell({ tool }: Props) {
  const [queued, setQueued] = useState<Queued[]>([]);
  const [config, setConfig] = useState<ToolConfig>(() => defaultsFromFields(tool));
  const [run, setRun] = useState<RunState>({ status: 'idle' });

  const abortRef = useRef<AbortController | null>(null);

  const inputless = isInputless(tool);
  const accept = useMemo(() => tool.accept.join(','), [tool.accept]);
  const runnable = useMemo(() => hasToolRunner(tool.id), [tool.id]);

  // The pool itself lives in state/ (components may not reach workers/ —
  // docs/07 §2), but this island is what knows when nobody needs it any more.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      void disposeToolPool();
    };
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const mapped = incoming.map((file) => ({ id: nextId(), file }));
      setQueued((prev) => (tool.multiFile ? [...prev, ...mapped] : mapped.slice(0, 1)));
      // A previous result refers to files that are no longer the input.
      setRun({ status: 'idle' });
    },
    [tool.multiFile],
  );

  const patchConfig = useCallback((patch: Record<string, ConfigValue>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    // docs/12 D-71: a settings change after adding files must not be silently
    // discarded, and a stale result must not look like it reflects the change.
    setRun({ status: 'idle' });
  }, []);

  const clear = useCallback(() => {
    setQueued([]);
    setRun({ status: 'idle' });
  }, []);

  const removeAt = useCallback((id: string) => {
    setQueued((prev) => prev.filter((item) => item.id !== id));
    setRun({ status: 'idle' });
  }, []);

  /**
   * Page order is the document's order, so it has to be changeable — and by
   * keyboard, not only by dragging. Two buttons per row do that with no
   * pointer-only interaction and nothing to learn.
   */
  const move = useCallback((index: number, delta: number) => {
    setQueued((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (item === undefined) return prev;
      next.splice(target, 0, item);
      return next;
    });
    setRun({ status: 'idle' });
  }, []);

  const start = useCallback(async () => {
    // Unreachable in a shipped build — a published tool always has a runner,
    // and a test enforces that. Kept so the failure is a clear message rather
    // than an exception from inside the registry.
    if (!runnable) {
      setRun({ status: 'error', message: 'This tool has no engine registered.' });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setRun({
      status: 'running',
      progress: { done: 0, total: queued.length, phase: 'reading' },
    });

    try {
      const result = await runTool(tool.id, {
        files: queued.map((item) => item.file),
        config,
        onProgress: (progress) => setRun({ status: 'running', progress }),
        signal: controller.signal,
      });
      setRun({ status: 'done', result });
      // Straight to the browser: one action, one file, no extra click to find.
      deliverToolResult(result);
    } catch (cause) {
      if (cause instanceof ToolRunAborted) {
        setRun({ status: 'idle' });
        return;
      }
      setRun({
        status: 'error',
        message:
          cause instanceof Error && cause.message.length > 0
            ? cause.message
            : 'Something failed while building the file.',
      });
    } finally {
      abortRef.current = null;
    }
  }, [runnable, tool.id, queued, config]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  /* ── engine not yet available ─────────────────────────────────────────── */
  //
  // Gated on `tool.supported` ALONE, deliberately.
  //
  // Also checking the runner registry here looked like sensible belt and
  // braces, and was not: it gave "is this tool ready" two sources of truth,
  // and it broke the property that the shell can be rendered for an entry
  // whose engine does not exist yet — which is exactly what
  // manifest-shell.test.ts uses to catch a config the shell cannot express,
  // before anyone builds the engine.
  //
  // "Published implies runnable" is a real invariant, but it belongs in a test
  // that fails the build, not in a branch that quietly hides a route someone
  // has already pointed Google at. tool-runner.test.ts asserts it.
  if (!tool.supported) {
    return (
      <div role="status" class="rounded-lg border border-warning bg-surface p-6 text-center">
        <h2 class="m-0 text-lg font-semibold text-text">{tool.name} isn’t ready yet</h2>
        <p class="mx-auto mt-3 mb-0 max-w-[60ch] text-sm text-text-muted">
          This tool is declared but its engine is not built, so there is nothing
          here that could work yet. We would rather show you this than a button
          that fails when you click it.
        </p>
        <p class="mx-auto mt-3 mb-0 max-w-[60ch] text-sm text-text-muted">
          When it does ship it will run entirely on your device, like everything
          else here — nothing you open will be uploaded.
        </p>
      </div>
    );
  }

  const running = run.status === 'running';
  const hasWork = inputless || queued.length > 0;
  const total = running ? Math.max(1, run.progress.total) : 1;
  const fraction = running ? Math.min(1, run.progress.done / total) : 0;

  return (
    <div class="overflow-hidden rounded-lg border border-border bg-surface">
      <div class="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch">
        <aside class="border-border bg-bg-subtle lg:block lg:border-r" aria-label="Settings">
          <ToolConfigPanel fields={tool.configFields} config={config} onChange={patchConfig} />
        </aside>

        <div class="flex min-w-0 flex-col">
          {!inputless && (
            <div class="p-4">
              <Dropzone
                fromLabel={tool.name}
                compact={queued.length > 0}
                onFiles={addFiles}
                accept={accept}
                multiple={tool.multiFile}
                actionLabel={tool.name.toLowerCase()}
                zoneLabel={'Choose files for ' + tool.name}
              />
            </div>
          )}

          {queued.length > 0 && (
            <ol class="m-0 flex list-none flex-col gap-1 px-4 pb-2">
              {queued.map((item, index) => (
                <li
                  key={item.id}
                  class="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span
                    aria-hidden="true"
                    class="num w-6 shrink-0 text-xs tabular-nums text-text-muted"
                  >
                    {index + 1}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm text-text">{item.file.name}</span>
                  {tool.multiFile && queued.length > 1 && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === 0 || running}
                        onClick={() => move(index, -1)}
                        aria-label={'Move ' + item.file.name + ' earlier'}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === queued.length - 1 || running}
                        onClick={() => move(index, 1)}
                        aria-label={'Move ' + item.file.name + ' later'}
                      >
                        ↓
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={running}
                    onClick={() => removeAt(item.id)}
                    aria-label={'Remove ' + item.file.name}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ol>
          )}

          {running && (
            <div class="px-4 pb-3">
              <ProgressBar value={fraction} label={tool.name + ' progress'} />
              <p role="status" class="mt-2 mb-0 text-sm text-text-muted">
                {run.progress.phase === 'assembling'
                  ? 'Building the document…'
                  : 'Reading ' +
                    Math.min(run.progress.done + 1, run.progress.total) +
                    ' of ' +
                    run.progress.total +
                    '…'}
              </p>
            </div>
          )}

          {run.status === 'done' && <Outcome result={run.result} onAgain={() => deliverToolResult(run.result)} />}

          {run.status === 'error' && (
            <div class="px-4 pb-3">
              <p role="alert" class="m-0 text-sm text-danger">
                {run.message}
              </p>
            </div>
          )}

          <div class="mt-auto">
            {hasWork && (
              <div class="flex gap-2 border-t border-border p-4">
                {running ? (
                  <Button variant="secondary" onClick={cancel}>
                    Cancel
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void start()}>
                    {/* `output` is a manifest field and has to reach the UI:
                        a tool that hands back an archive should say so before
                        the click, not surprise someone with a .zip. */}
                    {tool.output === 'zip' ? tool.name + ' → ZIP' : tool.name}
                  </Button>
                )}
                {queued.length > 0 && !running && (
                  <Button variant="ghost" onClick={clear}>
                    Clear
                  </Button>
                )}
              </div>
            )}
            <PrivacyIndicator
              processed={running ? run.progress.done : queued.length}
              total={queued.length}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The result, and — just as important — anything that did NOT make it in.
 *
 * A batch where three of forty files were unreadable still produces a document,
 * because losing the other thirty-seven would be worse. But it must say so:
 * a silently 37-page PDF is the kind of thing someone discovers a week later.
 */
function Outcome({ result, onAgain }: { result: ToolRunResult; onAgain: () => void }) {
  return (
    <div class="px-4 pb-3">
      <p role="status" class="m-0 text-sm text-text">
        Saved <span class="font-medium">{result.filename}</span>.{' '}
        <button
          type="button"
          onClick={onAgain}
          class="rounded-sm font-medium text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Download again
        </button>
      </p>
      {result.failures.length > 0 && <Failures failures={result.failures} />}
    </div>
  );
}

function Failures({ failures }: { failures: readonly ToolRunFailure[] }) {
  return (
    <div class="mt-3 rounded-md border border-warning bg-warning-subtle px-3 py-2">
      <p class="m-0 text-sm font-medium text-text">
        {failures.length === 1
          ? 'One file was left out:'
          : failures.length + ' files were left out:'}
      </p>
      <ul class="mt-1 mb-0 list-none pl-0">
        {failures.map((failure) => (
          <li key={failure.name} class="text-sm text-text-muted">
            <span class="text-text">{failure.name}</span> — {failure.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
