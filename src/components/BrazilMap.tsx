"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GEO, UF_BOX, UF_LABEL, UF_PATHS } from "@/lib/brazil-geo";
import { SIDE } from "@/lib/links";
import type { StateCount } from "@/lib/places";
import { redShare, regionOf, sumStates } from "@/lib/regions";
import { UFS, type UF } from "@/lib/uf";
import { usePanZoom, type Box } from "./pan-zoom";

// Brazil by state (IBGE boundaries), each state colored by the Red × Green split of its members with a
// known state: deeper color = more one-sided, hatched gray = fewer than 3 people (no numbers at all).
// Small coastal states get a pill on the right with a leader line; zoomed in, they get inline labels.

export type Labels = { red: string; green: string };

const ALL = Object.keys(UF_PATHS) as UF[];
const CALLOUTS: UF[] = ["RN", "PB", "PE", "AL", "SE", "ES", "RJ"];
const PAD = 10; // map margin, in map units
const GAP_PX = 18; // between the coast and the pills
const PILL_W_PX = 66;
const PILL_H_PX = 22;

// The map's own palette, from the theme's colors (light and dark follow).
const MAP_VARS = {
  "--map-empty": "var(--muted)",
  "--map-hatch": "color-mix(in oklab, var(--subtle) 40%, var(--muted))",
  "--map-border": "color-mix(in oklab, var(--card) 75%, var(--bg))",
  "--map-halo": "var(--muted)",
} as React.CSSProperties;

/** Fill for a state: toward red or green by its split, faint near 50/50; hatched when there are few people. */
export function stateFill(s: StateCount | undefined) {
  if (!s) return "var(--map-empty)";
  if ("few" in s) return "url(#bm-few)";
  const r = redShare(s);
  if (r === null) return "var(--none)";
  const pct = Math.round(30 + Math.abs(r - 0.5) * 2 * 70);
  return `color-mix(in oklab, ${r >= 0.5 ? "var(--red)" : "var(--green)"} ${pct}%, var(--map-empty))`;
}

/** How strong the color is (0–1), to pick white or dark text over it. */
function strength(s: StateCount | undefined) {
  if (!s || "few" in s) return 0;
  const r = redShare(s);
  return r === null ? 0 : 0.3 + Math.abs(r - 0.5) * 1.4;
}

/** "62%": the larger side's share (the color says which), "50%" on a tie, "—" without picks. */
function topPct(s: StateCount | undefined) {
  if (!s || "few" in s) return null;
  const r = redShare(s);
  if (r === null) return "—";
  return `${Math.round(Math.max(r, 1 - r) * 100)}%`;
}

export function leanText(s: StateCount, labels: Labels) {
  if ("few" in s) return "poucos dados";
  const r = redShare(s);
  if (r === null) return "ninguém escolheu lado";
  const red = Math.round(r * 100);
  if (red === 50) return "empate";
  return red > 50 ? `${red}% ${labels.red}` : `${100 - red}% ${labels.green}`;
}

/** The viewBox and its scale (px per unit), leaving room on the right for the pills at their pixel size. */
function frame(w: number, h: number, fill: boolean, reserve: number): { box: Box; s: number } {
  const mapW = GEO.w + 2 * PAD;
  const mapH = GEO.h + 2 * PAD;
  const extra = GAP_PX + PILL_W_PX + 8;
  if (w <= 0) return { box: { x: -PAD, y: -PAD, w: mapW + 200, h: mapH }, s: 0.5 };
  let s = w / (mapW / Math.max(0.35, 1 - extra / w));
  if (fill && h > 0 && h / mapH < s) s = h / mapH;
  const contentW = mapW + extra / s;
  const bw = Math.max(contentW, w / s);
  if (fill && h > 0) {
    const bh = Math.max(mapH, h / s);
    return { box: { x: -PAD - (bw - contentW) / 2, y: -PAD - (bh - mapH) / 2, w: bw, h: bh }, s };
  }
  // Narrow screens: room on top so the pills clear the buttons and still fit.
  const bh = Math.max(mapH, (reserve + CALLOUTS.length * (PILL_H_PX + 6) + 16) / s);
  return { box: { x: -PAD - (bw - contentW) / 2, y: -PAD - (bh - mapH), w: bw, h: bh }, s };
}

