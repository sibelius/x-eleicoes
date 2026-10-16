"use client";

import { useEffect, useState } from "react";
import { currentSubscription, needsHomeScreen, pushSupported, savePush, subscribePush } from "@/lib/push-client";

// Asked again on every visit (once per browser session) until avisos are on. Browsers only show their
// permission dialog after a tap, and sites that call it unprompted get muted, so this is an in-page bar
// whose button opens the real dialog. Never shown once the browser blocked notifications.
const DISMISSED = "xe_push_prompt_dismissed";

type State = "hidden" | "ask" | "ios" | "busy" | "done";

function dismissed() {
  try {
    return sessionStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function PushPrompt({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    let alive = true;
    (async () => {
      const member = await fetch("/api/push", { cache: "no-store" })
        .then((r) => r.json() as Promise<{ member: boolean }>)
        .then((j) => j.member)
        .catch(() => false);
      if (!member) return;
      if (!pushSupported()) {
        if (needsHomeScreen() && !dismissed() && alive) setState("ios");
        return;
      }
      if (Notification.permission === "denied") return;
      const sub = await currentSubscription().catch(() => null);
      // Already on in this browser: re-save it quietly (it may belong to another login or have been pruned).
      if (sub && Notification.permission === "granted") return void savePush(sub).catch(() => {});
      if (!dismissed() && alive) setState("ask");
    })();
    return () => {
      alive = false;
    };
  }, []);

  function close() {
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {}
    setState("hidden");
  }

  async function enable() {
    setState("busy");
    const ok = await subscribePush(publicKey).catch(() => false);
    if (!ok) return close();
    setState("done");
    setTimeout(() => setState("hidden"), 2500);
  }

  if (state === "hidden") return null;
  return (
    <div
      role="dialog"
      aria-label="Ativar avisos"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-line bg-card p-3 text-sm shadow-lg"
    >
      <span className="text-2xl" aria-hidden>
        🔔
      </span>
      <div className="min-w-0 flex-1">
        {state === "done" ? (
          <b>Avisos ativados ✓</b>
        ) : state === "ios" ? (
          <>
            <b>Receba avisos da sua bolha</b>
            <div className="text-subtle">No iPhone: toque em Compartilhar → “Adicionar à Tela de Início” e abra por lá.</div>
          </>
        ) : (
          <>
            <b>Ativar avisos?</b>
            <div className="text-subtle">Saiba quando alguém da sua rede entrar, escolher um lado ou ver sua bolha.</div>
          </>
        )}
      </div>
      {(state === "ask" || state === "busy") && (
        <button
          onClick={enable}
          disabled={state === "busy"}
          className="shrink-0 rounded-full bg-fg px-4 py-2 font-semibold text-bg"
        >
          {state === "busy" ? "…" : "Ativar"}
        </button>
      )}
      {state !== "done" && (
        <button onClick={close} aria-label="Agora não" className="shrink-0 px-1 text-subtle">
          ✕
        </button>
      )}
    </div>
  );
}
