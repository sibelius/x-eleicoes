// One small database interface over two engines: libSQL/SQLite (Turso, local.db) and Postgres
// (Supabase via postgres.js; PGlite in tests). Queries are written once, in SQLite style; the
// Postgres driver translates the few SQLite-only bits (placeholders, GLOB, INSERT OR IGNORE).

export type Args = unknown[] | Record<string, unknown>;
export type Stmt = string | { sql: string; args?: Args };
export type Row = Record<string, unknown>;
export type Result = { rows: Row[]; rowsAffected: number };
export type Mode = "read" | "write";

export interface Db {
  readonly dialect: "sqlite" | "pg";
  execute(stmt: Stmt): Promise<Result>;
  /** Runs the statements in order, in one transaction (Postgres: read-only batches skip it); returns one result per statement. */
  batch(stmts: Stmt[], mode?: Mode): Promise<Result[]>;
}

const norm = (s: Stmt) => (typeof s === "string" ? { sql: s, args: [] as Args } : { sql: s.sql, args: s.args ?? [] });

/** Does this statement change data? (Used to mirror writes to the other database.) */
export function isWrite(stmt: Stmt) {
  const head = norm(stmt).sql.trimStart().slice(0, 12).toUpperCase();
  return !(head.startsWith("SELECT") || head.startsWith("WITH") || head.startsWith("PRAGMA") || head.startsWith("EXPLAIN"));
}

// ---------- SQLite → Postgres ----------

/**
 * Rewrites a SQLite-style statement for Postgres: `?` and `:name` placeholders become `$n`,
 * `GLOB '[0-9]*'` becomes a regex match, `INSERT OR IGNORE` becomes `ON CONFLICT DO NOTHING`.
 * Quoted strings are left alone.
 */
export function toPg(sql: string, args: Args = []): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const named = new Map<string, number>();
  const positional = Array.isArray(args) ? args : [];
  const byName = Array.isArray(args) ? {} : (args as Record<string, unknown>);
  let pos = 0;
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      // Copy a quoted string verbatim ('' is an escaped quote).
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      out += sql.slice(i, j + 1);
      i = j;
    } else if (ch === "?") {
      params.push(positional[pos++] ?? null);
      out += `$${params.length}`;
    } else if (ch === ":" && sql[i - 1] !== ":" && /[A-Za-z_]/.test(sql[i + 1] ?? "")) {
      let j = i + 1;
      while (j < sql.length && /\w/.test(sql[j])) j++;
      const name = sql.slice(i + 1, j);
      if (!named.has(name)) {
        params.push(byName[name] ?? null);
        named.set(name, params.length);
      }
      out += `$${named.get(name)}`;
      i = j - 1;
    } else {
      out += ch;
    }
  }
  out = out.replace(/\bGLOB\s+'\[0-9\]\*'/g, "~ '^[0-9]'");
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(out)) {
    out = out.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO").replace(/;?\s*$/, "") + " ON CONFLICT DO NOTHING";
  }
  return { text: out, params: params.map((p) => (p === undefined ? null : p)) };
}

/** What the Postgres driver needs from a client: postgres.js in production, PGlite in tests. */
export interface PgClient {
  query(text: string, params: unknown[]): Promise<{ rows: Row[]; count: number }>;
  transaction<T>(fn: (q: PgClient["query"]) => Promise<T>): Promise<T>;
}

/** COUNT(*), SUM(...) come back as int8/numeric: make them plain numbers like SQLite's. */
function plain(row: Row): Row {
  for (const k in row) if (typeof row[k] === "bigint") row[k] = Number(row[k]);
  return row;
}

export function pgDb(client: PgClient): Db {
  const run = async (q: PgClient["query"], s: Stmt): Promise<Result> => {
    const { sql, args } = norm(s);
    const { text, params } = toPg(sql, args);
    try {
      const r = await q(text, params);
      return { rows: r.rows.map(plain), rowsAffected: r.count };
    } catch (e) {
      (e as Error).message += ` [pg] ${text.slice(0, 300)}`;
      throw e;
    }
  };
  return {
    dialect: "pg",
    execute: (s) => run(client.query, s),
    batch: (stmts, mode) =>
      stmts.length === 0
        ? Promise.resolve([])
        : mode === "read" && !stmts.some(isWrite)
          ? // No transaction for reads: a function frozen mid-batch can't leave one open holding locks.
            Promise.all(stmts.map((s) => run(client.query, s)))
          : // Sent all at once (pipelined, still run in order inside the transaction).
            client.transaction((q) => Promise.all(stmts.map((s) => run(q, s)))),
  };
}

