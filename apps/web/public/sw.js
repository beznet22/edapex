const CACHE_NAME = "edapex-workspace-v1";
const OFFLINE_URL = "/workspace/offline";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/workspace/icons/icon-192.png",
  "/workspace/icons/icon-512.png",
  "/workspace/icons/maskable-512.png",
  "/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
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

  // API and auth responses are never cached. Workspace data stays network-only.
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
