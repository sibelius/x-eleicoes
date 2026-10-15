import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";
import { SITE } from "./views-shared";

/** Distinct visitors (all time) for each id. */
export async function viewCounts(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const client = await db();
  const r = await client.execute({
    sql: `SELECT uid, COUNT(DISTINCT visitor) AS n FROM views WHERE uid IN (${ids.map(() => "?").join(",")}) GROUP BY uid`,
    args: ids,
  });
  const out: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const row of r.rows) out[String(row.uid)] = Number(row.n);
  return out;
}

export async function viewCount(id: string) {
  return (await viewCounts([id]))[id];
}

/** Site-wide counters for the live bar (visitors today, members): every visitor polls them, so cached a minute. */
export async function siteCounts(day: string) {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  const client = await db();
  const [today, members] = await client.batch(
    [
      { sql: "SELECT COUNT(*) AS n FROM views WHERE uid = ? AND day = ?", args: [SITE, day] },
      "SELECT COUNT(*) AS n FROM users WHERE id GLOB '[0-9]*'",
    ],
    "read",
  );
  return { today: Number(today.rows[0].n), members: Number(members.rows[0].n) };
}
