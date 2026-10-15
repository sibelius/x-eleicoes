import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";

// Shared, read-heavy queries are cached in Vercel's runtime cache ("use cache: remote") for a few
// minutes: the whole-graph ones scan every follow edge, which is most of the database's row reads.
export const SHARED = { stale: 300, revalidate: 3600, expire: 86400 };
export const PER_USER = { stale: 300, revalidate: 1800, expire: 86400 };

export type Vote = "red" | "green";

export type Me = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  vote: Vote | null;
  /** Members who joined through this person's link. */
  invites?: number;
};

export type NetworkNode = {
  id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
  member: boolean;
  vote: Vote | null;
  voted: boolean;
  following: boolean; // I follow them
  follower: boolean; // they follow me
  invite: boolean; // joined through my link or invited me
  strength: number;
  /** Combined bubble only: -1 (linked to Red voters) … 1 (Green voters). */
  lean?: number;
  /** When they picked their side (ms), for the bubble video's timeline. */
  votedAt?: number | null;
};

export type Tally = { red: number; green: number; total: number };

export async function getMe(uid: string): Promise<Me | null> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote
          FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?`,
    args: [uid],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    avatar: (row.avatar as string | null) ?? null,
    vote: (row.vote as Vote | null) ?? null,
  };
}

/** /r/<handle> accepts the X handle (canonical) or the numeric user id (old links). */
export async function resolveUser(handle: string): Promise<{ id: string; username: string } | null> {
  const client = await db();
  const r = await client.execute({
    // Members first; then any known X profile (famous accounts get a bubble built from members' links).
    sql: `SELECT id, username FROM users WHERE id = :h
          UNION ALL SELECT id, username FROM users WHERE lower(username) = lower(:h)
          UNION ALL SELECT id, username FROM profiles WHERE username IS NOT NULL AND (id = :h OR lower(username) = lower(:h))
          LIMIT 1`,
    args: { h: handle.replace(/^@/, "") },
  });
  const row = r.rows[0];
  return row ? { id: String(row.id), username: String(row.username) } : null;
}

/** Every real (X) member for the public directory; votes are public. */
export async function listMembers(q = ""): Promise<Me[]> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote,
            (SELECT COUNT(*) FROM users i WHERE i.invited_by = u.id) AS invites
          FROM users u LEFT JOIN profiles p ON p.id = u.id
          WHERE u.id GLOB '[0-9]*' AND (:q = '' OR lower(u.username) LIKE lower(:like) OR lower(u.name) LIKE lower(:like))
          ORDER BY u.created_at DESC, u.id
          LIMIT 500`,
    args: { q, like: `%${q.replace(/[%_]/g, "")}%` },
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    avatar: (row.avatar as string | null) ?? null,
    vote: (row.vote as Vote | null) ?? null,
    invites: Number(row.invites),
  }));
}

export async function inviteCount(uid: string) {
  const client = await db();
  const r = await client.execute({ sql: "SELECT COUNT(*) AS n FROM users WHERE invited_by = ?", args: [uid] });
  return Number(r.rows[0].n);
}

/** Every member's bubble tally (id, red, total): votes among who they follow, who follows them, and invites. */
export const BUBBLE_TALLIES_SQL = `WITH v AS (SELECT id, vote FROM users WHERE vote IS NOT NULL),
       rel AS (
         SELECT e.src AS a, v.id AS b, v.vote FROM edges e JOIN v ON v.id = e.dst
         UNION SELECT e.dst, v.id, v.vote FROM edges e JOIN v ON v.id = e.src
         UNION SELECT u.invited_by, v.id, v.vote FROM users u JOIN v ON v.id = u.id WHERE u.invited_by IS NOT NULL
         UNION SELECT v.id, u.id, u.vote FROM v JOIN users u ON u.invited_by = v.id WHERE u.vote IS NOT NULL
       )
       SELECT a AS id, SUM(CASE WHEN vote = 'red' THEN 1 ELSE 0 END) AS red, COUNT(*) AS total
       FROM rel WHERE a <> b AND a IN (SELECT id FROM users WHERE id GLOB '[0-9]*')
       GROUP BY a`;

