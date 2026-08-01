import type { JobView } from '../../state/selectors';
import { FileCard } from './FileCard';

interface Props {
  views: readonly JobView[];
  selectedSourceId: string | null;
  onRetry: (jobId: string) => void;
  onSave: (jobId: string) => void;
  onCompare: (jobId: string) => void;
  onRemove: (sourceId: string) => void;
  onAllowResize: (jobId: string) => void;
  onSelect: (sourceId: string) => void;
  onInspect: (sourceId: string) => void;
  onAddMore: () => void;
}

export function FileGrid({
  views,
  selectedSourceId,
  onRetry,
  onSave,
  onCompare,
  onRemove,
  onAllowResize,
  onSelect,
  onInspect,
  onAddMore,
}: Props) {
  return (
    <section class="flex min-h-0 flex-col gap-3 p-4" aria-label="Files">
      <div class="flex items-center justify-between gap-4">
        <h2 class="m-0 text-sm font-semibold tracking-[0.02em] text-text-muted uppercase">
          Files ({views.length})
        </h2>
        <button
          type="button"
          onClick={onAddMore}
          class="min-h-11 rounded-md border border-dashed border-border-strong px-3 text-xs text-text-muted hover:bg-bg-subtle hover:text-text"
        >
          + Add more files
        </button>
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 overflow-y-auto">
        {views.map(({ job, source }) => (
          <FileCard
            key={job.id}
            job={job}
            source={source}
            selected={selectedSourceId === source.id}
            onRetry={() => onRetry(job.id)}
            onSave={() => onSave(job.id)}
            onCompare={() => onCompare(job.id)}
            onRemove={() => onRemove(source.id)}
            onAllowResize={() => onAllowResize(job.id)}
            onSelect={() => onSelect(source.id)}
            onInspect={() => onInspect(source.id)}
          />
        ))}
      </div>
    </section>
  );
}
