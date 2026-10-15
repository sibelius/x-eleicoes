import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";
import { PER_USER, SHARED, bubbleTallies, type Me, type Tally, type Vote } from "./network";

const MEMBER = "id GLOB '[0-9]*'";

const person = (r: Record<string, unknown>): Me => ({
  id: String(r.id),
  username: String(r.username),
  name: String(r.name ?? r.username),
  avatar: (r.avatar as string | null) ?? null,
  vote: (r.vote as Vote | null) ?? null,
});

export type Missing = { id: string; username: string; name: string; avatar: string | null; members: number; mutual: boolean };

/**
 * People you follow who haven't joined, best invites first: those who follow you back (real ties,
 * not celebrities), then by how many members already follow them.
 */
export async function getMissing(uid: string, limit = 10): Promise<Missing[]> {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT e.dst AS id, p.username, p.name, p.avatar,
            EXISTS (SELECT 1 FROM edges b WHERE b.src = e.dst AND b.dst = :uid) AS mutual,
            (SELECT COUNT(*) FROM edges f JOIN users m ON m.id = f.src WHERE f.dst = e.dst AND m.${MEMBER}) AS members
          FROM edges e JOIN profiles p ON p.id = e.dst AND p.username IS NOT NULL
          WHERE e.src = :uid AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.dst)
          ORDER BY mutual DESC, members DESC
          LIMIT :lim`,
    args: { uid, lim: limit },
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    name: String(row.name ?? row.username),
    avatar: (row.avatar as string | null) ?? null,
    members: Number(row.members),
    mutual: Boolean(row.mutual),
  }));
}

/** How many different people opened someone's invite link. */
export async function inviteOpens(uid: string) {
  const client = await db();
  const r = await client.execute({ sql: "SELECT COUNT(DISTINCT visitor) AS n FROM invite_opens WHERE ref = ?", args: [uid] });
  return Number(r.rows[0].n);
}

export type Twin = Me & { similarity: number; shared: number };

/**
 * The member whose network (follows + followers) overlaps yours the most (Jaccard), and the most
 * similar one who picked the other side.
 */
export async function getTwins(uid: string): Promise<{ twin: Twin | null; opposite: Twin | null }> {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const [overlap, meRow] = await client.batch(
    [
      {
        sql: `WITH mine AS (SELECT dst AS x FROM edges WHERE src = :uid UNION SELECT src FROM edges WHERE dst = :uid),
              links AS (
                SELECT e.src AS m, e.dst AS x FROM edges e JOIN mine ON mine.x = e.dst
                UNION SELECT e.dst, e.src FROM edges e JOIN mine ON mine.x = e.src
              )
              SELECT m, COUNT(*) AS shared FROM links
              WHERE m <> :uid AND m IN (SELECT id FROM users WHERE ${MEMBER})
              GROUP BY m ORDER BY shared DESC LIMIT 100`,
        args: { uid },
      },
      { sql: "SELECT vote FROM users WHERE id = ?", args: [uid] },
    ],
    "read",
  );
  const shared = new Map(overlap.rows.map((r) => [String(r.m), Number(r.shared)]));
  if (!shared.size) return { twin: null, opposite: null };
  const ids = [uid, ...shared.keys()];
  const sizes = await client.execute({
    sql: `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote,
            (SELECT COUNT(*) FROM (SELECT dst FROM edges WHERE src = u.id UNION SELECT src FROM edges WHERE dst = u.id)) AS n
          FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });
  const mine = Number(sizes.rows.find((r) => String(r.id) === uid)?.n ?? 0);
  const myVote = (meRow.rows[0]?.vote as Vote | null) ?? null;
  const ranked = sizes.rows
    .filter((r) => String(r.id) !== uid)
    .map((r) => {
      const s = shared.get(String(r.id)) ?? 0;
      return { ...person(r), shared: s, similarity: s / Math.max(1, mine + Number(r.n) - s) };
    })
    .filter((t) => t.shared >= 3)
    .sort((a, b) => b.similarity - a.similarity);
  return {
    twin: ranked[0] ?? null,
    opposite: (myVote && ranked.find((t) => t.vote && t.vote !== myVote)) || null,
  };
}

export type Bridge = { path: Me[]; steps: number } | null;

/**
 * The shortest chain of follows (either direction) or invites between members, from `uid` to the
 * nearest member who picked the other side. Null when they haven't picked or nobody is reachable.
 */
export async function getBridge(uid: string): Promise<Bridge> {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const [members, edges] = await client.batch(
    [
      `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, u.invited_by
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.${MEMBER}`,
      `SELECT src, dst FROM edges WHERE src IN (SELECT id FROM users WHERE ${MEMBER})
         AND dst IN (SELECT id FROM users WHERE ${MEMBER}) AND src <> dst`,
    ],
    "read",
  );
  const byId = new Map(members.rows.map((r) => [String(r.id), person(r)]));
  const me = byId.get(uid);
  if (!me?.vote) return null;
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!byId.has(a) || !byId.has(b)) return;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (const r of edges.rows) link(String(r.src), String(r.dst));
  for (const r of members.rows) if (r.invited_by) link(String(r.id), String(r.invited_by));
  const prev = new Map<string, string | null>([[uid, null]]);
  const queue = [uid];
  while (queue.length) {
    const cur = queue.shift()!;
    const v = byId.get(cur)!.vote;
    if (cur !== uid && v && v !== me.vote) {
      const path: Me[] = [];
      for (let at: string | null = cur; at; at = prev.get(at) ?? null) path.unshift(byId.get(at)!);
      return { path, steps: path.length - 1 };
    }
    for (const next of adj.get(cur) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }
  return null;
}

