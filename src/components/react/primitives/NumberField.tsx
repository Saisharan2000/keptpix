import type { JSX } from 'preact';

interface Props {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  onChange: (value: number) => void;
}

export function NumberField({ id, value, min, max, step, ariaLabel, onChange }: Props) {
  const handle = (event: JSX.TargetedEvent<HTMLInputElement>): void => {
    const parsed = Number(event.currentTarget.value);
    if (Number.isFinite(parsed)) onChange(parsed);
  };
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onInput={handle}
      class="num min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
    />
  );
}
