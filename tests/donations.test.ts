import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import * as donations from "@/lib/donations";
import * as sponsors from "@/lib/sponsors";
import type { Db } from "@/lib/sql";
import { makeDbs } from "./dbs";
import { DAY, NOW, seed } from "./fixture";

// Donations (claims, admin, goal, wall, badge) and sponsor reports, on SQLite and Postgres alike.

let dbs: Awaited<ReturnType<typeof makeDbs>>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  dbs = await makeDbs();
  for (const d of [dbs.sqlite, dbs.pg]) {
    await seed(d);
    // Same ids in both databases (newId depends on Math.random).
    await d.batch(
      [
        `INSERT INTO donations (id, at, amount, uid, name, public, status, note) VALUES
          (1, ${NOW - 2 * DAY}, 2500, '1001', '@member1', 1, 'confirmed', 'admin'),
          (2, ${NOW - DAY}, 1000, '1001', 'Member One', 1, 'confirmed', 'admin'),
          (3, ${NOW - 3 * DAY}, 5000, NULL, 'Fulana', 1, 'confirmed', 'admin'),
          (4, ${NOW - DAY}, 9900, '1002', NULL, 0, 'confirmed', 'admin'),
          (5, ${NOW - 40 * DAY}, 7000, '1003', 'Old', 1, 'confirmed', 'admin'),
          (6, ${NOW - 1000}, 500, '1004', 'Pending', 1, 'pending', 'site u:1004'),
          (7, ${NOW - 2000}, 800, '1005', 'Rejected', 1, 'rejected', 'site u:1005')`,
      ],
      "write",
    );
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

/** Writes: run on both, each from the same starting state. */
async function both(fn: () => Promise<unknown>) {
  for (const d of [dbs.sqlite, dbs.pg] as Db[]) {
    setDbForTests(d);
    await fn();
  }
}

describe("money helpers", () => {
  it("toCents parses Brazilian and plain amounts within R$ 1 … 100.000", () => {
    expect(donations.toCents("25")).toBe(2500);
    expect(donations.toCents("25,50")).toBe(2550);
    expect(donations.toCents("1.000,00")).toBe(100000);
    expect(donations.toCents("R$ 10")).toBe(1000);
    expect(donations.toCents(12.5)).toBe(1250);
    expect(donations.toCents("0,50")).toBeNull();
    expect(donations.toCents("100000,01")).toBeNull();
    expect(donations.toCents("abc")).toBeNull();
    expect(donations.toCents("")).toBeNull();
  });

  it("monthStart is midnight of the 1st in Brasília", () => {
    expect(new Date(donations.monthStart(NOW)).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    // 1 Nov 01:00 UTC is still 31 Oct in Brasília.
    expect(new Date(donations.monthStart(Date.UTC(2026, 10, 1, 1))).toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });
});

describe("donations", () => {
  it("goal progress: confirmed this month only, default goal, then the setting", async () => {
    const g = await same(() => donations.getGoalProgress());
    expect(g).toMatchObject({ raised: 2500 + 1000 + 5000 + 9900, goal: donations.DEFAULT_GOAL, donors: 3 });
    await both(() => donations.setSetting("donation_goal", "50000"));
    await both(() => donations.setSetting("donation_goal", "200000")); // upsert
    expect(await same(() => donations.getGoal())).toBe(200000);
    expect((await same(() => donations.getGoalProgress())).goal).toBe(200000);
  });

  it("supporter wall: public confirmed, one per person, latest first, no amounts", async () => {
    const wall = await same(() => donations.getSupporters());
    expect(wall.map((s) => s.name)).toEqual(["Member One", "Fulana", "Old"]);
    expect(wall[0]).toMatchObject({ username: "member1" });
    expect(wall[0].avatar).toContain("1001");
    expect(Object.keys(wall[0])).not.toContain("amount");
  });

  it("supporter badge: members with a public confirmed donation", async () => {
    expect(await same(() => donations.supporterIds())).toEqual(["1001", "1003"]);
    expect(await same(() => donations.isSupporter("1001"))).toBe(true);
    expect(await same(() => donations.isSupporter("1002"))).toBe(false); // anonymous donation
    expect(await same(() => donations.isSupporter("1004"))).toBe(false); // pending
    expect(await same(() => donations.isSupporter(null))).toBe(false);
  });

  it("claims are pending and rate-limited per donor", async () => {
    const results: (string | null)[][] = [];
    for (const d of [dbs.sqlite, dbs.pg]) {
      setDbForTests(d);
      const r: (string | null)[] = [];
      for (let i = 0; i < 4; i++) r.push(await donations.claimDonation({ amount: 1000, uid: null, name: "  Ana   Maria ", public: true, who: "v:abc" }));
      r.push(await donations.claimDonation({ amount: 1000, uid: "1006", name: null, public: false, who: "u:1006" }));
      r.push(await donations.claimDonation({ amount: 50, uid: null, name: null, public: false, who: "v:zzz" }));
      results.push(r);
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[0].slice(0, 3)).toEqual([null, null, null]);
    expect(results[0][3]).toMatch(/Muitos/);
    expect(results[0][4]).toBeNull();
    expect(results[0][5]).toMatch(/Valor/);
    const list = await same(() => donations.listDonations().then((l) => l.map((d) => ({ ...d, id: 0 })).sort((a, b) => `${a.name}${a.at}`.localeCompare(`${b.name}${b.at}`))));
    const ana = list.filter((d) => d.name === "Ana Maria");
    expect(ana).toHaveLength(3);
    expect(ana.every((d) => d.status === "pending" && d.public)).toBe(true);
  });

  it("admin: add (linked by handle), confirm, reject, delete", async () => {
    await both(() => donations.addDonation({ amount: 3000, name: "", handle: "@MEMBER7", public: true }));
    await both(() => donations.addDonation({ amount: 2000, name: "Zé", handle: "", public: false, note: "extrato" }));
    const key = (d: { name: string | null; amount: number; status: string }) => `${d.name}|${d.amount}|${d.status}`;
    // Rows made in the same (frozen) millisecond have random ids: compare them in a fixed order.
    const list = await same(() => donations.listDonations().then((l) => l.map((d) => ({ ...d, id: 0, at: 0 })).sort((a, b) => key(a).localeCompare(key(b)))));
    expect(list.find((d) => d.username === "member7")).toMatchObject({ uid: "1007", name: "@member7", status: "confirmed", public: true });
    expect(list.find((d) => d.name === "Zé")).toMatchObject({ uid: null, note: "extrato", public: false });
    await both(() => donations.setDonationStatus(6, "confirmed"));
    expect(await same(() => donations.isSupporter("1004"))).toBe(true);
    await both(() => donations.setDonationStatus(6, "rejected"));
    await both(() => donations.deleteDonation(7));
    const ids = await same(() => donations.listDonations().then((l) => l.map((d) => d.id).filter((id) => id < 100)));
    expect(ids.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("sponsors", () => {
  it("slugs and report tokens", () => {
    expect(sponsors.adSlug("conta.vc")).toBe("conta-vc");
    expect(sponsors.adSlug("Guara Cloud")).toBe("guara-cloud");
    expect(sponsors.adBySlug("hodle")?.name).toBe("Hodle");
    expect(sponsors.adBySlug("nope")).toBeNull();
    const t = sponsors.reportToken("hodle");
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(sponsors.checkReportToken("hodle", t)).toBe(true);
    expect(sponsors.checkReportToken("rica", t)).toBe(false);
    expect(sponsors.checkReportToken("hodle", t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"))).toBe(false);
    expect(sponsors.checkReportToken("hodle", undefined)).toBe(false);
    expect(sponsors.reportPath("Hodle")).toBe(`/anunciantes/hodle?k=${t}`);
  });

  it("getSponsorReport", async () => {
    const r = await same(() => sponsors.getSponsorReport("Hodle"));
    expect(r.totals).toEqual({ views: 5, viewers: 2, clicks: 1, clickers: 1, firstDay: "2026-10-14", lastDay: "2026-10-15" });
    expect(r.daily).toHaveLength(30);
    expect(r.daily.at(-1)).toMatchObject({ day: "2026-10-15", views: 3, viewers: 1, clicks: 1, visitors: 12 });
    expect(r.placements.map((p) => p.placement)).toEqual(["home", "app"]);
    expect(r.window).toEqual({ visitors: 12, reached: 2 });
    const empty = await same(() => sponsors.getSponsorReport("Revi"));
    expect(empty.totals).toMatchObject({ views: 0, viewers: 0, firstDay: null });
  });

  it("getMediaKit", async () => {
    const k = await same(() => sponsors.getMediaKit());
    expect(k).toMatchObject({ members: 24, visitors7: 12, visitors30: 12, bubbles: 6 });
    expect(k.ads).toMatchObject({ views: 6, clicks: 1, reach: 2, advertisers: 2 });
    expect(k.ads.ctr).toBeCloseTo(1 / 6);
    expect(k.daily).toHaveLength(30);
  });
});
