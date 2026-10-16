import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getTopic, parseTopic, saveTopic } from "@/lib/topics";

// Admin: create or edit a topic (the slug is the key).
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTopic(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // A new topic can't take over an existing slug.
  if (body.create && (await getTopic(parsed.topic.id))) return NextResponse.json({ error: "Já existe um tema com esse slug." }, { status: 409 });
  await saveTopic(parsed.topic);
  return NextResponse.json({ ok: true, id: parsed.topic.id });
}
