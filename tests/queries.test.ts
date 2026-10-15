import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import * as messages from "@/lib/messages";
import * as network from "@/lib/network";
import * as race from "@/lib/race";
import { getRoom } from "@/lib/room";
import * as social from "@/lib/social";
import * as stats from "@/lib/stats";
import { siteCounts, viewCounts } from "@/lib/views";
import type { Db } from "@/lib/sql";
import { makeDbs } from "./dbs";
import { MEMBERS, NOW, seed } from "./fixture";

// Every query the app runs, on SQLite (Turso) and on Postgres (Supabase), over the same data:
// the results must be identical, so switching databases can't change what anyone sees.

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

async function on<T>(d: Db, fn: () => Promise<T>) {
  setDbForTests(d);
  return fn();
}

/** Runs `fn` on both databases, expects the same result, and returns it. */
async function same<T>(fn: () => Promise<T>): Promise<T> {
  const a = await on(dbs.sqlite, fn);
  const b = await on(dbs.pg, fn);
  expect(b).toEqual(a);
  return a;
}

const red = MEMBERS.filter((m) => m.vote === "red");
const green = MEMBERS.filter((m) => m.vote === "green");

describe("people and bubbles", () => {
  it("getMe / resolveUser (case-insensitive handle, id, known profile)", async () => {
    expect(await same(() => network.getMe("1001"))).toMatchObject({ username: "member1", vote: MEMBERS[1].vote });
    expect(await same(() => network.resolveUser("MEMBER2"))).toEqual({ id: "1002", username: "member2" });
    expect(await same(() => network.resolveUser("@1003"))).toEqual({ id: "1003", username: "member3" });
    expect(await same(() => network.resolveUser("Person7"))).toEqual({ id: "5007", username: "person7" });
    expect(await same(() => network.resolveUser("nobody"))).toBeNull();
  });

  it("listMembers, with a case-insensitive search", async () => {
    expect(await same(() => network.listMembers())).toHaveLength(MEMBERS.length);
    const found = await same(() => network.listMembers("MEMBER1"));
    expect(found.map((m) => m.username).sort()).toEqual(["member1", ...Array.from({ length: 10 }, (_, i) => `member1${i}`)].sort());
  });

  it("inviteCount, bubbleTallies, getRankings", async () => {
    expect(await same(() => network.inviteCount("1004"))).toBe(MEMBERS.filter((m) => m.invitedBy === "1004").length);
    const tallies = await same(() => network.bubbleTallies().then((t) => t.sort((x, y) => x.id.localeCompare(y.id))));
    expect(tallies.length).toBeGreaterThan(10);
    const r = await same(() => network.getRankings());
    expect(r.inviters[0].invites).toBeGreaterThan(0);
  });

  it("getNetwork, getShare, getTimeline, getBubbleSize", async () => {
    const n = await same(() => network.getNetwork("1001"));
    expect(n.tally.total).toBeGreaterThan(0);
    expect(n.tally.red + n.tally.green).toBe(n.tally.total);
    await same(() => network.getShare("1001"));
    await same(() => network.getShare("5003")); // a non-member's bubble
    await same(() => network.getTimeline("1001"));
    await same(() => network.getBubbleSize("1001"));
    const all = await same(() => network.getBubbleSize(null));
    expect(all.members).toBe(MEMBERS.length);
  });

  it("whole network: global bubble, famous accounts, map points, comparison", async () => {
    await same(() => network.getGlobalNetwork());
    const famous = await same(() => network.getFamous());
    expect(famous[0]).toMatchObject({ id: "5000", followers: MEMBERS.length });
    const map = await same(() => network.getMapPoints());
    expect(map.id.length).toBeGreaterThan(MEMBERS.length);
    await same(() => network.getComparison("member1", "member2"));
  });
});

