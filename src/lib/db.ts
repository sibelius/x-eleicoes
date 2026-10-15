import "server-only";
import { createClient } from "@libsql/client";
import postgres from "postgres";
import { PG_SCHEMA, SQLITE_SCHEMA } from "./schema";
import { libsqlDb, mirrored, pgDb, type Db } from "./sql";

// Which database serves the app, switched with environment variables (no code change, no downtime):
//   DB_PRIMARY = "turso" (default) | "pg"   reads and writes go here
//   DB_MIRROR  = "1"                         writes are also copied to the other database
// Turso: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (local dev: the local.db file).
// Postgres (Supabase): DATABASE_URL, the transaction pooler (port 6543).
// Production runs on Supabase (DB_PRIMARY=pg) since 2026-10-15; Turso keeps the data as of the switch.
// To move again: DB_MIRROR=1, `pnpm db:copy`, `pnpm db:verify`, flip DB_PRIMARY, redeploy.

export type { Db } from "./sql";

const env = {
  primary: process.env.DB_PRIMARY === "pg" ? "pg" : "turso",
  mirror: process.env.DB_MIRROR === "1",
};

type Engine = { db: Db; schema: string[]; migrated?: Promise<void> };
const g = globalThis as unknown as { engines?: Partial<Record<"turso" | "pg", Engine>>; dbOverride?: Db };
g.engines ??= {};

function turso(): Engine {
  return (g.engines!.turso ??= {
    db: libsqlDb(
      createClient({
        // On Vercel without Turso, /tmp is the only writable path (ephemeral).
        url: process.env.TURSO_DATABASE_URL ?? (process.env.VERCEL ? "file:/tmp/local.db" : "file:local.db"),
        authToken: process.env.TURSO_AUTH_TOKEN,
      }) as never,
    ),
    schema: SQLITE_SCHEMA,
  });
}

function pg(): Engine {
  return (g.engines!.pg ??= (() => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const sql = postgres(process.env.DATABASE_URL, {
      prepare: false, // required by the transaction pooler
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // COUNT/SUM/ids (int8, numeric) as plain numbers, like SQLite.
      types: { bigint: { to: 20, from: [20, 1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    });
    return {
      db: pgDb({
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
      }),
      schema: PG_SCHEMA,
    };
  })());
}

/** Creates missing tables once per instance; a failure (e.g. a fetch cut off when a prerender ended) is retried next call. */
function migrate(e: Engine) {
  e.migrated ??= e.db.batch(e.schema, "write").then(
    () => undefined,
    (err) => {
      e.migrated = undefined;
      throw err;
    },
  );
  return e.migrated;
}

let facade: Db | undefined;

export async function db(): Promise<Db> {
  if (g.dbOverride) return g.dbOverride;
  const primary = env.primary === "pg" ? pg() : turso();
  const mirror = env.mirror ? (env.primary === "pg" ? turso() : pg()) : null;
  await Promise.all([migrate(primary), mirror && migrate(mirror).catch((e) => console.error("[db] mirror migrate", e))]);
  facade ??= mirror
    ? mirrored(primary.db, mirror.db, (e, s) => console.error("[db] mirror write failed", typeof s === "string" ? s.slice(0, 120) : s.sql.slice(0, 120), e))
    : primary.db;
  return facade;
}

/** Tests: serve every db() call from this database. */
export function setDbForTests(d: Db | undefined) {
  g.dbOverride = d;
}
