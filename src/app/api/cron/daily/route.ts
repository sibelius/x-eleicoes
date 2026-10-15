import { NextResponse } from "next/server";
import { sendDailySummaries } from "@/lib/push";
import { appUrl } from "@/lib/session";

export const maxDuration = 300;

// Vercel Cron (vercel.json) calls this with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendDailySummaries(appUrl(req));
  console.log("[cron] daily summaries", result);
  return NextResponse.json(result);
}
