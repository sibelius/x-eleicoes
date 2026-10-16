import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Donate } from "@/components/Donate";
import { DonationGoal } from "@/components/DonationGoal";
import { Shimmer } from "@/components/Skeleton";
import { SupporterWall } from "@/components/SupporterWall";
import { AD_DM_URL as AD_DM } from "@/lib/links";

export const metadata: Metadata = {
  title: "Apoie · Minha Bolha",
  description: "Ajude a manter a Minha Bolha no ar: doe via Pix ou anuncie aqui.",
};

export default function ApoiePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm text-subtle underline">
        Minha Bolha
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Apoie o projeto</h1>
      <p className="mt-1 text-subtle">
        A Minha Bolha é gratuita e de código aberto. Servidores e a busca de quem você segue no X custam dinheiro:
        qualquer valor ajuda a manter tudo no ar.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">🎯 Meta do mês</h2>
        <Suspense fallback={<Shimmer className="h-16 w-full" />}>
          <DonationGoal />
        </Suspense>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">💚 Doe via Pix</h2>
        <Donate />
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">🙌 Mural de apoiadores</h2>
        <p className="mb-3 text-sm text-subtle">Quem doou e quis aparecer aqui, do mais recente ao mais antigo.</p>
        <Suspense fallback={<Shimmer className="h-10 w-full" />}>
          <SupporterWall />
        </Suspense>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">📢 Anuncie aqui</h2>
        <p className="mt-1 text-sm text-subtle">
          Milhares de pessoas vendo e compartilhando suas bolhas no X. Veja os números de audiência e fale direto comigo para
          colocar sua marca aqui.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/anuncie" className="inline-block rounded-full border border-line px-4 py-2 text-sm">
            Ver audiência e espaços
          </Link>
          <a href={AD_DM} target="_blank" rel="noreferrer" className="inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg">
            Comprar anúncio (mensagem no X)
          </a>
        </div>
      </section>
    </main>
  );
}
