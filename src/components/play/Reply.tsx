"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SIDE } from "@/lib/links";
import type { Vote } from "@/lib/network";

export const REPLY_BUTTONS = [
  { key: "pensar", label: "Vou pensar 🤔" },
  { key: "nao", label: "Nem pensar 😅" },
  { key: "conversa", label: "Bora conversar 💬" },
] as const;

/** Answer an ask: switch to their side right away ("Troquei! ✅"), or one of the preset answers. */
export function useAnswer(onDone?: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function answer(id: number, reply: string | null, switchTo?: Vote) {
    setBusy(true);
    if (switchTo) {
      await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote: switchTo }) }).catch(() => {});
    }
    await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, reply }) }).catch(() => {});
    setBusy(false);
    onDone?.();
    router.refresh();
  }
  return { busy, answer };
}

export function ReplyButtons({ id, side, canSwitch }: { id: number; side: Vote | null; canSwitch: boolean }) {
  const [sent, setSent] = useState(false);
  const { busy, answer } = useAnswer(() => setSent(true));
  if (sent) return <span className="text-xs text-subtle">Resposta enviada ✓</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {side && canSwitch && (
        <button disabled={busy} onClick={() => answer(id, "troquei", side)} className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: `var(--${side})` }}>
          Trocar para {SIDE[side]}
        </button>
      )}
      {REPLY_BUTTONS.map((b) => (
        <button key={b.key} disabled={busy} onClick={() => answer(id, b.key)} className="rounded-full border border-line px-3 py-1 text-xs">
          {b.label}
        </button>
      ))}
    </span>
  );
}
