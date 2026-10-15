import "server-only";
import { db } from "./db";

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
