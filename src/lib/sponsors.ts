import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cacheLife } from "next/cache";
import { ADS } from "./ads";
import { db } from "./db";
import { SHARED } from "./network";
import { SITE } from "./views-shared";

// Sponsor reports (/anunciantes/<slug>?k=<token>, no login) and the public media kit (/anuncie).
// ad_stats and views both use the same visitor ids (u:<uid> or the xe_vid cookie) and UTC days.

/** The screens that carry the ad carousel (SupportStrip placement → label). */
export const PLACEMENTS: Record<string, { label: string; note: string }> = {
  home: { label: "Início", note: "a primeira tela, de quem chega pelo link" },
  app: { label: "Minha bolha", note: "a bolha de quem entrou com o X" },
  bubble: { label: "Bolha de alguém", note: "a bolha compartilhada no X (/r/@)" },
  directory: { label: "Todas as bolhas", note: "o diretório de membros" },
  ranking: { label: "Ranking", note: "quem mais convidou, as bolhas mais fechadas" },
  compare: { label: "Comparar", note: "duas bolhas lado a lado" },
};

export const placementLabel = (p: string) => PLACEMENTS[p]?.label ?? p;

export const adSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const adBySlug = (slug: string) => ADS.find((a) => adSlug(a.name) === slug) ?? null;

function secret() {
  const s = process.env.SPONSOR_SECRET || process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SPONSOR_SECRET / AUTH_SECRET is not set");
  return s || "dev-only-sponsor-secret";
}

/** HMAC-SHA256(slug), hex, shortened to 128 bits: the report link's key. */
export function reportToken(slug: string) {
  return createHmac("sha256", secret()).update(slug).digest("hex").slice(0, 32);
}

export function checkReportToken(slug: string, token: string | undefined | null) {
  if (!token) return false;
  const a = Buffer.from(reportToken(slug));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function reportPath(adName: string) {
  const slug = adSlug(adName);
  return `/anunciantes/${slug}?k=${reportToken(slug)}`;
}

const utcDays = (n: number, now = Date.now()) =>
  Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * 86400_000).toISOString().slice(0, 10));

export type SponsorDay = { day: string; views: number; viewers: number; clicks: number; visitors: number };

/** Everything one advertiser sees about their ad. */
export async function getSponsorReport(ad: string) {
  const client = await db();
  const days = utcDays(30);
  const since = days[0];
  const [totals, byDay, byPlacement, site, siteWindow, reachWindow] = await client.batch(
    [
      {
        sql: `SELECT COALESCE(SUM(views), 0) AS views, COUNT(DISTINCT CASE WHEN views > 0 THEN visitor END) AS viewers,
                COALESCE(SUM(clicks), 0) AS clicks, COUNT(DISTINCT CASE WHEN clicks > 0 THEN visitor END) AS clickers,
                MIN(day) AS first_day, MAX(day) AS last_day
              FROM ad_stats WHERE ad = ?`,
        args: [ad],
      },
      {
        sql: `SELECT day, SUM(views) AS views, COUNT(DISTINCT CASE WHEN views > 0 THEN visitor END) AS viewers, SUM(clicks) AS clicks
              FROM ad_stats WHERE ad = ? AND day >= ? GROUP BY day`,
        args: [ad, since],
      },
      {
        sql: `SELECT placement, SUM(views) AS views, COUNT(DISTINCT CASE WHEN views > 0 THEN visitor END) AS viewers, SUM(clicks) AS clicks
              FROM ad_stats WHERE ad = ? GROUP BY placement ORDER BY views DESC, placement`,
        args: [ad],
      },
      { sql: "SELECT day, COUNT(*) AS n FROM views WHERE uid = ? AND day >= ? GROUP BY day", args: [SITE, since] },
      { sql: "SELECT COUNT(DISTINCT visitor) AS n FROM views WHERE uid = ? AND day >= ?", args: [SITE, since] },
      {
        sql: "SELECT COUNT(DISTINCT visitor) AS n FROM ad_stats WHERE ad = ? AND day >= ? AND views > 0",
        args: [ad, since],
      },
    ],
    "read",
  );
  const t = totals.rows[0];
  const dayMap = new Map(byDay.rows.map((r) => [String(r.day), r]));
  const siteMap = new Map(site.rows.map((r) => [String(r.day), Number(r.n)]));
  const daily: SponsorDay[] = days.map((day) => {
    const r = dayMap.get(day);
    return { day, views: Number(r?.views ?? 0), viewers: Number(r?.viewers ?? 0), clicks: Number(r?.clicks ?? 0), visitors: siteMap.get(day) ?? 0 };
  });
  return {
    totals: {
      views: Number(t.views),
      viewers: Number(t.viewers),
      clicks: Number(t.clicks),
      clickers: Number(t.clickers),
      firstDay: (t.first_day as string | null) ?? null,
      lastDay: (t.last_day as string | null) ?? null,
    },
    daily,
    placements: byPlacement.rows.map((r) => ({
      placement: String(r.placement),
      views: Number(r.views),
      viewers: Number(r.viewers),
      clicks: Number(r.clicks),
    })),
    /** Last 30 days: distinct site visitors, and how many of them saw this ad. */
    window: { visitors: Number(siteWindow.rows[0].n), reached: Number(reachWindow.rows[0].n) },
  };
}

