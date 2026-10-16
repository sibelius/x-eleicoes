"use client";

import { useState } from "react";

/** Copies an absolute link built from the current origin (path only from the server). */
export function CopyLink({ path, label = "Copiar link" }: { path: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(`${location.origin}${path}`);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <button onClick={copy} className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:bg-muted">
        {done ? "Copiado ✓" : label}
      </button>
      <a href={path} target="_blank" rel="noreferrer" className="text-xs text-subtle underline">
        abrir
      </a>
    </span>
  );
}
