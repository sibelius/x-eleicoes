import "server-only";
import { db } from "./db";
import { pct } from "./links";
import { bubbleTallies, getFamous, getShare } from "./network";

// "Pergunta do dia": one featured bubble per day (Brasília date); everyone guesses its % Green once.
// The first play of the day locks the question and its answer, so the leaderboard stays fair.

const BRT = -3 * 3600_000; // Brasília has no DST
const MIN_PICKS = 8;
const NO_REPEAT_DAYS = 14;
const STREAK_WINDOW_DAYS = 120;

/** 'YYYY-MM-DD' in Brasília time. */
export function brDay(now = Date.now()) {
  return new Date(now + BRT).toISOString().slice(0, 10);
}

function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** When tomorrow's question opens (midnight in Brasília), in ms. */
export function nextQuestionAt(now = Date.now()) {
  return Date.parse(`${addDays(brDay(now), 1)}T00:00:00Z`) - BRT;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Bubbles with enough picks to guess, minus the ones featured in the last two weeks. */
async function candidates(day: string) {
  const client = await db();
  const [tallies, famous, recent] = await Promise.all([
    bubbleTallies(),
    getFamous(24),
    client.execute({
      sql: "SELECT DISTINCT target FROM daily_plays WHERE day >= ? AND day < ?",
      args: [addDays(day, -NO_REPEAT_DAYS), day],
    }),
  ]);
  const ids = new Set([
    ...tallies.filter((t) => t.total >= MIN_PICKS).map((t) => t.id),
    ...famous.filter((f) => f.tally.total >= MIN_PICKS).map((f) => f.id),
  ]);
  const all = [...ids].sort();
  const seen = new Set(recent.rows.map((r) => String(r.target)));
  const fresh = all.filter((id) => !seen.has(id));
  return fresh.length ? fresh : all;
}

export type DailyQuestion = {
  day: string;
  target: string;
  username: string;
  name: string;
  avatar: string | null;
  /** The answer (% Green), locked by the day's first play. */
  actual: number;
  /** True once someone played: the target can't change anymore. */
  locked: boolean;
};

/** Today's featured bubble: the one already played today, else a deterministic pick for the date. */
export async function getDailyQuestion(now = Date.now(), prefer?: string): Promise<DailyQuestion | null> {
  const day = brDay(now);
  const client = await db();
  const r = await client.execute({ sql: "SELECT target, actual FROM daily_plays WHERE day = ? LIMIT 1", args: [day] });
  let target = r.rows[0] ? String(r.rows[0].target) : null;
  if (!target) {
    const pool = await candidates(day);
    if (!pool.length) return null;
    // Not locked yet: the bubble the player saw still counts if it's eligible (the pool can shift).
    target = prefer && pool.includes(prefer) ? prefer : pool[hash(day) % pool.length];
  }
  const share = await getShare(target);
  if (!share) return null;
  const live = share.tally.total ? 100 - pct(share.tally.red, share.tally.total) : 0;
  return {
    day,
    target,
    username: share.user.username,
    name: share.user.name,
    avatar: share.user.avatar,
    actual: r.rows[0] ? Number(r.rows[0].actual) : live,
    locked: !!r.rows[0],
  };
}

export type Streak = { current: number; best: number };

/** Current streak (consecutive days ending today or yesterday) and best streak, from sorted days. */
export function streakOf(days: string[], today: string): Streak {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i && sorted[i - 1] === addDays(sorted[i], -1) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = sorted.at(-1);
  const current = last === today || last === addDays(today, -1) ? run : 0;
  return { current, best };
}

/** Every member's streak (from the last few months of plays), with handle and avatar. */
export async function allStreaks(now = Date.now()) {
  const today = brDay(now);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT d.uid, d.day, u.username, COALESCE(u.avatar, p.avatar) AS avatar
          FROM daily_plays d JOIN users u ON u.id = d.uid LEFT JOIN profiles p ON p.id = d.uid
          WHERE d.uid IS NOT NULL AND d.day >= ?
          ORDER BY d.uid, d.day`,
    args: [addDays(today, -STREAK_WINDOW_DAYS)],
  });
  const byUid = new Map<string, { username: string; avatar: string | null; days: string[] }>();
  for (const row of r.rows) {
    const uid = String(row.uid);
    const e =
      byUid.get(uid) ??
      byUid.set(uid, { username: String(row.username), avatar: (row.avatar as string | null) ?? null, days: [] }).get(uid)!;
    e.days.push(String(row.day));
  }
  return new Map([...byUid].map(([uid, e]) => [uid, { uid, username: e.username, avatar: e.avatar, ...streakOf(e.days, today) }]));
}

export type StreakRow = { uid: string; username: string; avatar: string | null; current: number; best: number };

/** "Maiores sequências": members with the longest streaks still alive. */
export async function topStreaks(limit = 10, now = Date.now()): Promise<StreakRow[]> {
  return [...(await allStreaks(now)).values()]
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current || b.best - a.best || a.uid.localeCompare(b.uid))
    .slice(0, limit);
}

export async function streakFor(uid: string, now = Date.now()): Promise<Streak> {
  const today = brDay(now);
  const client = await db();
  const r = await client.execute({
    sql: "SELECT day FROM daily_plays WHERE uid = ? AND day >= ? ORDER BY day",
    args: [uid, addDays(today, -STREAK_WINDOW_DAYS)],
  });
  return streakOf(
    r.rows.map((x) => String(x.day)),
    today,
  );
}

export type LeaderRow = { uid: string; username: string; avatar: string | null; score: number };

/** Today's best scores among members (earliest wins a tie). */
export async function dailyLeaderboard(limit = 10, now = Date.now()): Promise<LeaderRow[]> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT d.uid, u.username, COALESCE(u.avatar, p.avatar) AS avatar, d.score
          FROM daily_plays d JOIN users u ON u.id = d.uid LEFT JOIN profiles p ON p.id = d.uid
          WHERE d.day = ? AND d.uid IS NOT NULL
          ORDER BY d.score DESC, d.at, d.uid
          LIMIT ?`,
    args: [brDay(now), limit],
  });
  return r.rows.map((x) => ({
    uid: String(x.uid),
    username: String(x.username),
    avatar: (x.avatar as string | null) ?? null,
    score: Number(x.score),
  }));
}

