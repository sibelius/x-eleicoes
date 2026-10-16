import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { getNetwork } from "@/lib/network";
import * as topics from "@/lib/topics";
import { makeDbs } from "./dbs";
import { MEMBERS, NOW, seed } from "./fixture";

// Topics over the same follow graph: identical results on SQLite and Postgres.

let dbs: Awaited<ReturnType<typeof makeDbs>>;

const base = { title: "Clássico", question: "Quem leva?", a_label: "Time A", a_color: "#ff0000", b_label: "Time B", b_color: "#0000ff" };

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  dbs = await makeDbs();
  for (const d of [dbs.sqlite, dbs.pg]) {
    await seed(d);
    setDbForTests(d);
    await topics.saveTopic({ id: "classico", ...base, status: "live" });
    await topics.saveTopic({ id: "rascunho", ...base, status: "draft" });
    // Even members pick A, odd ones B; a few skip. 1000 changes its mind.
    for (const m of MEMBERS) if (Number(m.id) % 5 !== 4) await topics.setTopicVote("classico", m.id, Number(m.id) % 2 ? "b" : "a");
    await topics.setTopicVote("classico", "1000", "b");
    await topics.setTopicVote("rascunho", "1001", "a");
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

describe("topics", () => {
  it("lists live topics for the public, every topic for admins", async () => {
    expect((await same(() => topics.listTopics())).map((t) => t.id)).toEqual(["classico"]);
    expect((await same(() => topics.listTopics({ all: true }))).map((t) => t.id).sort()).toEqual(["classico", "rascunho"]);
    expect(await same(() => topics.getTopic("classico"))).toMatchObject({ ...base, status: "live", created_at: NOW });
    expect(await same(() => topics.getTopic("nada"))).toBeNull();
  });

  it("edits keep created_at and the slug", async () => {
    for (const d of [dbs.sqlite, dbs.pg]) {
      setDbForTests(d);
      vi.setSystemTime(NOW + 1000);
      await topics.saveTopic({ id: "rascunho", ...base, title: "Outro", status: "closed" });
      vi.setSystemTime(NOW);
    }
    expect(await same(() => topics.getTopic("rascunho"))).toMatchObject({ title: "Outro", status: "closed", created_at: NOW });
  });

  it("votes upsert (latest pick counts) and counts per topic", async () => {
    expect(await same(() => topics.getTopicVote("classico", "1000"))).toBe("b");
    expect(await same(() => topics.getTopicVote("classico", "1004"))).toBeNull();
    const voters = MEMBERS.filter((m) => Number(m.id) % 5 !== 4);
    const a = voters.filter((m) => Number(m.id) % 2 === 0 && m.id !== "1000").length;
    const all = await same(() => topics.topicCounts());
    expect(all.classico).toEqual({ a, b: voters.length - a });
    expect(all.rascunho).toEqual({ a: 1, b: 0 });
    expect(Object.keys(await same(() => topics.topicCounts("classico")))).toEqual(["classico"]);
  });

  it("a topic's bubble is the election bubble with the topic's picks", async () => {
    for (const m of MEMBERS.slice(0, 6)) {
      const t = await same(() => topics.getTopicNetwork("classico", m.id));
      setDbForTests(dbs.sqlite);
      const n = await getNetwork(m.id);
      // Same people, in the same order; only the picks differ.
      expect(t.nodes.map((x) => x.id)).toEqual(n.nodes.map((x) => x.id));
      for (const x of t.nodes) {
        const want = x.member ? (x.id === "1000" ? "b" : Number(x.id) % 5 === 4 ? null : Number(x.id) % 2 ? "b" : "a") : null;
        expect(x.vote).toBe(topics.sideToSlot(want as topics.TopicSide | null));
        expect(x.voted).toBe(Boolean(want));
      }
      expect(t.tally.total).toBe(t.tally.red + t.tally.green);
      expect(t.tally.red).toBe(t.nodes.filter((x) => x.vote === "red").length);
    }
  });

  it("parseTopic validates the admin form", () => {
    const ok = topics.parseTopic({ id: " Meu-Tema ", ...base, a_color: "#FF0000", status: "live" });
    expect(ok).toEqual({ ok: true, topic: { id: "meu-tema", ...base, status: "live" } });
    expect(topics.parseTopic({ id: "x y", ...base }).ok).toBe(false);
    expect(topics.parseTopic({ id: "ok", ...base, a_color: "red" }).ok).toBe(false);
    expect(topics.parseTopic({ id: "ok", ...base, status: "public" }).ok).toBe(false);
    expect(topics.parseTopic({ id: "ok", ...base, b_label: "" }).ok).toBe(false);
    expect(topics.parseTopic({ id: "ok", ...base })).toMatchObject({ ok: true, topic: { status: "draft" } });
  });
});
