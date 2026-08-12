/**
 * tests/unit/presets.test.ts
 *
 * The size-preset route DATA, validated the way the query index validates its
 * entries: anything a page will render a link from must resolve to a route that
 * actually builds (docs/12 D-79, D-113).
 *
 * [preset].astro already renders nothing for a dangling chain, so without this
 * file a typo in a chain slug would not break the build — it would silently
 * remove the feature from one route, which is the harder failure to notice.
 */
import { describe, it, expect } from 'vitest';
import {
  sizePresetRoutes,
  publishedSizePresetRoutes,
  getSizePresetRoute,
} from '../../src/content/presets';

describe('size preset chains (docs/12 D-113)', () => {
  it('every chain points at a PUBLISHED route', () => {
    for (const route of sizePresetRoutes) {
      if (route.chain === undefined) continue;
      const target = getSizePresetRoute(route.chain.slug);
      expect(target, `${route.slug} chains to "${route.chain.slug}"`).toBeDefined();
      expect(target?.supported, `${route.slug} chains to unpublished "${route.chain.slug}"`).toBe(
        true,
      );
    }
  });

  it('no route chains to itself', () => {
    for (const route of sizePresetRoutes) {
      if (route.chain === undefined) continue;
      expect(route.chain.slug, route.slug).not.toBe(route.slug);
    }
  });

  it('chains carry a reason, because the link is rendered with one', () => {
    for (const route of sizePresetRoutes) {
      if (route.chain === undefined) continue;
      expect(route.chain.reason.trim().length, route.slug).toBeGreaterThan(0);
    }
  });

  it('the generic byte-target routes stay unchained', () => {
    /*
     * Deliberate, not an omission: "compress to 100 KB" has no knowable next
     * step, and a chain there would be cross-promotion wearing a suggestion's
     * clothes. If a generic route ever earns a chain, this list is the prompt
     * to argue it in docs/12 first.
     */
    for (const slug of ['jpg-to-20kb', 'jpg-to-50kb', 'jpg-to-100kb', 'jpg-to-200kb', 'jpg-to-500kb', 'jpg-to-1mb']) {
      expect(getSizePresetRoute(slug)?.chain, slug).toBeUndefined();
    }
  });

  it('the three form routes are chained the way the forms require', () => {
    // The feature exists for these three. If someone deletes the data, this is
    // the test that says so, rather than a silent disappearance from the UI.
    expect(getSizePresetRoute('signature-to-20kb')?.chain?.slug).toBe('passport-photo-to-50kb');
    expect(getSizePresetRoute('passport-photo-to-50kb')?.chain?.slug).toBe('signature-to-20kb');
    expect(getSizePresetRoute('pan-card-photo')?.chain?.slug).toBe('signature-to-20kb');
  });

  it('every relatedSlug on a preset route resolves in the size-preset table', () => {
    /*
     * RelatedTools DROPS what it cannot resolve, by design — which is exactly
     * why this must be asserted here. The drop hid a real defect for months:
     * preset relatedSlugs were resolved against the FORMAT-PAIR table, none
     * matched, and all nine /compress/* pages shipped with zero links to their
     * siblings (verified in the built HTML, docs/12 D-113). Silence in the
     * renderer needs noise in the tests.
     */
    for (const route of publishedSizePresetRoutes) {
      for (const slug of route.relatedSlugs) {
        const target = getSizePresetRoute(slug);
        expect(target, `${route.slug} relates to "${slug}"`).toBeDefined();
        expect(target?.supported, `${route.slug} relates to unpublished "${slug}"`).toBe(true);
      }
    }
  });
});
