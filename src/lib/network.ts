import "server-only";
import { db } from "./db";

export type Vote = "lula" | "bolsonaro";

export type Me = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  vote: Vote | null;
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
  /** Combined bubble only: -1 (linked to Lula voters) … 1 (Bolsonaro voters). */
  lean?: number;
};

export type Tally = { lula: number; bolsonaro: number; total: number };

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
    sql: `SELECT id, username FROM users WHERE id = :h
          UNION ALL SELECT id, username FROM users WHERE username = :h COLLATE NOCASE
          LIMIT 1`,
    args: { h: handle.replace(/^@/, "") },
  });
  const row = r.rows[0];
  return row ? { id: String(row.id), username: String(row.username) } : null;
}

/** Every real (X) member for the public directory; votes are public. */
export async function listMembers(q = ""): Promise<Me[]> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote
          FROM users u LEFT JOIN profiles p ON p.id = u.id
          WHERE u.id GLOB '[0-9]*' AND (:q = '' OR u.username LIKE :like OR u.name LIKE :like)
          ORDER BY u.created_at DESC
          LIMIT 500`,
    args: { q, like: `%${q.replace(/[%_]/g, "")}%` },
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    avatar: (row.avatar as string | null) ?? null,
    vote: (row.vote as Vote | null) ?? null,
  }));
}

type Row = {
  id: string;
  member: number;
  username: string | null;
  name: string | null;
  avatar: string | null;
  vote: Vote | null;
  following: number;
  follower: number;
  invite: number;
};

async function networkRows(uid: string, nonMemberLimit: number): Promise<Row[]> {
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
        u.vote AS vote
      FROM agg
      LEFT JOIN users u ON u.id = agg.id
      LEFT JOIN profiles p ON p.id = agg.id
      ORDER BY member DESC, (COALESCE(u.username, p.username) IS NOT NULL) DESC,
        (agg.following + agg.follower + agg.invite) DESC
      LIMIT :lim`,
    args: { uid, lim: 5000 },
  });
  const rows = r.rows as unknown as Row[];
  let nonMembers = 0;
  return rows.filter((row) => row.member || nonMembers++ < nonMemberLimit);
}

function tally(rows: Row[]): Tally {
  const voters = rows.filter((r) => r.member && r.vote);
  const lula = voters.filter((r) => r.vote === "lula").length;
  return { lula, bolsonaro: voters.length - lula, total: voters.length };
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
      `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*'`,
      {
        sql: `WITH m AS (SELECT id, vote FROM users WHERE id GLOB '[0-9]*'),
              links AS (
                SELECT e.dst AS id, m.vote FROM edges e JOIN m ON m.id = e.src
                UNION ALL SELECT e.src, m.vote FROM edges e JOIN m ON m.id = e.dst
              )
              SELECT l.id, COUNT(*) AS c, SUM(l.vote = 'lula') AS lula, SUM(l.vote = 'bolsonaro') AS bolso,
                p.username, p.name, p.avatar
              FROM links l LEFT JOIN profiles p ON p.id = l.id
              WHERE l.id NOT IN (SELECT id FROM m)
              GROUP BY l.id
              ORDER BY (p.username IS NOT NULL) DESC, c DESC
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
        strength: 2,
      }),
    ),
    ...others.rows.map((r) => {
      const lula = Number(r.lula);
      const bolso = Number(r.bolso);
      return base({
        id: String(r.id),
        username: (r.username as string | null) ?? null,
        name: (r.name as string | null) ?? null,
        avatar: (r.avatar as string | null) ?? null,
        strength: Math.min(3, Math.log2(Number(r.c))),
        lean: lula + bolso ? (bolso - lula) / (lula + bolso) : 0,
      });
    }),
  ];
}

/** What anyone can see on a shared link: the owner's vote + their network's totals. */
export async function getShare(uid: string) {
  const me = await getMe(uid);
  if (!me) return null;
  const rows = await networkRows(uid, 0);
  return {
    user: { id: me.id, username: me.username, name: me.name, avatar: me.avatar },
    vote: me.vote,
    tally: tally(rows),
    members: rows.length,
  };
}
