// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

declare const self: ServiceWorkerGlobalScope;

import { build, files, version } from "$service-worker";

const CACHE = `cache-${version}`;

/**
 * Filter `$service-worker`'s `files` array down to assets that are safe to
 * precache. SvelteKit includes every file under `static/` — including:
 *   - hidden dotfiles (e.g. `static/public/.gitignore`) which may 404 when
 *     served by the runtime
 *   - filenames with literal spaces (e.g. `static/artifact/image copy.png`)
 *     which `cache.addAll` may reject on some browsers
 *   - any other unservable artifact (e.g. scratch / temp data)
 *
 * We only precache the build's immutable JS/CSS chunks plus a small set of
 * PWA-critical static assets (icons, manifest, robots, logo). Everything
 * else falls through to the network-first fetch handler below.
 */
const PRECACHEABLE_FILE_PREFIXES = [
  "/apple-touch-icon",
  "/favicon",
  "/logo",
  "/manifest.json",
  "/maskable-icon",
  "/pwa-",
  "/robots.txt",
  "/school-logo"
];

const PRECACHED_FILES = files.filter((path) => {
  if (path.startsWith("/.")) return false;
  if (path.endsWith(".gitignore")) return false;
  if (path.includes(" ")) return false;
  return PRECACHEABLE_FILE_PREFIXES.some((prefix) => path.startsWith(prefix));
});

const ASSETS = [...build, ...PRECACHED_FILES];

// Install the service worker
self.addEventListener("install", (event) => {
  async function install() {
    const cache = await caches.open(CACHE);
    // Add each asset individually so a single 404 on a stale path doesn't
    // reject the whole batch (cache.addAll is all-or-nothing).
    await Promise.all(
      ASSETS.map(async (url) => {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn(`[service-worker] precache failed for ${url}:`, err);
        }
      })
    );
  }

  event.waitUntil(install());
});

// activate the service worker and remove old caches
self.addEventListener("activate", (event) => {
  async function activate() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
  }

  event.waitUntil(activate());
});

// fetch the resources from the cache
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  async function fetchResource(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const cache = await caches.open(CACHE);

    // Check if this is a static asset that should be cached
    if (ASSETS.includes(url.pathname)) {
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
    }

    // Don't cache API requests, they should always go to the network
    if (url.pathname.startsWith('/api/')) {
      return await fetch(request);
    }

    try {
      // fetch from network first
      const response = await fetch(request);
      if (!(response instanceof Response)) throw new Error("invalid response from fetch");

      // Only cache non-API responses that are successful
      const isNotExtension = url.protocol.startsWith('http'); // Check for web protocols (http/https)
      const isSuccess = response.status === 200;
      const isCacheable = !url.pathname.startsWith('/api/'); // Don't cache API routes

      if (isNotExtension && isSuccess && isCacheable) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      // then fallback to cache if network fails (only for non-API requests)
      if (!url.pathname.startsWith('/api/')) {
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
      }
    }

    return new Response("Not Found", { status: 404 });
  }

  event.respondWith(fetchResource(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
