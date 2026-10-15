import { NextResponse, after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifyInviteOpened } from "@/lib/push";
import { appUrl, getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

/** Someone landed on an invite link (/?ref=<id>): count them once a day and tell the inviter. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ref?: unknown };
  const ref = typeof body.ref === "string" && /^[0-9]{1,25}$/.test(body.ref) ? body.ref : null;
  if (!ref) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const uid = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = uid ? `u:${uid}` : cookieId ?? crypto.randomUUID();
  const res = NextResponse.json({ ok: true });
  if (!uid && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  if (uid === ref) return res; // opening your own link doesn't count
  const client = await db();
  const r = await client.execute({
    sql: `INSERT OR IGNORE INTO invite_opens (ref, visitor, day)
          SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`,
    args: [ref, visitor, new Date().toISOString().slice(0, 10), ref],
  });
  if (r.rowsAffected) {
    const origin = appUrl(req);
    after(() => notifyInviteOpened(ref, origin).catch((e) => console.error("[push] invite opened", e)));
  }
  return res;
}
