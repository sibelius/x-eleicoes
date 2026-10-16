import "server-only";
import { adminIds } from "./admin";
import { db } from "./db";
import { sendTo } from "./push";
import { newId } from "./sql";

// Feedback from anyone on the site, read in /admin/feedback; each one pushes the admins.

export const KINDS = { idea: "💡 Ideia", bug: "🐞 Problema", love: "❤️ Elogio", other: "💬 Outro" } as const;
export type Kind = keyof typeof KINDS;
export const STATUSES = ["new", "read", "done"] as const;
export type Status = (typeof STATUSES)[number];

export type Feedback = {
  id: number;
  at: number;
  kind: Kind;
  body: string;
  page: string;
  contact: string | null;
  status: Status;
  username: string | null;
  avatar: string | null;
};

/** Saves it unless the sender already sent 5 in the last hour; returns the id, or null when throttled. */
export async function addFeedback(f: { sender: string; uid: string | null; kind: Kind; body: string; page: string; contact: string | null }) {
  const client = await db();
  const recent = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM feedback WHERE sender = ? AND at > ?",
    args: [f.sender, Date.now() - 3600_000],
  });
  if (Number(recent.rows[0].n) >= 5) return null;
  const id = newId();
  await client.execute({
    sql: "INSERT INTO feedback (id, at, sender, uid, kind, body, page, contact, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')",
    args: [id, Date.now(), f.sender, f.uid, f.kind, f.body, f.page, f.contact],
  });
  return id;
}

export async function listFeedback(limit = 500): Promise<Feedback[]> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT f.id, f.at, f.kind, f.body, f.page, f.contact, f.status, u.username, COALESCE(u.avatar, p.avatar) AS avatar
          FROM feedback f LEFT JOIN users u ON u.id = f.uid LEFT JOIN profiles p ON p.id = f.uid
          ORDER BY f.at DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    at: Number(x.at),
    kind: (x.kind as Kind) in KINDS ? (x.kind as Kind) : "other",
    body: String(x.body),
    page: String(x.page),
    contact: (x.contact as string | null) ?? null,
    status: x.status as Status,
    username: (x.username as string | null) ?? null,
    avatar: (x.avatar as string | null) ?? null,
  }));
}

export async function setFeedbackStatus(id: number, status: Status) {
  const client = await db();
  await client.execute({ sql: "UPDATE feedback SET status = ? WHERE id = ?", args: [status, id] });
}

/** A web push to every admin with the feedback's first words. */
export async function notifyFeedback(f: { kind: Kind; body: string; username: string | null }, origin: string) {
  const who = f.username ? `@${f.username}` : "Visitante";
  const text = f.body.length > 120 ? `${f.body.slice(0, 117)}…` : f.body;
  let sent = 0;
  for (const uid of adminIds()) {
    sent += await sendTo(uid, {
      title: `${KINDS[f.kind]} · novo feedback`,
      body: `${who}: ${text}`,
      url: `${origin}/admin/feedback`,
      campaign: "feedback",
    });
  }
  return sent;
}
