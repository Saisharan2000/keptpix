import type { JobResult } from '../../core/types';
import { Button } from './primitives';

interface Props {
  result: JobResult;
  /** Delivery is a store action — components stay dumb (docs/04 §2). */
  onSave: () => void;
  onCompare?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
}

export function ResultActions({ result, onSave, onCompare, onRemove }: Props) {
  return (
    /*
     * NO `flex-wrap`. Three text buttons do not fit a 171px grid column, so
     * wrapping made this block 76px tall there and 36px tall in a wider one —
     * and FileCard has a FIXED height (docs/08 §5), so a height that depends on
     * column width cannot be accommodated by any single number. It failed twice
     * over: the Save button was sheared off by the card's `overflow-hidden`,
     * and flexbox resolved the overconstraint by shrinking the truncated text
     * rows to zero height, silently deleting the filename and the compression
     * stats. Both measured; docs/12 D-89.
     *
     * Remove is icon-only so all three fit one row. That is not a new idea
     * here — ManifestToolShell's page list already uses a bare ✕ with an
     * aria-label, and the label is per-file rather than a generic "Remove file",
     * so a screen reader user knows WHICH file they are discarding.
     */
    <div class="flex flex-nowrap items-center gap-1">
      <Button size="sm" variant="secondary" onClick={onSave} aria-label={'Save ' + result.outputName}>
        Save
      </Button>
      {onCompare !== undefined && (
        <Button size="sm" variant="ghost" onClick={onCompare}>
          Compare
        </Button>
      )}
      {onRemove !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={'Remove ' + result.outputName}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Button>
      )}
    </div>
  );
}
