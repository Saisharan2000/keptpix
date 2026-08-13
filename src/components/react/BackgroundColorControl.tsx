import { Field } from './primitives';

interface Props {
  value: string;
  onChange: (backgroundColor: string) => void;
}

/**
 * The background transparency is flattened onto, for alpha-less outputs
 * (docs/12 D-122).
 *
 * `JobConfig.backgroundColor` flowed store → worker → encoder from the start;
 * this input is the missing first hop. Its absence is why three FAQ lines
 * claiming "white unless you change it" had to be rewritten in D-115 — with
 * this shipped, that copy is true again.
 *
 * A NATIVE `<input type="color">`: keyboard-operable and labelled for free
 * (docs quality bar), zero JS beyond the change handler, and the OS picker
 * handles colour-blindness affordances better than anything hand-rolled here
 * would. The swatch doubles as the value display.
 *
 * Rendered by ConfigPanel only when the chosen output format is in
 * OUTPUT_FLATTENS_ALPHA — offering a background for a PNG would be a control
 * that does nothing, which is a lie with a label.
 */
export function BackgroundColorControl({ value, onChange }: Props) {
  return (
    <Field
      label="Background for transparency"
      htmlFor="background-color"
      hint="JPG has no transparency — see-through areas are flattened onto this colour."
    >
      <div class="flex items-center gap-3">
        <input
          id="background-color"
          type="color"
          value={value}
          onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value)}
          class="h-9 w-14 cursor-pointer rounded-md border border-border bg-bg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <span class="num text-sm text-text-muted">{value}</span>
      </div>
    </Field>
  );
}
