import { Suspense } from "react";
import { connection } from "next/server";
import { InvitesView } from "@/components/insights/InvitesView";
import { Shimmer } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { getGraphAnalysis } from "@/lib/graph";

export default function InvitesPage() {
  return (
    <Suspense fallback={<Shimmer className="h-[65vh]" />}>
      <Invites />
    </Suspense>
  );
}

async function Invites() {
  await connection();
  await requireAdmin();
  return <InvitesView g={await getGraphAnalysis()} base="/admin" />;
}
