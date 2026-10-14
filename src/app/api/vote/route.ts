import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

const VOTES = new Set(["lula", "bolsonaro", null]);
const VISIBILITY = new Set(["public", "network", "private"]);

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { vote?: string | null; visibility?: string };
  const vote = body.vote ?? null;
  if (!VOTES.has(vote) || !VISIBILITY.has(body.visibility ?? "")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const client = await db();
  await client.execute({
    sql: "UPDATE users SET vote = ?, visibility = ?, voted_at = ? WHERE id = ?",
    args: [vote, body.visibility!, vote ? Date.now() : null, uid],
  });
  return NextResponse.json({ ok: true });
}