/** Every member's bubble tally (cached: it scans every edge). */
export async function bubbleTallies(): Promise<{ id: string; red: number; total: number }[]> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const r = await client.execute(BUBBLE_TALLIES_SQL);
  return r.rows
    .map((row) => ({ id: String(row.id), red: Number(row.red), total: Number(row.total) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export type Ranked = Me & { tally: Tally; redPct: number };

/**
 * Every member's bubble tally in one query (votes among the people they follow, who follow them,
 * or came in through an invite), plus invite counts, for /ranking.
 */
export async function getRankings(minVotes = 3) {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const [tallies, members] = await Promise.all([
    bubbleTallies(),
    client.execute(`SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote,
         (SELECT COUNT(*) FROM users i WHERE i.invited_by = u.id) AS invites
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*'`),
  ]);
  const byId = new Map(
    members.rows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        username: String(r.username),
        name: String(r.name),
        avatar: (r.avatar as string | null) ?? null,
        vote: (r.vote as Vote | null) ?? null,
        invites: Number(r.invites),
      } satisfies Me,
    ]),
  );
  const ranked: Ranked[] = [];
  for (const r of tallies) {
    const m = byId.get(r.id);
    const total = r.total;
    if (!m || total < minVotes) continue;
    const red = r.red;
    ranked.push({ ...m, tally: { red, green: total - red, total }, redPct: red / total });
  }
  const top = (xs: Ranked[], score: (r: Ranked) => number) =>
    [...xs].sort((a, b) => score(b) - score(a) || b.tally.total - a.tally.total || a.id.localeCompare(b.id)).slice(0, 10);
  return {
    closedRed: top(ranked.filter((r) => r.redPct >= 0.5), (r) => r.redPct),
    closedGreen: top(ranked.filter((r) => r.redPct <= 0.5), (r) => 1 - r.redPct),
    mixed: top(ranked.filter((r) => r.tally.total >= 5), (r) => -Math.abs(r.redPct - 0.5)),
    inviters: [...byId.values()]
      .filter((m) => m.invites! > 0)
      .sort((a, b) => b.invites! - a.invites! || a.id.localeCompare(b.id))
      .slice(0, 10),
  };
}

type Row = {
  id: string;
  member: number;
  username: string | null;
  name: string | null;
  avatar: string | null;
  vote: Vote | null;
  voted_at: number | null;
  following: number;
  follower: number;
  invite: number;
};

