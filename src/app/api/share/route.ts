import { NextResponse, after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getMe, resolveUser } from "@/lib/network";
import { notifyShared, type ShareKind } from "@/lib/push";
import { appUrl, getUserId } from "@/lib/session";

const VISITOR = "xe_vid";

/** A post-to-X link (or the phone share sheet) was used: record it and tell whose bubble it was. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; via?: unknown };
  let path: string;
  try {
    path = new URL(String(body.url)).pathname;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const via = body.via === "native" ? "native" : "x";
  const bubble = path.match(/^\/r\/([^/]+)$/);
  const compare = path.match(/^\/c\/([^/]+)\/([^/]+)$/);
  const kind: ShareKind | null = bubble ? "bubble" : compare ? "compare" : null;
  const handles = (bubble ? [bubble[1]] : compare ? [compare[1], compare[2]] : []).map((h) => decodeURIComponent(h));

  const uid = await getUserId();
  const sharer = uid ? `u:${uid}` : req.cookies.get(VISITOR)?.value ?? "anon";
  const users = (await Promise.all(handles.map((h) => resolveUser(h)))).filter((u) => u != null);
  const client = await db();
  await client.execute({
    sql: "INSERT INTO shares (at, sharer, kind, targets, via) VALUES (?, ?, ?, ?, ?)",
    args: [Date.now(), sharer, kind ?? (path === "/" ? "invite" : "other"), users.map((u) => u.id).join(","), via],
  });

  if (kind && users.length) {
    const origin = appUrl(req);
    const me = uid ? await getMe(uid) : null;
    after(() =>
      Promise.all(
        users
          .filter((u) => u.id !== uid) // sharing your own bubble notifies nobody
          .map((u) =>
            notifyShared(
              u.id,
              { kind, sharer: me?.username ?? null, other: users.find((o) => o.id !== u.id)?.username ?? null, path },
              origin,
            ).catch((e) => console.error("[push] share", e)),
          ),
      ),
    );
  }
  return NextResponse.json({ ok: true });
}
