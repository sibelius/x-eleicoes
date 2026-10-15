import "server-only";
import type { Db } from "./db";

// Xquik "X (Twitter) Followers Scraper" on Apify: pay-per-result (~$0.00015 per profile), no X login.
// https://apify.com/xquik/x-follower-scraper
const ACTOR = "AaT0BcKU5GQh97wdt";
const APIFY_API = "https://api.apify.com/v2";

export function apifyEnabled() {
  return Boolean(process.env.APIFY_TOKEN) && process.env.APIFY_FETCH_FOLLOWS === "1";
}

type Row = { id?: string | null; username?: string | null; name?: string | null; profilePicture?: string | null };

function maxItems() {
  const n = Number(process.env.APIFY_FETCH_MAX ?? 1000);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1000;
}

function refreshMs() {
  const days = Number(process.env.APIFY_REFRESH_DAYS ?? 30);
  return (Number.isFinite(days) ? Math.max(0, days) : 30) * 86_400_000;
}

/** Runs the actor synchronously (capped at 240s to fit the route's maxDuration) and returns its dataset rows. */
async function scrape(username: string, relation: "followers" | "following", limit: number): Promise<Row[]> {
  const params = new URLSearchParams({
    timeout: "240",
    // Hard spend cap for the run, on top of maxItems.
    maxTotalChargeUsd: String(Math.max(0.01, limit * 0.0002)),
  });
  const res = await fetch(`${APIFY_API}/acts/${ACTOR}/run-sync-get-dataset-items?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    body: JSON.stringify({
      twitterHandles: [username],
      relation,
      maxItems: limit,
      outputMode: "compact",
      fields: ["id", "username", "name", "profilePicture"],
    }),
  });
  if (!res.ok) throw new Error(`Apify ${relation} run failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Row[];
  // Diagnostic rows carry a synthetic "diag:" id.
  return rows.filter((r) => r.id && /^\d+$/.test(r.id) && r.username);
}

/** Paid (Apify): unless fetched in the last APIFY_REFRESH_DAYS (default 30), fetches up to APIFY_FETCH_MAX following + followers of @username and stores edges/profiles. */
export async function importFollowsFromApify(client: Db, uid: string, username: string) {
  const last = await client.execute({
    sql: "SELECT fetched_at FROM follow_imports WHERE uid = ? AND source = 'apify'",
    args: [uid],
  });
  const fetchedAt = Number(last.rows[0]?.fetched_at ?? 0);
  if (Date.now() - fetchedAt < refreshMs()) return null;

  const limit = maxItems();
  const totals = { following: 0, followers: 0 };
  await Promise.all(
    (["following", "followers"] as const).map(async (kind) => {
      const users = await scrape(username, kind, limit);
      for (let i = 0; i < users.length; i += 500) {
        await client.batch(
          users.slice(i, i + 500).flatMap((u) => [
            {
              sql: "INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)",
              args: kind === "following" ? [uid, u.id!] : [u.id!, uid],
            },
            {
              sql: `INSERT INTO profiles (id, username, name, avatar) VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar`,
              args: [u.id!, u.username!, u.name ?? u.username!, u.profilePicture ?? null],
            },
          ]),
          "write",
        );
      }
      totals[kind] = users.length;
    }),
  );
  await client.execute({
    sql: `INSERT INTO follow_imports (uid, source, fetched_at) VALUES (?, 'apify', ?)
          ON CONFLICT(uid) DO UPDATE SET source = excluded.source, fetched_at = excluded.fetched_at`,
    args: [uid, Date.now()],
  });
  return totals;
}
