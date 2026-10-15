import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { notifyNetworkVoted } from "@/lib/push";
import { appUrl, getUserId } from "@/lib/session";

// Only one or the other — no blank/null vote. Removing the data is done by deleting the account.
const VOTES = new Set(["red", "green"]);

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { vote?: string | null };
  const vote = body.vote;
  if (!vote || !VOTES.has(vote)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const client = await db();
  const before = await client.execute({ sql: "SELECT vote FROM users WHERE id = ?", args: [uid] });
  await client.execute({
    // Votes are always public (the user consents to this before the first vote).
    sql: "UPDATE users SET vote = ?, visibility = 'public', voted_at = ? WHERE id = ?",
    args: [vote, Date.now(), uid],
  });
  const previous = (before.rows[0]?.vote as "red" | "green" | null | undefined) ?? null;
  if (previous !== vote) {
    await client.execute({
      sql: "INSERT INTO vote_changes (uid, from_vote, to_vote, at) VALUES (?, ?, ?, ?)",
      args: [uid, previous, vote, Date.now()],
    });
    const origin = appUrl(req);
    after(() =>
      // A switch (Red → Green or Green → Red) gets its own message.
      notifyNetworkVoted(uid, vote as "red" | "green", origin, previous)
        .then((sent) => console.log(`[push] ${uid} voted ${vote}${previous ? ` (was ${previous})` : ""}, notified ${sent}`))
        .catch((e) => console.error("[push] vote", e)),
    );
  }
  return NextResponse.json({ ok: true });
}