async function networkRows(uid: string, nonMemberLimit: number): Promise<Row[]> {
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
        u.vote AS vote, u.voted_at AS voted_at
      FROM agg
      LEFT JOIN users u ON u.id = agg.id
      LEFT JOIN profiles p ON p.id = agg.id
      ORDER BY member DESC, (COALESCE(u.username, p.username) IS NOT NULL) DESC,
        (agg.following + agg.follower + agg.invite) DESC, agg.id
      LIMIT :lim`,
    args: { uid, lim: 5000 },
  });
  // Plain objects: libSQL rows aren't serializable into the cache.
  const rows: Row[] = r.rows.map((x) => ({
    id: String(x.id),
    member: Number(x.member),
    username: (x.username as string | null) ?? null,
    name: (x.name as string | null) ?? null,
    avatar: (x.avatar as string | null) ?? null,
    vote: (x.vote as Vote | null) ?? null,
    voted_at: x.voted_at == null ? null : Number(x.voted_at),
    following: Number(x.following),
    follower: Number(x.follower),
    invite: Number(x.invite),
  }));
  let nonMembers = 0;
  return rows.filter((row) => row.member || nonMembers++ < nonMemberLimit);
}

function tally(rows: Row[]): Tally {
  const voters = rows.filter((r) => r.member && r.vote);
  const red = voters.filter((r) => r.vote === "red").length;
  return { red, green: voters.length - red, total: voters.length };
}

export async function getNetwork(uid: string) {
  const rows = await networkRows(uid, 250);
  const nodes: NetworkNode[] = rows.map((r) => {
    const mutual = r.following && r.follower;
    return {
      id: r.id,
      username: r.username,
      name: r.name,
      avatar: r.avatar,
      member: Boolean(r.member),
      vote: r.member ? r.vote : null,
      voted: Boolean(r.member && r.vote),
      following: Boolean(r.following),
      follower: Boolean(r.follower),
      invite: Boolean(r.invite),
      strength: (mutual ? 3 : r.following ? 2 : r.follower ? 1 : 0) + (r.invite ? 2 : 0),
      votedAt: r.member && r.vote && r.voted_at != null ? Number(r.voted_at) : null,
    };
  });
  const client = await db();
  const counts = await client.execute({
    sql: `SELECT
      (SELECT COUNT(*) FROM edges WHERE src = ?) AS following,
      (SELECT COUNT(*) FROM edges WHERE dst = ?) AS followers`,
    args: [uid, uid],
  });
  const c = counts.rows[0] as unknown as { following: number; followers: number };
  return {
    nodes,
    tally: tally(rows),
    counts: { following: Number(c.following), followers: Number(c.followers) },
  };
}

/**
 * Everyone's bubbles joined: all members, plus the non-members most connected to them
 * (placed toward the side of the voters they're linked to).
 */
export async function getGlobalNetwork(nonMemberLimit = 300): Promise<NetworkNode[]> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const base = (n: Partial<NetworkNode> & Pick<NetworkNode, "id">): NetworkNode => ({
    username: null,
    name: null,
    avatar: null,
    member: false,
    vote: null,
    voted: false,
    following: false,
    follower: false,
    invite: false,
    strength: 0,
    ...n,
  });
  const [members, others] = await client.batch(
    [
      `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, u.voted_at
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*' ORDER BY u.id`,
      {
        sql: `WITH m AS (SELECT id, vote FROM users WHERE id GLOB '[0-9]*'),
              links AS (
                SELECT e.dst AS id, m.vote FROM edges e JOIN m ON m.id = e.src
                UNION ALL SELECT e.src, m.vote FROM edges e JOIN m ON m.id = e.dst
              )
              SELECT l.id, COUNT(*) AS c, SUM(CASE WHEN l.vote = 'red' THEN 1 ELSE 0 END) AS red, SUM(CASE WHEN l.vote = 'green' THEN 1 ELSE 0 END) AS green,
                p.username, p.name, p.avatar
              FROM links l LEFT JOIN profiles p ON p.id = l.id
              WHERE l.id NOT IN (SELECT id FROM m)
              GROUP BY l.id, p.username, p.name, p.avatar
              ORDER BY (p.username IS NOT NULL) DESC, c DESC, l.id
              LIMIT ?`,
        args: [nonMemberLimit],
      },
    ],
    "read",
  );
  return [
    ...members.rows.map((r) =>
      base({
        id: String(r.id),
        username: r.username as string,
        name: r.name as string,
        avatar: (r.avatar as string | null) ?? null,
        member: true,
        vote: (r.vote as Vote | null) ?? null,
        voted: Boolean(r.vote),
        votedAt: r.vote && r.voted_at != null ? Number(r.voted_at) : null,
        strength: 2,
      }),
    ),
    ...others.rows.map((r) => {
      const red = Number(r.red);
      const green = Number(r.green);
      return base({
        id: String(r.id),
        username: (r.username as string | null) ?? null,
        name: (r.name as string | null) ?? null,
        avatar: (r.avatar as string | null) ?? null,
        strength: Math.min(3, Math.log2(Number(r.c))),
        lean: red + green ? (green - red) / (red + green) : 0,
      });
    }),
  ];
}

/** What anyone can see on a shared link: the owner's vote + their network's totals. */
export async function getShare(uid: string) {
  const me = (await getMe(uid)) ?? (await getProfile(uid));
  if (!me) return null;
  const rows = await networkRows(uid, 0);
  return {
    user: { id: me.id, username: me.username, name: me.name, avatar: me.avatar },
    vote: me.vote,
    /** False for a known X account that hasn't joined (e.g. a famous profile). */
    member: !("profile" in me),
    tally: tally(rows),
    members: rows.length,
  };
}

/** Two bubbles side by side, plus the people both networks share. */
export async function getComparison(a: string, b: string) {
  const [ua, ub] = await Promise.all([resolveUser(a), resolveUser(b)]);
  if (!ua || !ub) return null;
  const [sa, sb, na, nb] = await Promise.all([getShare(ua.id), getShare(ub.id), getNetwork(ua.id), getNetwork(ub.id)]);
  if (!sa || !sb) return null;
  const inB = new Set(nb.nodes.map((n) => n.id));
  const shared = na.nodes.filter((n) => inB.has(n.id));
  return {
    a: { ...sa, nodes: na.nodes },
    b: { ...sb, nodes: nb.nodes },
    shared: shared.length,
    sharedMembers: shared.filter((n) => n.member).slice(0, 24),
  };
}

export type TimelinePoint = { day: string; red: number; green: number; members: number };
export type TimelineEvent = { at: number; kind: "joined" | "voted"; username: string; avatar: string | null; vote: Vote | null };

