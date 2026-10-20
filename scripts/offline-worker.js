/* Public resources only. Generated with the exact build asset list after next build. */
const BUILD_ID = "__IRON_BUILD_ID__";
const ASSETS = /*__IRON_ASSETS__*/ [];
const CACHE = `iron-strength-ui:${BUILD_ID}`;
const ALLOWED = new Set(ASSETS);
async function ready() {
  const cache = await caches.open(CACHE);
  const entries = await Promise.all(ASSETS.map((path) => cache.match(path)));
  return entries.every(Boolean);
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(
          ASSETS.map((path) => new Request(path, { credentials: "omit", cache: "reload" })),
        );
        if (!(await ready())) throw new Error("Incomplete interface");
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      // No skipWaiting: existing clients keep their current interface.
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  if (!["OFFLINE_READY", "OFFLINE_PREPARE"].includes(event.data?.type)) return;
  event.waitUntil(
    (async () => {
      try {
        if (event.data.type === "OFFLINE_PREPARE" && !(await ready())) {
          const cache = await caches.open(CACHE);
          await cache.addAll(
            ASSETS.map((path) => new Request(path, { credentials: "omit", cache: "reload" })),
          );
        }
        event.ports[0]?.postMessage({ ready: await ready(), buildId: BUILD_ID });
      } catch {
        event.ports[0]?.postMessage({ ready: false, buildId: BUILD_ID });
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.search && ALLOWED.has(url.pathname)) {
    event.respondWith(
      (async () => (await (await caches.open(CACHE)).match(url.pathname)) || fetch(request))(),
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await (await caches.open(CACHE)).match("/offline")) || Response.error();
        }
      })(),
    );
  }
});
