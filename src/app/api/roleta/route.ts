import { NextResponse, after, type NextRequest } from "next/server";
import { getMe } from "@/lib/network";
import { MODES, draw, notifyDrawn, type RouletteMode } from "@/lib/roulette";
import { appUrl, getUserId } from "@/lib/session";

/** Draw a random member: ?mode=any|other|network|outside&skip=<id of the last one>. */
export async function GET(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await getMe(uid);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const mode = (MODES as string[]).includes(q.get("mode") ?? "") ? (q.get("mode") as RouletteMode) : "any";
  const person = await draw(me, mode, q.get("skip") ?? "");
  return NextResponse.json({ person }, { headers: { "Cache-Control": "no-store" } });
}

/** The viewer reached out (DM or post on X): let the drawn member know, once a day. */
export async function POST(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { to } = (await req.json().catch(() => ({}))) as { to?: unknown };
  const me = await getMe(uid);
  if (!me || typeof to !== "string" || !/^[0-9]+$/.test(to) || to === uid) return NextResponse.json({ ok: false }, { status: 400 });
  const origin = appUrl(req);
  after(() => notifyDrawn(to, me, origin).catch((e) => console.error("[push] roleta", e)));
  return NextResponse.json({ ok: true });
}
