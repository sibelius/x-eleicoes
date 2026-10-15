import { describe, expect, it, vi } from "vitest";
import { isWrite, mirrored, toPg, type Db } from "@/lib/sql";

describe("toPg", () => {
  it("numbers ? placeholders and reuses :named ones", () => {
    expect(toPg("SELECT * FROM t WHERE a = ? AND b = ?", [1, "x"])).toEqual({ text: "SELECT * FROM t WHERE a = $1 AND b = $2", params: [1, "x"] });
    expect(toPg("SELECT :uid, :lim, :uid", { uid: "1", lim: 5 })).toEqual({ text: "SELECT $1, $2, $1", params: ["1", 5] });
  });

  it("leaves quoted strings alone (including ? and :name inside them)", () => {
    const { text, params } = toPg("SELECT 'u:' || id, 'a?b', 'it''s :x' FROM t WHERE id = ?", ["7"]);
    expect(text).toBe("SELECT 'u:' || id, 'a?b', 'it''s :x' FROM t WHERE id = $1");
    expect(params).toEqual(["7"]);
  });

  it("translates GLOB and INSERT OR IGNORE", () => {
    expect(toPg("SELECT 1 FROM users WHERE id GLOB '[0-9]*'").text).toBe("SELECT 1 FROM users WHERE id ~ '^[0-9]'");
    expect(toPg("INSERT OR IGNORE INTO views (a) VALUES (?)", [1]).text).toBe("INSERT INTO views (a) VALUES ($1) ON CONFLICT DO NOTHING");
  });

  it("missing values become NULL", () => {
    expect(toPg("SELECT ?, :a", [undefined]).params).toEqual([null, null]);
    expect(toPg("SELECT :a", {}).params).toEqual([null]);
  });
});

describe("mirrored", () => {
  const fake = () => {
    const seen: string[] = [];
    const d: Db = {
      dialect: "sqlite",
      execute: async (s) => (seen.push(typeof s === "string" ? s : s.sql), { rows: [{ ok: 1 }], rowsAffected: 1 }),
      batch: async (ss) => ss.map((s) => (seen.push(typeof s === "string" ? s : s.sql), { rows: [], rowsAffected: 1 })),
    };
    return { d, seen };
  };

  it("reads only from the primary; writes go to both", async () => {
    const p = fake();
    const m = fake();
    const db = mirrored(p.d, m.d, () => {});
    await db.execute("SELECT 1");
    await db.execute({ sql: "INSERT INTO t VALUES (?)", args: [1] });
    await db.batch(["SELECT 2", "UPDATE t SET a = 1", "WITH x AS (SELECT 1) SELECT * FROM x"], "write");
    expect(p.seen).toEqual(["SELECT 1", "INSERT INTO t VALUES (?)", "SELECT 2", "UPDATE t SET a = 1", "WITH x AS (SELECT 1) SELECT * FROM x"]);
    expect(m.seen).toEqual(["INSERT INTO t VALUES (?)", "UPDATE t SET a = 1"]);
  });

  it("a failing mirror never fails the request", async () => {
    const p = fake();
    const onError = vi.fn();
    const broken: Db = { dialect: "pg", execute: () => Promise.reject(new Error("down")), batch: () => Promise.reject(new Error("down")) };
    const db = mirrored(p.d, broken, onError);
    await expect(db.execute("DELETE FROM t")).resolves.toMatchObject({ rowsAffected: 1 });
    await expect(db.batch(["INSERT INTO t VALUES (1)"])).resolves.toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("isWrite", () => {
    expect(isWrite("  select 1")).toBe(false);
    expect(isWrite("WITH a AS (SELECT 1) SELECT * FROM a")).toBe(false);
    expect(isWrite("PRAGMA page_count")).toBe(false);
    expect(isWrite("INSERT INTO t VALUES (1)")).toBe(true);
    expect(isWrite("DELETE FROM t")).toBe(true);
    expect(isWrite("CREATE TABLE IF NOT EXISTS t (a INT)")).toBe(true);
  });
});
