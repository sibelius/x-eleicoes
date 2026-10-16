import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";
import { SHARED } from "./network";
import { newId } from "./sql";

// Pix donations. A static Pix can't tell us it arrived, so a donor claims it ("Já doei", pending)
// and the admin confirms it against the bank statement; the admin can also add one by hand.
// Only confirmed donations count toward the monthly goal, the supporter wall and the badge.

export const DONATIONS_TAG = "donations";
export const MIN_CENTS = 100; // R$ 1
export const MAX_CENTS = 10_000_000; // R$ 100.000
export const DEFAULT_GOAL = 100_000; // R$ 1.000
const CLAIMS_PER_HOUR = 3; // per member or visitor
const PENDING_PER_HOUR = 60; // everyone together, so a flood can't bury real claims

export type DonationStatus = "pending" | "confirmed" | "rejected";

export type Donation = {
  id: number;
  at: number;
  amount: number;
  uid: string | null;
  username: string | null;
  avatar: string | null;
  name: string | null;
  public: boolean;
  status: DonationStatus;
  note: string | null;
};

/** Start of the current calendar month in Brasília (UTC-3, no daylight saving), in ms. */
export function monthStart(now = Date.now()) {
  const br = new Date(now - 3 * 3600_000);
  return Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1) + 3 * 3600_000;
}

/** "outubro de 2026" */
export function monthLabel(now = Date.now()) {
  return new Date(now).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: cents % 100 ? 2 : 0 });

/** Reais typed by a person ("25", "25,50", 25.5) → cents, or null when outside R$ 1 … R$ 100.000. */
export function toCents(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(/^R\$\s*/i, "");
  // "1.000,50" (Brazilian) or "1000.50"
  const n = typeof v === "number" ? v : s ? Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) : NaN;
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return cents >= MIN_CENTS && cents <= MAX_CENTS ? cents : null;
}

const cleanName = (s: unknown) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return t || null;
};

/**
 * "Já doei": records a pending donation. `who` is u:<uid> or the visitor cookie, for the rate limit.
 * Returns an error message in Portuguese, or null when recorded.
 */
export async function claimDonation(d: { amount: number; uid: string | null; name: unknown; public: boolean; who: string }): Promise<string | null> {
  if (d.amount < MIN_CENTS || d.amount > MAX_CENTS) return "Valor entre R$ 1 e R$ 100.000.";
  const client = await db();
  const now = Date.now();
  const note = `site ${d.who}`.slice(0, 80);
  const [mine, all] = await client.batch(
    [
      { sql: "SELECT COUNT(*) AS n FROM donations WHERE note = ? AND at > ?", args: [note, now - 3600_000] },
      { sql: "SELECT COUNT(*) AS n FROM donations WHERE status = 'pending' AND at > ?", args: [now - 3600_000] },
    ],
    "read",
  );
  if (Number(mine.rows[0].n) >= CLAIMS_PER_HOUR || Number(all.rows[0].n) >= PENDING_PER_HOUR) {
    return "Muitos avisos seguidos. Tente de novo daqui a pouco.";
  }
  await client.execute({
    sql: "INSERT INTO donations (id, at, amount, uid, name, public, status, note) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    args: [newId(), now, d.amount, d.uid, cleanName(d.name), d.public ? 1 : 0, note],
  });
  return null;
}

/** Admin: a donation seen on the bank statement, confirmed right away. `handle` links it to a member. */
export async function addDonation(d: { amount: number; name: unknown; handle?: unknown; public: boolean; note?: unknown }) {
  const client = await db();
  const handle = String(d.handle ?? "").trim().replace(/^@/, "");
  const user = handle
    ? (await client.execute({ sql: "SELECT id, username FROM users WHERE lower(username) = lower(?) LIMIT 1", args: [handle] })).rows[0]
    : undefined;
  const id = newId();
  await client.execute({
    sql: "INSERT INTO donations (id, at, amount, uid, name, public, status, note) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)",
    args: [id, Date.now(), d.amount, user ? String(user.id) : null, cleanName(d.name) ?? (user ? `@${user.username}` : handle ? `@${handle}` : null), d.public ? 1 : 0, cleanName(d.note) ?? "admin"],
  });
  return { id, member: user ? String(user.username) : null };
}

export async function setDonationStatus(id: number, status: DonationStatus) {
  const client = await db();
  await client.execute({ sql: "UPDATE donations SET status = ? WHERE id = ?", args: [status, id] });
}

