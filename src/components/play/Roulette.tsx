"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SIDE, bubbleVerdict, comparePath, pct, sharePath, withUtm } from "@/lib/links";
import type { Vote } from "@/lib/network";
import type { Draw, RouletteMode } from "@/lib/roulette";
import { ICEBREAKERS } from "@/lib/roulette-shared";
import { AskButton } from "./AskButton";

const MODES: [RouletteMode, string][] = [
  ["any", "🎲 Qualquer um"],
  ["other", "↔️ Do outro lado"],
  ["network", "🫧 Da minha rede"],
  ["outside", "🌍 Fora da minha rede"],
];

const sideColor = (v: Vote | null) => (v === "red" ? "var(--red)" : v === "green" ? "var(--green)" : "var(--none)");

/** Meet a random member: a spin, their card, an icebreaker, and one-tap ways to reach out on X. */
export function Roulette({ me, base }: { me: { id: string; username: string; vote: Vote | null }; base: string }) {
  const [mode, setMode] = useState<RouletteMode>(me.vote ? "other" : "any");
  const [person, setPerson] = useState<Draw | null>(null);
  const [state, setState] = useState<"idle" | "spinning" | "empty">("idle");
  const [ice, setIce] = useState(0);

  const spin = useCallback(
    async (m: RouletteMode, skip = "") => {
      setState("spinning");
      const started = Date.now();
      const j = (await fetch(`/api/roleta?mode=${m}&skip=${encodeURIComponent(skip)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ person: null }))) as { person: Draw | null };
      // A short beat of suspense, even when the answer is instant.
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - started))));
      setPerson(j.person);
      setIce(Math.floor(Math.random() * ICEBREAKERS.length));
      setState(j.person ? "idle" : "empty");
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first draw on open
    void spin(mode);
  }, [mode, spin]);

  const reached = (to: string) =>
    fetch("/api/roleta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }).catch(() => {});

  const p = person;
  const opposite = p && me.vote && p.vote && p.vote !== me.vote;
  const question = ICEBREAKERS[ice];
  const dmText = `Oi @${p?.username ?? ""}! A roleta da Minha Bolha me juntou com você 🎲 ${question}`;
  const postText = p
    ? opposite
      ? `@${p.username} a roleta da Minha Bolha juntou um ${SIDE[me.vote!]} e um ${SIDE[p.vote!]} 🎲 Bora comparar nossas bolhas? ${question}`
      : `@${p.username} a roleta da Minha Bolha me juntou com você 🎲 ${question}`
    : "";
  const compareUrl = p ? withUtm(`${base}${comparePath(me.username, p.username)}`, "roleta") : "";

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {MODES.filter(([m]) => m !== "other" || me.vote).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 ${mode === m ? "bg-fg text-bg" : "bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-card p-5">
        {state === "spinning" ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <div className="roleta-spin text-5xl" aria-hidden>
              🎲
            </div>
            <div className="text-sm text-subtle">Sorteando…</div>
          </div>
        ) : state === "empty" || !p ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-subtle">
            <div className="text-4xl">🫥</div>
            Ninguém para sortear nesse modo ainda. Tente outro!
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-4">
              {p.avatar ? (
                <img src={p.avatar.replace("_normal", "_200x200")} alt="" className="h-20 w-20 shrink-0 rounded-full border-4" style={{ borderColor: sideColor(p.vote) }} />
              ) : (
                <div className="h-20 w-20 shrink-0 rounded-full border-4 bg-muted" style={{ borderColor: sideColor(p.vote) }} />
              )}
              <div className="min-w-0">
                <div className="truncate text-xl font-bold">{p.name}</div>
                <div className="truncate text-subtle">@{p.username}</div>
                <div className="mt-1 text-sm">
                  {p.vote ? (
                    <b style={{ color: sideColor(p.vote) }}>Time {SIDE[p.vote]}</b>
                  ) : (
                    <span className="text-subtle">Ainda sem lado</span>
                  )}
                  {(p.following || p.follower) && (
                    <span className="text-subtle">
                      {" · "}
                      {p.following && p.follower ? "Mútuo" : p.following ? "Você segue" : "Segue você"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-muted p-3">
                <div className="text-subtle">Bolha</div>
                <b>{p.tally.total >= 3 ? bubbleVerdict(p.tally).label : "Em formação 🌱"}</b>
                {p.tally.total > 0 && (
                  <div className="text-xs text-subtle">
                    {pct(p.tally.red, p.tally.total)}% Vermelho × {100 - pct(p.tally.red, p.tally.total)}% Verde
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-muted p-3">
                <div className="text-subtle">Em comum</div>
                <b>
                  {p.shared} {p.shared === 1 ? "conta" : "contas"}
                </b>
                <div className="text-xs text-subtle">que vocês dois seguem</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-subtle">
                <span>💡 Quebra-gelo</span>
                <button className="underline" onClick={() => setIce((i) => (i + 1) % ICEBREAKERS.length)}>
                  outra pergunta
                </button>
              </div>
              <div className="mt-1 font-medium">{question}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a
                className="rounded-full bg-fg px-4 py-2 font-semibold text-bg"
                href={`https://x.com/messages/compose?recipient_id=${p.id}&text=${encodeURIComponent(dmText)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => reached(p.id)}
              >
                💬 Mandar DM
              </a>
              <a
                className="rounded-full border border-line px-4 py-2"
                href={`https://x.com/intent/post?text=${encodeURIComponent(postText)}&url=${encodeURIComponent(compareUrl)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => reached(p.id)}
              >
                📣 Marcar num post
              </a>
              <Link className="rounded-full border border-line px-4 py-2" href={comparePath(me.username, p.username)}>
                🔍 Comparar bolhas
              </Link>
              <Link className="rounded-full border border-line px-4 py-2" href={sharePath(p.username)}>
                Ver bolha
              </Link>
              {opposite && <AskButton to={p.username} mySide={me.vote!} compact />}
            </div>
            <p className="mt-2 text-xs text-subtle">A DM só chega se @{p.username} aceitar mensagens de qualquer pessoa no X.</p>
          </div>
        )}
      </div>

      <button
        onClick={() => spin(mode, p?.id ?? "")}
        disabled={state === "spinning"}
        className="mt-4 w-full rounded-full bg-fg py-3 text-lg font-bold text-bg disabled:opacity-60"
      >
        🎲 Sortear outra pessoa
      </button>
    </div>
  );
}
