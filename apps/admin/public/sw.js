// The admin panel's service worker: push and tap-to-open only. It caches nothing.
// Plain JS, served as-is (not bundled).

/* global self, URL */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

// The server sends { title, body, url, tag }. Help pushes never carry the person's words.
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "وِردك · الإدارة", {
      body: data.body || "",
      data: { url: data.url || "/" },
      // one notification per request: a newer message replaces it
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      dir: "rtl",
      lang: "ar",
    }),
  );
});

// Focus an admin tab already on the page, otherwise open one. Only admin pages are opened.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  );
  const url = target.origin === self.location.origin ? target.href : "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((tabs) => {
        const open = tabs.find((tab) => tab.url === url);
        return open ? open.focus() : self.clients.openWindow(url);
      }),
  );
});
