import { NextResponse, after, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { KINDS, STATUSES, addFeedback, notifyFeedback, setFeedbackStatus, type Kind, type Status } from "@/lib/feedback";
import { getMe } from "@/lib/network";
import { appUrl, getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

/** Anyone (signed in or not) sends feedback; the admins get a push. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; body?: unknown; page?: unknown; contact?: unknown };
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (body.length < 3) return NextResponse.json({ error: "Escreva um pouco mais 🙂" }, { status: 400 });
  const kind: Kind = typeof b.kind === "string" && b.kind in KINDS ? (b.kind as Kind) : "other";
  const page = typeof b.page === "string" ? b.page.slice(0, 200) : "";
  const contact = typeof b.contact === "string" && b.contact.trim() ? b.contact.trim().slice(0, 200) : null;
  const uid = await getUserId();
  const sender = uid ? `u:${uid}` : (req.cookies.get(VISITOR)?.value ?? `ip:${req.headers.get("x-forwarded-for")?.split(",")[0] ?? "?"}`);
  const id = await addFeedback({ sender, uid, kind, body, page, contact });
  if (id == null) return NextResponse.json({ error: "Muitos envios seguidos. Tente de novo mais tarde." }, { status: 429 });
  const origin = appUrl(req);
  after(async () => {
    const me = uid ? await getMe(uid) : null;
    await notifyFeedback({ kind, body, username: me?.username ?? null }, origin).catch((e) => console.error("[push] feedback", e));
  });
  return NextResponse.json({ ok: true });
}

/** Admin: mark as read / done. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
  if (typeof b.id !== "number" || !STATUSES.includes(b.status as Status)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await setFeedbackStatus(b.id, b.status as Status);
  return NextResponse.json({ ok: true });
}