describe("play", () => {
  it("who's missing, twins, bridge, retrospectiva, quem virou", async () => {
    const missing = await same(() => social.getMissing("1001"));
    expect(missing.every((m) => Number(m.id) >= 5000)).toBe(true);
    expect(await same(() => social.inviteOpens("1000"))).toBe(2);
    const twins = await same(() => social.getTwins("1001"));
    expect(twins.twin).not.toBeNull();
    const bridge = await same(() => social.getBridge(red[1].id));
    expect(bridge?.path.at(-1)?.vote).toBe("green");
    await same(() => social.getWrapped("1001"));
    const swing = await same(() => social.getSwing());
    expect(swing.switches.length).toBeGreaterThan(0);
    expect(swing.flow.toGreen + swing.flow.toRed).toBe(swing.switches.length);
  });

  it("invite race and the live room", async () => {
    const r = await same(() => race.getRace());
    expect(r.racers.map((x) => x.rank)).toEqual(r.racers.map((_, i) => i + 1));
    await same(() => race.passedBy("1004", "1007"));
    const room = await same(() => getRoom());
    expect(room.totals).toEqual({ red: red.length, green: green.length, members: MEMBERS.length });
    expect(room.online.red + room.online.green + room.online.none).toBe(4);
  });

  it("views and site counters", async () => {
    await same(() => viewCounts(["1000", "1001", "_site"]));
    expect(await same(() => siteCounts(new Date(NOW).toISOString().slice(0, 10)))).toEqual({ today: 12, members: MEMBERS.length });
  });
});

describe("messages", () => {
  it("reads: inbox, history, unseen, muted, admin list", async () => {
    expect(await same(() => messages.myMessages("1000"))).toHaveLength(2);
    expect(await same(() => messages.unseenCount("1001"))).toBe(1);
    expect(await same(() => messages.isMuted("1005"))).toBe(true);
    expect(await same(() => messages.allMessages())).toHaveLength(3);
    expect(await same(() => messages.isLive("1003"))).toBe(true);
  });

  it("asking rules", async () => {
    expect(await same(() => messages.askBlocked("1000", "1000"))).toMatch(/si mesmo/);
    expect(await same(() => messages.askBlocked("1000", "1001"))).toMatch(/já pediu/); // asked in the last 12h
    expect(await same(() => messages.askBlocked(red[2].id, "1005"))).toMatch(/não está recebendo/);
    expect(await same(() => messages.askBlocked(red[2].id, green[4].id))).toBeNull();
  });

  it("writes: send, deliver live once, mark seen", async () => {
    for (const d of [dbs.sqlite, dbs.pg]) {
      await on(d, async () => {
        const id = await messages.saveMessage({ from: red[2].id, to: green[4].id, kind: "ask", preset: "vem", body: "Vem pro Vermelho! 🙏", side: "red", via: "live" });
        const live = await messages.takeLive(green[4].id);
        expect(live.map((m) => m.id)).toContain(id);
        expect(await messages.takeLive(green[4].id)).toEqual([]); // delivered once
        expect((await messages.markSeen(green[4].id, id))?.body).toBe("Vem pro Vermelho! 🙏");
        expect(await messages.unseenCount(green[4].id)).toBe(0);
      });
    }
  });
});

describe("admin", () => {
  it("overview, ads, origin, pushes, database, graph", async () => {
    await same(() => stats.getOverview());
    const ads = await same(() => stats.getAdStats());
    expect(ads.totals.views).toBe(6);
    const utm = await same(() => stats.getUtmStats());
    expect(utm.totals.signups).toBe(1);
    const pushes = await same(() => stats.getPushLog());
    expect(pushes.rows).toHaveLength(3);
    await same(() => stats.getMemberGraph());
    await same(() => stats.getBubbleLeans());
    // Size and engine differ by design; the counts must not.
    const a = await on(dbs.sqlite, () => stats.getDbStats());
    const b = await on(dbs.pg, () => stats.getDbStats());
    expect(b.tables).toEqual(a.tables);
    expect(b.daily).toEqual(a.daily);
    expect(b.health).toEqual(a.health);
  });
});
