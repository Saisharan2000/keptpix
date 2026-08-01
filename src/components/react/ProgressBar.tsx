interface Props {
  /** 0-1, or null while a codec is downloading and no pass count exists yet. */
  value: number | null;
  label: string;
}

/**
 * docs/08 §5: determinate whenever passes are known; indeterminate ONLY during
 * a codec download. aria-valuenow/min/max are maintained throughout.
 */
export function ProgressBar({ value, label }: Props) {
  const indeterminate = value === null;
  const pct = indeterminate ? 0 : Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(indeterminate ? {} : { 'aria-valuenow': pct })}
      class="h-1 w-full overflow-hidden rounded-full bg-bg-muted"
    >
      <div
        class={
          'h-full bg-accent transition-[width] duration-[var(--duration-base)] ' +
          (indeterminate ? 'w-1/3 animate-pulse' : '')
        }
        style={indeterminate ? undefined : { width: pct + '%' }}
      />
    </div>
  );
}
