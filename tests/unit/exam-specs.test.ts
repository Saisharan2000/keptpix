/**
 * tests/unit/exam-specs.test.ts
 *
 * The exam-spec DATA, held to the rule that makes it not-a-doorway (docs/12
 * D-118): every entry traceable to a primary source, every band internally
 * coherent, every surfaceOn slug a route that actually builds. The renderer
 * silently renders nothing for an empty list, so — as with the chains — the
 * data errors have to be loud here.
 */
import { describe, it, expect } from 'vitest';
import { examSpecs, examSpecsForRoute } from '../../src/content/exam-specs';
import { getSizePresetRoute } from '../../src/content/presets';

describe('exam specs (docs/12 D-118)', () => {
  it('every spec carries a primary source and a verification date', () => {
    for (const spec of examSpecs) {
      expect(spec.sourceUrl, spec.id).toMatch(/^https:\/\//);
      // Primary sources only: the org's own domain, never an aggregator.
      expect(spec.sourceUrl, spec.id).toMatch(/\.(gov\.in|nic\.in|ibps\.in)|s3waas\.gov\.in/);
      expect(spec.sourceTitle.trim().length, spec.id).toBeGreaterThan(0);
      expect(spec.verifiedOn, spec.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(spec.verifiedOn)), spec.id).toBe(false);
    }
  });

  it('every size band is coherent: floor below ceiling, both positive', () => {
    for (const spec of examSpecs) {
      for (const r of spec.requirements) {
        if (r.minKB !== undefined) expect(r.minKB, `${spec.id}/${r.kind}`).toBeGreaterThan(0);
        if (r.maxKB !== undefined) expect(r.maxKB, `${spec.id}/${r.kind}`).toBeGreaterThan(0);
        if (r.minKB !== undefined && r.maxKB !== undefined) {
          expect(r.minKB, `${spec.id}/${r.kind}`).toBeLessThan(r.maxKB);
        }
      }
    }
  });

  it('every surfaceOn slug resolves to a PUBLISHED compress route', () => {
    for (const spec of examSpecs) {
      expect(spec.surfaceOn.length, spec.id).toBeGreaterThan(0);
      for (const slug of spec.surfaceOn) {
        const route = getSizePresetRoute(slug);
        expect(route, `${spec.id} surfaces on "${slug}"`).toBeDefined();
        expect(route?.supported, `${spec.id} surfaces on unpublished "${slug}"`).toBe(true);
      }
    }
  });

  it('a spec surfaces only where its bands are actually reachable by that page', () => {
    /*
     * A page prefilled to 20 KB must not carry a spec whose every band has a
     * FLOOR above 20 KB — the user following the page's own default would
     * produce a file every listed portal rejects as too small. The spec may
     * exceed the page target upward (the tool accepts any target), but at
     * least one listed band must contain, or sit below, the page's target.
     */
    for (const spec of examSpecs) {
      for (const slug of spec.surfaceOn) {
        const route = getSizePresetRoute(slug);
        if (route === undefined) continue; // the resolver test above owns this failure
        const targetKB = route.targetBytes / 1000;
        const reachable = spec.requirements.some((r) => (r.minKB ?? 0) <= targetKB);
        expect(reachable, `${spec.id} on ${slug}: every band's floor exceeds ${targetKB} KB`).toBe(
          true,
        );
      }
    }
  });

  it('the SSC entry preserves its live-photo caveat', () => {
    // The single most valuable fact in the dataset: SSC no longer accepts an
    // uploaded photo, which makes competitor "compress your photo for SSC"
    // advice wrong. If someone edits it away, this is the alarm.
    const ssc = examSpecs.find((s) => s.id === 'ssc-cgl');
    expect(ssc?.caveat).toMatch(/live/i);
    expect(ssc?.requirements.every((r) => r.kind !== 'photo')).toBe(true);
  });

  it('examSpecsForRoute returns specs in data order and only matches', () => {
    const specs = examSpecsForRoute('signature-to-20kb');
    // ssc-gd joined in D-125 (GD pre-work, Cowork D4).
    expect(specs.map((s) => s.id)).toEqual(['ssc-cgl', 'ssc-gd', 'ibps']);
    expect(examSpecsForRoute('jpg-to-1mb')).toEqual([]);
  });

  it('the GD page carries the GD spec, and GD stays photo-free (D-125)', () => {
    const specs = examSpecsForRoute('ssc-gd-photo-signature');
    expect(specs.map((s) => s.id)).toContain('ssc-gd');
    const gd = specs.find((s) => s.id === 'ssc-gd');
    // The page's whole premise: no photo upload exists for GD. If a photo
    // requirement is ever added to this entry without the notice saying so,
    // the page's headline becomes a lie — fail here first.
    expect(gd?.requirements.every((r) => r.kind !== 'photo')).toBe(true);
    expect(gd?.caveat).toMatch(/live/i);
  });
});
