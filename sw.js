// Cache-first service worker. Bump CACHE when shipping changes so clients
// refetch the app shell (the ?v= query strings must match index.html).
const CACHE = "piano-drill-v2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=8",
  "./music.js?v=3",
  "./app.js?v=4",
  "./scales.js?v=5",
  "./manifest.json",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first with network fill-in, so the Google Fonts css/woff2 and the
// Bravura woff2 get cached on first online visit and work offline after.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => (e.request.mode === "navigate" ? caches.match("./index.html") : undefined))
    )
  );
});