/** Pills' y positions: near their state, never overlapping, groups centered on their states. */
function stack(targets: number[], h: number, top: number, bottom: number) {
  const ys = [...targets];
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + h);
    // Pull each run of touching pills up so it sits around its states.
    for (let i = 0; i < ys.length; ) {
      let j = i;
      while (j + 1 < ys.length && ys[j + 1] - ys[j] <= h + 0.01) j++;
      const want = targets.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
      const have = ys.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
      const lift = Math.max(have - want, 0);
      for (let k = i; k <= j; k++) ys[k] -= lift;
      i = j + 1;
    }
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + h);
  }
  // Inside [top, bottom]: pushed down from the top, then up from the bottom.
  for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + h : top);
  for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - h : bottom);
  return ys;
}

export function BrazilMap({
  states,
  labels = SIDE,
  selected = null,
  onSelect,
  fill = false,
  full = false,
  onFull,
  emptyCta = null,
  ariaLabel = "Mapa do Brasil por estado",
  tools = null,
}: {
  states: StateCount[];
  labels?: Labels;
  selected?: UF | null;
  onSelect?: (uf: UF | null) => void;
  /** Take all the height the parent gives (otherwise the map's own aspect ratio). */
  fill?: boolean;
  /** Fullscreen: plain wheel zooms. */
  full?: boolean;
  /** Shows a fullscreen toggle. */
  onFull?: () => void;
  /** Few states known: an invitation over the map (text). */
  emptyCta?: string | null;
  ariaLabel?: string;
  /** More buttons under fullscreen (top right). */
  tools?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const reserve = ((onFull ? 1 : 0) + (tools ? 1 : 0)) * 40 + 8; // px kept for the top right buttons
  const { box, s } = useMemo(() => frame(size.w, size.h, fill, reserve), [size.w, size.h, fill, reserve]);
  const pz = usePanZoom(box, full, { resetKey: `${fill}${full}` });
  const k = pz.view.k;
  const px = (n: number) => n / (s * k); // screen pixels → map units inside the zoomed stage
  const by = useMemo(() => new Map(states.map((st) => [st.uf, st])), [states]);
  const [hover, setHover] = useState<{ uf: UF; x: number; y: number } | null>(null);

  // Zoom onto the picked state; back home when it's cleared.
  const { focus, home } = pz;
  useEffect(() => {
    if (!selected) return home();
    const [x0, y0, x1, y1] = UF_BOX[selected];
    const kk = Math.min(5, Math.max(1.6, 0.5 * Math.min(box.w / Math.max(x1 - x0, 20), box.h / Math.max(y1 - y0, 20))));
    focus((x0 + x1) / 2, (y0 + y1) / 2, 50 / kk, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only when the pick changes
  }, [selected]);

  const zoomed = k > 1.3;
  const callouts = useMemo(() => {
    const items = CALLOUTS.map((uf) => ({ uf, ay: UF_LABEL[uf][1], ax: UF_LABEL[uf][0] })).sort((a, b) => a.ay - b.ay);
    const h = (PILL_H_PX + 6) / s;
    // Keep clear of the buttons in the top right corner.
    const ys = stack(
      items.map((i) => i.ay),
      h,
      box.y + (reserve + PILL_H_PX / 2) / s,
      box.y + box.h - h,
    );
    return items.map((i, n) => ({ ...i, y: ys[n] }));
  }, [s, box.y, box.h, reserve]);
  const pillX = GEO.w + PAD + GAP_PX / s;

  const pick = (uf: UF) => {
    if (pz.moved()) return;
    onSelect?.(selected === uf ? null : uf);
  };
  const hoverAt = (uf: UF | null, e?: React.PointerEvent) => {
    if (!uf || !e || e.pointerType !== "mouse") return setHover(null);
    const r = wrap.current!.getBoundingClientRect();
    setHover({ uf, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const known = sumStates(states);
  const info = selected ? by.get(selected) : undefined;

  return (
    <div className={`relative ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`} style={MAP_VARS}>
      <div
        ref={wrap}
        className={`relative w-full select-none ${fill ? "min-h-0 flex-1" : ""}`}
        style={fill ? undefined : { aspectRatio: `${box.w} / ${box.h}` }}
      >
        <svg
          {...pz.svgProps}
          role="group"
          aria-label={ariaLabel}
          className={`absolute inset-0 h-full w-full outline-none ${pz.dragging ? "cursor-grabbing" : "cursor-grab"}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pz.moved() && selected) onSelect?.(null);
          }}
        >
          <defs>
            <pattern id="bm-few" width={7 / s} height={7 / s} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={7 / s} height={7 / s} style={{ fill: "var(--map-empty)" }} />
              <rect width={2.2 / s} height={7 / s} style={{ fill: "var(--map-hatch)" }} />
            </pattern>
          </defs>
          <g style={{ ...pz.stageStyle, transition: pz.dragging ? undefined : "transform 350ms ease" }}>
            {ALL.map((uf) => (
              <path
                key={uf}
                d={UF_PATHS[uf]}
                role="button"
                tabIndex={-1}
                aria-label={describe(uf, by.get(uf), labels)}
                style={{ fill: stateFill(by.get(uf)), stroke: "var(--map-border)", transition: "fill 300ms" }}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                className="cursor-pointer outline-none"
                onClick={() => pick(uf)}
                onPointerMove={(e) => hoverAt(uf, e)}
                onPointerLeave={() => hoverAt(null)}
              />
            ))}
            {(hover?.uf ?? selected) && (
              <path
                d={UF_PATHS[(hover?.uf ?? selected)!]}
                fill="none"
                style={{ stroke: "var(--fg)" }}
                strokeWidth={hover && hover.uf !== selected ? 1.5 : 2.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
            {selected && hover && hover.uf !== selected && (
              <path d={UF_PATHS[selected]} fill="none" style={{ stroke: "var(--fg)" }} strokeWidth={2.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
            <g pointerEvents="none" fontFamily="var(--font-sans), system-ui, sans-serif">
              {ALL.filter((uf) => zoomed || !CALLOUTS.includes(uf)).map((uf) => (
                <StateLabel key={uf} uf={uf} st={by.get(uf)} px={px} small={s * k < 0.42} room={(UF_BOX[uf][2] - UF_BOX[uf][0]) * s * k} />
              ))}
            </g>
          </g>
          {!zoomed && (
            <g fontFamily="var(--font-sans), system-ui, sans-serif">
              {callouts.map(({ uf, ax, ay, y }) => {
                const st = by.get(uf);
                const u = 1 / s;
                const dark = strength(st) > 0.45;
                return (
                  <g key={uf} className="cursor-pointer" onClick={() => pick(uf)} onPointerMove={(e) => hoverAt(uf, e)} onPointerLeave={() => hoverAt(null)}>
                    <polyline
                      points={`${ax},${ay} ${pillX - 10 * u},${y} ${pillX},${y}`}
                      fill="none"
                      style={{ stroke: "var(--subtle)" }}
                      strokeWidth={0.8}
                      vectorEffect="non-scaling-stroke"
                      opacity={0.7}
                    />
                    <circle cx={ax} cy={ay} r={2.2 * u} style={{ fill: "var(--fg)" }} />
                    <rect
                      x={pillX}
                      y={y - (PILL_H_PX / 2) * u}
                      width={PILL_W_PX * u}
                      height={PILL_H_PX * u}
                      rx={6 * u}
                      style={{ fill: stateFill(st), stroke: selected === uf ? "var(--fg)" : "var(--map-border)" }}
                      strokeWidth={selected === uf ? 2 : 1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={pillX + 8 * u}
                      y={y}
                      dominantBaseline="central"
                      fontSize={11 * u}
                      fontWeight={700}
                      style={{ fill: dark ? "#fff" : "var(--fg)" }}
                    >
                      {uf}
                    </text>
                    <text
                      x={pillX + (PILL_W_PX - 8) * u}
                      y={y}
                      dominantBaseline="central"
                      textAnchor="end"
                      fontSize={11 * u}
                      style={{ fill: dark ? "#fff" : "var(--fg)", opacity: 0.85, fontVariantNumeric: "tabular-nums" }}
                    >
                      {topPct(st) ?? "–"}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        {hover && (
          <Tooltip
            uf={hover.uf}
            st={by.get(hover.uf)}
            labels={labels}
            style={{
              top: hover.y + 16,
              ...(hover.x > size.w - 240 ? { right: size.w - hover.x + 12 } : { left: hover.x + 12 }),
            }}
          />
        )}
        {selected && !hover && (
          <div className="pointer-events-none absolute top-2 left-2 max-w-[240px]">
            <Tooltip uf={selected} st={info} labels={labels} />
          </div>
        )}
        {emptyCta && known.shown < 3 && !selected && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-center">
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-line bg-card/95 p-3 text-center text-sm shadow-lg backdrop-blur">
              <p className="font-semibold">{emptyCta}</p>
              <p className="mt-0.5 text-xs text-subtle">Cada estado aparece quando tem pelo menos 3 pessoas.</p>
              <Link href="/app#estado" className="mt-2 inline-block rounded-full bg-fg px-4 py-1.5 text-bg">
                Escolher meu estado
              </Link>
            </div>
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {onFull && (
            <MapButton label={full ? "Sair da tela cheia" : "Tela cheia"} onClick={onFull}>
              {full ? "✕" : "⛶"}
            </MapButton>
          )}
          {tools}
        </div>
        <div className="absolute bottom-2 left-2 flex flex-col gap-1">
          <MapButton label="Aumentar zoom" onClick={() => pz.zoomAt({ x: pz.cx, y: pz.cy }, 1.6)}>
            +
          </MapButton>
          <MapButton label="Diminuir zoom" onClick={() => pz.zoomAt({ x: pz.cx, y: pz.cy }, 1 / 1.6)}>
            −
          </MapButton>
          {pz.away && (
            <MapButton
              label="Ver o Brasil todo"
              onClick={() => {
                pz.home();
                onSelect?.(null);
              }}
            >
              ⟲
            </MapButton>
          )}
        </div>
      </div>
      <Legend labels={labels} />
    </div>
  );
}

function describe(uf: UF, st: StateCount | undefined, labels: Labels) {
  if (!st) return `${UFS[uf]}: ninguém com estado conhecido`;
  if ("few" in st) return `${UFS[uf]}: poucos dados`;
  return `${UFS[uf]}: ${st.total} pessoas, ${leanText(st, labels)}`;
}

/** "SP / 62%" at the state's anchor, sized in screen pixels whatever the zoom. */
function StateLabel({ uf, st, px, small, room }: { uf: UF; st: StateCount | undefined; px: (n: number) => number; small: boolean; room: number }) {
  const [x, y] = UF_LABEL[uf];
  if (room < 20 && uf !== "DF") return null;
  // The percentage only where the state is wide enough on screen.
  const pct = room >= 48 || uf === "DF" ? topPct(st) : null;
  const dark = strength(st) > 0.45;
  const f1 = px(small ? 10 : 12);
  const f2 = px(small ? 9 : 10.5);
  const style = {
    fill: dark ? "#fff" : "var(--fg)",
    stroke: dark ? "rgba(0,0,0,.25)" : "var(--map-halo)",
    strokeWidth: px(2.5),
    paintOrder: "stroke",
    opacity: st ? 1 : 0.55,
  } as React.CSSProperties;
  // DF is tiny: its label sits beside it, on one line.
  if (uf === "DF")
    return (
      <text x={x + px(5)} y={y} dominantBaseline="central" fontSize={f2} fontWeight={700} style={style}>
        {pct ? `DF ${pct}` : "DF"}
      </text>
    );
  return (
    <text x={x} y={y} textAnchor="middle" style={style}>
      <tspan x={x} dy={pct ? -f1 * 0.15 : f1 * 0.35} fontSize={f1} fontWeight={700}>
        {uf}
      </tspan>
      {pct && (
        <tspan x={x} dy={f2 * 1.15} fontSize={f2} style={{ fontVariantNumeric: "tabular-nums" }}>
          {pct}
        </tspan>
      )}
    </text>
  );
}

/** A state's numbers: people, each side, the split bar. */
export function Tooltip({ uf, st, labels, style }: { uf: UF; st: StateCount | undefined; labels: Labels; style?: React.CSSProperties }) {
  return (
    <div className="pointer-events-none absolute z-10 w-56 rounded-xl border border-line bg-card p-3 text-sm shadow-lg" style={style}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{UFS[uf]}</span>
        <span className="text-xs text-subtle">{regionOf(uf)}</span>
      </div>
      {!st ? (
        <p className="mt-1 text-xs text-subtle">Ninguém com estado conhecido aqui ainda.</p>
      ) : "few" in st ? (
        <p className="mt-1 text-xs text-subtle">Poucos dados: menos de 3 pessoas, então não mostramos números.</p>
      ) : (
        <StateNumbers st={st} labels={labels} />
      )}
    </div>
  );
}

export function StateNumbers({ st, labels }: { st: Extract<StateCount, { total: number }>; labels: Labels }) {
  const voters = st.red + st.green;
  const r = voters ? Math.round((st.red / voters) * 100) : 0;
  return (
    <>
      <div className="mt-1 text-xs text-subtle">
        {st.total} {st.total === 1 ? "pessoa" : "pessoas"} com estado conhecido
      </div>
      {voters > 0 && (
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <span style={{ width: `${r}%`, background: "var(--red)" }} />
          <span style={{ width: `${100 - r}%`, background: "var(--green)" }} />
        </div>
      )}
      <div className="mt-1.5 flex justify-between text-xs tabular-nums">
        <span style={{ color: "var(--red)" }}>
          {labels.red} {st.red}
          {voters ? ` · ${r}%` : ""}
        </span>
        <span style={{ color: "var(--green)" }}>
          {voters ? `${100 - r}% · ` : ""}
          {st.green} {labels.green}
        </span>
      </div>
      {st.none > 0 && <div className="mt-0.5 text-xs text-subtle">{st.none} ainda sem lado</div>}
    </>
  );
}

function Legend({ labels }: { labels: Labels }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-subtle">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span>{labels.red}</span>
          <span
            className="inline-block h-2 w-24 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--red), color-mix(in oklab, var(--red) 30%, var(--map-empty)) 48%, color-mix(in oklab, var(--green) 30%, var(--map-empty)) 52%, var(--green))" }}
          />
          <span>{labels.green}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: "repeating-linear-gradient(45deg, var(--map-hatch) 0 2px, var(--map-empty) 2px 5px)" }}
          />
          poucos dados (menos de 3)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line" style={{ background: "var(--map-empty)" }} />
          ninguém ainda
        </span>
      </div>
      <span>Fonte dos limites: IBGE</span>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-card/90 text-base leading-none shadow-sm backdrop-blur hover:bg-muted"
    >
      {children}
    </button>
  );
}

/** The map of one bubble (uid) or of everyone (null), fetched when shown. */
export function BubbleStates({ uid, labels, full }: { uid: string | null; labels: Labels; full: boolean }) {
  const key = uid ?? "";
  const [data, setData] = useState<{ key: string; states: StateCount[] | null } | null>(null);
  const [picked, setPicked] = useState<UF | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/bubble-states${uid ? `?u=${encodeURIComponent(uid)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((states: StateCount[]) => live && setData({ key, states }))
      .catch(() => live && setData({ key, states: null }));
    return () => {
      live = false;
    };
  }, [uid, key]);
  if (!data || data.key !== key) return <div className="shimmer mx-auto aspect-square w-full max-w-[560px] rounded-xl" />;
  if (!data.states) return <p className="py-10 text-center text-sm text-subtle">Não deu para carregar os estados agora.</p>;
  const sum = sumStates(data.states);
  return (
    <div className={`flex flex-col ${full ? "min-h-0 flex-1" : ""}`}>
      <p className="mb-2 text-sm text-subtle">
        {sum.total
          ? `${sum.total} ${sum.total === 1 ? "pessoa" : "pessoas"} ${uid ? "desta bolha" : "no app"} em ${sum.shown} ${sum.shown === 1 ? "estado" : "estados"} com 3 ou mais. Toque num estado para ver os números.`
          : uid
            ? "Ainda há poucos estados conhecidos nesta bolha."
            : "Ainda há poucos estados conhecidos."}
      </p>
      <div className={full ? "flex min-h-0 flex-1 flex-col" : "mx-auto w-full max-w-[640px]"}>
        <BrazilMap
          states={data.states}
          labels={labels}
          selected={picked}
          onSelect={setPicked}
          fill={full}
          full={full}
          emptyCta={uid ? "Ainda há poucos estados conhecidos nesta bolha" : "Ainda há poucos estados conhecidos — escolha o seu"}
          ariaLabel={uid ? "Estados desta bolha" : "Estados de todo mundo"}
        />
      </div>
      <p className="mt-2 text-xs text-subtle">
        O estado vem da localização do perfil no X ou de quem escolheu o seu. Só mostramos totais por estado, com pelo menos 3 pessoas, nunca o estado de alguém.
      </p>
    </div>
  );
}
