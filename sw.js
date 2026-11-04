// Service worker: shows push notifications and opens the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // lets the app be installed to the home screen

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
      if (w) return w.focus();
      return self.clients.openWindow(appUrl);
    }
    return self.clients.openWindow(url);
  })());
});
