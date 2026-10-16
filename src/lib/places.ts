import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";
import { PER_USER, SHARED } from "./network";
import { isUf, type UF } from "./uf";

// Members' states (user_places): from their X profile location (source 'x') or picked by them ('self').
// A 'self' row with uf = '' means "don't show my state" (and stops X from filling it again).
// States are only ever shown as aggregates of at least MIN_PEOPLE people.

export const MIN_PEOPLE = 3;

export type Place = { uf: UF | null; source: "x" | "self" } | null;

export async function getPlace(uid: string): Promise<Place> {
  const client = await db();
  const r = await client.execute({ sql: "SELECT uf, source FROM user_places WHERE uid = ?", args: [uid] });
  const row = r.rows[0];
  if (!row) return null;
  return { uf: isUf(row.uf) ? row.uf : null, source: row.source === "self" ? "self" : "x" };
}

/** From the X profile at sign-in: never overrides what the member picked; a location that no longer parses clears it. */
export async function setPlaceFromX(uid: string, uf: UF | null) {
  const client = await db();
  if (!uf) {
    await client.execute({ sql: "DELETE FROM user_places WHERE uid = ? AND source = 'x'", args: [uid] });
    return;
  }
  await client.execute({
    sql: `INSERT INTO user_places (uid, uf, source, at) VALUES (?, ?, 'x', ?)
          ON CONFLICT(uid) DO UPDATE SET uf = excluded.uf, at = excluded.at WHERE user_places.source = 'x'`,
    args: [uid, uf, Date.now()],
  });
}

/** Picked by the member; null = hide it (kept as an empty 'self' row so sign-in doesn't fill it back). */
export async function setPlaceSelf(uid: string, uf: UF | null) {
  const client = await db();
  await client.execute({
    sql: `INSERT INTO user_places (uid, uf, source, at) VALUES (?, ?, 'self', ?)
          ON CONFLICT(uid) DO UPDATE SET uf = excluded.uf, source = 'self', at = excluded.at`,
    args: [uid, uf ?? "", Date.now()],
  });
}

/** One state's tile: the split when at least MIN_PEOPLE are there, otherwise only that there are few. */
export type StateCount = { uf: UF; red: number; green: number; none: number; total: number } | { uf: UF; few: true };

function aggregate(rows: Record<string, unknown>[]): StateCount[] {
  const by = new Map<UF, { red: number; green: number; none: number }>();
  for (const row of rows) {
    if (!isUf(row.uf)) continue;
    const c = by.get(row.uf) ?? { red: 0, green: 0, none: 0 };
    const n = Number(row.n);
    if (row.vote === "red") c.red += n;
    else if (row.vote === "green") c.green += n;
    else c.none += n;
    by.set(row.uf, c);
  }
  return [...by.entries()]
    .map(([uf, c]) => {
      const total = c.red + c.green + c.none;
      // Privacy: under the minimum, not even the count leaves the server.
      return total >= MIN_PEOPLE ? { uf, ...c, total } : { uf, few: true as const };
    })
    .sort((a, b) => a.uf.localeCompare(b.uf));
}

/** States of the members in someone's bubble (who they follow, who follows them, invites), never their own. */
export async function bubbleStates(uid: string): Promise<StateCount[]> {
  "use cache: remote";
  cacheLife(PER_USER);
  const client = await db();
  const r = await client.execute({
    sql: `WITH rel AS (
            SELECT dst AS id FROM edges WHERE src = :uid
            UNION SELECT src FROM edges WHERE dst = :uid
            UNION SELECT id FROM users WHERE invited_by = :uid
            UNION SELECT invited_by FROM users WHERE id = :uid AND invited_by IS NOT NULL
          )
          SELECT p.uf, u.vote, COUNT(*) AS n
          FROM user_places p JOIN users u ON u.id = p.uid
          WHERE p.uf <> '' AND p.uid <> :uid AND p.uid IN (SELECT id FROM rel)
          GROUP BY p.uf, u.vote`,
    args: { uid },
  });
  return aggregate(r.rows);
}

/** Every member's state, for the combined bubble and /mapa. */
export async function allStates(): Promise<StateCount[]> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const r = await client.execute(
    `SELECT p.uf, u.vote, COUNT(*) AS n
     FROM user_places p JOIN users u ON u.id = p.uid
     WHERE p.uf <> '' AND u.id GLOB '[0-9]*'
     GROUP BY p.uf, u.vote`,
  );
  return aggregate(r.rows);
}
