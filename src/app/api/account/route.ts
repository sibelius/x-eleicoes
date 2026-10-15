import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUrl, getUserId, sessionCookie } from "@/lib/session";

// LGPD: deletes the user, their choice, every edge they imported or appear in,
// and everything else tied to their id (push subscriptions, view counts, snapshots, profile cache).
export async function POST(req: Request) {
  const uid = await getUserId();
  const res = NextResponse.redirect(`${appUrl(req)}/`, 303);
  res.cookies.delete(sessionCookie.name);
  if (!uid) return res;
  const client = await db();
  await client.batch(
    [
      { sql: "DELETE FROM edges WHERE src = ? OR dst = ?", args: [uid, uid] },
      { sql: "UPDATE users SET invited_by = NULL WHERE invited_by = ?", args: [uid] },
      { sql: "DELETE FROM push_subs WHERE uid = ?", args: [uid] },
      { sql: "DELETE FROM views WHERE uid = ? OR visitor = ?", args: [uid, `u:${uid}`] },
      { sql: "DELETE FROM presence WHERE visitor = ?", args: [`u:${uid}`] },
      { sql: "DELETE FROM view_pushes WHERE uid = ?", args: [uid] },
      { sql: "DELETE FROM tally_snapshots WHERE uid = ?", args: [uid] },
      { sql: "DELETE FROM follow_imports WHERE uid = ?", args: [uid] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [uid] },
      { sql: "DELETE FROM users WHERE id = ?", args: [uid] },
    ],
    "write",
  );
  return res;
}