/**
 * How a bubble grew: per day, cumulative members and votes among the people in it
 * (rebuilt from join and vote times, so it covers history from day one; the latest vote counts).
 */
export async function getTimeline(uid: string) {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const r = await client.execute({
    sql: `WITH rel AS (
            SELECT dst AS id FROM edges WHERE src = :uid
            UNION SELECT src FROM edges WHERE dst = :uid
            UNION SELECT id FROM users WHERE invited_by = :uid
            UNION SELECT invited_by FROM users WHERE id = :uid
          )
          SELECT u.username, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, u.created_at, u.voted_at
          FROM rel JOIN users u ON u.id = rel.id LEFT JOIN profiles p ON p.id = u.id
          WHERE u.id <> :uid AND u.id GLOB '[0-9]*'`,
    args: { uid },
  });
  const rows = r.rows.map((x) => ({
    username: String(x.username),
    avatar: (x.avatar as string | null) ?? null,
    vote: (x.vote as Vote | null) ?? null,
    joined: Number(x.created_at),
    voted: x.voted_at == null ? null : Number(x.voted_at),
  }));
  const day = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10); // Brasília
  const days = new Set<string>();
  for (const x of rows) {
    days.add(day(x.joined));
    if (x.voted) days.add(day(x.voted));
  }
  const points: TimelinePoint[] = [...days].sort().map((d) => {
    const end = (t: number) => day(t) <= d;
    return {
      day: d,
      members: rows.filter((x) => end(x.joined)).length,
      red: rows.filter((x) => x.vote === "red" && x.voted && end(x.voted)).length,
      green: rows.filter((x) => x.vote === "green" && x.voted && end(x.voted)).length,
    };
  });
  const events: TimelineEvent[] = rows
    .flatMap((x) => [
      { at: x.joined, kind: "joined" as const, username: x.username, avatar: x.avatar, vote: null },
      ...(x.voted ? [{ at: x.voted, kind: "voted" as const, username: x.username, avatar: x.avatar, vote: x.vote }] : []),
    ])
    .sort((a, b) => b.at - a.at)
    .slice(0, 30);
  return { points, events };
}

export type BubbleSize = { accounts: number; members: number; voted: number; silent: Me[] };

/** How big a bubble is: every account in it, who joined the app, who voted, and who joined without voting. */
export async function getBubbleSize(uid: string | null): Promise<BubbleSize> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  // uid null = the bubble of bubbles: every member plus every account linked to one.
  const rel = uid
    ? `SELECT dst AS id FROM edges WHERE src = :uid
       UNION SELECT src FROM edges WHERE dst = :uid
       UNION SELECT id FROM users WHERE invited_by = :uid
       UNION SELECT invited_by FROM users WHERE id = :uid AND invited_by IS NOT NULL`
    : `SELECT id FROM users WHERE id GLOB '[0-9]*'
       UNION SELECT e.dst FROM edges e JOIN users u ON u.id = e.src
       UNION SELECT e.src FROM edges e JOIN users u ON u.id = e.dst`;
  const [size, silent] = await client.batch(
    [
      {
        sql: `WITH rel AS (${rel})
              SELECT COUNT(*) AS accounts, COUNT(u.id) AS members, COUNT(u.vote) AS voted
              FROM rel LEFT JOIN users u ON u.id = rel.id AND u.id GLOB '[0-9]*'
              WHERE rel.id <> COALESCE(:uid, '')`,
        args: { uid },
      },
      {
        sql: `WITH rel AS (${rel})
              SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar
              FROM rel JOIN users u ON u.id = rel.id LEFT JOIN profiles p ON p.id = u.id
              WHERE u.vote IS NULL AND u.id GLOB '[0-9]*' AND u.id <> COALESCE(:uid, '')
              ORDER BY u.created_at DESC, u.id LIMIT 60`,
        args: { uid },
      },
    ],
    "read",
  );
  const s = size.rows[0];
  return {
    accounts: Number(s.accounts),
    members: Number(s.members),
    voted: Number(s.voted),
    silent: silent.rows.map((r) => ({
      id: String(r.id),
      username: String(r.username),
      name: String(r.name),
      avatar: (r.avatar as string | null) ?? null,
      vote: null,
    })),
  };
}

