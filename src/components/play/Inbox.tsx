"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Message } from "@/lib/messages";
import { Face } from "./Face";
import { ReplyButtons } from "./Reply";

/**
 * Realtime messages while the site is open: polls every 8s (visible tab, signed in) and shows a toast
 * for each new ask to change color, or answer to one. Stops polling for visitors without a login (204).
 */
export function Inbox() {
  const [toasts, setToasts] = useState<Message[]>([]);
  useEffect(() => {
    let stop = false;
    const poll = () => {
      if (stop || document.visibilityState !== "visible") return;
      fetch("/api/inbox", { cache: "no-store" })
        .then((r) => {
          if (r.status === 204 || r.status === 401) {
            stop = true;
            clearInterval(timer);
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((j: { messages: Message[] } | null) => {
          if (j?.messages.length) setToasts((t) => [...t, ...j.messages.filter((m) => !t.some((x) => x.id === m.id))]);
        })
        .catch(() => {});
    };
    // poll() reads `timer` only in an async callback, after it's set.
    const timer = setInterval(poll, 8_000);
    poll();
    document.addEventListener("visibilitychange", poll);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  const close = (id: number) => {
    setToasts((t) => t.filter((m) => m.id !== id));
    fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  };

  if (!toasts.length) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] grid gap-2 sm:left-auto sm:w-96" role="status" aria-live="polite">
      {toasts.map((m) => (
        <div key={m.id} className="live-in rounded-2xl border border-line bg-card p-3 shadow-xl">
          <div className="flex items-start gap-3">
            <Face src={m.from.avatar} size={40} vote={m.from.vote} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <b>@{m.from.username}</b> {m.kind === "ask" ? "te pediu para trocar de cor" : "respondeu seu pedido"}
              </div>
              <div className="mt-0.5 font-semibold">{m.body}</div>
            </div>
            <button onClick={() => close(m.id)} aria-label="Fechar" className="text-subtle">
              ✕
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {m.kind === "ask" && (
              <span onClick={() => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== m.id)), 1500)}>
                <ReplyButtons id={m.id} side={m.side} canSwitch={m.to.vote != null} />
              </span>
            )}
            <Link href="/mensagens" className="text-xs text-subtle underline">
              Ver mensagens
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
