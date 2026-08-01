import type { ImageMetadata } from '../../core/types';

interface Props {
  metadata: ImageMetadata | null;
  onClose: () => void;
}

/**
 * The inspector drawer — a DIFFERENT component from MetadataToggle, which is
 * the config switch. Wired up in Milestone 5 once exifr lands and there is real
 * metadata to show; the shape is fixed now so that is a data change, not a
 * rewrite.
 */
export function MetadataPanel({ metadata, onClose }: Props) {
  return (
    <aside
      aria-label="Metadata"
      class="flex h-full w-[min(420px,100%)] flex-col border-l border-border bg-surface"
    >
      <header class="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 class="m-0 text-sm font-semibold text-text">Metadata</h2>
        <button type="button" onClick={onClose} class="min-h-11 px-2 text-sm text-text-muted">
          Close
        </button>
      </header>
      <div class="p-4 text-sm text-text-muted">
        {metadata === null ? (
          <p class="m-0">Metadata inspection arrives in Milestone 5.</p>
        ) : (
          <dl class="m-0 grid grid-cols-[132px_1fr] gap-y-2">
            <dt>Camera</dt>
            <dd class="num m-0">{metadata.cameraModel ?? '—'}</dd>
            <dt>GPS</dt>
            <dd class="num m-0">{metadata.hasGps ? 'present' : 'none'}</dd>
            <dt>Fields</dt>
            <dd class="num m-0">{metadata.rawTagCount}</dd>
          </dl>
        )}
      </div>
    </aside>
  );
}
