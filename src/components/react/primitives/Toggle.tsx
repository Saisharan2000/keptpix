import type { JSX } from 'preact';

interface Props {
  id?: string;
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
}

export function Toggle({ id, checked, label, hint, onChange }: Props) {
  const handle = (event: JSX.TargetedEvent<HTMLInputElement>): void => {
    onChange(event.currentTarget.checked);
  };
  return (
    <div class="flex min-h-11 items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={handle}
        class="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <label for={id} class="text-sm text-text">
        {label}
        {hint !== undefined && <span class="mt-0.5 block text-xs text-text-muted">{hint}</span>}
      </label>
    </div>
  );
}
