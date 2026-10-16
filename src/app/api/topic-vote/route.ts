import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getMe } from "@/lib/network";
import { getTopic, setTopicVote } from "@/lib/topics";
import { getUserId } from "@/lib/session";

// A member picks a side on a topic. Only live topics take votes (admins can also test drafts).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { topic?: string; side?: string };
  if (typeof body.topic !== "string" || (body.side !== "a" && body.side !== "b")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const topic = await getTopic(body.topic);
  if (!topic || (topic.status !== "live" && !(topic.status === "draft" && (await isAdmin())))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!(await getMe(uid))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setTopicVote(topic.id, uid, body.side);
  return NextResponse.json({ ok: true });
}
