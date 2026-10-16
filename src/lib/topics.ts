import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";
import { PER_USER, type NetworkNode, type Tally, type Vote } from "./network";

// Topics ("seasons"): any A × B question answered over the follow graph already imported for
// Red × Green, so a new one costs no import. Hidden unless status = 'live' (admins can preview drafts).

export type TopicStatus = "draft" | "live" | "closed";
export type TopicSide = "a" | "b";

export type Topic = {
  id: string;
  title: string;
  question: string;
  a_label: string;
  a_color: string;
  b_label: string;
  b_color: string;
  status: TopicStatus;
  created_at: number;
};

export const TOPIC_STATUSES: TopicStatus[] = ["draft", "live", "closed"];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** The Bubble's slots: side 'a' fills "red", 'b' fills "green". */
export const sideToSlot = (s: TopicSide | null): Vote | null => (s === "a" ? "red" : s === "b" ? "green" : null);

export function topicSides(t: Topic) {
  return { red: { label: t.a_label, color: t.a_color }, green: { label: t.b_label, color: t.b_color } };
}

/** Checks an admin's form; returns the clean topic fields or what's wrong. */
export function parseTopic(input: Record<string, unknown>): { ok: true; topic: Omit<Topic, "created_at"> } | { ok: false; error: string } {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const topic = {
    id: s("id").toLowerCase(),
    title: s("title"),
    question: s("question"),
    a_label: s("a_label"),
    a_color: s("a_color").toLowerCase(),
    b_label: s("b_label"),
    b_color: s("b_color").toLowerCase(),
    status: (s("status") || "draft") as TopicStatus,
  };
  if (!SLUG.test(topic.id)) return { ok: false, error: "Slug: letras minúsculas, números e hífens (até 40)." };
  if (!topic.title || topic.title.length > 80) return { ok: false, error: "Título obrigatório (até 80)." };
  if (!topic.question || topic.question.length > 160) return { ok: false, error: "Pergunta obrigatória (até 160)." };
  if (!topic.a_label || !topic.b_label || topic.a_label.length > 30 || topic.b_label.length > 30)
    return { ok: false, error: "Os dois lados precisam de nome (até 30)." };
  if (!HEX.test(topic.a_color) || !HEX.test(topic.b_color)) return { ok: false, error: "Cores no formato #rrggbb." };
  if (!TOPIC_STATUSES.includes(topic.status)) return { ok: false, error: "Status inválido." };
  return { ok: true, topic };
}

function toTopic(r: Record<string, unknown>): Topic {
  return {
    id: String(r.id),
    title: String(r.title),
    question: String(r.question),
    a_label: String(r.a_label),
    a_color: String(r.a_color),
    b_label: String(r.b_label),
    b_color: String(r.b_color),
    status: String(r.status) as TopicStatus,
    created_at: Number(r.created_at),
  };
}

/** Live topics for the public; every topic (newest first) for admins. Not cached: a status flip shows at once. */
export async function listTopics({ all = false } = {}): Promise<Topic[]> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT id, title, question, a_label, a_color, b_label, b_color, status, created_at FROM topics WHERE (:all = 1 OR status = 'live') ORDER BY created_at DESC, id`,
    args: { all: all ? 1 : 0 },
  });
  return r.rows.map(toTopic);
}

export async function getTopic(id: string): Promise<Topic | null> {
  const client = await db();
  const r = await client.execute({ sql: `SELECT id, title, question, a_label, a_color, b_label, b_color, status, created_at FROM topics WHERE id = ?`, args: [id] });
  return r.rows[0] ? toTopic(r.rows[0]) : null;
}

/** Creates or edits a topic (the slug is the key; created_at is kept on edits). */
export async function saveTopic(t: Omit<Topic, "created_at">) {
  const client = await db();
  await client.execute({
    sql: `INSERT INTO topics (id, title, question, a_label, a_color, b_label, b_color, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET title = excluded.title, question = excluded.question,
            a_label = excluded.a_label, a_color = excluded.a_color, b_label = excluded.b_label,
            b_color = excluded.b_color, status = excluded.status`,
    args: [t.id, t.title, t.question, t.a_label, t.a_color, t.b_label, t.b_color, t.status, Date.now()],
  });
}

/** A member's side on a topic (the latest pick counts). */
export async function setTopicVote(topic: string, uid: string, side: TopicSide) {
  const client = await db();
  await client.execute({
    sql: `INSERT INTO topic_votes (topic, uid, side, at) VALUES (?, ?, ?, ?)
          ON CONFLICT (topic, uid) DO UPDATE SET side = excluded.side, at = excluded.at`,
    args: [topic, uid, side, Date.now()],
  });
}

export async function getTopicVote(topic: string, uid: string): Promise<TopicSide | null> {
  const client = await db();
  const r = await client.execute({ sql: "SELECT side FROM topic_votes WHERE topic = ? AND uid = ?", args: [topic, uid] });
  return (r.rows[0]?.side as TopicSide | undefined) ?? null;
}

/** Everyone's picks per topic (admin list and the topic page's overall split). */
export async function topicCounts(topic?: string): Promise<Record<string, { a: number; b: number }>> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT topic, SUM(CASE WHEN side = 'a' THEN 1 ELSE 0 END) AS a, SUM(CASE WHEN side = 'b' THEN 1 ELSE 0 END) AS b
          FROM topic_votes WHERE (:topic = '' OR topic = :topic) GROUP BY topic ORDER BY topic`,
    args: { topic: topic ?? "" },
  });
  return Object.fromEntries(r.rows.map((x) => [String(x.topic), { a: Number(x.a), b: Number(x.b) }]));
}

