"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, MiniMap, ReactFlow, type Edge } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { AnalyzedNode } from "@/lib/graph";
import { NodeDetails } from "./GraphExplorer";
import { voteColor } from "./metrics";
import { nodeTypes, type PersonFlowNode } from "./PersonNode";

const DX = 44;

/** The invite forest as radial trees: each tree is someone who came on their own and everyone who followed their link. */
export function InviteTree({ nodes: all }: { nodes: AnalyzedNode[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const byId = useMemo(() => new Map(all.map((n) => [n.id, n])), [all]);

  const { nodes, edges } = useMemo(() => {
    const children = new Map<string, AnalyzedNode[]>();
    for (const n of all) if (n.invitedBy) children.set(n.invitedBy, [...(children.get(n.invitedBy) ?? []), n]);
    for (const list of children.values()) list.sort((a, b) => b.cascade - a.cascade || a.createdAt - b.createdAt);
    // Roots with a tree under them, biggest first; members who neither invited nor were invited are left out.
    const roots = all.filter((n) => !n.invitedBy && n.cascade > 0).sort((a, b) => b.cascade - a.cascade);
    const width = new Map<string, number>();
    const w = (n: AnalyzedNode, seen = new Set<string>()): number => {
      if (seen.has(n.id)) return 1;
      seen.add(n.id);
      const kids = children.get(n.id) ?? [];
      const v = Math.max(1, kids.reduce((s, k) => s + w(k, seen), 0));
      width.set(n.id, v);
      return v;
    };
    const maxDepth = (n: AnalyzedNode, seen = new Set<string>()): number => {
      if (seen.has(n.id)) return 0;
      seen.add(n.id);
      return Math.max(0, ...(children.get(n.id) ?? []).map((k) => 1 + maxDepth(k, seen)));
    };
    const nodes: PersonFlowNode[] = [];
    const edges: Edge[] = [];
    // Radial: each child gets an arc of its parent's sector sized by its leaf count, one ring per generation.
    const place = (n: AnalyzedNode, a0: number, a1: number, depth: number, cx: number, cy: number, step: number, seen: Set<string>) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      const a = (a0 + a1) / 2;
      const size = 28 + Math.min(40, n.cascade * 2);
      nodes.push({
        id: n.id,
        type: "person",
        position: { x: cx + Math.cos(a) * step * depth - size / 2, y: cy + Math.sin(a) * step * depth - size / 2 },
        data: { p: n, size, color: voteColor(n), dashed: n.vote === "red", label: n.cascade > 0 || depth === 0, badge: n.cascade ? String(n.cascade) : undefined },
      });
      let start = a0;
      const total = width.get(n.id) ?? 1;
      for (const k of children.get(n.id) ?? []) {
        const span = ((a1 - a0) * (width.get(k.id) ?? 1)) / total;
        edges.push({ id: `${n.id}-${k.id}`, source: n.id, target: k.id, type: "straight", style: { stroke: "var(--subtle)", strokeOpacity: 0.5 } });
        place(k, start, start + span, depth + 1, cx, cy, step, seen);
        start += span;
      }
    };
    // Trees side by side, biggest first, each as wide as its ring needs.
    let x = 0;
    const seen = new Set<string>();
    for (const r of roots) {
      const leaves = w(r);
      const step = Math.max(110, (leaves * DX) / (2 * Math.PI));
      const depth = Math.max(1, maxDepth(r));
      x += step * depth + DX;
      place(r, 0, 2 * Math.PI, 0, x, 0, step, seen);
      x += step * depth + DX;
    }
    return { nodes, edges };
  }, [all]);

  const shown = picked ? byId.get(picked) : null;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="h-[65vh] min-h-[420px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => setPicked(n.id)}
            onPaneClick={() => setPicked(null)}
            nodesConnectable={false}
            fitView
            minZoom={0.05}
            proOptions={{ hideAttribution: true }}
            colorMode="system"
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data as PersonFlowNode["data"]).color} />
          </ReactFlow>
        </div>
        <p className="border-t border-line p-2 text-xs text-subtle">
          Número no canto = cascata (todos que entraram por aquela pessoa, direta ou indiretamente). Anel tracejado = Vermelho.
        </p>
      </div>
      <aside className="grid content-start gap-3">
        {shown ? <NodeDetails n={shown} all={all} /> : <p className="rounded-2xl border border-line bg-card p-4 text-sm text-subtle">Clique em alguém para ver os números.</p>}
      </aside>
    </div>
  );
}
