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
export type Bridge = { path: Me[]; steps: number } | null;

/** Every follow edge plus every member (one scan of the edges table; only the derived results are cached). */
async function graphSnapshot() {
  const client = await db();
  const [members, edges] = await client.batch(
    [
      `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, u.invited_by
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.${MEMBER}`,
      "SELECT src, dst FROM edges",
    ],
    "read",
  );
  const people = members.rows.map((r) => ({ ...person(r), invitedBy: (r.invited_by as string | null) ?? null }));
  const ids = new Set(people.map((m) => m.id));
  // Each member's neighbors (follows + followers), and the member-only links for bridges.
  const nb: Record<string, string[]> = {};
  const links: [string, string][] = [];
  for (const r of edges.rows) {
    const a = String(r.src);
    const b = String(r.dst);
    if (a === b) continue;
    if (ids.has(a)) (nb[a] ??= []).push(b);
    if (ids.has(b)) (nb[b] ??= []).push(a);
    if (ids.has(a) && ids.has(b)) links.push([a, b]);
  }
  for (const m of people) if (m.invitedBy && ids.has(m.invitedBy)) links.push([m.id, m.invitedBy]);
  for (const k in nb) nb[k] = [...new Set(nb[k])];
  return { people, nb, links };
}

/**
 * Twins (Jaccard over follows + followers) and bridges for every member at once, from one scan of the
 * edges table, cached an hour: per-person lookups then cost no database reads.
 */
async function derived() {
  "use cache: remote";
  cacheLife(SHARED);
  const { people, nb, links } = await graphSnapshot();
  const byId = new Map(people.map((m) => [m.id, m]));
  // Inverted index: account -> members linked to it; pairs sharing an account get +1.
  const owners = new Map<string, string[]>();
  for (const [m, xs] of Object.entries(nb)) for (const x of xs) (owners.get(x) ?? owners.set(x, []).get(x)!).push(m);
  const shared = new Map<string, Map<string, number>>();
  for (const ms of owners.values()) {
    if (ms.length < 2 || ms.length > 120) continue; // accounts everyone follows say little about similarity
    for (const a of ms) {
      const row = shared.get(a) ?? shared.set(a, new Map()).get(a)!;
      for (const b of ms) if (a !== b) row.set(b, (row.get(b) ?? 0) + 1);
    }
  }
  const out: Record<string, { twin: Twin | null; opposite: Twin | null }> = {};
  for (const [a, row] of shared) {
    const me = byId.get(a);
    if (!me) continue;
    const ranked = [...row]
      .filter(([, s]) => s >= 3)
      .map(([b, s]) => {
        const them = byId.get(b)!;
        const { invitedBy: _, ...rest } = them;
        return { ...rest, shared: s, similarity: s / Math.max(1, nb[a].length + (nb[b]?.length ?? 0) - s) };
      })
      .sort((x, y) => y.similarity - x.similarity);
    out[a] = {
      twin: ranked[0] ?? null,
      opposite: (me.vote && ranked.find((t) => t.vote && t.vote !== me.vote)) || null,
    };
  }
  const bridges: Record<string, Bridge> = {};
  for (const m of people) bridges[m.id] = bridgeFrom(m.id, people, links);
  return { twins: out, bridges };
}

/**
 * The member whose network (follows + followers) overlaps yours the most (Jaccard), and the most
 * similar one who picked the other side.
 */
export async function getTwins(uid: string): Promise<{ twin: Twin | null; opposite: Twin | null }> {
  return (await derived()).twins[uid] ?? { twin: null, opposite: null };
}

/**
 * The shortest chain of follows (either direction) or invites between members, from `uid` to the
 * nearest member who picked the other side. Null when they haven't picked or nobody is reachable.
 */
export async function getBridge(uid: string): Promise<Bridge> {
  return (await derived()).bridges[uid] ?? null;
}

type Person = Me & { invitedBy: string | null };

function bridgeFrom(uid: string, people: Person[], links: [string, string][]): Bridge {
  const byId = new Map(people.map(({ invitedBy: _, ...m }) => [m.id, m as Me]));
  const me = byId.get(uid);
  if (!me?.vote) return null;
  const adj = new Map<string, string[]>();
  for (const [a, b] of links) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
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
