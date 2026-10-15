import { Suspense } from "react";
import { connection } from "next/server";
import { CenterView } from "@/components/insights/CenterView";
import { Shimmer } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { getGraphAnalysis } from "@/lib/graph";

export default function CenterPage({ searchParams }: PageProps<"/admin/centro">) {
  return (
    <Suspense fallback={<Shimmer className="h-[70vh]" />}>
      <Center searchParams={searchParams} />
    </Suspense>
  );
}

async function Center({ searchParams }: { searchParams: PageProps<"/admin/centro">["searchParams"] }) {
  await connection();
  await requireAdmin();
  const [g, sp] = await Promise.all([getGraphAnalysis(), searchParams]);
  return <CenterView g={g} u={typeof sp.u === "string" ? sp.u : undefined} base="/admin" />;
}
