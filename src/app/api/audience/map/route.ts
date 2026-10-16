import { NextResponse, connection } from "next/server";
import { getAudienceMap } from "@/lib/audience";
import { getUserId } from "@/lib/session";

// The signed-in member's audience map (/audiencia), loaded after the page so it stays fast.
export async function GET() {
  await connection();
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getAudienceMap(uid), { headers: { "Cache-Control": "private, max-age=60" } });
}
