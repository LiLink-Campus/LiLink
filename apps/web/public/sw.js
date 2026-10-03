// LiLink PWA service worker: minimal offline fallback + installability.
// Bump CACHE when offline assets change.
const CACHE = "lilink-pwa-v8-versioned-icons";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon.f5a80339b9af.svg", "/icons/icon-maskable.97324e30979e.svg"];

async function offlineAsset(asset) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(asset, {
      mode: "same-origin", credentials: "omit", signal: controller.signal, redirect: "error",
    });
    if (!response.ok || response.type === "opaque") throw new Error("Offline asset unavailable");
    // Read the body within the deadline; cache.put must not wait on a stalled stream.
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return [asset, new Response(body, { status: response.status, headers })];
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Failed precaching leaves an older worker active with its complete offline assets.
    const assets = await Promise.all(PRECACHE.map(offlineAsset));
    const cache = await caches.open(CACHE);
    await Promise.all(assets.map(([key, response]) => cache.put(key, response)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("lilink-pwa-") && key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
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
      fetch(request).catch(() => caches.match(OFFLINE_URL, { cacheName: CACHE })
        .then((res) => res ?? Response.error()))
    );
    return;
  }

  // Static icons: cache-first. Only successful responses are cached so a
  // transient 404/error is not persisted until the cache version is bumped.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request, { cacheName: CACHE }).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return res;
          })
      )
    );
  }
});
