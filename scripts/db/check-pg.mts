// Creates the schema on Supabase and checks the driver end to end (types, big numbers, placeholders, GLOB).
import { PG_SCHEMA } from "../../src/lib/schema";
import { supabase } from "./pg.mjs";

const { db, end } = supabase();
await db.batch(PG_SCHEMA, "write");
const t = Date.now();
const [ins] = await db.batch(
  [{ sql: "INSERT INTO presence (visitor, at) VALUES (?, ?) ON CONFLICT(visitor) DO UPDATE SET at = excluded.at", args: ["check", t] }],
  "write",
);
const sel = await db.execute({ sql: "SELECT at, COUNT(*) OVER () AS n, :x AS x FROM presence WHERE visitor = :v AND at > :t", args: { v: "check", x: "ok", t: t - 1 } });
console.log("insert rowsAffected", ins.rowsAffected, "| select", sel.rows[0], typeof sel.rows[0].at, typeof sel.rows[0].n);
console.log("GLOB ok, members:", (await db.execute("SELECT COUNT(*) AS n FROM users WHERE id GLOB '[0-9]*'")).rows[0].n);
await db.execute({ sql: "DELETE FROM presence WHERE visitor = ?", args: ["check"] });
console.log("tables:", (await db.execute("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n);
await end();
