"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LABEL = { new: "🆕 Novo", read: "👀 Lido", done: "✅ Resolvido" } as const;

export function FeedbackStatus({ id, status }: { id: number; status: keyof typeof LABEL }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(s: keyof typeof LABEL) {
    setBusy(true);
    await fetch("/api/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: s }) });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex gap-1 text-xs">
      {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((s) => (
        <button
          key={s}
          disabled={busy}
          onClick={() => set(s)}
          className={`rounded-full px-2 py-0.5 ${status === s ? "bg-fg text-bg" : "bg-muted"}`}
        >
          {LABEL[s]}
        </button>
      ))}
    </div>
  );
}
