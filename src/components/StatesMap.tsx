"use client";

import { useEffect, useState } from "react";
import type { StateCount } from "@/lib/places";
import { SIDE } from "@/lib/links";
import { TILE_COLS, TILE_ROWS, UFS, UF_TILES, type UF } from "@/lib/uf";

// Brazil as a tile grid (one square per state, roughly where it is), each colored by the Red × Green
// split of the people with a known state. Aggregates only: under 3 people a tile says "poucos dados".

type Labels = { red: string; green: string };

/** Tile fill: toward red or green by the split, faint near 50/50; gray when nobody there picked a side. */
function fill(s: StateCount) {
  if ("few" in s) return "var(--muted)";
  const voters = s.red + s.green;
  if (!voters) return "var(--none)";
  const share = s.red / voters;
  const t = Math.abs(share - 0.5) * 2; // 0 = tie, 1 = all one side
  const pct = Math.round(40 + t * 60);
  return `color-mix(in oklab, ${share >= 0.5 ? "var(--red)" : "var(--green)"} ${pct}%, var(--muted))`;
}

function lead(s: StateCount, labels: Labels) {
  if ("few" in s) return "poucos dados";
  const voters = s.red + s.green;
  if (!voters) return "sem lado";
  const red = Math.round((s.red / voters) * 100);
  if (red === 50) return "empate";
  return red > 50 ? `${red}% ${short(labels.red)}` : `${100 - red}% ${short(labels.green)}`;
}

const short = (label: string) => (label.length > 6 ? `${label.slice(0, 4)}.` : label);

export function StatesGrid({
  states,
  labels = SIDE,
  full = false,
  everyone = false,
}: {
  states: StateCount[];
  labels?: Labels;
  /** Fullscreen: as big as the screen's height allows. */
  full?: boolean;
  /** Everyone's states (not one bubble's), for the wording. */
  everyone?: boolean;
}) {
  const by = new Map(states.map((s) => [s.uf, s]));
  const [picked, setPicked] = useState<UF | null>(null);
  const [hovered, setHovered] = useState<UF | null>(null);
  const shown = hovered ?? picked;
  const known = states.reduce((sum, s) => sum + ("total" in s ? s.total : 0), 0);
  const counted = states.filter((s) => "total" in s).length;
  const s = shown ? by.get(shown) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
        <Swatch c="var(--red)" label={`Mais ${labels.red}`} />
        <Swatch c="color-mix(in oklab, var(--red) 40%, var(--muted))" label="Dividido" />
        <Swatch c="var(--green)" label={`Mais ${labels.green}`} />
        <Swatch c="var(--muted)" label="Poucos dados (menos de 3)" dashed />
      </div>
      <div
        className={`relative mx-auto grid w-full gap-1 ${full ? "min-h-0 flex-1" : "max-w-[460px]"}`}
        style={{
          gridTemplateColumns: `repeat(${TILE_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${TILE_ROWS}, minmax(0, 1fr))`,
          aspectRatio: `${TILE_COLS} / ${TILE_ROWS}`,
          ...(full ? { maxWidth: `calc((100dvh - 260px) * ${TILE_COLS / TILE_ROWS})` } : {}),
        }}
        role="group"
        aria-label={everyone ? "Estados de todo mundo" : "Estados desta bolha"}
      >
        {(Object.keys(UF_TILES) as UF[]).map((uf) => {
          const [col, row] = UF_TILES[uf];
          const st = by.get(uf);
          const dark = st && "total" in st && st.red + st.green > 0 && Math.abs(st.red / (st.red + st.green) - 0.5) > 0.2;
          return (
            <button
              key={uf}
              type="button"
              onClick={() => setPicked((p) => (p === uf ? null : uf))}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(uf)}
              onPointerLeave={() => setHovered(null)}
              aria-label={`${UFS[uf]}: ${st ? ("few" in st ? "poucos dados" : `${st.total} pessoas, ${lead(st, labels)}`) : "ninguém com estado conhecido"}`}
              aria-pressed={picked === uf}
              className={`flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-md text-center leading-tight transition-transform ${
                shown === uf ? "z-10 scale-110 shadow-lg ring-2 ring-[var(--fg)]" : ""
              } ${st ? "" : "opacity-50"} ${st && "few" in st ? "border border-dashed border-[var(--subtle)]" : ""}`}
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                background: st ? fill(st) : "var(--muted)",
                color: dark ? "#fff" : "var(--fg)",
              }}
            >
              <span className="text-[clamp(10px,2.6vw,15px)] font-bold">{uf}</span>
              {st && "total" in st && <span className="text-[clamp(8px,1.9vw,11px)] opacity-90">{st.total}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-[3.5rem] rounded-xl bg-muted p-3 text-sm" aria-live="polite">
        {shown ? (
          <>
            <div className="font-semibold">{UFS[shown]}</div>
            <div className="text-subtle">
              {!s
                ? "Ninguém com estado conhecido aqui ainda."
                : "few" in s
                  ? "Menos de 3 pessoas com estado conhecido: poucos dados para mostrar."
                  : [
                      `${s.total} ${s.total === 1 ? "pessoa" : "pessoas"}`,
                      `${labels.red} ${s.red}`,
                      `${labels.green} ${s.green}`,
                      s.none ? `sem lado ${s.none}` : null,
                      s.red + s.green ? lead(s, labels) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
            </div>
          </>
        ) : (
          <div className="text-subtle">
            {known
              ? `${known} ${known === 1 ? "pessoa" : "pessoas"} ${everyone ? "no app" : "desta bolha"} com estado conhecido, em ${counted} ${counted === 1 ? "estado" : "estados"}. Toque num estado para ver os números.`
              : everyone
                ? "Ainda há poucos estados conhecidos."
                : "Ainda há poucos estados conhecidos nesta bolha."}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-subtle">
        O estado vem da localização do perfil no X ou de quem escolheu o seu. Só mostramos totais por estado, com pelo
        menos 3 pessoas, nunca o estado de alguém.
      </p>
    </div>
  );
}

function Swatch({ c, label, dashed = false }: { c: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block h-3 w-3 rounded-sm ${dashed ? "border border-dashed border-[var(--subtle)]" : ""}`}
        style={{ background: c }}
      />
      {label}
    </span>
  );
}

/** The cartogram of one bubble (uid) or of everyone (null), fetched when shown. */
export function BubbleStates({ uid, labels, full }: { uid: string | null; labels: Labels; full: boolean }) {
  const key = uid ?? "";
  const [data, setData] = useState<{ key: string; states: StateCount[] | null } | null>(null);
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
  if (!data || data.key !== key) return <div className="shimmer mx-auto aspect-[7/8] w-full max-w-[460px] rounded-xl" />;
  if (!data.states) return <p className="py-10 text-center text-sm text-subtle">Não deu para carregar os estados agora.</p>;
  return <StatesGrid states={data.states} labels={labels} full={full} everyone={!uid} />;
}
