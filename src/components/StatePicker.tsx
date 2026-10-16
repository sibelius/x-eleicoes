"use client";

import { useEffect, useState } from "react";
import type { Place } from "@/lib/places";
import { UFS, type UF } from "@/lib/uf";

// "Seu estado": the member's state for the Estados maps (only ever shown in totals of 3+ people).
// Pre-filled from the X profile location; the member can change or hide it.

const HIDDEN = "-";

export function StatePicker({ initial }: { initial?: Place }) {
  const [place, setPlace] = useState<Place | undefined>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    fetch("/api/place")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Place) => live && setPlace(p))
      .catch(() => live && setPlace(null));
    return () => {
      live = false;
    };
  }, [initial]);

  async function save(value: string) {
    const uf = value === HIDDEN || value === "" ? null : (value as UF);
    setSaving(true);
    setError(false);
    try {
      const r = await fetch("/api/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uf }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setPlace(((await r.json()) as { place: Place }).place);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const value = place === undefined ? "" : place?.uf ?? (place?.source === "self" ? HIDDEN : "");
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <label className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">📍 Seu estado</span>
        <select
          value={value}
          disabled={place === undefined || saving}
          onChange={(e) => save(e.target.value)}
          className="rounded-full border border-line bg-bg px-3 py-1.5 text-sm"
        >
          <option value="" disabled>
            {place === undefined ? "Carregando…" : "Escolha"}
          </option>
          {(Object.keys(UFS) as UF[])
            .sort((a, b) => UFS[a].localeCompare(UFS[b], "pt-BR"))
            .map((uf) => (
              <option key={uf} value={uf}>
                {UFS[uf]}
              </option>
            ))}
          <option value={HIDDEN}>Prefiro não dizer</option>
        </select>
      </label>
      <p className="mt-2 text-xs text-subtle">
        {place?.source === "x" && place.uf
          ? "Pegamos da localização do seu perfil no X. "
          : ""}
        Ele só aparece somado com o de outras pessoas no mapa de Estados (no mínimo 3 por estado), nunca sozinho.
        {error && <span className="text-[var(--red)]"> Não deu para salvar, tente de novo.</span>}
      </p>
    </div>
  );
}
