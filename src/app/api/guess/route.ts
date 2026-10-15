import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pct } from "@/lib/links";
import { getShare } from "@/lib/network";
import { getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

/** The guessing game: record a guess (% Green) for a bubble and return the real number and how others guessed. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { bubble?: unknown; guess?: unknown };
  const bubble = typeof body.bubble === "string" && /^[0-9]{1,25}$/.test(body.bubble) ? body.bubble : null;
  const guess = typeof body.guess === "number" ? Math.round(body.guess) : NaN;
  if (!bubble || !(guess >= 0 && guess <= 100)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const share = await getShare(bubble);
  if (!share) return NextResponse.json({ error: "not found" }, { status: 404 });
  const actual = share.tally.total ? 100 - pct(share.tally.red, share.tally.total) : 0;
  const uid = await getUserId();
  const cookieId = req.cookies.get(VISITOR)?.value;
  const visitor = uid ? `u:${uid}` : cookieId ?? crypto.randomUUID();
  const client = await db();
  const [, stats] = await client.batch(
    [
      {
        // First guess counts; guessing again doesn't overwrite it.
        sql: "INSERT OR IGNORE INTO guesses (bubble, visitor, guess, actual, at) VALUES (?, ?, ?, ?, ?)",
        args: [bubble, visitor, guess, actual, Date.now()],
      },
      {
        sql: `SELECT COUNT(*) AS n, AVG(guess) AS avg,
                SUM(CASE WHEN ABS(guess - ?) < ? THEN 1 ELSE 0 END) AS better
              FROM guesses WHERE bubble = ? AND visitor <> ?`,
        args: [actual, Math.abs(guess - actual), bubble, visitor],
      },
    ],
    "write",
  );
  const s = stats.rows[0];
  const n = Number(s.n);
  const res = NextResponse.json({
    actual,
    others: n,
    avg: n ? Math.round(Number(s.avg)) : null,
    // Share of the other guesses this one beat or tied.
    beat: n ? Math.round(((n - Number(s.better)) / n) * 100) : null,
  });
  if (!uid && !cookieId) {
    res.cookies.set(VISITOR, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
