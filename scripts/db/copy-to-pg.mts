// Copies every table from Turso to Supabase. Safe to re-run while the app writes to both (DB_MIRROR=1):
// tables with a primary key are upserted; append-only logs without one are replaced in one transaction.
// Run: USE_PROD_DB=1 ./scripts/with-secrets.sh npx tsx scripts/db/copy-to-pg.mts
import { SQLITE_SCHEMA, TABLES } from "../../src/lib/schema";
import type { Row, Stmt } from "../../src/lib/sql";
import { RENAMES, supabase, tursoDb } from "./pg.mjs";

/** Primary key columns per table, read from the schema. */
export function primaryKeys(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of SQLITE_SCHEMA) {
    const t = s.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
    if (!t) continue;
    const composite = s.match(/PRIMARY KEY \(([^)]+)\)/);
    const single = s.match(/\n\s*(\w+) \w+ PRIMARY KEY/);
    out[t] = composite ? composite[1].split(",").map((c) => c.trim()) : single ? [single[1]] : [];
  }
  return out;
}

const turso = tursoDb();
const { db: pg, end } = supabase();
const pks = primaryKeys();
const only = process.argv[2];

for (const table of TABLES) {
  if (only && table !== only) continue;
  const started = Date.now();
  const target = new Set(
    (await pg.execute({ sql: "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?", args: [table] })).rows.map((r) => String(r.c)),
  );
  const rename = RENAMES[table] ?? {};
  const rows = (await turso.execute(`SELECT * FROM ${table}`)).rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [rename[k] ?? k, v])),
  );
  if (!rows.length) {
    console.log(`${table}: empty`);
    continue;
  }
  const dropped = Object.keys(rows[0]).filter((c) => !target.has(c));
  if (dropped.length) console.warn(`${table}: not in Postgres, skipped: ${dropped.join(", ")}`);
  const cols = Object.keys(rows[0]).filter((c) => target.has(c));
  const pk = pks[table];
  const chunk = Math.max(1, Math.floor(4000 / cols.length));
  const insert = (part: Row[]): Stmt => {
    const values = part.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
    const conflict = !pk.length
      ? ""
      : pk.length === cols.length
        ? ` ON CONFLICT (${pk.join(", ")}) DO NOTHING`
        : ` ON CONFLICT (${pk.join(", ")}) DO UPDATE SET ${cols.filter((c) => !pk.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")}`;
    return { sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values}${conflict}`, args: part.flatMap((r) => cols.map((c) => r[c])) };
  };
  const stmts: Stmt[] = [];
  for (let i = 0; i < rows.length; i += chunk) stmts.push(insert(rows.slice(i, i + chunk)));
  if (pk.length) {
    for (let i = 0; i < stmts.length; i += 10) await pg.batch(stmts.slice(i, i + 10), "write");
  } else {
    await pg.batch([`DELETE FROM ${table}`, ...stmts], "write");
  }
  console.log(`${table}: ${rows.length} rows (${pk.length ? "upsert" : "replaced"}) in ${Date.now() - started}ms`);
}
await end();
