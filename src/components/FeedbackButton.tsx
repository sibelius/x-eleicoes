"use client";

import { useEffect, useState } from "react";

const KINDS = [
  ["idea", "💡 Ideia"],
  ["bug", "🐞 Problema"],
  ["love", "❤️ Elogio"],
  ["other", "💬 Outro"],
] as const;

/** "Enviar feedback": a small form in a dialog; it reaches the admin (with a push). */
export function FeedbackButton({ className = "underline", label = "💬 Enviar feedback" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("idea");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, body, contact, page: location.pathname }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setState("idle");
      return setError(j.error ?? "Não foi possível enviar. Tente de novo.");
    }
    setState("sent");
    setBody("");
  }

  return (
    <>
      <button type="button" onClick={() => (setOpen(true), setState("idle"))} className={className}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-3 sm:place-items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Enviar feedback"
            className="w-full max-w-md rounded-2xl border border-line bg-card p-4 text-left text-sm text-fg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Enviar feedback</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="px-1 text-subtle">
                ✕
              </button>
            </div>
            {state === "sent" ? (
              <div className="py-6 text-center">
                <div className="text-4xl">💚</div>
                <p className="mt-2 font-semibold">Recebido, obrigado!</p>
                <p className="text-subtle">Cada mensagem é lida.</p>
              </div>
            ) : (
              <form onSubmit={send} className="mt-3 grid gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map(([k, l]) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setKind(k)}
                      className={`rounded-full px-3 py-1 ${kind === k ? "bg-fg text-bg" : "bg-muted"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="O que podia ser melhor? O que você queria ver aqui?"
                  className="rounded-xl border border-line bg-bg p-3"
                  autoFocus
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={200}
                  placeholder="Contato para resposta (opcional: @ do X ou e-mail)"
                  className="rounded-full border border-line bg-bg px-4 py-2"
                />
                {error && <p className="text-[var(--red)]">{error}</p>}
                <button disabled={state === "sending"} className="rounded-full bg-fg px-4 py-2 font-semibold text-bg disabled:opacity-60">
                  {state === "sending" ? "Enviando…" : "Enviar"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
