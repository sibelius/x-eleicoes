import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { communities, getBubbleMap, getGlobalBubbleMap, linksAmong, pickNodes } from "@/lib/bubble-map";
import { setDbForTests } from "@/lib/db";
import type { NetworkNode } from "@/lib/network";
import { MIN_PEOPLE, allStates, bubbleStates, getPlace, setPlaceFromX, setPlaceSelf } from "@/lib/places";
import { makeDbs } from "./dbs";
import { MEMBERS, NOW, seed } from "./fixture";

// States (user_places) and the bubble's network map, on SQLite and Postgres: same results on both.

let dbs: Awaited<ReturnType<typeof makeDbs>>;

const UFS = ["SP", "SP", "SP", "SP", "RJ", "RJ", "RJ", "MG", "BA"] as const;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  dbs = await makeDbs();
  for (const d of [dbs.sqlite, dbs.pg]) {
    await seed(d);
    setDbForTests(d);
    for (const [i, uf] of UFS.entries()) await setPlaceFromX(MEMBERS[i].id, uf);
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

describe("places", () => {
  it("aggregates by state, hiding counts under the minimum", async () => {
    const all = await same(() => allStates());
    const sp = all.find((s) => s.uf === "SP")!;
    expect(sp).toMatchObject({ total: 4 });
    expect(all.find((s) => s.uf === "MG")).toEqual({ uf: "MG", few: true });
    for (const s of all) if ("total" in s) expect(s.total).toBeGreaterThanOrEqual(MIN_PEOPLE);
    const mine = await same(() => bubbleStates(MEMBERS[0].id));
    expect(mine.every((s) => "few" in s || s.red + s.green + s.none === s.total)).toBe(true);
  });

  it("a member's pick beats X, and clearing it keeps X from filling it back", async () => {
    const uid = MEMBERS[10].id;
    await same(async () => {
      await setPlaceFromX(uid, "PE");
      const fromX = await getPlace(uid);
      await setPlaceSelf(uid, "CE");
      await setPlaceFromX(uid, "PE");
      const picked = await getPlace(uid);
      await setPlaceSelf(uid, null);
      await setPlaceFromX(uid, "PE");
      const hidden = await getPlace(uid);
      return { fromX, picked, hidden };
    }).then((r) => {
      expect(r.fromX).toEqual({ uf: "PE", source: "x" });
      expect(r.picked).toEqual({ uf: "CE", source: "self" });
      expect(r.hidden).toEqual({ uf: null, source: "self" });
    });
    // An X location that no longer parses clears an X-sourced state.
    const other = MEMBERS[11].id;
    expect(
      await same(async () => {
        await setPlaceFromX(other, "AM");
        await setPlaceFromX(other, null);
        return getPlace(other);
      }),
    ).toBeNull();
  });
});

describe("bubble map", () => {
  it("links among a bubble's people, with communities", async () => {
    const m = await same(() => getBubbleMap(MEMBERS[1].id));
    expect(m.ids.length).toBeGreaterThan(0);
    expect(m.groups).toHaveLength(m.ids.length);
    for (const [i, j] of m.links) expect(i).toBeLessThan(j);
    expect(m.ids).not.toContain(MEMBERS[1].id);
    const g = await same(() => getGlobalBubbleMap());
    expect(g.links.length).toBeGreaterThan(0);
  });

  it("linksAmong folds both directions into one mutual link", async () => {
    const ids = MEMBERS.map((x) => x.id);
    const links = await same(() => linksAmong(ids));
    expect(new Set(links.map(([i, j]) => `${i}:${j}`)).size).toBe(links.length);
  });

  it("communities and pickNodes", () => {
    // Two triangles joined by one link.
    const g = communities(6, [[0, 1], [1, 2], [0, 2], [3, 4], [4, 5], [3, 5], [2, 3]]);
    expect(g[0]).toBe(g[1]);
    expect(g[3]).toBe(g[4]);
    expect(g[0]).not.toBe(g[4]);
    const node = (id: string, member: boolean, strength: number) => ({ id, member, strength }) as NetworkNode;
    const kept = pickNodes([node("a", false, 3), node("b", true, 0), node("c", true, 0), node("d", false, 1)], 3, new Map([["c", 5]]));
    expect(kept.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
});
