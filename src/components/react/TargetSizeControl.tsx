import { useState } from 'react';
import { Chip, Field, NumberField } from './primitives';

interface Props {
  targetBytes: number;
  achievedBytes?: number | null;
  onChange: (targetBytes: number) => void;
}

/** The six presets from docs/08 §4.2. */
const PRESETS: Array<{ label: string; bytes: number }> = [
  { label: '20 KB', bytes: 20_000 },
  { label: '50 KB', bytes: 50_000 },
  { label: '100 KB', bytes: 100_000 },
  { label: '200 KB', bytes: 200_000 },
  { label: '500 KB', bytes: 500_000 },
  { label: '1 MB', bytes: 1_000_000 },
];

const MIN_SENSIBLE_BYTES = 5_000;

export function TargetSizeControl({ targetBytes, achievedBytes, onChange }: Props) {
  const [unit, setUnit] = useState<'KB' | 'MB'>(targetBytes >= 1_000_000 ? 'MB' : 'KB');
  const divisor = unit === 'MB' ? 1_000_000 : 1_000;
  const shown = Number((targetBytes / divisor).toFixed(unit === 'MB' ? 2 : 0));
  const tooSmall = targetBytes < MIN_SENSIBLE_BYTES;

  return (
    <Field label="Target size" htmlFor="target-size">
      <div class="flex gap-2">
        <NumberField
          id="target-size"
          value={shown}
          min={1}
          ariaLabel="Target size"
          onChange={(next) => onChange(Math.max(1, Math.round(next * divisor)))}
        />
        <select
          value={unit}
          aria-label="Target size unit"
          onChange={(event) => {
            const next = event.currentTarget.value as 'KB' | 'MB';
            setUnit(next);
          }}
          class="min-h-11 rounded-md border border-border-strong bg-surface px-2 text-sm text-text"
        >
          <option value="KB">KB</option>
          <option value="MB">MB</option>
        </select>
      </div>

      <div class="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            pressed={targetBytes === preset.bytes}
            onClick={() => {
              setUnit(preset.bytes >= 1_000_000 ? 'MB' : 'KB');
              onChange(preset.bytes);
            }}
          />
        ))}
      </div>

      {tooSmall && (
        <p class="m-0 text-xs text-warning">
          Below 5 KB, output quality will suffer badly.
        </p>
      )}

      {achievedBytes !== null && achievedBytes !== undefined && (
        <p class="num m-0 text-xs text-text-muted">
          {Math.round(achievedBytes / 1000)} KB / {Math.round(targetBytes / 1000)} KB{' '}
          {achievedBytes <= targetBytes ? '✓' : '⚠'}
        </p>
      )}
    </Field>
  );
}
