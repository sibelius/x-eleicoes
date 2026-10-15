"use client";

import { useEffect, useRef, useState } from "react";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

const ASKED = "xe_push_asked";
function asked() {
  try {
    return localStorage.getItem(ASKED) === "1";
  } catch {
    return false;
  }
}
function markAsked() {
  try {
    localStorage.setItem(ASKED, "1");
  } catch {}
}

function key(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const enableRef = useRef(() => {});

  useEffect(() => {
    async function check(): Promise<State> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const reg = await navigator.serviceWorker.register("/sw.js");
      return (await reg.pushManager.getSubscription()) ? "on" : "off";
    }
    check()
      .catch((): State => "unsupported")
      .then((st) => {
        setState(st);
        // First visit: ask right away instead of waiting for the button. Some browsers only show the
        // prompt after a user gesture, so also try on the first tap/click. The button stays as fallback.
        if (st !== "off" || Notification.permission !== "default" || asked()) return;
        markAsked();
        enableRef.current();
        const onGesture = () => {
          if (Notification.permission === "default") enableRef.current();
        };
        window.addEventListener("pointerdown", onGesture, { once: true });
      });
  }, []);

  async function enable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
    }
  }

  useEffect(() => {
    enableRef.current = () => void enable();
  });

  async function disable() {
    setState("loading");
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Avisos</h2>
      <p className="mt-1 text-sm text-subtle">Receba uma notificação quando alguém da sua rede entrar.</p>
      {state === "unsupported" ? (
        <p className="mt-3 text-sm text-subtle">
          Este navegador não aceita notificações. No iPhone, adicione o site à Tela de Início primeiro.
        </p>
      ) : state === "denied" ? (
        <p className="mt-3 text-sm text-subtle">Notificações bloqueadas nas configurações do navegador.</p>
      ) : (
        <button
          disabled={state === "loading"}
          onClick={state === "on" ? disable : enable}
          className={`mt-3 rounded-full px-4 py-2 text-sm ${state === "on" ? "border border-line" : "bg-fg text-bg"}`}
        >
          {state === "on" ? "Desativar avisos" : state === "loading" ? "…" : "Ativar avisos"}
        </button>
      )}
    </section>
  );
}
