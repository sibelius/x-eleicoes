import { NextResponse, connection } from "next/server";
import { recentPicks, stateHistory } from "@/lib/places";

export type EstadosLive = { history: Awaited<ReturnType<typeof stateHistory>>; feed: Awaited<ReturnType<typeof recentPicks>> };

// The live states map (/mapa?ver=estados), polled every minute: per-state per-day totals (3+ people)
// and the latest public picks. Never who lives where.
export async function GET() {
  await connection();
  const [history, feed] = await Promise.all([stateHistory(), recentPicks()]);
  return NextResponse.json({ history, feed } satisfies EstadosLive, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
  });
}
