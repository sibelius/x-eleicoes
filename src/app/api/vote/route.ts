import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

// Only one or the other — no blank/null vote. Removing the data is done by deleting the account.
const VOTES = new Set(["lula", "bolsonaro"]);

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { vote?: string | null };
  const vote = body.vote;
  if (!vote || !VOTES.has(vote)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const client = await db();
  await client.execute({
    // Votes are always public (the user consents to this before the first vote).
    sql: "UPDATE users SET vote = ?, visibility = 'public', voted_at = ? WHERE id = ?",
    args: [vote, Date.now(), uid],
  });
  return NextResponse.json({ ok: true });
}
