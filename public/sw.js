// Web push: "someone from your network joined".
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Minha Bolha", {
      body: data.body,
      icon: "/apple-icon",
      data: { url: data.url || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).pathname === new URL(url, self.location.origin).pathname);
      return win ? win.focus() : self.clients.openWindow(url);
    }),
  );
});
