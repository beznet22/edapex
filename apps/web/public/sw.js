const CACHE_NAME = "edapex-workspace-v2";
const OFFLINE_URL = "/workspace/offline";

/**
 * The install set is deliberately tiny: the offline shell and the icons the
 * manifest promises. Everything else is cached on first use, so a cache version
 * bump does not force a re-download of the app bundle.
 */
const PRECACHE = [
  OFFLINE_URL,
  "/workspace/icons/icon-192.png",
  "/workspace/icons/icon-512.png",
  "/workspace/icons/maskable-512.png",
  "/workspace/icons/apple-touch-icon.png",
  "/favicon.svg"
];

/**
 * Paths that must never enter the cache.
 *
 * The agent runtime and the API carry transcripts, school records and tokens.
 * Storing any of them would leave school data on a shared device and survive a
 * sign-out. The shell is the only thing this worker is allowed to keep.
 */
const NEVER_CACHE = [
  "/api/",
  "/agent-runtime/",
  // Retained deliberately: these paths no longer exist, but a client that cached
  // the old runtime must never serve it from a stale entry.
  "/xcodex/",
  "/xrouter-browser/"
];

const isCacheable = (url, request) => {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix))) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return false;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // A single missing file must not fail the install: the shell is useful
      // even if one optional icon is absent.
      .then((cache) =>
        Promise.all(PRECACHE.map((path) => cache.add(path).catch(() => undefined)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/workspace")) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ??
            new Response("EdApex Work is offline.", {
              headers: { "content-type": "text/plain; charset=utf-8" },
              status: 503
            })
        )
      )
    );
  }
});

// Exported logic is unreachable at runtime but keeps the policy testable.
self.__edapexServiceWorkerPolicy = { isCacheable, NEVER_CACHE, PRECACHE };
