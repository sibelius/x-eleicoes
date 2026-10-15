import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

const VISITOR = "xe_vid";
const WATCH_WINDOW = 60_000; // the bubble heartbeats every 20s
const ONLINE_WINDOW = 2 * 60_000; // same as the live bar

export type LiveViewer = { username: string; avatar: string | null };
export type Live = { watching: number; people: LiveViewer[]; online: string[] };

/**
 * Heartbeat from a bubble on screen: marks this visitor as watching it, and returns who else is
 * watching it now (signed-in people by name, the rest as a count) and which members are online.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { bubble?: unknown };
  const bubble = typeof body.bubble === "string" && /^(_all|[0-9]{1,25})$/.test(body.bubble) ? body.bubble : null;
  if (!bubble) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const uid = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = uid ? `u:${uid}` : cookieId ?? crypto.randomUUID();
  const now = Date.now();
  const client = await db();
  const [, , viewers, online] = await client.batch(
    [
      {
        sql: "INSERT INTO watching (visitor, bubble, at) VALUES (?, ?, ?) ON CONFLICT(visitor) DO UPDATE SET bubble = excluded.bubble, at = excluded.at",
        args: [visitor, bubble, now],
      },
      { sql: "DELETE FROM watching WHERE at < ?", args: [now - 3600_000] },
      {
        // Everyone else on this bubble, minus its owner.
        sql: `SELECT u.username, COALESCE(u.avatar, p.avatar) AS avatar FROM watching w
              LEFT JOIN users u ON w.visitor = 'u:' || u.id LEFT JOIN profiles p ON p.id = u.id
              WHERE w.bubble = ? AND w.at > ? AND w.visitor <> ? AND w.visitor <> ?`,
        args: [bubble, now - WATCH_WINDOW, visitor, `u:${bubble}`],
      },
      {
        sql: "SELECT substr(visitor, 3) AS id FROM presence WHERE at > ? AND visitor LIKE 'u:%' LIMIT 1000",
        args: [now - ONLINE_WINDOW],
      },
    ],
    "write",
  );
  const live: Live = {
    watching: viewers.rows.length,
    people: viewers.rows
      .filter((r) => r.username)
      .slice(0, 12)
      .map((r) => ({ username: String(r.username), avatar: (r.avatar as string | null) ?? null })),
    online: online.rows.map((r) => String(r.id)),
  };
  const res = NextResponse.json(live);
  if (!uid && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
