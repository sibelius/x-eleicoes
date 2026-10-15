"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, ReactFlow, type Edge } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { GraphAnalysis } from "@/lib/graph";
import { HBars } from "./Card";
import { NodeDetails } from "./GraphExplorer";
import { voteColor } from "./metrics";
import { nodeTypes, type PersonFlowNode } from "./PersonNode";

const RING = 170;

/** Everyone placed on rings by degrees of separation from one person; spokes are the shortest-path tree. */
export function Constellation({ graph, center }: { graph: GraphAnalysis; center: string }) {
  const router = useRouter();
  const [allEdges, setAllEdges] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const { dist, parent, rings } = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
      adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
    }
    const dist = new Map([[center, 0]]);
    const parent = new Map<string, string>();
    const queue = [center];
    for (let i = 0; i < queue.length; i++) {
      // Visit stronger neighbors first so each spoke hangs from the most central parent.
      const next = [...(adj.get(queue[i]) ?? [])].sort((a, b) => byId.get(b)!.pagerank - byId.get(a)!.pagerank);
      for (const w of next) {
        if (dist.has(w)) continue;
        dist.set(w, dist.get(queue[i])! + 1);
        parent.set(w, queue[i]);
        queue.push(w);
      }
    }
    const rings = new Map<number, string[]>();
    for (const [id, d] of dist) rings.set(d, [...(rings.get(d) ?? []), id]);
    return { dist, parent, rings };
  }, [graph, center, byId]);

  const nodes: PersonFlowNode[] = useMemo(() => {
    const out: PersonFlowNode[] = [];
    const angle = new Map<string, number>([[center, 0]]);
    const maxD = Math.max(0, ...rings.keys());
    let radius = 0;
    for (let d = 0; d <= maxD; d++) {
      // Keep children near their parent's angle, then by side so Red and Green form arcs.
      const ids = [...(rings.get(d) ?? [])].sort((a, b) => {
        const pa = angle.get(parent.get(a) ?? "") ?? 0;
        const pb = angle.get(parent.get(b) ?? "") ?? 0;
        return pa - pb || (byId.get(a)!.vote ?? "z").localeCompare(byId.get(b)!.vote ?? "z");
      });
      const size = d === 0 ? 72 : d === 1 ? 40 : 28;
      // Each ring is big enough for its people side by side, and at least a step out from the last.
      if (d > 0) radius = Math.max(radius + RING, (ids.length * (size + 10)) / (2 * Math.PI));
      ids.forEach((id, i) => {
        const a = d === 0 ? 0 : (2 * Math.PI * i) / ids.length;
        angle.set(id, a);
        const p = byId.get(id)!;
        out.push({
          id,
          type: "person",
          position: { x: Math.cos(a) * radius - size / 2, y: Math.sin(a) * radius - size / 2 },
          data: { p, size, color: voteColor(p), dashed: p.vote === "red", label: ids.length <= 40, badge: d ? String(d) : undefined },
        });
      });
    }
    return out;
  }, [rings, parent, byId, center]);

  const edges: Edge[] = useMemo(() => {
    const tree = [...parent.entries()].map(([child, par]) => ({
      id: `t-${par}-${child}`,
      source: par,
      target: child,
      type: "straight",
      style: { stroke: "var(--subtle)", strokeOpacity: 0.5, strokeWidth: 1 },
    }));
    if (!allEdges) return tree;
    return [
      ...tree,
      ...graph.edges
        .filter((e) => dist.has(e.source) && dist.has(e.target) && parent.get(e.target) !== e.source && parent.get(e.source) !== e.target)
        .map((e) => ({
          id: `e-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          type: "straight",
          style: { stroke: "var(--subtle)", strokeOpacity: 0.08, strokeWidth: 0.8 },
        })),
    ];
  }, [parent, graph, allEdges, dist]);

  const shown = byId.get(picked ?? center)!;
  const unreachable = graph.nodes.length - dist.size;
  const ringCounts = [...rings.entries()].filter(([d]) => d > 0).sort((a, b) => a[0] - b[0]);
  const centerOptions = [...graph.nodes].sort((a, b) => b.pagerank - a.pagerank).slice(0, 40);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2 text-sm">
          <select
            value={byId.get(center)!.username}
            onChange={(e) => router.push(`/admin/centro?u=${encodeURIComponent(e.target.value)}`, { scroll: false })}
            className="rounded-lg border border-line bg-bg px-2 py-1"
          >
            {!centerOptions.some((n) => n.id === center) && <option value={byId.get(center)!.username}>@{byId.get(center)!.username}</option>}
            {centerOptions.map((n, i) => (
              <option key={n.id} value={n.username}>
                Centro: @{n.username} (PageRank #{i + 1})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-subtle">
            <input type="checkbox" checked={allEdges} onChange={(e) => setAllEdges(e.target.checked)} /> todas as ligações
          </label>
          <span className="ml-auto text-xs text-subtle">Anéis = graus de separação. Clique duplo recentraliza.</span>
        </div>
        <div className="h-[70vh] min-h-[420px]">
          <ReactFlow
            key={center}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => setPicked(n.id)}
            onNodeDoubleClick={(_, n) => router.push(`/admin/centro?u=${encodeURIComponent(byId.get(n.id)!.username)}`, { scroll: false })}
            nodesConnectable={false}
            fitView
            minZoom={0.05}
            proOptions={{ hideAttribution: true }}
            colorMode="system"
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      <aside className="grid content-start gap-3">
        <NodeDetails n={shown} all={graph.nodes} />
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="text-sm font-semibold">Quantos a cada distância</h3>
          <div className="mt-2">
            <HBars rows={ringCounts.map(([d, ids]) => ({ label: d === 1 ? "1 passo" : `${d} passos`, value: ids.length }))} />
          </div>
          {unreachable > 0 && <p className="mt-2 text-xs text-subtle">{unreachable} membros não têm caminho até aqui.</p>}
        </div>
      </aside>
    </div>
  );
}
