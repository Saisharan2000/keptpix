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

/**
 * A select that draws its own colours and its own arrow.
 *
 * `appearance: none` is load-bearing, not cosmetic. Left native, iOS paints the
 * control from the system appearance and reports its text colour as #000000
 * regardless of the `color` we set — so it renders correctly but every checker
 * reads it as black on a dark background and calls it a 1.08:1 contrast failure
 * (docs/12 D-77). Owning the colours makes what is rendered and what is
 * reported the same thing, and incidentally makes the control look the same on
 * every platform instead of three different ways.
 *
 * The arrow is a sibling rather than a background image so it inherits
 * `currentColor` and follows the theme. `aria-hidden` and `pointer-events-none`
 * keep it out of the accessibility tree and out of the way of the click.
 */
export function Select({ id, value, options, onChange, ariaLabel, disabled }: Props) {
  const handle = (event: JSX.TargetedEvent<HTMLSelectElement>): void => {
    onChange(event.currentTarget.value);
  };
  return (
    <span class="relative block w-full">
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={handle}
        class="min-h-11 w-full appearance-none rounded-md border border-border-strong bg-surface pr-9 pl-3 text-sm text-text disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  );
}
