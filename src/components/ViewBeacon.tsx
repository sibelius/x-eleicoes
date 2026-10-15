"use client";

import { useEffect } from "react";

/** Counts this visit for the given bubbles (once per visitor per day, server-side). */
export function ViewBeacon({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    fetch("/api/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: key.split(",") }),
      keepalive: true,
    }).catch(() => {});
  }, [key]);
  return null;
}
