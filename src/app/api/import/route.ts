import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertMany } from "@/lib/sql";
import { getUserId } from "@/lib/session";

const MAX_IDS = 50_000;
const ID = /^\d{1,25}$/;

// Receives account ids parsed in the browser from the user's X archive (data/following.js, data/follower.js).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { following?: unknown; followers?: unknown };
  const clean = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, MAX_IDS) : [];
  const following = clean(body.following);
  const followers = clean(body.followers);
  const pairs = [...following.map((id) => [uid, id]), ...followers.map((id) => [id, uid])];
  const client = await db();
  // A few multi-row statements, each committed on its own (no long transaction holding edges).
  for (const stmt of insertMany("INSERT OR IGNORE INTO edges (src, dst)", pairs, "", 1000)) await client.execute(stmt);
  return NextResponse.json({ ok: true, following: following.length, followers: followers.length });
}
