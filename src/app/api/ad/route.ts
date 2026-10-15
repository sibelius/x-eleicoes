import { NextResponse, type NextRequest } from "next/server";
import { AD_NAMES } from "@/lib/ads";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

type AdEvent = { ad: string; placement: string; kind: "view" | "click" };

// Ad impressions (an ad was on screen) and clicks, sent in small batches by the carousel.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { events?: unknown };
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter(
      (e): e is AdEvent =>
        !!e &&
        typeof e === "object" &&
        AD_NAMES.has((e as AdEvent).ad) &&
        typeof (e as AdEvent).placement === "string" &&
        /^[a-z0-9-]{1,32}$/.test((e as AdEvent).placement) &&
        ((e as AdEvent).kind === "view" || (e as AdEvent).kind === "click"),
    )
    .slice(0, 20);
  const viewer = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = viewer ? `u:${viewer}` : cookieId ?? crypto.randomUUID();
  if (events.length) {
    const day = new Date().toISOString().slice(0, 10);
    const client = await db();
    await client.batch(
      events.map((e) => ({
        sql: `INSERT INTO ad_stats (ad, placement, visitor, day, views, clicks) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (ad, placement, visitor, day) DO UPDATE SET
                views = views + excluded.views, clicks = clicks + excluded.clicks`,
        args: [e.ad, e.placement, visitor, day, e.kind === "view" ? 1 : 0, e.kind === "click" ? 1 : 0],
      })),
      "write",
    );
  }
  const res = NextResponse.json({ ok: true });
  if (!viewer && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
