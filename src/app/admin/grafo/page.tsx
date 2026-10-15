import { Suspense } from "react";
import { connection } from "next/server";
import { GraphView } from "@/components/insights/GraphView";
import { Shimmer } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { getGraphAnalysis } from "@/lib/graph";

export default function GraphPage() {
  return (
    <Suspense fallback={<Shimmer className="h-[70vh]" />}>
      <Graph />
    </Suspense>
  );
}

async function Graph() {
  await connection();
  await requireAdmin();
  return <GraphView g={await getGraphAnalysis()} base="/admin" />;
}
