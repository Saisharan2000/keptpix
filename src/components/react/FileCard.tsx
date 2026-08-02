import type { Job, SourceImage } from '../../core/types';
import { formatBytes, isWarning } from '../../state/selectors';
import { ErrorCard } from './ErrorCard';
import { ProgressBar } from './ProgressBar';
import { ResultActions } from './ResultActions';
import { useObjectUrl } from './primitives';

interface Props {
  job: Job;
  source: SourceImage;
  onRetry: () => void;
  onSave: () => void;
  onCompare: () => void;
  onRemove: () => void;
  onAllowResize: () => void;
  onSelect: () => void;
  onInspect: () => void;
  selected: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Working',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/**
 * FIXED HEIGHT IN EVERY STATE. This is load-bearing, not cosmetic: docs/08 §5
 * requires the grid not to reflow as jobs finish, or cards jump out from under
 * the user's cursor mid-batch.
 */
export function FileCard({
  job,
  source,
  onRetry,
  onSave,
  onCompare,
  onRemove,
  onAllowResize,
  onSelect,
  onInspect,
  selected,
}: Props) {
  const thumbUrl = useObjectUrl(source.file);
  const warning = isWarning(job);
  const failed = job.status === 'failed';

  const border = failed
    ? 'border-danger'
    : warning
      ? 'border-warning'
      : selected
        ? 'border-accent'
        : 'border-border';

  return (
    <article
      class={'flex h-[212px] flex-col overflow-hidden rounded-lg border bg-surface ' + border}
      aria-label={source.name + ' — ' + (STATUS_LABEL[job.status] ?? job.status)}
    >
      <button
        type="button"
        onClick={onSelect}
        class="relative block h-[104px] w-full shrink-0 bg-bg-muted"
        aria-label={'Preview ' + source.name}
      >
        {thumbUrl !== null && (
          <img
            src={thumbUrl}
            alt=""
            class={'h-full w-full object-cover ' + (job.status === 'queued' ? 'opacity-55' : '')}
          />
        )}
        <span
          class={
            'absolute top-2 left-2 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ' +
            (failed
              ? 'bg-danger text-bg'
              : warning
                ? 'bg-warning text-bg'
                : job.status === 'done'
                  ? 'bg-success text-bg'
                  : 'bg-bg-subtle text-text-muted')
          }
        >
          {warning ? 'Warning' : (STATUS_LABEL[job.status] ?? job.status)}
        </span>
      </button>

      <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-3">
        <p class="m-0 truncate text-xs text-text" title={source.name}>
          {source.name}
        </p>

        {job.status === 'queued' && (
          <div class="flex items-center justify-between gap-2">
            <p class="num m-0 text-xs text-text-muted">{formatBytes(source.sizeBytes)}</p>
            {/*
              Shown in the QUEUED state on purpose (WO-10, docs/02 §5): the
              point of the inspector is seeing what a file carries BEFORE it is
              processed. The GPS dot is the whole privacy demonstration — it
              says "your photo knows where you were" using the user's own file,
              without anything being uploaded to find out.
            */}
            <button
              type="button"
              onClick={onInspect}
              class="flex min-h-9 shrink-0 items-center gap-1 px-1.5 text-xs text-text-muted hover:text-text"
              aria-label={'Inspect metadata for ' + source.name}
            >
              {source.metadata?.hasGps === true && (
                <span class="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
              )}
              Info
            </button>
          </div>
        )}

        {job.status === 'running' && (
          <div class="flex flex-col gap-1">
            <ProgressBar value={job.progress} label={'Converting ' + source.name} />
            {/* The REAL pass number, never a fake bar (docs/08 §4). */}
            <p class="num m-0 text-xs text-text-muted">
              {job.phase === 'encoding' && job.passesUsed > 0
                ? 'pass ' + job.passesUsed + '/8'
                : (job.phase ?? 'working')}
            </p>
          </div>
        )}

        {job.result !== null && (
          <>
            <p class="num m-0 text-sm text-text">
              {formatBytes(source.sizeBytes)} → {formatBytes(job.result.sizeBytes)}
            </p>
            <p class="num m-0 text-xs text-text-muted">
              {/*
                Report growth honestly. This used to be
                `Math.max(0, ...)` rendered in success green with a ↓ — so a
                HEIC that legitimately grew 55% on the way to JPEG displayed
                "0% ↓". Found on a real iPhone during the launch-gate test.

                HEIC→JPEG growing the file is EXPECTED, not a failure: HEVC
                intra-coding is roughly twice as efficient as JPEG, so the same
                picture costs more bytes as a JPEG. The defect was claiming a
                reduction that did not happen, in the colour reserved for wins.
              */}
              {job.result.sizeBytes <= source.sizeBytes ? (
                <span class="text-success">
                  {Math.round((1 - job.result.sizeBytes / source.sizeBytes) * 100)}% ↓
                </span>
              ) : (
                <span
                  class="text-warning"
                  title="Expected when converting from a more efficient format — HEIC packs the same picture into fewer bytes than JPEG can."
                >
                  {Math.round((job.result.sizeBytes / source.sizeBytes - 1) * 100)}% ↑
                </span>
              )}
              {job.result.qualityUsed !== null && ' · q' + job.result.qualityUsed}
              {' · ' + job.result.dimensions.width + '×' + job.result.dimensions.height}
            </p>
            <div class="mt-auto">
              <ResultActions
                result={job.result}
                onSave={onSave}
                onCompare={onCompare}
                onRemove={onRemove}
              />
            </div>
          </>
        )}

        {warning && job.error !== null && (
          <div class="mt-1 overflow-auto">
            <ErrorCard error={job.error} onAllowResize={onAllowResize} />
          </div>
        )}

        {failed && job.error !== null && (
          <div class="mt-1 overflow-auto">
            <ErrorCard error={job.error} onRetry={onRetry} onRemove={onRemove} />
          </div>
        )}
      </div>
    </article>
  );
}
