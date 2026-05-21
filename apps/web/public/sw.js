// LiLink PWA service worker: minimal offline fallback + installability.
// Bump CACHE when offline assets change.
const CACHE = "lilink-pwa-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  // Static icons: cache-first. Only successful basic responses are cached so a
  // transient 404/error is not persisted until the cache version is bumped.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(
                caches.open(CACHE).then((cache) => cache.put(request, copy)),
              );
            }
            return res;
          }),
      ),
    );
  }
});
