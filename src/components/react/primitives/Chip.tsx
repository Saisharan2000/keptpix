interface Props {
  label: string;
  pressed: boolean;
  onClick: () => void;
}

/** aria-pressed, not a fake selected class — the state must be announced. */
export function Chip({ label, pressed, onClick }: Props) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      class={
        'num min-h-11 rounded-md border px-2 text-xs font-medium ' +
        (pressed
          ? 'border-accent bg-accent-subtle text-accent'
          : 'border-border-strong text-text-muted hover:bg-bg-muted')
      }
    >
      {label}
    </button>
  );
}
