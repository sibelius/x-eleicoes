import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = (await req.json().catch(() => ({}))) as Sub;
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const client = await db();
  await client.execute({
    sql: `INSERT INTO push_subs (endpoint, uid, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [sub.endpoint, uid, sub.keys.p256dh, sub.keys.auth, Date.now()],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as Sub;
  const client = await db();
  await client.execute({ sql: "DELETE FROM push_subs WHERE endpoint = ? AND uid = ?", args: [endpoint ?? "", uid] });
  return NextResponse.json({ ok: true });
}
