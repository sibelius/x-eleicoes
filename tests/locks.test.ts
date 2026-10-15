import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PG_INDEXES, PG_SCHEMA, PG_TABLES } from "@/lib/schema";
import { ensureSchema, insertMany, pgDb, type Db, type Stmt } from "@/lib/sql";
import { makeDbs } from "./dbs";

// Production froze on 2026-10-15: every cold start ran CREATE INDEX IF NOT EXISTS (which locks the
// table even when the index exists), it queued behind a long write transaction, every request queued
// behind it, and the Supabase pooler ran out of connections. These tests keep each piece of that from coming back.

const text = (s: Stmt) => (typeof s === "string" ? s : s.sql);

/** Records every statement sent to a database. */
function spy(d: Db) {
  const seen: string[] = [];
  const db: Db = {
    dialect: d.dialect,
    execute: (s) => (seen.push(text(s)), d.execute(s)),
    batch: (ss, mode) => (seen.push(...ss.map(text)), d.batch(ss, mode)),
  };
  return { db, seen };
}

let dbs: Awaited<ReturnType<typeof makeDbs>>;
beforeAll(async () => {
  dbs = await makeDbs();
});
afterAll(() => dbs.close());

describe("the app never creates indexes on Postgres", () => {
  it("runtime schema is tables only; every index is left for pnpm db:indexes", () => {
    expect(PG_TABLES.some((s) => /CREATE\s+(UNIQUE\s+)?INDEX/i.test(s))).toBe(false);
    expect(PG_INDEXES.length).toBeGreaterThan(0);
    expect([...PG_TABLES, ...PG_INDEXES].sort()).toEqual([...PG_SCHEMA].sort());
  });

  it("db.ts applies PG_TABLES, not the full schema", () => {
    const src = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
    expect(src).toMatch(/schema: PG_TABLES/);
    expect(src).not.toMatch(/PG_SCHEMA/);
  });
});

describe("ensureSchema", () => {
  for (const dialect of ["sqlite", "pg"] as const) {
    it(`${dialect}: applies once, then a cold start is a single SELECT`, async () => {
      const schema = dialect === "pg" ? PG_TABLES : undefined;
      const first = spy(dbs[dialect]);
      // makeDbs already created the tables; the first ensureSchema still records the version.
      expect(await ensureSchema(first.db, schema ?? ["CREATE TABLE IF NOT EXISTS t_ensure (a TEXT)"])).toBe(true);
      const again = spy(dbs[dialect]);
      expect(await ensureSchema(again.db, schema ?? ["CREATE TABLE IF NOT EXISTS t_ensure (a TEXT)"])).toBe(false);
      expect(again.seen).toHaveLength(1);
      expect(again.seen[0]).toMatch(/^SELECT/);
    });
  }

  it("pg: DDL gives up on a lock instead of queuing forever", async () => {
    const s = spy(dbs.pg);
    await ensureSchema(s.db, [...PG_TABLES, "CREATE TABLE IF NOT EXISTS t_new (a TEXT)"]);
    expect(s.seen).toContain("SET LOCAL lock_timeout = '5s'");
  });
});

describe("Postgres read batches", () => {
  it("run without a transaction (a frozen function can't leave one open)", async () => {
    let transactions = 0;
    const db = pgDb({
      query: async () => ({ rows: [{ n: 1 }], count: 1 }),
      transaction: async (fn) => (transactions++, fn(async () => ({ rows: [], count: 0 }))),
    });
    await db.batch(["SELECT 1", "SELECT 2"], "read");
    expect(transactions).toBe(0);
    await db.batch(["SELECT 1", "DELETE FROM t"], "read"); // a write slipped into a "read" batch keeps its transaction
    await db.batch(["INSERT INTO t VALUES (1)"], "write");
    expect(transactions).toBe(2);
  });
});

describe("insertMany", () => {
  it("chunks rows into a few statements", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => [String(i), "x"]);
    const stmts = insertMany("INSERT OR IGNORE INTO edges (src, dst)", rows);
    expect(stmts).toHaveLength(3);
    expect(text(stmts[2])).toBe("INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)");
  });

  it("same rows on SQLite and Postgres: duplicate edges ignored, profiles upserted", async () => {
    const out = [];
    for (const d of [dbs.sqlite, dbs.pg]) {
      await d.batch(
        [
          ...insertMany("INSERT OR IGNORE INTO edges (src, dst)", [["900", "901"], ["900", "901"], ["902", "900"]], "", 2),
          ...insertMany(
            "INSERT INTO profiles (id, username, name, avatar)",
            [["901", "a", "A", null], ["902", "b", "B", "x.png"]],
            "ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar",
          ),
          ...insertMany(
            "INSERT INTO profiles (id, username, name, avatar)",
            [["901", "a2", "A2", null]],
            "ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar",
          ),
        ],
        "write",
      );
      const [edges, profiles] = await d.batch(
        [
          "SELECT src, dst FROM edges WHERE src IN ('900', '902') ORDER BY src, dst",
          "SELECT id, username, name, avatar FROM profiles WHERE id IN ('901', '902') ORDER BY id",
        ],
        "read",
      );
      out.push({ edges: edges.rows, profiles: profiles.rows });
    }
    expect(out[0]).toEqual(out[1]);
    expect(out[1].edges).toHaveLength(2);
    expect(out[1].profiles[0]).toMatchObject({ id: "901", username: "a2" });
  });
});
