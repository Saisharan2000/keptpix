import { useCallback, useMemo, useState } from 'react';
import {
  defaultsFromFields,
  isInputless,
  type ConfigValue,
  type ToolConfig,
  type ToolManifestEntry,
} from '../../core/tools';
import { Dropzone } from './Dropzone';
import { PrivacyIndicator } from './PrivacyIndicator';
import { ToolConfigPanel } from './ToolConfigPanel';
import { Button } from './primitives';

interface Props {
  tool: ToolManifestEntry;
}

/**
 * The manifest-driven shell (docs/kepttools/03 §1, milestone M0).
 *
 * Everything visible here is derived from the ToolManifestEntry: whether there
 * is a dropzone at all, what it accepts, whether it takes one file or many,
 * which controls the settings rail shows, and whether the result is a file or a
 * ZIP. Nothing branches on `tool.id`. That is the whole point — adding
 * pdf-rotate once pdf-split exists must be a manifest edit and nothing else.
 *
 * WHAT THIS DOES NOT DO YET (M0): no engine is wired. The PDF engine lands in
 * M1, video in M4, QR in M5. Until a tool's engine exists its manifest entry is
 * `supported: false`, no route is generated for it, and the notice below is
 * what renders — the D-55 pattern, which is that an honest "this cannot run
 * here" beats a button that fails on click.
 */
export function ManifestToolShell({ tool }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<ToolConfig>(() => defaultsFromFields(tool));

  const inputless = isInputless(tool);
  const accept = useMemo(() => tool.accept.join(','), [tool.accept]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      setFiles((prev) => (tool.multiFile ? [...prev, ...incoming] : incoming.slice(0, 1)));
    },
    [tool.multiFile],
  );

  const patchConfig = useCallback((patch: Record<string, ConfigValue>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  /* ── engine not yet available ─────────────────────────────────────────── */
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

  const hasWork = inputless || files.length > 0;

  return (
    <div class="overflow-hidden rounded-lg border border-border bg-surface">
      <div class="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch">
        <aside
          class="border-border bg-bg-subtle lg:block lg:border-r"
          aria-label="Settings"
        >
          <ToolConfigPanel fields={tool.configFields} config={config} onChange={patchConfig} />
        </aside>

        <div class="flex min-w-0 flex-col">
          {!inputless && (
            <div class="p-4">
              <Dropzone
                fromLabel={tool.name}
                compact={files.length > 0}
                onFiles={addFiles}
                accept={accept}
                multiple={tool.multiFile}
                actionLabel={tool.name.toLowerCase()}
                zoneLabel={'Choose files for ' + tool.name}
              />
            </div>
          )}

          {files.length > 0 && (
            <ul class="m-0 flex list-none flex-col gap-1 px-4 pb-2">
              {files.map((file) => (
                <li key={file.name + file.size} class="truncate text-sm text-text">
                  {file.name}
                </li>
              ))}
            </ul>
          )}

          <div class="mt-auto">
            {hasWork && (
              <div class="flex gap-2 border-t border-border p-4">
                <Button variant="primary" onClick={() => undefined}>
                  {tool.output === 'zip' ? tool.name + ' → ZIP' : tool.name}
                </Button>
                {files.length > 0 && (
                  <Button variant="ghost" onClick={clear}>
                    Clear
                  </Button>
                )}
              </div>
            )}
            <PrivacyIndicator processed={0} total={files.length} />
          </div>
        </div>
      </div>
    </div>
  );
}
