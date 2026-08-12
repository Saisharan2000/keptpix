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
  /** Next step in the same real-world task — see ToolShell's prop of the same name. */
  chain?: { href: string; label: string; reason: string };
}

export function BatchSummary({
  summary,
  running,
  warnings,
  busy,
  onClear,
  onDownloadAll,
  chain,
}: Props) {
  /*
   * The chain waits for the whole batch, not the first success: while jobs are
   * still running the user has not finished THIS task, and offering the next
   * one mid-run is a distraction rather than a service. Failures do not hide
   * it — one file failing never aborts a batch, and a user with 9 of 10 done
   * still has a signature to compress (docs/12 D-113).
   */
  const showChain = chain !== undefined && running === 0 && summary.done > 0;

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
            {/* savedPercent is signed — a batch converting HEIC to JPEG
                legitimately grows, and saying "saved 0%" would be a lie. */}
            {summary.savedPercent >= 0 ? (
              <span class="text-success">saved {summary.savedPercent.toFixed(1)}%</span>
            ) : (
              <span class="text-warning">
                {Math.abs(summary.savedPercent).toFixed(1)}% larger
              </span>
            )}
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

      {showChain && (
        /* w-full so flex-wrap drops it onto its own row. A plain anchor — a
           navigation to another prerendered route, not an action, so it must
           work with the island's JS already served and nothing else. */
        <p class="m-0 w-full border-t border-border pt-3 text-sm text-text-muted">
          {chain.reason}{' '}
          <a
            href={chain.href}
            class="font-medium text-accent underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {chain.label} →
          </a>
        </p>
      )}
    </div>
  );
}