/** A known X account that isn't a member (seen in someone's follow lists). */
async function getProfile(id: string) {
  const client = await db();
  const r = await client.execute({
    sql: "SELECT id, username, name, avatar FROM profiles WHERE id = ? AND username IS NOT NULL",
    args: [id],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name ?? row.username),
    avatar: (row.avatar as string | null) ?? null,
    vote: null,
    profile: true as const,
  };
}

export type Famous = { id: string; username: string; name: string; avatar: string | null; followers: number; tally: Tally };

/** Accounts that haven't joined but that the most members follow, with how those followers vote. */
export async function getFamous(limit = 24): Promise<Famous[]> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT p.id, p.username, p.name, p.avatar, COUNT(*) AS followers,
            SUM(CASE WHEN u.vote = 'red' THEN 1 ELSE 0 END) AS red, SUM(CASE WHEN u.vote = 'green' THEN 1 ELSE 0 END) AS green
          FROM edges e
          JOIN users u ON u.id = e.src AND u.id GLOB '[0-9]*'
          JOIN profiles p ON p.id = e.dst AND p.username IS NOT NULL
          WHERE NOT EXISTS (SELECT 1 FROM users m WHERE m.id = e.dst)
          GROUP BY p.id
          ORDER BY followers DESC, p.id
          LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => {
    const red = Number(row.red);
    const green = Number(row.green);
    return {
      id: String(row.id),
      username: String(row.username),
      name: String(row.name ?? row.username),
      avatar: (row.avatar as string | null) ?? null,
      followers: Number(row.followers),
      tally: { red, green, total: red + green },
    };
  });
}

const AVATAR_PREFIX = "https://pbs.twimg.com/profile_images/";
const AVATAR_SUFFIX = "_normal.jpg";

/**
 * Every account in the bubble of bubbles, in a compact columnar shape for the 2D map:
 * members, then every account linked to one (lean = -100 red … 100 green, from who they're linked to).
 * Avatars drop the common prefix to keep the payload small.
 */
export async function getMapPoints() {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const [members, others] = await client.batch(
    [
      `SELECT u.id, u.username, COALESCE(u.avatar, p.avatar) AS avatar, u.vote
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*' ORDER BY u.id`,
      `WITH m AS (SELECT id, vote FROM users WHERE id GLOB '[0-9]*'),
       links AS (
         SELECT e.dst AS id, m.vote FROM edges e JOIN m ON m.id = e.src
         UNION ALL SELECT e.src, m.vote FROM edges e JOIN m ON m.id = e.dst
       )
       SELECT l.id, SUM(CASE WHEN l.vote = 'red' THEN 1 ELSE 0 END) AS red, SUM(CASE WHEN l.vote = 'green' THEN 1 ELSE 0 END) AS green, p.username, p.avatar
       FROM links l LEFT JOIN profiles p ON p.id = l.id
       WHERE l.id NOT IN (SELECT id FROM m)
       GROUP BY l.id, p.username, p.avatar
       ORDER BY l.id`,
    ],
    "read",
  );
  // "<prefix>123/abc_normal.jpg" -> "123/abc" (the map adds both back).
  const short = (a: unknown) =>
    typeof a !== "string"
      ? null
      : a.startsWith(AVATAR_PREFIX) && a.endsWith(AVATAR_SUFFIX)
        ? a.slice(AVATAR_PREFIX.length, -AVATAR_SUFFIX.length)
        : a;
  const out = { prefix: AVATAR_PREFIX, suffix: AVATAR_SUFFIX, id: [] as string[], u: [] as (string | null)[], a: [] as (string | null)[], m: [] as number[], l: [] as number[] };
  for (const r of members.rows) {
    out.id.push(String(r.id));
    out.u.push(r.username as string);
    out.a.push(short(r.avatar));
    // Members: 1 = red, 2 = green, 3 = no side yet. Their lean is their own side.
    out.m.push(r.vote === "red" ? 1 : r.vote === "green" ? 2 : 3);
    out.l.push(r.vote === "red" ? -100 : r.vote === "green" ? 100 : 0);
  }
  for (const r of others.rows) {
    const red = Number(r.red);
    const green = Number(r.green);
    out.id.push(String(r.id));
    out.u.push((r.username as string | null) ?? null);
    out.a.push(short(r.avatar));
    out.m.push(0);
    out.l.push(red + green ? Math.round(((green - red) / (red + green)) * 100) : 0);
  }
  return out;
}

export type MapPoints = Awaited<ReturnType<typeof getMapPoints>>;
