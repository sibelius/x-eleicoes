"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIDE, sharePath } from "@/lib/links";
import type { MapPoints } from "@/lib/network";

// Every account in the bubble of bubbles on one canvas: a hex-packed disc, red accounts to the left,
// green to the right, ordered by which side the people they're linked to picked. Drag to pan,
// pinch / ctrl+wheel / buttons to zoom; photos load once dots are big enough to show them.
// Opens centered on `center` (an @) when given; searching re-centers and keeps the @ in the URL.

const D = 10; // grid spacing in world units
const MEMBER = 2.4; // members are drawn this much bigger, on top
const PHOTO_PX = 9; // dot radius (screen px) from which photos are drawn
const COLORS = {
  red: [212, 32, 44],
  green: [19, 137, 74],
  none: [120, 120, 128],
};

type View = { k: number; x: number; y: number };

function avatarUrl(data: MapPoints, i: number) {
  const a = data.a[i];
  return !a ? null : a.startsWith("http") ? a : data.prefix + a + data.suffix;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Hex cells inside a disc, enough for n points, ordered left to right. */
function hexDisc(n: number) {
  let R = D * Math.sqrt(n / (Math.PI * 0.866)) * 1.02;
  for (;;) {
    const cells: [number, number][] = [];
    const dy = D * 0.866;
    for (let row = -Math.ceil(R / dy); row <= Math.ceil(R / dy); row++) {
      const y = row * dy;
      const off = row & 1 ? D / 2 : 0;
      for (let x = -Math.ceil(R / D) * D + off; x <= R; x += D) if (x * x + y * y <= R * R) cells.push([x, y]);
    }
    if (cells.length >= n) return { cells: cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]), R };
    R *= 1.02;
  }
}

function mix(lean: number, member: number) {
  if (member === 1) return `rgb(${COLORS.red})`;
  if (member === 2) return `rgb(${COLORS.green})`;
  if (member === 3) return "#e5e5e5";
  const t = Math.min(1, Math.abs(lean) / 100) * 0.85;
  const to = lean < 0 ? COLORS.red : COLORS.green;
  const c = COLORS.none.map((v, i) => Math.round(v + (to[i] - v) * t));
  return `rgb(${c})`;
}

