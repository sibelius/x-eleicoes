"use client";

import { useEffect } from "react";
import { trackShare } from "@/lib/share-client";

/** Catches every "post on X" link on the site, wherever it is rendered. */
export function ShareTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="https://x.com/intent/post"]');
      if (a) trackShare((a as HTMLAnchorElement).href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
