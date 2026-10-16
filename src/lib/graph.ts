import "server-only";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { getMemberGraph, type GraphMember } from "./stats";

// Social network analysis over the members' follow graph (src follows dst).
// n is in the hundreds, so the exact algorithms (Brandes, all-pairs BFS) are cheap.

export type NodeMetrics = {
  inDeg: number; // members who follow them
  outDeg: number; // members they follow
  mutual: number;
  pagerank: number; // 0..1, share of the random walk
  betweenness: number; // 0..1, share of shortest paths through them (undirected)
  closeness: number; // 0..1, harmonic closeness (undirected)
  core: number; // k-core number
  clustering: number; // 0..1, how many of their friends know each other
  community: number; // community index (0 = biggest)
  crossTies: number; // neighbors who voted the other side
  sameTies: number; // neighbors who voted the same side
  invites: number; // members who joined through them (direct)
  cascade: number; // everyone downstream in the invite tree
  depth: number; // invite generation (0 = came on their own)
};

export type AnalyzedNode = GraphMember & NodeMetrics & { x: number; y: number };

export type GraphAnalysis = {
  nodes: AnalyzedNode[];
  edges: { source: string; target: string; mutual: boolean }[];
  stats: {
    members: number;
    edges: number;
    mutualPairs: number;
    isolated: number;
    density: number;
    reciprocity: number;
    avgClustering: number;
    components: number;
    giant: number;
    diameter: number;
    avgPath: number;
    communities: number;
    modularity: number;
    maxCore: number;
    /** Ties between two voters: same side, other side, and the vote assortativity coefficient (-1..1). */
    homophily: { same: number; cross: number; assortativity: number };
    /** Follows by side: [from][to] counts among voters. */
    mixing: { rr: number; rg: number; gr: number; gg: number };
  };
};

export async function getGraphAnalysis() {
  const { nodes, edges } = await getMemberGraph();
  return analyze(nodes, edges);
}

