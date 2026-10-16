import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageSkeleton } from "@/components/Skeleton";
import { Roulette } from "@/components/play/Roulette";
import { getMe } from "@/lib/network";
import { appUrl, getUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Roleta",
  description: "Conheça alguém aleatório da Minha Bolha, do seu lado ou do outro, e puxe conversa no X.",
  robots: { index: false },
};

export default function RoletaPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <Suspense fallback={<PageSkeleton list={0} />}>
        <Roleta />
      </Suspense>
    </main>
  );
}

async function Roleta() {
  const uid = await getUserId();
  if (!uid) redirect("/");
  const me = await getMe(uid);
  if (!me) redirect("/");
  return (
    <>
      <Link href="/app" className="text-sm text-subtle underline">
        ← Minha bolha
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">🎲 Roleta</h1>
      <p className="mt-1 text-subtle">
        Conheça alguém aleatório da Minha Bolha, do seu lado ou do outro, e puxe conversa no X. Quem você tirar recebe um
        aviso quando você mandar DM ou marcar num post.
      </p>
      <div className="mt-5">
        <Roulette me={{ id: me.id, username: me.username, vote: me.vote }} base={appUrl()} />
      </div>
      <p className="mt-6 text-xs text-subtle">
        Não quer aparecer na roleta? Desative os pedidos em{" "}
        <Link href="/mensagens" className="underline">
          Mensagens
        </Link>
        : quem desativa não é sorteado.
      </p>
    </>
  );
}
