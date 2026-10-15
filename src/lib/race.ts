import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";
import type { Me, Vote } from "./network";

export type Racer = Me & { invites: number; rank: number };

/** Monday 00:00 in Brasília of the week `now` falls in (the race resets every week). */
export function weekStart(now = Date.now()) {
  const brt = new Date(now - 3 * 3600_000);
  const back = (brt.getUTCDay() + 6) % 7;
  return Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() - back, 3);
}

/** This week's invite race: members ranked by signups through their link (ties: who got there first). */
export async function getRace(now = Date.now(), exclude = ""): Promise<{ now: number; start: number; end: number; racers: Racer[] }> {
  const start = weekStart(now);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT m.id, m.username, m.name, COALESCE(m.avatar, p.avatar) AS avatar, m.vote, COUNT(*) AS n, MAX(u.created_at) AS last
          FROM users u JOIN users m ON m.id = u.invited_by LEFT JOIN profiles p ON p.id = m.id
          WHERE u.created_at >= ? AND u.id GLOB '[0-9]*' AND u.id <> ?
          GROUP BY m.id ORDER BY n DESC, last ASC`,
    args: [start, exclude],
  });
  return {
    now,
    start,
    end: start + 7 * 86_400_000,
    racers: r.rows.map((row, i) => ({
      id: String(row.id),
      username: String(row.username),
      name: String(row.name),
      avatar: (row.avatar as string | null) ?? null,
      vote: (row.vote as Vote | null) ?? null,
      invites: Number(row.n),
      rank: i + 1,
    })),
  };
}

/** Who the newcomer's inviter just passed in this week's race (top 10 only), with their new rank. */
export async function passedBy(inviter: string, newcomer: string) {
  const now = Date.now();
  const [before, after] = await Promise.all([getRace(now, newcomer), getRace(now)]);
  const was = new Map(before.racers.map((r) => [r.id, r.rank]));
  const mine = after.racers.find((r) => r.id === inviter);
  if (!mine) return [];
  const myBefore = was.get(inviter) ?? Infinity;
  return after.racers.filter((r) => r.id !== inviter && r.rank > mine.rank && r.rank <= 10 && (was.get(r.id) ?? Infinity) < myBefore);
}

/** The race as shown on screens: shared by everyone, refreshed every minute. */
export async function getRaceBoard() {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  return getRace();
}
