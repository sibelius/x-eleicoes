import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { SITE } from "@/lib/views-shared";

const VISITOR = "xe_vid";
const WINDOW = 2 * 60_000; // seen in the last 2 minutes = online

/** Heartbeat from the live bar: marks this visitor online and returns the site's live numbers. */
export async function POST(req: NextRequest) {
  const uid = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = uid ? `u:${uid}` : cookieId ?? crypto.randomUUID();
  const now = Date.now();
  const client = await db();
  const [, , online, today, members] = await client.batch(
    [
      { sql: "INSERT INTO presence (visitor, at) VALUES (?, ?) ON CONFLICT(visitor) DO UPDATE SET at = excluded.at", args: [visitor, now] },
      { sql: "DELETE FROM presence WHERE at < ?", args: [now - 24 * 3600_000] },
      { sql: "SELECT COUNT(*) AS n FROM presence WHERE at > ?", args: [now - WINDOW] },
      { sql: "SELECT COUNT(*) AS n FROM views WHERE uid = ? AND day = ?", args: [SITE, new Date(now).toISOString().slice(0, 10)] },
      "SELECT COUNT(*) AS n FROM users WHERE id GLOB '[0-9]*'",
    ],
    "write",
  );
  const res = NextResponse.json({
    online: Number(online.rows[0].n),
    today: Number(today.rows[0].n),
    members: Number(members.rows[0].n),
  });
  if (!uid && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
