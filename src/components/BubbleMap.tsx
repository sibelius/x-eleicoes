"use client";

import { useEffect, useMemo, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { BubbleMap } from "@/lib/bubble-map";
import type { Me, NetworkNode } from "@/lib/network";
import { PanZoomControls, fitBox, usePanZoom } from "./pan-zoom";

// "Mapa": the bubble as a network. Same people as the bubble, a line for who follows whom among them,
// laid out by forces (linked people pull together, everyone pushes apart), so groups form clusters.

/** What the bubble card gives each of its SVG views. */
export type CanvasProps = {
  me: Me | null;
  /** The people shown (after the filter). */
  nodes: NetworkNode[];
  space: { w: number; h: number };
  full: boolean;
  title: string;
  selected: NetworkNode | null;
  online: Set<string>;
  resetKey: number;
  /** Tap on someone; true = zoom onto them. */
  onPick: (n: NetworkNode) => boolean;
  onHover: (n: NetworkNode | null, e?: React.PointerEvent) => void;
  onReset: () => void;
};

type Dot = SimulationNodeDatum & { n: NetworkNode; r: number; deg: number; g: number; i: number };
type Link = SimulationLinkDatum<Dot> & { mutual: boolean };

function sideColor(n: NetworkNode) {
  return n.vote === "red" ? "var(--red)" : n.vote === "green" ? "var(--green)" : "var(--none)";
}

/** Lays the map out (synchronously, ~300 ticks; a few hundred dots take well under a second). */
function layOut(nodes: NetworkNode[], map: BubbleMap, space: { w: number; h: number }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dots: Dot[] = [];
  const at = new Map<number, Dot>(); // map index → dot
  map.ids.forEach((id, i) => {
    const n = byId.get(id);
    if (n) at.set(i, dots[dots.push({ n, r: 0, deg: 0, g: map.groups[i], i }) - 1]);
  });
  const links: Link[] = [];
  for (const [a, b, mutual] of map.links) {
    const s = at.get(a);
    const t = at.get(b);
    if (!s || !t) continue;
    s.deg++;
    t.deg++;
    links.push({ source: s, target: t, mutual: mutual === 1 });
  }
  const { w, h } = space;
  // Communities start on a spiral, each around its own spot, so the forces only have to refine.
  const groups = Math.max(1, ...dots.map((d) => d.g + 1));
  for (const d of dots) {
    d.r = d.n.member ? Math.min(20, 5 + Math.sqrt(d.deg) * 1.8) : Math.min(12, 2.5 + Math.sqrt(d.deg) * 1.1);
    const ga = d.g * 2.4;
    const gr = Math.sqrt(d.g / groups) * Math.min(w, h) * 0.4;
    d.x = w / 2 + Math.cos(ga) * gr + Math.cos(d.i * 1.7) * 20;
    d.y = h / 2 + Math.sin(ga) * gr + Math.sin(d.i * 1.7) * 20;
  }
  // Pull each dot toward its community's middle (only real groups: 3+ people).
  const size = new Map<number, number>();
  for (const d of dots) size.set(d.g, (size.get(d.g) ?? 0) + 1);
  const cluster = (alpha: number) => {
    const c = new Map<number, { x: number; y: number; n: number }>();
    for (const d of dots) {
      const s = c.get(d.g) ?? { x: 0, y: 0, n: 0 };
      s.x += d.x!;
      s.y += d.y!;
      s.n++;
      c.set(d.g, s);
    }
    for (const d of dots) {
      if (size.get(d.g)! < 3) continue;
      const s = c.get(d.g)!;
      d.vx! += (s.x / s.n - d.x!) * alpha * 0.12;
      d.vy! += (s.y / s.n - d.y!) * alpha * 0.12;
    }
  };
  forceSimulation(dots)
    .force(
      "link",
      forceLink<Dot, Link>(links)
        .distance((l) => ((l.source as Dot).g === (l.target as Dot).g ? 26 : 60))
        .strength((l) => ((l.source as Dot).g === (l.target as Dot).g ? 0.5 : 0.08) / Math.sqrt(Math.min((l.source as Dot).deg, (l.target as Dot).deg) || 1)),
    )
    .force("charge", forceManyBody<Dot>().strength((d) => -18 - d.r * 2).distanceMax(260))
    .force("cluster", cluster)
    // Keeps people with no links nearby instead of drifting off.
    .force("x", forceX<Dot>(w / 2).strength(w < h ? 0.07 : 0.04))
    .force("y", forceY<Dot>(h / 2).strength(w < h ? 0.04 : 0.07))
    .force("collide", forceCollide<Dot>((d) => d.r + 1.5).iterations(2))
    .stop()
    .tick(300);
  return { dots, links };
}

/** A soft circle around each sizable community, named after its best-connected member. */
function hullsOf(dots: Dot[]) {
  const by = new Map<number, Dot[]>();
  for (const d of dots) by.set(d.g, [...(by.get(d.g) ?? []), d]);
  return [...by.entries()]
    .filter(([, ds]) => ds.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([g, ds]) => {
      const x = ds.reduce((s, d) => s + d.x!, 0) / ds.length;
      const y = ds.reduce((s, d) => s + d.y!, 0) / ds.length;
      const dist = ds.map((d) => Math.hypot(d.x! - x, d.y! - y) + d.r).sort((a, b) => a - b);
      const r = dist[Math.floor(dist.length * 0.85)] + 8;
      const hub = [...ds].filter((d) => d.n.username).sort((a, b) => b.deg - a.deg || Number(b.n.member) - Number(a.n.member))[0];
      return { g, x, y, r, label: hub ? `@${hub.n.username}` : null, red: ds.filter((d) => d.n.vote === "red").length, green: ds.filter((d) => d.n.vote === "green").length };
    });
}

export function NetworkMap(p: CanvasProps) {
  const { me, nodes, space, full, title, selected, online, resetKey, onPick, onHover, onReset } = p;
  const key = me?.id ?? "";
  const [data, setData] = useState<{ key: string; map: BubbleMap | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/bubble-map${me ? `?u=${encodeURIComponent(me.id)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((map: BubbleMap) => live && setData({ key, map }))
      .catch(() => live && setData({ key, map: null }));
    return () => {
      live = false;
    };
  }, [me, key]);
  const map = data?.key === key ? data.map : undefined;

  const laid = useMemo(() => (map ? layOut(nodes, map, space) : null), [map, nodes, space]);
  const hulls = useMemo(() => (laid ? hullsOf(laid.dots) : []), [laid]);
  const box = useMemo(() => fitBox(laid?.dots ?? null, space, 8), [laid, space]);
  const pz = usePanZoom(box, full, { onDragStart: () => onHover(null), resetKey });
  const focused = selected ? laid?.dots.find((d) => d.n.id === selected.id) : undefined;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const lit = focused?.n.id ?? hoverId;

  const paths = useMemo(() => {
    if (!laid) return { mutual: "", oneWay: "" };
    const seg = (l: Link) => {
      const s = l.source as Dot;
      const t = l.target as Dot;
      return `M${s.x!.toFixed(1)} ${s.y!.toFixed(1)}L${t.x!.toFixed(1)} ${t.y!.toFixed(1)}`;
    };
    return {
      mutual: laid.links.filter((l) => l.mutual).map(seg).join(""),
      oneWay: laid.links.filter((l) => !l.mutual).map(seg).join(""),
    };
  }, [laid]);
  const litLinks = useMemo(
    () => (laid && lit ? laid.links.filter((l) => (l.source as Dot).n.id === lit || (l.target as Dot).n.id === lit) : []),
    [laid, lit],
  );

  if (data?.key !== key) {
    return <div className={`shimmer w-full rounded-xl ${full ? "absolute inset-0" : "aspect-[4/3]"}`} aria-label="Carregando o mapa" />;
  }
  if (!map || !laid) {
    return <p className="py-16 text-center text-sm text-subtle">Não deu para carregar o mapa agora. Tente de novo daqui a pouco.</p>;
  }
  // Avatars only on the bigger member dots (an image per dot gets heavy on big bubbles).
  const photos = laid.dots.filter((d) => d.n.member && d.n.avatar && d.r >= 7).slice(0, 200);
  const withPhoto = new Set(photos.map((d) => d.n.id));

  return (
    <>
      <svg
        {...pz.svgProps}
        className={`${full ? "absolute inset-0 h-full" : "h-auto"} w-full overflow-hidden select-none ${pz.dragging ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label={`${title}: quem segue quem`}
        onClick={(e) => e.target === e.currentTarget && !pz.moved() && onReset()}
      >
        <defs>
          {photos.map((d) => (
            <pattern key={d.n.id} id={`mav-${d.n.id}`} width="1" height="1" patternContentUnits="objectBoundingBox">
              <image href={d.n.avatar!} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ))}
        </defs>
        <g className={`bubble-zoom ${pz.dragging ? "is-dragging" : ""}`} style={pz.stageStyle}>
          {hulls.map((c) => (
            <g key={c.g} className="pointer-events-none">
              <circle cx={c.x} cy={c.y} r={c.r} fill="var(--fg)" fillOpacity={0.035} stroke="var(--line)" strokeDasharray="4 4" />
              {c.label && (
                <text x={c.x} y={c.y - c.r - 4} textAnchor="middle" className="fill-[var(--subtle)]" style={{ fontSize: 10 }}>
                  turma de {c.label}
                </text>
              )}
            </g>
          ))}
          <path d={paths.oneWay} fill="none" stroke="var(--fg)" strokeOpacity={lit ? 0.04 : 0.09} strokeWidth={0.6} />
          <path d={paths.mutual} fill="none" stroke="var(--fg)" strokeOpacity={lit ? 0.07 : 0.2} strokeWidth={0.9} />
          {litLinks.map((l, i) => {
            const s = l.source as Dot;
            const t = l.target as Dot;
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="var(--accent)" strokeOpacity={0.75} strokeWidth={l.mutual ? 1.6 : 1} />;
          })}
          {laid.dots.map((d) => {
            const n = d.n;
            const dim = lit && lit !== n.id && !litLinks.some((l) => (l.source as Dot) === d || (l.target as Dot) === d);
            return (
              <g
                key={n.id}
                transform={`translate(${d.x!.toFixed(1)} ${d.y!.toFixed(1)})`}
                opacity={dim ? 0.3 : n.member ? 1 : 0.8}
                className="cursor-pointer"
                onClick={() => {
                  if (pz.moved()) return;
                  if (onPick(n)) pz.focus(d.x!, d.y!, d.r, 2.2);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse" || pz.pressed()) return;
                  setHoverId(n.id);
                  onHover(n, e);
                }}
                onPointerLeave={() => {
                  setHoverId((h) => (h === n.id ? null : h));
                  onHover(null);
                }}
              >
                <circle
                  r={d.r}
                  fill={withPhoto.has(n.id) ? `url(#mav-${n.id})` : sideColor(n)}
                  stroke={withPhoto.has(n.id) ? sideColor(n) : n.member ? "var(--card)" : "none"}
                  strokeWidth={withPhoto.has(n.id) ? Math.max(1.5, d.r * 0.2) : 1}
                />
                {online.has(n.id) && (
                  <circle cx={d.r * 0.7} cy={-d.r * 0.7} r={Math.max(2.5, d.r * 0.3)} fill="var(--accent)" stroke="var(--card)" strokeWidth={1} />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <PanZoomControls pz={pz} onReset={onReset} />
      {(laid.links.length === 0 || map.cut > 0) && (
        <p className="pointer-events-none absolute inset-x-12 top-1 text-center text-xs text-subtle">
          {laid.links.length === 0
            ? "Ainda não sabemos quem segue quem aqui dentro: as linhas aparecem quando mais gente entra no app."
            : `Mostrando as ${map.ids.length} pessoas mais conectadas (de ${map.ids.length + map.cut}).`}
        </p>
      )}
    </>
  );
}
