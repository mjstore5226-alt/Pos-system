// Only the reconnect screen is cached. Sales, stock, receipts, and API writes always use the server.
const CACHE = "grain-reconnect-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add("/offline.html"))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("grain-reconnect-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.mode !== "navigate" ||
    new URL(event.request.url).origin !== self.location.origin ||
    new URL(event.request.url).pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request).catch(
      async () =>
        (await caches.match("/offline.html")) ||
        new Response("Reconnect to your POS server and reload.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    ),
  );
});
