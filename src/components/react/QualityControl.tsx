import { Field, Slider } from './primitives';

interface Props {
  quality: number;
  onChange: (quality: number) => void;
}

export function QualityControl({ quality, onChange }: Props) {
  return (
    <Field label="Quality" htmlFor="quality" hint="Higher keeps more detail and costs more bytes.">
      <div class="flex items-center gap-3">
        <Slider
          id="quality"
          value={quality}
          min={1}
          max={100}
          ariaLabel="Quality"
          onChange={onChange}
        />
        <span class="num w-10 shrink-0 text-right text-sm text-text">{quality}</span>
      </div>
    </Field>
  );
}
