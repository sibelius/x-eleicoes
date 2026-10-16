import "server-only";
import { cacheLife } from "next/cache";
import { db } from "./db";
import { PER_USER, SHARED, bubbleTallies, getGlobalNetwork, getNetwork, type NetworkNode } from "./network";

// The bubble as a network: the same people as the bubble, linked by who follows whom among them.
// Big bubbles are cut to MAP_MAX people: members first (the best connected), then non-members.

export const MAP_MAX = 500;

export type BubbleMap = {
  ids: string[];
  /** [i, j, mutual] over ids (i < j): one of them follows the other; mutual = 1 when both do. */
  links: [number, number, 0 | 1][];
  /** Community of each id (0 = biggest), Louvain over the links. */
  groups: number[];
  /** People left out because the bubble is bigger than MAP_MAX. */
  cut: number;
};

/** The people kept on the map, in the bubble's order otherwise. */
export function pickNodes(nodes: NetworkNode[], max: number, rank: Map<string, number>): NetworkNode[] {
  if (nodes.length <= max) return nodes;
  const members = nodes.filter((n) => n.member).sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0));
  const others = nodes.filter((n) => !n.member).sort((a, b) => b.strength - a.strength);
  return [...members, ...others].slice(0, max);
}

/** Communities over undirected links (0 = biggest): Louvain, as in graph.ts (not exported there). */
export function communities(n: number, links: [number, number, ...unknown[]][]): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of links) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return louvain(adj, n);
}

function louvain(adj: number[][], n: number) {
  // Weighted adjacency per (super)node; an aggregated node's self-loop holds twice its internal weight.
  let graph: Map<number, number>[] = adj.map((nb) => {
    const m = new Map<number, number>();
    for (const j of nb) m.set(j, (m.get(j) ?? 0) + 1);
    return m;
  });
  let label = Array.from({ length: n }, (_, i) => i);
  for (let level = 0; level < 10; level++) {
    const N = graph.length;
    const k = graph.map((m) => [...m.values()].reduce((s, w) => s + w, 0));
    const m2 = k.reduce((s, x) => s + x, 0);
    if (!m2) break;
    const comm = Array.from({ length: N }, (_, i) => i);
    const tot = [...k];
    let moved = true;
    let any = false;
    for (let pass = 0; moved && pass < 100; pass++) {
      moved = false;
      for (let i = 0; i < N; i++) {
        const ci = comm[i];
        const links = new Map<number, number>();
        for (const [j, w] of graph[i]) if (j !== i) links.set(comm[j], (links.get(comm[j]) ?? 0) + w);
        tot[ci] -= k[i];
        let best = ci;
        let bestGain = (links.get(ci) ?? 0) - (tot[ci] * k[i]) / m2;
        for (const [c, w] of links) {
          const gain = w - (tot[c] * k[i]) / m2;
          if (gain > bestGain + 1e-12) {
            best = c;
            bestGain = gain;
          }
        }
        tot[best] += k[i];
        if (best !== ci) {
          comm[i] = best;
          moved = true;
          any = true;
        }
      }
    }
    if (!any) break;
    const ids = new Map<number, number>();
    for (const c of comm) if (!ids.has(c)) ids.set(c, ids.size);
    const cc = comm.map((c) => ids.get(c)!);
    label = label.map((x) => cc[x]);
    const next: Map<number, number>[] = Array.from({ length: ids.size }, () => new Map());
    graph.forEach((m, i) => {
      for (const [j, w] of m) next[cc[i]].set(cc[j], (next[cc[i]].get(cc[j]) ?? 0) + w);
    });
    graph = next;
  }
  const size = new Map<number, number>();
  for (const l of label) size.set(l, (size.get(l) ?? 0) + 1);
  const rank = new Map([...size.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([l], i) => [l, i]));
  return label.map((l) => rank.get(l)!);
}

/** Follow edges among `ids` as undirected links with a mutual flag. */
export async function linksAmong(ids: string[]): Promise<[number, number, 0 | 1][]> {
  if (ids.length < 2) return [];
  const client = await db();
  const r = await client.execute({
    sql: `SELECT src, dst FROM edges WHERE src IN (${ids.map(() => "?").join(",")}) AND dst IN (${ids.map(() => "?").join(",")})`,
    args: [...ids, ...ids],
  });
  const index = new Map(ids.map((id, i) => [id, i]));
  const pairs = new Map<string, [number, number, 0 | 1]>();
  for (const row of r.rows) {
    const a = index.get(String(row.src));
    const b = index.get(String(row.dst));
    if (a === undefined || b === undefined || a === b) continue;
    const [i, j] = a < b ? [a, b] : [b, a];
    const key = `${i}:${j}`;
    const seen = pairs.get(key);
    if (seen) seen[2] = 1;
    else pairs.set(key, [i, j, 0]);
  }
  return [...pairs.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

async function build(nodes: NetworkNode[]): Promise<BubbleMap> {
  let rank = new Map<string, number>();
  if (nodes.length > MAP_MAX) rank = new Map((await bubbleTallies()).map((t) => [t.id, t.total]));
  const kept = pickNodes(nodes, MAP_MAX, rank);
  const ids = kept.map((n) => n.id);
  const links = await linksAmong(ids);
  return { ids, links, groups: communities(ids.length, links), cut: nodes.length - kept.length };
}

/** Someone's bubble as a network (the owner left out: they're linked to everyone). */
export async function getBubbleMap(uid: string): Promise<BubbleMap> {
  "use cache: remote";
  cacheLife(PER_USER);
  return build((await getNetwork(uid)).nodes);
}

/** The combined bubble of everyone as a network. */
export async function getGlobalBubbleMap(): Promise<BubbleMap> {
  "use cache: remote";
  cacheLife(SHARED);
  return build(await getGlobalNetwork());
}