export function GlobalMap({
  title,
  shareUrl,
  center,
  page,
}: {
  title: string;
  shareUrl?: string;
  center?: string | null;
  /** Fill the viewport (the /mapa screen) instead of sitting in a card. */
  page?: boolean;
}) {
  const [data, setData] = useState<MapPoints | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState(center ? `@${center}` : "");
  const [open, setOpen] = useState(false);
  // Who the view stays centered on (through resizes), until "Ver tudo".
  const target = useRef(-1);
  const centered = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ k: 1, x: 0, y: 0 });
  const frame = useRef(0);
  const images = useRef(new Map<number, HTMLImageElement | "loading" | "error">());
  const [zoom, setZoom] = useState(1);
  const baseK = useRef(1); // the "fit everything" scale, so zoom limits and the 1× label are relative to it

  useEffect(() => {
    fetch("/api/map")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData, () => setError(true));
  }, []);

  // World positions: members bigger and drawn last; within a side, a little jitter so it isn't striped.
  const layout = useMemo(() => {
    if (!data) return null;
    const n = data.id.length;
    const order = [...Array(n).keys()].sort(
      (a, b) => data.l[a] + (hash(data.id[a]) - 0.5) * 30 - (data.l[b] + (hash(data.id[b]) - 0.5) * 30),
    );
    const { cells, R } = hexDisc(n);
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    order.forEach((idx, i) => {
      px[idx] = cells[i][0];
      py[idx] = cells[i][1];
    });
    const color = data.id.map((_, i) => mix(data.l[i], data.m[i]));
    const draw = [...order.filter((i) => !data.m[i]), ...order.filter((i) => data.m[i])];
    return { n, px, py, R, color, draw };
  }, [data]);

  // A loaded photo asks for another frame (which also starts the next batch of photos).
  const again = useRef(() => {});
  const redraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const c = canvas.current;
      if (!c || !layout || !data) return;
      const ctx = c.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const w = c.width / dpr;
      const h = c.height / dpr;
      const { k, x, y } = view.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let started = 0;
      for (const i of layout.draw) {
        const sx = layout.px[i] * k + x;
        const sy = layout.py[i] * k + y;
        const r = (D / 2 - 0.6) * k * (data.m[i] ? MEMBER : 1);
        if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue;
        if (r < 1.2) {
          ctx.fillStyle = layout.color[i];
          ctx.fillRect(sx - 0.75, sy - 0.75, 1.5, 1.5);
          continue;
        }
        const ring = data.m[i] ? Math.max(2, r * 0.18) : Math.max(1, r * 0.16);
        const img = r >= PHOTO_PX && data.a[i] ? images.current.get(i) : undefined;
        if (r >= PHOTO_PX && data.a[i] && img === undefined && started < 40) {
          started++;
          images.current.set(i, "loading");
          const el = new Image();
          el.onload = () => {
            images.current.set(i, el);
            again.current();
          };
          el.onerror = () => images.current.set(i, "error");
          el.src = avatarUrl(data, i)!;
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        if (img instanceof HTMLImageElement) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(img, sx - r, sy - r, r * 2, r * 2);
          ctx.restore();
          ctx.lineWidth = ring;
          ctx.strokeStyle = layout.color[i];
          ctx.beginPath();
          ctx.arc(sx, sy, r - ring / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = layout.color[i];
          ctx.fill();
        }
        if (i === selected) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#fff";
          ctx.beginPath();
          ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });
  }, [layout, data, selected]);

  const fit = useCallback(() => {
    const c = canvas.current;
    if (!c || !layout) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const k = (Math.min(w, h) / (layout.R * 2 + D * 4)) * 0.98;
    view.current = { k, x: w / 2, y: h / 2 };
    baseK.current = k;
    setZoom(1);
    redraw();
  }, [layout, redraw]);

  // Size the canvas to its box (and on resize / fullscreen), then fit.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      if (!centered.current && layout && center) {
        centered.current = true;
        target.current = indexOf(center);
      }
      if (target.current >= 0) {
        fit();
        focus(target.current);
      } else fit();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, full]);

  useEffect(() => {
    again.current = redraw;
    redraw();
  }, [redraw]);

  function zoomAt(f: number, cx: number, cy: number) {
    const v = view.current;
    const k = Math.min(baseK.current * 400, Math.max(baseK.current * 0.6, v.k * f));
    view.current = { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    setZoom(k / baseK.current);
    redraw();
  }

  // Wheel: in fullscreen it always zooms; inline, only with ctrl/⌘ (trackpad pinch) so the page still scrolls.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!full && !page && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - rect.left, e.clientY - rect.top);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  });

  // Drag to pan, two fingers to pinch, tap to pick.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef(0);
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = e.currentTarget.getBoundingClientRect();
      if (pinch.current) zoomAt(d / pinch.current, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      pinch.current = d;
      moved.current += 10;
      return;
    }
    moved.current += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
    view.current = { ...view.current, x: view.current.x + next.x - prev.x, y: view.current.y + next.y - prev.y };
    redraw();
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = 0;
    if (moved.current > 6 || !layout || !data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { k, x, y } = view.current;
    const wx = (e.clientX - rect.left - x) / k;
    const wy = (e.clientY - rect.top - y) / k;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < layout.n; i++) {
      const d = (layout.px[i] - wx) ** 2 + (layout.py[i] - wy) ** 2;
      const r = (D / 2) * (data.m[i] ? MEMBER : 1);
      if (d < r * r && (data.m[i] ? d - 1e6 : d) < bestD) {
        bestD = data.m[i] ? d - 1e6 : d;
        best = i;
      }
    }
    setSelected(best >= 0 ? best : null);
  }

  function focus(i: number) {
    const c = canvas.current;
    if (!c || !layout) return;
    const k = baseK.current * 40;
    view.current = { k, x: c.clientWidth / 2 - layout.px[i] * k, y: c.clientHeight / 2 - layout.py[i] * k };
    setZoom(40);
    setSelected(i);
    redraw();
  }

  // Lowercased handles, for search.
  const handles = useMemo(() => data?.u.map((u) => u?.toLowerCase() ?? "") ?? [], [data]);
  function indexOf(handle: string) {
    const q = handle.trim().replace(/^@/, "").toLowerCase();
    return q ? handles.indexOf(q) : -1;
  }
  // Up to 8 handles starting with what's typed (members first), then ones containing it.
  const suggestions = useMemo(() => {
    const q = query.trim().replace(/^@/, "").toLowerCase();
    if (!q || !data) return [];
    const starts: number[] = [];
    const contains: number[] = [];
    for (let i = 0; i < handles.length && starts.length < 8; i++) {
      const at = handles[i].indexOf(q);
      if (at === 0) starts.push(i);
      else if (at > 0 && contains.length < 8) contains.push(i);
    }
    const byMember = (a: number, b: number) => (data.m[b] ? 1 : 0) - (data.m[a] ? 1 : 0);
    return [...starts.sort(byMember), ...contains.sort(byMember)].slice(0, 8);
  }, [query, handles, data]);

  function go(i: number) {
    setQuery(`@${data!.u[i]}`);
    setOpen(false);
    target.current = i;
    focus(i);
    if (page) {
      const url = new URL(window.location.href);
      url.searchParams.set("u", data!.u[i]!);
      window.history.replaceState(null, "", url);
    }
  }

  function find(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const i = indexOf(query);
    if (i >= 0) go(i);
    else if (suggestions.length) go(suggestions[0]);
    else alert(`${query.trim()} não está na bolha das bolhas (ainda).`);
  }

  const total = data?.id.length ?? 0;
  const sel = selected !== null && data ? selected : null;
  const lean = sel !== null ? data!.l[sel] : 0;

  return (
    <div
      ref={wrap}
      className={
        full
          ? "fixed inset-0 z-50 flex flex-col bg-bg p-3"
          : page
            ? "flex min-h-0 flex-1 flex-col bg-bg px-3 pb-3"
            : "rounded-2xl border border-line bg-card p-4"
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {shareUrl && (
            <a href={shareUrl} target="_blank" rel="noreferrer" className="rounded-full bg-fg px-3 py-1 text-sm text-bg">
              Compartilhar no X
            </a>
          )}
        </div>
        <span className="text-sm text-subtle">{total ? `${total.toLocaleString("pt-BR")} contas` : ""}</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <form onSubmit={find} className="relative flex min-w-0 flex-1 gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Encontrar @ no mapa"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full border border-line bg-bg px-3 py-1.5"
          />
          <button className="rounded-full border border-line px-3 py-1.5">Ir</button>
          {open && suggestions.length > 0 && data && (
            <ul className="absolute top-full left-0 z-10 mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-line bg-card shadow-lg">
              {suggestions.map((i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(i)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  >
                    {data.a[i] ? (
                      <img src={avatarUrl(data, i)!} alt="" className="h-6 w-6 rounded-full" />
                    ) : (
                      <span className="h-6 w-6 rounded-full" style={{ background: layout?.color[i] }} />
                    )}
                    <span className="truncate">@{data.u[i]}</span>
                    {data.m[i] ? (
                      <span
                        className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: data.m[i] === 1 ? "var(--red)" : data.m[i] === 2 ? "var(--green)" : "var(--none)" }}
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="flex gap-1">
          <button aria-label="Diminuir zoom" onClick={() => zoomAt(1 / 1.6, canvas.current!.clientWidth / 2, canvas.current!.clientHeight / 2)} className="h-8 w-8 rounded-full bg-muted">
            −
          </button>
          <button aria-label="Aumentar zoom" onClick={() => zoomAt(1.6, canvas.current!.clientWidth / 2, canvas.current!.clientHeight / 2)} className="h-8 w-8 rounded-full bg-muted">
            +
          </button>
          <button
            onClick={() => {
              target.current = -1;
              fit();
            }}
            className="rounded-full bg-muted px-3"
          >
            Ver tudo
          </button>
          {!page && (
            <button onClick={() => setFull((f) => !f)} className="rounded-full bg-muted px-3">
              {full ? "Fechar" : "Tela cheia"}
            </button>
          )}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
        <span style={{ color: "var(--red)" }}>● {SIDE.red}</span>
        <span style={{ color: "var(--green)" }}>● {SIDE.green}</span>
        <span>Bolinhas grandes = entraram no app · cor clara = segue/é seguido por mais gente daquele lado</span>
      </div>
      <div className={`relative ${full || page ? "min-h-0 flex-1" : ""}`}>
        <canvas
          ref={canvas}
          className={`block w-full touch-none rounded-xl bg-bg ${full || page ? "h-full" : "h-[70vh] max-h-[680px] min-h-[360px]"} cursor-grab active:cursor-grabbing`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            zoomAt(2, e.clientX - rect.left, e.clientY - rect.top);
          }}
        />
        {!data && (
          <div className={`absolute inset-0 flex items-center justify-center rounded-xl text-sm text-subtle ${error ? "" : "shimmer"}`}>
            {error ? "Não foi possível carregar o mapa." : "Carregando todas as bolhas…"}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-card/80 px-2 py-0.5 text-xs text-subtle">
          {zoom.toFixed(zoom < 10 ? 1 : 0)}× · arraste para mover{full || page ? ", role para zoom" : ", ⌘/Ctrl + rolar ou pinça para zoom"}
        </div>
      </div>
      {sel !== null && data && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            {data.a[sel] && (
              <img
                src={avatarUrl(data, sel)!}
                alt=""
                className="h-9 w-9 rounded-full"
              />
            )}
            <div className="min-w-0">
              <div className="truncate font-semibold">{data.u[sel] ? `@${data.u[sel]}` : "Conta do X"}</div>
              <div className="text-subtle">
                {data.m[sel] === 1
                  ? `Entrou · Time ${SIDE.red}`
                  : data.m[sel] === 2
                    ? `Entrou · Time ${SIDE.green}`
                    : data.m[sel] === 3
                      ? "Entrou mas ainda não escolheu"
                      : lean
                        ? `Ligado a mais gente do ${lean < 0 ? SIDE.red : SIDE.green} (${Math.abs(lean)}%)`
                        : "Ainda não entrou no app"}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {data.u[sel] && (
              <Link href={sharePath(data.u[sel]!)} className="rounded-full bg-fg px-3 py-1.5 text-bg">
                Ver bolha
              </Link>
            )}
            <a
              href={data.u[sel] ? `https://x.com/${data.u[sel]}` : `https://x.com/i/user/${data.id[sel]}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-3 py-1.5"
            >
              Ver no X
            </a>
            <button onClick={() => setSelected(null)} className="px-2 text-subtle" aria-label="Fechar">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
