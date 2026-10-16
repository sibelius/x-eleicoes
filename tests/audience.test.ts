import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as audience from "@/lib/audience";
import { setDbForTests } from "@/lib/db";
import type { Db } from "@/lib/sql";
import { makeDbs } from "./dbs";
import { MEMBERS, seed } from "./fixture";

// The audience tool (/audiencia) on SQLite and Postgres over the same data: identical results,
// and numbers that match the fixture.

let dbs: Awaited<ReturnType<typeof makeDbs>>;
let edges: [string, string][];

beforeAll(async () => {
  dbs = await makeDbs();
  await seed(dbs.sqlite);
  await seed(dbs.pg);
  const r = await dbs.sqlite.execute("SELECT src, dst FROM edges");
  edges = r.rows.map((x) => [String(x.src), String(x.dst)]);
});

afterAll(async () => {
  setDbForTests(undefined);
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

const UID = "1001";
const vote = new Map(MEMBERS.map((m) => [m.id, m.vote]));

describe("getAudience", () => {
  it("summarizes followers, following, mutuals and the followers' sides", async () => {
    const a = await same(() => audience.getAudience(UID));
    const followers = new Set(edges.filter(([, d]) => d === UID).map(([s]) => s));
    const following = new Set(edges.filter(([s]) => s === UID).map(([, d]) => d));
    const all = new Set([...followers, ...following]);
    expect(a.summary.followers).toBe(followers.size);
    expect(a.summary.following).toBe(following.size);
    expect(a.summary.mutuals).toBe([...followers].filter((x) => following.has(x)).length);
    expect(a.summary.accounts).toBe(all.size);
    expect(a.summary.members).toBe([...all].filter((x) => vote.has(x)).length);
    expect(a.summary.red).toBe([...followers].filter((x) => vote.get(x) === "red").length);
    expect(a.summary.green).toBe([...followers].filter((x) => vote.get(x) === "green").length);
    expect(a.nodes).toHaveLength(all.size);
    expect(a.capped).toBe(false);
  });

  it("ranks by reach (in-degree over every known edge)", async () => {
    const a = await same(() => audience.getAudience(UID));
    const inDeg = (id: string) => edges.filter(([, d]) => d === id).length;
    for (const n of a.nodes) expect(n.reach).toBe(inDeg(n.id));
    const reach = a.nodes.map((n) => n.reach);
    expect(reach).toEqual([...reach].sort((x, y) => y - x));
    expect(a.nodes[0].id).toBe("5000"); // everyone follows it
  });

  it("counts links to each side, without the owner", async () => {
    const a = await same(() => audience.getAudience(UID));
    for (const n of a.nodes.slice(0, 15)) {
      const linked = new Set(edges.filter(([s, d]) => (d === n.id && s !== UID) || (s === n.id && d !== UID)).map(([s, d]) => (s === n.id ? d : s)));
      expect(n.red).toBe([...linked].filter((x) => vote.get(x) === "red").length);
      expect(n.green).toBe([...linked].filter((x) => vote.get(x) === "green").length);
    }
    for (const b of audience.bridges(a)) expect(b.follower && b.red > 0 && b.green > 0).toBe(true);
    for (const m of audience.mutuals(a)) expect(m.follower && m.following).toBe(true);
    expect(audience.topFollowers(a).every((n) => n.follower)).toBe(true);
  });

  it("finds communities with labels and consistent sizes", async () => {
    const a = await same(() => audience.getAudience(UID));
    expect(a.communities.length).toBeGreaterThan(0);
    for (const c of a.communities) {
      expect(c.size).toBe(a.nodes.filter((n) => n.community === c.id).length);
      expect(c.size).toBeGreaterThanOrEqual(3);
      expect(c.top.length).toBeLessThanOrEqual(5);
      expect(c.label).toMatch(/^comunidade de @/);
    }
    expect(a.communities.map((c) => c.id)).toEqual(a.communities.map((_, i) => i));
  });

  it("an account with no known network is empty", async () => {
    const a = await same(() => audience.getAudience("nobody"));
    expect(a.nodes).toEqual([]);
    expect(a.summary.accounts).toBe(0);
    expect(a.communities).toEqual([]);
  });
});

describe("map and CSV", () => {
  it("getAudienceMap: one entry per account, edges within range, positions", async () => {
    const m = await same(() => audience.getAudienceMap(UID));
    const n = m.id.length;
    expect(n).toBeGreaterThan(0);
    for (const k of ["u", "n", "a", "c", "s", "l", "r", "f", "x", "y"] as const) expect(m[k]).toHaveLength(n);
    expect(m.e.length % 2).toBe(0);
    expect(m.e.every((i) => i >= 0 && i < n)).toBe(true);
    expect(m.f.every((f) => f >= 1 && f <= 3)).toBe(true);
    expect(m.x.every(Number.isFinite)).toBe(true);
  });

  it("audienceCsv: header plus one row per account, quoted when needed", async () => {
    setDbForTests(dbs.sqlite as Db);
    const a = await audience.getAudience(UID);
    const csv = audience.audienceCsv(a);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("posicao,handle,nome,alcance,lado,membro,relacao,comunidade,ligacoes_vermelho,ligacoes_verde,url");
    expect(lines).toHaveLength(a.nodes.length + 1);
    expect(lines[1].startsWith("1,@person0,Person 0,")).toBe(true);
    const odd = audience.audienceCsv({ ...a, nodes: [{ ...a.nodes[0], name: 'Fulano, "o" bom' }] });
    expect(odd).toContain('"Fulano, ""o"" bom"');
  });
});
