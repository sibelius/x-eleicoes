import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { GlobalMap } from "@/components/GlobalMap";
import { StatesGrid } from "@/components/StatesMap";
import { Tour } from "@/components/Tour";
import { LiveRoom } from "@/components/play/LiveRoom";
import { isLiveNight } from "@/lib/links";
import { allStates } from "@/lib/places";
import { getMe } from "@/lib/network";
import { getRoom } from "@/lib/room";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Mapa de todas as bolhas · Minha Bolha",
  description: "Todas as contas da bolha das bolhas num mapa só. Busque um @ e veja quem está em volta.",
};

export default function MapPage({ searchParams }: PageProps<"/mapa">) {
  return (
    // Exactly one screen tall, over the site bar and footer, so the map and its bottom card always fit.
    <main className="fixed inset-x-0 top-0 z-40 flex h-dvh flex-col bg-bg">
      <nav className="flex items-center gap-3 px-3 pt-3 pb-1 text-sm">
        <Link href="/" className="text-subtle underline">
          Minha Bolha
        </Link>
        <Link href="/r" className="text-subtle underline">
          Todas as bolhas
        </Link>
        <Link href="/ranking" className="text-subtle underline">
          Ranking
        </Link>
        <Link href="/grafo" className="text-subtle underline">
          A rede
        </Link>
        <Link href="/ao-vivo" className="text-subtle underline">
          Ao vivo
        </Link>
        <span className="ml-auto">
          <Tour name="map" />
        </span>
      </nav>
      <Suspense fallback={null}>
        <LiveStrip searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="shimmer mx-3 mb-3 flex-1 rounded-xl" />}>
        <Views searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Two views of everyone: the map of bubbles (default) and the states cartogram (?ver=estados).
async function Views({ searchParams }: { searchParams: PageProps<"/mapa">["searchParams"] }) {
  const sp = await searchParams;
  const states = sp.ver === "estados";
  const tab = (on: boolean) => `rounded-full px-3 py-0.5 ${on ? "bg-fg text-bg" : ""}`;
  return (
    <>
      <div className="flex px-3 pb-2 text-sm">
        <div role="tablist" aria-label="Como ver" className="flex rounded-full border border-line p-0.5">
          <Link href="/mapa" role="tab" aria-selected={!states} className={tab(!states)}>
            Bolhas
          </Link>
          <Link href="/mapa?ver=estados" role="tab" aria-selected={states} className={tab(states)}>
            Estados
          </Link>
        </div>
      </div>
      {states ? <States /> : <Map searchParams={searchParams} />}
    </>
  );
}

async function States() {
  await connection();
  const states = await allStates();
  return (
    <section className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-line bg-card p-4">
      <h1 className="text-lg font-semibold">Vermelho × Verde por estado</h1>
      <p className="mb-3 text-sm text-subtle">Todo mundo que entrou no app e tem estado conhecido.</p>
      <StatesGrid states={states} everyone full />
    </section>
  );
}

// Centered on ?u=, else on the logged-in user, else the whole map.
async function Map({ searchParams }: { searchParams: PageProps<"/mapa">["searchParams"] }) {
  const sp = await searchParams;
  let center = typeof sp.u === "string" ? sp.u.trim().replace(/^@/, "") : "";
  if (!center) {
    const uid = await getUserId();
    center = (uid && (await getMe(uid))?.username) || "";
  }
  return <GlobalMap title="Mapa de todas as bolhas" center={center || null} page />;
}

// On the evening of the big day (or with ?aovivo=1) the map becomes a live room: the scoreboard sits on top.
async function LiveStrip({ searchParams }: { searchParams: PageProps<"/mapa">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  if (!isLiveNight() && sp.aovivo !== "1") return null;
  return <LiveRoom initial={await getRoom()} compact />;
}
