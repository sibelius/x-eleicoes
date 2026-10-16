"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMMUNITY } from "@/components/admin/metrics";
import type { AudienceMap as MapData } from "@/lib/audience";
import { profileUrl, sharePath } from "@/lib/links";

// The member's audience on one canvas: force layout from the server, colored by community or side.
// Loads from /api/audience/map once scrolled into view. Drag to pan; pinch, ctrl+wheel or the
// buttons to zoom; hover (or tap) someone to see who they are.

type View = { k: number; x: number; y: number };
type Mode = "community" | "side";

const RELATION = ["", "te segue", "você segue", "vocês se seguem"];

const radius = (reach: number) => 2.5 + 2.2 * Math.log10(1 + reach);

export function AudienceMap() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<Mode>("community");
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const view = useRef<View>({ k: 1, x: 0, y: 0 });
  const size = useRef({ w: 0, h: 0 });
  const [, redraw] = useState(0);
  const frame = useRef(0);

  // Fetch when the map is about to be seen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let done = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some((e) => e.isIntersecting)) return;
        done = true;
        io.disconnect();
        fetch("/api/audience/map")
          .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
          .then(setData)
          .catch(() => setError(true));
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const neighbors = useMemo(() => {
    if (!data) return [] as number[][];
    const nb: number[][] = data.id.map(() => []);
    for (let k = 0; k < data.e.length; k += 2) {
      nb[data.e[k]].push(data.e[k + 1]);
      nb[data.e[k + 1]].push(data.e[k]);
    }
    return nb;
  }, [data]);

  const fit = useCallback(() => {
    if (!data || !data.x.length) return;
    const { w, h } = size.current;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < data.x.length; i++) {
      x0 = Math.min(x0, data.x[i]);
      x1 = Math.max(x1, data.x[i]);
      y0 = Math.min(y0, data.y[i]);
      y1 = Math.max(y1, data.y[i]);
    }
    const k = Math.min(w / Math.max(1, x1 - x0 + 40), h / Math.max(1, y1 - y0 + 40));
    view.current = { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k };
    redraw((n) => n + 1);
  }, [data]);

  // Size the canvas to its box (and refit the first time data and size are both known).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let fitted = false;
    const ro = new ResizeObserver(() => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      if (data && !fitted) {
        fitted = true;
        fit();
      } else redraw((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, fit]);

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c || !data) return;
    const { w, h } = size.current;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(c);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const col = { red: v("--red"), green: v("--green"), none: v("--none"), fg: v("--fg"), bg: v("--card") };
    const { k, x: ox, y: oy } = view.current;
    const sx = (i: number) => data.x[i] * k + ox;
    const sy = (i: number) => data.y[i] * k + oy;
    const focus = pinned ?? hover?.i ?? null;
    const near = focus != null ? new Set([focus, ...neighbors[focus]]) : null;

    ctx.strokeStyle = col.fg;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = near ? 0.04 : 0.08;
    ctx.beginPath();
    for (let e = 0; e < data.e.length; e += 2) {
      ctx.moveTo(sx(data.e[e]), sy(data.e[e]));
      ctx.lineTo(sx(data.e[e + 1]), sy(data.e[e + 1]));
    }
    ctx.stroke();
    if (focus != null) {
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const j of neighbors[focus]) {
        ctx.moveTo(sx(focus), sy(focus));
        ctx.lineTo(sx(j), sy(j));
      }
      ctx.stroke();
    }

    const color = (i: number) => {
      if (mode === "community") return data.c[i] >= 0 ? (COMMUNITY[data.c[i]] ?? col.none) : col.none;
      const s = data.s[i];
      if (s === 1) return col.red;
      if (s === 2) return col.green;
      if (s === 3) return col.none;
      const l = data.l[i];
      return l < 0 ? col.red : l > 0 ? col.green : col.none;
    };
    const alpha = (i: number) => {
      if (near && !near.has(i)) return 0.15;
      if (mode === "side" && data.s[i] === 0) return data.l[i] ? 0.35 + (0.4 * Math.abs(data.l[i])) / 100 : 0.5;
      return 0.9;
    };
    // Biggest last, on top (data comes sorted by reach, descending).
    for (let i = data.id.length - 1; i >= 0; i--) {
      const r = Math.max(1.2, radius(data.r[i]) * k);
      const x = sx(i);
      const y = sy(i);
      if (x < -r || y < -r || x > w + r || y > h + r) continue;
      ctx.globalAlpha = alpha(i);
      ctx.fillStyle = color(i);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (data.s[i] > 0 && r > 2.5) {
        ctx.globalAlpha = Math.min(1, alpha(i) + 0.1);
        ctx.strokeStyle = col.fg;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Handles of the widest-reach accounts (and the focused one).
    ctx.globalAlpha = 1;
    ctx.font = "600 11px var(--font-geist-sans), system-ui, sans-serif";
    ctx.textAlign = "center";
    const labels = Math.min(data.id.length, Math.round(8 + 4 * Math.log2(Math.max(1, k * 2))));
    const tags = new Set<number>();
    for (let i = 0; i < data.id.length && tags.size < labels; i++) if (data.u[i]) tags.add(i);
    if (focus != null) tags.add(focus);
    for (const i of tags) {
      if (near && !near.has(i)) continue;
      const t = `@${data.u[i] ?? data.id[i]}`;
      const y = sy(i) - Math.max(1.2, radius(data.r[i]) * k) - 4;
      ctx.lineWidth = 3;
      ctx.strokeStyle = col.bg;
      ctx.strokeText(t, sx(i), y);
      ctx.fillStyle = col.fg;
      ctx.fillText(t, sx(i), y);
    }
  }, [data, mode, hover, pinned, neighbors]);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  });

  const hit = useCallback(
    (px: number, py: number) => {
      if (!data) return null;
      const { k, x: ox, y: oy } = view.current;
      let best: number | null = null;
      let bestD = Infinity;
      for (let i = 0; i < data.id.length; i++) {
        const dx = data.x[i] * k + ox - px;
        const dy = data.y[i] * k + oy - py;
        const d = dx * dx + dy * dy;
        const r = Math.max(6, radius(data.r[i]) * k + 3);
        if (d < r * r && d < bestD) {
          best = i;
          bestD = d;
        }
      }
      return best;
    },
    [data],
  );

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    const v = view.current;
    const k = Math.min(40, Math.max(0.05, v.k * factor));
    const f = k / v.k;
    view.current = { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    redraw((n) => n + 1);
  }, []);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const b = c.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - b.left, e.clientY - b.top);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt, data]);

  // Pointer pan + pinch; a tap without moving pins whoever is under it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const local = (e: React.PointerEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  // Tooltip spot, kept inside the box.
  const tipAt = (i: number, p: { x: number; y: number }) => ({ i, x: Math.max(4, Math.min(p.x + 12, size.current.w - 230)), y: Math.max(4, p.y - 60) });
  const onDown = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) {
      const i = hit(p.x, p.y);
      setHover(i == null ? null : tipAt(i, p));
      return;
    }
    if (ps.size === 2) {
      const [a, b] = [...ps.values()];
      const other = a === prev ? b : a;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      if (before > 0) zoomAt(after / before, (p.x + other.x) / 2, (p.y + other.y) / 2);
    } else {
      view.current = { ...view.current, x: view.current.x + p.x - prev.x, y: view.current.y + p.y - prev.y };
      redraw((n) => n + 1);
    }
    moved.current += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    ps.set(e.pointerId, p);
  };
  const onUp = (e: React.PointerEvent) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (moved.current < 6) {
      const i = hit(p.x, p.y);
      setPinned(i);
      setHover(i == null ? null : tipAt(i, p));
    }
  };

  const zoomButton = (f: number) => zoomAt(f, size.current.w / 2, size.current.h / 2);
  const shown = pinned ?? hover?.i ?? null;
  const tip = hover && pinned == null ? hover : null;

  const legend = useMemo(() => (data ? data.labels.slice(0, COMMUNITY.length) : []), [data]);

  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="Colorir por">
          {(["community", "side"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 ${mode === m ? "bg-fg text-bg" : "text-subtle"}`}
              aria-pressed={mode === m}
            >
              {m === "community" ? "Comunidade" : "Lado"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button onClick={() => zoomButton(1.5)} className="h-8 w-8 rounded-full border border-line" aria-label="Aproximar">
            +
          </button>
          <button onClick={() => zoomButton(1 / 1.5)} className="h-8 w-8 rounded-full border border-line" aria-label="Afastar">
            −
          </button>
          <button onClick={fit} className="h-8 rounded-full border border-line px-3 text-xs" aria-label="Ver tudo">
            Ver tudo
          </button>
        </div>
      </div>
      <div ref={wrap} className="relative h-[420px] overflow-hidden rounded-xl bg-bg sm:h-[560px]">
        {!data && !error && <div className="shimmer absolute inset-0" aria-label="Carregando o mapa" />}
        {error && <p className="absolute inset-0 grid place-items-center text-sm text-subtle">Não deu para carregar o mapa.</p>}
        {data && !data.id.length && (
          <p className="absolute inset-0 grid place-items-center text-sm text-subtle">Ainda não há contas na sua audiência.</p>
        )}
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          onPointerLeave={() => pointers.current.size === 0 && setHover(null)}
        />
        {data && tip && (
          <div
            className="pointer-events-none absolute z-10 max-w-[220px] rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg"
            style={{ left: tip.x, top: tip.y }}
          >
            <Who data={data} i={tip.i} />
          </div>
        )}
        {data && pinned != null && shown != null && (
          <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg sm:inset-x-auto sm:left-2 sm:max-w-sm">
            <div className="min-w-0 flex-1">
              <Who data={data} i={pinned} />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {data.u[pinned] && (
                <Link href={sharePath(data.u[pinned]!)} className="rounded-full bg-fg px-3 py-1 text-center text-bg">
                  Bolha
                </Link>
              )}
              <a
                href={profileUrl({ id: data.id[pinned], username: data.u[pinned] })}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line px-3 py-1 text-center"
              >
                X
              </a>
            </div>
            <button onClick={() => setPinned(null)} className="shrink-0 px-1 text-subtle" aria-label="Fechar">
              ✕
            </button>
          </div>
        )}
      </div>
      {data && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
          {mode === "community" ? (
            <>
              {legend.map((l, c) => (
                <span key={c} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: COMMUNITY[c] }} />
                  {l}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--none)]" />
                sem grupo
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--red)]" /> Vermelho
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--green)]" /> Verde
              </span>
              <span>Contorno = membro; quem não é membro fica mais claro, puxando para o lado de quem o segue.</span>
            </>
          )}
          <span className="ml-auto">{data.id.length.toLocaleString("pt-BR")} contas</span>
        </div>
      )}
    </div>
  );
}

function Who({ data, i }: { data: MapData; i: number }) {
  const side = data.s[i] === 1 ? "Vermelho" : data.s[i] === 2 ? "Verde" : data.s[i] === 3 ? "membro sem lado" : null;
  return (
    <div className="flex items-center gap-2">
      {data.a[i] ? <img src={data.a[i]!} alt="" className="h-8 w-8 shrink-0 rounded-full" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-muted" />}
      <div className="min-w-0">
        <div className="truncate font-semibold">{data.n[i] ?? data.u[i] ?? data.id[i]}</div>
        {data.u[i] && <div className="truncate text-subtle">@{data.u[i]}</div>}
        <div className="text-subtle">
          alcance {data.r[i].toLocaleString("pt-BR")} · {RELATION[data.f[i]]}
          {side && <> · {side}</>}
        </div>
        {data.c[i] >= 0 && <div className="truncate text-subtle">{data.labels[data.c[i]]}</div>}
      </div>
    </div>
  );
}
