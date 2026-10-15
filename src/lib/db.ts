import "server-only";
import { createClient, type Client } from "@libsql/client";

// Local dev: a SQLite file. Production: a free Turso database (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
// On Vercel without Turso, /tmp is the only writable path — data there is EPHEMERAL (lost on cold starts).
const url =
  process.env.TURSO_DATABASE_URL ?? (process.env.VERCEL ? "file:/tmp/local.db" : "file:local.db");
if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  console.warn("TURSO_DATABASE_URL not set: using ephemeral /tmp database.");
}

const globalForDb = globalThis as unknown as { db?: Client; migrated?: Promise<void> };

const client =
  globalForDb.db ?? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
globalForDb.db = client;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    vote TEXT CHECK (vote IN ('red','green')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','network','private')),
    voted_at INTEGER,
    invited_by TEXT,
    created_at INTEGER NOT NULL
  )`,
  // src follows dst (X user ids). Filled from X archive imports, optional X API fetch.
  `CREATE TABLE IF NOT EXISTS edges (
    src TEXT NOT NULL,
    dst TEXT NOT NULL,
    PRIMARY KEY (src, dst)
  )`,
  `CREATE INDEX IF NOT EXISTS edges_dst ON edges (dst)`,
  `CREATE INDEX IF NOT EXISTS users_invited_by ON users (invited_by)`,
  // When a user's follow lists were last fetched from a paid source, so sign-ins don't re-fetch them.
  `CREATE TABLE IF NOT EXISTS follow_imports (
    uid TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  )`,
  // Known public profile info for accounts that are not (yet) members.
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    username TEXT,
    name TEXT,
    avatar TEXT
  )`,
  // Web push subscriptions (one per browser) for "someone from your network joined".
  `CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS push_subs_uid ON push_subs (uid)`,
  // Unique visitors per bubble per day (uid "_site" = the whole site); visitor = anonymous cookie id.
  `CREATE TABLE IF NOT EXISTS views (
    uid TEXT NOT NULL,
    visitor TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (uid, visitor, day)
  )`,
  // Last heartbeat per visitor, for "N online now".
  `CREATE TABLE IF NOT EXISTS presence (
    visitor TEXT PRIMARY KEY,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS presence_at ON presence (at)`,
  // Bubble totals at the last daily summary push, to tell what changed since.
  `CREATE TABLE IF NOT EXISTS tally_snapshots (
    uid TEXT PRIMARY KEY,
    red INTEGER NOT NULL,
    green INTEGER NOT NULL,
    members INTEGER NOT NULL,
    at INTEGER NOT NULL
  )`,
  // Last "someone saw your bubble" push per owner, to send at most one every 30 minutes.
  `CREATE TABLE IF NOT EXISTS view_pushes (
    uid TEXT PRIMARY KEY,
    at INTEGER NOT NULL
  )`,
  // Last "someone in your network voted" push per voter, so flipping sides can't spam their network.
  `CREATE TABLE IF NOT EXISTS vote_pushes (
    uid TEXT PRIMARY KEY,
    at INTEGER NOT NULL
  )`,
  // Ad impressions and clicks per ad, per screen (placement), per visitor, per day.
  `CREATE TABLE IF NOT EXISTS ad_stats (
    ad TEXT NOT NULL,
    placement TEXT NOT NULL,
    visitor TEXT NOT NULL,
    day TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ad, placement, visitor, day)
  )`,
  `CREATE INDEX IF NOT EXISTS ad_stats_day ON ad_stats (day)`,
];

export async function db(): Promise<Client> {
  globalForDb.migrated ??= client.batch(SCHEMA, "write").then(() => undefined);
  await globalForDb.migrated;
  return client;
}