/**
 * Many rows in a few statements (`INSERT ... VALUES (?, ?), (?, ?) ...`, `per` rows each) instead of
 * one statement per row: thousands of single-row inserts kept a transaction (and its locks) open for minutes.
 * `head` is everything before VALUES, `tail` anything after (e.g. an ON CONFLICT clause).
 */
export function insertMany(head: string, rows: unknown[][], tail = "", per = 500): Stmt[] {
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const values = chunk.map((r) => `(${r.map(() => "?").join(", ")})`).join(", ");
    out.push({ sql: `${head} VALUES ${values}${tail ? ` ${tail}` : ""}`, args: chunk.flat() });
  }
  return out;
}

/**
 * Applies the schema only when it changed: a cold start costs one SELECT, not a round of
 * CREATE ... IF NOT EXISTS. (CREATE INDEX locks its table even when the index exists, so it queued
 * behind any open write and every request queued behind it, until the pooler ran out of connections.)
 * On Postgres the DDL gives up after a few seconds of waiting for a lock instead of piling up.
 */
export async function ensureSchema(db: Db, schema: string[]) {
  const hash = String(fnv1a(schema.join(";\n")));
  const current = await db.execute({ sql: "SELECT hash FROM schema_version WHERE hash = ?", args: [hash] }).catch(() => null);
  if (current?.rows.length) return false;
  await db.batch(
    [
      ...(db.dialect === "pg" ? ["SET LOCAL lock_timeout = '5s'"] : []),
      ...schema,
      "CREATE TABLE IF NOT EXISTS schema_version (hash TEXT PRIMARY KEY)",
      { sql: "DELETE FROM schema_version WHERE hash <> ?", args: [hash] },
      // Cold starts racing here: the first one records it, the rest do nothing.
      { sql: "INSERT OR IGNORE INTO schema_version (hash) VALUES (?)", args: [hash] },
    ],
    "write",
  );
  return true;
}

function fnv1a(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// ---------- libSQL ----------

type LibsqlClient = {
  execute(s: { sql: string; args: never }): Promise<{ rows: unknown[]; columns: string[]; rowsAffected: number }>;
  batch(s: { sql: string; args: never }[], mode: Mode): Promise<{ rows: unknown[]; columns: string[]; rowsAffected: number }[]>;
};

export function libsqlDb(client: LibsqlClient): Db {
  // libSQL rows are array-like objects; hand out plain objects (serializable into the cache).
  const conv = (r: { rows: unknown[]; columns: string[]; rowsAffected: number }): Result => ({
    rows: r.rows.map((row) => {
      const o: Row = {};
      r.columns.forEach((c, i) => (o[c] = (row as unknown[])[i]));
      return o;
    }),
    rowsAffected: r.rowsAffected,
  });
  const arg = (s: Stmt) => {
    const { sql, args } = norm(s);
    return { sql, args: args as never };
  };
  return {
    dialect: "sqlite",
    execute: async (s) => conv(await client.execute(arg(s))),
    batch: async (stmts, mode = "write") => (stmts.length ? (await client.batch(stmts.map(arg), mode)).map(conv) : []),
  };
}

// ---------- mirroring ----------

/**
 * Reads and writes go to `primary`; writes are also sent to `mirror` (best effort, logged on failure),
 * so the other database stays current and switching between them needs no downtime.
 */
export function mirrored(primary: Db, mirror: Db, onError: (e: unknown, stmt: Stmt) => void): Db {
  return {
    dialect: primary.dialect,
    async execute(s) {
      if (!isWrite(s)) return primary.execute(s);
      const [r] = await Promise.all([primary.execute(s), mirror.execute(s).catch((e) => onError(e, s))]);
      return r;
    },
    async batch(stmts, mode) {
      const writes = stmts.filter(isWrite);
      if (!writes.length) return primary.batch(stmts, mode);
      const [r] = await Promise.all([primary.batch(stmts, mode), mirror.batch(writes, "write").catch((e) => onError(e, writes[0]))]);
      return r;
    },
  };
}

/** Ids made by the app (not the database), so a row has the same id in both databases. */
export function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
