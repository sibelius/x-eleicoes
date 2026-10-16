// One-off: fills members' states (user_places, source 'x') from their public X profile location, via Apify
// (xquik/x-profile-scraper, ~$0.00015 per profile). Never touches a state the member picked ('self').
// Usage: pnpm places:backfill [limit] [--dry]   (USE_PROD_DB=1 targets Supabase)
import { parseUf } from "../../src/lib/uf";
import { supabase } from "../db/pg.mjs";

const ACTOR = "3PdxhkbM52rM75ehy";
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1000);
const dry = process.argv.includes("--dry");

const { db, end } = supabase();
try {
  const r = await db.execute({
    sql: `SELECT u.id FROM users u WHERE u.id GLOB '[0-9]*'
          AND NOT EXISTS (SELECT 1 FROM user_places p WHERE p.uid = u.id) ORDER BY u.created_at LIMIT ?`,
    args: [limit],
  });
  const ids = r.rows.map((x) => String(x.id));
  console.log(`${ids.length} members without a state`);
  if (!ids.length) process.exit(0);
  const params = new URLSearchParams({ timeout: "280", maxTotalChargeUsd: String(Math.max(0.02, ids.length * 0.0003)) });
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    body: JSON.stringify({ userIds: ids, maxItems: ids.length }),
  });
  if (!res.ok) throw new Error(`Apify ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  if (dry) console.log(JSON.stringify(rows.slice(0, 2), null, 1).slice(0, 2500));
  let found = 0;
  const byUf: Record<string, number> = {};
  for (const row of rows) {
    const id = String(row.id ?? row.userId ?? row.rest_id ?? "");
    const location = (row.location ?? (row.profile as Record<string, unknown> | undefined)?.location) as string | undefined;
    if (!ids.includes(id)) continue;
    const uf = parseUf(location);
    if (!uf) continue;
    found++;
    byUf[uf] = (byUf[uf] ?? 0) + 1;
    if (dry) continue;
    await db.execute({
      sql: `INSERT INTO user_places (uid, uf, source, at) VALUES (?, ?, 'x', ?)
            ON CONFLICT(uid) DO UPDATE SET uf = excluded.uf, at = excluded.at WHERE user_places.source = 'x'`,
      args: [id, uf, Date.now()],
    });
  }
  console.log(`${rows.length} profiles returned, ${found} with a Brazilian state${dry ? " (dry run, nothing saved)" : " saved"}`);
  console.log(Object.entries(byUf).sort((a, b) => b[1] - a[1]).map(([u, n]) => `${u} ${n}`).join(" · "));
} finally {
  await end();
}
