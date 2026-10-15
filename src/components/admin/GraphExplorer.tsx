"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, MiniMap, ReactFlow, useNodesState, type Edge } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { AnalyzedNode, GraphAnalysis } from "@/lib/graph";
import { sharePath } from "@/lib/links";
import { communityColor, METRICS, metric, voteColor, voteLabel, type MetricKey } from "./metrics";
import { nodeTypes, type PersonFlowNode } from "./PersonNode";

const sizeFor = (t: number) => 18 + 46 * Math.sqrt(t);

/** The members' follow graph: force layout from the server, colored by side or community, sized by a metric. */
export function GraphExplorer({ graph, base }: { graph: GraphAnalysis; base: string }) {
  const [colorBy, setColorBy] = useState<"vote" | "community">("vote");
  const [sizeBy, setSizeBy] = useState<MetricKey>("pagerank");
  const [mutualOnly, setMutualOnly] = useState(false);
  const [hideIsolated, setHideIsolated] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [graph]);
  const max = useMemo(() => Math.max(1e-9, ...graph.nodes.map((n) => n[sizeBy])), [graph, sizeBy]);
  const top = useMemo(() => new Set([...graph.nodes].sort((a, b) => b[sizeBy] - a[sizeBy]).slice(0, 12).map((n) => n.id)), [graph, sizeBy]);

  const [nodes, setNodes, onNodesChange] = useNodesState<PersonFlowNode>(
    graph.nodes.map((p) => {
      const size = sizeFor(p.pagerank / Math.max(1e-9, ...graph.nodes.map((n) => n.pagerank)));
      return {
        id: p.id,
        type: "person",
        hidden: !neighbors.has(p.id), // isolated members start hidden, so the first fit frames the graph
        position: { x: p.x - size / 2, y: p.y - size / 2 },
        data: { p, size, color: voteColor(p), dashed: p.vote === "red" },
      };
    }),
  );

  const q = query.trim().replace(/^@/, "").toLowerCase();
  useEffect(() => {
    const near = selected ? neighbors.get(selected) : null;
    setNodes((ns) =>
      ns.map((n) => {
        const p = n.data.p;
        const size = sizeFor(p[sizeBy] / max);
        const isolated = !neighbors.has(p.id);
        const match = q && p.username.toLowerCase().includes(q);
        return {
          ...n,
          hidden: hideIsolated && isolated,
          // Positions are the node's center; React Flow places the top-left corner.
          position: n.data.size === size ? n.position : { x: n.position.x + n.data.size / 2 - size / 2, y: n.position.y + n.data.size / 2 - size / 2 },
          data: {
            p,
            size,
            color: colorBy === "vote" ? voteColor(p) : communityColor(p.community),
            dashed: colorBy === "vote" && p.vote === "red",
            dim: q ? !match : selected ? selected !== p.id && !near?.has(p.id) : false,
            label: q ? !!match : selected ? near?.has(p.id) || selected === p.id : top.has(p.id),
          },
        };
      }),
    );
  }, [colorBy, sizeBy, selected, q, hideIsolated, max, neighbors, top, setNodes]);

  const edges: Edge[] = useMemo(
    () =>
      graph.edges
        .filter((e) => !mutualOnly || e.mutual)
        .map((e) => {
          const lit = selected && (e.source === selected || e.target === selected);
          return {
            id: `${e.source}-${e.target}`,
            source: e.source,
            target: e.target,
            type: "straight",
            animated: !!lit,
            style: {
              stroke: lit ? "var(--fg)" : "var(--subtle)",
              strokeOpacity: selected ? (lit ? 0.9 : 0.04) : e.mutual ? 0.35 : 0.15,
              strokeWidth: lit ? 1.5 : e.mutual ? 1.2 : 0.8,
            },
          };
        }),
    [graph, mutualOnly, selected],
  );

  const sel = selected ? byId.get(selected) : null;
  const communities = useMemo(() => {
    const c = new Map<number, number>();
    for (const n of graph.nodes) if (neighbors.has(n.id)) c.set(n.community, (c.get(n.community) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => a[0] - b[0]);
  }, [graph, neighbors]);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div data-tour="graph-controls" className="flex flex-wrap items-center gap-2 border-b border-line p-2 text-sm">
          <Segmented
            value={colorBy}
            onChange={setColorBy}
            options={[
              { value: "vote", label: "Cor: voto" },
              { value: "community", label: "Cor: comunidade" },
            ]}
          />
          <select value={sizeBy} onChange={(e) => setSizeBy(e.target.value as MetricKey)} className="rounded-lg border border-line bg-bg px-2 py-1">
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                Tamanho: {m.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-subtle">
            <input type="checkbox" checked={mutualOnly} onChange={(e) => setMutualOnly(e.target.checked)} /> só mútuos
          </label>
          <label className="flex items-center gap-1 text-subtle">
            <input type="checkbox" checked={hideIsolated} onChange={(e) => setHideIsolated(e.target.checked)} /> esconder isolados
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar @"
            className="ml-auto w-32 rounded-lg border border-line bg-bg px-2 py-1"
          />
        </div>
        <div data-tour="graph-canvas" className="h-[70vh] min-h-[420px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => setSelected((s) => (s === n.id ? null : n.id))}
            onPaneClick={() => setSelected(null)}
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
        <div className="flex flex-wrap gap-3 border-t border-line p-2 text-xs text-subtle">
          {colorBy === "vote" ? (
            <>
              <LegendDot color="var(--green)" label="Verde" />
              <LegendDot color="var(--red)" label="Vermelho (anel tracejado)" dashed />
              <LegendDot color="var(--none)" label="Sem voto" />
            </>
          ) : (
            communities.slice(0, 9).map(([c, count]) => (
              <LegendDot key={c} color={communityColor(c)} label={c < 8 ? `Comunidade ${c + 1} (${count})` : "Outras"} />
            ))
          )}
          <span className="ml-auto">Tamanho = {metric(sizeBy).label}. Clique numa pessoa para ver as ligações.</span>
        </div>
      </div>
      <aside data-tour="graph-side" className="grid content-start gap-3">
        {sel ? <NodeDetails n={sel} all={graph.nodes} base={base} /> : <p className="rounded-2xl border border-line bg-card p-4 text-sm text-subtle">{metric(sizeBy).desc}</p>}
      </aside>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full" style={{ border: `2px ${dashed ? "dashed" : "solid"} ${color}`, background: dashed ? undefined : color }} />
      {label}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-0.5 ${o.value === value ? "bg-fg text-bg" : "text-subtle"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One member's numbers, each with their rank among all members. */
export function NodeDetails({ n, all, base }: { n: AnalyzedNode; all: AnalyzedNode[]; base: string }) {
  const rank = (k: MetricKey) => 1 + all.filter((x) => x[k] > n[k]).length;
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        {n.avatar ? <img src={n.avatar} alt="" className="h-12 w-12 rounded-full" /> : <span className="h-12 w-12 rounded-full bg-muted" />}
        <div className="min-w-0">
          <div className="truncate font-semibold">{n.name}</div>
          <a href={sharePath(n.username)} className="text-sm text-subtle underline">
            @{n.username}
          </a>
          <div className="text-xs font-semibold" style={{ color: voteColor(n) }}>
            {voteLabel(n)}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 text-sm">
        {METRICS.map((m) => (
          <div key={m.key} className="contents" title={m.desc}>
            <dt className="text-subtle">{m.label}</dt>
            <dd className="text-right font-semibold tabular-nums">{m.fmt(n[m.key])}</dd>
            <dd className="text-right text-xs text-subtle tabular-nums">#{rank(m.key)}</dd>
          </div>
        ))}
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-line pt-3 text-xs">
        <dt className="text-subtle">Segue (membros)</dt>
        <dd className="text-right tabular-nums">{n.outDeg}</dd>
        <dt className="text-subtle">Mútuos</dt>
        <dd className="text-right tabular-nums">{n.mutual}</dd>
        <dt className="text-subtle">Agrupamento</dt>
        <dd className="text-right tabular-nums">{(n.clustering * 100).toFixed(0)}%</dd>
        <dt className="text-subtle">Comunidade</dt>
        <dd className="text-right tabular-nums">{n.community + 1}</dd>
        <dt className="text-subtle">Convidou direto</dt>
        <dd className="text-right tabular-nums">{n.invites}</dd>
        <dt className="text-subtle">Geração no convite</dt>
        <dd className="text-right tabular-nums">{n.depth}</dd>
        <dt className="text-subtle">Segue no X (total)</dt>
        <dd className="text-right tabular-nums">{n.following.toLocaleString("pt-BR")}</dd>
        <dt className="text-subtle">Seguidores no X (conhecidos)</dt>
        <dd className="text-right tabular-nums">{n.followers.toLocaleString("pt-BR")}</dd>
      </dl>
      <a href={`${base}/centro?u=${encodeURIComponent(n.username)}`} className="mt-3 block text-sm underline">
        Ver a rede a partir desta pessoa →
      </a>
    </div>
  );
}
