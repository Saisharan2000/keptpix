import type { ConfigFieldSpec, ConfigValue, ToolConfig } from '../../core/tools';
import { Field, NumberField, Select, Toggle } from './primitives';
import { TargetSizeControl } from './TargetSizeControl';

interface Props {
  fields: readonly ConfigFieldSpec[];
  config: ToolConfig;
  onChange: (patch: Record<string, ConfigValue>) => void;
  /** Best size achieved so far, for the target-size control's feedback line. */
  achievedBytes?: number | null;
}

/**
 * The parameterized config panel — the half of the scaling mechanic that lives
 * in the UI (docs/kepttools/03 §1).
 *
 * ConfigPanel.tsx stays as it is: it is the IMAGE tool's hand-built panel, with
 * format-aware controls and preset management that no declarative spec should
 * try to express. This one renders whatever a ToolManifestEntry declares, which
 * is what lets "adding a manifest-only tool require zero shell changes" be true
 * rather than aspirational.
 *
 * Every branch here is keyed on `kind`, never on a tool id. A `switch` on
 * `tool.id` appearing in this file would mean the manifest abstraction has
 * failed — standing rule 1 in docs/kepttools/05.
 */
export function ToolConfigPanel({ fields, config, onChange, achievedBytes = null }: Props) {
  if (fields.length === 0) return null;

  return (
    <div class="flex flex-col gap-6 p-4">
      {fields.map((field) => (
        <ConfigField
          key={field.id}
          field={field}
          value={config[field.id]}
          achievedBytes={achievedBytes}
          onChange={(value) => onChange({ [field.id]: value })}
        />
      ))}
    </div>
  );
}

function ConfigField({
  field,
  value,
  achievedBytes,
  onChange,
}: {
  field: ConfigFieldSpec;
  value: ConfigValue | undefined;
  achievedBytes: number | null;
  onChange: (value: ConfigValue) => void;
}) {
  const controlId = 'tool-field-' + field.id;

  switch (field.kind) {
    case 'targetSize': {
      const bytes = typeof value === 'number' ? value : field.defaultBytes;
      return (
        <div>
          <TargetSizeControl
            targetBytes={bytes}
            achievedBytes={achievedBytes}
            onChange={(next) =>
              onChange(Math.min(field.maxBytes, Math.max(field.minBytes, next)))
            }
          />
          {field.help !== undefined && (
            <p class="mt-2 mb-0 text-xs text-text-muted">{field.help}</p>
          )}
        </div>
      );
    }

    case 'select': {
      const current = typeof value === 'string' ? value : field.default;
      return (
        <Field label={field.label} hint={field.help} htmlFor={controlId}>
          <Select
            id={controlId}
            value={current}
            options={field.options}
            onChange={onChange}
          />
        </Field>
      );
    }

    case 'number': {
      const current = typeof value === 'number' ? value : field.default;
      return (
        <Field
          label={field.unit === undefined ? field.label : field.label + ' (' + field.unit + ')'}
          hint={field.help}
          htmlFor={controlId}
        >
          <NumberField
            id={controlId}
            value={current}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(next) => onChange(Math.min(field.max, Math.max(field.min, next)))}
          />
        </Field>
      );
    }

    case 'toggle': {
      const current = typeof value === 'boolean' ? value : field.default;
      return (
        <Toggle
          id={controlId}
          checked={current}
          label={field.label}
          hint={field.help}
          onChange={onChange}
        />
      );
    }

    case 'text': {
      const current = typeof value === 'string' ? value : field.default;
      return (
        <Field label={field.label} hint={field.help} htmlFor={controlId}>
          <input
            id={controlId}
            type="text"
            value={current}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            onInput={(event) => onChange(event.currentTarget.value)}
            class="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
          />
        </Field>
      );
    }

    case 'pageRange': {
      const current = typeof value === 'string' ? value : field.default;
      return (
        <Field label={field.label} hint={field.help} htmlFor={controlId}>
          <input
            id={controlId}
            type="text"
            value={current}
            placeholder={field.placeholder}
            // Not `type="number"`: "1-3, 7, 9-12" is one string, parsed in
            // core/. inputmode keeps a numeric keypad on mobile anyway.
            inputMode="numeric"
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => onChange(event.currentTarget.value)}
            class="num min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
          />
        </Field>
      );
    }
  }
}
