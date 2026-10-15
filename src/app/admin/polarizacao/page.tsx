import { Suspense } from "react";
import { connection } from "next/server";
import { PolarizationView } from "@/components/insights/PolarizationView";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { getGraphAnalysis } from "@/lib/graph";
import { getBubbleLeans } from "@/lib/stats";

export default function PolarizationPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <Polarization />
    </Suspense>
  );
}

async function Polarization() {
  await connection();
  await requireAdmin();
  const [g, leans] = await Promise.all([getGraphAnalysis(), getBubbleLeans()]);
  return <PolarizationView g={g} leans={leans} base="/admin" />;
}
