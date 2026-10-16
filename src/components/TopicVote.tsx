"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TopicSide } from "@/lib/topics";

/** Pick a side on a topic (public with your @, like Red × Green). */
export function TopicVote({
  topic,
  side,
  sides,
  disabled = false,
}: {
  topic: string;
  side: TopicSide | null;
  sides: Record<TopicSide, { label: string; color: string }>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [mine, setMine] = useState(side);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: TopicSide) {
    setError(null);
    start(async () => {
      const res = await fetch("/api/topic-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, side: next }),
      });
      if (!res.ok) return setError("Não foi possível salvar. Tente de novo.");
      setMine(next);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Seu lado</h2>
      <p className="mt-1 text-sm text-subtle">{disabled ? "Este tema foi encerrado." : "Sua escolha é pública e aparece com o seu @."}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(["a", "b"] as const).map((s) => (
          <button
            key={s}
            disabled={pending || disabled}
            onClick={() => save(s)}
            className={`rounded-xl border-2 px-4 py-5 text-lg font-bold transition disabled:opacity-40 ${mine === s ? "text-white" : "bg-card"}`}
            style={{ borderColor: sides[s].color, background: mine === s ? sides[s].color : undefined }}
          >
            {sides[s].label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
