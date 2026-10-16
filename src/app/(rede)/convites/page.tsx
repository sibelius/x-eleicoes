import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { InvitesView } from "@/components/insights/InvitesView";
import { Shimmer } from "@/components/Skeleton";
import { publicGraph } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Árvore de convites",
  description: "Quem trouxe quem para a Minha Bolha, geração após geração.",
  alternates: { canonical: "/convites" },
};

export default function Page() {
  return (
    <Suspense fallback={<Shimmer className="h-[65vh]" />}>
      <Invites />
    </Suspense>
  );
}

async function Invites() {
  await connection();
  return <InvitesView g={await publicGraph()} base="" />;
}
