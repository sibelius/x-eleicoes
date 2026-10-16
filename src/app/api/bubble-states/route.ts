import { NextResponse, connection, type NextRequest } from "next/server";
import { allStates, bubbleStates } from "@/lib/places";

// Red × Green by state among the people of a bubble (?u=<uid>; none = everyone), for the "Estados" view.
// Aggregates only: a state with fewer than 3 people says just that.
export async function GET(req: NextRequest) {
  await connection();
  const u = req.nextUrl.searchParams.get("u");
  if (u !== null && !/^\w{1,40}$/.test(u)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const states = u ? await bubbleStates(u) : await allStates();
  return NextResponse.json(states, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=3600" },
  });
}
