import { NextResponse, connection } from "next/server";
import { audienceCsv, getAudience } from "@/lib/audience";
import { getMe } from "@/lib/network";
import { getUserId } from "@/lib/session";

// The signed-in member's ranked audience as a CSV download.
export async function GET() {
  await connection();
  const uid = await getUserId();
  if (!uid) return new NextResponse("Não autorizado", { status: 401 });
  const [me, audience] = await Promise.all([getMe(uid), getAudience(uid)]);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(audienceCsv(audience), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audiencia-${(me?.username ?? uid).replace(/[^\w-]/g, "")}-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
