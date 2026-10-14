"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Me, Visibility, Vote } from "@/lib/network";

const VIS: { v: Visibility; label: string; hint: string }[] = [
  { v: "network", label: "Minha rede", hint: "Quem você segue, quem te segue e seus convidados" },
  { v: "public", label: "Público", hint: "Também aparece no seu link compartilhado" },
  { v: "private", label: "Privado", hint: "Só entra nas contagens agregadas" },
];

export function VotePanel({ me }: { me: Me }) {
  const router = useRouter();
  const [vote, setVote] = useState<Vote | null>(me.vote);
  const [visibility, setVisibility] = useState<Visibility>(me.visibility);
  const [consent, setConsent] = useState(Boolean(me.vote));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: Vote | null, vis = visibility) {
    setError(null);
    start(async () => {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: next, visibility: vis }),
      });
      if (!res.ok) return setError("Não foi possível salvar. Tente de novo.");
      setVote(next);
      setVisibility(vis);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Seu voto</h2>
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
              borderColor: v === "lula" ? "var(--lula)" : "var(--bolso)",
              background: vote === v ? (v === "lula" ? "var(--lula)" : "var(--bolso)") : undefined,
            }}
          >
            {v === "lula" ? "Lula" : "Bolsonaro"}
          </button>
        ))}
      </div>
      {!me.vote && (
        <label className="mt-3 flex items-start gap-2 text-sm text-subtle">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Entendo que opinião política é dado pessoal sensível (LGPD) e autorizo guardar meu voto e mostrá-lo
            conforme a visibilidade escolhida abaixo. Posso apagar a qualquer momento.
          </span>
        </label>
      )}
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Quem pode ver seu voto</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {VIS.map((o) => (
            <button
              key={o.v}
              disabled={pending}
              onClick={() => (vote ? save(vote, o.v) : setVisibility(o.v))}
              className={`rounded-xl border p-2 text-left text-sm ${visibility === o.v ? "border-fg bg-muted" : "border-line"}`}
            >
              <div className="font-medium">{o.label}</div>
              <div className="text-xs text-subtle">{o.hint}</div>
            </button>
          ))}
        </div>
      </fieldset>
      {vote && (
        <button disabled={pending} onClick={() => save(null)} className="mt-3 text-sm text-subtle underline">
          Apagar meu voto
        </button>
      )}
      {error && <p className="mt-2 text-sm text-[var(--lula)]">{error}</p>}
    </div>
  );
}
