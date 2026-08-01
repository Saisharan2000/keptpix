import { useRef, useState } from 'react';
import type { StoredPreset } from '../../core/types';
import { Button, Field, Select } from './primitives';

interface Props {
  presets: readonly StoredPreset[];
  onApply: (id: string) => void;
  onSaveCurrent: (name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

/**
 * Built-ins and user-saved presets in one list (docs/05 §2's `isBuiltIn`
 * flag exists specifically so they are not two separate concepts). Saving,
 * deleting and JSON export/import land here in Milestone 8; docs/05 §2 notes
 * IndexedDB is not durable under Safari's 7-day ITP eviction, so export is
 * the real durability story, not a bonus feature.
 */
export function PresetPicker({ presets, onApply, onSaveCurrent, onDelete, onExport, onImport }: Props) {
  const [selected, setSelected] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPreset = presets.find((p) => p.id === selected);

  const submitSave = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    onSaveCurrent(trimmed);
    setName('');
    setNaming(false);
  };

  return (
    <Field label="Preset" htmlFor="preset">
      <Select
        id="preset"
        value={selected}
        options={[
          { value: '', label: 'Custom' },
          ...presets.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={(id) => {
          setSelected(id);
          if (id !== '') onApply(id);
        }}
      />

      <div class="flex flex-wrap gap-1">
        {!naming && (
          <Button size="sm" variant="ghost" onClick={() => setNaming(true)}>
            Save current as…
          </Button>
        )}
        {selectedPreset !== undefined && !selectedPreset.isBuiltIn && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onDelete(selectedPreset.id);
              setSelected('');
            }}
          >
            Delete “{selectedPreset.name}”
          </Button>
        )}
      </div>

      {naming && (
        <Field label="Preset name" htmlFor="preset-name">
          <div class="flex gap-1">
            <input
              id="preset-name"
              type="text"
              value={name}
              placeholder="Preset name"
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSave();
                if (e.key === 'Escape') {
                  setNaming(false);
                  setName('');
                }
              }}
              class="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text"
            />
            <Button size="sm" variant="primary" onClick={submitSave} disabled={name.trim() === ''}>
              Save
            </Button>
          </div>
        </Field>
      )}

      <div class="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={onExport}>
          Export presets
        </Button>
        <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
          Import presets
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          class="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file !== undefined) onImport(file);
            e.currentTarget.value = '';
          }}
        />
      </div>
    </Field>
  );
}
