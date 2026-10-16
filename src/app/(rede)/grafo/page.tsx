import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { GraphView } from "@/components/insights/GraphView";
import { Shimmer } from "@/components/Skeleton";
import { publicGraph } from "@/lib/insights";

export const metadata: Metadata = {
  title: "O grafo da rede",
  description: "Quem segue quem entre todo mundo que entrou: comunidades, influência e as pontes entre Vermelho e Verde.",
  alternates: { canonical: "/grafo" },
};

export default function Page() {
  return (
    <Suspense fallback={<Shimmer className="h-[70vh]" />}>
      <Graph />
    </Suspense>
  );
}

async function Graph() {
  await connection();
  return <GraphView g={await publicGraph()} base="" />;
}
