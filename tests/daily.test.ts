import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import * as daily from "@/lib/daily";
import type { Db } from "@/lib/sql";
import { makeDbs } from "./dbs";
import { DAY, NOW, seed } from "./fixture";

// "Pergunta do dia": the pick, plays, ranks and streaks, identical on SQLite and Postgres.

let dbs: Awaited<ReturnType<typeof makeDbs>>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  dbs = await makeDbs();
  await seed(dbs.sqlite);
  await seed(dbs.pg);
});

afterAll(async () => {
  setDbForTests(undefined);
  vi.useRealTimers();
  await dbs.close();
});

async function same<T>(fn: () => Promise<T>): Promise<T> {
  setDbForTests(dbs.sqlite);
  const a = await fn();
  setDbForTests(dbs.pg);
  const b = await fn();
  expect(b).toEqual(a);
  return a;
}

async function both(fn: (d: Db) => Promise<unknown>) {
  await fn(dbs.sqlite);
  await fn(dbs.pg);
}

describe("dates and streaks", () => {
  it("brDay is the Brasília date; the next question opens at midnight there", () => {
    expect(daily.brDay(Date.UTC(2026, 9, 15, 2, 59))).toBe("2026-10-14");
    expect(daily.brDay(Date.UTC(2026, 9, 15, 3, 0))).toBe("2026-10-15");
    expect(daily.nextQuestionAt(NOW)).toBe(Date.UTC(2026, 9, 16, 3, 0));
  });

  it("streakOf: consecutive days ending today or yesterday, and the best run", () => {
    expect(daily.streakOf([], "2026-10-15")).toEqual({ current: 0, best: 0 });
    expect(daily.streakOf(["2026-10-13", "2026-10-14", "2026-10-15"], "2026-10-15")).toEqual({ current: 3, best: 3 });
    expect(daily.streakOf(["2026-10-13", "2026-10-14"], "2026-10-15")).toEqual({ current: 2, best: 2 });
    expect(daily.streakOf(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-13"], "2026-10-15")).toEqual({ current: 0, best: 3 });
    expect(daily.streakOf(["2026-09-30", "2026-10-01", "2026-10-15"], "2026-10-15")).toEqual({ current: 1, best: 2 });
  });
});

describe("the daily question", () => {
  it("picks the same bubble on both databases, deterministic for the day", async () => {
    const q = await same(() => daily.getDailyQuestion());
    expect(q).not.toBeNull();
    expect(q!.day).toBe("2026-10-15");
    expect(q!.locked).toBe(false);
    expect(q!.actual).toBeGreaterThanOrEqual(0);
    expect(await same(() => daily.getDailyQuestion())).toEqual(q);
  });

  it("avoids bubbles featured in the last two weeks", async () => {
    const q = (await same(() => daily.getDailyQuestion()))!;
    await both((d) => d.execute({ sql: "INSERT INTO daily_plays (day, player, uid, target, guess, actual, score, at) VALUES ('2026-10-10', 'old', NULL, ?, 50, 50, 100, ?)", args: [q.target, NOW - 5 * DAY] }));
    const next = (await same(() => daily.getDailyQuestion()))!;
    expect(next.target).not.toBe(q.target);
    await both((d) => d.execute("DELETE FROM daily_plays WHERE player = 'old'"));
  });

  it("first play counts and locks the question; rank, beat and streaks", async () => {
    const q = (await same(() => daily.getDailyQuestion()))!;
    // Past days for member 1001: a 2-day streak ending yesterday.
    await both((d) =>
      d.batch(
        ["2026-10-13", "2026-10-14", "2026-10-01"].map((day, i) => ({
          sql: "INSERT INTO daily_plays (day, player, uid, target, guess, actual, score, at) VALUES (?, 'u:1001', '1001', '0', 40, 50, 90, ?)",
          args: [day, NOW - (i + 1) * DAY],
        })),
        "write",
      ),
    );
    expect(await same(() => daily.getStreakCard("1001"))).toEqual({ played: false, streak: { current: 2, best: 2 } });

    const guess = q.actual >= 50 ? q.actual - 10 : q.actual + 10;
    const first = await same(async () => {
      // Each database plays the same sequence from scratch.
      const a = await daily.playDaily("u:1001", "1001", q.target, guess);
      const again = await daily.playDaily("u:1001", "1001", q.target, q.actual);
      expect(again).toEqual(a); // the second guess is ignored
      return a;
    });
    expect(first).toMatchObject({ guess, actual: q.actual, score: 100 - Math.abs(guess - q.actual), rank: 1, players: 1, beat: null, streak: { current: 3, best: 3 } });

    const locked = (await same(() => daily.getDailyQuestion()))!;
    expect(locked).toMatchObject({ target: q.target, actual: q.actual, locked: true });
    expect(await same(() => daily.playDaily("vis9", null, "999999", 50))).toBeNull(); // stale target

    // A perfect visitor and a worse member.
    await same(() => daily.playDaily("vis1", null, q.target, q.actual));
    await same(() => daily.playDaily("u:1002", "1002", q.target, q.actual >= 50 ? q.actual - 30 : q.actual + 30));
    expect(await same(() => daily.getDailyResult("u:1001", "1001"))).toMatchObject({ rank: 2, players: 3, beat: 50 });
    expect(await same(() => daily.getDailyResult("vis1", null))).toMatchObject({ rank: 1, score: 100, beat: 100, streak: null });

    // Members only on the leaderboard, best first.
    const board = await same(() => daily.dailyLeaderboard());
    expect(board.map((r) => r.username)).toEqual(["member1", "member2"]);
    expect(board[0]).toMatchObject({ uid: "1001", avatar: expect.stringContaining("1001") });

    const streaks = await same(() => daily.topStreaks());
    expect(streaks.map((s) => [s.username, s.current, s.best])).toEqual([
      ["member1", 3, 3],
      ["member2", 1, 1],
    ]);
  });

  it("a visitor's play moves to their account when they sign in", async () => {
    const q = (await same(() => daily.getDailyQuestion()))!;
    await same(() => daily.playDaily("vis5", null, q.target, 30));
    await same(() => daily.adoptVisitorPlay("1005", "vis5"));
    expect(await same(() => daily.getDailyResult("vis5", null))).toBeNull();
    expect(await same(() => daily.getStreakCard("1005"))).toEqual({ played: true, streak: { current: 1, best: 1 } });
    // Already played as a member: the visitor's play stays where it is.
    await same(() => daily.playDaily("vis6", null, q.target, 40));
    await same(() => daily.adoptVisitorPlay("1005", "vis6"));
    expect(await same(() => daily.getDailyResult("vis6", null))).toMatchObject({ guess: 40 });
  });
});
