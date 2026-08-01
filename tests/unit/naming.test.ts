/**
 * Output filename generation and collision handling.
 * Referenced by toJobResult() in docs/05-data-models.md §1.
 */
import { describe, it, expect } from 'vitest';
import {
  makeOutputName,
  makeUniqueOutputName,
  sanitiseBaseName,
  OUTPUT_EXTENSION,
} from '../../src/core/naming';
import type { OutputFormat } from '../../src/core/types';

describe('makeOutputName', () => {
  it('swaps the extension for the output format', () => {
    expect(makeOutputName('IMG_0001.HEIC', 'jpeg')).toBe('IMG_0001.jpg');
    expect(makeOutputName('photo.png', 'webp')).toBe('photo.webp');
    expect(makeOutputName('shot.jpeg', 'avif')).toBe('shot.avif');
  });

  it('uses .jpg, not .jpeg, for the jpeg format', () => {
    expect(OUTPUT_EXTENSION.jpeg).toBe('jpg');
    expect(makeOutputName('a.heic', 'jpeg')).toBe('a.jpg');
  });

  it('covers every OutputFormat', () => {
    const formats: OutputFormat[] = ['jpeg', 'png', 'webp', 'avif', 'jxl'];
    for (const f of formats) {
      expect(makeOutputName('x.heic', f)).toBe('x.' + OUTPUT_EXTENSION[f]);
    }
  });

  it('handles a name with no extension', () => {
    expect(makeOutputName('screenshot', 'png')).toBe('screenshot.png');
  });

  it('preserves dots inside the base name', () => {
    expect(makeOutputName('holiday.2026.summer.heic', 'jpeg')).toBe('holiday.2026.summer.jpg');
  });
});

describe('sanitiseBaseName — folder drops and hostile names', () => {
  it('strips a directory path, as produced by a folder drop', () => {
    expect(sanitiseBaseName('Camera Roll/IMG_0001.HEIC')).toBe('IMG_0001');
    expect(sanitiseBaseName('a/b/c/deep.png')).toBe('deep');
  });

  it('strips a Windows-style path', () => {
    expect(sanitiseBaseName('C:\\Users\\me\\pic.png')).toBe('pic');
  });

  it('replaces characters the filesystem would reject', () => {
    const out = sanitiseBaseName('we:ird?name*here.jpg');
    expect(out).not.toMatch(/[<>:"/\\|?*]/);
    expect(out).toContain('we_ird_name_here');
  });

  it('drops trailing dots and spaces, which Windows silently eats', () => {
    expect(sanitiseBaseName('trailing   .png')).toBe('trailing');
    expect(sanitiseBaseName('dots...png')).toBe('dots');
  });

  it('falls back to "image" rather than producing an empty name', () => {
    expect(sanitiseBaseName('.png')).toBe('image');
    expect(sanitiseBaseName('///')).toBe('image');
    expect(sanitiseBaseName('   ')).toBe('image');
  });

  it('never emits a path separator', () => {
    for (const n of ['a/b.png', 'a\\b.png', '/leading.png', 'trail/.png']) {
      expect(sanitiseBaseName(n)).not.toMatch(/[/\\]/);
    }
  });
});

describe('makeUniqueOutputName — collisions', () => {
  it('returns the plain name when nothing collides', () => {
    expect(makeUniqueOutputName('a.heic', 'jpeg', new Set())).toBe('a.jpg');
  });

  it('suffixes on collision instead of silently overwriting', () => {
    const taken = new Set(['IMG_1.jpg']);
    expect(makeUniqueOutputName('IMG_1.heic', 'jpeg', taken)).toBe('IMG_1 (2).jpg');
  });

  it('keeps counting past the first collision', () => {
    const taken = new Set(['IMG_1.jpg', 'IMG_1 (2).jpg', 'IMG_1 (3).jpg']);
    expect(makeUniqueOutputName('IMG_1.heic', 'jpeg', taken)).toBe('IMG_1 (4).jpg');
  });

  it('resolves the real batch case: two sources converging on one output name', () => {
    // IMG_1.heic and IMG_1.png both convert to JPG. Without this, the second
    // would overwrite the first in the user's downloads folder.
    const taken = new Set<string>();
    const first = makeUniqueOutputName('IMG_1.heic', 'jpeg', taken);
    taken.add(first);
    const second = makeUniqueOutputName('IMG_1.png', 'jpeg', taken);
    taken.add(second);

    expect(first).toBe('IMG_1.jpg');
    expect(second).toBe('IMG_1 (2).jpg');
    expect(taken.size).toBe(2);
  });

  it('stays unique across a 50-file batch of identical names', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      taken.add(makeUniqueOutputName('same.heic', 'jpeg', taken));
    }
    expect(taken.size).toBe(50);
  });
});
