// Service worker: shows push notifications and opens the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Fonts, sounds and icons never change, so they come from the phone's cache after the first visit (faster, no flicker).
// Everything else (the app itself, data) always comes fresh from the network.
const ASSETS = "swish-assets-v1";
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin || !/\/(fonts|sounds|icons)\//.test(u.pathname)) return;
  e.respondWith(caches.open(ASSETS).then(async (c) => {
    const hit = await c.match(e.request); if (hit) return hit;
    const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res;
  }));
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Swish", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "Swish", {
    body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  const appUrl = new URL("./", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (url.startsWith(appUrl) || url === "./") {
      const w = wins.find((c) => c.url.startsWith(appUrl));
      const hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
      if (w) { await w.focus(); if (hash) w.postMessage({ openHash: hash }); return; }
      return self.clients.openWindow(hash ? appUrl + hash : appUrl);
    }
    return self.clients.openWindow(url);
  })());
});
