import "server-only";
import { db } from "./db";
import { getShare, type Me, type Tally, type Vote } from "./network";
import { sendTo } from "./push";
import { brDay } from "./roulette-shared";

// The roulette: meet a random member (anyone, the other side, your network, or outside it) and break the ice.
// Members who muted asks (ask_mutes) are never drawn, so opting out of contact covers this too.

export type RouletteMode = "any" | "other" | "network" | "outside";
export const MODES: RouletteMode[] = ["any", "other", "network", "outside"];

export type Draw = Me & {
  tally: Tally;
  /** Accounts you both follow. */
  shared: number;
  following: boolean;
  follower: boolean;
};

export async function draw(viewer: { id: string; vote: Vote | null }, mode: RouletteMode, skip = ""): Promise<Draw | null> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote
          FROM users u LEFT JOIN profiles p ON p.id = u.id
          WHERE u.id GLOB '[0-9]*' AND u.id <> :me AND u.id <> :skip
            AND NOT EXISTS (SELECT 1 FROM ask_mutes m WHERE m.uid = u.id)
            AND (:mode = 'any'
              OR (:mode = 'other' AND u.vote IS NOT NULL AND u.vote <> :vote)
              OR (:mode = 'network' AND EXISTS (SELECT 1 FROM edges e WHERE (e.src = :me AND e.dst = u.id) OR (e.src = u.id AND e.dst = :me)))
              OR (:mode = 'outside' AND NOT EXISTS (SELECT 1 FROM edges e WHERE (e.src = :me AND e.dst = u.id) OR (e.src = u.id AND e.dst = :me))))
          ORDER BY RANDOM()
          LIMIT 1`,
    args: { me: viewer.id, skip, mode, vote: viewer.vote ?? "" },
  });
  const row = r.rows[0];
  if (!row) return null;
  const id = String(row.id);
  const [rel, share] = await Promise.all([
    client.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM edges a JOIN edges b ON b.dst = a.dst WHERE a.src = :me AND b.src = :them) AS shared,
              (SELECT COUNT(*) FROM edges WHERE src = :me AND dst = :them) AS following,
              (SELECT COUNT(*) FROM edges WHERE src = :them AND dst = :me) AS follower`,
      args: { me: viewer.id, them: id },
    }),
    getShare(id),
  ]);
  const x = rel.rows[0];
  return {
    id,
    username: String(row.username),
    name: String(row.name),
    avatar: (row.avatar as string | null) ?? null,
    vote: (row.vote as Vote | null) ?? null,
    tally: share?.tally ?? { red: 0, green: 0, total: 0 },
    shared: Number(x.shared),
    following: Number(x.following) > 0,
    follower: Number(x.follower) > 0,
  };
}

/** "@x tirou você na roleta": at most one push per drawn member per day, only when someone reached out. */
export async function notifyDrawn(to: string, from: { username: string }, origin: string) {
  const client = await db();
  const claim = await client.execute({
    sql: "INSERT OR IGNORE INTO once_pushes (key, uid) VALUES (?, ?)",
    args: [`roleta:${brDay()}`, to],
  });
  if (!claim.rowsAffected) return 0;
  return sendTo(to, {
    title: "🎲 Você saiu na roleta",
    body: `@${from.username} tirou você na roleta da Minha Bolha e quer conversar. Veja a bolha dele(a) e responda no X.`,
    url: `${origin}/r/${encodeURIComponent(from.username)}`,
    campaign: "roleta",
  });
}
