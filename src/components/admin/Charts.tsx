"use client";

import { useState } from "react";

// Small SVG charts for the admin screens: thin marks, recessive axes, a legend, and a hover tooltip.

export type Series = { key: string; label: string; color: string };
type Row = { day: string } & Record<string, number | string>;

const W = 640;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-3 text-xs text-subtle">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Per-day bars (stacked when several series) or lines, with a column hover tooltip. */
export function DayChart({
  data,
  series,
  kind = "bar",
  height = 180,
}: {
  data: Row[];
  series: Series[];
  kind?: "bar" | "line";
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const val = (r: Row, k: string) => Number(r[k] ?? 0);
  const max = niceMax(
    Math.max(1, ...data.map((r) => (kind === "bar" ? series.reduce((s, x) => s + val(r, x.key), 0) : Math.max(...series.map((x) => val(r, x.key)))))),
  );
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const step = iw / Math.max(1, data.length);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const cx = (i: number) => PAD.l + step * i + step / 2;
  const bw = Math.max(2, step - 2);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((x - PAD.l) / step);
    setHover(i >= 0 && i < data.length ? i : null);
  };

  const h = hover != null ? data[hover] : null;
  return (
    <div className="grid gap-2">
      <Legend series={series} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="block h-auto w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize={10} fill="var(--subtle)">
                {Math.round(max * f).toLocaleString("pt-BR")}
              </text>
            </g>
          ))}
          {data.length > 0 &&
            [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
              <text key={i} x={cx(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--subtle)">
                {fmtDay(data[i].day)}
              </text>
            ))}
          {hover != null && (
            <rect x={PAD.l + step * hover} y={PAD.t} width={step} height={ih} fill="var(--muted)" opacity={0.7} />
          )}
          {kind === "bar"
            ? data.map((r, i) => {
                let acc = 0;
                return series.map((s) => {
                  const v = val(r, s.key);
                  if (!v) return null;
                  const top = y(acc + v);
                  const hgt = y(acc) - top;
                  acc += v;
                  return (
                    <rect
                      key={s.key + i}
                      x={cx(i) - bw / 2}
                      y={top + 1}
                      width={bw}
                      height={Math.max(1, hgt - 1)}
                      rx={Math.min(2, bw / 2)}
                      fill={s.color}
                    />
                  );
                });
              })
            : series.map((s) => (
                <g key={s.key}>
                  <polyline
                    points={data.map((r, i) => `${cx(i)},${y(val(r, s.key))}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {hover != null && (
                    <circle cx={cx(hover)} cy={y(val(data[hover], s.key))} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                  )}
                </g>
              ))}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${(cx(hover!) / W) * 100}%`,
              transform: `translateX(${hover! > data.length / 2 ? "-105%" : "5%"})`,
            }}
          >
            <div className="font-semibold">{fmtDay(h.day)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                <span className="text-subtle">{s.label}</span>
                <b className="ml-auto pl-2">{val(h, s.key).toLocaleString("pt-BR")}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type Dot = { id: string; x: number; y: number; r?: number; color: string; label: string; detail?: string; href?: string };

/** Scatter with labelled axes; x and y are already in 0..1. Hovering a dot shows who it is. */
export function Scatter({
  dots,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  height = 360,
}: {
  dots: Dot[];
  xLabel: string;
  yLabel: string;
  xTicks: { at: number; label: string }[];
  yTicks: { at: number; label: string }[];
  height?: number;
}) {
  const [hover, setHover] = useState<Dot | null>(null);
  const pad = { l: 44, r: 12, t: 12, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const px = (x: number) => pad.l + x * iw;
  const py = (y: number) => pad.t + (1 - y) * ih;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" onPointerLeave={() => setHover(null)}>
        {yTicks.map((t) => (
          <g key={t.at}>
            <line x1={pad.l} x2={W - pad.r} y1={py(t.at)} y2={py(t.at)} stroke="var(--line)" />
            <text x={pad.l - 6} y={py(t.at) + 4} textAnchor="end" fontSize={10} fill="var(--subtle)">
              {t.label}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t.at}>
            <line x1={px(t.at)} x2={px(t.at)} y1={pad.t} y2={pad.t + ih} stroke="var(--line)" />
            <text x={px(t.at)} y={pad.t + ih + 14} textAnchor="middle" fontSize={10} fill="var(--subtle)">
              {t.label}
            </text>
          </g>
        ))}
        <text x={pad.l + iw / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--subtle)">
          {xLabel}
        </text>
        <text x={12} y={pad.t + ih / 2} textAnchor="middle" fontSize={11} fill="var(--subtle)" transform={`rotate(-90 12 ${pad.t + ih / 2})`}>
          {yLabel}
        </text>
        {dots.map((d) => (
          <a key={d.id} href={d.href}>
            <circle
              cx={px(d.x)}
              cy={py(d.y)}
              r={d.r ?? 5}
              fill={d.color}
              fillOpacity={hover && hover.id !== d.id ? 0.35 : 0.85}
              stroke="var(--card)"
              strokeWidth={1.5}
              onPointerEnter={() => setHover(d)}
            />
          </a>
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(px(hover.x) / W) * 100}%`, top: `${(py(hover.y) / height) * 100}%`, transform: `translate(${hover.x > 0.6 ? "-110%" : "10%"}, -50%)` }}
        >
          <div className="font-semibold">{hover.label}</div>
          {hover.detail && <div className="text-subtle">{hover.detail}</div>}
        </div>
      )}
    </div>
  );
}
