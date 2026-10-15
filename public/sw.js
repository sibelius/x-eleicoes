// Web push: "someone from your network joined / voted", bubble views, daily summary.
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
  const tagged = new URL(event.notification.data?.url || "/app", self.location.origin);
  // Count the click here (the page may just be focused, not loaded), then open the link without its UTM tags.
  const track = tagged.searchParams.has("utm_source")
    ? fetch("/api/utm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tagged.toString() }),
        credentials: "include",
      }).catch(() => {})
    : Promise.resolve();
  for (const k of [...tagged.searchParams.keys()]) if (k.startsWith("utm_")) tagged.searchParams.delete(k);
  const url = tagged.toString();
  event.waitUntil(
    track.then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).pathname === new URL(url, self.location.origin).pathname);
      return win ? win.focus() : self.clients.openWindow(url);
    })),
  );
});
