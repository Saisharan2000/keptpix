import type { JSX } from 'preact';

interface Option {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function Select({ id, value, options, onChange, ariaLabel, disabled }: Props) {
  const handle = (event: JSX.TargetedEvent<HTMLSelectElement>): void => {
    onChange(event.currentTarget.value);
  };
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={handle}
      class="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