export type Wrapped = {
  tally: Tally;
  /** Share of the bubble on its majority side (50–100). */
  closed: number;
  /** % of bubbles (3+ picks) less closed than this one. */
  percentile: number;
  bubbles: number;
  first: (Me & { at: number }) | null;
  members: number;
  invites: number;
  views: number;
  joinedAt: number | null;
};

/** The numbers behind a bubble's "retrospectiva" card. */
export async function getWrapped(uid: string): Promise<Wrapped> {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const tallies = await bubbleTallies();
  const [first, counts] = await client.batch(
    [
      {
        sql: `WITH rel AS (
                SELECT dst AS id FROM edges WHERE src = :uid
                UNION SELECT src FROM edges WHERE dst = :uid
                UNION SELECT id FROM users WHERE invited_by = :uid
                UNION SELECT invited_by FROM users WHERE id = :uid
              )
              SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, u.created_at,
                (SELECT COUNT(*) FROM rel JOIN users m ON m.id = rel.id WHERE m.${MEMBER} AND m.id <> :uid) AS members
              FROM rel JOIN users u ON u.id = rel.id LEFT JOIN profiles p ON p.id = u.id
              WHERE u.id <> :uid AND u.${MEMBER}
              ORDER BY u.created_at LIMIT 1`,
        args: { uid },
      },
      {
        sql: `SELECT (SELECT COUNT(*) FROM users WHERE invited_by = :uid) AS invites,
                (SELECT COUNT(DISTINCT visitor) FROM views WHERE uid = :uid) AS views,
                (SELECT created_at FROM users WHERE id = :uid) AS joined`,
        args: { uid },
      },
    ],
    "read",
  );
  const closedness = (red: number, total: number) => Math.max(red, total - red) / total;
  const all = tallies.filter((t) => t.total >= 3);
  const mineRow = tallies.find((r) => r.id === uid);
  const red = Number(mineRow?.red ?? 0);
  const total = Number(mineRow?.total ?? 0);
  const c = total ? closedness(red, total) : 0;
  const less = all.filter((t) => t.id !== uid && closedness(t.red, t.total) < c).length;
  const others = all.filter((t) => t.id !== uid).length;
  const f = first.rows[0];
  const k = counts.rows[0];
  return {
    tally: { red, green: total - red, total },
    closed: Math.round(c * 100),
    percentile: others ? Math.round((less / others) * 100) : 0,
    bubbles: all.length,
    first: f ? { ...person(f), at: Number(f.created_at) } : null,
    members: Number(f?.members ?? 0),
    invites: Number(k.invites),
    views: Number(k.views),
    joinedAt: k.joined == null ? null : Number(k.joined),
  };
}

export type Swing = Me & { tally: Tally };
export type VoteEvent = Me & { from: Vote | null; to: Vote; at: number };

/** Public "quem virou": recent picks and switches, net flows, and the bubbles split down the middle. */
export async function getSwing() {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const tallies = await bubbleTallies();
  const [events, flows, members] = await client.batch(
    [
      `SELECT c.uid AS id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, c.from_vote, c.to_vote, c.at
       FROM vote_changes c JOIN users u ON u.id = c.uid LEFT JOIN profiles p ON p.id = u.id
       ORDER BY c.at DESC LIMIT 60`,
      `SELECT from_vote, to_vote, COUNT(*) AS n FROM vote_changes
       WHERE from_vote IS NOT NULL AND from_vote <> to_vote GROUP BY from_vote, to_vote`,
      `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.${MEMBER}`,
    ],
    "read",
  );
  const feed: VoteEvent[] = events.rows
    .filter((r) => r.from_vote !== r.to_vote)
    .map((r) => ({ ...person(r), from: (r.from_vote as Vote | null) ?? null, to: r.to_vote as Vote, at: Number(r.at) }));
  const flow = { toGreen: 0, toRed: 0 };
  for (const r of flows.rows) {
    if (r.to_vote === "green") flow.toGreen += Number(r.n);
    else flow.toRed += Number(r.n);
  }
  const byId = new Map(members.rows.map((r) => [String(r.id), person(r)]));
  const edge: Swing[] = tallies
    .flatMap((r) => {
      const m = byId.get(r.id);
      const total = r.total;
      const red = r.red;
      if (!m || total < 5 || Math.abs(red / total - 0.5) > 0.1) return [];
      return [{ ...m, tally: { red, green: total - red, total } }];
    })
    .sort((a, b) => Math.abs(a.tally.red / a.tally.total - 0.5) - Math.abs(b.tally.red / b.tally.total - 0.5) || b.tally.total - a.tally.total)
    .slice(0, 20);
  return { feed: feed.slice(0, 40), switches: feed.filter((e) => e.from), flow, edge };
}
