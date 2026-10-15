import "server-only";
import { db } from "./db";
import { newId } from "./sql";
import { SIDE } from "./links";
import type { Vote } from "./network";

// Asking someone to change color, and their answers. Only preset texts (no free text: nothing to
// moderate, no way to harass with words), rate-limited, and anyone can mute asks.

export const ASKS = {
  vem: (side: Vote) => `Vem pro ${SIDE[side]}! 🙏`,
  argumentos: () => "Bora trocar de cor? Tenho bons argumentos 😄",
  acho: (side: Vote) => `Eu acho que no fundo você é ${SIDE[side]} 👀`,
  conversa: (side: Vote) => `Que tal mudar pro ${SIDE[side]}? Me chama no X pra gente conversar`,
} as const;

export const REPLIES = {
  troquei: () => "Troquei! ✅",
  pensar: () => "Vou pensar 🤔",
  nao: () => "Nem pensar 😅",
  conversa: () => "Bora conversar no X 💬",
} as const;

export type AskPreset = keyof typeof ASKS;
export type ReplyPreset = keyof typeof REPLIES;

export const ASK_COOLDOWN = 12 * 3600_000; // per sender → recipient
export const ASK_DAILY = 30; // per sender
const LIVE_WINDOW = 60_000; // seen by the live bar this recently = on the site right now

export type Message = {
  id: number;
  at: number;
  kind: "ask" | "reply";
  body: string;
  side: Vote | null;
  via: string;
  seenAt: number | null;
  from: { id: string; username: string; avatar: string | null; vote: Vote | null };
  to: { id: string; username: string; avatar: string | null; vote: Vote | null };
};

const MSG_SQL = `SELECT m.id, m.at, m.kind, m.body, m.side, m.via, m.seen_at,
    m.from_uid, f.username AS f_user, COALESCE(f.avatar, fp.avatar) AS f_avatar, f.vote AS f_vote,
    m.to_uid, t.username AS t_user, COALESCE(t.avatar, tp.avatar) AS t_avatar, t.vote AS t_vote
  FROM messages m
  JOIN users f ON f.id = m.from_uid LEFT JOIN profiles fp ON fp.id = f.id
  JOIN users t ON t.id = m.to_uid LEFT JOIN profiles tp ON tp.id = t.id`;

function row(r: Record<string, unknown>): Message {
  return {
    id: Number(r.id),
    at: Number(r.at),
    kind: r.kind as Message["kind"],
    body: String(r.body),
    side: (r.side as Vote | null) ?? null,
    via: String(r.via),
    seenAt: r.seen_at == null ? null : Number(r.seen_at),
    from: { id: String(r.from_uid), username: String(r.f_user), avatar: (r.f_avatar as string | null) ?? null, vote: (r.f_vote as Vote | null) ?? null },
    to: { id: String(r.to_uid), username: String(r.t_user), avatar: (r.t_avatar as string | null) ?? null, vote: (r.t_vote as Vote | null) ?? null },
  };
}

/** Is this member on the site right now (live bar heartbeat in the last minute)? */
export async function isLive(uid: string) {
  const client = await db();
  const r = await client.execute({ sql: "SELECT 1 FROM presence WHERE visitor = ? AND at > ?", args: [`u:${uid}`, Date.now() - LIVE_WINDOW] });
  return r.rows.length > 0;
}