export type MediaKit = Awaited<ReturnType<typeof getMediaKit>>;

/** Audience numbers for /anuncie. Cached: a public page. */
export async function getMediaKit() {
  "use cache: remote";
  cacheLife(SHARED);
  const client = await db();
  const d30 = utcDays(30);
  const d7 = d30.slice(-7);
  const [counts, ads, placements, daily] = await client.batch(
    [
      {
        sql: `SELECT
          (SELECT COUNT(*) FROM users WHERE id GLOB '[0-9]*') AS members,
          (SELECT COUNT(DISTINCT visitor) FROM views WHERE uid = :site AND day >= :d7) AS visitors7,
          (SELECT COUNT(DISTINCT visitor) FROM views WHERE uid = :site AND day >= :d30) AS visitors30,
          (SELECT COUNT(*) FROM views WHERE uid <> :site) AS bubble_views,
          (SELECT COUNT(DISTINCT uid) FROM views WHERE uid <> :site) AS bubbles,
          (SELECT COUNT(*) FROM shares) AS shares`,
        args: { site: SITE, d7: d7[0], d30: d30[0] },
      },
      `SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(clicks), 0) AS clicks, COUNT(DISTINCT visitor) AS reach,
         COUNT(DISTINCT ad) AS advertisers FROM ad_stats`,
      "SELECT placement, SUM(views) AS views, SUM(clicks) AS clicks FROM ad_stats GROUP BY placement ORDER BY views DESC, placement",
      { sql: "SELECT day, COUNT(*) AS n FROM views WHERE uid = ? AND day >= ? GROUP BY day", args: [SITE, d30[0]] },
    ],
    "read",
  );
  const c = counts.rows[0];
  const a = ads.rows[0];
  const views = Number(a.views);
  const clicks = Number(a.clicks);
  const byDay = new Map(daily.rows.map((r) => [String(r.day), Number(r.n)]));
  return {
    members: Number(c.members),
    visitors7: Number(c.visitors7),
    visitors30: Number(c.visitors30),
    bubbleViews: Number(c.bubble_views),
    bubbles: Number(c.bubbles),
    shares: Number(c.shares),
    ads: { views, clicks, reach: Number(a.reach), advertisers: Number(a.advertisers), ctr: views ? clicks / views : 0 },
    placements: placements.rows.map((r) => ({ placement: String(r.placement), views: Number(r.views), clicks: Number(r.clicks) })),
    daily: d30.map((day) => ({ day, visitors: byDay.get(day) ?? 0 })),
  };
}
