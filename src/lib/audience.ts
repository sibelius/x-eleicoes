import "server-only";
import { cacheLife } from "next/cache";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { db } from "./db";
import { louvain } from "./graph";
import { PER_USER, type Vote } from "./network";

// "Who in your audience matters": a member's followers and followings, ranked by reach inside the
// known graph (how many known accounts follow them), the bridges between sides, and the communities
// the audience splits into. Big accounts are capped to the top accounts by reach.

export const AUDIENCE_CAP = 2000;
const EDGE_CAP = 60_000;
const MIN_COMMUNITY = 3; // smaller groups go to "no group" (-1)

export type AudienceNode = {
  id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
  member: boolean;
  vote: Vote | null;
  follower: boolean; // follows me
  following: boolean; // I follow them
  reach: number; // known accounts that follow them
  red: number; // Red voters linked to them (either direction, not counting me)
  green: number;
  degree: number; // links to others in my audience
  community: number; // -1 = no group
};

export type AudienceCommunity = {
  id: number;
  label: string;
  size: number;
  followers: number;
  red: number; // members of the community on each side
  green: number;
  top: Pick<AudienceNode, "id" | "username" | "name" | "avatar" | "reach" | "vote">[];
};

export type AudienceSummary = {
  accounts: number;
  followers: number;
  following: number;
  mutuals: number;
  members: number; // members among the whole audience
  memberFollowers: number;
  red: number; // followers who are members, by side
  green: number;
};

export type Audience = {
  summary: AudienceSummary;
  /** Ranked by reach, at most AUDIENCE_CAP. */
  nodes: AudienceNode[];
  communities: AudienceCommunity[];
  capped: boolean;
};

type Graph = { summary: AudienceSummary; nodes: AudienceNode[]; edges: [number, number][] };

