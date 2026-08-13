/**
 * docs/kepttools/03-engines-contracts.md §6 — "Manifest completeness".
 *
 * The manifest is data, and data with no test is data that drifts. These are
 * the invariants every future milestone has to keep holding as it flips
 * entries to `supported: true` and adds tools.
 */
import { describe, it, expect } from 'vitest';
import {
  defaultsFromFields,
  findPublishedToolBySlug,
  findTool,
  isInputless,
  publishedTools,
  publishedToolsForEngine,
  toolManifest,
  type ToolId,
} from '../../src/core/tools';

/** Every id declared in docs/kepttools/03 §1, in that order. */
const DECLARED_IDS: ToolId[] = [
  'pdf-merge',
  'pdf-compress',
  'images-to-pdf',
  'pdf-to-images',
  'pdf-split',
  'pdf-rotate',
  'pdf-sign',
  'video-compress',
  'video-trim',
  'video-to-gif',
  'video-extract-audio',
  'qr-generate',
];

describe('tool manifest', () => {
  it('declares exactly the twelve tools the spec names', () => {
    expect(toolManifest.map((t) => t.id).sort()).toEqual([...DECLARED_IDS].sort());
  });

  it('has no duplicate ids', () => {
    const ids = toolManifest.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate slugs', () => {
    const slugs = toolManifest.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every tool a two-segment absolute slug the route file can split', () => {
    for (const tool of toolManifest) {
      // '/pdf/merge'.split('/') === ['', 'pdf', 'merge'] — the route file
      // destructures exactly this shape, so a one-segment slug would silently
      // build a route with an undefined param.
      const parts = tool.slug.split('/');
      expect(parts, tool.id).toHaveLength(3);
      expect(parts[0], tool.id).toBe('');
      expect(parts[1], tool.id).not.toBe('');
      expect(parts[2], tool.id).not.toBe('');
    }
  });

  it('routes each tool under a category matching its engine', () => {
    for (const tool of toolManifest) {
      const category = tool.slug.split('/')[1];
      const expected = tool.engine === 'pdf' && tool.id === 'images-to-pdf' ? 'pdf' : tool.engine;
      expect(category, tool.id).toBe(expected);
    }
  });

  it('gives every config field a unique id within its tool', () => {
    for (const tool of toolManifest) {
      const ids = tool.configFields.map((f) => f.id);
      expect(new Set(ids).size, tool.id).toBe(ids.length);
    }
  });

  it('keeps defaultConfig in step with the field specs', () => {
    // The whole reason defaultsFromFields exists: the hand-written
    // defaultConfig is for readability, and this is what stops it drifting
    // from the controls rendered beside it.
    for (const tool of toolManifest) {
      expect(tool.defaultConfig, tool.id).toEqual(defaultsFromFields(tool));
    }
  });

  it('keeps every targetSize default inside its own declared bounds', () => {
    for (const tool of toolManifest) {
      for (const field of tool.configFields) {
        if (field.kind !== 'targetSize') continue;
        expect(field.minBytes, tool.id).toBeLessThan(field.maxBytes);
        expect(field.defaultBytes, tool.id).toBeGreaterThanOrEqual(field.minBytes);
        expect(field.defaultBytes, tool.id).toBeLessThanOrEqual(field.maxBytes);
      }
    }
  });

  it('keeps every number default inside its own declared bounds', () => {
    for (const tool of toolManifest) {
      for (const field of tool.configFields) {
        if (field.kind !== 'number') continue;
        expect(field.min, tool.id + '.' + field.id).toBeLessThan(field.max);
        expect(field.default, tool.id + '.' + field.id).toBeGreaterThanOrEqual(field.min);
        expect(field.default, tool.id + '.' + field.id).toBeLessThanOrEqual(field.max);
      }
    }
  });

  it('only offers select defaults that are actually options', () => {
    for (const tool of toolManifest) {
      for (const field of tool.configFields) {
        if (field.kind !== 'select') continue;
        const values = field.options.map((o) => o.value);
        expect(values, tool.id + '.' + field.id).toContain(field.default);
      }
    }
  });

  it('marks a tool targetSizeCapable exactly when it has a targetSize field', () => {
    for (const tool of toolManifest) {
      const hasField = tool.configFields.some((f) => f.kind === 'targetSize');
      expect(tool.targetSizeCapable, tool.id).toBe(hasField);
    }
  });

  it('only lets a multi-file tool exist where the engine takes files at all', () => {
    for (const tool of toolManifest) {
      if (tool.accept.length === 0) expect(tool.multiFile, tool.id).toBe(false);
    }
  });
});

describe('the supported gate', () => {
  /**
   * The exact set of tools with a working engine, listed by hand.
   *
   * This started as "nothing is published at M0" and moves forward one entry
   * at a time as engines land — deliberately, by editing this list, which is
   * the point. A tool becomes reachable by a human writing its id here after
   * its acceptance criteria are green, never as a side effect of someone
   * flipping a boolean in the manifest.
   *
   * `images-to-pdf` is the first through (docs/12 D-75).
   */
  const PUBLISHED: readonly ToolId[] = [
    'pdf-merge',
    // D-120: acceptance green in tests/integration/pdf-compress.test.ts —
    // exact-size landing, page count preserved, labelled shortfall on an
    // unreachable target, one bad file never costing the batch. Position
    // matches manifest order, which this list asserts verbatim.
    'pdf-compress',
    'images-to-pdf',
    'pdf-to-images',
    'pdf-split',
    'pdf-rotate',
  ];

  it('publishes exactly the tools whose engines are built', () => {
    expect(publishedTools.map((t) => t.id)).toEqual([...PUBLISHED]);
  });

  it('keeps every other tool gated', () => {
    for (const tool of toolManifest) {
      const shouldBePublished = PUBLISHED.includes(tool.id);
      expect(tool.supported, tool.id).toBe(shouldBePublished);
    }
  });

  it('never exposes an unsupported tool through any lookup', () => {
    for (const tool of toolManifest) {
      if (tool.supported) continue;
      expect(findPublishedToolBySlug(tool.slug)).toBeUndefined();
      expect(publishedTools).not.toContain(tool);
      expect(publishedToolsForEngine(tool.engine)).not.toContain(tool);
    }
  });

  it('still finds unsupported entries by id, so milestones can work on them', () => {
    expect(findTool('pdf-merge')?.slug).toBe('/pdf/merge');
  });
});

describe('isInputless', () => {
  it('is true only for the tool that takes no file', () => {
    const inputless = toolManifest.filter(isInputless).map((t) => t.id);
    expect(inputless).toEqual(['qr-generate']);
  });
});

describe('defaultsFromFields', () => {
  it('returns an entry per declared field and nothing else', () => {
    for (const tool of toolManifest) {
      const defaults = defaultsFromFields(tool);
      expect(Object.keys(defaults).sort(), tool.id).toEqual(
        tool.configFields.map((f) => f.id).sort(),
      );
    }
  });

  it('takes defaultBytes as the value for a targetSize field', () => {
    const compress = findTool('pdf-compress');
    expect(compress).toBeDefined();
    expect(defaultsFromFields(compress!)['targetBytes']).toBe(200_000);
  });
});
