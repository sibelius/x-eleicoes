"use client";

import { useEffect, useState } from "react";
import type { Live } from "@/app/api/live/route";
import { sharePath } from "@/lib/links";

/** Heartbeat for the bubble on screen (every 20s while visible); returns who's watching it and who's online. */
export function useLive(bubble: string | null) {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    if (!bubble) return;
    let stop = false;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bubble }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: Live | null) => !stop && v && setLive(v))
        .catch(() => {});
    };
    beat();
    const t = setInterval(beat, 20_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [bubble]);
  return live;
}

/** "👀 3 pessoas vendo agora" with the faces of the signed-in ones. */
export function LiveWatchers({ live, own }: { live: Live | null; own: boolean }) {
  if (!live?.watching) return null;
  const n = live.watching;
  const anon = n - live.people.length;
  const names = live.people.map((p) => `@${p.username}`).join(", ") + (anon > 0 ? `${live.people.length ? " e " : ""}${anon} ${anon === 1 ? "visitante" : "visitantes"}` : "");
  return (
    <div className="flex w-fit items-center gap-2 rounded-full bg-muted py-0.5 pr-3 pl-1 text-sm" title={names}>
      <span className="flex -space-x-2">
        {live.people.slice(0, 5).map((p) => (
          <a key={p.username} href={sharePath(p.username)} title={`@${p.username}`}>
            {p.avatar ? (
              <img src={p.avatar} alt="" className="h-6 w-6 rounded-full border-2 border-[var(--card)]" />
            ) : (
              <span className="block h-6 w-6 rounded-full border-2 border-[var(--card)] bg-line" />
            )}
          </a>
        ))}
        {live.people.length === 0 && <span className="px-1">👀</span>}
      </span>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
      </span>
      <b>{n}</b> {n === 1 ? "pessoa vendo" : "pessoas vendo"} {own ? "sua bolha" : ""} agora
    </div>
  );
}
