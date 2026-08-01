/**
 * src/platform/analytics.ts
 *
 * Spec: docs/07-folder-structure.md §3, docs/10-build-plan.md M8
 *
 * Cloudflare Web Analytics pageview beacons ONLY. Never file data, never a
 * request body, never anything derived from what the user converted.
 *
 * THREE HARD RULES, all enforced here rather than at the call site:
 *
 *  1. OFF unless PUBLIC_CF_BEACON_TOKEN is set at build time. A default build
 *     — which is what dev, CI and every test runs — injects nothing and makes
 *     zero third-party requests. This is what keeps the privacy page's "every
 *     asset this site loads is served from this domain" literally true for the
 *     artefact anyone can actually inspect, and keeps privacy.spec.ts's
 *     same-origin assertion a real assertion rather than one with a hole in it.
 *  2. Loaded only AFTER the island has mounted, and never while a job is in
 *     flight — the caller passes the in-flight check and it is consulted at
 *     injection time, not cached.
 *  3. Injected at most once per page. The beacon sends a single pageview on
 *     load; re-injecting would double-count and add requests for nothing.
 *
 * docs/04 §1's asset-origin policy is a deliberate, documented exception here
 * and ONLY here — see docs/12 D-53.
 */

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

/** Origin the beacon is fetched from, exported so the privacy test's allowlist
 *  and this module can never drift apart. */
export const ANALYTICS_ORIGIN = 'https://static.cloudflareinsights.com';

/**
 * Set at BUILD time (Astro exposes PUBLIC_*-prefixed vars to client code).
 * Absent in dev, CI and any build that does not deliberately opt in.
 */
function beaconToken(): string | null {
  const raw = (import.meta.env as Record<string, unknown>)['PUBLIC_CF_BEACON_TOKEN'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export function analyticsEnabled(): boolean {
  return beaconToken() !== null;
}

let injected = false;

/**
 * Inject the beacon, if and only if all three rules above allow it.
 *
 * @param isJobInFlight consulted at call time — analytics must never add a
 *   request that races a conversion (docs/06 §5 assertion (b)).
 * @returns true only if a script element was actually added.
 */
export function loadAnalytics(isJobInFlight: () => boolean): boolean {
  if (injected) return false;
  if (typeof document === 'undefined') return false;

  const token = beaconToken();
  if (token === null) return false;
  if (isJobInFlight()) return false;

  injected = true;
  const script = document.createElement('script');
  script.src = BEACON_SRC;
  script.defer = true;
  // Cloudflare's documented configuration hook. Only the token — no user
  // identifier, no custom properties, nothing about the files.
  script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
  document.head.appendChild(script);
  return true;
}

/** Test-only: lets a suite assert the once-per-page guard from a clean slate. */
export function resetAnalyticsForTest(): void {
  injected = false;
}
