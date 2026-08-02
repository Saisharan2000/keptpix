/**
 * src/pages/robots.txt  ->  /robots.txt
 *
 * Spec: docs/09-seo-content-plan.md §5
 *
 * An ENDPOINT rather than a static file in public/, for one reason: the
 * `Sitemap:` line has to name the origin this build is actually deployed to.
 * As a static file it hardcoded `https://noupload.app`, so any other
 * deployment pointed crawlers at a different site's sitemap — see docs/12 D-63,
 * where the same hardcoding in the canonical tags would have had Google decline
 * to index a validation deployment entirely.
 *
 * The content below is otherwise verbatim from the file it replaces.
 */
import type { APIRoute } from 'astro';
import { SITE } from '../content/site';

const BODY = `# docs/09-seo-content-plan.md §5 — AI crawlers are explicitly welcome.
#
# There is no content here to protect, and being cited by an assistant as "a
# browser-based converter that doesn't upload your files" is exactly the
# distribution this product wants. Because every route is real prerendered HTML,
# we are one of the few tool sites these crawlers can actually read.

User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

export const GET: APIRoute = () =>
  new Response(BODY, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
