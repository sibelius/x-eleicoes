import { NextResponse, connection } from "next/server";
import { getMapPoints } from "@/lib/network";

// Every account for the 2D map on /mapa. Same for everyone, so the CDN can serve it.
export async function GET() {
  await connection(); // live data, not frozen at build time
  const points = await getMapPoints();
  return NextResponse.json(points, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
