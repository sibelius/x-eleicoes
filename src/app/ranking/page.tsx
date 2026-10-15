import type { Metadata } from "next";
import { SupportStrip } from "@/components/SupportStrip";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { InviteBadge } from "@/components/InviteBadge";
import { pct, sharePath } from "@/lib/links";
import { getRankings, type Me, type Ranked } from "@/lib/network";

export const metadata: Metadata = {
  title: "Ranking das bolhas · Minha Bolha",
  description: "As bolhas mais fechadas no Vermelho e no Verde, as mais mistas, e quem mais trouxe gente.",
};

export default function RankingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Link href="/r" className="text-sm text-subtle underline">
        Todas as bolhas
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Ranking das bolhas</h1>
      <p className="mt-1 text-subtle">Quem vive na bolha mais fechada? E quem está no meio do fogo cruzado?</p>
      <div className="mt-4">
        <SupportStrip placement="ranking" />
      </div>
      <Suspense fallback={<p className="mt-6 text-subtle">Carregando…</p>}>
        <Boards />
      </Suspense>
    </main>
  );
}

async function Boards() {
  await connection(); // live data, not frozen at build time
  const r = await getRankings();
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Board title="🔒 Mais fechadas no Vermelho" rows={r.closedRed} stat={(m) => `${pct(m.tally.red, m.tally.total)}% Vermelho`} color="var(--red)" />
      <Board
        title="🔒 Mais fechadas no Verde"
        rows={r.closedGreen}
        stat={(m) => `${100 - pct(m.tally.red, m.tally.total)}% Verde`}
        color="var(--green)"
      />
      <Board title="⚖️ Mais mistas" rows={r.mixed} stat={(m) => `${pct(m.tally.red, m.tally.total)}% × ${100 - pct(m.tally.red, m.tally.total)}%`} />
      <Board title="📣 Quem mais trouxe gente" rows={r.inviters} stat={(m) => `${m.invites} ${m.invites === 1 ? "pessoa" : "pessoas"}`} />
    </div>
  );
}

function Board<T extends Me>({ title, rows, stat, color }: { title: string; rows: T[]; stat: (m: T) => string; color?: string }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">Ainda ninguém aqui. Chame sua rede!</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map((m, i) => (
            <li key={m.id}>
              <a href={sharePath(m.username)} className="flex items-center gap-3 rounded-xl p-1 hover:bg-muted">
                <span className="w-5 text-right text-sm text-subtle">{i + 1}</span>
                {m.avatar ? <img src={m.avatar} alt="" className="h-9 w-9 rounded-full" /> : <span className="h-9 w-9 rounded-full bg-muted" />}
                <span className="min-w-0 flex-1 truncate">
                  <b>@{m.username}</b> <InviteBadge invites={m.invites ?? 0} />
                  {"tally" in m && (
                    <span className="block text-xs text-subtle">{(m as unknown as Ranked).tally.total} escolhas na rede</span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-bold" style={{ color }}>
                  {stat(m)}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
