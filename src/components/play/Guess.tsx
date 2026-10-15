"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { guessTweetUrl } from "@/lib/links";

// The guessing game on someone's bubble: "Quanto % da rede de @x é Verde?" The result (and the bubble
// itself) stay blurred until you guess; then you see how close you got and how everyone else guessed.

type Result = { guess: number; actual: number; others: number; avg: number | null; beat: number | null };
type State = { on: boolean; result: Result | null; reveal: (guess: number) => Promise<void> };

const Ctx = createContext<State>({ on: false, result: null, reveal: async () => {} });
const key = (bubble: string) => `xe_guess_${bubble}`;

/** `on` false (your own bubble, too few picks): no game, nothing hidden. */
export function GuessProvider({ bubble, on, children }: { bubble: string; on: boolean; children: ReactNode }) {
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key(bubble));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a past guess from storage
      if (saved) setResult(JSON.parse(saved));
    } catch {}
  }, [bubble]);
  const reveal = async (guess: number) => {
    const r = await fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bubble, guess }),
    });
    if (!r.ok) return;
    const res: Result = { guess, ...(await r.json()) };
    setResult(res);
    try {
      localStorage.setItem(key(bubble), JSON.stringify(res));
    } catch {}
  };
  return <Ctx.Provider value={{ on, result, reveal }}>{children}</Ctx.Provider>;
}

/** Blurs its children until the visitor has guessed. */
export function GuessHidden({ children }: { children: ReactNode }) {
  const { on, result } = useContext(Ctx);
  if (!on || result) return <>{children}</>;
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-md">
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <span className="rounded-full bg-card px-4 py-2 text-sm font-semibold shadow">Chute primeiro ☝️</span>
      </div>
    </div>
  );
}

export function GuessPanel({ username, base }: { username: string; base: string }) {
  const { on, result, reveal } = useContext(Ctx);
  const [guess, setGuess] = useState(50);
  const [busy, setBusy] = useState(false);
  if (!on) return null;
  if (result) {
    const score = 100 - Math.abs(result.guess - result.actual);
    return (
      <section data-tour="guess" className="mt-6 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">🎯 Você chutou {result.guess}% Verde</h2>
        <p className="mt-1">
          Era <b style={{ color: "var(--green)" }}>{result.actual}% Verde</b>: você fez <b>{score}/100</b>
          {score >= 95 ? " 🔥" : score >= 85 ? " 👏" : score < 60 ? " 😅" : ""}.
        </p>
        <p className="mt-1 text-sm text-subtle">
          {result.others
            ? `${result.others} ${result.others === 1 ? "pessoa chutou" : "pessoas chutaram"} antes, em média ${result.avg}%. Você foi melhor ou igual a ${result.beat}% delas.`
            : "Você foi a primeira pessoa a chutar nesta bolha."}
        </p>
        <a
          className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg"
          href={guessTweetUrl(base, username, result.guess, result.actual)}
          target="_blank"
          rel="noreferrer"
        >
          Desafiar no X
        </a>
      </section>
    );
  }
  return (
    <section data-tour="guess" className="mt-6 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">🎯 Chute antes de ver</h2>
      <p className="mt-1 text-sm text-subtle">Quanto % da rede de @{username} escolheu Verde?</p>
      <div className="mt-4 flex items-center gap-3">
        <span className="w-24 text-sm font-semibold" style={{ color: "var(--red)" }}>
          {100 - guess}% Vermelho
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={guess}
          onChange={(e) => setGuess(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--green)]"
          aria-label="% Verde"
        />
        <span className="w-20 text-right text-sm font-semibold" style={{ color: "var(--green)" }}>
          {guess}% Verde
        </span>
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await reveal(guess).finally(() => setBusy(false));
        }}
        className="mt-4 rounded-full bg-fg px-5 py-2 font-semibold text-bg disabled:opacity-60"
      >
        {busy ? "Revelando…" : "Revelar"}
      </button>
    </section>
  );
}
