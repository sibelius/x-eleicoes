import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MIN_PEOPLE, allStates, brtDay, buildHistory, recentPicks, setPlaceFromX, stateHistory } from "@/lib/places";
import { decodeDay, sumStates } from "@/lib/regions";
import { makeDbs } from "./dbs";
import { DAY, MEMBERS, NOW, seed } from "./fixture";

// The live states map: day-by-day history (aggregates only) and the public picks feed, on SQLite and Postgres.

let dbs: Awaited<ReturnType<typeof makeDbs>>;

const UFS = ["SP", "SP", "SP", "SP", "RJ", "RJ", "RJ", "MG", "BA", "SP"] as const;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  dbs = await makeDbs();
  for (const d of [dbs.sqlite, dbs.pg]) {
    await seed(d);
    setDbForTests(d);
    for (const [i, uf] of UFS.entries()) await setPlaceFromX(MEMBERS[i].id, uf);
    // One private member's switch: never in the public feed.
    await d.execute({ sql: "UPDATE users SET visibility = 'private' WHERE id = ?", args: [MEMBERS[1].id] });
  }
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

describe("states history", () => {
  it("ends on today's map, the same as the live one", async () => {
    const h = await same(() => stateHistory());
    expect(h.days.at(-1)).toBe(brtDay(NOW));
    expect(h.days.length).toBe(h.states.length);
    expect(h.app.length).toBe(h.days.length);
    expect(decodeDay(h.states.at(-1)!)).toEqual(await same(() => allStates()));
    // Days are consecutive.
    for (let i = 1; i < h.days.length; i++) expect(Date.parse(h.days[i]) - Date.parse(h.days[i - 1])).toBe(DAY);
  });

  it("never ships a count under the minimum, nor anything about a person", async () => {
    const h = await same(() => stateHistory());
    for (const day of h.states)
      for (const c of Object.values(day)) {
        if (c === 0) continue;
        expect(c![0] + c![1] + c![2]).toBeGreaterThanOrEqual(MIN_PEOPLE);
      }
    const json = JSON.stringify(h);
    for (const m of MEMBERS) {
      expect(json).not.toContain(m.id);
      expect(json).not.toContain(m.username);
    }
  });

  it("replays picks as of each day, and people only after they joined", () => {
    const day0 = Date.UTC(2026, 9, 10, 15);
    const places = [
      { uid: "a", uf: "SP", createdAt: day0, vote: "green" },
      { uid: "b", uf: "SP", createdAt: day0, vote: "green" },
      { uid: "c", uf: "SP", createdAt: day0, vote: "red" },
      { uid: "d", uf: "SP", createdAt: day0 + 2 * DAY, vote: "red" },
      { uid: "e", uf: "RJ", createdAt: day0, vote: null },
      { uid: "f", uf: "XX", createdAt: day0, vote: "red" },
    ];
    const changes = [
      { uid: "a", to: "red", at: day0 },
      { uid: "b", to: "green", at: day0 },
      { uid: "c", to: "red", at: day0 },
      { uid: "a", to: "green", at: day0 + DAY }, // switched the next day
      { uid: "d", to: "red", at: day0 + 2 * DAY },
    ];
    const h = buildHistory(places, changes, day0 + 3 * DAY);
    expect(h.days).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
    expect(h.states[0]).toEqual({ SP: [2, 1, 0], RJ: 0 });
    expect(h.states[1]).toEqual({ SP: [1, 2, 0], RJ: 0 });
    expect(h.states[2]).toEqual({ SP: [2, 2, 0], RJ: 0 });
    expect(h.app[0]).toEqual({ red: 2, green: 1 });
    expect(h.app[2]).toEqual({ red: 2, green: 2 });
    // Capped to the last days.
    expect(buildHistory(places, changes, day0 + 3 * DAY, 2).days).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("regions add up only the states shown", () => {
    const s = sumStates(decodeDay({ SP: [2, 1, 1], RJ: 0, MG: [3, 0, 0] }), ["SP", "RJ", "ES", "MG"]);
    expect(s).toEqual({ red: 5, green: 1, none: 1, total: 7, shown: 2, few: 1 });
  });
});

describe("recent picks", () => {
  it("lists public members' picks and switches, newest first, without states", async () => {
    const feed = await same(() => recentPicks(50));
    expect(feed.length).toBeGreaterThan(0);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1].at).toBeGreaterThanOrEqual(feed[i].at);
    expect(feed.map((e) => e.username)).not.toContain(MEMBERS[1].username);
    expect(feed.some((e) => e.from)).toBe(true);
    for (const e of feed) expect(Object.keys(e).sort()).toEqual(["at", "avatar", "from", "to", "username"]);
  });
});
