import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
  const stmts = [
    ...following.map((id) => ({ sql: "INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)", args: [uid, id] })),
    ...followers.map((id) => ({ sql: "INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)", args: [id, uid] })),
  ];
  const client = await db();
  for (let i = 0; i < stmts.length; i += 2000) await client.batch(stmts.slice(i, i + 2000), "write");
  return NextResponse.json({ ok: true, following: following.length, followers: followers.length });
}
