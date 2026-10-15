import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@libsql/client";
import { PG_SCHEMA, SQLITE_SCHEMA } from "@/lib/schema";
import { libsqlDb, pgDb, type Db } from "@/lib/sql";

/** A fresh SQLite file and a fresh in-process Postgres, both with the app's schema. */
export async function makeDbs(): Promise<{ sqlite: Db; pg: Db; close: () => Promise<void> }> {
  const file = join(mkdtempSync(join(tmpdir(), "xe-")), "test.db");
  const lite = createClient({ url: `file:${file}` });
  const sqlite = libsqlDb(lite as never);
  const pglite = new PGlite();
  // Same parsing as production (postgres.js): int8 and numeric as numbers.
  const opts = { parsers: { 20: Number, 1700: Number } };
  const pg = pgDb({
    query: async (text, params) => {
      const r = await pglite.query<Record<string, unknown>>(text, params as never[], opts);
      return { rows: r.rows, count: r.affectedRows ?? 0 };
    },
    transaction: (fn) =>
      pglite.transaction((tx) =>
        fn(async (text, params) => {
          const r = await tx.query<Record<string, unknown>>(text, params as never[], opts);
          return { rows: r.rows, count: r.affectedRows ?? 0 };
        }),
      ),
  });
  await sqlite.batch(SQLITE_SCHEMA, "write");
  await pg.batch(PG_SCHEMA, "write");
  return {
    sqlite,
    pg,
    close: async () => {
      lite.close();
      await pglite.close();
    },
  };
}
