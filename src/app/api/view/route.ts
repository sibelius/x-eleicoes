import { NextResponse, after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifyBubbleViewed } from "@/lib/push";
import { appUrl, getUserId } from "@/lib/session";
import { SITE } from "@/lib/views-shared";

const VISITOR = "xe_vid";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && /^(_site|[0-9]{1,25})$/.test(x)))].slice(0, 3)
    : [];
  const viewer = await getUserId();
  // Signed-in people count as themselves across devices; others get an anonymous cookie.
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = viewer ? `u:${viewer}` : cookieId ?? crypto.randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  const client = await db();
  const fresh: string[] = [];
  for (const uid of ids) {
    if (uid === viewer) continue; // your own visits don't count
    const r = await client.execute({
      sql: "INSERT OR IGNORE INTO views (uid, visitor, day) VALUES (?, ?, ?)",
      args: [uid, visitor, day],
    });
    if (r.rowsAffected && uid !== SITE) fresh.push(uid);
  }
  if (fresh.length) {
    const origin = appUrl(req);
    after(() => Promise.all(fresh.map((uid) => notifyBubbleViewed(uid, origin).catch((e) => console.error("[push] view", e)))));
  }
  const res = NextResponse.json({ ok: true });
  if (!viewer && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
