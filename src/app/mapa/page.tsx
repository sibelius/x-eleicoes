import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GlobalMap } from "@/components/GlobalMap";
import { Tour } from "@/components/Tour";
import { getMe } from "@/lib/network";
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
        <span className="ml-auto">
          <Tour name="map" />
        </span>
      </nav>
      <Suspense fallback={<div className="shimmer mx-3 mb-3 flex-1 rounded-xl" />}>
        <Map searchParams={searchParams} />
      </Suspense>
    </main>
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
