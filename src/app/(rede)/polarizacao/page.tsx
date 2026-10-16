import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PolarizationView } from "@/components/insights/PolarizationView";
import { PageSkeleton } from "@/components/Skeleton";
import { publicGraph, publicLeans } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Polarização",
  description: "As bolhas são fechadas? Quem segue quem do outro lado, e quem faz a ponte entre Vermelho e Verde.",
  alternates: { canonical: "/polarizacao" },
};

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <Polarization />
    </Suspense>
  );
}

async function Polarization() {
  await connection();
  const [g, leans] = await Promise.all([publicGraph(), publicLeans()]);
  return <PolarizationView g={g} leans={leans} base="" />;
}
