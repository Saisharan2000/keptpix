/**
 * tests/e2e/privacy.spec.ts  ⭐
 *
 * Spec: docs/02-prd.md §7, docs/06-contracts.md §5, docs/04-architecture.md §1
 *
 * THE PRODUCT'S CORE CLAIM, EXPRESSED AS CODE. Failing this is a release
 * blocker, always — no exceptions, no overrides, no "just this once".
 *
 * Three assertions, from docs/06 §5:
 *   (a) zero requests with a non-empty request body — ever;
 *   (b) zero requests of ANY kind while a job is in flight;
 *   (c) every request origin is in an explicit allowlist.
 *
 * The v1.0 allowlist is `self` ONLY — every asset, including WASM codecs, is
 * bundled same-origin per docs/04 §1. Cloudflare Insights joins the ORIGIN list
 * in Milestone 8 and our R2 bucket in Phase 3. Both are additions to (c) only,
 * never to (a) and never to (b).
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { skipWithoutOffscreenCanvas } from './_capability';

const ROUTE = '/convert/heic-to-jpg';

/**
 * docs/04 §1 asset-origin policy. SAME-ORIGIN ONLY — no exceptions.
 *
 * An allowance for Cloudflare's beacon origin briefly lived here (D-53) and
 * has been removed: the analytics decision is edge-side page views with no
 * client script at all (D-56), so nothing third-party is expected to load and
 * an allowlist entry would only let a future beacon pass this assertion in
 * silence. Measuring page views at Cloudflare's edge needs no entry here,
 * which is much of why it won.
 */
function isAllowedOrigin(url: string, baseURL: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    return new URL(url).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
}

interface Captured {
  url: string;
  method: string;
  hasBody: boolean;
  resourceType: string;
  /**
   * True when the BROWSER refused to send this request — a Content-Security-
   * Policy block, or any other client-side refusal.
   *
   * This distinction is the whole point (docs/12 D-66). Playwright's `request`
   * event fires when a load is ATTEMPTED, before CSP has had its say, so a
   * request the browser then refuses looks identical to one that reached the
   * network. Those are completely different privacy facts: a refused request
   * transmits nothing at all — no bytes, no headers, no DNS lookup.
   *
   * Cloudflare injects an analytics beacon into every HTML response at the
   * edge; `script-src 'self'` refuses it. Counting that refusal as a leak would
   * make this suite unpassable on its own infrastructure while nothing was
   * actually being sent.
   */
  refusedByBrowser: boolean;
}

/**
 * Error texts meaning the BROWSER refused the load, rather than the network
 * failing it.
 *
 * `csp` is exact and exactly what Chromium reports through Playwright — NOT
 * `net::ERR_BLOCKED_BY_CSP`, which is what this first matched and which never
 * fires. The symptom was a genuinely blocked beacon being counted as sent,
 * i.e. a false FAILURE of the privacy gate. Verified against production by
 * printing `request.failure()?.errorText` directly (docs/12 D-66).
 */
const CLIENT_REFUSAL = /^(csp|blockedbyclient|blockedbyresponse)$|BLOCKED_BY_(CSP|CLIENT|RESPONSE)/i;

function capture(page: Page, sink: Captured[]): void {
  page.on('request', (request: Request) => {
    const data = request.postData();
    sink.push({
      url: request.url(),
      method: request.method(),
      hasBody: data !== null && data.length > 0,
      resourceType: request.resourceType(),
      refusedByBrowser: false,
    });
  });

  // Settled afterwards: mark anything the browser refused outright, so the
  // assertions below can tell "never left the machine" from "was sent".
  page.on('requestfailed', (request: Request) => {
    if (!CLIENT_REFUSAL.test(request.failure()?.errorText ?? '')) return;
    const entry = sink.find((e) => e.url === request.url() && !e.refusedByBrowser);
    if (entry !== undefined) entry.refusedByBrowser = true;
  });
}

/** Requests that actually reached the network. */
const sent = (requests: Captured[]): Captured[] =>
  requests.filter((r) => !r.refusedByBrowser);

