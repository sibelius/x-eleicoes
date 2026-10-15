"use client";

import { useState } from "react";

/** Stop (or allow again) asks to change color. */
export function MuteToggle({ muted }: { muted: boolean }) {
  const [on, setOn] = useState(muted);
  const [busy, setBusy] = useState(false);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        disabled={busy}
        checked={on}
        onChange={async (e) => {
          const mute = e.target.checked;
          setBusy(true);
          const r = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mute }) }).catch(() => null);
          if (r?.ok) setOn(mute);
          setBusy(false);
        }}
      />
      Não quero receber pedidos para trocar de cor
    </label>
  );
}
