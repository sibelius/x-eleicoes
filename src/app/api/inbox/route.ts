import { NextResponse, after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { REPLIES, isLive, markSeen, saveMessage, takeLive, type ReplyPreset } from "@/lib/messages";
import { getMe } from "@/lib/network";
import { notifyMessage } from "@/lib/push";
import { appUrl, getUserId } from "@/lib/session";

/** Polled by the toast while the site is open: new messages for the signed-in member. */
export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ messages: [] }, { status: 401 });
  return NextResponse.json({ messages: await takeLive(uid) }, { headers: { "Cache-Control": "no-store" } });
}

/** Dismiss a message ({id}), answer it ({id, reply}), or mute/unmute asks ({mute}). */
export async function POST(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; reply?: unknown; mute?: unknown };
  const client = await db();
  if (typeof body.mute === "boolean") {
    await client.execute(
      body.mute
        ? { sql: "INSERT OR IGNORE INTO ask_mutes (uid, at) VALUES (?, ?)", args: [uid, Date.now()] }
        : { sql: "DELETE FROM ask_mutes WHERE uid = ?", args: [uid] },
    );
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.id === "number" ? body.id : NaN;
  const msg = Number.isFinite(id) ? await markSeen(uid, id) : null;
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
  const reply = typeof body.reply === "string" && body.reply in REPLIES ? (body.reply as ReplyPreset) : null;
  // Only asks get answers, once each.
  if (reply && msg.kind === "ask") {
    const answered = await client.execute({ sql: "SELECT 1 FROM messages WHERE kind = 'reply' AND from_uid = ? AND to_uid = ? AND at > ?", args: [uid, msg.from.id, msg.at] });
    if (!answered.rows.length) {
      const me = (await getMe(uid))!;
      const text = REPLIES[reply]();
      const live = await isLive(msg.from.id);
      await saveMessage({ from: uid, to: msg.from.id, kind: "reply", preset: reply, body: text, side: me.vote, via: live ? "live" : "push" });
      if (!live) {
        const origin = appUrl(req);
        after(() => notifyMessage(msg.from.id, me.username, "reply", text, origin).catch((e) => console.error("[push] reply", e)));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