/**
 * Drop N generated JPEGs onto the real file input.
 *
 * Generated in-page rather than committed as fixtures: no binary in the repo,
 * and the bytes are identical on every run.
 */
async function addImages(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n: number) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    if (input === null) throw new Error('file input not found');

    const transfer = new DataTransfer();
    for (let i = 0; i < n; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.fillStyle = 'hsl(' + ((i * 61) % 360) + ' 70% 50%)';
      ctx.fillRect(0, 0, 640, 480);
      for (let j = 0; j < 40; j += 1) {
        ctx.fillStyle = 'rgba(' + ((j * 31) % 255) + ',' + ((j * 77) % 255) + ',90,0.6)';
        ctx.fillRect((j * 37) % 640, (j * 53) % 480, 60, 60);
      }
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });
      if (blob === null) throw new Error('toBlob failed');
      transfer.items.add(new File([blob], 'photo-' + i + '.jpg', { type: 'image/jpeg' }));
    }

    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, count);
}

const convertButton = (page: Page) => page.getByRole('button', { name: /^Convert \d+ files?$/ });

async function runConversion(page: Page): Promise<void> {
  await convertButton(page).click();
  // "N done" in the live batch summary is the honest completion signal.
  await expect(page.getByRole('status').first()).toContainText(/[1-9]\d* done/, {
    timeout: 60_000,
  });
}

/**
 * Wait for the island to actually HYDRATE, not merely to be in the DOM.
 *
 * ToolShell is server-rendered, so the file input exists in the raw HTML long
 * before any listener is attached — waiting on the element alone silently
 * sets files that nothing is listening for. Astro drops the `ssr` attribute
 * from <astro-island> once hydration completes, which is the real signal.
 */
async function ready(page: Page): Promise<void> {
  await page.goto(ROUTE);
  // docs/12 D-55: no OffscreenCanvas means the converter UI never renders.
  await skipWithoutOffscreenCanvas(page);
  await page.locator('#tool').scrollIntoViewIfNeeded(); // client:visible
  await page.waitForSelector('astro-island:not([ssr])', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('input[type="file"][accept="image/*"]') !== null, null, {
    timeout: 30_000,
  });
}

