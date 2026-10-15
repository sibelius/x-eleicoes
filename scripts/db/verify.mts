// Compares Turso and Supabase row by row, per table. Live tables (presence, watching) drift by design.
// Run: USE_PROD_DB=1 ./scripts/with-secrets.sh npx tsx scripts/db/verify.mts
import { TABLES } from "../../src/lib/schema";
import type { Row } from "../../src/lib/sql";
import { RENAMES, supabase, tursoDb } from "./pg.mjs";

const LIVE = new Set(["presence", "watching"]);
const key = (r: Row) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] == null ? null : typeof r[k] === "number" ? r[k] : String(r[k])]));

const turso = tursoDb();
const { db: pg, end } = supabase();
let bad = 0;
for (const table of TABLES) {
  const [a, b] = await Promise.all([turso.execute(`SELECT * FROM ${table}`), pg.execute(`SELECT * FROM ${table}`)]);
  const rename = RENAMES[table] ?? {};
  const left = new Map<string, number>();
  for (const raw of a.rows) {
    const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [rename[k] ?? k, v]));
    left.set(key(r), (left.get(key(r)) ?? 0) + 1);
  }
  let extra = 0;
  for (const r of b.rows) {
    const k = key(r);
    const n = left.get(k);
    if (n) left.set(k, n - 1);
    else extra++;
  }
  const missing = [...left.values()].reduce((s, n) => s + n, 0);
  const ok = !missing && !extra;
  if (!ok && !LIVE.has(table)) bad++;
  console.log(`${ok ? "same" : LIVE.has(table) ? "live" : "DIFF"}  ${table}: turso ${a.rows.length}, supabase ${b.rows.length}${ok ? "" : ` (missing in supabase ${missing}, only in supabase ${extra})`}`);
}
await end();
if (bad) {
  console.error(`${bad} table(s) differ`);
  process.exit(1);
}
