"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pct, sharePath } from "@/lib/links";
import type { Room } from "@/lib/room";
import { Face } from "./Face";

const n = (v: number) => v.toLocaleString("pt-BR");

function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

/** Live scoreboard of everyone, polled every few seconds while the tab is visible. `compact` = the strip on /mapa. */
export function LiveRoom({ initial, compact = false }: { initial: Room; compact?: boolean }) {
  const [room, setRoom] = useState(initial);
  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/room", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: Room | null) => !stop && v && setRoom(v))
        .catch(() => {});
    };
    const t = setInterval(tick, 8_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const { totals, online, lastHour, events } = room;
  const voted = totals.red + totals.green;
  const r = pct(totals.red, voted);
  const g = voted ? 100 - r : 0;
  const lead = totals.red === totals.green ? null : totals.red > totals.green ? "red" : "green";

  const score = (
    <div>
      <div className="flex items-end justify-between gap-2 font-bold tabular-nums">
        <span key={`r${totals.red}`} className="live-pop text-2xl" style={{ color: "var(--red)" }}>
          🔴 {n(totals.red)} <span className="text-base">({r}%)</span>
        </span>
        <span className="pb-1 text-xs font-normal text-subtle">{lead ? "ao vivo" : "empate"}</span>
        <span key={`g${totals.green}`} className="live-pop text-2xl" style={{ color: "var(--green)" }}>
          <span className="text-base">({g}%)</span> {n(totals.green)} 🟢
        </span>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted">
        <div className="transition-all duration-700" style={{ width: `${r}%`, background: "var(--red)" }} />
        <div className="transition-all duration-700" style={{ width: `${g}%`, background: "var(--green)" }} />
      </div>
    </div>
  );

  const stats = (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--green)] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--green)]" />
        </span>
        online agora: <b style={{ color: "var(--red)" }}>{n(online.red)} 🔴</b> · <b style={{ color: "var(--green)" }}>{n(online.green)} 🟢</b>
        {online.none + online.visitors > 0 && <> · {n(online.none + online.visitors)} sem lado</>}
      </span>
      <span>
        última hora: +{n(lastHour.red)} 🔴 · +{n(lastHour.green)} 🟢
      </span>
      <span>{n(totals.members)} na rede</span>
    </div>
  );

  if (compact) {
    return (
      <Link href="/ao-vivo" className="mx-3 mb-2 block rounded-xl border border-line bg-card px-3 py-2">
        {score}
        {stats}
      </Link>
    );
  }

  return (
    <div className="grid gap-4">
      <section data-tour="live-score" className="rounded-2xl border border-line bg-card p-4">
        {score}
        {stats}
      </section>
      <section data-tour="live-feed" className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Acontecendo agora</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-subtle">Nada ainda. Chame sua rede!</p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm">
            {events.map((e) => (
              <li key={`${e.kind}${e.username}${e.at}`} className="live-in flex items-center gap-2">
                <Face src={e.avatar} vote={e.vote} />
                <a href={sharePath(e.username)} className="min-w-0 flex-1 truncate">
                  <b>@{e.username}</b>{" "}
                  {e.kind === "joined" ? (
                    "entrou"
                  ) : e.kind === "switched" ? (
                    <>trocou para <b style={{ color: `var(--${e.vote})` }}>{e.vote === "red" ? "🔴 Vermelho" : "🟢 Verde"}</b></>
                  ) : (
                    <>escolheu <b style={{ color: `var(--${e.vote})` }}>{e.vote === "red" ? "🔴 Vermelho" : "🟢 Verde"}</b></>
                  )}
                </a>
                <span className="shrink-0 text-xs text-subtle">{ago(e.at, room.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
