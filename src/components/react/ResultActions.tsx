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
    <div class="flex flex-wrap gap-1">
      <Button size="sm" variant="secondary" onClick={onSave} aria-label={'Save ' + result.outputName}>
        Save
      </Button>
      {onCompare !== undefined && (
        <Button size="sm" variant="ghost" onClick={onCompare}>
          Compare
        </Button>
      )}
      {onRemove !== undefined && (
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove file">
          Remove
        </Button>
      )}
    </div>
  );
}
