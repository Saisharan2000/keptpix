import type { BatchSummary as Summary } from '../../core/types';
import { formatBytes } from '../../state/selectors';
import { Button } from './primitives';

interface Props {
  summary: Summary;
  running: number;
  warnings: number;
  busy: boolean;
  onClear: () => void;
  onDownloadAll: () => void;
}

export function BatchSummary({
  summary,
  running,
  warnings,
  busy,
  onClear,
  onDownloadAll,
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      class="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-bg px-4 py-3"
    >
      <div>
        <p class="m-0 text-sm text-text-muted">
          {summary.done} done · {running} running · {summary.failed} failed
          {warnings > 0 && ' · ' + warnings + ' warning' + (warnings === 1 ? '' : 's')}
        </p>
        {summary.totalOutputBytes > 0 && (
          <p class="num m-0 text-sm text-text">
            {formatBytes(summary.totalInputBytes)} → {formatBytes(summary.totalOutputBytes)}{' '}
            <span class="text-success">saved {summary.savedPercent.toFixed(1)}%</span>
          </p>
        )}
      </div>

      <div class="flex gap-2">
        <Button variant="ghost" onClick={onClear} disabled={busy}>
          Clear
        </Button>
        <Button variant="primary" onClick={onDownloadAll} disabled={summary.done === 0}>
          Download all (ZIP)
        </Button>
      </div>
    </div>
  );
}
