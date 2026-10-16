import { NextResponse, type NextRequest } from "next/server";
import { claimDonation, toCents } from "@/lib/donations";
import { getMe } from "@/lib/network";
import { getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

/** "Já doei": a donor tells us about a Pix (pending until the admin sees it on the statement). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { amount?: unknown; name?: unknown; public?: unknown };
  const amount = toCents(body.amount);
  if (amount == null) return NextResponse.json({ ok: false, error: "Informe um valor entre R$ 1 e R$ 100.000." }, { status: 400 });
  const uid = await getUserId();
  const me = uid ? await getMe(uid) : null;
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = cookieId ?? crypto.randomUUID();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  // Rate limit per member; else per visitor cookie (or per IP when the cookie is missing).
  const who = me ? `u:${me.id}` : cookieId ? `v:${cookieId}` : `ip:${ip ?? "?"}`;
  const name = typeof body.name === "string" && body.name.trim() ? body.name : me ? `@${me.username}` : null;
  const error = await claimDonation({ amount, uid: me?.id ?? null, name, public: body.public === true, who });
  if (error) return NextResponse.json({ ok: false, error }, { status: 429 });
  const res = NextResponse.json({ ok: true });
  if (!me && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

/** Who is donating, to prefill the name (the @handle of a signed-in member). */
export async function GET() {
  const uid = await getUserId();
  const me = uid ? await getMe(uid) : null;
  return NextResponse.json({ handle: me ? me.username : null });
}
