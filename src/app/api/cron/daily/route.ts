import { NextResponse } from "next/server";
import { sendDailyQuestion, sendDailySummaries } from "@/lib/push";
import { appUrl } from "@/lib/session";

export const maxDuration = 300;

// Vercel Cron (vercel.json) calls this with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = appUrl(req);
  const result = await sendDailySummaries(origin).catch((e) => {
    console.error("[cron] daily summaries", e);
    return null;
  });
  console.log("[cron] daily summaries", result);
  // Then the "Pergunta do dia" nudge (18h in Brasília), even if the summaries failed.
  const question = await sendDailyQuestion(origin).catch((e) => {
    console.error("[cron] daily question", e);
    return null;
  });
  console.log("[cron] daily question", question);
  return NextResponse.json({ ...result, question });
}
