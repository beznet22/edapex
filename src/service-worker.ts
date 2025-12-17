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
const ASSETS = [...build, ...files];

// Install the service worker
self.addEventListener("install", (event) => {
  async function install() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
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
