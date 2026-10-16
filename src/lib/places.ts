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

// ── The live map's history and feed ─────────────────────────────────────────────────────────────

/** One day's map: per state [red, green, none] with 3+ people, 0 under that (no counts). */
export type DayStates = Partial<Record<UF, [number, number, number] | 0>>;

export type StateHistory = {
  /** Brasília calendar days, oldest first; the last one is today (current picks). */
  days: string[];
  /** Per day, the whole app's picks (members with or without a known state). */
  app: { red: number; green: number }[];
  /** Per day, the map at the end of that day (current states, picks as of then). */
  states: DayStates[];
};

const BRT = 3 * 3600_000; // Brasília is UTC−3 all year
const DAY_MS = 86_400_000;
export const HISTORY_DAYS = 60;

export const brtDay = (at: number) => new Date(at - BRT).toISOString().slice(0, 10);
const dayEnd = (day: string) => Date.parse(`${day}T00:00:00Z`) + DAY_MS + BRT;

/** Builds the per-day maps in memory: person ids never leave this function, only per-state totals do. */
export function buildHistory(
  places: { uid: string; uf: string; createdAt: number; vote: string | null }[],
  changes: { uid: string; to: string; at: number }[],
  now: number,
  maxDays = HISTORY_DAYS,
): StateHistory {
  const today = brtDay(now);
  const first = changes.length ? brtDay(Math.min(...changes.map((c) => c.at))) : today;
  const days: string[] = [];
  for (let t = Math.max(Date.parse(`${first}T00:00:00Z`), Date.parse(`${today}T00:00:00Z`) - (maxDays - 1) * DAY_MS); ; t += DAY_MS) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.push(d);
    if (d >= today) break;
  }
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  const vote = new Map<string, string>();
  const placeOf = new Map(places.filter((p) => isUf(p.uf)).map((p) => [p.uid, p]));
  const app: StateHistory["app"] = [];
  const states: DayStates[] = [];
  let i = 0;
  for (const day of days) {
    const last = day === today;
    const end = last ? Infinity : dayEnd(day);
    for (; i < sorted.length && sorted[i].at < end; i++) vote.set(sorted[i].uid, sorted[i].to);
    let red = 0;
    let green = 0;
    for (const v of vote.values()) {
      if (v === "red") red++;
      else if (v === "green") green++;
    }
    app.push({ red, green });
    const by = new Map<UF, [number, number, number]>();
    for (const p of placeOf.values()) {
      if (!last && p.createdAt >= end) continue;
      // Today is the live map (current picks); earlier days replay vote_changes.
      const v = last ? p.vote : (vote.get(p.uid) ?? null);
      const c = by.get(p.uf as UF) ?? [0, 0, 0];
      c[v === "red" ? 0 : v === "green" ? 1 : 2]++;
      by.set(p.uf as UF, c);
    }
    const snap: DayStates = {};
    for (const [uf, c] of by) snap[uf] = c[0] + c[1] + c[2] >= MIN_PEOPLE ? c : 0;
    states.push(snap);
  }
  return { days, app, states };
}

/** The map of everyone, day by day (aggregates only; see buildHistory). */
export async function stateHistory(): Promise<StateHistory> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const [places, changes] = await client.batch(
    [
      `SELECT p.uid, p.uf, u.created_at, u.vote
       FROM user_places p JOIN users u ON u.id = p.uid
       WHERE p.uf <> '' AND u.id GLOB '[0-9]*'`,
      `SELECT c.uid, c.to_vote, c.at
       FROM vote_changes c JOIN users u ON u.id = c.uid
       WHERE u.id GLOB '[0-9]*'`,
    ],
    "read",
  );
  return buildHistory(
    places.rows.map((r) => ({ uid: String(r.uid), uf: String(r.uf), createdAt: Number(r.created_at), vote: (r.vote as string | null) ?? null })),
    changes.rows.map((r) => ({ uid: String(r.uid), to: String(r.to_vote), at: Number(r.at) })),
    Date.now(),
  );
}

/** A public pick or switch for the "Últimas atualizações" feed: who and which side, never where. */
export type MapEvent = { username: string; avatar: string | null; from: "red" | "green" | null; to: "red" | "green"; at: number };

/** Latest picks and switches of members whose profile is public. */
export async function recentPicks(limit = 12): Promise<MapEvent[]> {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT u.username, COALESCE(u.avatar, p.avatar) AS avatar, c.from_vote, c.to_vote, c.at
          FROM vote_changes c JOIN users u ON u.id = c.uid LEFT JOIN profiles p ON p.id = u.id
          WHERE u.visibility = 'public' AND u.id GLOB '[0-9]*' AND (c.from_vote IS NULL OR c.from_vote <> c.to_vote)
          ORDER BY c.at DESC, c.uid LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    username: String(row.username),
    avatar: (row.avatar as string | null) ?? null,
    from: row.from_vote === "red" || row.from_vote === "green" ? row.from_vote : null,
    to: row.to_vote === "red" ? "red" : "green",
    at: Number(row.at),
  }));
}
