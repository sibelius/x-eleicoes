"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sharePath, withUtm } from "@/lib/links";

// "Pergunta do dia": guess today's featured bubble (% Green), then see the answer, score, rank and streak.

type Streak = { current: number; best: number };
export type DailyResultView = {
  guess: number;
  actual: number;
  score: number;
  rank: number;
  players: number;
  beat: number | null;
  streak: Streak | null;
};

function shareText(username: string, r: DailyResultView) {
  const streak = r.streak?.current ? ` 🔥 ${r.streak.current} ${r.streak.current === 1 ? "dia" : "dias"} seguidos.` : "";
  return `Pergunta do dia 🎯 Chutei ${r.guess}% Verde na bolha de @${username} no X e era ${r.actual}%: fiz ${r.score}/100.${streak} Duvido chegar mais perto:`;
}

export function DailyGame({
  target,
  username,
  base,
  nextAt,
  initial,
}: {
  target: string;
  username: string;
  base: string;
  nextAt: number;
  initial: DailyResultView | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState(initial);
  const [guess, setGuess] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const play = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, guess }),
      });
      if (r.status === 409) {
        setError("A pergunta mudou. Carregando a nova…");
        router.refresh();
        return;
      }
      if (!r.ok) throw new Error();
      setResult(await r.json());
      router.refresh(); // the leaderboard
    } catch {
      setError("Não deu certo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  if (!result) {
    return (
      <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-6">
        <div className="text-center text-5xl font-bold tabular-nums" style={{ color: "var(--green)" }}>
          {guess}%
        </div>
        <div className="mt-1 text-center text-sm text-subtle">
          {guess}% Verde × {100 - guess}% Vermelho
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={guess}
          onChange={(e) => setGuess(Number(e.target.value))}
          className="mt-5 w-full accent-[var(--green)]"
          aria-label="% Verde"
        />
        <div className="mt-1 flex justify-between text-xs font-semibold">
          <span style={{ color: "var(--red)" }}>Tudo Vermelho</span>
          <span style={{ color: "var(--green)" }}>Tudo Verde</span>
        </div>
        <button
          disabled={busy}
          onClick={play}
          className="mt-5 w-full rounded-full bg-fg px-5 py-3 font-semibold text-bg disabled:opacity-60"
        >
          {busy ? "Revelando…" : "Chutar"}
        </button>
        {error && <p className="mt-2 text-center text-sm text-subtle">{error}</p>}
        <p className="mt-3 text-center text-xs text-subtle">Só o primeiro chute vale. Uma pergunta por dia.</p>
      </section>
    );
  }

  const url = `${base}/hoje`;
  const text = shareText(username, result);
  const tweet = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(withUtm(url, "daily"))}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${withUtm(url, "daily", { source: "whatsapp", medium: "social" })}`)}`;
  const s = result.score;
  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-6">
      <div className="text-center">
        <div className="text-sm text-subtle">Sua pontuação</div>
        <div className="text-6xl font-bold tabular-nums">
          {s}
          <span className="text-2xl text-subtle">/100</span>
        </div>
        <div className="mt-1 text-2xl">{s >= 95 ? "🔥 Na mosca!" : s >= 85 ? "👏 Muito perto" : s >= 70 ? "🙂 Nada mal" : "😅 Passou longe"}</div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-subtle">Você chutou</div>
          <div className="text-xl font-bold">{result.guess}% Verde</div>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-subtle">Era</div>
          <div className="text-xl font-bold" style={{ color: "var(--green)" }}>
            {result.actual}% Verde
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm">
        {result.players > 1 ? (
          <>
            <b>{result.rank}º</b> de {result.players} hoje · melhor ou igual a <b>{result.beat}%</b> de quem jogou
          </>
        ) : (
          "Você foi a primeira pessoa a jogar hoje."
        )}
      </p>
      {result.streak ? (
        <p className="mt-3 text-center text-lg font-semibold">
          🔥 {result.streak.current} {result.streak.current === 1 ? "dia seguido" : "dias seguidos"}
          {result.streak.best > result.streak.current && (
            <span className="block text-xs font-normal text-subtle">Seu recorde: {result.streak.best} dias</span>
          )}
        </p>
      ) : (
        <div className="mt-4 rounded-xl bg-muted p-3 text-center text-sm">
          <b>Não perca sua sequência 🔥</b>
          <span className="block text-subtle">Entre com o X para contar seus dias seguidos e aparecer no ranking.</span>
          <a href="/api/auth/x" className="mt-2 inline-block rounded-full bg-fg px-4 py-2 font-semibold text-bg">
            Entrar com X
          </a>
        </div>
      )}
      <Countdown to={nextAt} />
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <a className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg" href={tweet} target="_blank" rel="noreferrer">
          Postar no X
        </a>
        <a className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: "#25d366" }} href={wa} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a className="rounded-full border border-line px-4 py-2 text-sm font-semibold" href={sharePath(username)}>
          Ver a bolha de @{username}
        </a>
      </div>
    </section>
  );
}

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, to - now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  return (
    <p className="mt-4 text-center text-sm text-subtle">
      Próxima pergunta em{" "}
      <b className="font-mono tabular-nums text-fg" suppressHydrationWarning>
        {left ? `${pad(h)}:${pad(m)}:${pad(sec)}` : "instantes"}
      </b>
    </p>
  );
}
