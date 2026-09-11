/**
 * MELTDOWN service worker (Stage 45).
 *
 * Three rules, and the third is the one that matters:
 *
 *   1. Navigations are network-first. A player always gets the newest build when they have a
 *      connection; the cached shell is only what they get without one.
 *   2. Same-origin static files under /assets and /icons are served from cache while a fresh copy
 *      is fetched behind them. Vite hashes its bundles, so a stale hit is a byte-identical hit; the
 *      art assets under /assets are hash-checked by lint:assets before they ship.
 *   3. Nothing else is touched. Not the Workers hosts, not the chain RPC, not a WebSocket, not a
 *      POST. The game's money and its match state never pass through this file, and a request to
 *      another origin is not this worker's business.
 */
const SHELL = "meltdown-shell-v1";
const RUNTIME = "meltdown-runtime-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.get("upgrade") === "websocket") return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const hit = await c.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit ?? refresh;
      }),
    );
  }
});
