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
    vote TEXT CHECK (vote IN ('lula','bolsonaro')),
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
  // Known public profile info for accounts that are not (yet) members.
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    username TEXT,
    name TEXT,
    avatar TEXT
  )`,
];

export async function db(): Promise<Client> {
  globalForDb.migrated ??= client.batch(SCHEMA, "write").then(() => undefined);
  await globalForDb.migrated;
  return client;
}
