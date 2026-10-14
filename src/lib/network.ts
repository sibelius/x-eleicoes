import "server-only";
import { db } from "./db";

export type Vote = "lula" | "bolsonaro";
export type Visibility = "public" | "network" | "private";

export type Me = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  vote: Vote | null;
  visibility: Visibility;
};

export type NetworkNode = {
  id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
  member: boolean;
  /** Only set when the member allows people in their network to see it. */
  vote: Vote | null;
  voted: boolean;
  following: boolean; // I follow them
  follower: boolean; // they follow me
  invite: boolean; // joined through my link or invited me
  strength: number;
};

export type Tally = { lula: number; bolsonaro: number; total: number; hidden: boolean };

/** Private votes only enter aggregates once there are enough of them to not identify anyone. */
export const PRIVACY_MIN_VOTES = 5;

export async function getMe(uid: string): Promise<Me | null> {
  const client = await db();
  const r = await client.execute({
    sql: "SELECT id, username, name, avatar, vote, visibility FROM users WHERE id = ?",
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
    visibility: row.visibility as Visibility,
  };
}

type Row = {
  id: string;
  member: number;
  username: string | null;
  name: string | null;
  avatar: string | null;
  vote: Vote | null;
  visibility: Visibility | null;
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
        u.vote AS vote, u.visibility AS visibility
      FROM agg
      LEFT JOIN users u ON u.id = agg.id
      LEFT JOIN profiles p ON p.id = agg.id
      ORDER BY member DESC, (agg.following + agg.follower + agg.invite) DESC
      LIMIT :lim`,
    args: { uid, lim: 5000 },
  });
  const rows = r.rows as unknown as Row[];
  let nonMembers = 0;
  return rows.filter((row) => row.member || nonMembers++ < nonMemberLimit);
}

function tally(rows: Row[], visible: (r: Row) => boolean): Tally {
  const voters = rows.filter((r) => r.member && r.vote);
  const shown = voters.filter(visible);
  const useAll = voters.length >= PRIVACY_MIN_VOTES;
  const counted = useAll ? voters : shown;
  const lula = counted.filter((r) => r.vote === "lula").length;
  return {
    lula,
    bolsonaro: counted.length - lula,
    total: counted.length,
    hidden: !useAll && voters.length > shown.length,
  };
}

export async function getNetwork(uid: string) {
  const rows = await networkRows(uid, 250);
  const nodes: NetworkNode[] = rows.map((r) => {
    const visible = r.member && r.vote && r.visibility !== "private";
    const mutual = r.following && r.follower;
    return {
      id: r.id,
      username: r.username,
      name: r.name,
      avatar: r.avatar,
      member: Boolean(r.member),
      vote: visible ? r.vote : null,
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
    tally: tally(rows, (r) => r.visibility !== "private"),
    counts: { following: Number(c.following), followers: Number(c.followers) },
  };
}

/** What anyone can see on a shared link: only aggregates + the owner's vote if public. */
export async function getShare(uid: string) {
  const me = await getMe(uid);
  if (!me) return null;
  const rows = await networkRows(uid, 0);
  const t = tally(rows, (r) => r.visibility !== "private");
  return {
    user: { id: me.id, username: me.username, name: me.name, avatar: me.avatar },
    vote: me.visibility === "public" ? me.vote : null,
    tally: t,
    members: rows.length,
  };
}
