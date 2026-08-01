interface Option {
  value: string;
  label: string;
}

interface Props {
  name: string;
  legend: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
}

/**
 * A real fieldset/legend rather than styled divs, so a screen reader announces
 * the group name before each option (docs/08 §6).
 */
export function RadioGroup({ name, legend, value, options, onChange }: Props) {
  return (
    <fieldset class="m-0 border-0 p-0">
      <legend class="mb-2 text-xs font-semibold tracking-[0.02em] text-text-muted uppercase">
        {legend}
      </legend>
      <div class="flex flex-col gap-1">
        {options.map((option) => (
          <label key={option.value} class="flex min-h-11 items-center gap-3 text-sm text-text">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              class="h-4 w-4 accent-[var(--color-accent)]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
