import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { PG_SCHEMA } from "@/lib/schema";
import { toPg } from "@/lib/sql";

// Every literal SQL statement in the app (routes included), translated for Postgres and prepared
// (parsed and planned) there: catches SQLite-only syntax before it reaches Supabase.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

// Interpolations used inside SQL templates, replaced by what they stand for.
const KNOWN: Record<string, string> = {
  MEMBER: "id GLOB '[0-9]*'",
  "ids.map(() => \"?\").join(\",\")": "?",
  "out.map(() => \"?\").join(\",\")": "?",
  "rel": "SELECT id FROM users",
  table: "open_pushes",
};

function statements() {
  const out: { file: string; sql: string }[] = [];
  const re = /(`|")((?:SELECT|WITH|INSERT|UPDATE|DELETE)\b(?:[^`"\\]|\\.)*?)\1/g;
  for (const f of files("src")) {
    if (f.endsWith("schema.ts") || f.endsWith("sql.ts")) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      let sql = m[2];
      if (!/\b(FROM|INTO|SET|VALUES)\b/.test(sql)) continue;
      let unknown = false;
      sql = sql.replace(/\$\{([^}]+)\}/g, (_, k: string) => {
        const key = k.trim();
        if (key === "MSG_SQL") return "SELECT m.id FROM messages m";
        if (key in KNOWN) return KNOWN[key];
        if (key.startsWith("u.")) return KNOWN.MEMBER;
        unknown = true;
        return "";
      });
      if (!unknown && !/\b(sqlite_master|PRAGMA)\b/.test(sql)) out.push({ file: f, sql });
    }
  }
  return out;
}

describe("every SQL statement runs on Postgres", () => {
  const stmts = statements();

  it("found the app's statements", () => {
    expect(stmts.length).toBeGreaterThan(100);
  });

  it("each one prepares on Postgres", async () => {
    const pg = new PGlite();
    for (const s of PG_SCHEMA) await pg.exec(s);
    const failures: string[] = [];
    let i = 0;
    for (const { file, sql } of stmts) {
      const { text } = toPg(sql, Array.from({ length: 40 }, () => null));
      try {
        await pg.exec(`PREPARE s${i++} AS ${text}`);
      } catch (e) {
        const msg = (e as Error).message;
        failures.push(`${file}: ${msg}\n  ${text.replace(/\s+/g, " ").slice(0, 200)}`);
      }
    }
    await pg.close();
    expect(failures).toEqual([]);
  });
});