/** Why `from` can't ask `to` right now, or null when they can. */
export async function askBlocked(from: string, to: string): Promise<string | null> {
  if (from === to) return "Você não pode pedir para si mesmo.";
  const client = await db();
  const now = Date.now();
  const [users, mute, pair, day] = await client.batch(
    [
      { sql: "SELECT id, vote FROM users WHERE id IN (?, ?)", args: [from, to] },
      { sql: "SELECT 1 FROM ask_mutes WHERE uid = ?", args: [to] },
      { sql: "SELECT 1 FROM messages WHERE kind = 'ask' AND from_uid = ? AND to_uid = ? AND at > ?", args: [from, to, now - ASK_COOLDOWN] },
      { sql: "SELECT COUNT(*) AS n FROM messages WHERE kind = 'ask' AND from_uid = ? AND at > ?", args: [from, now - 86_400_000] },
    ],
    "read",
  );
  const me = users.rows.find((r) => String(r.id) === from);
  const them = users.rows.find((r) => String(r.id) === to);
  if (!me?.vote) return "Escolha um lado antes de pedir para alguém trocar.";
  if (!them) return "Essa pessoa ainda não entrou no app.";
  if (them.vote === me.vote) return "Essa pessoa já está do seu lado.";
  if (mute.rows.length) return "Essa pessoa não está recebendo pedidos.";
  if (pair.rows.length) return "Você já pediu para essa pessoa. Tente de novo mais tarde.";
  if (Number(day.rows[0].n) >= ASK_DAILY) return "Você chegou ao limite de pedidos de hoje.";
  return null;
}

export async function saveMessage(m: { from: string; to: string; kind: "ask" | "reply"; preset: string; body: string; side: Vote | null; via: string }) {
  const client = await db();
  const id = newId();
  await client.execute({
    sql: `INSERT INTO messages (id, at, from_uid, to_uid, kind, preset, body, side, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, Date.now(), m.from, m.to, m.kind, m.preset, m.body, m.side, m.via],
  });
  return id;
}

/** Messages to `uid` not yet shown live: the toast picks them up and they're marked as delivered. */
export async function takeLive(uid: string): Promise<Message[]> {
  const client = await db();
  const r = await client.execute({
    sql: `${MSG_SQL} WHERE m.to_uid = ? AND m.seen_at IS NULL AND m.live_at IS NULL AND m.at > ? ORDER BY m.at, m.id LIMIT 5`,
    args: [uid, Date.now() - 7 * 86_400_000],
  });
  const out = r.rows.map(row);
  if (out.length) {
    await client.execute({
      sql: `UPDATE messages SET live_at = ? WHERE id IN (${out.map(() => "?").join(",")})`,
      args: [Date.now(), ...out.map((m) => m.id)],
    });
  }
  return out;
}

export async function markSeen(uid: string, id: number) {
  const client = await db();
  const r = await client.execute({ sql: `${MSG_SQL} WHERE m.id = ? AND m.to_uid = ?`, args: [id, uid] });
  await client.execute({ sql: "UPDATE messages SET seen_at = COALESCE(seen_at, ?) WHERE id = ? AND to_uid = ?", args: [Date.now(), id, uid] });
  return r.rows[0] ? row(r.rows[0]) : null;
}

/** Everything a member sent and received, newest first. */
export async function myMessages(uid: string, limit = 100): Promise<Message[]> {
  const client = await db();
  const r = await client.execute({
    sql: `${MSG_SQL} WHERE m.to_uid = :uid OR m.from_uid = :uid ORDER BY m.at DESC, m.id DESC LIMIT :lim`,
    args: { uid, lim: limit },
  });
  return r.rows.map(row);
}

export async function unseenCount(uid: string) {
  const client = await db();
  const r = await client.execute({ sql: "SELECT COUNT(*) AS n FROM messages WHERE to_uid = ? AND seen_at IS NULL", args: [uid] });
  return Number(r.rows[0].n);
}

export async function isMuted(uid: string) {
  const client = await db();
  return (await client.execute({ sql: "SELECT 1 FROM ask_mutes WHERE uid = ?", args: [uid] })).rows.length > 0;
}

/** Admin: every message between members. */
export async function allMessages(limit = 300): Promise<Message[]> {
  const client = await db();
  const r = await client.execute({ sql: `${MSG_SQL} ORDER BY m.at DESC, m.id DESC LIMIT ?`, args: [limit] });
  return r.rows.map(row);
}

/** Opening the messages page counts as reading everything received. */
export async function markAllSeen(uid: string) {
  const client = await db();
  await client.execute({ sql: "UPDATE messages SET seen_at = ? WHERE to_uid = ? AND seen_at IS NULL", args: [Date.now(), uid] });
}
