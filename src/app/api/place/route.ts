import { NextResponse } from "next/server";
import { getPlace, setPlaceSelf } from "@/lib/places";
import { getUserId } from "@/lib/session";
import { isUf } from "@/lib/uf";

// The member's own state: GET reads it, POST { uf: "SP" } sets it, POST { uf: null } hides it.
export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getPlace(uid), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { uf?: unknown };
  if (body.uf !== null && !isUf(body.uf)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await setPlaceSelf(uid, body.uf);
  return NextResponse.json({ ok: true, place: await getPlace(uid) });
}
