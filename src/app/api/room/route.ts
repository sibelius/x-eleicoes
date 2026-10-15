import { NextResponse } from "next/server";
import { getRoom } from "@/lib/room";

/** Polled every few seconds by the live room. */
export async function GET() {
  return NextResponse.json(await getRoom(), { headers: { "Cache-Control": "no-store" } });
}