export function analyze(members: GraphMember[], rawEdges: [string, string][]): GraphAnalysis {
  const n = members.length;
  const index = new Map(members.map((m, i) => [m.id, i]));
  const out: Set<number>[] = members.map(() => new Set());
  const inn: Set<number>[] = members.map(() => new Set());
  for (const [s, d] of rawEdges) {
    const a = index.get(s);
    const b = index.get(d);
    if (a == null || b == null || a === b) continue;
    out[a].add(b);
    inn[b].add(a);
  }
  const und: number[][] = members.map((_, i) => [...new Set([...out[i], ...inn[i]])]);
  const m = out.reduce((s, x) => s + x.size, 0);

  const pagerank = pageRank(out, n);
  const { betweenness, closeness, diameter, avgPath } = paths(und, n);
  const core = kCore(und, n);
  const clustering = und.map((nb) => localClustering(nb, und));
  const community = louvain(und, n);
  const modularity = modularityOf(und, community, n);
  const comps = components(und, n);

  // Vote homophily over undirected ties between two voters.
  let same = 0;
  let cross = 0;
  const vote = members.map((x) => x.vote);
  const crossTies = new Array(n).fill(0);
  const sameTies = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (const j of und[i]) {
      if (!vote[i] || !vote[j]) continue;
      if (vote[i] === vote[j]) sameTies[i]++;
      else crossTies[i]++;
      if (i < j && vote[i] === vote[j]) same++;
      else if (i < j) cross++;
    }
  }
  // Newman's assortativity for a 2-category attribute: (sum e_ii - sum a_i^2) / (1 - sum a_i^2).
  const ends = { red: 0, green: 0 };
  for (let i = 0; i < n; i++) {
    for (const j of und[i]) {
      if (!vote[i] || !vote[j] || i > j) continue;
      ends[vote[i]!]++;
      ends[vote[j]!]++;
    }
  }
  const totalEnds = ends.red + ends.green;
  const expected = totalEnds ? (ends.red / totalEnds) ** 2 + (ends.green / totalEnds) ** 2 : 0;
  const observed = same + cross ? same / (same + cross) : 0;
  const assortativity = expected < 1 ? (observed - expected) / (1 - expected) : 0;

  const mixing = { rr: 0, rg: 0, gr: 0, gg: 0 };
  for (let a = 0; a < n; a++) {
    for (const b of out[a]) {
      if (!vote[a] || !vote[b]) continue;
      const key = `${vote[a]![0]}${vote[b]![0]}` as keyof typeof mixing;
      mixing[key]++;
    }
  }

  // Invite tree: direct invites, everyone downstream, and generation depth.
  const children: number[][] = members.map(() => []);
  members.forEach((x, i) => {
    const p = x.invitedBy ? index.get(x.invitedBy) : undefined;
    if (p != null && p !== i) children[p].push(i);
  });
  const cascade = new Array(n).fill(-1);
  const sizeOf = (i: number, seen = new Set<number>()): number => {
    if (cascade[i] >= 0) return cascade[i];
    if (seen.has(i)) return 0; // guards against a cycle in bad data
    seen.add(i);
    cascade[i] = children[i].reduce((s, c) => s + 1 + sizeOf(c, seen), 0);
    return cascade[i];
  };
  const depthOf = (i: number) => {
    let d = 0;
    const seen = new Set([i]);
    for (let p = members[i].invitedBy ? index.get(members[i].invitedBy!) : undefined; p != null && !seen.has(p); ) {
      seen.add(p);
      d++;
      p = members[p].invitedBy ? index.get(members[p].invitedBy!) : undefined;
    }
    return d;
  };

  const pos = layout(und, community, n);
  const nodes: AnalyzedNode[] = members.map((x, i) => {
    let mutual = 0;
    for (const j of out[i]) if (out[j].has(i)) mutual++;
    return {
      ...x,
      inDeg: inn[i].size,
      outDeg: out[i].size,
      mutual,
      pagerank: pagerank[i],
      betweenness: betweenness[i],
      closeness: closeness[i],
      core: core[i],
      clustering: clustering[i],
      community: community[i],
      crossTies: crossTies[i],
      sameTies: sameTies[i],
      invites: children[i].length,
      cascade: sizeOf(i),
      depth: depthOf(i),
      x: pos[i].x,
      y: pos[i].y,
    };
  });

  const edges: GraphAnalysis["edges"] = [];
  let mutualPairs = 0;
  for (let a = 0; a < n; a++) {
    for (const b of out[a]) {
      const both = out[b].has(a);
      if (both && b < a) continue; // one edge per mutual pair
      if (both) mutualPairs++;
      edges.push({ source: members[a].id, target: members[b].id, mutual: both });
    }
  }
  const nonIsolated = und.filter((x) => x.length).length;
  const sizes = comps.filter((c) => c > 1);
  return {
    nodes,
    edges,
    stats: {
      members: n,
      edges: m,
      mutualPairs,
      isolated: n - nonIsolated,
      density: n > 1 ? m / (n * (n - 1)) : 0,
      reciprocity: m ? (2 * mutualPairs) / m : 0,
      avgClustering: nonIsolated ? clustering.reduce((s, c, i) => s + (und[i].length ? c : 0), 0) / nonIsolated : 0,
      components: sizes.length,
      giant: Math.max(0, ...comps),
      diameter,
      avgPath,
      communities: new Set(community.filter((_, i) => und[i].length)).size,
      modularity,
      maxCore: Math.max(0, ...core),
      homophily: { same, cross, assortativity },
      mixing,
    },
  };
}

function pageRank(out: Set<number>[], n: number, d = 0.85, iters = 60) {
  let pr = new Array(n).fill(1 / n);
  for (let k = 0; k < iters; k++) {
    const next = new Array(n).fill((1 - d) / n);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (!out[i].size) dangling += pr[i];
      else for (const j of out[i]) next[j] += (d * pr[i]) / out[i].size;
    }
    for (let i = 0; i < n; i++) next[i] += (d * dangling) / n;
    pr = next;
  }
  return pr;
}

