import type { ResizeSpec } from '../../core/types';
import { Field, NumberField, Select } from './primitives';

interface Props {
  resize: ResizeSpec;
  onChange: (resize: ResizeSpec) => void;
}

export function ResizeControl({ resize, onChange }: Props) {
  return (
    <Field label="Resize" htmlFor="resize-kind">
      <Select
        id="resize-kind"
        value={resize.kind}
        options={[
          { value: 'none', label: 'None' },
          { value: 'maxDimension', label: 'Longest edge' },
          { value: 'scale', label: 'Percentage' },
        ]}
        onChange={(kind) => {
          if (kind === 'none') onChange({ kind: 'none' });
          else if (kind === 'scale') onChange({ kind: 'scale', factor: 0.5 });
          else onChange({ kind: 'maxDimension', max: 1920 });
        }}
      />

      {resize.kind === 'maxDimension' && (
        <NumberField
          value={resize.max}
          min={16}
          ariaLabel="Longest edge in pixels"
          onChange={(max) => onChange({ kind: 'maxDimension', max: Math.max(16, Math.round(max)) })}
        />
      )}

      {resize.kind === 'scale' && (
        <NumberField
          value={Math.round(resize.factor * 100)}
          min={1}
          max={100}
          ariaLabel="Scale percentage"
          onChange={(pct) =>
            onChange({ kind: 'scale', factor: Math.min(1, Math.max(0.01, pct / 100)) })
          }
        />
      )}
    </Field>
  );
}
