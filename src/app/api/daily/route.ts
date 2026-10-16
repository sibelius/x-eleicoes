import { NextResponse, type NextRequest } from "next/server";
import { playDaily, playerKey } from "@/lib/daily";
import { getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

/** "Pergunta do dia": record today's guess (% Green) and return the answer, score, rank and streak. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { target?: unknown; guess?: unknown };
  const target = typeof body.target === "string" && /^[0-9]{1,25}$/.test(body.target) ? body.target : null;
  const guess = typeof body.guess === "number" ? Math.round(body.guess) : NaN;
  if (!target || !(guess >= 0 && guess <= 100)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const uid = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value ?? null;
  const visitor = cookieId ?? crypto.randomUUID();
  const result = await playDaily(playerKey(uid, visitor)!, uid, target, guess);
  // The question changed (new day) since the page loaded.
  if (!result) return NextResponse.json({ error: "stale" }, { status: 409 });
  const res = NextResponse.json(result);
  if (!uid && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
