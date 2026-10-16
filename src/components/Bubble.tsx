"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Me, NetworkNode, Tally } from "@/lib/network";
import { BubbleVideo } from "./BubbleVideo";
import { LiveWatchers, useLive } from "./LiveWatchers";
import { SIDE, comparePath, inviteTweetUrl, profileUrl, sharePath } from "@/lib/links";

// Layout space: landscape on wide containers, portrait on phones so dots stay big enough to read and tap.
const WIDE = { w: 760, h: 520 };
const NARROW = { w: 400, h: 620 };
const HOME = { k: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;

type SimNode = SimulationNodeDatum & { n: NetworkNode | null; r: number };

function color(n: NetworkNode | null, me: Me | null) {
  const vote = n ? n.vote : me?.vote;
  if (vote === "red") return "var(--red)";
  if (vote === "green") return "var(--green)";
  return "var(--none)";
}

function targetX(n: NetworkNode | null, w: number) {
  if (!n) return w / 2;
  if (n.vote === "red") return w * 0.28;
  if (n.vote === "green") return w * 0.72;
  // Non-voters lean toward the side of the voters connected to them (combined bubble).
  return w / 2 + (n.lean ?? 0) * w * 0.2;
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Bubble({
  me,
  nodes,
  shareBase,
  title = "Sua bolha",
  centerLabel = "VOCÊ",
  readOnly = false,
  shareUrl,
  tally,
  own = false,
}: {
  /** The owner in the middle; null for the combined bubble of everyone. */
  me: Me | null;
  nodes: NetworkNode[];
  shareBase: string;
  title?: string;
  centerLabel?: string;
  /** Public page: a visitor can look, but not ask people to vote on the owner's behalf. */
  readOnly?: boolean;
  /** X intent link to post this bubble. */
  shareUrl?: string;
  /** Enables the "make a video" button. */
  tally?: Tally;
  /** The viewer is the owner ("N people watching your bubble"). */
  own?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(WIDE);
  const [layout, setLayout] = useState<SimNode[] | null>(null);
  const box = useMemo(() => {
    if (!layout) return { x: 0, y: 0, w: space.w, h: space.h };
    const pad = 12;
    const x0 = Math.min(...layout.map((d) => d.x! - d.r)) - pad;
    const x1 = Math.max(...layout.map((d) => d.x! + d.r)) + pad;
    const y0 = Math.min(...layout.map((d) => d.y! - d.r)) - pad - 28;
    const y1 = Math.max(...layout.map((d) => d.y! + d.r)) + pad;
    // Don't blow a handful of dots up to fill the card: keep at least ~half the layout space in view.
    const w = Math.max(x1 - x0, space.w * 0.6);
    const h = Math.max(y1 - y0, space.h * 0.45);
    return { x: (x0 + x1 - w) / 2, y: (y0 + y1 - h) / 2, w, h };
  }, [layout, space]);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  // Mouse hover: a small card next to the cursor, so people are easy to tell apart without clicking.
  const [hover, setHover] = useState<{ n: NetworkNode; x: number; y: number; flip: boolean } | null>(null);
  const [full, setFull] = useState(false);
  const router = useRouter();
  // Who's looking at this bubble right now, and which members are online.
  const live = useLive(me?.id ?? "_all");
  const online = useMemo(() => new Set(live?.online ?? []), [live]);
  const onlineHere = useMemo(() => nodes.filter((n) => online.has(n.id)).length, [nodes, online]);
  const [filter, setFilter] = useState<"all" | "members" | "mutual">("all");
  const filters = me
    ? ([
        ["all", "Todos"],
        ["mutual", "Mútuos"],
        ["members", "Já no app"],
      ] as const)
    : ([
        ["all", "Todos"],
        ["members", "Já no app"],
      ] as const);

  // Fullscreen is a fixed overlay (works on iPhone, where element fullscreen doesn't): Esc closes it, the page behind doesn't scroll.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSpace(e.contentRect.width < 560 ? NARROW : WIDE));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(
    () =>
      nodes.filter((n) => (filter === "members" ? n.member : filter === "mutual" ? n.following && n.follower : true)),
    [nodes, filter],
  );

  useEffect(() => {
    const { w, h } = space;
    const sim: SimNode[] = [
      ...(me ? [{ n: null, r: 30, x: w / 2, y: h / 2, fx: w / 2, fy: h / 2 }] : []),
      ...visible.map((n, i) => ({
        n,
        r: n.member ? 12 + n.strength * 3 : 3 + n.strength * 1.5,
        x: w / 2 + Math.cos(i) * 120,
        y: h / 2 + Math.sin(i) * 120,
      })),
    ];
    forceSimulation(sim)
      .force(
        "x",
        forceX<SimNode>((d) => targetX(d.n, w)).strength((d) => (d.n?.vote ? 0.12 : 0.05)),
      )
      .force("y", forceY<SimNode>(h / 2).strength(w < h ? 0.03 : 0.07))
      .force("collide", forceCollide<SimNode>((d) => d.r + (d.n ? 2 : 10)).iterations(3))
      .stop()
      .tick(320);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- layout is computed client-side to avoid hydration mismatch
    setLayout(sim);
  }, [visible, space, me]);

  // Pan & zoom: one view transform (translate, then scale) in viewBox units, driven by drag, pinch,
  // ctrl/⌘ + wheel (trackpad pinch), the +/− buttons, and tapping someone to focus on them.
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(HOME);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ travel: 0, moved: false, dist: 0 });
  const focused = selected ? layout?.find((d) => d.n?.id === selected.id) : undefined;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  // Screen → viewBox via the SVG's own matrix, so it stays right when fullscreen letterboxes the viewBox.
  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    return { x: m.a * clientX + m.c * clientY + m.e, y: m.b * clientX + m.d * clientY + m.f };
  }, []);

  /** Zooms by `factor` keeping the viewBox point `p` under the finger/cursor. */
  const zoomAt = useCallback((p: { x: number; y: number }, factor: number) => {
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
      if (k === 1) return HOME;
      const f = k / v.k;
      return { k, x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Plain wheel keeps scrolling the page (zooms in fullscreen); pinch on a trackpad (ctrlKey) or ctrl/⌘ + wheel zooms.
    const onWheel = (e: WheelEvent) => {
      if (!full && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(toViewBox(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.005));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toViewBox, zoomAt, full]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { travel: 0, moved: false, dist: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.dist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.dist) zoomAt(toViewBox((a.x + b.x) / 2, (a.y + b.y) / 2), dist / g.dist);
      g.dist = dist;
      g.moved = true;
      setDragging(true);
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    g.travel += Math.hypot(dx, dy);
    if (!g.moved && g.travel < 5) return; // still a tap
    if (!g.moved) {
      g.moved = true;
      setDragging(true);
      setHover(null);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const s = 1 / e.currentTarget.getScreenCTM()!.a;
    setView((v) => ({ ...v, x: v.x + dx * s, y: v.y + dy * s }));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  }

  function reset() {
    setSelected(null);
    setView(HOME);
  }

  /** Moves the camera by a fraction of the visible area (→ shows more of the right side). */
  function pan(dx: number, dy: number) {
    setView((v) => ({ ...v, x: v.x - (dx * box.w) / 4, y: v.y - (dy * box.h) / 4 }));
  }
  const moved = view.k > 1 || view.x !== HOME.x || view.y !== HOME.y;

  function pick(d: SimNode) {
    const n = d.n!;
    if (gesture.current.moved) return; // the end of a drag, not a tap
    // Second tap on a member opens their bubble.
    if (selected?.id === n.id && n.member && n.username) return router.push(sharePath(n.username));
    setSelected(n);
    setHover(null);
    // Focus: zoom onto the dot (small dots zoom more).
    const k = Math.min(4, Math.max(1.8, 50 / d.r));
    setView({ k, x: cx - k * d.x!, y: cy - k * d.y! });
  }

  return (
    <div
      ref={wrap}
      data-tour="bubble"
      className={full ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg p-3" : "rounded-2xl border border-line bg-card p-4"}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {shareUrl && (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-fg px-3 py-1 text-sm text-bg"
            >
              Compartilhar no X
            </a>
          )}
        </div>
        <div data-tour="bubble-filters" className="flex flex-wrap gap-1 text-sm">
          {filters.map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setFilter(k);
                reset();
              }}
              className={`rounded-full px-3 py-1 ${filter === k ? "bg-fg text-bg" : "bg-muted"}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFull((f) => !f);
              reset();
            }}
            className="rounded-full bg-muted px-3 py-1"
            aria-label={full ? "Sair da tela cheia" : "Tela cheia"}
          >
            {full ? "✕ Fechar" : "⛶ Tela cheia"}
          </button>
        </div>
      </div>
      {live && live.watching > 0 && (
        <div className="mb-2">
          <LiveWatchers live={live} own={own} />
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
        <Legend c="var(--red)" label={SIDE.red} />
        <Legend c="var(--green)" label={SIDE.green} />
        <Legend c="var(--none)" label="Ainda sem lado" />
        {onlineHere > 0 && <Legend c="var(--accent)" label={`Online agora (${onlineHere})`} />}
        <span>Bolinhas pequenas = ainda não entraram no app</span>
      </div>
      <div className={`relative ${full ? "min-h-[320px] flex-1" : ""}`}>
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          className={`${full ? "absolute inset-0 h-full" : "h-auto"} w-full overflow-hidden select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          // Zoomed in, a one-finger drag pans; at rest, vertical swipes still scroll the page.
          style={{ touchAction: view.k > 1 || full ? "none" : "pan-y" }}
          role="img"
          aria-label={title}
          tabIndex={0}
          onKeyDown={(e) => {
            const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
            if (dir) {
              e.preventDefault();
              pan(dir[0] / 2, dir[1] / 2);
            } else if (e.key === "+" || e.key === "=") zoomAt({ x: cx, y: cy }, 1.6);
            else if (e.key === "-") zoomAt({ x: cx, y: cy }, 1 / 1.6);
            else if (e.key === "0") reset();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => e.target === e.currentTarget && !gesture.current.moved && reset()}
        >
          <defs>
            {me?.avatar && (
              <pattern id="av-me" width="1" height="1" patternContentUnits="objectBoundingBox">
                <image href={me.avatar} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
              </pattern>
            )}
            {layout?.map((d) =>
              d.n?.avatar ? (
                <pattern key={d.n.id} id={`av-${d.n.id}`} width="1" height="1" patternContentUnits="objectBoundingBox">
                  <image href={d.n.avatar} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                </pattern>
              ) : null,
            )}
          </defs>
          <text x={box.x + 12} y={box.y + 20} textAnchor="start" className="fill-[var(--red)] text-base font-bold">
            {SIDE.red}
          </text>
          <text
            x={box.x + box.w - 12}
            y={box.y + 20}
            textAnchor="end"
            className="fill-[var(--green)] text-base font-bold"
          >
            {SIDE.green}
          </text>
          <g
            className={`bubble-zoom ${dragging ? "is-dragging" : ""}`}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
          >
            {layout?.map((d) => {
              const n = d.n;
              const avatar = n ? n.avatar : me?.avatar;
              const ring = color(n, me);
              const sw = n ? Math.max(1.5, d.r * 0.16) : 4;
              // Ripple: dots pop in outward from the middle.
              const delay = Math.min(900, Math.hypot(d.x! - cx, d.y! - cy) * 2.2);
              return (
                <g
                  key={n?.id ?? "me"}
                  style={{
                    transform: `translate(${d.x}px, ${d.y}px)`,
                    opacity: focused && focused !== d ? 0.3 : n && !n.member ? 0.75 : 1,
                  }}
                  onClick={() => n && pick(d)}
                  onPointerEnter={(e) => {
                    if (!n || e.pointerType !== "mouse" || pointers.current.size) return;
                    const rect = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    setHover({ n, x, y: e.clientY - rect.top, flip: x > rect.width - 260 });
                  }}
                  onPointerLeave={() => setHover((h) => (h?.n.id === n?.id ? null : h))}
                  className={`bubble-node ${n ? "cursor-pointer" : ""}`}
                >
                  <g className="bubble-pop" style={{ animationDelay: `${delay}ms` }}>
                    {/* The owner: a halo and a pulsing ring around their photo. */}
                    {!n && <circle r={d.r + 7} fill="none" stroke="var(--fg)" strokeOpacity={0.18} strokeWidth={6} />}
                    {!n && <circle r={d.r} className="bubble-pulse" fill="none" stroke={ring} strokeWidth={3} />}
                    {/* Photo inside a ring in the vote's color; initials on a neutral fill when there's no photo. */}
                    {/* Online now: two staggered sonar rings, and the photo itself breathes. */}
                    {n && online.has(n.id) && (
                      <>
                        <circle r={d.r + 1} className="bubble-sonar" fill="none" stroke="var(--accent)" strokeWidth={Math.max(2, d.r * 0.14)} />
                        <circle r={d.r + 1} className="bubble-sonar bubble-sonar-late" fill="none" stroke="var(--accent)" strokeWidth={Math.max(2, d.r * 0.14)} />
                      </>
                    )}
                    <g className={n && online.has(n.id) ? "bubble-live" : undefined}>
                      <circle
                        r={d.r - sw / 2}
                        fill={avatar ? `url(#av-${n ? n.id : "me"})` : "var(--muted)"}
                        stroke={ring}
                        strokeWidth={sw}
                      />
                      {n && online.has(n.id) && (
                        <circle cx={d.r * 0.7} cy={-d.r * 0.7} r={Math.max(3.5, d.r * 0.28)} fill="var(--accent)" stroke="var(--card)" strokeWidth={1.5} />
                      )}
                    </g>
                    {!avatar && d.r > 9 && (
                      <text
                        textAnchor="middle"
                        dy="0.35em"
                        className="pointer-events-none fill-[var(--fg)] font-bold"
                        style={{ fontSize: Math.min(14, d.r * 0.6) }}
                      >
                        {n ? initials(n.name) : centerLabel}
                      </text>
                    )}
                    {!n && <title>Você</title>}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        {hover && !dragging && hover.n.id !== selected?.id && (
          <HoverCard
            n={hover.n}
            me={me}
            online={online.has(hover.n.id)}
            style={{
              top: hover.y + 14,
              ...(hover.flip ? { right: `calc(100% - ${hover.x - 14}px)` } : { left: hover.x + 14 }),
            }}
          />
        )}
        <div className="absolute bottom-1 left-1 grid grid-cols-3 gap-0.5">
          <span />
          <ZoomButton label="Mover para cima" onClick={() => pan(0, -1)}>
            ↑
          </ZoomButton>
          <span />
          <ZoomButton label="Mover para a esquerda" onClick={() => pan(-1, 0)}>
            ←
          </ZoomButton>
          <ZoomButton label="Mover para baixo" onClick={() => pan(0, 1)}>
            ↓
          </ZoomButton>
          <ZoomButton label="Mover para a direita" onClick={() => pan(1, 0)}>
            →
          </ZoomButton>
        </div>
        <div className="absolute right-1 bottom-1 flex gap-1">
          {moved && (
            <ZoomButton label="Voltar ao início" onClick={reset}>
              ⟲
            </ZoomButton>
          )}
          <ZoomButton label="Diminuir zoom" onClick={() => zoomAt({ x: cx, y: cy }, 1 / 1.6)}>
            −
          </ZoomButton>
          <ZoomButton label="Aumentar zoom" onClick={() => zoomAt({ x: cx, y: cy }, 1.6)}>
            +
          </ZoomButton>
        </div>
      </div>
      {visible.length === 0 && (
        <p className="-mt-6 mb-4 text-center text-sm text-subtle">
          {filter === "members" ? "Ninguém dessa bolha entrou no app ainda." : "Ninguém aqui ainda."}
        </p>
      )}
      <p className="mt-1 text-xs text-subtle">
        Arraste ou use as setas para mover, use a pinça ou os botões para zoom e toque em alguém para focar
        {nodes.some((n) => n.member) ? "; toque de novo num membro para abrir a bolha dele" : ""}.
      </p>
      {selected && (
        <NodeCard n={selected} me={me} shareBase={shareBase} readOnly={readOnly} onClose={() => setSelected(null)} />
      )}
      {tally && !full && (
        <BubbleVideo me={me} nodes={nodes} tally={tally} title={me ? `A bolha de @${me.username}` : title} shareUrl={shareUrl} />
      )}
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-lg leading-none shadow-sm"
    >
      {children}
    </button>
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

function relation(n: NetworkNode, me: Me | null) {
  if (!me) return "";
  return [
    n.following && n.follower ? "Mútuo" : n.following ? "Você segue" : n.follower ? "Segue você" : null,
    n.invite ? "Convite" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function status(n: NetworkNode) {
  return !n.member ? "Ainda não entrou no app" : n.vote ? `Time ${SIDE[n.vote]}` : "Entrou mas ainda não escolheu";
}

function HoverCard({
  n,
  me,
  online,
  style,
}: {
  n: NetworkNode;
  me: Me | null;
  online: boolean;
  style: React.CSSProperties;
}) {
  const rel = relation(n, me);
  return (
    <div
      className="pointer-events-none absolute z-10 flex w-60 items-center gap-3 rounded-xl border border-line bg-card p-2.5 shadow-lg"
      style={style}
    >
      {n.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote X avatar, already in the SVG
        <img
          src={n.avatar}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full border-2"
          style={{ borderColor: color(n, me) }}
        />
      ) : (
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 bg-muted text-sm font-bold"
          style={{ borderColor: color(n, me) }}
        >
          {initials(n.name)}
        </span>
      )}
      <div className="min-w-0 text-sm">
        <div className="truncate font-semibold">{n.name ?? "Conta do X"}</div>
        {n.username && <div className="truncate text-subtle">@{n.username}</div>}
        <div className="truncate text-xs text-subtle">
          {online && <span className="font-semibold text-[var(--accent)]">● Online · </span>}
          {status(n)}
          {rel && ` · ${rel}`}
        </div>
      </div>
    </div>
  );
}

function NodeCard({
  n,
  me,
  shareBase,
  readOnly,
  onClose,
}: {
  n: NetworkNode;
  me: Me | null;
  shareBase: string;
  readOnly: boolean;
  onClose: () => void;
}) {
  const rel = relation(n, me);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {n.name ?? "Conta do X"} {n.username && <span className="font-normal text-subtle">@{n.username}</span>}
        </div>
        <div className="text-sm text-subtle">
          {status(n)} {rel && `· ${rel}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {!n.voted && !readOnly && me && (
          <a
            className="rounded-full bg-fg px-3 py-1.5 text-bg"
            href={inviteTweetUrl(shareBase, me.id, n.username)}
            target="_blank"
            rel="noreferrer"
          >
            Chamar pra escolher
          </a>
        )}
        {n.username && (
          <Link className="rounded-full bg-fg px-3 py-1.5 text-bg" href={sharePath(n.username)}>
            Ver bolha
          </Link>
        )}
        {n.username && (
          <Link
            className="rounded-full border border-line px-3 py-1.5"
            // Your dashboard: you × them. Someone else's page: the viewer's own bubble × them.
            href={!readOnly && me ? comparePath(me.username, n.username) : `/c?b=${encodeURIComponent(n.username)}`}
          >
            Comparar
          </Link>
        )}
        <a
          className="rounded-full border border-line px-3 py-1.5"
          href={profileUrl(n)}
          target="_blank"
          rel="noreferrer"
        >
          Ver no X
        </a>
        <button className="px-2 text-subtle" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}
