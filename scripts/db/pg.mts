// Connections for the migration scripts (run with: ./scripts/with-secrets.sh npx tsx scripts/db/<script>.ts).
// Production Turso needs USE_PROD_DB=1 so with-secrets.sh loads its credentials.
import { createClient } from "@libsql/client";
import postgres from "postgres";
import { libsqlDb, pgDb, type Db } from "../../src/lib/sql";

export function tursoDb(): Db {
  if (!process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL not set (run with USE_PROD_DB=1)");
  return libsqlDb(createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }) as never);
}

export function supabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const sql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 4,
    onnotice: () => {}, // "already exists, skipping" on every IF NOT EXISTS
    types: { bigint: { to: 20, from: [20, 1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  });
  const db = pgDb({
    query: async (text, params) => {
      const r = await sql.unsafe(text, params as never[]);
      return { rows: r as unknown as Record<string, unknown>[], count: r.count };
    },
    transaction: (fn) =>
      sql.begin((tx) =>
        fn(async (text, params) => {
          const r = await tx.unsafe(text, params as never[]);
          return { rows: r as unknown as Record<string, unknown>[], count: r.count };
        }),
      ) as never,
  });
  return { db, end: () => sql.end({ timeout: 5 }) };
}

/** Old Turso column names (from before the red/green rename) → the schema's names. */
export const RENAMES: Record<string, Record<string, string>> = { tally_snapshots: { lula: "red", bolsonaro: "green" } };
