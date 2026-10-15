import "server-only";
import { db } from "./db";
import type { Vote } from "./network";

export type RoomEvent = { at: number; kind: "joined" | "picked" | "switched"; username: string; avatar: string | null; vote: Vote | null };
export type Room = {
  totals: { red: number; green: number; members: number };
  online: { red: number; green: number; none: number; visitors: number };
  lastHour: { red: number; green: number };
  events: RoomEvent[];
  at: number;
};

const ONLINE_WINDOW = 2 * 60_000; // same as the live bar

/** The live room: everyone's score, who is online on each side, the last hour, and a feed of picks and joins. */
export async function getRoom(): Promise<Room> {
  const now = Date.now();
  const client = await db();
  const [totals, online, hour, picks, joins] = await client.batch(
    [
      `SELECT SUM(vote = 'red') AS red, SUM(vote = 'green') AS green, COUNT(*) AS members FROM users WHERE id GLOB '[0-9]*'`,
      {
        sql: `SELECT u.vote, (u.id IS NOT NULL) AS member, COUNT(*) AS n FROM presence p LEFT JOIN users u ON p.visitor = 'u:' || u.id
              WHERE p.at > ? GROUP BY 1, 2`,
        args: [now - ONLINE_WINDOW],
      },
      { sql: "SELECT to_vote, COUNT(*) AS n FROM vote_changes WHERE at > ? GROUP BY to_vote", args: [now - 3600_000] },
      `SELECT c.from_vote, c.to_vote, c.at, u.username, COALESCE(u.avatar, p.avatar) AS avatar
       FROM vote_changes c JOIN users u ON u.id = c.uid LEFT JOIN profiles p ON p.id = u.id
       ORDER BY c.at DESC LIMIT 20`,
      `SELECT u.created_at AS at, u.username, COALESCE(u.avatar, p.avatar) AS avatar
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*' ORDER BY u.created_at DESC LIMIT 10`,
    ],
    "read",
  );
  const t = totals.rows[0];
  const on = { red: 0, green: 0, none: 0, visitors: 0 };
  for (const r of online.rows) {
    const n = Number(r.n);
    if (!r.member) on.visitors += n;
    else if (r.vote === "red") on.red += n;
    else if (r.vote === "green") on.green += n;
    else on.none += n;
  }
  const last = { red: 0, green: 0 };
  for (const r of hour.rows) last[r.to_vote as Vote] = Number(r.n);
  const events: RoomEvent[] = [
    ...picks.rows.map((r) => ({
      at: Number(r.at),
      kind: (r.from_vote && r.from_vote !== r.to_vote ? "switched" : "picked") as RoomEvent["kind"],
      username: String(r.username),
      avatar: (r.avatar as string | null) ?? null,
      vote: r.to_vote as Vote,
    })),
    ...joins.rows.map((r) => ({
      at: Number(r.at),
      kind: "joined" as const,
      username: String(r.username),
      avatar: (r.avatar as string | null) ?? null,
      vote: null,
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);
  return {
    totals: { red: Number(t.red ?? 0), green: Number(t.green ?? 0), members: Number(t.members) },
    online: on,
    lastHour: last,
    events,
    at: now,
  };
}
