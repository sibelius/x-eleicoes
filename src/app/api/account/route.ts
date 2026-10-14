import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUrl, getUserId, sessionCookie } from "@/lib/session";

// LGPD: deletes the user, their vote and every edge they imported or appear in.
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
      { sql: "DELETE FROM users WHERE id = ?", args: [uid] },
    ],
    "write",
  );
  return res;
}
