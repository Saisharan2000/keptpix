import { TIP_URL, TIP_LABEL } from '../../content/site';

/**
 * The tip link, shown on success screens only (docs/12 D-116).
 *
 * ON SUCCESS, not on load: the ask arrives after the product delivered, which
 * is the one moment it reads as fair rather than as a toll. Callers gate on
 * their own completion state; this component only decides whether a link
 * exists at all.
 *
 * A plain anchor, deliberately. Razorpay offers an embed button, but that is a
 * third-party script — `script-src 'self'` forbids it, check-claims.mjs fails
 * the build over it, and the privacy page's promises depend on it never
 * happening. An `<a href>` costs nothing until clicked.
 *
 * Rendered OUTSIDE any `role="status"` region: a live region that suddenly
 * announces a payment link to a screen reader is a nag, and BatchSummary's
 * region is watched by tests that assert it contains no links.
 *
 * `noreferrer` so the payment host does not learn which tool the visitor was
 * using when they decided to tip.
 */
export function TipLink() {
  if (TIP_URL === '') return null;
  return (
    <p class="m-0 border-t border-border px-4 py-3 text-sm text-text-muted">
      Did this save you a form rejection?{' '}
      <a
        href={TIP_URL}
        rel="noopener noreferrer"
        target="_blank"
        class="font-medium text-accent underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {TIP_LABEL} →
      </a>
    </p>
  );
}
