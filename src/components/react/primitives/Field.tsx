import type { ComponentChildren } from 'preact';

interface Props {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ComponentChildren;
}

/** Uppercase micro-label + control, the rail pattern from docs/08 §4.2. */
export function Field({ label, hint, htmlFor, children }: Props) {
  return (
    <div class="flex flex-col gap-2">
      <label
        for={htmlFor}
        class="text-xs font-semibold tracking-[0.02em] text-text-muted uppercase"
      >
        {label}
      </label>
      {children}
      {hint !== undefined && <p class="m-0 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
