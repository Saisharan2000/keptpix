import type { SizeMode } from '../../core/types';
import { RadioGroup } from './primitives';

interface Props {
  mode: SizeMode['kind'];
  onChange: (kind: SizeMode['kind']) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <RadioGroup
      name="size-mode"
      legend="Mode"
      value={mode}
      options={[
        { value: 'target', label: 'Target size' },
        { value: 'quality', label: 'Quality' },
      ]}
      onChange={(value) => onChange(value as SizeMode['kind'])}
    />
  );
}
