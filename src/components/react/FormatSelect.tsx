import type { CodecSupport, OutputFormat } from '../../core/types';
import { Field, Select } from './primitives';

interface Props {
  value: OutputFormat;
  codecs: CodecSupport;
  onChange: (format: OutputFormat) => void;
}

const LABEL: Record<OutputFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  jxl: 'JPEG XL',
};

export function FormatSelect({ value, codecs, onChange }: Props) {
  // Only formats this browser can actually produce. Offering a choice that
  // fails on submit is worse than not offering it.
  const options = (Object.keys(LABEL) as OutputFormat[])
    .filter((format) => codecs.encode[format] || format === value)
    .map((format) => ({ value: format, label: LABEL[format] }));

  return (
    <Field label="Output" htmlFor="output-format">
      <Select
        id="output-format"
        value={value}
        options={options}
        onChange={(next) => onChange(next as OutputFormat)}
      />
    </Field>
  );
}
