import "server-only";
import { notFound } from "next/navigation";
import { getUserId } from "./session";

// X user ids allowed into /admin (by id, not handle: anyone could register a look-alike @).
// Default: @sseraphini. ADMIN_IDS (comma-separated) overrides it, e.g. for a local dev login.
const ADMINS = new Set(
  (process.env.ADMIN_IDS ?? "2313873457")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** The admins' X ids (e.g. to push them new feedback). */
export function adminIds() {
  return [...ADMINS];
}

export async function isAdmin() {
  const uid = await getUserId();
  return !!uid && ADMINS.has(uid);
}

/** Admin screens 404 for everyone else, so they don't even show they exist. */
export async function requireAdmin() {
  if (!(await isAdmin())) notFound();
}