/** Brandes betweenness + harmonic closeness + diameter/avg shortest path, all from one BFS per node. */
function paths(adj: number[][], n: number) {
  const bc = new Array(n).fill(0);
  const closeness = new Array(n).fill(0);
  let diameter = 0;
  let sum = 0;
  let pairs = 0;
  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const preds: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const queue = [s];
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          preds[w].push(v);
        }
      }
    }
    for (const v of queue) {
      if (v === s) continue;
      closeness[s] += 1 / dist[v];
      diameter = Math.max(diameter, dist[v]);
      sum += dist[v];
      pairs++;
    }
    const delta = new Array(n).fill(0);
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) bc[w] += delta[w];
    }
  }
  // Undirected: each pair counted twice; normalize by (n-1)(n-2).
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;
  return {
    betweenness: bc.map((b) => b / norm),
    closeness: closeness.map((c) => (n > 1 ? c / (n - 1) : 0)),
    diameter,
    avgPath: pairs ? sum / pairs : 0,
  };
}

function kCore(adj: number[][], n: number) {
  const deg = adj.map((a) => a.length);
  const core = new Array(n).fill(0);
  const removed = new Array(n).fill(false);
  for (let k = 0, left = n; left > 0; k++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        if (removed[i] || deg[i] > k) continue;
        removed[i] = true;
        core[i] = k;
        left--;
        changed = true;
        for (const j of adj[i]) deg[j]--;
      }
    }
  }
  return core;
}

function localClustering(nb: number[], adj: number[][]) {
  if (nb.length < 2) return 0;
  const set = new Set(nb);
  let links = 0;
  for (const a of nb) for (const b of adj[a]) if (set.has(b)) links++;
  return links / (nb.length * (nb.length - 1)); // links counted twice, over 2 * C(k,2)
}

/** Louvain modularity optimization (local moves + aggregation); communities renumbered by size (0 = biggest). */
export function louvain(adj: number[][], n: number) {
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

function modularityOf(adj: number[][], comm: number[], n: number) {
  const m2 = adj.reduce((s, a) => s + a.length, 0);
  if (!m2) return 0;
  let q = 0;
  const degSum = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    degSum.set(comm[i], (degSum.get(comm[i]) ?? 0) + adj[i].length);
    for (const j of adj[i]) if (comm[i] === comm[j]) q += 1;
  }
  q /= m2;
  for (const d of degSum.values()) q -= (d / m2) ** 2;
  return q;
}

function components(adj: number[][], n: number) {
  const seen = new Array(n).fill(false);
  const sizes: number[] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = true;
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      for (const j of adj[q[i]]) {
        if (seen[j]) continue;
        seen[j] = true;
        q.push(j);
      }
    }
    sizes.push(q.length);
  }
  return sizes;
}

/** Force layout, communities pulled toward their own spot on a ring; isolated members orbit outside. */
function layout(adj: number[][], comm: number[], n: number) {
  type P = SimulationNodeDatum & { i: number };
  const groups = Math.max(1, new Set(comm).size);
  const anchor = (c: number) => {
    const a = (2 * Math.PI * c) / Math.min(groups, 8);
    const r = c === 0 ? 0 : 260;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };
  let isolated = 0;
  const pts: P[] = Array.from({ length: n }, (_, i) => {
    if (!adj[i].length) {
      const a = isolated++ * 2.39996; // golden angle
      return { i, x: Math.cos(a) * 700, y: Math.sin(a) * 700, fx: Math.cos(a) * (650 + (isolated % 3) * 40), fy: Math.sin(a) * (650 + (isolated % 3) * 40) };
    }
    const p = anchor(comm[i] % 8);
    return { i, x: p.x + ((i * 37) % 50) - 25, y: p.y + ((i * 91) % 50) - 25 };
  });
  const links: { source: number; target: number }[] = [];
  for (let i = 0; i < n; i++) for (const j of adj[i]) if (i < j) links.push({ source: i, target: j });
  forceSimulation(pts)
    .force("link", forceLink(links).distance(60).strength(0.3))
    .force("charge", forceManyBody().strength(-160))
    .force("collide", forceCollide(18))
    .force("x", forceX<P>((p) => anchor(comm[p.i] % 8).x).strength(0.05))
    .force("y", forceY<P>((p) => anchor(comm[p.i] % 8).y).strength(0.05))
    .stop()
    .tick(320);
  return pts.map((p) => ({ x: Math.round(p.x ?? 0), y: Math.round(p.y ?? 0) }));
}