export type DailyResult = {
  guess: number;
  actual: number;
  score: number;
  /** 1 = best today (ties share the rank). */
  rank: number;
  players: number;
  /** % of the other players this score beat or tied (null when alone). */
  beat: number | null;
  streak: Streak | null;
};

/** The player's play today, with rank and streak; null when they haven't played. */
export async function getDailyResult(player: string, uid: string | null, now = Date.now()): Promise<DailyResult | null> {
  const day = brDay(now);
  const client = await db();
  const r = await client.execute({ sql: "SELECT guess, actual, score FROM daily_plays WHERE day = ? AND player = ?", args: [day, player] });
  const row = r.rows[0];
  if (!row) return null;
  const score = Number(row.score);
  const [stats, streak] = await Promise.all([
    client.execute({
      sql: `SELECT COUNT(*) AS n, SUM(CASE WHEN score > ? THEN 1 ELSE 0 END) AS better
            FROM daily_plays WHERE day = ?`,
      args: [score, day],
    }),
    uid ? streakFor(uid, now) : null,
  ]);
  const n = Number(stats.rows[0].n);
  const better = Number(stats.rows[0].better ?? 0);
  return {
    guess: Number(row.guess),
    actual: Number(row.actual),
    score,
    rank: better + 1,
    players: n,
    beat: n > 1 ? Math.round(((n - 1 - better) / (n - 1)) * 100) : null,
    streak,
  };
}

/** A visitor who played and then signed in: today's play moves to their account (unless they played there too). */
export async function adoptVisitorPlay(uid: string, visitor: string, now = Date.now()) {
  const client = await db();
  await client.execute({
    sql: `UPDATE daily_plays SET player = ?, uid = ?
          WHERE day = ? AND player = ? AND NOT EXISTS (SELECT 1 FROM daily_plays o WHERE o.day = ? AND o.player = ?)`,
    args: [`u:${uid}`, uid, brDay(now), visitor, brDay(now), `u:${uid}`],
  });
}

export const playerKey = (uid: string | null, visitor: string | null) => (uid ? `u:${uid}` : visitor);

/**
 * Records today's guess (the first one counts; later ones are ignored) and returns the result.
 * `target` is the bubble the player saw: if the question moved on (new day, or locked to another
 * bubble by someone else's first play), nothing is recorded and null is returned.
 */
export async function playDaily(player: string, uid: string | null, target: string, guess: number, now = Date.now()) {
  const q = await getDailyQuestion(now, target);
  if (!q || q.target !== target) return null;
  const client = await db();
  await client.execute({
    sql: "INSERT OR IGNORE INTO daily_plays (day, player, uid, target, guess, actual, score, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [q.day, player, uid, q.target, guess, q.actual, 100 - Math.abs(guess - q.actual), now],
  });
  return getDailyResult(player, uid, now);
}

/** Whether the member played today, and their streak (for the dashboard card). */
export async function getStreakCard(uid: string, now = Date.now()) {
  const client = await db();
  const [played, streak] = await Promise.all([
    client.execute({ sql: "SELECT 1 FROM daily_plays WHERE day = ? AND uid = ?", args: [brDay(now), uid] }),
    streakFor(uid, now),
  ]);
  return { played: played.rows.length > 0, streak };
}
