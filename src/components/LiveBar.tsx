"use client";

import { useEffect, useState } from "react";

type Live = { online: number; today: number; members: number };
const n = (v: number) => v.toLocaleString("pt-BR");

/** Top of every page: people online now, visitors today, members. Heartbeat every 45s while the tab is visible. */
export function LiveBar() {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let stop = false;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: Live | null) => !stop && v && setLive(v))
        .catch(() => {});
    };
    beat();
    const t = setInterval(beat, 45_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return (
    <div className="flex min-h-9 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-card px-4 py-2 text-sm">
      {live ? (
        <>
          <span className="flex items-center gap-2 font-semibold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--green)] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--green)]" />
            </span>
            {n(live.online)} {live.online === 1 ? "pessoa online" : "pessoas online"} agora
          </span>
          <span className="text-subtle">👀 {n(live.today)} hoje</span>
          <span className="text-subtle">🙋 {n(live.members)} já entraram</span>
        </>
      ) : (
        <span className="text-subtle">&nbsp;</span>
      )}
    </div>
  );
}
