import type { Metadata } from "next";
import { Suspense } from "react";
import { TallyBar } from "@/components/TallyBar";
import { sharePath } from "@/lib/links";
import { Bubble } from "@/components/Bubble";
import { getGlobalNetwork, listMembers } from "@/lib/network";
import { appUrl } from "@/lib/session";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Todas as bolhas · Minha Rede Vota",
  description: "Veja a bolha e o voto de cada pessoa que já entrou no Minha Rede Vota.",
};

export default function MembersPage({ searchParams }: PageProps<"/r">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-subtle underline">
        Minha Rede Vota
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Todas as bolhas</h1>
      <p className="mt-1 text-subtle">Quem já entrou, como vota, e a bolha de cada um.</p>
      <Suspense fallback={<p className="mt-6 text-subtle">Carregando…</p>}>
        <Members searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Members({ searchParams }: { searchParams: PageProps<"/r">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().replace(/^@/, "") : "";
  const members = await listMembers(q);
  const lula = members.filter((m) => m.vote === "lula").length;
  const bolsonaro = members.filter((m) => m.vote === "bolsonaro").length;
  return (
    <>
      {!q && (
        <>
          <div className="mt-6 rounded-2xl border border-line bg-card p-4">
            <TallyBar tally={{ lula, bolsonaro, total: lula + bolsonaro }} />
          </div>
          <div className="mt-4">
            <Bubble me={null} nodes={await getGlobalNetwork()} shareBase={appUrl()} title="A bolha de todo mundo" readOnly />
          </div>
        </>
      )}
      <form className="mt-6 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar @ ou nome"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2"
        />
        <button className="rounded-full bg-fg px-4 py-2 text-bg">Buscar</button>
      </form>
      <p className="mt-3 text-sm text-subtle">
        {members.length} {members.length === 1 ? "pessoa" : "pessoas"}
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {members.map((m) => (
          <li key={m.id}>
            <a
              href={sharePath(m.username)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 hover:bg-muted"
            >
              {m.avatar ? (
                <img src={m.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full" />
              ) : (
                <span className="h-11 w-11 shrink-0 rounded-full bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.name}</span>
                <span className="block truncate text-sm text-subtle">@{m.username}</span>
              </span>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={
                  m.vote
                    ? { background: m.vote === "lula" ? "var(--lula)" : "var(--bolso)", color: "#fff" }
                    : { background: "var(--muted)", color: "var(--subtle)" }
                }
              >
                {m.vote === "lula" ? "Lula" : m.vote === "bolsonaro" ? "Bolsonaro" : "Não votou"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