type Row = {
  id: string;
  member: number;
  username: string | null;
  name: string | null;
  avatar: string | null;
  side: TopicSide | null;
  at: number | null;
  following: number;
  follower: number;
  invite: number;
};

// Same neighbourhood as networkRows (lib/network), with the pick taken from topic_votes.
// Cached per (topic, uid). The viewer's own pick is read uncached (getTopicVote), and their bubble
// never includes themselves, so a vote shows at once for them; others' picks show within PER_USER.
async function topicRows(topic: string, uid: string, nonMemberLimit: number): Promise<Row[]> {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const r = await client.execute({
    sql: `
      WITH rel AS (
        SELECT dst AS id, 1 AS following, 0 AS follower, 0 AS invite FROM edges WHERE src = :uid
        UNION ALL SELECT src, 0, 1, 0 FROM edges WHERE dst = :uid
        UNION ALL SELECT id, 0, 0, 1 FROM users WHERE invited_by = :uid
        UNION ALL SELECT invited_by, 0, 0, 1 FROM users WHERE id = :uid AND invited_by IS NOT NULL
      ),
      agg AS (
        SELECT id, MAX(following) AS following, MAX(follower) AS follower, MAX(invite) AS invite
        FROM rel WHERE id <> :uid GROUP BY id
      )
      SELECT agg.*, (u.id IS NOT NULL) AS member,
        COALESCE(u.username, p.username) AS username,
        COALESCE(u.name, p.name) AS name,
        COALESCE(u.avatar, p.avatar) AS avatar,
        tv.side AS side, tv.at AS at
      FROM agg
      LEFT JOIN users u ON u.id = agg.id
      LEFT JOIN profiles p ON p.id = agg.id
      LEFT JOIN topic_votes tv ON tv.topic = :topic AND tv.uid = agg.id
      ORDER BY member DESC, (COALESCE(u.username, p.username) IS NOT NULL) DESC,
        (agg.following + agg.follower + agg.invite) DESC, agg.id
      LIMIT :lim`,
    args: { uid, topic, lim: 5000 },
  });
  const rows: Row[] = r.rows.map((x) => ({
    id: String(x.id),
    member: Number(x.member),
    username: (x.username as string | null) ?? null,
    name: (x.name as string | null) ?? null,
    avatar: (x.avatar as string | null) ?? null,
    side: (x.side as TopicSide | null) ?? null,
    at: x.at == null ? null : Number(x.at),
    following: Number(x.following),
    follower: Number(x.follower),
    invite: Number(x.invite),
  }));
  let nonMembers = 0;
  return rows.filter((row) => row.member || nonMembers++ < nonMemberLimit);
}

/** A member's bubble on a topic: same shape as getNetwork (nodes + tally), 'a' in the red slot. */
export async function getTopicNetwork(topic: string, uid: string): Promise<{ nodes: NetworkNode[]; tally: Tally }> {
  const rows = await topicRows(topic, uid, 250);
  const nodes: NetworkNode[] = rows.map((r) => {
    const mutual = r.following && r.follower;
    const vote = r.member ? sideToSlot(r.side) : null;
    return {
      id: r.id,
      username: r.username,
      name: r.name,
      avatar: r.avatar,
      member: Boolean(r.member),
      vote,
      voted: Boolean(vote),
      following: Boolean(r.following),
      follower: Boolean(r.follower),
      invite: Boolean(r.invite),
      strength: (mutual ? 3 : r.following ? 2 : r.follower ? 1 : 0) + (r.invite ? 2 : 0),
      votedAt: vote && r.at != null ? r.at : null,
    };
  });
  const red = nodes.filter((n) => n.vote === "red").length;
  const green = nodes.filter((n) => n.vote === "green").length;
  return { nodes, tally: { red, green, total: red + green } };
}
