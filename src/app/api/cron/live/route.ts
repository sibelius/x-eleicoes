import { NextResponse } from "next/server";
import { sendLiveNight } from "@/lib/push";
import { appUrl } from "@/lib/session";

export const maxDuration = 300;

// Vercel Cron (vercel.json) on the evening of the big day: one push per member about their own bubble.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendLiveNight(appUrl(req), "live-2026-10-25");
  console.log("[cron] live night", result);
  return NextResponse.json(result);
}
