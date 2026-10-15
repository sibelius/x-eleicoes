import "server-only";
import { ADS } from "./ads";
import { db } from "./db";
import { BUBBLE_TALLIES_SQL, type Vote } from "./network";
import { SITE } from "./views-shared";

// Numbers for the /admin screens. Everything is computed on request; the data is small.

const brDay = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10); // Brasília

/** The last n days (YYYY-MM-DD), oldest first, ending today. */
export function lastDays(n: number, today = new Date()) {
  return Array.from({ length: n }, (_, i) => new Date(today.getTime() - (n - 1 - i) * 86400_000).toISOString().slice(0, 10));
}

export type DayPoint = { day: string; [series: string]: number | string };

export async function getOverview() {
  const client = await db();
  const now = Date.now();
  const [counts, users, site, top, pages] = await client.batch(
    [
      {
        sql: `SELECT
          (SELECT COUNT(*) FROM users WHERE id GLOB '[0-9]*') AS members,
          (SELECT COUNT(*) FROM users WHERE vote = 'red') AS red,
          (SELECT COUNT(*) FROM users WHERE vote = 'green') AS green,
          (SELECT COUNT(*) FROM users WHERE invited_by IS NOT NULL) AS invited,
          (SELECT COUNT(*) FROM edges) AS edges,
          (SELECT COUNT(*) FROM edges WHERE src IN (SELECT id FROM users) AND dst IN (SELECT id FROM users)) AS member_edges,
          (SELECT COUNT(*) FROM profiles) AS profiles,
          (SELECT COUNT(DISTINCT uid) FROM push_subs) AS push_users,
          (SELECT COUNT(*) FROM follow_imports) AS imports,
          (SELECT COUNT(DISTINCT visitor) FROM views WHERE uid = :site) AS visitors,
          (SELECT COUNT(*) FROM presence WHERE at > :online) AS online`,
        args: { site: SITE, online: now - 2 * 60_000 },
      },
      "SELECT created_at, voted_at, vote FROM users WHERE id GLOB '[0-9]*'",
      { sql: "SELECT day, COUNT(*) AS n, SUM(visitor LIKE 'u:%') AS signed FROM views WHERE uid = ? GROUP BY day", args: [SITE] },
      `SELECT v.uid, COUNT(DISTINCT v.visitor) AS n, COALESCE(u.username, p.username) AS username,
         COALESCE(u.avatar, p.avatar) AS avatar, u.vote
       FROM views v LEFT JOIN users u ON u.id = v.uid LEFT JOIN profiles p ON p.id = v.uid
       WHERE v.uid <> '_site' GROUP BY v.uid ORDER BY n DESC LIMIT 15`,
      `SELECT COUNT(DISTINCT uid) AS bubbles, COUNT(*) AS n FROM views WHERE uid <> '_site'`,
    ],
    "read",
  );
  const c = counts.rows[0];
  const num = (k: string) => Number(c[k]);

  const days = lastDays(30);
  const first = days[0];
  const joined = new Map<string, number>();
  const red = new Map<string, number>();
  const green = new Map<string, number>();
  let before = 0;
  for (const u of users.rows) {
    const d = brDay(Number(u.created_at));
    if (d < first) before++;
    else joined.set(d, (joined.get(d) ?? 0) + 1);
    if (u.vote && u.voted_at != null) {
      const vd = brDay(Number(u.voted_at));
      const m = u.vote === "red" ? red : green;
      m.set(vd, (m.get(vd) ?? 0) + 1);
    }
  }
  let total = before;
  const growth = days.map((day) => {
    total += joined.get(day) ?? 0;
    return { day, joined: joined.get(day) ?? 0, members: total, red: red.get(day) ?? 0, green: green.get(day) ?? 0 };
  });
  const siteByDay = new Map(site.rows.map((r) => [String(r.day), { n: Number(r.n), signed: Number(r.signed) }]));
  const traffic = days.map((day) => ({ day, visitors: siteByDay.get(day)?.n ?? 0, signed: siteByDay.get(day)?.signed ?? 0 }));

  return {
    kpis: {
      members: num("members"),
      red: num("red"),
      green: num("green"),
      undecided: num("members") - num("red") - num("green"),
      invited: num("invited"),
      edges: num("edges"),
      memberEdges: num("member_edges"),
      profiles: num("profiles"),
      pushUsers: num("push_users"),
      imports: num("imports"),
      visitors: num("visitors"),
      online: num("online"),
      bubblesViewed: Number(pages.rows[0].bubbles),
      bubbleViews: Number(pages.rows[0].n),
    },
    growth,
    traffic,
    topBubbles: top.rows.map((r) => ({
      id: String(r.uid),
      username: (r.username as string | null) ?? null,
      avatar: (r.avatar as string | null) ?? null,
      vote: (r.vote as Vote | null) ?? null,
      views: Number(r.n),
    })),
  };
}

export type AdRow = { ad: string; views: number; viewers: number; clicks: number; clickers: number };

