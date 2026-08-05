/**
 * public/sw.ts
 *
 * Spec: docs/10-build-plan.md Milestone 8
 * Implemented in: Milestone 8
 *
 * Service worker: precache the app shell, cache WASM codecs on first use.
 * Full offline capability after first visit.
 *
 * It may cache same-origin static assets and NOTHING else. It must never
 * observe, buffer, or forward a user's file bytes. Every check below exists
 * to keep that true even as this file grows: GET-only, same-origin-only.
 *
 * __PRECACHE_VERSION__ and __PRECACHE_URLS__ are not real identifiers — they
 * are placeholder tokens scripts/build-sw.mjs replaces with this build's real
 * values AFTER esbuild transpiles this file. That is deliberate, not a
 * shortcut: a service worker only re-runs `install` when its OWN script
 * bytes change, so the manifest must be baked directly into this file's
 * text, not fetched separately at install time — a separate JSON fetch would
 * leave the browser with no way to ever notice a new deploy happened.
 */

// tsconfig.json's `lib` includes both DOM and WebWorker for the rest of the
// project (image.worker.ts needs DOM types like OffscreenCanvas from a
// dedicated-worker context), which makes the ambient `self` resolve to
// `Window`. ServiceWorkerGlobalScope's interface exists in lib.dom.d.ts
// regardless, it is just not what `self` is typed as by default — this
// override is the standard, narrow fix, scoped to this one file only.
declare const self: ServiceWorkerGlobalScope;

declare const __PRECACHE_VERSION__: string;
declare const __PRECACHE_URLS__: string[];

const VERSION = __PRECACHE_VERSION__;
const PRECACHE_URLS = __PRECACHE_URLS__;

const SHELL_CACHE = 'keptpix-shell-' + VERSION;
const RUNTIME_CACHE = 'keptpix-runtime-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Sequential, not Promise.all(urls.map(...)): firing every precache
      // fetch at once silently lost the tail of the list in testing — 19 of
      // 27 URLs cached, always the same first 19, though every URL fetches
      // fine on its own (docs/12 D-52). One request at a time costs a little
      // background time for a step that already runs off the critical path,
      // in exchange for actually finishing. addAll() has the same all-at-once
      // shape and would not have fixed it either.
      for (const url of PRECACHE_URLS) {
        await cache.add(url).catch(() => undefined);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      /**
       * Delete stale shell caches under the CURRENT prefix, and every cache
       * left behind by the pre-rebrand `noupload-*` naming (docs/12 D-64).
       *
       * Without the legacy prefix, anyone who visited before the rename keeps
       * an orphaned `noupload-shell-<hash>` cache forever: the filter would no
       * longer match it, so nothing would ever evict it. That is a few MB of
       * dead storage on a stranger's device, invisible and unreachable — and
       * exactly the kind of litter a privacy-first tool should not leave.
       *
       * The legacy sweep is unconditional and cheap: `caches.keys()` is already
       * being read, and on the overwhelming majority of devices it matches
       * nothing. It can be removed once the old deployment is long gone.
       */
      const LEGACY_PREFIXES = ['noupload-shell-', 'noupload-runtime-'];
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith('keptpix-shell-') && name !== SHELL_CACHE) ||
              LEGACY_PREFIXES.some((prefix) => name.startsWith(prefix)),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Non-GET (this app issues none same-origin, but a real SW must still be
  // explicit) and cross-origin requests are never intercepted — they reach
  // the network exactly as if this service worker did not exist.
  if (request.method !== 'GET' || !isSameOrigin(request.url)) return;

  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    (async () => {
      const cache = await caches.open(isNavigation ? SHELL_CACHE : RUNTIME_CACHE);
      const cached = await cache.match(request);

      if (isNavigation) {
        // Shell pages: cache-first for instant offline load, refreshed in
        // the background so the NEXT visit gets whatever changed — never
        // this one, which is what "full offline capability" requires.
        if (cached !== undefined) {
          void fetch(request)
            .then((fresh) => cache.put(request, fresh))
            .catch(() => undefined);
          return cached;
        }
        try {
          const fresh = await fetch(request);
          await cache.put(request, fresh.clone());
          return fresh;
        } catch (cause) {
          const fallback = await caches.match('/');
          if (fallback !== undefined) return fallback;
          throw cause;
        }
      }

      // Everything else same-origin — including WASM codecs and their glue
      // JS — is cached on FIRST USE, not precached: docs/10 M8's own wording,
      // and the reason PRECACHE_URLS never lists them (docs/12 D-52).
      if (cached !== undefined) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    })(),
  );
});

export {};
