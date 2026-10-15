"use client";

import { useState } from "react";
import { SIDE } from "@/lib/links";
import type { Vote } from "@/lib/network";

// Preset texts mirror ASKS in lib/messages (the server builds the real text).
const PRESETS: { key: string; text: (side: Vote) => string }[] = [
  { key: "vem", text: (s) => `Vem pro ${SIDE[s]}! 🙏` },
  { key: "argumentos", text: () => "Bora trocar de cor? Tenho bons argumentos 😄" },
  { key: "acho", text: (s) => `Eu acho que no fundo você é ${SIDE[s]} 👀` },
  { key: "conversa", text: (s) => `Que tal mudar pro ${SIDE[s]}? Me chama no X pra gente conversar` },
];

/** "Pedir para trocar de cor": pick a preset message; it reaches them live on the site or as a push. */
export function AskButton({ to, mySide, compact = false }: { to: string; mySide: Vote; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function ask(preset: string) {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, preset }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setError(j.error ?? "Não foi possível enviar.");
    setOpen(false);
    setDone(j.live ? "Enviado! @" + to + " está online e já vai ver 👀" : "Enviado! @" + to + " vai receber uma notificação 🔔");
  }
  if (done) return <span className="text-sm text-subtle">{done}</span>;
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={compact ? "rounded-full border border-line px-3 py-1 text-sm" : "rounded-full border border-line px-6 py-3 font-semibold"}
        style={{ borderColor: `var(--${mySide})` }}
      >
        🙏 {compact ? "Pedir" : "Pedir para trocar de cor"}
      </button>
      {open && (
        <span className="absolute right-0 z-30 mt-2 grid w-72 gap-1 rounded-2xl border border-line bg-card p-2 shadow-lg sm:left-0 sm:right-auto">
          <span className="px-2 pt-1 text-xs text-subtle">Escolha a mensagem para @{to}:</span>
          {PRESETS.map((p) => (
            <button key={p.key} disabled={busy} onClick={() => ask(p.key)} className="rounded-xl px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50">
              {p.text(mySide)}
            </button>
          ))}
          {error && <span className="px-2 pb-1 text-xs" style={{ color: "var(--red)" }}>{error}</span>}
        </span>
      )}
    </span>
  );
}