/** Queries + community detection; plain objects only (cached by the callers). */
async function audienceGraph(uid: string, cap = AUDIENCE_CAP): Promise<Graph> {
  const client = await db();
  const [sum, top] = await client.batch(
    [
      {
        sql: `WITH rel AS (
                SELECT dst AS id, 1 AS following, 0 AS follower FROM edges WHERE src = :uid
                UNION ALL SELECT src, 0, 1 FROM edges WHERE dst = :uid
              ),
              agg AS (SELECT id, MAX(following) AS following, MAX(follower) AS follower FROM rel WHERE id <> :uid GROUP BY id)
              SELECT COUNT(*) AS accounts,
                COALESCE(SUM(agg.follower), 0) AS followers,
                COALESCE(SUM(agg.following), 0) AS following,
                COALESCE(SUM(agg.follower * agg.following), 0) AS mutuals,
                COUNT(u.id) AS members,
                COALESCE(SUM(CASE WHEN agg.follower = 1 AND u.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS member_followers,
                COALESCE(SUM(CASE WHEN agg.follower = 1 AND u.vote = 'red' THEN 1 ELSE 0 END), 0) AS red,
                COALESCE(SUM(CASE WHEN agg.follower = 1 AND u.vote = 'green' THEN 1 ELSE 0 END), 0) AS green
              FROM agg LEFT JOIN users u ON u.id = agg.id`,
        args: { uid },
      },
      {
        sql: `WITH rel AS (
                SELECT dst AS id, 1 AS following, 0 AS follower FROM edges WHERE src = :uid
                UNION ALL SELECT src, 0, 1 FROM edges WHERE dst = :uid
              ),
              agg AS (SELECT id, MAX(following) AS following, MAX(follower) AS follower FROM rel WHERE id <> :uid GROUP BY id)
              SELECT agg.id, agg.following, agg.follower,
                (SELECT COUNT(*) FROM edges r WHERE r.dst = agg.id) AS reach,
                (u.id IS NOT NULL) AS member,
                COALESCE(u.username, p.username) AS username,
                COALESCE(u.name, p.name) AS name,
                COALESCE(u.avatar, p.avatar) AS avatar,
                u.vote AS vote
              FROM agg LEFT JOIN users u ON u.id = agg.id LEFT JOIN profiles p ON p.id = agg.id
              ORDER BY reach DESC, agg.id
              LIMIT :lim`,
        args: { uid, lim: cap },
      },
    ],
    "read",
  );
  const s = sum.rows[0];
  const summary: AudienceSummary = {
    accounts: Number(s.accounts),
    followers: Number(s.followers),
    following: Number(s.following),
    mutuals: Number(s.mutuals),
    members: Number(s.members),
    memberFollowers: Number(s.member_followers),
    red: Number(s.red),
    green: Number(s.green),
  };
  const nodes: AudienceNode[] = top.rows.map((r) => ({
    id: String(r.id),
    username: (r.username as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    avatar: (r.avatar as string | null) ?? null,
    member: Boolean(Number(r.member)),
    vote: Number(r.member) ? ((r.vote as Vote | null) ?? null) : null,
    follower: Boolean(Number(r.follower)),
    following: Boolean(Number(r.following)),
    reach: Number(r.reach),
    red: 0,
    green: 0,
    degree: 0,
    community: -1,
  }));
  if (!nodes.length) return { summary, nodes, edges: [] };

  const ids = nodes.map((n) => n.id);
  const [links, sides] = await client.batch(
    [
      {
        sql: `SELECT src, dst FROM edges WHERE src IN (${ids.map(() => "?").join(",")}) AND dst IN (${ids.map(() => "?").join(",")}) LIMIT ?`,
        args: [...ids, ...ids, EDGE_CAP],
      },
      {
        sql: `SELECT x.id, SUM(CASE WHEN x.vote = 'red' THEN 1 ELSE 0 END) AS red, SUM(CASE WHEN x.vote = 'green' THEN 1 ELSE 0 END) AS green
              FROM (
                SELECT e.dst AS id, u.id AS m, u.vote FROM edges e JOIN users u ON u.id = e.src
                WHERE u.vote IS NOT NULL AND u.id <> ? AND e.dst IN (${ids.map(() => "?").join(",")})
                UNION SELECT e.src, u.id, u.vote FROM edges e JOIN users u ON u.id = e.dst
                WHERE u.vote IS NOT NULL AND u.id <> ? AND e.src IN (${ids.map(() => "?").join(",")})
              ) x
              GROUP BY x.id`,
        args: [uid, ...ids, uid, ...ids],
      },
    ],
    "read",
  );
  const index = new Map(ids.map((id, i) => [id, i]));
  for (const r of sides.rows) {
    const n = nodes[index.get(String(r.id))!];
    if (!n) continue;
    n.red = Number(r.red);
    n.green = Number(r.green);
  }
  // Undirected, deduplicated ties (sorted so both engines give the same graph).
  const pairs = new Set<string>();
  const edges: [number, number][] = [];
  for (const r of links.rows) {
    const a = index.get(String(r.src));
    const b = index.get(String(r.dst));
    if (a == null || b == null || a === b) continue;
    const [i, j] = a < b ? [a, b] : [b, a];
    const key = `${i},${j}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    edges.push([i, j]);
  }
  edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  const adj: number[][] = nodes.map(() => []);
  for (const [i, j] of edges) {
    adj[i].push(j);
    adj[j].push(i);
  }
  const raw = louvain(adj, nodes.length);
  const size = new Map<number, number>();
  for (const c of raw) size.set(c, (size.get(c) ?? 0) + 1);
  // louvain numbers by size (0 = biggest), so the kept ones stay in order.
  const kept = new Map([...size.entries()].filter(([, k]) => k >= MIN_COMMUNITY).sort((a, b) => a[0] - b[0]).map(([c], i) => [c, i]));
  nodes.forEach((n, i) => {
    n.degree = adj[i].length;
    n.community = adj[i].length ? (kept.get(raw[i]) ?? -1) : -1;
  });
  return { summary, nodes, edges };
}

const handle = (n: Pick<AudienceNode, "username" | "id">) => (n.username ? `@${n.username}` : n.id);

function communities(nodes: AudienceNode[]): AudienceCommunity[] {
  const groups = new Map<number, AudienceNode[]>();
  for (const n of nodes) if (n.community >= 0) groups.set(n.community, [...(groups.get(n.community) ?? []), n]);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, ns]) => {
      const top = [...ns].sort((a, b) => b.reach - a.reach || a.id.localeCompare(b.id)).slice(0, 5);
      const named = top.filter((n) => n.username).slice(0, 2);
      return {
        id,
        label: `comunidade de ${(named.length ? named : top.slice(0, 2)).map(handle).join(", ")}`,
        size: ns.length,
        followers: ns.filter((n) => n.follower).length,
        red: ns.filter((n) => n.vote === "red").length,
        green: ns.filter((n) => n.vote === "green").length,
        top: top.map(({ id, username, name, avatar, reach, vote }) => ({ id, username, name, avatar, reach, vote })),
      };
    });
}

/** A member's audience: summary, accounts ranked by reach, communities. */
export async function getAudience(uid: string): Promise<Audience> {
  "use cache: remote";
  cacheLife(PER_USER);
  const g = await audienceGraph(uid);
  return { summary: g.summary, nodes: g.nodes, communities: communities(g.nodes), capped: g.summary.accounts > g.nodes.length };
}

/** Followers who reach the most known accounts. */
export const topFollowers = (a: Audience, n = 20) => a.nodes.filter((x) => x.follower).slice(0, n);

/** Followers linked to voters of both sides, the most balanced (then widest reach) first. */
export const bridges = (a: Audience, n = 10) =>
  a.nodes
    .filter((x) => x.follower && x.red > 0 && x.green > 0)
    .sort((x, y) => Math.min(y.red, y.green) - Math.min(x.red, x.green) || y.red + y.green - (x.red + x.green) || y.reach - x.reach || x.id.localeCompare(y.id))
    .slice(0, n);

/** People who follow back, the ones most tied into the rest of the audience first. */
export const mutuals = (a: Audience, n = 10) =>
  a.nodes
    .filter((x) => x.follower && x.following)
    .sort((x, y) => y.degree - x.degree || y.reach - x.reach || x.id.localeCompare(y.id))
    .slice(0, n);

const sideLabel = (v: Vote | null) => (v === "red" ? "Vermelho" : v === "green" ? "Verde" : "");

/** The ranked audience as CSV (Excel-friendly: BOM, CRLF). */
export function audienceCsv(a: Audience) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const label = new Map(a.communities.map((c) => [c.id, c.label]));
  const rows = [
    ["posicao", "handle", "nome", "alcance", "lado", "membro", "relacao", "comunidade", "ligacoes_vermelho", "ligacoes_verde", "url"],
    ...a.nodes.map((n, i) => [
      i + 1,
      n.username ? `@${n.username}` : "",
      n.name ?? "",
      n.reach,
      sideLabel(n.vote),
      n.member ? "sim" : "não",
      n.follower && n.following ? "mútuo" : n.follower ? "seguidor" : "seguindo",
      label.get(n.community) ?? "",
      n.red,
      n.green,
      n.username ? `https://x.com/${n.username}` : `https://x.com/i/user/${n.id}`,
    ]),
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/**
 * The audience map, columnar to keep the payload small: per account its handle, name, avatar,
 * community, side (0 not a member, 1 Red, 2 Green, 3 member without a side), lean (-100 Red … 100 Green,
 * from who they're linked to), reach, relation (1 follows me, 2 I follow, 3 both) and a force-layout
 * position; e = flat pairs of indexes.
 */
export async function getAudienceMap(uid: string) {
  "use cache: remote";
  cacheLife(PER_USER);
  const g = await audienceGraph(uid);
  const pos = layout(g.nodes, g.edges);
  const shown = g.edges.slice(0, 8000);
  return {
    id: g.nodes.map((n) => n.id),
    u: g.nodes.map((n) => n.username),
    n: g.nodes.map((n) => n.name),
    a: g.nodes.map((n) => n.avatar),
    c: g.nodes.map((n) => n.community),
    s: g.nodes.map((n) => (!n.member ? 0 : n.vote === "red" ? 1 : n.vote === "green" ? 2 : 3)),
    l: g.nodes.map((n) => (n.red + n.green ? Math.round(((n.green - n.red) / (n.red + n.green)) * 100) : 0)),
    r: g.nodes.map((n) => n.reach),
    f: g.nodes.map((n) => (n.follower ? 1 : 0) + (n.following ? 2 : 0)),
    x: pos.map((p) => p.x),
    y: pos.map((p) => p.y),
    e: shown.flat(),
    labels: communities(g.nodes).map((c) => c.label),
  };
}

export type AudienceMap = Awaited<ReturnType<typeof getAudienceMap>>;

/** Force layout: each community pulled toward its spot on a ring; accounts with no ties orbit outside. */
function layout(nodes: AudienceNode[], edges: [number, number][]) {
  type P = SimulationNodeDatum & { i: number };
  const n = nodes.length;
  const groups = Math.max(1, ...nodes.map((x) => x.community + 1));
  const spread = 14 * Math.sqrt(n);
  const anchor = (c: number) => {
    if (c < 0 || groups === 1) return { x: 0, y: 0 };
    const a = (2 * Math.PI * c) / groups;
    return { x: Math.cos(a) * spread * 0.5, y: Math.sin(a) * spread * 0.5 };
  };
  const linked = new Set(edges.flat());
  let lone = 0;
  const pts: P[] = nodes.map((x, i) => {
    if (!linked.has(i)) {
      const a = lone++ * 2.39996; // golden angle
      const r = spread + 6 * Math.sqrt(lone);
      return { i, x: Math.cos(a) * r, y: Math.sin(a) * r, fx: Math.cos(a) * r, fy: Math.sin(a) * r };
    }
    const p = anchor(x.community);
    return { i, x: p.x + ((i * 37) % 40) - 20, y: p.y + ((i * 91) % 40) - 20 };
  });
  const links = edges.slice(0, 20_000).map(([source, target]) => ({ source, target }));
  forceSimulation(pts)
    .force("link", forceLink(links).distance(24).strength(0.15))
    .force("charge", forceManyBody().strength(-24).distanceMax(spread))
    .force("collide", forceCollide(4))
    .force("x", forceX<P>((p) => anchor(nodes[p.i].community).x).strength(0.06))
    .force("y", forceY<P>((p) => anchor(nodes[p.i].community).y).strength(0.06))
    .stop()
    .tick(n > 1000 ? 200 : 300);
  return pts.map((p) => ({ x: Math.round(p.x ?? 0), y: Math.round(p.y ?? 0) }));
}
