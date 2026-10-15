import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { CenterView } from "@/components/insights/CenterView";
import { Shimmer } from "@/components/Skeleton";
import { publicGraph } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Quem é o centro da rede · Minha Bolha",
  description: "PageRank, intermediação e proximidade: quem está no centro da rede de quem entrou na Minha Bolha.",
};

export default function Page({ searchParams }: PageProps<"/centro">) {
  return (
    <Suspense fallback={<Shimmer className="h-[70vh]" />}>
      <Center searchParams={searchParams} />
    </Suspense>
  );
}

async function Center({ searchParams }: { searchParams: PageProps<"/centro">["searchParams"] }) {
  await connection();
  const [g, sp] = await Promise.all([publicGraph(), searchParams]);
  return <CenterView g={g} u={typeof sp.u === "string" ? sp.u : undefined} base="" />;
}
