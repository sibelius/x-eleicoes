import { NextResponse, type NextRequest } from "next/server";
import { getUserId } from "@/lib/session";
import { parseUtm, recordUtm, rememberUtm } from "@/lib/utm";

const VISITOR = "xe_vid";

/** Someone arrived through a UTM-tagged link (or clicked a push notification). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const utm = parseUtm(String(body.url ?? ""));
  if (!utm) return NextResponse.json({ ok: false }, { status: 400 });
  const uid = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = uid ? `u:${uid}` : cookieId ?? crypto.randomUUID();
  await recordUtm("visit", visitor, utm);
  const res = NextResponse.json({ ok: true });
  rememberUtm(req, res, utm);
  if (!uid && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
