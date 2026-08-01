import type { ImageMetadata } from '../../core/types';
import { Button } from './primitives';

interface Props {
  /** Filename the metadata belongs to — the panel is per-file. */
  filename: string;
  metadata: ImageMetadata | null;
  /** True once metadata has actually been read, so "none" is distinguishable
   *  from "not read yet". */
  loaded: boolean;
  onClose: () => void;
}

/**
 * The inspector drawer — a DIFFERENT component from MetadataToggle, which is
 * the config switch.
 *
 * Wired into ToolShell in Milestone 8 (WO-10). Its data source has existed
 * since docs/12 D-33, which moved EXIF extraction to ingest time so the panel
 * can show what a file contains BEFORE it is processed — that ordering is the
 * point, not a detail. docs/02 §5 describes the GPS row as the product's
 * privacy demonstration: showing someone the coordinates sitting in their own
 * photo is more convincing than any promise about what gets uploaded.
 */
export function MetadataPanel({ filename, metadata, loaded, onClose }: Props) {
  const rows: Array<[string, string]> =
    metadata === null
      ? []
      : [
          ['Camera', [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(' ') || '—'],
          ['Taken', metadata.dateTaken ?? '—'],
          ['Colour profile', metadata.colorProfile ?? '—'],
          ['Orientation', String(metadata.orientation)],
          ['Fields found', String(metadata.rawTagCount)],
        ];

  return (
    <aside
      aria-label={'Metadata for ' + filename}
      class="flex max-h-full w-[min(420px,100%)] flex-col overflow-hidden border-l border-border bg-surface"
    >
      <header class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 class="m-0 truncate text-sm font-semibold text-text" title={filename}>
          {filename}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>

      <div class="overflow-auto p-4 text-sm text-text-muted">
        {!loaded && <p class="m-0">Reading metadata…</p>}

        {loaded && metadata === null && (
          <p class="m-0">No metadata could be read from this file.</p>
        )}

        {loaded && metadata !== null && (
          <>
            {/*
              The GPS row leads, and is styled as a warning when present:
              docs/02 §5 treats "your photo is carrying your location" as the
              thing worth showing people, not a field among fields.
            */}
            <div
              class={
                'mb-4 rounded-md border p-3 ' +
                (metadata.hasGps ? 'border-warning bg-warning-subtle' : 'border-border bg-bg-subtle')
              }
            >
              <p class="m-0 text-sm font-semibold text-text">
                {metadata.hasGps ? 'This photo contains GPS coordinates' : 'No GPS coordinates'}
              </p>
              <p class="m-0 mt-1 text-xs">
                {metadata.hasGps
                  ? 'Accurate to a few metres. It is removed from the converted file by default — and nothing here was uploaded to find that out.'
                  : 'Nothing in this file records where it was taken.'}
              </p>
            </div>

            {!metadata.hasExif && <p class="m-0 mb-3">This file carries no EXIF block.</p>}

            <dl class="m-0 grid grid-cols-[132px_1fr] gap-y-2">
              {rows.map(([label, value]) => (
                <>
                  <dt key={label}>{label}</dt>
                  <dd class="num m-0 wrap-break-word">{value}</dd>
                </>
              ))}
            </dl>
          </>
        )}
      </div>
    </aside>
  );
}
