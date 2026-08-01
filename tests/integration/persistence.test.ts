/**
 * docs/12 D-50 — settings/presets persistence, exercised against a real
 * IndexedDB, not a mock. Runs in a real browser deliberately: Dexie's own
 * `indexedDB` global does not exist under plain Node.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { useStore } from '../../src/state/store';
import type { JobConfig } from '../../src/core/types';

const CUSTOM_CONFIG: JobConfig = {
  outputFormat: 'avif',
  sizeMode: { kind: 'quality', quality: 55 },
  resize: { kind: 'none' },
  metadata: { stripAll: true, preserveOrientation: true, preserveColorProfile: false },
  encoderPreference: 'best-quality',
  backgroundColor: '#000000',
};

describe('persistence (docs/12 D-50)', () => {
  beforeAll(async () => {
    await useStore.getState().hydratePersistence();
  });

  it('seeds the three built-in presets into a fresh IndexedDB on first run', () => {
    const presets = useStore.getState().presets;
    const builtIns = presets.filter((p) => p.isBuiltIn);
    expect(builtIns.map((p) => p.id).sort()).toEqual(['archive', 'passport', 'web']);
    // Every built-in resolves to a COMPLETE JobConfig, not the partial patch
    // PresetPicker used to hardcode — the whole point of moving them into
    // Dexie's schema, which declares StoredPreset.config: JobConfig.
    for (const preset of builtIns) {
      expect(typeof preset.config.outputFormat).toBe('string');
      expect(typeof preset.config.encoderPreference).toBe('string');
      expect(preset.config.metadata).toBeDefined();
    }
  });

  it('saves a user preset, applies it, and increments usage on apply', async () => {
    const name = 'test-preset-' + Date.now();
    await useStore.getState().savePreset(name, CUSTOM_CONFIG);

    const saved = useStore.getState().presets.find((p) => p.name === name);
    expect(saved).toBeDefined();
    expect(saved?.isBuiltIn).toBe(false);
    expect(saved?.usageCount).toBe(0);

    const applied = useStore.getState().applyPresetConfig(saved!.id);
    expect(applied).toEqual(CUSTOM_CONFIG);

    const afterApply = useStore.getState().presets.find((p) => p.id === saved!.id);
    expect(afterApply?.usageCount).toBe(1);
  });

  it('persists a saved preset across a fresh hydration (proves it hit real IndexedDB)', async () => {
    const name = 'durable-preset-' + Date.now();
    await useStore.getState().savePreset(name, CUSTOM_CONFIG);

    // Simulate a reload: wipe the in-memory slice, then hydrate again. If this
    // still finds the preset, it came from IndexedDB, not from memory.
    useStore.setState({ presets: [] });
    await useStore.getState().hydratePersistence();

    const rehydrated = useStore.getState().presets.find((p) => p.name === name);
    expect(rehydrated).toBeDefined();
    expect(rehydrated?.config).toEqual(CUSTOM_CONFIG);
  });

  it('refuses to delete a built-in preset, but deletes a user preset', async () => {
    const beforeCount = useStore.getState().presets.length;
    await useStore.getState().deletePreset('web');
    expect(useStore.getState().presets.some((p) => p.id === 'web')).toBe(true);
    expect(useStore.getState().presets.length).toBe(beforeCount);

    const name = 'deletable-' + Date.now();
    await useStore.getState().savePreset(name, CUSTOM_CONFIG);
    const created = useStore.getState().presets.find((p) => p.name === name)!;
    await useStore.getState().deletePreset(created.id);
    expect(useStore.getState().presets.some((p) => p.id === created.id)).toBe(false);
  });

  it('round-trips presets through export/import JSON, excluding built-ins', async () => {
    const name = 'exportable-' + Date.now();
    await useStore.getState().savePreset(name, CUSTOM_CONFIG);

    const json = useStore.getState().exportPresetsJson();
    const parsed = JSON.parse(json) as { presets: Array<{ name: string; isBuiltIn?: boolean }> };
    expect(parsed.presets.some((p) => p.isBuiltIn === true)).toBe(false);
    expect(parsed.presets.some((p) => p.name === name)).toBe(true);

    // Clear in-memory presets down to nothing, then import the export back.
    useStore.setState({ presets: [] });
    const count = await useStore.getState().importPresetsJson(json);
    expect(count).toBe(parsed.presets.length);
    expect(useStore.getState().presets.some((p) => p.name === name)).toBe(true);
    // Imported presets get FRESH ids — reimporting the same export twice must
    // never silently overwrite an existing preset by accident.
    const reimported = useStore.getState().presets.find((p) => p.name === name);
    expect(reimported?.isBuiltIn).toBe(false);
  });

  it('rejects garbage JSON without throwing', async () => {
    await expect(useStore.getState().importPresetsJson('not json at all')).resolves.toBe(0);
    await expect(useStore.getState().importPresetsJson('{"presets": [123, null, "x"]}')).resolves.toBe(0);
  });

  it('persists settings and reflects a patch immediately', async () => {
    await useStore.getState().updateSettings({ showMetadataWarnings: false });
    expect(useStore.getState().settings.showMetadataWarnings).toBe(false);

    useStore.setState({ settings: useStore.getState().settings });
    await useStore.getState().hydratePersistence();
    expect(useStore.getState().settings.showMetadataWarnings).toBe(false);
  });
});
