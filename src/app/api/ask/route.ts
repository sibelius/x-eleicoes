import { NextResponse, after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ASKS, askBlocked, isLive, saveMessage, type AskPreset } from "@/lib/messages";
import { getMe, resolveUser } from "@/lib/network";
import { notifyMessage } from "@/lib/push";
import { appUrl, getUserId } from "@/lib/session";

/**
 * Ask a member to change color, with a preset text. Delivered as a live toast when they're on the
 * site right now, else (or if the toast isn't picked up in 20s) as a web push.
 */
export async function POST(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "Entre com o X para pedir." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { to?: unknown; preset?: unknown };
  const preset = typeof body.preset === "string" && body.preset in ASKS ? (body.preset as AskPreset) : null;
  const target = typeof body.to === "string" ? await resolveUser(body.to) : null;
  if (!preset || !target) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const blocked = await askBlocked(uid, target.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  const me = (await getMe(uid))!;
  const side = me.vote!;
  const text = ASKS[preset](side);
  const live = await isLive(target.id);
  const id = await saveMessage({ from: uid, to: target.id, kind: "ask", preset, body: text, side, via: live ? "live" : "push" });
  const origin = appUrl(req);
  after(async () => {
    if (live) {
      await new Promise((r) => setTimeout(r, 20_000));
      const client = await db();
      const r = await client.execute({ sql: "SELECT live_at FROM messages WHERE id = ?", args: [id] });
      if (r.rows[0]?.live_at != null) return;
      await client.execute({ sql: "UPDATE messages SET via = 'live+push' WHERE id = ?", args: [id] });
    }
    const sent = await notifyMessage(target.id, me.username, "ask", text, origin).catch((e) => (console.error("[push] ask", e), 0));
    console.log(`[ask] @${me.username} → @${target.username} (${live ? "live" : "push"}), pushed ${sent}`);
  });
  return NextResponse.json({ ok: true, live });
}
