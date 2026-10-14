import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TallyBar } from "@/components/TallyBar";
import { getShare } from "@/lib/network";

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return {};
  return {
    title: `Como a rede de @${share.user.username} vota`,
    description: "Entre com o X e veja como a sua rede vota: Lula ou Bolsonaro.",
  };
}

export default function SharePage({ params }: PageProps<"/r/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <Suspense fallback={<p className="text-subtle">Carregando…</p>}>
        <Share params={params} />
      </Suspense>
    </main>
  );
}

async function Share({ params }: { params: PageProps<"/r/[id]">["params"] }) {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) notFound();
  return (
    <>
      <div className="flex items-center gap-3">
        {share.user.avatar && <img src={share.user.avatar} alt="" className="h-12 w-12 rounded-full" />}
        <div>
          <div className="text-xl font-bold">{share.user.name}</div>
          <div className="text-subtle">@{share.user.username}</div>
        </div>
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Como a rede de @{share.user.username} vota</h1>
      {share.vote && (
        <p className="mt-2 text-subtle">
          @{share.user.username} vota{" "}
          <b style={{ color: share.vote === "lula" ? "var(--lula)" : "var(--bolso)" }}>
            {share.vote === "lula" ? "Lula" : "Bolsonaro"}
          </b>
        </p>
      )}
      <div className="mt-6 rounded-2xl border border-line bg-card p-4">
        <TallyBar tally={share.tally} />
      </div>
      <a
        href={`/?ref=${encodeURIComponent(share.user.id)}`}
        className="mt-6 self-start rounded-full bg-fg px-6 py-3 font-semibold text-bg"
      >
        Ver como a minha rede vota
      </a>
    </>
  );
}
