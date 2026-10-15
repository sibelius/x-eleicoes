"use client";

import { useEffect } from "react";

/** Arrived through a tagged link: count it once, then drop the utm_* tags from the address bar. */
export function UtmBeacon() {
  useEffect(() => {
    const u = new URL(location.href);
    if (!u.searchParams.has("utm_source")) return;
    fetch("/api/utm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: u.toString() }),
      keepalive: true,
    }).catch(() => {});
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  }, []);
  return null;
}
