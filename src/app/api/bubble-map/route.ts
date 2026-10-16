import { NextResponse, connection, type NextRequest } from "next/server";
import { getBubbleMap, getGlobalBubbleMap } from "@/lib/bubble-map";

// Who follows whom among the people of a bubble (?u=<uid>; none = everyone), for the "Mapa" view.
// Fetched when the tab opens, so the dashboard doesn't wait for it.
export async function GET(req: NextRequest) {
  await connection();
  const u = req.nextUrl.searchParams.get("u");
  if (u !== null && !/^\w{1,40}$/.test(u)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const map = u ? await getBubbleMap(u) : await getGlobalBubbleMap();
  return NextResponse.json(map, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=3600" },
  });
}
