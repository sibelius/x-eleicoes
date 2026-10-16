"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Me, NetworkNode, Tally } from "@/lib/network";
import { NetworkMap, type CanvasProps } from "./BubbleMap";
import { BubbleStates } from "./StatesMap";
import { BubbleVideo } from "./BubbleVideo";
import { LiveWatchers, useLive } from "./LiveWatchers";
import { PanZoomControls, fitBox, usePanZoom } from "./pan-zoom";
import { SIDE, comparePath, inviteTweetUrl, profileUrl, sharePath } from "@/lib/links";

/** The two sides' names and colors (Red × Green by default; topics bring their own). */
export type Sides = { red: { label: string; color?: string }; green: { label: string; color?: string } };
const DEFAULT_SIDES: Sides = { red: { label: SIDE.red }, green: { label: SIDE.green } };

// Layout space: landscape on wide containers, portrait on phones so dots stay big enough to read and tap.
const WIDE = { w: 760, h: 520 };
const NARROW = { w: 400, h: 620 };

type SimNode = SimulationNodeDatum & { n: NetworkNode | null; r: number };
type View = "bubble" | "map" | "states";
const VIEWS: [View, string][] = [
  ["bubble", "Bolha"],
  ["map", "Mapa"],
  ["states", "Estados"],
];

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
  sides = DEFAULT_SIDES,
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
  /** Side names and colors; colors override --red / --green inside the bubble. */
  sides?: Sides;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(WIDE);
  // Three ways to look at the same people: the bubble, the follow network ("Mapa"), and by state.
  const [view, setView] = useState<View>("bubble");
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  // Mouse hover: a small card next to the cursor, so people are easy to tell apart without clicking.
  const [hover, setHover] = useState<{ n: NetworkNode; x: number; y: number; flip: boolean } | null>(null);
  const [full, setFull] = useState(false);
  // Bumped to send the camera home (filter, fullscreen, tap on the background).
  const [resetKey, setResetKey] = useState(0);
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

  function reset() {
    setSelected(null);
    setResetKey((k) => k + 1);
  }

  const canvas: CanvasProps = {
    me,
    nodes: visible,
    space,
    full,
    title,
    selected,
    online,
    resetKey,
    onPick(n) {
      // Second tap on a member opens their bubble.
      if (selected?.id === n.id && n.member && n.username) {
        router.push(sharePath(n.username));
        return false;
      }
      setSelected(n);
      setHover(null);
      return true;
    },
    onHover(n, e) {
      if (!n || !e) return setHover(null);
      const rect = (e.currentTarget as SVGElement).ownerSVGElement!.parentElement!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setHover({ n, x, y: e.clientY - rect.top, flip: x > rect.width - 260 });
    },
    onReset: reset,
  };

  return (
    <div
      ref={wrap}
      data-tour="bubble"
      className={full ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg p-3" : "rounded-2xl border border-line bg-card p-4"}
      style={
        {
          ...(sides.red.color ? { "--red": sides.red.color } : {}),
          ...(sides.green.color ? { "--green": sides.green.color } : {}),
        } as React.CSSProperties
      }
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
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <div role="tablist" aria-label="Como ver a bolha" className="flex rounded-full border border-line p-0.5">
            {VIEWS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                onClick={() => {
                  setView(k);
                  setSelected(null);
                  setHover(null);
                }}
                className={`rounded-full px-3 py-0.5 ${view === k ? "bg-fg text-bg" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
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
      {view !== "states" && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            <Legend c="var(--red)" label={sides.red.label} />
            <Legend c="var(--green)" label={sides.green.label} />
            <Legend c="var(--none)" label="Ainda sem lado" />
            {onlineHere > 0 && <Legend c="var(--accent)" label={`Online agora (${onlineHere})`} />}
            <span>
              {view === "map"
                ? "Linhas = quem segue quem aqui dentro · maior = mais conexões"
                : "Bolinhas pequenas = ainda não entraram no app"}
            </span>
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
          </div>
        </div>
      )}
      {view === "states" ? (
        <BubbleStates uid={me?.id ?? null} labels={{ red: sides.red.label, green: sides.green.label }} full={full} />
      ) : (
        <div className={`relative ${full ? "min-h-[320px] flex-1" : ""}`}>
          {view === "map" ? <NetworkMap {...canvas} /> : <BubbleCanvas {...canvas} centerLabel={centerLabel} sides={sides} />}
          {hover && hover.n.id !== selected?.id && (
            <HoverCard
              n={hover.n}
              me={me}
              sides={sides}
              online={online.has(hover.n.id)}
              style={{
                top: hover.y + 14,
                ...(hover.flip ? { right: `calc(100% - ${hover.x - 14}px)` } : { left: hover.x + 14 }),
              }}
            />
          )}
        </div>
      )}
      {view === "bubble" && visible.length === 0 && (
        <p className="-mt-6 mb-4 text-center text-sm text-subtle">
          {filter === "members" ? "Ninguém dessa bolha entrou no app ainda." : "Ninguém aqui ainda."}
        </p>
      )}
      {view !== "states" && (
        <p className="mt-1 text-xs text-subtle">
          Arraste ou use as setas para mover, use a pinça ou os botões para zoom e toque em alguém para focar
          {nodes.some((n) => n.member) ? "; toque de novo num membro para abrir a bolha dele" : ""}.
        </p>
      )}
      {selected && view !== "states" && (
        <NodeCard n={selected} me={me} sides={sides} shareBase={shareBase} readOnly={readOnly} onClose={() => setSelected(null)} />
      )}
      {tally && !full && (
        <BubbleVideo me={me} nodes={nodes} tally={tally} title={me ? `A bolha de @${me.username}` : title} shareUrl={shareUrl} />
      )}
    </div>
  );
}

/** The bubble itself: the owner in the middle, their people around, Red to the left and Green to the right. */
function BubbleCanvas({
  me,
  nodes: visible,
  space,
  full,
  title,
  selected,
  online,
  resetKey,
  onPick,
  onHover,
  onReset,
  centerLabel,
  sides,
}: CanvasProps & { centerLabel: string; sides: Sides }) {
  const [layout, setLayout] = useState<SimNode[] | null>(null);
  const box = useMemo(() => fitBox(layout, space), [layout, space]);

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

  const pz = usePanZoom(box, full, { onDragStart: () => onHover(null), resetKey });
  const focused = selected ? layout?.find((d) => d.n?.id === selected.id) : undefined;
  const { cx, cy } = pz;

  return (
    <>
      <svg
        {...pz.svgProps}
        className={`${full ? "absolute inset-0 h-full" : "h-auto"} w-full overflow-hidden select-none ${pz.dragging ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label={title}
        onClick={(e) => e.target === e.currentTarget && !pz.moved() && onReset()}
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
          {sides.red.label}
        </text>
        <text
          x={box.x + box.w - 12}
          y={box.y + 20}
          textAnchor="end"
          className="fill-[var(--green)] text-base font-bold"
        >
          {sides.green.label}
        </text>
        <g className={`bubble-zoom ${pz.dragging ? "is-dragging" : ""}`} style={pz.stageStyle}>
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
                onClick={() => {
                  if (!n || pz.moved()) return; // the end of a drag, not a tap
                  if (onPick(n)) pz.focus(d.x!, d.y!, d.r);
                }}
                onPointerEnter={(e) => {
                  if (!n || e.pointerType !== "mouse" || pz.pressed()) return;
                  onHover(n, e);
                }}
                onPointerLeave={() => onHover(null)}
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
      <PanZoomControls pz={pz} onReset={onReset} />
    </>
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

function status(n: NetworkNode, sides: Sides) {
  return !n.member ? "Ainda não entrou no app" : n.vote ? `Time ${sides[n.vote].label}` : "Entrou mas ainda não escolheu";
}

function HoverCard({
  n,
  me,
  sides,
  online,
  style,
}: {
  n: NetworkNode;
  me: Me | null;
  sides: Sides;
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
          {status(n, sides)}
          {rel && ` · ${rel}`}
        </div>
      </div>
    </div>
  );
}

function NodeCard({
  n,
  me,
  sides,
  shareBase,
  readOnly,
  onClose,
}: {
  n: NetworkNode;
  me: Me | null;
  sides: Sides;
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
          {status(n, sides)} {rel && `· ${rel}`}
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
