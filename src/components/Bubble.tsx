"use client";

import { useEffect, useMemo, useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Me, NetworkNode } from "@/lib/network";
import { inviteTweetUrl, profileUrl } from "@/lib/links";

const W = 760;
const H = 520;

type SimNode = SimulationNodeDatum & { n: NetworkNode | null; r: number };

function color(n: NetworkNode | null, me: Me) {
  const vote = n ? n.vote : me.vote;
  if (vote === "lula") return "var(--lula)";
  if (vote === "bolsonaro") return "var(--bolso)";
  return "var(--none)";
}

function targetX(n: NetworkNode | null) {
  if (!n) return W / 2;
  if (n.vote === "lula") return W * 0.28;
  if (n.vote === "bolsonaro") return W * 0.72;
  return W / 2;
}

function initials(name: string | null) {
  return (name ?? "?").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function Bubble({ me, nodes, shareBase }: { me: Me; nodes: NetworkNode[]; shareBase: string }) {
  const [layout, setLayout] = useState<SimNode[] | null>(null);
  const box = useMemo(() => {
    if (!layout) return { x: 0, y: 0, w: W, h: H };
    const pad = 12;
    const x0 = Math.min(...layout.map((d) => d.x! - d.r)) - pad;
    const x1 = Math.max(...layout.map((d) => d.x! + d.r)) + pad;
    const y0 = Math.min(...layout.map((d) => d.y! - d.r)) - pad - 28;
    const y1 = Math.max(...layout.map((d) => d.y! + d.r)) + pad;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [layout]);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [filter, setFilter] = useState<"all" | "members" | "mutual">("all");

  const visible = useMemo(
    () =>
      nodes.filter((n) =>
        filter === "members" ? n.member : filter === "mutual" ? n.following && n.follower : true,
      ),
    [nodes, filter],
  );

  useEffect(() => {
    const sim: SimNode[] = [
      { n: null, r: 30, x: W / 2, y: H / 2, fx: W / 2, fy: H / 2 },
      ...visible.map((n, i) => ({
        n,
        r: n.member ? 12 + n.strength * 3 : 3 + n.strength * 1.5,
        x: W / 2 + Math.cos(i) * 120,
        y: H / 2 + Math.sin(i) * 120,
      })),
    ];
    forceSimulation(sim)
      .force("x", forceX<SimNode>((d) => targetX(d.n)).strength((d) => (d.n?.vote ? 0.12 : 0.05)))
      .force("y", forceY<SimNode>(H / 2).strength(0.07))
      .force("collide", forceCollide<SimNode>((d) => d.r + 2).iterations(3))
      .stop()
      .tick(320);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- layout is computed client-side to avoid hydration mismatch
    setLayout(sim);
  }, [visible]);

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Sua bolha</h2>
        <div className="flex gap-1 text-sm">
          {(
            [
              ["all", "Todos"],
              ["mutual", "Mútuos"],
              ["members", "Já no app"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 ${filter === k ? "bg-fg text-bg" : "bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-subtle">
        <Legend c="var(--lula)" label="Lula" />
        <Legend c="var(--bolso)" label="Bolsonaro" />
        <Legend c="var(--none)" label="Ainda não votou" />
        <span>Bolinhas pequenas = ainda não entraram no app</span>
      </div>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="h-auto w-full touch-manipulation" role="img" aria-label="Grafo da sua rede">
        <defs>
          {layout?.map((d) =>
            d.n?.avatar ? (
              <pattern key={d.n.id} id={`av-${d.n.id}`} width="1" height="1" patternContentUnits="objectBoundingBox">
                <image href={d.n.avatar} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
              </pattern>
            ) : null,
          )}
        </defs>
        <text x={W * 0.28} y={box.y + 20} textAnchor="middle" className="fill-[var(--lula)] text-base font-bold">
          Lula
        </text>
        <text x={W * 0.72} y={box.y + 20} textAnchor="middle" className="fill-[var(--bolso)] text-base font-bold">
          Bolsonaro
        </text>
        {layout?.map((d) => {
          const n = d.n;
          const fill = n?.avatar ? `url(#av-${n.id})` : color(n, me);
          return (
            <g
              key={n?.id ?? "me"}
              transform={`translate(${d.x},${d.y})`}
              onClick={() => n && setSelected(n)}
              className={n ? "cursor-pointer" : undefined}
            >
              <circle
                r={d.r}
                fill={fill}
                fillOpacity={n && !n.member ? 0.45 : 1}
                stroke={n?.avatar || !n ? color(n, me) : "var(--card)"}
                strokeWidth={n?.avatar || !n ? 3 : 1}
              />
              {(n?.member || !n) && !n?.avatar && d.r > 11 && (
                <text textAnchor="middle" dy="0.35em" className="pointer-events-none fill-white text-[10px] font-bold">
                  {n ? initials(n.name) : "VOCÊ"}
                </text>
              )}
              <title>{n ? `${n.name ?? n.id}${n.username ? ` (@${n.username})` : ""}` : "Você"}</title>
            </g>
          );
        })}
      </svg>
      {selected && <NodeCard n={selected} me={me} shareBase={shareBase} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

function NodeCard({ n, me, shareBase, onClose }: { n: NetworkNode; me: Me; shareBase: string; onClose: () => void }) {
  const rel = [n.following && n.follower ? "Mútuo" : n.following ? "Você segue" : n.follower ? "Segue você" : null, n.invite ? "Convite" : null]
    .filter(Boolean)
    .join(" · ");
  const status = !n.member
    ? "Ainda não entrou no app"
    : n.vote
      ? `Vota ${n.vote === "lula" ? "Lula" : "Bolsonaro"}`
      : "Entrou mas ainda não votou";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3">
      <div>
        <div className="font-semibold">
          {n.name ?? "Conta do X"} {n.username && <span className="font-normal text-subtle">@{n.username}</span>}
        </div>
        <div className="text-sm text-subtle">
          {status} {rel && `· ${rel}`}
        </div>
      </div>
      <div className="flex gap-2 text-sm">
        {!n.voted && (
          <a
            className="rounded-full bg-fg px-3 py-1.5 text-bg"
            href={inviteTweetUrl(shareBase, me.id, n.username)}
            target="_blank"
            rel="noreferrer"
          >
            Pedir pra votar
          </a>
        )}
        <a className="rounded-full border border-line px-3 py-1.5" href={profileUrl(n)} target="_blank" rel="noreferrer">
          Ver no X
        </a>
        <button className="px-2 text-subtle" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}
