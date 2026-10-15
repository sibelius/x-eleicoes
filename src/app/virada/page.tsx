import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ListSkeleton } from "@/components/Skeleton";
import { Face } from "@/components/play/Face";
import { SIDE, pct, sharePath } from "@/lib/links";
import { getSwing } from "@/lib/social";

export const metadata: Metadata = {
  title: "Quem virou · Minha Bolha",
  description: "Quem trocou de lado, quantos foram para cada lado, e as bolhas divididas ao meio.",
};

export default function SwingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <nav className="flex gap-4 text-sm">
        <Link href="/ranking" className="text-subtle underline">Ranking</Link>
        <Link href="/ao-vivo" className="text-subtle underline">Ao vivo</Link>
        <Link href="/r" className="text-subtle underline">Todas as bolhas</Link>
      </nav>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Quem virou</h1>
      <p className="mt-1 text-subtle">Quem trocou de lado, e as bolhas onde qualquer voto decide.</p>
      <Suspense fallback={<div className="mt-6"><ListSkeleton rows={10} /></div>}>
        <Swing />
      </Suspense>
    </main>
  );
}

function when(at: number) {
  return new Date(at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function Swing() {
  await connection();
  const { switches, feed, flow, edge } = await getSwing();
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-line bg-card p-4 md:col-span-2">
        <h2 className="text-lg font-semibold">Trocas de lado</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-muted p-3">
            <div className="text-3xl font-bold" style={{ color: "var(--green)" }}>{flow.toGreen}</div>
            <div className="text-sm text-subtle">🔴 → 🟢 foram para o Verde</div>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <div className="text-3xl font-bold" style={{ color: "var(--red)" }}>{flow.toRed}</div>
            <div className="text-sm text-subtle">🟢 → 🔴 foram para o Vermelho</div>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">🔁 Viraram</h2>
        {switches.length === 0 ? (
          <p className="mt-2 text-sm text-subtle">Ninguém trocou de lado ainda. Abaixo, as últimas escolhas.</p>
        ) : (
          <Feed rows={switches} />
        )}
        {switches.length < 5 && feed.length > 0 && (
          <>
            <h3 className="mt-4 font-semibold">Últimas escolhas</h3>
            <Feed rows={feed.filter((e) => !e.from).slice(0, 15)} />
          </>
        )}
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">⚖️ No fio da navalha</h2>
        <p className="mt-1 text-sm text-subtle">Bolhas entre 40% e 60%: aqui uma escolha muda o placar.</p>
        {edge.length === 0 ? (
          <p className="mt-2 text-sm text-subtle">Nenhuma bolha dividida ao meio por enquanto.</p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {edge.map((m) => {
              const r = pct(m.tally.red, m.tally.total);
              return (
                <li key={m.id}>
                  <a href={sharePath(m.username)} className="flex items-center gap-3 rounded-xl p-1 hover:bg-muted">
                    <Face src={m.avatar} size={36} vote={m.vote} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">@{m.username}</b>
                      <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
                        <span style={{ width: `${r}%`, background: "var(--red)" }} />
                        <span style={{ width: `${100 - r}%`, background: "var(--green)" }} />
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {m.tally.red} × {m.tally.green}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Feed({ rows }: { rows: Awaited<ReturnType<typeof getSwing>>["feed"] }) {
  return (
    <ul className="mt-3 grid gap-2 text-sm">
      {rows.map((e) => (
        <li key={`${e.id}${e.at}`} className="flex items-center gap-2">
          <Face src={e.avatar} vote={e.to} />
          <a href={sharePath(e.username)} className="min-w-0 flex-1 truncate">
            <b>@{e.username}</b>{" "}
            {e.from ? (
              <>
                {e.from === "red" ? "🔴 → 🟢" : "🟢 → 🔴"} foi para o <b style={{ color: `var(--${e.to})` }}>{SIDE[e.to]}</b>
              </>
            ) : (
              <>
                escolheu <b style={{ color: `var(--${e.to})` }}>{SIDE[e.to]}</b>
              </>
            )}
          </a>
          <span className="shrink-0 text-xs text-subtle">{when(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}
