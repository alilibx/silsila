// Wirdak's service worker: push and tap-to-open only. It caches nothing.
// Plain JS, served as-is (not bundled).

/* global self, URL */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

// The server sends { title, body, url }; the text is the same as the in-app note.
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // an unreadable payload still shows its text
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "وِردك", {
      body: data.body || "",
      data: { url: data.url || "/" },
      icon: "/icons/icon-192.png",
      dir: "rtl",
      lang: "ar",
    }),
  );
});

// Focus a tab already on the page, otherwise open one. Only this site's own pages are opened.
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

// The browser renewed or dropped the subscription. This worker has no session to re-register
// with, so it tells the open pages, whose push sync subscribes again and tells the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((tabs) =>
        tabs.forEach((tab) =>
          tab.postMessage({ type: "pushsubscriptionchange" }),
        ),
      ),
  );
});
