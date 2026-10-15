import { NextResponse, connection } from "next/server";
import { getRoom } from "@/lib/room";

/** Polled every few seconds by the live room. */
export async function GET() {
  await connection(); // per request (the room itself is cached for 10s)
  return NextResponse.json(await getRoom(), { headers: { "Cache-Control": "no-store" } });
}
