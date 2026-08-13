import {
  OUTPUT_FLATTENS_ALPHA,
  type CodecSupport,
  type JobConfig,
  type SizeMode,
  type StoredPreset,
} from '../../core/types';
import { BackgroundColorControl } from './BackgroundColorControl';
import { FormatSelect } from './FormatSelect';
import { ModeToggle } from './ModeToggle';
import { QualityControl } from './QualityControl';
import { TargetSizeControl } from './TargetSizeControl';
import { ResizeControl } from './ResizeControl';
import { MetadataToggle } from './MetadataToggle';
import { PresetPicker } from './PresetPicker';

interface Props {
  config: JobConfig;
  codecs: CodecSupport;
  achievedBytes: number | null;
  onChange: (patch: Partial<JobConfig>) => void;
  presets: readonly StoredPreset[];
  onApplyPreset: (id: string) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onExportPresets: () => void;
  onImportPresets: (file: File) => void;
}

const DEFAULT_TARGET = 100_000;
const DEFAULT_QUALITY = 82;

export function ConfigPanel({
  config,
  codecs,
  achievedBytes,
  onChange,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onExportPresets,
  onImportPresets,
}: Props) {
  const setMode = (kind: SizeMode['kind']): void => {
    if (kind === 'quality') onChange({ sizeMode: { kind: 'quality', quality: DEFAULT_QUALITY } });
    else if (kind === 'lossless') onChange({ sizeMode: { kind: 'lossless' } });
    else onChange({ sizeMode: { kind: 'target', targetBytes: DEFAULT_TARGET } });
  };

  return (
    <div class="flex flex-col gap-6 p-4">
      <FormatSelect
        value={config.outputFormat}
        codecs={codecs}
        onChange={(outputFormat) => onChange({ outputFormat })}
      />

      <ModeToggle mode={config.sizeMode.kind} onChange={setMode} />

      {config.sizeMode.kind === 'target' && (
        <TargetSizeControl
          targetBytes={config.sizeMode.targetBytes}
          achievedBytes={achievedBytes}
          onChange={(targetBytes) => onChange({ sizeMode: { kind: 'target', targetBytes } })}
        />
      )}

      {config.sizeMode.kind === 'quality' && (
        <QualityControl
          quality={config.sizeMode.quality}
          onChange={(quality) => onChange({ sizeMode: { kind: 'quality', quality } })}
        />
      )}

      {/* Only when the output actually flattens — a background picker on a PNG
          route would be a control that does nothing (D-122). */}
      {OUTPUT_FLATTENS_ALPHA.has(config.outputFormat) && (
        <BackgroundColorControl
          value={config.backgroundColor}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
        />
      )}

      <ResizeControl resize={config.resize} onChange={(resize) => onChange({ resize })} />

      <MetadataToggle
        metadata={config.metadata}
        onChange={(patch) => onChange({ metadata: { ...config.metadata, ...patch } })}
      />

      <PresetPicker
        presets={presets}
        onApply={onApplyPreset}
        onSaveCurrent={onSavePreset}
        onDelete={onDeletePreset}
        onExport={onExportPresets}
        onImport={onImportPresets}
      />
    </div>
  );
}