export async function getAdStats() {
  const client = await db();
  const [byAd, byPlacement, byDay, totals] = await client.batch(
    [
      `SELECT ad, SUM(views) AS views, COUNT(DISTINCT CASE WHEN views > 0 THEN visitor END) AS viewers,
         SUM(clicks) AS clicks, COUNT(DISTINCT CASE WHEN clicks > 0 THEN visitor END) AS clickers
       FROM ad_stats GROUP BY ad`,
      "SELECT ad, placement, SUM(views) AS views, SUM(clicks) AS clicks FROM ad_stats GROUP BY ad, placement",
      "SELECT ad, day, SUM(views) AS views, SUM(clicks) AS clicks FROM ad_stats GROUP BY ad, day",
      `SELECT COUNT(DISTINCT visitor) AS reach, COUNT(DISTINCT CASE WHEN clicks > 0 THEN visitor END) AS clickers,
         COALESCE(SUM(views), 0) AS views, COALESCE(SUM(clicks), 0) AS clicks FROM ad_stats`,
    ],
    "read",
  );
  const found = new Map(byAd.rows.map((r) => [String(r.ad), r]));
  // Every ad in rotation shows up, even before its first impression.
  const ads: AdRow[] = ADS.map(({ name }) => {
    const r = found.get(name);
    return {
      ad: name,
      views: Number(r?.views ?? 0),
      viewers: Number(r?.viewers ?? 0),
      clicks: Number(r?.clicks ?? 0),
      clickers: Number(r?.clickers ?? 0),
    };
  });
  const placements = [...new Set(byPlacement.rows.map((r) => String(r.placement)))].sort();
  const matrix = Object.fromEntries(
    ADS.map(({ name }) => [name, Object.fromEntries(placements.map((p) => [p, { views: 0, clicks: 0 }]))]),
  ) as Record<string, Record<string, { views: number; clicks: number }>>;
  for (const r of byPlacement.rows) {
    const cell = matrix[String(r.ad)]?.[String(r.placement)];
    if (cell) Object.assign(cell, { views: Number(r.views), clicks: Number(r.clicks) });
  }
  const days = lastDays(30);
  const daily = Object.fromEntries(ADS.map(({ name }) => [name, days.map((day) => ({ day, views: 0, clicks: 0 }))]));
  for (const r of byDay.rows) {
    const i = days.indexOf(String(r.day));
    const row = daily[String(r.ad)]?.[i];
    if (row) Object.assign(row, { views: Number(r.views), clicks: Number(r.clicks) });
  }
  const totalByDay = days.map((day, i) => ({
    day,
    views: ADS.reduce((s, a) => s + daily[a.name][i].views, 0),
    clicks: ADS.reduce((s, a) => s + daily[a.name][i].clicks, 0),
  }));
  const t = totals.rows[0];
  return {
    totals: { reach: Number(t.reach), clickers: Number(t.clickers), views: Number(t.views), clicks: Number(t.clicks) },
    ads,
    placements,
    matrix,
    daily,
    totalByDay,
  };
}

export type GraphMember = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  vote: Vote | null;
  invitedBy: string | null;
  createdAt: number;
  /** Follows/followers across all of X we know of, not only members. */
  following: number;
  followers: number;
};

/** All members and the follow edges among them (src follows dst). */
export async function getMemberGraph() {
  const client = await db();
  const [members, edges, deg] = await client.batch(
    [
      `SELECT u.id, u.username, u.name, COALESCE(u.avatar, p.avatar) AS avatar, u.vote, u.invited_by, u.created_at
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*'`,
      `SELECT src, dst FROM edges WHERE src IN (SELECT id FROM users WHERE id GLOB '[0-9]*')
         AND dst IN (SELECT id FROM users WHERE id GLOB '[0-9]*') AND src <> dst`,
      `SELECT m.id,
         (SELECT COUNT(*) FROM edges WHERE src = m.id) AS following,
         (SELECT COUNT(*) FROM edges WHERE dst = m.id) AS followers
       FROM users m WHERE m.id GLOB '[0-9]*'`,
    ],
    "read",
  );
  const degrees = new Map(deg.rows.map((r) => [String(r.id), { following: Number(r.following), followers: Number(r.followers) }]));
  const ids = new Set(members.rows.map((r) => String(r.id)));
  const nodes: GraphMember[] = members.rows.map((r) => ({
    id: String(r.id),
    username: String(r.username),
    name: String(r.name),
    avatar: (r.avatar as string | null) ?? null,
    vote: (r.vote as Vote | null) ?? null,
    invitedBy: r.invited_by && ids.has(String(r.invited_by)) ? String(r.invited_by) : null,
    createdAt: Number(r.created_at),
    following: degrees.get(String(r.id))?.following ?? 0,
    followers: degrees.get(String(r.id))?.followers ?? 0,
  }));
  return { nodes, edges: edges.rows.map((r) => [String(r.src), String(r.dst)] as [string, string]) };
}

export type BubbleLean = { id: string; username: string; vote: Vote | null; red: number; green: number; total: number };

/** Each member's bubble lean, with their own vote, for the polarization scatter. */
export async function getBubbleLeans(): Promise<BubbleLean[]> {
  const client = await db();
  const [tallies, members] = await client.batch(
    [BUBBLE_TALLIES_SQL, "SELECT id, username, vote FROM users WHERE id GLOB '[0-9]*'"],
    "read",
  );
  const byId = new Map(members.rows.map((r) => [String(r.id), { username: String(r.username), vote: (r.vote as Vote | null) ?? null }]));
  return tallies.rows.flatMap((r) => {
    const m = byId.get(String(r.id));
    const total = Number(r.total);
    if (!m || !total) return [];
    const red = Number(r.red);
    return [{ id: String(r.id), username: m.username, vote: m.vote, red, green: total - red, total }];
  });
}
