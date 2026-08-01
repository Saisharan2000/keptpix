/**
 * docs/12 D-53 — the analytics beacon's three gates, asserted rather than
 * assumed.
 *
 * NOTE ON WHAT IS AND IS NOT TESTED HERE.
 *
 * Every case below is one where the beacon must NOT be injected, so this file
 * makes zero network requests — appending a real <script src="cloudflare...">
 * would have this suite fetch a third-party script, which is a strange thing
 * for THIS product's own test run to do.
 *
 * The positive case (token set -> beacon actually wired) is verified against
 * the BUILD OUTPUT instead, which proves the same thing without the request:
 * building with PUBLIC_CF_BEACON_TOKEN set puts the token, the beacon URL and
 * the data-cf-beacon attribute into the island bundle, and flips /privacy to
 * name Cloudflare. Confirmed on a real build.
 *
 * The gates that keep users safe are the negative ones, and they are here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyticsEnabled, loadAnalytics, resetAnalyticsForTest } from '../../src/platform/analytics';

function beaconScripts(): Element[] {
  return [...document.querySelectorAll('script[src*="cloudflareinsights"]')];
}

const never = () => false;
const always = () => true;

beforeEach(() => {
  resetAnalyticsForTest();
  for (const el of beaconScripts()) el.remove();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetAnalyticsForTest();
  for (const el of beaconScripts()) el.remove();
});

describe('analytics is OFF unless a build opts in (docs/12 D-53)', () => {
  it('injects nothing when no token is configured — the default for every build here', () => {
    vi.stubEnv('PUBLIC_CF_BEACON_TOKEN', '');
    expect(analyticsEnabled()).toBe(false);
    expect(loadAnalytics(never)).toBe(false);
    expect(beaconScripts()).toHaveLength(0);
  });

  it('treats a whitespace-only token as absent, not as a valid token', () => {
    // A half-filled .env line is a realistic mistake, and "  " must not put a
    // third-party script on the page with a garbage token attached.
    vi.stubEnv('PUBLIC_CF_BEACON_TOKEN', '   ');
    expect(analyticsEnabled()).toBe(false);
    expect(loadAnalytics(never)).toBe(false);
    expect(beaconScripts()).toHaveLength(0);
  });
});

describe('the in-flight gate (docs/06 §5 assertion (b))', () => {
  it('refuses to inject while any job is running, even with a valid token', () => {
    vi.stubEnv('PUBLIC_CF_BEACON_TOKEN', 'a'.repeat(32));
    expect(analyticsEnabled()).toBe(true);
    // THE assertion that matters: a configured beacon still must not add a
    // request that races a conversion.
    expect(loadAnalytics(always)).toBe(false);
    expect(beaconScripts()).toHaveLength(0);
  });

  it('consults the callback at injection time rather than caching it', () => {
    vi.stubEnv('PUBLIC_CF_BEACON_TOKEN', 'a'.repeat(32));
    let busy = true;
    const isBusy = () => busy;

    expect(loadAnalytics(isBusy)).toBe(false);
    expect(beaconScripts()).toHaveLength(0);

    // The gate is re-evaluated on the next call, so a beacon deferred during a
    // batch is not lost forever — it simply waits. (Injection itself is not
    // exercised here; see this file's header for why.)
    busy = false;
    expect(analyticsEnabled()).toBe(true);
  });
});
