import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ListSkeleton } from "@/components/Skeleton";
import { LiveRoom } from "@/components/play/LiveRoom";
import { Bubble } from "@/components/Bubble";
import { daysToBigDay, isLiveNight, shareTweetUrl } from "@/lib/links";
import { getGlobalNetwork } from "@/lib/network";
import { appUrl } from "@/lib/session";
import { getRoom } from "@/lib/room";

export const metadata: Metadata = {
  title: "Ao vivo · Minha Bolha",
  description: "Vermelho × Verde ao vivo: o placar de todo mundo, quem está online de cada lado e cada escolha na hora.",
};

export default function LivePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav className="flex gap-4 text-sm">
        <Link href="/mapa" className="text-subtle underline">Mapa</Link>
        <Link href="/virada" className="text-subtle underline">Quem virou</Link>
        <Link href="/ranking" className="text-subtle underline">Ranking</Link>
      </nav>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">🔴 Ao vivo 🟢</h1>
      <Suspense fallback={<div className="mt-6"><ListSkeleton rows={8} /></div>}>
        <Live />
      </Suspense>
    </main>
  );
}

async function Live() {
  await connection();
  const [room, nodes] = await Promise.all([getRoom(), getGlobalNetwork()]);
  const tally = { red: room.totals.red, green: room.totals.green, total: room.totals.red + room.totals.green };
  const now = room.at;
  const days = daysToBigDay(now);
  return (
    <>
      <p className="mt-1 text-subtle">
        {isLiveNight(now)
          ? "É hoje! Cada escolha aparece aqui na hora."
          : days > 0
            ? `O placar de todo mundo, atualizado a cada poucos segundos. Faltam ${days} ${days === 1 ? "dia" : "dias"} para 25/10.`
            : "O placar de todo mundo, atualizado a cada poucos segundos."}
      </p>
      <div className="mt-6">
        <Bubble
          me={null}
          nodes={nodes}
          shareBase={appUrl()}
          title="A bolha de todo mundo, ao vivo"
          readOnly
          shareUrl={shareTweetUrl(appUrl(), null, tally)}
        />
      </div>
      <div className="mt-4">
        <LiveRoom initial={room} />
      </div>
    </>
  );
}
