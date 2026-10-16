import "server-only";
import { cacheLife } from "next/cache";
import { ADS } from "./ads";
import { db } from "./db";
import { TABLES } from "./schema";
import { bubbleTallies, type Vote } from "./network";
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
      { sql: "SELECT day, COUNT(*) AS n, SUM(CASE WHEN visitor LIKE 'u:%' THEN 1 ELSE 0 END) AS signed FROM views WHERE uid = ? GROUP BY day", args: [SITE] },
      `SELECT v.uid, COUNT(DISTINCT v.visitor) AS n, COALESCE(u.username, p.username) AS username,
         COALESCE(u.avatar, p.avatar) AS avatar, u.vote
       FROM views v LEFT JOIN users u ON u.id = v.uid LEFT JOIN profiles p ON p.id = v.uid
       WHERE v.uid <> '_site' GROUP BY v.uid, u.username, p.username, u.avatar, p.avatar, u.vote ORDER BY n DESC, v.uid LIMIT 15`,
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
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id GLOB '[0-9]*' ORDER BY u.id`,
      `SELECT src, dst FROM edges WHERE src IN (SELECT id FROM users WHERE id GLOB '[0-9]*')
         AND dst IN (SELECT id FROM users WHERE id GLOB '[0-9]*') AND src <> dst ORDER BY src, dst`,
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
  const [tallies, members] = await Promise.all([bubbleTallies(), client.execute("SELECT id, username, vote FROM users WHERE id GLOB '[0-9]*'")]);
  const byId = new Map(members.rows.map((r) => [String(r.id), { username: String(r.username), vote: (r.vote as Vote | null) ?? null }]));
  return tallies.flatMap((r) => {
    const m = byId.get(r.id);
    const total = r.total;
    if (!m || !total) return [];
    const red = r.red;
    return [{ id: String(r.id), username: m.username, vote: m.vote, red, green: total - red, total }];
  });
}

export type UtmRow = { source: string; medium: string; campaign: string; content: string; visits: number; visitors: number; signups: number; voted: number };

/** Arrivals and signups per tagged link (posts on X, push notifications). */
export async function getUtmStats() {
  const client = await db();
  const [rows, byDay, paths, totals] = await client.batch(
    [
      `SELECT e.source, e.medium, e.campaign, e.content,
         SUM(CASE WHEN e.kind = 'visit' THEN 1 ELSE 0 END) AS visits,
         COUNT(DISTINCT CASE WHEN e.kind = 'visit' THEN e.visitor END) AS visitors,
         SUM(CASE WHEN e.kind = 'signup' THEN 1 ELSE 0 END) AS signups,
         SUM(CASE WHEN e.kind = 'signup' AND u.vote IS NOT NULL THEN 1 ELSE 0 END) AS voted
       FROM utm_events e LEFT JOIN users u ON e.kind = 'signup' AND u.id = substr(e.visitor, 3)
       GROUP BY e.source, e.medium, e.campaign, e.content`,
      "SELECT day, SUM(CASE WHEN kind = 'visit' THEN 1 ELSE 0 END) AS visits, SUM(CASE WHEN kind = 'signup' THEN 1 ELSE 0 END) AS signups FROM utm_events GROUP BY day",
      "SELECT path, COUNT(*) AS n FROM utm_events WHERE kind = 'visit' GROUP BY path ORDER BY n DESC, path LIMIT 10",
      `SELECT COALESCE(SUM(CASE WHEN kind = 'visit' THEN 1 ELSE 0 END), 0) AS visits, COUNT(DISTINCT CASE WHEN kind = 'visit' THEN visitor END) AS visitors,
         COALESCE(SUM(CASE WHEN kind = 'signup' THEN 1 ELSE 0 END), 0) AS signups FROM utm_events`,
    ],
    "read",
  );
  const all: UtmRow[] = rows.rows.map((r) => ({
    source: String(r.source),
    medium: String(r.medium),
    campaign: String(r.campaign),
    content: String(r.content),
    visits: Number(r.visits),
    visitors: Number(r.visitors),
    signups: Number(r.signups),
    voted: Number(r.voted),
  }));
  // Roll content up into campaigns, and campaigns into sources.
  const roll = (key: (r: UtmRow) => string) => {
    const m = new Map<string, UtmRow>();
    for (const r of all) {
      const k = key(r);
      const acc = m.get(k) ?? { ...r, content: "", visits: 0, visitors: 0, signups: 0, voted: 0 };
      acc.visits += r.visits;
      acc.visitors += r.visitors; // upper bound: one person can arrive through two links
      acc.signups += r.signups;
      acc.voted += r.voted;
      m.set(k, acc);
    }
    return [...m.values()].sort((a, b) => b.visits - a.visits || b.signups - a.signups);
  };
  const days = lastDays(30);
  const found = new Map(byDay.rows.map((r) => [String(r.day), r]));
  const t = totals.rows[0];
  return {
    totals: { visits: Number(t.visits), visitors: Number(t.visitors), signups: Number(t.signups), voted: all.reduce((s, r) => s + r.voted, 0) },
    sources: roll((r) => `${r.source}|${r.medium}`),
    campaigns: roll((r) => `${r.source}|${r.medium}|${r.campaign}`),
    detail: [...all].sort((a, b) => b.visits - a.visits),
    daily: days.map((day) => ({ day, visits: Number(found.get(day)?.visits ?? 0), signups: Number(found.get(day)?.signups ?? 0) })),
    paths: paths.rows.map((r) => ({ path: String(r.path), visits: Number(r.n) })),
  };
}

export type PushLogRow = { id: number; at: number; username: string | null; campaign: string; title: string; body: string; url: string; devices: number; delivered: number };

/** Every web push sent (newest first), plus totals per notification type and per day. */
export async function getPushLog(limit = 300) {
  const client = await db();
  const since = Date.now() - 14 * 86400_000;
  const [rows, byCampaign, byDay] = await client.batch(
    [
      {
        sql: `SELECT l.id, l.at, u.username, l.campaign, l.title, l.body, l.url, l.devices, l.delivered
              FROM push_log l LEFT JOIN users u ON u.id = l.uid ORDER BY l.at DESC, l.id LIMIT ?`,
        args: [limit],
      },
      `SELECT campaign, COUNT(*) AS n, SUM(CASE WHEN delivered > 0 THEN 1 ELSE 0 END) AS ok, COUNT(DISTINCT uid) AS people FROM push_log GROUP BY campaign ORDER BY n DESC, campaign`,
      { sql: "SELECT at FROM push_log WHERE at > ?", args: [since] },
    ],
    "read",
  );
  const days = new Map(lastDays(14).map((d) => [d, 0]));
  for (const r of byDay.rows) {
    const d = brDay(Number(r.at));
    if (days.has(d)) days.set(d, days.get(d)! + 1);
  }
  return {
    rows: rows.rows.map((r) => ({
      id: Number(r.id),
      at: Number(r.at),
      username: (r.username as string | null) ?? null,
      campaign: String(r.campaign),
      title: String(r.title),
      body: String(r.body),
      url: String(r.url),
      devices: Number(r.devices),
      delivered: Number(r.delivered),
    })) as PushLogRow[],
    byCampaign: byCampaign.rows.map((r) => ({ campaign: String(r.campaign), n: Number(r.n), ok: Number(r.ok), people: Number(r.people) })),
    daily: [...days].map(([day, pushes]) => ({ day, pushes })) as DayPoint[],
  };
}

/** Database health: rows per table, file size, and how the main tables grew per day. */
/**
 * Cached a minute: it used to be ~30 uncached queries per visit, queued behind the site's traffic on a
 * 5-connection pool. On Postgres, row counts are the planner's live-tuple stats (one query, close enough).
 */
export async function getDbStats() {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  const client = await db();
  const pg = client.dialect === "pg";
  const tables = TABLES;
  const counts = pg
    ? await client
        .execute("SELECT relname AS name, n_live_tup AS n FROM pg_stat_user_tables")
        .then((r) => {
          const by = new Map(r.rows.map((x) => [String(x.name), Number(x.n)]));
          return tables.map((t) => ({ rows: [{ n: by.get(t) ?? 0 }] }));
        })
    : await client.batch(
        tables.map((t) => `SELECT COUNT(*) AS n FROM ${t}`),
        "read",
      );
  let bytes: number | null = null;
  try {
    if (pg) {
      bytes = Number((await client.execute("SELECT pg_database_size(current_database()) AS b")).rows[0].b);
    } else {
      const [pc, ps] = await client.batch(["PRAGMA page_count", "PRAGMA page_size"], "read");
      bytes = Number(Object.values(pc.rows[0])[0]) * Number(Object.values(ps.rows[0])[0]);
    }
  } catch {
    bytes = null; // not every host exposes these
  }
  const since = Date.now() - 14 * 86400_000;
  const [users, votes, messages, views, extra] = await client.batch(
    [
      { sql: "SELECT created_at AS at FROM users WHERE created_at > ? AND id GLOB '[0-9]*'", args: [since] },
      { sql: "SELECT at FROM vote_changes WHERE at > ?", args: [since] },
      { sql: "SELECT at FROM messages WHERE at > ?", args: [since] },
      { sql: "SELECT day, COUNT(*) AS n FROM views WHERE uid = '_site' AND day >= ? GROUP BY day", args: [lastDays(14)[0]] },
      `SELECT
         (SELECT COUNT(DISTINCT src) FROM edges) AS importers,
         (SELECT ROUND(AVG(n)) FROM (SELECT COUNT(*) AS n FROM edges GROUP BY src)) AS avg_following,
         (SELECT COUNT(*) FROM profiles WHERE username IS NULL) AS profiles_unnamed,
         (SELECT COUNT(*) FROM users WHERE id GLOB '[0-9]*' AND avatar IS NULL) AS members_no_photo,
         (SELECT COUNT(*) FROM users u WHERE id GLOB '[0-9]*' AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.src = u.id)) AS members_no_edges,
         (SELECT COUNT(DISTINCT uid) FROM push_subs) AS push_people`,
    ],
    "read",
  );
  const daily = new Map(lastDays(14).map((d) => [d, { day: d, members: 0, picks: 0, messages: 0, visitors: 0 }]));
  const bump = (rows: Record<string, unknown>[], key: "members" | "picks" | "messages") => {
    for (const r of rows) {
      const d = daily.get(brDay(Number(r.at)));
      if (d) d[key]++;
    }
  };
  bump(users.rows, "members");
  bump(votes.rows, "picks");
  bump(messages.rows, "messages");
  for (const r of views.rows) {
    const d = daily.get(String(r.day));
    if (d) d.visitors = Number(r.n);
  }
  const x = extra.rows[0];
  return {
    engine: pg ? "Postgres (Supabase)" : "SQLite (Turso)",
    tables: tables.map((name, i) => ({ name, rows: Number(counts[i].rows[0].n) })).sort((a, b) => b.rows - a.rows),
    bytes,
    daily: [...daily.values()] as unknown as DayPoint[],
    health: {
      importers: Number(x.importers),
      avgFollowing: Number(x.avg_following ?? 0),
      profilesUnnamed: Number(x.profiles_unnamed),
      membersNoPhoto: Number(x.members_no_photo),
      membersNoEdges: Number(x.members_no_edges),
      pushPeople: Number(x.push_people),
    },
  };
}
