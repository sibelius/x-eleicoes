import type { ShareVia } from "./share-links";

// Tells the server a bubble was shared, so its owner can be notified. `href` is an x.com post intent
// (its `url` param is the shared page) or the shared page itself.
export function trackShare(href: string, via: ShareVia = "x") {
  let url = href;
  try {
    const u = new URL(href, location.origin);
    url = u.searchParams.get("url") ?? u.toString();
  } catch {
    return;
  }
  const body = JSON.stringify({ url, via });
  if (navigator.sendBeacon?.("/api/share", new Blob([body], { type: "application/json" }))) return;
  fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
