import { NextResponse } from "next/server";
import { getMapPoints } from "@/lib/network";

// Every account for the 2D map on /r. Same for everyone, so the CDN can serve it.
export async function GET() {
  const points = await getMapPoints();
  return NextResponse.json(points, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
