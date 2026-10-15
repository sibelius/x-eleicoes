"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Me, Vote } from "@/lib/network";
import { SIDE } from "@/lib/links";

export function VotePanel({ me }: { me: Me }) {
  const router = useRouter();
  const [vote, setVote] = useState<Vote | null>(me.vote);
  const [consent, setConsent] = useState(Boolean(me.vote));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: Vote) {
    setError(null);
    start(async () => {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: next }),
      });
      if (!res.ok) return setError("Não foi possível salvar. Tente de novo.");
      setVote(next);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Seu lado</h2>
      <p className="mt-1 text-sm text-subtle">Sua escolha é pública e aparece com o seu @.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(["lula", "bolsonaro"] as const).map((v) => (
          <button
            key={v}
            disabled={pending || !consent}
            onClick={() => save(v)}
            className={`rounded-xl border-2 px-4 py-5 text-lg font-bold transition disabled:opacity-40 ${
              vote === v ? "text-white" : "bg-card"
            }`}
            style={{
              borderColor: v === "lula" ? "var(--red)" : "var(--green)",
              background: vote === v ? (v === "lula" ? "var(--red)" : "var(--green)") : undefined,
            }}
          >
            {SIDE[v]}
          </button>
        ))}
      </div>
      {!me.vote && (
        <label className="mt-3 flex items-start gap-2 text-sm text-subtle">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Entendo que minha escolha pode ser dado pessoal sensível (LGPD) e autorizo que ela fique{" "}
            <b>público</b>: qualquer pessoa pode vê-lo, junto com meu @ do X, inclusive no meu link compartilhado.
            Posso trocar de lado ou excluir meus dados a qualquer momento.
          </span>
        </label>
      )}
      {error && <p className="mt-2 text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
