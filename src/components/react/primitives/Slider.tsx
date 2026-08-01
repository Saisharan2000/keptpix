import type { JSX } from 'preact';

interface Props {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel?: string;
  onChange: (value: number) => void;
}

export function Slider({ id, value, min, max, step = 1, ariaLabel, onChange }: Props) {
  const handle = (event: JSX.TargetedEvent<HTMLInputElement>): void => {
    onChange(Number(event.currentTarget.value));
  };
  return (
    <input
      id={id}
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onInput={handle}
      class="h-11 w-full accent-[var(--color-accent)]"
    />
  );
}
