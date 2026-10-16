"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Pan & zoom for the bubble's SVG views: one view transform (translate, then scale) in viewBox units,
// driven by drag (middle-button drag too), pinch, ctrl/⌘ + wheel (plain wheel in fullscreen), shift + wheel to pan,
// arrows/+/−/0 keys and the buttons.

export type Box = { x: number; y: number; w: number; h: number };
const HOME = { k: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;

/** `onMove` fires when the camera starts moving under the user (drag, wheel), e.g. to drop a hover card. */
export function usePanZoom(box: Box, full: boolean, { onMove, resetKey }: { onMove?: () => void; resetKey?: unknown } = {}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(HOME);
  const [dragging, setDragging] = useState(false);
  // Wheel zoom/pan updates come in bursts: skip the easing while they last so the camera follows the wheel.
  const [wheeling, setWheeling] = useState(false);
  const wheelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ travel: 0, moved: false, dist: 0 });
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // A new resetKey (filter, fullscreen…) puts the camera back home.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setView(HOME);
  }

  // Screen → viewBox via the SVG's own matrix, so it stays right when fullscreen letterboxes the viewBox.
  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    return { x: m.a * clientX + m.c * clientY + m.e, y: m.b * clientX + m.d * clientY + m.f };
  }, []);

  /** Zooms by `factor` keeping the viewBox point `p` under the finger/cursor. */
  const zoomAt = useCallback((p: { x: number; y: number }, factor: number) => {
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
      if (k === v.k) return v; // already at a limit
      if (k === 1) return HOME;
      const f = k / v.k;
      return { k, x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Plain wheel keeps scrolling the page (zooms in fullscreen); pinch on a trackpad (ctrlKey) or ctrl/⌘ + wheel zooms;
    // shift + wheel pans.
    const onWheel = (e: WheelEvent) => {
      const pan = e.shiftKey && !e.ctrlKey && !e.metaKey;
      if (!pan && !full && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onMoveRef.current?.();
      setWheeling(true);
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => setWheeling(false), 150);
      // Mice in line/page mode report deltas in lines or pages, not pixels.
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientHeight : 1;
      if (pan) {
        // Some browsers turn shift + wheel into a horizontal scroll (deltaX); either way it moves the camera.
        const s = unit / el.getScreenCTM()!.a;
        setView((v) => ({ ...v, x: v.x - e.deltaX * s, y: v.y - e.deltaY * s }));
        return;
      }
      zoomAt(toViewBox(e.clientX, e.clientY), Math.exp(-e.deltaY * unit * 0.005));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTimer.current);
    };
  }, [toViewBox, zoomAt, full]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return; // right click keeps its menu
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { travel: 0, moved: false, dist: 0 };
    // Middle button: always a pan, never a tap (and no autoscroll).
    if (e.button === 1) {
      e.preventDefault();
      gesture.current.moved = true;
      setDragging(true);
      onMoveRef.current?.();
      e.currentTarget.setPointerCapture(e.pointerId);
    }
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
      onMoveRef.current?.();
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const s = 1 / e.currentTarget.getScreenCTM()!.a;
    setView((v) => ({ ...v, x: v.x + dx * s, y: v.y + dy * s }));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  /** Moves the camera by a fraction of the visible area (→ shows more of the right side). */
  function pan(dx: number, dy: number) {
    setView((v) => ({ ...v, x: v.x - (dx * box.w) / 4, y: v.y - (dy * box.h) / 4 }));
  }

  /** Zooms onto a dot of radius r at (x, y) (small dots zoom more, up to max). */
  function focus(x: number, y: number, r: number, max = 4) {
    const k = Math.min(max, Math.max(1.8, 50 / r));
    setView({ k, x: cx - k * x, y: cy - k * y });
  }

  const home = () => setView(HOME);

  return {
    svgRef,
    view,
    dragging,
    /** Dragging or wheeling: the stage should follow without easing. */
    moving: dragging || wheeling,
    /** The current pointer gesture moved (a drag, not a tap). */
    moved: () => gesture.current.moved,
    /** A finger or button is down on the SVG. */
    pressed: () => pointers.current.size > 0,
    cx,
    cy,
    zoomAt,
    pan,
    focus,
    home,
    away: view.k > 1 || view.x !== HOME.x || view.y !== HOME.y,
    svgProps: {
      ref: svgRef,
      viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
      // Zoomed in, a one-finger drag pans; at rest, vertical swipes still scroll the page.
      style: { touchAction: view.k > 1 || full ? "none" : "pan-y" } as React.CSSProperties,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      // Capture lost (window blur, element gone): forget the pointer so the next gesture starts clean.
      onLostPointerCapture: onPointerUp,
      onAuxClick: (e: React.MouseEvent) => e.button === 1 && e.preventDefault(),
      onKeyDown: (e: React.KeyboardEvent) => {
        const dir = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[e.key];
        const zoom = e.key === "+" || e.key === "=" ? 1.6 : e.key === "-" ? 1 / 1.6 : 0;
        if (dir || zoom || e.key === "0") onMoveRef.current?.();
        if (dir) {
          e.preventDefault();
          pan(dir[0] / 2, dir[1] / 2);
        } else if (zoom) zoomAt({ x: cx, y: cy }, zoom);
        else if (e.key === "0") home();
      },
    },
    /** Style for the <g> that holds the content. */
    stageStyle: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` } as React.CSSProperties,
  };
}

export type PanZoom = ReturnType<typeof usePanZoom>;

/** Arrow pad (bottom left) and zoom buttons (bottom right), over the SVG. */
export function PanZoomControls({ pz, onReset }: { pz: PanZoom; onReset: () => void }) {
  return (
    <>
      <div className="absolute bottom-1 left-1 grid grid-cols-3 gap-0.5">
        <span />
        <ZoomButton label="Mover para cima" onClick={() => pz.pan(0, -1)}>
          ↑
        </ZoomButton>
        <span />
        <ZoomButton label="Mover para a esquerda" onClick={() => pz.pan(-1, 0)}>
          ←
        </ZoomButton>
        <ZoomButton label="Mover para baixo" onClick={() => pz.pan(0, 1)}>
          ↓
        </ZoomButton>
        <ZoomButton label="Mover para a direita" onClick={() => pz.pan(1, 0)}>
          →
        </ZoomButton>
      </div>
      <div className="absolute right-1 bottom-1 flex gap-1">
        {pz.away && (
          <ZoomButton label="Voltar ao início" onClick={onReset}>
            ⟲
          </ZoomButton>
        )}
        <ZoomButton label="Diminuir zoom" onClick={() => pz.zoomAt({ x: pz.cx, y: pz.cy }, 1 / 1.6)}>
          −
        </ZoomButton>
        <ZoomButton label="Aumentar zoom" onClick={() => pz.zoomAt({ x: pz.cx, y: pz.cy }, 1.6)}>
          +
        </ZoomButton>
      </div>
    </>
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

/**
 * The viewBox around laid-out dots (plus a top margin for labels), never blowing a handful of dots
 * up to fill the card: at least ~half the layout space stays in view.
 */
export function fitBox(dots: { x?: number; y?: number; r: number }[] | null, space: { w: number; h: number }, top = 28): Box {
  if (!dots?.length) return { x: 0, y: 0, w: space.w, h: space.h };
  const pad = 12;
  const x0 = Math.min(...dots.map((d) => d.x! - d.r)) - pad;
  const x1 = Math.max(...dots.map((d) => d.x! + d.r)) + pad;
  const y0 = Math.min(...dots.map((d) => d.y! - d.r)) - pad - top;
  const y1 = Math.max(...dots.map((d) => d.y! + d.r)) + pad;
  const w = Math.max(x1 - x0, space.w * 0.6);
  const h = Math.max(y1 - y0, space.h * 0.45);
  return { x: (x0 + x1 - w) / 2, y: (y0 + y1 - h) / 2, w, h };
}