test.describe('privacy — nothing is ever uploaded', () => {
  test('a full conversion sends zero bytes anywhere', async ({ page, baseURL }) => {
    const requests: Captured[] = [];
    capture(page, requests);

    await ready(page);
    await addImages(page, 5);
    await expect(convertButton(page)).toBeVisible();
    await runConversion(page);

    /**
     * Sit still and keep listening before asserting.
     *
     * This is not padding. Third-party telemetry is characteristically LATE —
     * measured with a real Cloudflare Web Analytics token, the beacon script
     * loads on mount but its POST does not leave for roughly five seconds,
     * while this test's own work finishes in about three. Without this wait
     * the suite reported a clean pass over a build that was, seconds later,
     * sending a 933-byte POST to a third-party origin (docs/12 D-56).
     *
     * A "nothing was sent" assertion can only ever be as strong as the window
     * it watches, so the window has to outlast the thing it is looking for.
     */
    await page.waitForTimeout(7_000);

    expect(requests.length).toBeGreaterThan(0); // the page itself loaded

    // ── (a) zero requests carrying a body, ever ────────────────────────
    const withBody = requests.filter((r) => r.hasBody);
    expect(withBody, 'requests carrying a body: ' + JSON.stringify(withBody, null, 2)).toEqual([]);

    // Nothing that could carry one, either.
    const mutating = requests.filter((r) => !['GET', 'HEAD'].includes(r.method));
    expect(mutating, 'non-GET requests: ' + JSON.stringify(mutating)).toEqual([]);

    // ── (c) every origin in the allowlist — v1.0 is `self` only ────────
    //
    // Scoped to requests that were actually SENT. Cloudflare injects its
    // analytics beacon at the edge and the CSP refuses it (docs/12 D-66); a
    // refused load transmits nothing, so counting it here would fail the suite
    // over a leak that did not happen.
    const foreignSent = sent(requests).filter((r) => !isAllowedOrigin(r.url, baseURL ?? ''));
    expect(foreignSent, 'cross-origin requests SENT: ' + JSON.stringify(foreignSent)).toEqual([]);

    // And prove the refusal is real rather than assumed: any foreign-origin
    // load that WAS attempted must have been blocked by the browser. This turns
    // the edge injection from noise into a positive assertion that the CSP is
    // doing its job — if Cloudflare stops injecting, this list is simply empty.
    const foreignAttempted = requests.filter((r) => !isAllowedOrigin(r.url, baseURL ?? ''));
    for (const attempt of foreignAttempted) {
      expect(
        attempt.refusedByBrowser,
        'foreign-origin request was NOT blocked: ' + JSON.stringify(attempt),
      ).toBe(true);
    }
  });

  test('zero requests of ANY kind while a job is in flight', async ({ page }) => {
    await ready(page);

    // Warm the pool with one conversion first. The worker script and any codec
    // are same-origin static assets fetched on first use (docs/04 §1); doing
    // that outside the measured window lets the in-flight rule stay ABSOLUTE
    // rather than carving out an asset exception that could hide a real leak.
    await addImages(page, 1);
    await runConversion(page);

    const during: Captured[] = [];
    capture(page, during);

    await addImages(page, 5);
    await runConversion(page);

    /**
     * `blob:` and `data:` are excluded, and the distinction is the whole point
     * rather than a loosening.
     *
     * A blob: URL is a handle into this document's own memory — it is how the
     * FileCard shows the user their own thumbnail. It CANNOT reach the network
     * by construction; there is no origin to send it to and no socket involved.
     * Playwright surfaces it through the same resource pipeline as a real
     * fetch, which is why it shows up here at all.
     *
     * Everything that could actually carry bytes off the device is still
     * asserted to be zero.
     */
    const networkDuring = during.filter(
      (r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:'),
    );

    expect(
      networkDuring,
      'NETWORK requests observed while jobs were running: ' + JSON.stringify(networkDuring, null, 2),
    ).toEqual([]);

    // And nothing in the window carried a body, blob URLs included.
    expect(during.filter((r) => r.hasBody)).toEqual([]);
    expect(during.filter((r) => !['GET', 'HEAD'].includes(r.method))).toEqual([]);
  });

  test('conversion still works with the network cut', async ({ page, context }) => {
    await ready(page);

    // Warm the worker, then go offline entirely.
    await addImages(page, 1);
    await runConversion(page);
    await context.setOffline(true);

    try {
      await addImages(page, 3);
      await runConversion(page);
      // Converting with no network at all is the strongest possible
      // demonstration that nothing is being sent anywhere.
      await expect(page.getByRole('status').first()).toContainText(/[1-9]\d* done/);
    } finally {
      // Tolerant on purpose: when the test above fails or times out, the
      // context may already be tearing down, and a throw here replaces the
      // real failure with a confusing "Target page, context or browser has
      // been closed" — which is what CI reported instead of the actual cause.
      await context.setOffline(false).catch(() => undefined);
    }
  });

  test('no beacon fires on unload', async ({ page, baseURL }) => {
    const requests: Captured[] = [];
    capture(page, requests);

    await ready(page);
    await addImages(page, 2);
    await runConversion(page);

    const before = requests.length;
    await page.goto('about:blank');
    await page.waitForTimeout(500);

    const onUnload = sent(requests.slice(before)).filter((r) => !r.url.startsWith('about:'));
    expect(onUnload, 'requests SENT on unload: ' + JSON.stringify(onUnload)).toEqual([]);
    // Body and origin checks stay absolute — but again over what was sent, not
    // over loads the browser refused (docs/12 D-66).
    expect(sent(requests).every((r) => !r.hasBody)).toBe(true);
    expect(sent(requests).filter((r) => !isAllowedOrigin(r.url, baseURL ?? '')).length).toBe(0);
  });
});
