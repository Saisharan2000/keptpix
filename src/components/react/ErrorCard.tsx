import type { JobError } from '../../core/types';
import { Button } from './primitives';

interface Props {
  error: JobError;
  onRetry?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  onAllowResize?: (() => void) | undefined;
}

/**
 * docs/07 §4: every failure shows its specific message AND a next action.
 * There is deliberately no generic branch here — a JobError always carries a
 * code from the docs/04 §6 taxonomy, so "Something went wrong" is unreachable.
 *
 * Errors are icon + text + action, never colour alone (docs/08 §6).
 */
export function ErrorCard({ error, onRetry, onRemove, onAllowResize }: Props) {
  const unreachable = error.code === 'E_TARGET_UNREACHABLE';
  const tone = unreachable
    ? 'border-warning bg-warning-subtle'
    : 'border-danger bg-danger-subtle';

  return (
    <div class={'rounded-md border px-3 py-2 ' + tone}>
      <p class="m-0 flex items-start gap-2 text-xs text-text">
        <span aria-hidden="true">{unreachable ? '⚠' : '✕'}</span>
        <span>
          <span class="num font-semibold">{error.code}</span>
          <span class="mt-0.5 block">{error.message}</span>
        </span>
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        {unreachable && onAllowResize !== undefined && (
          <Button size="sm" variant="secondary" onClick={onAllowResize}>
            Allow resizing to reach target
          </Button>
        )}
        {!unreachable && error.recoverable && onRetry !== undefined && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
        {onRemove !== undefined && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
