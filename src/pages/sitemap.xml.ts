/**
 * src/pages/sitemap.xml.ts  ->  /sitemap.xml
 *
 * Spec: docs/09-seo-content-plan.md §5
 *
 * Hand-rolled rather than @astrojs/sitemap so the `supported` hard gate in
 * docs/05 §5 applies here too: a route we cannot actually perform is never
 * listed, never prerendered, and never submitted. Listing a route that 404s or
 * cannot do its job is precisely the doorway behaviour docs/09 §1.2 describes.
 */
import type { APIRoute } from 'astro';
import { SITE as SITE_URL } from '../content/site';
import { publishedFormatPairRoutes } from '../content/formats';
import { publishedResizePresetRoutes, publishedSizePresetRoutes } from '../content/presets';
import { publishedTools } from '../core/tools';

// Single source of truth — see src/core/site.ts (docs/12 D-63).
const SITE = SITE_URL;

interface Entry {
  path: string;
  priority: string;
}

/** Static routes that always exist. /404 is deliberately excluded. */
const STATIC_ENTRIES: Entry[] = [
  { path: '/', priority: '1.0' },
  { path: '/convert', priority: '0.8' },
  { path: '/compress', priority: '0.8' },
  { path: '/resize', priority: '0.8' },
  { path: '/metadata', priority: '0.8' },
  // The hub that links every route one click from one page. Higher than the
  // other content pages because it is how a crawler reaches the long tail.
  { path: '/all-tools', priority: '0.7' },
  { path: '/how-it-works', priority: '0.7' },
  { path: '/privacy', priority: '0.5' },
  { path: '/about', priority: '0.5' },
  // Comparison pages are search entry points, not footnotes — the whole point
  // of /keptpix-vs-ilovepdf is to be found (docs/12 D-123).
  { path: '/keptpix-vs-ilovepdf', priority: '0.7' },
];

export const GET: APIRoute = () => {
  const entries: Entry[] = [
    ...STATIC_ENTRIES,
    ...publishedFormatPairRoutes.map((r) => ({
      path: '/convert/' + r.slug,
      priority: r.tier === 'star' ? '0.9' : '0.6',
    })),
    ...publishedResizePresetRoutes.map((r) => ({
      path: '/resize/' + r.slug,
      priority: '0.9',
    })),
    ...publishedSizePresetRoutes.map((r) => ({
      path: '/compress/' + r.slug,
      priority: '0.9',
    })),
    // `publishedTools` has the `supported` gate already applied, so a tool
    // whose engine is not built yet is absent here for the same reason it has
    // no page: submitting a route we cannot perform is the doorway behaviour
    // docs/09 §1.2 forbids. Empty until the first engine ships.
    ...publishedTools.map((t) => ({ path: t.slug, priority: '0.9' })),
  ];

  const lastmod = new Date().toISOString().slice(0, 10);

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries
      .map(
        (e) =>
          '<url>' +
          '<loc>' + SITE + (e.path === '/' ? '/' : e.path) + '</loc>' +
          '<lastmod>' + lastmod + '</lastmod>' +
          '<priority>' + e.priority + '</priority>' +
          '</url>',
      )
      .join('') +
    '</urlset>';

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
