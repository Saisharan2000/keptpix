/**
 * src/core/site.ts — the canonical origin, in exactly one place.
 *
 * Read at BUILD time from `SITE_URL`, defaulting to production.
 *
 * WHY THIS IS CONFIGURABLE, and why it was nearly a silent disaster:
 *
 * The origin was hardcoded (as `https://noupload.app`, the pre-rebrand domain)
 * in four separate files —
 * the Astro config, SeoHead's canonical, the sitemap, and robots.txt. Deploying
 * that build anywhere else (a `*.pages.dev` preview, a staging origin) produces
 * pages that each declare a canonical naming a DIFFERENT origin
 * — telling Google the real version lives at a domain that may not exist yet.
 *
 * Google honours that. The deployment would be crawled and then **declined for
 * indexing**, with no error anywhere: the site is up, every page 200s, and the
 * traffic simply never arrives. For a project whose entire growth model is
 * organic search, that is the most expensive kind of bug — one that looks
 * exactly like "SEO takes a while".
 *
 * Caught before the first deploy, while planning to validate on a pages.dev
 * subdomain (docs/12 D-63).
 *
 * Set it at build time:
 *   SITE_URL=https://keptpix.pages.dev npm run build
 *
 * Lives in content/ rather than core/ because docs/07 §2 grants `pages/` access
 * to content/ but not to core/, and both the sitemap and robots.txt endpoints
 * need this. Widening a layer boundary to place a single string was the worse
 * trade — and the origin genuinely is site content, alongside formats.ts and
 * presets.ts.
 */

/** No trailing slash — every consumer appends a path beginning with `/`. */
function normalise(raw: string): string {
  return raw.replace(/\/+$/, '');
}

export const PRODUCTION_SITE = 'https://keptpix.com';

/**
 * `import.meta.env` covers Astro components and anything Vite bundles;
 * `process.env` covers the Node-side build scripts. Checking both keeps this
 * usable from either context without a second constant drifting out of sync.
 */
function resolveSite(): string {
  const fromVite =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, unknown> | undefined)?.['SITE_URL']
      : undefined;
  if (typeof fromVite === 'string' && fromVite.trim().length > 0) {
    return normalise(fromVite.trim());
  }

  const fromNode =
    typeof process !== 'undefined' ? process.env?.['SITE_URL'] : undefined;
  if (typeof fromNode === 'string' && fromNode.trim().length > 0) {
    return normalise(fromNode.trim());
  }

  return PRODUCTION_SITE;
}

export const SITE = resolveSite();

/**
 * Where "buy me a coffee" points. Empty = the link renders nowhere.
 *
 * A PLAIN ANCHOR, never a vendor widget. Buy Me a Coffee and Ko-fi both ship a
 * button `<script>`; loading one would be a third-party script on every page,
 * which `script-src 'self'` forbids, `check-claims.mjs` fails on, and four of
 * privacy.spec.ts's five tests block release over. An `<a href>` loads nothing
 * until the user clicks it, so it costs zero bytes of island JS, needs no CSP
 * change, and cannot be the thing that falsifies the footer (docs/12 D-111).
 *
 * MUST NOT BE A UPI ID. A VPA is `name@bank` and Sai's carries his real name —
 * putting it here publishes personal information on all 32 pages, permanently,
 * to a public repo and its mirrors. `check-private.mjs` fails the build on any
 * `@` in this value, so the mistake cannot be made quietly. A payment page URL
 * is the indirection that keeps the identifier private.
 *
 * Set it, and the footer and success-screen links appear. Nothing else needs
 * touching.
 *
 * The live value is a Razorpay Payment Page (docs/12 D-116): individual
 * onboarding, native UPI in INR, and the page shows the brand name "Keptpix"
 * rather than the owner's legal name — verified by reading the live page as a
 * visitor. Chosen over Buy Me a Coffee (no India payouts, no UPI, USD-anchored
 * with a ~$3 floor) and Ko-fi (PayPal India stopped domestic payments in 2021,
 * and a personal PayPal shows the creator's legal name to supporters).
 */
// Annotated `string`, not the inferred literal: the consumers guard on
// `TIP_URL === ''` so the link can be turned off by emptying this line, and a
// literal type makes that guard a TS2367 the moment the value is non-empty.
export const TIP_URL: string = 'https://pages.razorpay.com/keptpix';

/**
 * Label for the tip link. Deliberately not a nag — no "please", no urgency —
 * and it matches the payment page's own title, so the click lands somewhere
 * that visibly agrees with what the link promised.
 */
export const TIP_LABEL = 'Support KeptPix';