export async function deleteDonation(id: number) {
  const client = await db();
  await client.execute({ sql: "DELETE FROM donations WHERE id = ?", args: [id] });
}

/** Admin: every donation, newest first. */
export async function listDonations(limit = 300): Promise<Donation[]> {
  const client = await db();
  const r = await client.execute({
    sql: `SELECT d.id, d.at, d.amount, d.uid, u.username, COALESCE(u.avatar, p.avatar) AS avatar, d.name, d.public, d.status, d.note
          FROM donations d LEFT JOIN users u ON u.id = d.uid LEFT JOIN profiles p ON p.id = d.uid
          ORDER BY d.at DESC, d.id DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    at: Number(x.at),
    amount: Number(x.amount),
    uid: (x.uid as string | null) ?? null,
    username: (x.username as string | null) ?? null,
    avatar: (x.avatar as string | null) ?? null,
    name: (x.name as string | null) ?? null,
    public: Number(x.public) === 1,
    status: String(x.status) as DonationStatus,
    note: (x.note as string | null) ?? null,
  }));
}

export async function getSetting(key: string): Promise<string | null> {
  const client = await db();
  const r = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  return r.rows[0] ? String(r.rows[0].value) : null;
}

export async function setSetting(key: string, value: string) {
  const client = await db();
  await client.execute({
    sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    args: [key, value],
  });
}

export async function getGoal() {
  const v = Number(await getSetting("donation_goal"));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_GOAL;
}

export type GoalProgress = { raised: number; goal: number; donors: number; month: string };

/** Confirmed donations this calendar month (Brasília) against the monthly goal. */
export async function getGoalProgress(): Promise<GoalProgress> {
  "use cache: remote";
  cacheLife(SHARED);
  cacheTag(DONATIONS_TAG);
  const client = await db();
  const now = Date.now();
  const [sum, goal] = await client.batch(
    [
      {
        sql: `SELECT COALESCE(SUM(amount), 0) AS raised, COUNT(DISTINCT COALESCE(uid, CAST(id AS TEXT))) AS donors
              FROM donations WHERE status = 'confirmed' AND at >= ?`,
        args: [monthStart(now)],
      },
      { sql: "SELECT value FROM settings WHERE key = 'donation_goal'" },
    ],
    "read",
  );
  const g = Number(goal.rows[0]?.value);
  return {
    raised: Number(sum.rows[0].raised),
    goal: Number.isFinite(g) && g > 0 ? g : DEFAULT_GOAL,
    donors: Number(sum.rows[0].donors),
    month: monthLabel(now),
  };
}

export type Supporter = { name: string; username: string | null; avatar: string | null; at: number };

/** The public supporter wall: confirmed donors who opted in, one entry per person, latest donation first. No amounts. */
export async function getSupporters(limit = 200): Promise<Supporter[]> {
  "use cache: remote";
  cacheLife(SHARED);
  cacheTag(DONATIONS_TAG);
  const client = await db();
  const r = await client.execute({
    sql: `SELECT d.uid, d.name, d.at, u.username, COALESCE(u.avatar, p.avatar) AS avatar
          FROM donations d LEFT JOIN users u ON u.id = d.uid LEFT JOIN profiles p ON p.id = d.uid
          WHERE d.status = 'confirmed' AND d.public = 1 ORDER BY d.at DESC, d.id DESC`,
  });
  const seen = new Set<string>();
  const out: Supporter[] = [];
  for (const x of r.rows) {
    const username = (x.username as string | null) ?? null;
    const name = (x.name as string | null) ?? (username ? `@${username}` : null);
    if (!name) continue;
    const key = x.uid ? `u:${x.uid}` : `n:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, username, avatar: (x.avatar as string | null) ?? null, at: Number(x.at) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Members with a public, confirmed donation (sorted ids), for the "Apoiador" badge. */
export async function supporterIds(): Promise<string[]> {
  "use cache: remote";
  cacheLife(SHARED);
  cacheTag(DONATIONS_TAG);
  const client = await db();
  const r = await client.execute("SELECT DISTINCT uid FROM donations WHERE status = 'confirmed' AND public = 1 AND uid IS NOT NULL ORDER BY uid");
  return r.rows.map((x) => String(x.uid));
}

export async function isSupporter(uid: string | null | undefined) {
  if (!uid) return false;
  return (await supporterIds()).includes(uid);
}
