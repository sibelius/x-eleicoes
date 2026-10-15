import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

// Attribution for the links we hand out (posts on X, push notifications): see withUtm in ./links.

export const UTM_COOKIE = "xe_utm";
const clean = (v: string | null) => (v ?? "").slice(0, 64).replace(/[^\w.\-@ ]/g, "");

export type Utm = { source: string; medium: string; campaign: string; content: string; path: string };

export function parseUtm(href: string): Utm | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const source = clean(u.searchParams.get("utm_source"));
  if (!source) return null;
  return {
    source,
    medium: clean(u.searchParams.get("utm_medium")),
    campaign: clean(u.searchParams.get("utm_campaign")),
    content: clean(u.searchParams.get("utm_content")),
    path: u.pathname.slice(0, 200),
  };
}

export async function recordUtm(kind: "visit" | "signup", visitor: string, utm: Utm) {
  const client = await db();
  const now = Date.now();
  await client.execute({
    sql: "INSERT INTO utm_events (at, day, kind, visitor, source, medium, campaign, content, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [now, new Date(now).toISOString().slice(0, 10), kind, visitor, utm.source, utm.medium, utm.campaign, utm.content, utm.path],
  });
}

/** First touch: remembered for 30 days so a later signup is credited to the link that brought them. */
export function rememberUtm(req: NextRequest, res: NextResponse, utm: Utm) {
  if (req.cookies.get(UTM_COOKIE)) return;
  res.cookies.set(UTM_COOKIE, JSON.stringify(utm), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export function rememberedUtm(req: NextRequest): Utm | null {
  try {
    const v = JSON.parse(req.cookies.get(UTM_COOKIE)?.value ?? "null");
    return v && typeof v.source === "string" ? (v as Utm) : null;
  } catch {
    return null;
  }
}
