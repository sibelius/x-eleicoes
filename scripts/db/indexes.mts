// Builds the Postgres indexes on Supabase, once (and again whenever schema.ts gains an index).
// The app never creates indexes itself: CREATE INDEX locks its table, and on a request that froze the site.
// CONCURRENTLY builds without blocking writes; it can't run inside a transaction, so one statement at a time.
// Also records the schema version (tables) and caps how long a transaction may sit idle, so a serverless function frozen mid-transaction can't hold locks.
import { PG_INDEXES, PG_TABLES } from "../../src/lib/schema";
import { ensureSchema } from "../../src/lib/sql";
import { supabase } from "./pg.mjs";

const { db, end } = supabase();
try {
  await db.execute("ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s'");
  console.log("idle_in_transaction_session_timeout = 60s");
  // Tables too, and the schema version, so the app's cold starts find it and only run one SELECT.
  console.log(`tables: ${(await ensureSchema(db, PG_TABLES)) ? "applied" : "already current"}`);
  for (const stmt of PG_INDEXES) {
    const t = Date.now();
    await db.execute(stmt.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF NOT EXISTS/i, (_, u = "") => `CREATE ${u}INDEX CONCURRENTLY IF NOT EXISTS`));
    console.log(`${Date.now() - t}ms  ${stmt}`);
  }
} finally {
  await end();
}
