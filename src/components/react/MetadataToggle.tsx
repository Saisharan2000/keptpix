import type { MetadataPolicy } from '../../core/types';
import { Toggle } from './primitives';

interface Props {
  metadata: MetadataPolicy;
  onChange: (patch: Partial<MetadataPolicy>) => void;
}

/** The config switch. MetadataPanel is the separate inspector drawer. */
export function MetadataToggle({ metadata, onChange }: Props) {
  return (
    <fieldset class="m-0 border-0 p-0">
      <legend class="mb-2 text-xs font-semibold tracking-[0.02em] text-text-muted uppercase">
        Metadata
      </legend>
      <Toggle
        id="strip-meta"
        checked={metadata.stripAll}
        label="Strip EXIF & GPS"
        hint="Removes camera model, capture time and location."
        onChange={(stripAll) => onChange({ stripAll })}
      />
      <Toggle
        id="keep-rotation"
        checked={metadata.preserveOrientation}
        label="Keep rotation"
        hint="Applies orientation to the pixels so photos stay upright."
        onChange={(preserveOrientation) => onChange({ preserveOrientation })}
      />
    </fieldset>
  );
}
